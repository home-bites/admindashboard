/**
 * The five stages an order moves through, and how the stored status maps onto
 * them.
 *
 * ## Why a mapping rather than five status values
 *
 * Three surfaces write `status` and they do not agree. The customer app writes
 * `Pending` and `Payment Pending`; the dashboard writes `Accepted`,
 * `Preparing`, `Ready`; the delivery app writes `Out for Delivery` — and one
 * client writes it without spaces. `Delivered` and `Completed` both exist and
 * mean the same thing.
 *
 * Collapsing that to five stored values would be the tidier answer, and it is
 * the one to reach eventually. It is not the one to reach in the middle of
 * service: it needs a migration over live orders and a matching release of two
 * Flutter apps that cannot be compiled here. So this maps instead. Nothing
 * about the stored data changes, orders in flight keep working, and the
 * delivery app can go on writing whatever it writes.
 *
 * The mapping is deliberately total: an unrecognised status lands in
 * {@link STAGE.ORDERS} rather than vanishing. A status nobody planned for is a
 * thing to notice at the top of the queue, not a document that quietly stops
 * appearing anywhere.
 */

export const STAGE = {
  ORDERS: 'orders',
  PREPARING: 'preparing',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Tab order, left to right. Labels are display only. */
export const STAGES = [
  { id: STAGE.ORDERS, label: 'Orders' },
  { id: STAGE.PREPARING, label: 'Preparing' },
  { id: STAGE.OUT_FOR_DELIVERY, label: 'Out for Delivery' },
  { id: STAGE.COMPLETED, label: 'Completed' },
  { id: STAGE.CANCELLED, label: 'Cancelled' },
];

/** Spaces, underscores and case are noise; three clients disagree on all three. */
export function normaliseStatus(status) {
  return String(status || '').toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * Every stored spelling, grouped.
 *
 * `Ready` sits in PREPARING on purpose. A cooked meal on the pass has not left
 * the kitchen, and the rider has not taken it — putting it under Out for
 * Delivery would tell the dashboard a bike is moving when the food is still on
 * the counter.
 */
const STATUS_TO_STAGE = new Map(Object.entries({
  // — Orders: arrived, not yet cooking.
  pending: STAGE.ORDERS,
  paymentpending: STAGE.ORDERS,
  new: STAGE.ORDERS,
  placed: STAGE.ORDERS,
  confirmed: STAGE.ORDERS,
  accepted: STAGE.ORDERS,

  // — Preparing: in the kitchen, including plated and waiting for a rider.
  preparing: STAGE.PREPARING,
  cooking: STAGE.PREPARING,
  inkitchen: STAGE.PREPARING,
  ready: STAGE.PREPARING,
  readyforpickup: STAGE.PREPARING,

  // — Out for delivery: a rider has it.
  outfordelivery: STAGE.OUT_FOR_DELIVERY,
  pickedup: STAGE.OUT_FOR_DELIVERY,
  ontheway: STAGE.OUT_FOR_DELIVERY,
  dispatched: STAGE.OUT_FOR_DELIVERY,

  // — Completed. Two spellings, one meaning.
  delivered: STAGE.COMPLETED,
  completed: STAGE.COMPLETED,

  // — Cancelled.
  cancelled: STAGE.CANCELLED,
  canceled: STAGE.CANCELLED,
  rejected: STAGE.CANCELLED,
}));

/** @returns {string} one of STAGE.*, never undefined. */
export function stageOf(order) {
  const raw = typeof order === 'string' ? order : order?.status;
  return STATUS_TO_STAGE.get(normaliseStatus(raw)) || STAGE.ORDERS;
}

/** True when the order should appear in the kitchen queue. */
export function isInKitchenQueue(order) {
  return stageOf(order) === STAGE.PREPARING;
}

/**
 * The status to write for a given move, and whether the move is allowed from
 * where the order currently is.
 *
 * Both the dashboard and the delivery app can drive a transition, and they can
 * race — a rider marking Out for Delivery while an admin marks Ready. Rather
 * than forbid that, the rule is simply that an order never moves backwards: a
 * transition to a stage at or before the current one is refused, so a late
 * write from a slow client cannot pull an order back out of a stage it has
 * already left.
 */
const STAGE_ORDER = [
  STAGE.ORDERS,
  STAGE.PREPARING,
  STAGE.OUT_FOR_DELIVERY,
  STAGE.COMPLETED,
];

/** Canonical status written when moving into a stage. */
export const STAGE_WRITE_STATUS = {
  [STAGE.PREPARING]: 'Preparing',
  [STAGE.OUT_FOR_DELIVERY]: 'Out for Delivery',
  [STAGE.COMPLETED]: 'Delivered',
  [STAGE.CANCELLED]: 'Cancelled',
};

/**
 * @returns {{allowed: boolean, status?: string, reason?: string}}
 */
export function planTransition(order, toStage) {
  const from = stageOf(order);
  const status = STAGE_WRITE_STATUS[toStage];
  if (!status) return { allowed: false, reason: `Unknown stage "${toStage}"` };

  if (from === STAGE.CANCELLED) {
    return { allowed: false, reason: 'This order was cancelled and cannot be moved on.' };
  }
  // Cancelling is allowed from anywhere except a completed delivery: the food
  // is with the customer and cancelling it afterwards is a refund, not a
  // status change.
  if (toStage === STAGE.CANCELLED) {
    return from === STAGE.COMPLETED
      ? { allowed: false, reason: 'This order was delivered. Raise a refund rather than cancelling.' }
      : { allowed: true, status };
  }

  const fromIdx = STAGE_ORDER.indexOf(from);
  const toIdx = STAGE_ORDER.indexOf(toStage);
  if (fromIdx === -1 || toIdx === -1) return { allowed: false, reason: 'Not a forward move.' };
  if (toIdx <= fromIdx) {
    return {
      allowed: false,
      reason: `This order is already at "${from}" and cannot go back to "${toStage}".`,
    };
  }
  return { allowed: true, status };
}
