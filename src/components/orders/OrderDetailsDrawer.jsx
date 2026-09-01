import React, { useEffect, useRef } from "react";
import { STAGE, stageOf, planTransition } from "../../lib/orderStages";
import {
  labelForOrder, paymentStateOf, PAYMENT_LABEL, toneForStage, toneForPayment,
  TONE, orderTypeOf, ORDER_TYPE_LABEL, orNothing, money, DASH,
} from "../../lib/orderPresentation";
import { buildTimeline, formatStepTime } from "../../lib/orderTimeline";
import { printKOT, printInvoice, kotNumber } from "../../lib/printing";
import AssetImage from "../AssetImage";

/**
 * Everything about one order, in one panel.
 *
 * Replaces a flow where inspecting an order meant moving between the list, a
 * detail view and a separate KOT tab. Operators work this screen during
 * service with a queue behind them, so the panel is a drawer over the list
 * rather than a route change: it opens, it answers the question, it closes,
 * and the queue is still there underneath.
 *
 * Two rules run through it:
 *
 *  - **Nothing is fabricated.** Every money line comes from a stored field and
 *    is omitted when absent; every timestamp is real or reads "not recorded".
 *    A missing value renders as an em dash rather than a plausible guess.
 *  - **Actions match the actual state.** The buttons offered are the ones
 *    `planTransition` will permit from where the order actually is, so the
 *    panel cannot offer a move that the shared state machine will refuse.
 */
export const OrderDetailsDrawer = ({
  order,
  open,
  onClose,
  onUpdateStatus,
  onAssignRider,
  onCancelOrder,
  onEditItems,
  onPrintResult,
  menuItems = [],
  busy = false,
}) => {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  /* Escape closes; focus moves into the panel on open. Without this the
     drawer opens with focus still on the row behind it, so a keyboard user
     tabs through the whole list before reaching the panel they just opened. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !order) return null;

  const stage = stageOf(order);
  const payment = paymentStateOf(order);
  const type = orderTypeOf(order);
  const timeline = buildTimeline(order);
  const items = Array.isArray(order.items) ? order.items : [];

  /* The order stores a copy of each item's image at purchase time, but older
     orders (and items whose menu photo was added later) have it blank. Fall
     back to the current menu item's picture, matched on id, so the drawer
     shows the dish instead of an empty grey box. */
  const menuImageById = new Map(
    (Array.isArray(menuItems) ? menuItems : [])
      .map((m) => [String(m.id ?? m.menuItemId ?? ""), m.imageUrl || m.image || ""])
      .filter(([id, url]) => id && url),
  );
  const itemImage = (item) =>
    item.image || item.imageUrl || item.img || item.photo ||
    menuImageById.get(String(item.menuItemId ?? item.itemId ?? item.id ?? "")) || "";

  // "Edit items" is only honest before the kitchen starts on the order — the
  // Cloud Function refuses it later anyway, so don't offer a button that fails.
  const canEditItems = Boolean(onEditItems) && stage === STAGE.ORDERS;
  // Cancelling is allowed from anywhere the state machine permits (everything
  // except an already-finished or already-cancelled order).
  const canCancel = Boolean(onCancelOrder) &&
    planTransition(order, STAGE.CANCELLED).allowed;

  const report = (result) => onPrintResult?.(result);

  /* ── Money lines ──────────────────────────────────────────────────────
     Emitted only where a real, non-zero value is stored. A template slot
     never conjures a line: an order with no surcharge shows no surcharge
     row, rather than ₹0.00 implying one was considered. */
  const lines = [
    ["Subtotal", order.subtotal, false],
    ["Discount", order.discountAmount ?? order.discount, true],
    ["Delivery fee", order.deliveryFee ?? order.deliveryCharge, false],
    ["Taxes", order.tax ?? order.taxAmount, false],
    ["Weather surcharge", order.weatherSurcharge ?? order.rainFee, false],
    ["Packaging", order.packagingFee, false],
    ["Wallet applied", order.walletApplied ?? order.walletDeduction, true],
    ["Loyalty applied", order.loyaltyDiscount ?? order.loyaltyApplied, true],
    ["Tip", order.tipAmount, false],
  ].filter(([, v]) => Number.isFinite(Number(v)) && Number(v) !== 0);

  /* ── Actions permitted from here ──────────────────────────────────────
     Derived from the same state machine the write path uses, so a button is
     never offered for a move that would then be refused. */
  const moves = [];
  if (stage !== STAGE.CANCELLED && stage !== STAGE.COMPLETED) {
    const forward = {
      [STAGE.ORDERS]: [STAGE.PREPARING, "Accept & start preparing"],
      [STAGE.PREPARING]: [STAGE.READY, "Mark ready"],
      // Pickup leaves the flow here: the customer collects at the counter,
      // so there is no "out for delivery" leg to record.
      [STAGE.READY]: type === "pickup"
        ? [STAGE.COMPLETED, "Mark collected"]
        : [STAGE.OUT_FOR_DELIVERY, "Mark out for delivery"],
      [STAGE.OUT_FOR_DELIVERY]: [STAGE.COMPLETED, "Mark delivered"],
    }[stage];
    if (forward) {
      const plan = planTransition(order, forward[0]);
      if (plan.allowed) moves.push({ label: forward[1], stage: forward[0] });
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex justify-end" role="dialog" aria-modal="true"
         aria-label={`Order ${kotNumber(order)} details`}>
      <button
        aria-label="Close order details"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-[2px]"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        className="relative flex h-full w-full max-w-[560px] flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">
                  #{kotNumber(order)}
                </h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[toneForStage(stage)]}`}>
                  {labelForOrder(order)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[toneForPayment(payment)]}`}>
                  {PAYMENT_LABEL[payment]}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {ORDER_TYPE_LABEL[type]} · {formatStepTime(timeline[0]?.at)}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{order.id}</p>
            </div>

            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-2 text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => report(printKOT(order, { typeLabel: ORDER_TYPE_LABEL[type] }))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <span className="material-symbols-outlined text-[15px]">receipt_long</span>
              Print KOT
            </button>
            <button
              onClick={() => report(printInvoice(order, { typeLabel: ORDER_TYPE_LABEL[type] }))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <span className="material-symbols-outlined text-[15px]">print</span>
              Print invoice
            </button>
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Customer. Phone and address are here — an operator ringing a
              customer about a late order needs them — but they are
              deliberately absent from the KOT. */}
          <Section title="Customer">
            <Field label="Name" value={orNothing(order.customer)} />
            <Field label="Phone" value={orNothing(order.phone || order.customerPhone)} mono />
            <Field
              label={type === "pickup" ? "Collection" : "Delivery address"}
              value={orNothing(order.address || order.deliveryAddress?.addressLine)}
            />
            {order.deliveryAddress?.landmark && (
              <Field label="Landmark" value={order.deliveryAddress.landmark} />
            )}
          </Section>

          {/* Items */}
          <Section title={`Items (${items.length})`}>
            {items.length === 0 ? (
              <p className="text-xs text-slate-500">No items recorded on this order.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item, i) => {
                  const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
                  const unit = Number(item.price || 0);
                  const addons = normaliseAddons(item);
                  const note = item.notes || item.specialInstructions || item.instructions;
                  return (
                    <li key={i} className="flex gap-3 py-2.5">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <AssetImage src={itemImage(item)} alt={item.name || "Item"}
                                    className="h-full w-full object-cover" label="" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {item.name || "Unnamed item"}
                        </p>
                        {(item.variant || item.selectedVariant || item.size) && (
                          <p className="text-[11px] text-slate-500">
                            {item.variant || item.selectedVariant || item.size}
                          </p>
                        )}
                        {addons.length > 0 && (
                          <p className="text-[11px] text-slate-500">+ {addons.join(", ")}</p>
                        )}
                        {note && (
                          <p className="mt-1 rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                            {note}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {qty} × {money(unit)}
                        </p>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                        {money(unit * qty)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Money */}
          <Section title="Payment">
            <dl className="space-y-1">
              {lines.map(([label, value, negative]) => (
                <div key={label} className="flex justify-between text-xs">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium tabular-nums text-slate-700">
                    {negative ? "−" : ""}{money(Math.abs(Number(value)))}
                  </dd>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
                <dt className="font-bold text-slate-800">Grand total</dt>
                {/* The stored total, never a re-derived sum — a computed figure
                    that disagreed with what the customer was charged would be
                    worse than no figure. */}
                <dd className="font-bold tabular-nums text-slate-900">
                  {money(order.total ?? order.totalAmount ?? order.grandTotal)}
                </dd>
              </div>
              <div className="flex justify-between pt-1 text-[11px]">
                <dt className="text-slate-500">Method</dt>
                <dd className="font-medium text-slate-600">{orNothing(order.paymentMethod)}</dd>
              </div>
              {/* Reference only — never the full payment instrument. A gateway
                  reference is what support needs to trace a charge; card or
                  UPI detail is neither stored nor shown. */}
              {(order.razorpayPaymentId || order.paymentId) && (
                <div className="flex justify-between text-[11px]">
                  <dt className="text-slate-500">Reference</dt>
                  <dd className="font-mono text-slate-600">
                    {order.razorpayPaymentId || order.paymentId}
                  </dd>
                </div>
              )}
            </dl>
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            <ol className="relative space-y-0">
              {timeline.map((step, i) => (
                <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < timeline.length - 1 && (
                    <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" aria-hidden="true" />
                  )}
                  <span
                    className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full ring-4 ring-white ${
                      step.tone === "critical" ? "bg-rose-500"
                        : step.tone === "current" ? "bg-amber-400"
                          : "bg-emerald-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{step.label}</p>
                    <p className="text-[11px] text-slate-500">{formatStepTime(step.at)}</p>
                    {(step.actor || step.detail) && (
                      <p className="text-[11px] text-slate-400">
                        {[step.actor, step.detail].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          {/* Delivery */}
          <Section title="Delivery">
            <Field label="Rider" value={orNothing(order.assignedPartnerName || order.rider)} />
            {order.verificationCode && stage !== STAGE.COMPLETED && (
              <Field label="Delivery OTP" value={order.verificationCode} mono />
            )}
            <Field label="ETA" value={order.etaText || DASH} />
          </Section>
        </div>

        {/* ── Footer actions ─────────────────────────────────────────── */}
        <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {moves.length === 0
            && !(stage === STAGE.READY && type !== "pickup")
            && !canEditItems && !canCancel ? (
            <p className="text-xs text-slate-500">
              {stage === STAGE.COMPLETED
                ? "This order is complete. No further status change is possible."
                : stage === STAGE.CANCELLED
                  ? "This order was cancelled and cannot be moved on."
                  : "No status change is available from here."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {moves.map((m) => (
                <button
                  key={m.stage}
                  disabled={busy}
                  onClick={() => onUpdateStatus?.(order, m.stage)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white outline-none transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Working…" : m.label}
                </button>
              ))}
              {/* Only a delivery order needs a rider. A counter pickup has no
                  rider and never will, so offering this as its route out of
                  Ready would strand it. */}
              {stage === STAGE.READY && type !== "pickup" && onAssignRider && (
                <button
                  disabled={busy}
                  onClick={() => onAssignRider(order)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">two_wheeler</span>
                  {order.assignedPartnerName ? "Change rider" : "Assign rider"}
                </button>
              )}
              {/* Reassignment stays available once a rider is moving, because
                  a bike breaking down mid-delivery is exactly when it is
                  needed. */}
              {stage === STAGE.OUT_FOR_DELIVERY && onAssignRider && (
                <button
                  disabled={busy}
                  onClick={() => onAssignRider(order)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                  Change rider
                </button>
              )}

              {canEditItems && (
                <button
                  disabled={busy}
                  onClick={() => onEditItems(order)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  Edit items
                </button>
              )}

              {canCancel && (
                <button
                  disabled={busy}
                  onClick={() => onCancelOrder(order)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-600 outline-none transition-colors hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">cancel</span>
                  {stage === STAGE.ORDERS ? "Reject order" : "Cancel order"}
                </button>
              )}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};

/* ── Small building blocks, shared by the sections above ─────────────────── */

const Section = ({ title, children }) => (
  <section className="mb-5 last:mb-0">
    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
      {title}
    </h3>
    <div className="rounded-xl border border-slate-200 bg-white p-3">{children}</div>
  </section>
);

const Field = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 py-1 text-xs">
    <span className="shrink-0 text-slate-500">{label}</span>
    <span className={`text-right font-medium text-slate-800 ${mono ? "font-mono" : ""}`}>
      {value}
    </span>
  </div>
);

/** Add-ons arrive as strings, objects or a map depending on which app wrote
 *  the order; joining the raw array renders "[object Object]" for two of the
 *  three shapes. */
function normaliseAddons(item) {
  const raw = item?.selectedAddons ?? item?.addons ?? item?.addOns;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list.map((a) => (typeof a === "string" ? a : a?.name || a?.title || a?.label)).filter(Boolean);
}

export default OrderDetailsDrawer;
