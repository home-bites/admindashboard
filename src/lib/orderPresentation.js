/**
 * The dashboard's single presentation vocabulary for orders.
 *
 * ── The problem this replaces ────────────────────────────────────────────
 *
 * The Orders page carried two rows of status controls. The first was the
 * six-stage kitchen flow — New Orders, Preparing, Ready for Pickup, Out for
 * Delivery, Completed, Cancelled. The second was a payment/exception row —
 * All, Delivered, Cancelled, Awaiting Payment, Payment Failed, Refund
 * Required.
 *
 * Between them the operator was shown eleven controls containing three
 * genuine duplications:
 *
 *   Completed  and  Delivered   — the same orders, two names, two chips
 *   Cancelled  and  Cancelled   — literally twice, in two different rows
 *   the flow row and the exception row both claimed to be "the" status filter
 *
 * They also mixed two different kinds of thing. A stage is where the food is;
 * "Awaiting Payment", "Payment Failed" and "Refund Required" are where the
 * money is. An order can be Cancelled *and* Refund Required simultaneously,
 * so the moment both are tabs in one exclusive selector the model is broken —
 * picking one hides the other.
 *
 * This module fixes the model rather than the styling:
 *
 *   - **One** status axis (`STATUS_TABS`), derived from `lib/orderStages.js`,
 *     which stays the authority on what the stored strings mean.
 *   - **One** payment axis (`PAYMENT_FILTERS`), applied as a filter, so an
 *     order can be Cancelled and awaiting refund at the same time and appear
 *     correctly under both.
 *   - One badge palette with fixed semantics, so colour means the same thing
 *     on every screen.
 *
 * No stored value changes. `stageOf` still normalises the legacy spellings —
 * "Delivered"/"Completed", "Cancelled"/"Canceled"/"Rejected",
 * "OutForDelivery" without spaces — and this module only decides how the
 * result is named and coloured in the UI.
 */

import { STAGE, stageOf } from "./orderStages";
import { isDeadOrder, isSettledOrder, isPaymentFailedOrder, needsRefund } from "../store/orderStore";

/* ══════════════════════════════════════════════════════════════════════════
 * Status — the one and only status axis
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * The seven tabs. `id: null` is "All".
 *
 * "Ready for Pickup" is shortened to "Ready" and "Completed" is presented as
 * "Delivered": one word each, and the word the operations team actually says.
 * The stage ids underneath are unchanged.
 */
export const STATUS_TABS = [
  { id: null, label: "All", icon: "inbox" },
  { id: STAGE.ORDERS, label: "New", icon: "fiber_new" },
  { id: STAGE.PREPARING, label: "Preparing", icon: "skillet" },
  { id: STAGE.READY, label: "Ready", icon: "room_service" },
  { id: STAGE.OUT_FOR_DELIVERY, label: "Out for Delivery", icon: "two_wheeler" },
  { id: STAGE.COMPLETED, label: "Delivered", icon: "check_circle" },
  { id: STAGE.CANCELLED, label: "Cancelled", icon: "cancel" },
];

/** Display name for a stage, for use outside the tab strip. */
export const STAGE_LABEL = {
  [STAGE.ORDERS]: "New",
  [STAGE.PREPARING]: "Preparing",
  [STAGE.READY]: "Ready",
  [STAGE.OUT_FOR_DELIVERY]: "Out for Delivery",
  [STAGE.COMPLETED]: "Delivered",
  [STAGE.CANCELLED]: "Cancelled",
};

export const labelForOrder = (order) => STAGE_LABEL[stageOf(order)] || "New";

/* ══════════════════════════════════════════════════════════════════════════
 * Payment — a filter, never a status tab
 * ══════════════════════════════════════════════════════════════════════════ */

export const PAYMENT = {
  PAID: "paid",
  PENDING: "pending",
  FAILED: "failed",
  REFUND_REQUIRED: "refund_required",
  REFUNDED: "refunded",
};

export const PAYMENT_FILTERS = [
  { id: null, label: "All payments" },
  { id: PAYMENT.PAID, label: "Paid" },
  { id: PAYMENT.PENDING, label: "Pending" },
  { id: PAYMENT.FAILED, label: "Failed" },
  { id: PAYMENT.REFUND_REQUIRED, label: "Refund required" },
  { id: PAYMENT.REFUNDED, label: "Refunded" },
];

export const PAYMENT_LABEL = {
  [PAYMENT.PAID]: "Paid",
  [PAYMENT.PENDING]: "Payment pending",
  [PAYMENT.FAILED]: "Payment failed",
  [PAYMENT.REFUND_REQUIRED]: "Refund required",
  [PAYMENT.REFUNDED]: "Refunded",
};

/**
 * Where the money is on this order.
 *
 * Uses exactly the predicates the order store already exports, so a filter
 * here and a store-side queue can never disagree about the same order — which
 * is what happened when the page kept its own parallel definitions in the
 * "Awaiting Payment" / "Payment Failed" / "Refund Required" tabs.
 *
 * Order matters. Refund outranks everything: money captured against an order
 * nobody will deliver is the state that needs a human, so it must not be
 * masked by the order also being cancelled.
 */
export function paymentStateOf(order) {
  if (!order) return PAYMENT.PENDING;
  if (String(order.paymentStatus || "").toLowerCase() === "refunded") return PAYMENT.REFUNDED;
  if (needsRefund(order)) return PAYMENT.REFUND_REQUIRED;
  if (isPaymentFailedOrder(order)) return PAYMENT.FAILED;
  if (isSettledOrder(order)) return PAYMENT.PAID;
  return PAYMENT.PENDING;
}

/**
 * True when an order still needs someone to chase the money.
 *
 * A cancelled unpaid order never will — it is abandoned, not outstanding —
 * so it is excluded, which is what stops the chase queue filling with rows
 * nobody can action.
 */
export const isOutstanding = (order) =>
  paymentStateOf(order) === PAYMENT.PENDING && !isDeadOrder(order);

/* ══════════════════════════════════════════════════════════════════════════
 * Order type
 * ══════════════════════════════════════════════════════════════════════════ */

export const ORDER_TYPE_FILTERS = [
  { id: null, label: "All types" },
  { id: "delivery", label: "Delivery" },
  { id: "pickup", label: "Pickup" },
  { id: "scheduled", label: "Scheduled" },
];

export function orderTypeOf(order) {
  if (order?.scheduledFor || order?.scheduledAt) return "scheduled";
  const line = order?.address || order?.deliveryAddress?.addressLine || "";
  return line === "Counter Pickup" ? "pickup" : "delivery";
}

export const ORDER_TYPE_LABEL = {
  delivery: "Delivery",
  pickup: "Pickup",
  scheduled: "Scheduled",
};

/* ══════════════════════════════════════════════════════════════════════════
 * Date ranges
 * ══════════════════════════════════════════════════════════════════════════ */

export const DATE_FILTERS = [
  { id: null, label: "Any date" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom…" },
];

/* ══════════════════════════════════════════════════════════════════════════
 * Badges — four meanings, and only four
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Semantic tones. The brief is explicit and this is the whole palette:
 *
 *   positive  green    healthy, completed
 *   attention amber    in progress, needs watching
 *   critical  rose     failed, cancelled, money at risk
 *   neutral   slate    informational
 *
 * Everything that renders a status pill goes through here, so a colour cannot
 * come to mean two different things on two different screens.
 */
export const TONE = {
  positive: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  attention: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  critical: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/15",
};

/** Solid variants, for the one active element in a group. */
export const TONE_SOLID = {
  positive: "bg-emerald-600 text-white",
  attention: "bg-amber-500 text-white",
  critical: "bg-rose-600 text-white",
  neutral: "bg-slate-700 text-white",
};

/**
 * Why the server flagged this order for a human to look at.
 *
 * `onOrderCreatedVerifyTotals` re-prices every order from `menuItems` and
 * `appSettings/general` and records what it found. Until now none of it
 * surfaced anywhere: an order could be marked `needsReview` because its
 * delivery charge or an add-on price did not match the catalogue, and the
 * queue looked exactly like any other order.
 *
 * That is the failure worth avoiding — not a missing feature but a signal
 * written, stored, and never read. The order stays in the queue and is never
 * cancelled for a verification problem; it just carries a visible mark now.
 *
 * Returns [] for a clean order, so callers can render nothing.
 */
export function reviewFlagsOf(order) {
  const o = order || {};
  const flags = [];

  if (o.totalsVerified === false) {
    flags.push(o.totalsNote || "Order total could not be verified");
  }
  if (typeof o.totalsMismatch === "number" && o.totalsMismatch > 0) {
    flags.push(`Charged \u20b9${o.totalsMismatch.toFixed(2)} less than the menu price`);
  }
  if (o.addonsVerified === false) {
    flags.push(o.addonNote || "An add-on could not be verified");
  }
  if (typeof o.addonPriceMismatch === "number" && o.addonPriceMismatch !== 0) {
    const g = o.addonPriceMismatch;
    flags.push(g > 0
      ? `Add-ons charged \u20b9${g.toFixed(2)} more than the menu`
      : `Add-ons charged \u20b9${Math.abs(g).toFixed(2)} less than the menu`);
  }
  if (typeof o.deliveryChargeMismatch === "number" && o.deliveryChargeMismatch !== 0) {
    const g = o.deliveryChargeMismatch;
    flags.push(g > 0
      ? `Delivery charged \u20b9${g.toFixed(2)} less than the distance rule`
      : `Delivery charged \u20b9${Math.abs(g).toFixed(2)} more than the distance rule`);
  }
  // Not a discrepancy — the order simply carried no coordinates, so the
  // distance could not be checked. Worth showing, not worth alarming about,
  // and deliberately not part of `needsReview`.
  if (o.deliveryChargeVerified === false && !o.deliveryChargeMismatch) {
    flags.push(o.deliveryChargeNote
      ? `Delivery charge unverified — ${o.deliveryChargeNote}`
      : "Delivery charge could not be verified");
  }

  // `needsReview` is the server's own summary. If it is set and nothing above
  // explained why, say so rather than showing a badge with no reason.
  if (o.needsReview === true && flags.length === 0) {
    flags.push("Flagged for review by the server");
  }
  return flags;
}

export function toneForStage(stage) {
  switch (stage) {
    case STAGE.COMPLETED: return "positive";
    case STAGE.CANCELLED: return "critical";
    case STAGE.ORDERS:
    case STAGE.PREPARING:
    case STAGE.READY: return "attention";
    case STAGE.OUT_FOR_DELIVERY: return "neutral";
    default: return "neutral";
  }
}

export function toneForPayment(state) {
  switch (state) {
    case PAYMENT.PAID: return "positive";
    case PAYMENT.PENDING: return "attention";
    case PAYMENT.FAILED:
    case PAYMENT.REFUND_REQUIRED: return "critical";
    default: return "neutral";
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * Missing values
 * ══════════════════════════════════════════════════════════════════════════ */

/** Never a plausible-looking default. A gap is shown as a gap. */
export const DASH = "—";

export const orNothing = (v) => {
  if (v === 0) return "0";
  const s = typeof v === "string" ? v.trim() : v;
  if (!s) return DASH;
  // The order normaliser writes these when a field is genuinely absent;
  // rendering the sentinel text verbatim would present it as a customer name.
  if (s === "Not available" || s === "Not assigned") return DASH;
  return s;
};

export const money = (v) =>
  Number.isFinite(Number(v)) ? `₹${Number(v).toFixed(2)}` : DASH;
