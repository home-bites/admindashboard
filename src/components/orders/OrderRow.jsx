import React from "react";
import { STAGE, stageOf } from "../../lib/orderStages";
import {
  labelForOrder, paymentStateOf, PAYMENT, PAYMENT_LABEL,
  toneForStage, toneForPayment, TONE,
  orderTypeOf, ORDER_TYPE_LABEL, orNothing, money, reviewFlagsOf,
} from "../../lib/orderPresentation";
import { kotNumber } from "../../lib/printing";

/**
 * One order, as a scannable operational row.
 *
 * ── Layout reasoning ─────────────────────────────────────────────────────
 *
 * Three zones, matching what an operator is actually asking at each moment:
 *
 *   left    who and when   — identity, so the row can be found and called out
 *   centre  what and money — what to cook and whether it is paid for
 *   right   where and next — status, rider, and the one action to take now
 *
 * The single primary action sits at the far right because that is where the
 * eye finishes, and because there is exactly one obvious next move for an
 * order in any given state. Everything else lives in the details drawer
 * rather than as a row of competing buttons — a queue of rows each offering
 * five actions is how an operator picks the wrong one during a rush.
 *
 * Colour carries meaning and nothing else: the palette in `orderPresentation`
 * has four tones with fixed semantics, and this component may not invent a
 * fifth.
 */
export const OrderRow = ({
  order, onOpen, onPrimaryAction, busy = false,
  selectable = false, selected = false, onSelect,
}) => {
  const stage = stageOf(order);
  const payment = paymentStateOf(order);
  const type = orderTypeOf(order);
  const items = Array.isArray(order.items) ? order.items : [];
  // Server-side verification findings. Empty for a clean order.
  const reviewFlags = reviewFlagsOf(order);
  const units = items.reduce((n, i) => n + (Number(i.quantity ?? i.qty ?? 1) || 1), 0);

  /* The one move that makes sense from here. Mirrors the drawer, which
     derives the same thing from `planTransition`.
   *
   * Ready branches on order type, and that branch matters in both directions:
   *
   *  - A **delivery** order must go Ready → assign a rider → Out for
   *    Delivery. Sending it straight to Delivered means it never carries "Out
   *    for Delivery", which is the status the customer app's tracking screen
   *    watches for a moving rider — the customer would see the order jump from
   *    "preparing" to "delivered" with no journey.
   *  - A **pickup** order has no rider and never will. Offering "Assign rider"
   *    as its only action strands it at Ready with nothing the operator can
   *    press to complete it.
   */
  const readyMove = type === "pickup"
    ? { label: "Mark collected", to: STAGE.COMPLETED, icon: "check" }
    : { label: "Assign rider", to: null, icon: "two_wheeler" };

  const next = {
    [STAGE.ORDERS]: { label: "Accept", to: STAGE.PREPARING, icon: "play_arrow" },
    [STAGE.PREPARING]: { label: "Mark ready", to: STAGE.READY, icon: "room_service" },
    [STAGE.READY]: readyMove,
    [STAGE.OUT_FOR_DELIVERY]: { label: "Mark delivered", to: STAGE.COMPLETED, icon: "check" },
  }[stage];

  /* A cancelled order with money captured against it is the one row that must
     pull the eye across a full screen — it is money the business is holding
     for something it will never deliver. */
  const alarm = payment === PAYMENT.REFUND_REQUIRED;

  return (
    <li
      className={`group grid grid-cols-1 items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50/80 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_minmax(0,1fr)] ${
        alarm ? "bg-rose-50/40" : ""
      }`}
    >
      {/* ── Left: identity ─────────────────────────────────────────── */}
      <div className="flex min-w-0 items-start gap-2.5">
        {/* Only rendered where a bulk operation is actually available, so an
            unusable checkbox never sits beside every row. */}
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(order)}
            aria-label={`Select order ${kotNumber(order)} for cash settlement`}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpen(order)}
              className="truncate rounded text-sm font-bold tracking-tight text-slate-900 outline-none hover:text-emerald-700 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              #{kotNumber(order)}
            </button>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {ORDER_TYPE_LABEL[type]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-700">
            {orNothing(order.customer)}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {order.timeText || orNothing(order.phone)}
          </p>
        </div>
      </div>

      {/* ── Centre: contents and money ─────────────────────────────── */}
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{units}</span>
          {" item"}{units === 1 ? "" : "s"}
          {items.length > 0 && (
            <span className="text-slate-400"> · {items.map((i) => i.name).filter(Boolean).join(", ")}</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold tabular-nums text-slate-900">
            {money(order.total ?? order.totalAmount)}
          </span>
          <span className="text-[11px] text-slate-400">{orNothing(order.paymentMethod)}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TONE[toneForPayment(payment)]}`}>
            {PAYMENT_LABEL[payment]}
          </span>

          {/* The server checked this order's prices against the catalogue and
              found something. Shown beside the money because that is what the
              finding is about, and in `attention` rather than `critical`: the
              order is valid and must still be cooked — a human just needs to
              look at what was charged. The reasons are in the title so an
              operator can see them without opening the drawer. */}
          {reviewFlags.length > 0 && (
            <span
              title={reviewFlags.join("\n")}
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TONE.attention}`}
            >
              <span className="material-symbols-outlined text-[12px] leading-none">flag</span>
              Review
              {reviewFlags.length > 1 && ` (${reviewFlags.length})`}
            </span>
          )}
        </div>
      </div>

      {/* ── Right: state and the next move ─────────────────────────── */}
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <div className="min-w-0 text-left md:text-right">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[toneForStage(stage)]}`}>
            {labelForOrder(order)}
          </span>
          {(order.assignedPartnerName || order.etaText) && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {[order.assignedPartnerName, order.etaText].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {next && (
            <button
              onClick={() => onPrimaryAction(order, next.to)}
              disabled={busy}
              title={next.label}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white outline-none transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[14px]">{next.icon}</span>
              <span className="hidden lg:inline">{next.label}</span>
            </button>
          )}
          <button
            onClick={() => onOpen(order)}
            aria-label={`Open details for order ${kotNumber(order)}`}
            title="Details"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 outline-none transition-colors hover:bg-white hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>
    </li>
  );
};

export default OrderRow;
