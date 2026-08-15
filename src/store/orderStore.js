import { create } from "zustand";
import { OrderService } from "../services";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";

/**
 * Whether an order's money is real, and therefore whether the kitchen may cook it.
 *
 * Payment method is the honest test, not a status string:
 *   COD / CASH → nothing to collect up front
 *   WALLET     → debited inside the same transaction that created the order
 *   otherwise  → only once the signature-verified webhook says "Paid"
 */
export const isSettledOrder = (o) => {
  const method = String(o?.paymentMethod || "").toUpperCase();
  if (method === "COD" || method === "CASH" || method === "WALLET") return true;
  return String(o?.paymentStatus || "").toLowerCase() === "paid";
};

export const useOrderStore = create((set, get) => ({
  /** Settled orders — COD, wallet, or a verified online payment. */
  orders: [],
  /** Online orders whose payment has not been confirmed. Never cooked. */
  awaitingPayment: [],
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

    const formatAddress = (addr) => {
      if (!addr) return "N/A";
      if (typeof addr === "string") return addr;
      const parts = [
        addr.flatNo,
        addr.area,
        addr.landmark,
        addr.city,
        addr.pinCode
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : "N/A";
    };

    const parseDate = (val) => {
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

    const unsubscribe = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)),
      (snapshot) => {
        const orders = [];
        snapshot.forEach((doc) => {
          const o = doc.data();
          if (o.isDeleted !== true) {
            orders.push({
              id: doc.id,
              ...o,
              customer: o.customerName || o.customer || "Walk-in Customer",
              phone: o.customerPhone || o.phone || "N/A",
              time: o.time || "Just now",
              timestamp: o.timestamp || (o.createdAt ? parseDate(o.createdAt).toLocaleString() : ""),
              itemsText: o.itemsText || (o.items ? o.items.map(i => `${i.quantity ?? i.qty ?? 1}x ${i.name}`).join(", ") : ""),
              items: o.items || [],
              subtotal: Number(o.subtotal || 0),
              tax: Number(o.tax || 0),
              deliveryFee: Number(o.deliveryFee || o.deliveryCharge || 0),
              total: Number(o.total || o.totalAmount || 0),
              status: o.status || "Pending",
              rider: o.rider || (o.assignedPartnerName ? `${o.assignedPartnerName}` : "Assigning..."),
              address: formatAddress(o.deliveryAddress || o.address),
              city: o.city || "Bengaluru",
              note: o.note || ""
            });
          }
        });

        // Sort by createdAt descending
        orders.sort((a, b) => {
          const dateA = parseDate(a.createdAt || a.timestamp);
          const dateB = parseDate(b.createdAt || b.timestamp);
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
          awaitingPayment: orders.filter((o) => !isSettledOrder(o)),
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
