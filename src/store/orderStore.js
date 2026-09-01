import { create } from "zustand";
import { OrderService } from "../services";
import { collection, onSnapshot, query, limit } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";

/**
 * Whether an order's money is real, and therefore whether the kitchen may cook it.
 *
 * Payment method is the honest test, not a status string:
 *   COD / CASH → nothing to collect up front
 *   WALLET     → debited inside the same transaction that created the order
 *   otherwise  → only once the signature-verified webhook says "Paid"
 */
/**
 * An order nobody will ever collect money for.
 *
 * Kept separate from isSettledOrder deliberately: a cancelled order is not
 * settled, it is abandoned. Conflating the two would have marked it paid.
 */
export const isDeadOrder = (o) => {
  const s = String(o?.status || "").toLowerCase().replace(/[\s_]/g, "");
  return s === "cancelled" || s === "canceled" || s === "rejected";
};

export const isSettledOrder = (o) => {
  const method = String(o?.paymentMethod || "").toUpperCase();
  // TODO: WALLET is trusted here on the strength of a client-side debit.
  // The wallet balance is decremented by the customer app inside the same
  // transaction that creates the order, so this dashboard is taking the
  // client's word that the money moved. Nothing server-side re-checks it.
  // Left as-is deliberately — a separate workstream owns moving the wallet
  // debit behind a callable, and changing the test here first would push
  // every legitimate wallet order into the chase queue with no way to clear
  // it. Revisit once that lands.
  if (method === "COD" || method === "CASH" || method === "WALLET") return true;
  return String(o?.paymentStatus || "").toLowerCase() === "paid";
};

/**
 * An order that died because the money never arrived, not because a person
 * changed their mind.
 *
 * `cancelUnpaidPurchase` and `expireUnpaidOrders` stamp `cancelledBy` with a
 * `system:` prefix; a customer or an admin cancelling writes `customer` or
 * `admin`. Without this distinction an operator opening the Cancelled tab sees
 * one undifferentiated wall and cannot tell an abandoned checkout — which is a
 * conversion problem — from a customer who rang up and cancelled, which is not.
 *
 * Matches on prefix rather than an exact list because the payment reasons are
 * already two values (`system:paymentFailed`, `system:paymentTimeout`) and a
 * third would otherwise silently fall out of this bucket.
 */
export const isPaymentFailedOrder = (o) => {
  if (!isDeadOrder(o)) return false;
  const by = String(o?.cancelledBy || "");
  return by.startsWith("system:payment") || by.startsWith("system:expired");
};

/**
 * Money that was captured against an order nobody will ever deliver.
 *
 * Two ways in. `refundRequired` is set by the webhook when a capture lands
 * after cancellation (spec §1.4), and `paymentStatus: 'PaidAfterCancel'` is
 * what that same branch writes instead of reviving the order. Both are tested
 * because an older document, or one written by a partial deploy, may carry the
 * status without the flag.
 *
 * There is no automated refund path. This is a hand-worked queue, so it has to
 * be visible — a captured payment on a cancelled order that nobody surfaces is
 * simply money kept by mistake.
 */
export const needsRefund = (o) =>
  o?.refundRequired === true || o?.paymentStatus === "PaidAfterCancel";

/** One date parser for every shape a timestamp arrives in from this collection. */
export const parseOrderDocDate = (val) => {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }
  if (typeof val === "number") return new Date(val);
  return new Date(0);
};

const formatAddress = (addr) => {
  if (!addr) return "N/A";
  if (typeof addr === "string") return addr;
  const parts = [addr.flatNo, addr.area, addr.landmark, addr.city, addr.pinCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "N/A";
};

/**
 * Raw Firestore order data → the shape every screen in this dashboard reads.
 *
 * One function so the live listener below and any one-off query (the Orders
 * page's date-range history search, which cannot rely on the live listener's
 * 200-document cap — see `subscribeOrders`'s own note) produce identical
 * records instead of two normalisations quietly drifting apart.
 */
export function normaliseOrderDoc(id, o) {
  return {
    id,
    ...o,
    // "Walk-in Customer" is a real, honest default only for a spot order the
    // admin placed at the counter without typing a name (see the spot-order
    // modal's own default) — `placedBy: 'admin'` marks those. Any other order
    // without a name is a genuine data problem, and "Not available" says so
    // instead of quietly relabelling it as a walk-in sale that never happened.
    customer: o.customerName || o.customer
      || (o.placedBy === "admin" ? "Walk-in Customer" : "Not available"),
    phone: o.customerPhone || o.phone || "Not available",
    // No source in this project ever writes a `time` string field — it was
    // silently defaulting every order, of any age, to "Just now". `createdAt`
    // (a real Firestore Timestamp) is the only honest source for when an
    // order was placed; formatOrderTime (in Orders.jsx) renders it, in
    // Asia/Kolkata, wherever a time is shown. Kept only for whatever else
    // still reads it, and no longer fabricates a value.
    time: o.time || null,
    timestamp: o.timestamp || null,
    itemsText: o.itemsText || (o.items ? o.items.map(i => `${i.quantity ?? i.qty ?? 1}x ${i.name}`).join(", ") : ""),
    items: o.items || [],
    subtotal: Number(o.subtotal || 0),
    tax: Number(o.tax || 0),
    deliveryFee: Number(o.deliveryFee || o.deliveryCharge || 0),
    total: Number(o.total || o.totalAmount || o.grandTotal || 0),
    status: o.status || "Pending",
    rider: o.rider || (o.assignedPartnerName ? `${o.assignedPartnerName}` : "Not assigned"),
    address: formatAddress(o.deliveryAddress || o.address),
    // The business operates in Guntur only (see Part 6 of the customer-app
    // audit). "Bengaluru" was never a real fallback — it was a leftover from
    // a template. A missing city is not shown as any city.
    city: o.city || null,
    note: o.note || "",
  };
}

export const useOrderStore = create((set, get) => ({
  /** Settled orders — COD, wallet, or a verified online payment. */
  orders: [],
  /** Online orders whose payment has not been confirmed. Never cooked. */
  awaitingPayment: [],
  /**
   * Cancelled because the payment failed, was dismissed, or timed out.
   * Deliberately its own bucket rather than a badge inside Cancelled: these
   * are abandoned checkouts, and reading them as customer cancellations
   * misdescribes what the business is actually losing.
   */
  paymentFailed: [],
  /** Captured against a cancelled order. Refunded by hand, so it must be seen. */
  refundRequired: [],
  loading: false,
  error: null,
  unsubscribeOrders: null,

  subscribeOrders: () => {
    if (get().unsubscribeOrders) return;

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock || !isFirebaseConfigured) {
      get().fetchOrders();
      return;
    }

    set({ loading: true, error: null });

    // No `orderBy("createdAt")` on the query itself.
    //
    // A Firestore orderBy silently drops every document that lacks the field,
    // and this collection does not write `createdAt` consistently — some orders
    // carry `timestamp`, some a string, some a real Timestamp. With the orderBy
    // in place the listener was returning only the handful of docs that happened
    // to have a `createdAt`, so the Orders and Dashboard pages showed two or
    // three rows and looked "stuck". The sort below already handles every shape.
    //
    // `limit(500)` is a safety ceiling, not a page size. If this kitchen ever
    // exceeds ~500 live+recent orders, switch to a range query on a
    // backfilled/normalised timestamp field rather than raising this blindly.
    const unsubscribe = onSnapshot(
      query(collection(db, "orders"), limit(500)),
      (snapshot) => {
        const orders = [];
        snapshot.forEach((doc) => {
          const o = doc.data();
          if (o.isDeleted !== true) {
            orders.push(normaliseOrderDoc(doc.id, o));
          }
        });

        // Sort by createdAt descending
        orders.sort((a, b) => {
          const dateA = parseOrderDocDate(a.createdAt || a.timestamp);
          const dateB = parseOrderDocDate(b.createdAt || b.timestamp);
          return dateB - dateA;
        });

        // An order reaches the kitchen only once the money is real.
        //
        // This used to filter on `status !== "Payment Pending"`. Nothing writes
        // that status any more — every client creates orders as "Pending" — so
        // the filter matched nothing and unpaid online orders went straight
        // into the kitchen queue. Food was being cooked against payments that
        // had not completed, and might never complete.
        set({
          orders: orders.filter(isSettledOrder),
          // Kept, not discarded. These are real customers who tried to pay —
          // some will have succeeded with the webhook still in flight, others
          // abandoned the sheet. Hiding them entirely meant nobody could tell
          // the difference, or clear the ones that died.
          // Cancelled and rejected orders are excluded. They are unpaid and
          // always will be, so without this test they sat in the chase queue
          // permanently with nothing anyone could do about them — which is
          // how a queue meant to be actioned becomes one people stop reading.
          awaitingPayment: orders.filter(
            (o) => !isSettledOrder(o) && !isDeadOrder(o),
          ),
          // Both of these are drawn from the whole snapshot, not from the two
          // lists above, and that is the point. A payment-failed order is
          // cancelled, so it is excluded from awaitingPayment; a
          // PaidAfterCancel order is cancelled and unpaid, so it is in neither
          // list. Deriving them from `orders` or `awaitingPayment` would have
          // produced two permanently empty queues.
          paymentFailed: orders.filter(isPaymentFailedOrder),
          refundRequired: orders.filter(needsRefund),
          loading: false,
        });
      },
      (err) => {
        set({ error: err.message, loading: false });
      }
    );

    set({ unsubscribeOrders: unsubscribe });
  },

  disconnectOrders: () => {
    const unsub = get().unsubscribeOrders;
    if (unsub) {
      unsub();
      set({ unsubscribeOrders: null });
    }
  },

  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await OrderService.getOrders();
      set({
        orders: orders.filter(isSettledOrder),
        awaitingPayment: orders.filter((o) => !isSettledOrder(o)),
        paymentFailed: orders.filter(isPaymentFailedOrder),
        refundRequired: orders.filter(needsRefund),
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  addOrder: async (orderData, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.createOrder(orderData, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  /**
   * Mark one or many orders as paid (or undo it).
   *
   * Sequential rather than Promise.all: a partial failure must be reportable
   * per order, and marking money received is not something to fire in parallel
   * and hope about. Returns the ids that failed so the caller can say which.
   */
  setPaymentReceived: async (ids, received, actor) => {
    set({ loading: true, error: null });
    const failed = [];
    for (const id of ids) {
      try {
        await OrderService.setOrderPaymentReceived(id, received, actor);
      } catch (err) {
        console.error("[payment] failed for", id, err);
        failed.push(id);
      }
    }
    set({ loading: false });
    return failed;
  },

  updateOrderStatus: async (id, status, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.updateOrderStatus(id, status, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  assignDeliveryPartner: async (id, partnerId, partnerName, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.assignDeliveryPartner(id, partnerId, partnerName, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  unassignDeliveryPartner: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await OrderService.unassignDeliveryPartner(id, actor);
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useOrderStore;
