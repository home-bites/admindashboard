/**
 * Kitchen Order Tickets and customer invoices.
 *
 * ── What was wrong with the previous KOT ─────────────────────────────────
 *
 * `handlePrintKOT` produced a document titled "KOT" that was in fact a
 * customer receipt. It printed, on the ticket that goes to the pass:
 *
 *   - Subtotal, CGST & SGST, delivery charge, discount and "TOTAL PAID"
 *   - The payment method
 *   - The customer's full delivery address
 *   - The customer's phone number
 *   - **The delivery verification OTP**
 *
 * None of that helps anyone cook, and the last three are customer personal
 * data being printed onto a slip that lives on a kitchen rail, gets handled
 * by everyone on shift and ends the night in a bin. The OTP is worse than
 * PII: it is the credential that proves a delivery happened, printed on paper
 * that never leaves the kitchen and is never checked.
 *
 * A KOT answers one question — what do I cook, how many, and does anything
 * about it differ from normal. So this module produces two documents:
 *
 *   `printKOT`      kitchen: items, quantities, variants, add-ons, notes,
 *                   order type, priority, scheduled time. No money, no
 *                   address, no phone, no OTP.
 *   `printInvoice`  customer: the financial document, with the full breakdown
 *                   and the delivery address it is actually for.
 *
 * ── Two other defects fixed here ─────────────────────────────────────────
 *
 * **HTML injection.** The old builder interpolated `${item.name}` and
 * `${order.customer}` straight into markup. Those strings come from Firestore
 * and ultimately from customer input — a dish name or a delivery note
 * containing `<script>` executed in the print window. `esc()` below is applied
 * to every interpolated value without exception.
 *
 * **Nothing verified that printing happened.** The old code wrote the
 * document and returned, so the caller could not tell a blocked popup from a
 * successful print. These functions return a result the caller reports on,
 * rather than a toast that claims success unconditionally.
 */

/** HTML-escape. Applied to every interpolated value in this file. */
const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "0.00");

/** Every shape a timestamp arrives in from this collection. */
function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isFinite(val.getTime()) ? val : null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return Number.isFinite(d.getTime()) ? d : null;
}

const fmtDateTime = (val) => {
  const d = toDate(val);
  // Never falls back to "now": a ticket stamped with the current time for an
  // order whose timestamp is missing tells the kitchen it just came in.
  return d
    ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
    : "—";
};

/**
 * A short, human ticket number.
 *
 * Kitchens call orders across a noisy room, and a 20-character Firestore id
 * cannot be read aloud. The last six characters are unique enough for a
 * service and short enough to shout. The full id stays on the ticket in
 * smaller type for reconciliation.
 */
export const kotNumber = (order) => String(order?.id || "").slice(-6).toUpperCase() || "——————";

const qtyOf = (item) => Number(item?.quantity ?? item?.qty ?? 1) || 1;

/**
 * Add-ons, in whichever shape they were stored.
 *
 * Three shapes exist across the apps' history: an array of strings, an array
 * of `{name}` objects, and an object map. The old ticket did
 * `item.selectedAddons.join(", ")`, which renders "[object Object]" for two of
 * the three — so paid extras silently reached the kitchen as noise.
 */
function addonsOf(item) {
  const raw = item?.selectedAddons ?? item?.addons ?? item?.addOns;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .map((a) => (typeof a === "string" ? a : a?.name || a?.title || a?.label))
    .filter(Boolean);
}

const variantOf = (item) => item?.variant || item?.selectedVariant || item?.size || "";
const noteOf = (item) => item?.notes || item?.specialInstructions || item?.instructions || "";

/**
 * Preparation priority.
 *
 * Derived, not invented: an order already waiting beyond the kitchen's normal
 * turnaround is the one to start next. Scheduled orders are explicitly not
 * urgent — cooking them early is as wrong as cooking them late.
 */
function priorityOf(order) {
  if (order?.scheduledFor || order?.scheduledAt) return { label: "SCHEDULED", urgent: false };
  const placed = toDate(order?.createdAt);
  if (!placed) return { label: "NORMAL", urgent: false };
  const mins = Math.floor((Date.now() - placed.getTime()) / 60000);
  if (mins >= 25) return { label: `URGENT · WAITING ${mins} MIN`, urgent: true };
  if (mins >= 15) return { label: `PRIORITY · WAITING ${mins} MIN`, urgent: false };
  return { label: "NORMAL", urgent: false };
}

/**
 * Open a document in a print window and drive the browser's print dialog.
 *
 * Uses `document.write` into a popup, which is the architecture already in
 * place here and the one that keeps the dashboard's own DOM — sidebar,
 * filters, everything — out of the printed output. The alternative, a
 * print-only stylesheet over the live page, is what produces "the whole
 * dashboard printed" and is exactly what the brief rules out.
 *
 * @returns {{ok: boolean, reason?: string}} so the caller can report honestly
 */
function openPrintWindow(title, bodyHtml, styles) {
  const w = window.open("", "_blank", "width=420,height=760");
  if (!w) {
    return { ok: false, reason: "Your browser blocked the print window. Allow popups for this site and try again." };
  }

  // The closing script tag is split across a concatenation. Written whole,
  // the literal `</script>` inside this module's own source would terminate
  // the surrounding script element once the bundle is inlined into HTML.
  w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${styles}</style></head>
<body>${bodyHtml}
<script>
  window.onload = function () {
    window.focus();
    window.print();
    // Closing on afterprint rather than a fixed timeout: a 500ms timer closed
    // the window while the print dialog was still open on slower machines,
    // cancelling the job. Falls back to a long timer where afterprint is not
    // fired.
    if (typeof window.onafterprint !== "undefined") {
      window.onafterprint = function () { window.close(); };
    }
    setTimeout(function () { try { window.close(); } catch (e) {} }, 60000);
  };
</` + `script>
</body></html>`);
  w.document.close();
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Shared print styles
 *
 * One sheet serving both an 80mm thermal roll and A4. `@page` selects the
 * roll; the A4 rule widens the body and grows the type when the operator
 * picks an A4 printer, so a single document works on both without a second
 * template to keep in step.
 * ══════════════════════════════════════════════════════════════════════════ */
const BASE_STYLES = `
  * { box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    width: 80mm; margin: 0; padding: 4mm;
    color: #000; background: #fff;
    font-size: 12px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .brand { text-align: center; margin-bottom: 3mm; }
  .brand h1 { font-size: 20px; margin: 0; letter-spacing: 1px; text-transform: uppercase; font-weight: 800; }
  .brand .sub { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin-top: 1mm; }
  .rule { border-top: 1px dashed #000; margin: 2.5mm 0; }
  .rule-solid { border-top: 2px solid #000; margin: 2.5mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; font-size: 11px; padding: 0.6mm 0; }
  .row .k { font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .row .v { text-align: right; word-break: break-word; }
  .ticket-no { text-align: center; margin: 2mm 0; }
  .ticket-no .n { font-size: 30px; font-weight: 800; letter-spacing: 2px; line-height: 1; }
  .ticket-no .l { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; }
  .chip { display: inline-block; border: 1.5px solid #000; padding: 1mm 2mm; font-size: 10px;
          font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
  .chip.solid { background: #000; color: #fff; }
  .foot { text-align: center; font-size: 9px; margin-top: 5mm; }

  /* Items. Quantity is the single most important number on a KOT, so it is
     set large and left, where the eye lands first. */
  .item { display: flex; gap: 3mm; padding: 2.2mm 0; border-bottom: 1px dotted #999; page-break-inside: avoid; }
  .item:last-child { border-bottom: 0; }
  .item .q { font-size: 19px; font-weight: 800; min-width: 11mm; }
  .item .body { flex: 1; min-width: 0; }
  .item .n { font-size: 14px; font-weight: 700; word-break: break-word; hyphens: auto; }
  .item .meta { font-size: 11px; margin-top: 0.8mm; word-break: break-word; }
  .item .addon { font-weight: 600; }
  .item .note { font-weight: 800; text-transform: uppercase; border-left: 3px solid #000; padding-left: 2mm; margin-top: 1mm; }
  .item .amt { font-size: 12px; font-weight: 700; white-space: nowrap; }

  @media print {
    body { width: auto; }
    /* A4 and Letter: the same document, comfortably larger. */
    @page :first { margin: 0; }
  }
  @media print and (min-width: 180mm) {
    body { width: 180mm; padding: 12mm; font-size: 14px; }
    .item .n { font-size: 17px; }
    .item .q { font-size: 24px; min-width: 16mm; }
    .ticket-no .n { font-size: 40px; }
  }
`;

/* ══════════════════════════════════════════════════════════════════════════
 * KOT — the kitchen's document
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} order
 * @param {{typeLabel?: string}} [opts] presentation-layer order type
 * @returns {{ok: boolean, reason?: string}}
 */
export function printKOT(order, opts = {}) {
  if (!order) return { ok: false, reason: "No order to print." };

  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    // A blank ticket sends the kitchen nothing to cook and looks like a
    // printer fault. Better to say why.
    return { ok: false, reason: "This order has no items recorded, so there is nothing to put on a ticket." };
  }

  const prio = priorityOf(order);
  const scheduled = order.scheduledFor || order.scheduledAt;

  const itemsHtml = items
    .map((item) => {
      const variant = variantOf(item);
      const addons = addonsOf(item);
      const note = noteOf(item);
      return `
        <div class="item">
          <div class="q">${esc(qtyOf(item))}&times;</div>
          <div class="body">
            <div class="n">${esc(item.name || "Unnamed item")}</div>
            ${variant ? `<div class="meta">Variant: <strong>${esc(variant)}</strong></div>` : ""}
            ${addons.length ? `<div class="meta addon">+ ${esc(addons.join(", "))}</div>` : ""}
            ${note ? `<div class="note">${esc(note)}</div>` : ""}
          </div>
        </div>`;
    })
    .join("");

  const totalUnits = items.reduce((n, i) => n + qtyOf(i), 0);
  const kitchenNote = order.cookingInstructions || order.kitchenNotes || order.orderNotes || "";

  const body = `
    <div class="brand">
      <h1>HomBites</h1>
      <div class="sub">Kitchen Order Ticket</div>
    </div>

    <div class="rule-solid"></div>

    <div class="ticket-no">
      <div class="l">KOT</div>
      <div class="n">${esc(kotNumber(order))}</div>
    </div>

    <div style="text-align:center; margin-bottom:2mm;">
      <span class="chip ${prio.urgent ? "solid" : ""}">${esc(prio.label)}</span>
      <span class="chip">${esc(opts.typeLabel || "Delivery")}</span>
    </div>

    <div class="rule"></div>

    <div class="row"><span class="k">Placed</span><span class="v">${esc(fmtDateTime(order.createdAt))}</span></div>
    ${scheduled ? `<div class="row"><span class="k">Serve at</span><span class="v"><strong>${esc(fmtDateTime(scheduled))}</strong></span></div>` : ""}
    <div class="row"><span class="k">Order ref</span><span class="v" style="font-size:9px;">${esc(order.id)}</span></div>
    <div class="row"><span class="k">Items</span><span class="v">${esc(items.length)} lines &middot; ${esc(totalUnits)} units</span></div>

    <div class="rule-solid"></div>

    ${itemsHtml}

    <div class="rule-solid"></div>

    ${kitchenNote ? `<div class="item"><div class="body"><div class="note">Order note: ${esc(kitchenNote)}</div></div></div>` : ""}

    <!--
      No customer name, phone, address, payment method, totals or delivery
      OTP. This ticket lives on a kitchen rail; none of that is needed to cook
      and all of it is customer data the kitchen has no reason to hold. The
      invoice carries it instead.
    -->
    <div class="foot">
      <div><strong>KITCHEN COPY</strong></div>
      <div>Printed ${esc(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }))}</div>
    </div>`;

  return openPrintWindow(`KOT ${kotNumber(order)}`, body, BASE_STYLES);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Invoice — the customer's document
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every money line the order actually carries.
 *
 * Lines are emitted only when present and non-zero, so an order with no
 * surcharge does not show a ₹0.00 surcharge row, and — importantly — a line
 * is never synthesised because the template has a slot for it. The grand
 * total is the stored total, not a re-derived sum: showing arithmetic the
 * customer was not charged would make the invoice disagree with their bank.
 */
function moneyLines(order) {
  const rows = [];
  const add = (label, value, negative = false) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return;
    rows.push(
      `<div class="row"><span class="k">${esc(label)}</span><span class="v">${negative ? "&minus;" : ""}₹${esc(money(Math.abs(n)))}</span></div>`,
    );
  };

  add("Subtotal", order.subtotal);
  add("Discount", order.discountAmount ?? order.discount, true);
  add("Delivery fee", order.deliveryFee ?? order.deliveryCharge);
  add("Taxes", order.tax ?? order.taxAmount);
  add("Weather surcharge", order.weatherSurcharge ?? order.rainFee);
  add("Packaging", order.packagingFee);
  add("Wallet applied", order.walletApplied ?? order.walletDeduction, true);
  add("Loyalty applied", order.loyaltyDiscount ?? order.loyaltyApplied, true);
  add("Tip", order.tipAmount);
  return rows.join("");
}

export function printInvoice(order, opts = {}) {
  if (!order) return { ok: false, reason: "No order to print." };

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsHtml = items
    .map((item) => {
      const q = qtyOf(item);
      const unit = Number(item.price || 0);
      const variant = variantOf(item);
      const addons = addonsOf(item);
      return `
        <div class="item">
          <div class="q" style="font-size:14px;">${esc(q)}&times;</div>
          <div class="body">
            <div class="n" style="font-size:13px;">${esc(item.name || "Unnamed item")}</div>
            ${variant ? `<div class="meta">${esc(variant)}</div>` : ""}
            ${addons.length ? `<div class="meta">+ ${esc(addons.join(", "))}</div>` : ""}
            <div class="meta">₹${esc(money(unit))} each</div>
          </div>
          <div class="amt">₹${esc(money(unit * q))}</div>
        </div>`;
    })
    .join("");

  const addr = order.address || order.deliveryAddress?.addressLine || "";

  const body = `
    <div class="brand">
      <h1>HomBites</h1>
      <div class="sub">Tax Invoice</div>
    </div>

    <div class="rule-solid"></div>

    <div class="row"><span class="k">Invoice</span><span class="v"><strong>${esc(kotNumber(order))}</strong></span></div>
    <div class="row"><span class="k">Order ref</span><span class="v" style="font-size:9px;">${esc(order.id)}</span></div>
    <div class="row"><span class="k">Date</span><span class="v">${esc(fmtDateTime(order.createdAt))}</span></div>
    <div class="row"><span class="k">Customer</span><span class="v">${esc(order.customer || "—")}</span></div>
    ${addr ? `<div class="row"><span class="k">${esc(opts.typeLabel === "Pickup" ? "Collection" : "Deliver to")}</span><span class="v">${esc(addr)}</span></div>` : ""}
    <div class="row"><span class="k">Payment</span><span class="v">${esc(order.paymentMethod || "—")}</span></div>

    <div class="rule-solid"></div>
    ${itemsHtml || '<div class="row"><span class="v">No items recorded on this order.</span></div>'}
    <div class="rule-solid"></div>

    ${moneyLines(order)}

    <div class="rule"></div>
    <div class="row" style="font-size:15px;">
      <span class="k">Total</span>
      <span class="v"><strong>₹${esc(money(order.total ?? order.totalAmount ?? order.grandTotal))}</strong></span>
    </div>

    <div class="foot">
      <div>Thank you for ordering with HomBites.</div>
    </div>`;

  return openPrintWindow(`Invoice ${kotNumber(order)}`, body, BASE_STYLES);
}
