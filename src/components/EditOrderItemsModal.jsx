import React, { useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Edits the items on an order that has not started cooking.
 *
 * Lives in its own file because Orders.jsx is already 2,200 lines; adding a
 * modal with its own search, quantity and pricing state inline would have made
 * the largest file in the dashboard meaningfully harder to work in.
 *
 * The totals shown here are a **preview**. Every price is recalculated
 * server-side by `adminUpdateOrderItems`, which reads menuItems itself and
 * ignores whatever this component sends beyond ids and quantities. If the two
 * ever disagree the server wins, and it should — this is a browser tab that
 * may have had the menu open since before the last price change.
 */

/** Mirrors the app's MenuItemModel and the Cloud Function, tier for tier. */
function effectivePrice(m) {
  const base = Number(m?.price) || 0;
  const offer = Number(m?.offerPrice) || 0;
  const dAmt = Number(m?.discountAmount) || 0;
  const dPct = Number(m?.discountPercentage) || 0;
  if (offer > 0 && offer < base) return offer;
  if (dAmt > 0 && dAmt < base) return base - dAmt;
  if (dPct > 0 && dPct < 100) return base - (base * (dPct / 100));
  return base;
}

const qtyOf = (i) => Number(i.quantity ?? i.qty ?? 1);

export default function EditOrderItemsModal({ order, menuItems = [], onClose, onSaved, addToast }) {
  // Seeded from the order, then edited locally. Nothing is written until Save.
  const [rows, setRows] = useState(() =>
    (order.items || []).map((i) => ({
      menuItemId: i.menuItemId || i.itemId || '',
      name: i.name || '',
      price: Number(i.price) || 0,
      quantity: qtyOf(i),
      notes: i.notes || '',
    })),
  );
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const originalTotal = Number(order.grandTotal ?? order.totalAmount) || 0;
  const paid = String(order.paymentStatus || '').toLowerCase() === 'paid';

  // Charges carried across unchanged, matching the function's behaviour.
  const deliveryCharge = Number(order.deliveryCharge) || 0;
  const rainCharge = Number(order.rainCharge) || 0;
  const platformFee = Number(order.platformFee) || 0;
  const discountAmount = Number(order.discountAmount) || 0;

  // Tax rate is derived from the order rather than read from settings, so the
  // preview reflects the rate this order was placed under.
  const originalSubtotal = Number(order.subtotal) || 0;
  const originalTaxable = Math.max(0, originalSubtotal - discountAmount);
  const taxRate = originalTaxable > 0
    ? ((Number(order.taxAmount) || 0) / originalTaxable) * 100
    : 0;

  const preview = useMemo(() => {
    const subtotal = rows.reduce((s, r) => s + r.price * r.quantity, 0);
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = (taxable * taxRate) / 100;
    const grandTotal = taxable + deliveryCharge + rainCharge + platformFee + taxAmount;
    return {
      subtotal,
      taxAmount,
      grandTotal,
      difference: grandTotal - originalTotal,
    };
  }, [rows, discountAmount, taxRate, deliveryCharge, rainCharge, platformFee, originalTotal]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems
      .filter((m) => !m.isDeleted)
      .filter((m) => (q ? String(m.name || '').toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [menuItems, search]);

  const addItem = (m) => {
    setRows((prev) => {
      const at = prev.findIndex((r) => r.menuItemId === m.id);
      // Adding a dish already on the order bumps its quantity rather than
      // creating a second line for the same thing — two "Chicken Biryani"
      // rows is a receipt nobody can reconcile against the kitchen.
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], quantity: Math.min(99, next[at].quantity + 1) };
        return next;
      }
      return [...prev, {
        menuItemId: m.id,
        name: m.name || '',
        price: effectivePrice(m),
        quantity: 1,
        notes: '',
      }];
    });
  };

  const setQty = (id, q) =>
    setRows((prev) =>
      prev.map((r) => (r.menuItemId === id ? { ...r, quantity: Math.max(1, Math.min(99, q)) } : r)));

  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.menuItemId !== id));

  const save = async () => {
    if (rows.length === 0) {
      addToast('An order must keep at least one item. Cancel it instead.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await httpsCallable(getFunctions(), 'adminUpdateOrderItems')({
        orderId: order.id,
        reason: reason.trim(),
        // Only ids and quantities are sent. Prices are the server's business.
        items: rows.map((r) => ({
          menuItemId: r.menuItemId,
          quantity: r.quantity,
          notes: r.notes,
        })),
      });
      const d = res?.data || {};
      const diff = Number(d.difference || 0);
      addToast(
        diff === 0
          ? `Order updated — total unchanged at ₹${Number(d.grandTotal).toFixed(2)}.`
          : `Order updated — new total ₹${Number(d.grandTotal).toFixed(2)} (${
              diff > 0 ? '+' : '−'}₹${Math.abs(diff).toFixed(2)}). Customer notified.`,
        'success',
        8000,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      addToast(e?.message || 'Could not update the order.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const diff = preview.difference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Edit items</h2>
            <p className="text-[11px] font-semibold text-slate-500">
              Order {order.orderId || order.id} · {order.customerName || 'Customer'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
          {/* ---- current items ---- */}
          <section className="flex min-h-0 flex-col border-r border-slate-100">
            <h3 className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              On this order
            </h3>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {rows.length === 0 && (
                <p className="py-6 text-center text-xs font-semibold text-amber-600">
                  No items left. Add at least one, or cancel the order instead.
                </p>
              )}
              {rows.map((r) => (
                <div key={r.menuItemId}
                     className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-800">{r.name}</div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      ₹{r.price.toFixed(2)} each
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200">
                    <button onClick={() => setQty(r.menuItemId, r.quantity - 1)}
                            disabled={r.quantity <= 1}
                            className="px-2 py-1 text-slate-600 disabled:opacity-30">−</button>
                    <span className="w-6 text-center text-xs font-bold">{r.quantity}</span>
                    <button onClick={() => setQty(r.menuItemId, r.quantity + 1)}
                            className="px-2 py-1 text-slate-600">+</button>
                  </div>
                  <span className="w-16 text-right text-xs font-bold text-slate-800">
                    ₹{(r.price * r.quantity).toFixed(2)}
                  </span>
                  <button onClick={() => removeRow(r.menuItemId)}
                          title="Remove"
                          className="text-slate-300 hover:text-red-500">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ---- menu picker ---- */}
          <section className="flex min-h-0 flex-col">
            <div className="border-b border-slate-100 p-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the menu…"
                className="w-full rounded-lg border border-[#d3daea] bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#10b981] focus:outline-none focus:ring-2 focus:ring-[#10b981]/10"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
              {available.length === 0 && (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">
                  No matching dishes.
                </p>
              )}
              {available.map((m) => {
                const p = effectivePrice(m);
                const base = Number(m.price) || 0;
                return (
                  <button key={m.id} onClick={() => addItem(m)}
                          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-left transition-colors hover:border-[#10b981] hover:bg-emerald-50/40">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-slate-800">{m.name}</div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        ₹{p.toFixed(2)}
                        {p < base && (
                          <span className="ml-1 text-slate-400 line-through">₹{base.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[#10b981]">add_circle</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ---- totals + save ---- */}
        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-semibold text-slate-500">
              Subtotal ₹{preview.subtotal.toFixed(2)} · Tax ₹{preview.taxAmount.toFixed(2)}
              {discountAmount > 0 && (
                <> · Discount −₹{discountAmount.toFixed(2)} <span className="text-slate-400">(kept as-is)</span></>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-slate-900">
                ₹{preview.grandTotal.toFixed(2)}
              </div>
              <div className={`text-[11px] font-bold ${
                diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                {diff === 0
                  ? 'No change'
                  : `${diff > 0 ? '+' : '−'}₹${Math.abs(diff).toFixed(2)} vs ₹${originalTotal.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Money settles offline, so the consequence is spelled out before
              saving rather than left for someone to work out at the door. */}
          {paid && diff !== 0 && (
            <p className={`mb-3 rounded-lg border px-3 py-2 text-[11px] font-semibold ${
              diff > 0
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              This order is already paid. {diff > 0
                ? `₹${diff.toFixed(2)} will be recorded as due — collect it on delivery.`
                : `₹${Math.abs(diff).toFixed(2)} will be recorded as owed to the customer — refund it manually.`}
            </p>
          )}

          <div className="flex gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (shown to the customer) — e.g. customer called to add a raita"
              maxLength={200}
              className="w-full min-w-0 rounded-lg border border-[#d3daea] bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#10b981] focus:outline-none"
            />
            <button onClick={onClose}
                    className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white">
              Cancel
            </button>
            <button onClick={save} disabled={busy || rows.length === 0}
                    className="shrink-0 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">
              {busy ? 'Saving…' : 'Save & notify customer'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
