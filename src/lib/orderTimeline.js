/**
 * The life of one order, built only from what the document actually records.
 *
 * ── The rule this module exists to enforce ───────────────────────────────
 *
 * A timeline is the most tempting place in a dashboard to invent data. The
 * shape is known in advance — placed, paid, accepted, preparing, ready,
 * assigned, out for delivery, delivered — so it is easy to render all eight
 * steps and fill the gaps with the order's `createdAt`, or with `Date.now()`,
 * and produce something that looks complete and authoritative.
 *
 * It would also be evidence. Operators read a timeline to answer "when did
 * this order actually go out", and that answer gets quoted to customers, used
 * to judge a rider, and used to settle a refund dispute. A fabricated
 * timestamp there is worse than a missing one.
 *
 * So a step appears only when the order carries a timestamp for it. Steps the
 * document knows happened but cannot date are shown as reached-but-undated,
 * which is honest and still useful — the sequence is real, only the clock is
 * missing. Nothing is inferred from the current time.
 */

import { STAGE, stageOf } from "./orderStages";
import { paymentStateOf, PAYMENT } from "./orderPresentation";

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isFinite(val.getTime()) ? val : null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** First of several field spellings that yields a real date. */
function firstDate(order, keys) {
  for (const k of keys) {
    const d = toDate(order?.[k]);
    if (d) return d;
  }
  return null;
}

/** How far through the flow this order has actually got. */
const STAGE_RANK = {
  [STAGE.ORDERS]: 0,
  [STAGE.PREPARING]: 1,
  [STAGE.READY]: 2,
  [STAGE.OUT_FOR_DELIVERY]: 3,
  [STAGE.COMPLETED]: 4,
};

/**
 * @returns {{key: string, label: string, at: Date|null, actor: string|null,
 *            detail: string|null, tone: 'done'|'current'|'critical'}[]}
 */
export function buildTimeline(order) {
  if (!order) return [];

  const stage = stageOf(order);
  const rank = STAGE_RANK[stage] ?? 0;
  const cancelled = stage === STAGE.CANCELLED;
  const payment = paymentStateOf(order);
  const steps = [];

  const push = (key, label, at, { actor = null, detail = null, tone = "done" } = {}) =>
    steps.push({ key, label, at, actor, detail, tone });

  /* Placed — the one step every order has by definition. */
  push("placed", "Order placed", firstDate(order, ["createdAt", "placedAt", "orderedAt"]), {
    actor: order.placedBy === "admin" ? "Counter (admin)" : "Customer",
  });

  /* Payment. Shown for what actually happened, including the failures — an
     order that died because the money never arrived should say so here rather
     than simply appearing as "Cancelled" with no explanation. */
  if (payment === PAYMENT.PAID) {
    push("paid", "Payment received", firstDate(order, ["paidAt", "paymentAt", "paymentCapturedAt"]), {
      detail: order.paymentMethod || null,
    });
  } else if (payment === PAYMENT.FAILED) {
    push("payment_failed", "Payment failed", firstDate(order, ["cancelledAt", "paymentFailedAt"]), {
      detail: order.cancelledBy || null,
      tone: "critical",
    });
  } else if (payment === PAYMENT.REFUND_REQUIRED) {
    push("refund_required", "Refund required", firstDate(order, ["paidAt", "paymentCapturedAt"]), {
      detail: "Payment captured after the order was cancelled",
      tone: "critical",
    });
  } else if (payment === PAYMENT.REFUNDED) {
    push("refunded", "Refunded", firstDate(order, ["refundedAt"]));
  } else if (!cancelled) {
    push("awaiting_payment", "Awaiting payment", null, {
      detail: order.paymentMethod || null,
      tone: "current",
    });
  }

  /* Kitchen flow. Each step is emitted only if the order has reached it. */
  if (rank >= 1) {
    push("accepted", "Accepted & preparing", firstDate(order, ["acceptedAt", "preparingAt", "confirmedAt"]));
  }
  if (rank >= 2) {
    push("ready", "Ready for pickup", firstDate(order, ["readyAt", "preparedAt"]));
  }

  /* Assignment is a real, separately-recorded event, not part of the stage
     ladder: an order can have a rider before it leaves, and knowing when the
     rider was attached is what distinguishes a slow kitchen from slow
     dispatch. */
  if (order.assignedPartnerId || order.assignedPartnerName) {
    push("assigned", "Rider assigned", firstDate(order, ["assignedAt", "partnerAssignedAt"]), {
      actor: order.assignedPartnerName || null,
    });
  }

  if (rank >= 3) {
    push("out", "Out for delivery", firstDate(order, ["outForDeliveryAt", "pickedUpAt", "dispatchedAt"]), {
      actor: order.assignedPartnerName || null,
    });
  }
  if (rank >= 4) {
    push("delivered", "Delivered", firstDate(order, ["deliveredAt", "completedAt"]), {
      actor: order.assignedPartnerName || null,
    });
  }

  /* The cancellation branch replaces the remaining flow rather than sitting
     alongside it. */
  if (cancelled) {
    const by = String(order.cancelledBy || "");
    push("cancelled", "Cancelled", firstDate(order, ["cancelledAt", "updatedAt"]), {
      actor: by.startsWith("system:") ? "System" : by || null,
      detail: order.cancellationReason || (by.startsWith("system:") ? by.replace("system:", "") : null),
      tone: "critical",
    });
  }

  /* Mark the last non-critical step as current when the order is still live,
     so the timeline shows where it is now rather than reading as finished. */
  if (!cancelled && rank < 4) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].tone === "done") { steps[i].tone = "current"; break; }
    }
  }

  return steps;
}

export const formatStepTime = (d) =>
  d
    ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
    : "Time not recorded";
