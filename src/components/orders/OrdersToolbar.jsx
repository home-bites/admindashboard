import React from "react";
import {
  STATUS_TABS, PAYMENT_FILTERS, ORDER_TYPE_FILTERS, DATE_FILTERS,
  PAYMENT_LABEL, ORDER_TYPE_LABEL,
} from "../../lib/orderPresentation";

/**
 * The Orders workspace's single navigation and filtering surface.
 *
 * ── What this replaces ───────────────────────────────────────────────────
 *
 * Two competing rows of status chips. The first held the six kitchen stages;
 * the second held All, Delivered, Cancelled, Awaiting Payment, Payment Failed
 * and Refund Required. Between them "Cancelled" appeared twice and
 * "Completed"/"Delivered" were the same orders under two names, and the two
 * rows disagreed about which was the real status selector.
 *
 * The deeper fault was mixing axes. A stage says where the food is; a payment
 * state says where the money is. They are independent — an order can be
 * cancelled *and* awaiting a refund — so putting both in one exclusive
 * selector makes some combinations unreachable: choosing "Cancelled" hid the
 * refund queue and choosing "Refund Required" hid the fact they were
 * cancelled.
 *
 * Now: one status row, and payment as a filter alongside type, date and
 * rider. Every combination is reachable, nothing is duplicated, and the counts
 * on the tabs are computed with the same predicate the list uses, so a tab can
 * never read "(3)" and open empty.
 */
export const OrdersToolbar = ({
  status, onStatus, counts,
  search, onSearch, searching,
  payment, onPayment,
  type, onType,
  dateRange, onDateRange,
  customFrom, customTo, onCustomFrom, onCustomTo,
  partner, onPartner, partners = [],
  resultCount, totalCount,
  onClearAll,
}) => {
  /* Chips describe only filters that are actually applied. Status is not
     among them: it is always set to something and is already visible as the
     selected tab, so listing it here would be the same information twice. */
  const chips = [
    search && { key: "search", label: "Search", value: search, clear: () => onSearch("") },
    payment && { key: "payment", label: "Payment", value: PAYMENT_LABEL[payment], clear: () => onPayment(null) },
    type && { key: "type", label: "Type", value: ORDER_TYPE_LABEL[type], clear: () => onType(null) },
    dateRange && {
      key: "date", label: "Date",
      value: DATE_FILTERS.find((d) => d.id === dateRange)?.label || dateRange,
      clear: () => onDateRange(null),
    },
    partner && {
      key: "partner", label: "Rider",
      value: partners.find((p) => p.id === partner)?.name || partner,
      clear: () => onPartner(null),
    },
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      {/* ── Status: the one status axis ──────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Order status"
        className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      >
        {STATUS_TABS.map((tab) => {
          const active = status === tab.id;
          const n = counts?.[tab.id ?? "all"] ?? 0;
          return (
            <button
              key={tab.label}
              role="tab"
              aria-selected={active}
              onClick={() => onStatus(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : n === 0
                    ? "text-slate-400 hover:bg-slate-50"
                    : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
              <span
                className={`rounded px-1 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/20" : "bg-slate-100 text-slate-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Filters: search, payment, type, date, rider ──────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="relative min-w-0 flex-1 basis-64">
          <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Order ID, customer, phone or item…"
            aria-label="Search orders"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500"
          />
          {searching && (
            <span className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          )}
        </div>

        <Select label="Payment" value={payment} onChange={onPayment} options={PAYMENT_FILTERS} />
        <Select label="Type" value={type} onChange={onType} options={ORDER_TYPE_FILTERS} />
        <Select label="Date" value={dateRange} onChange={onDateRange} options={DATE_FILTERS} />
        <Select
          label="Rider"
          value={partner}
          onChange={onPartner}
          options={[{ id: null, label: "All riders" }, ...partners.map((p) => ({ id: p.id, label: p.name }))]}
        />

        {dateRange === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)}
                   aria-label="From date"
                   className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs outline-none focus:border-emerald-500" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)}
                   aria-label="To date"
                   className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs outline-none focus:border-emerald-500" />
          </div>
        )}
      </div>

      {/* ── Applied filters and the resulting count ──────────────────── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold tabular-nums text-slate-600">
          {chips.length > 0 && totalCount != null
            ? `${resultCount} of ${totalCount} orders`
            : `${resultCount} order${resultCount === 1 ? "" : "s"}`}
        </span>

        {chips.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-2.5 pr-1 font-semibold text-emerald-800"
          >
            <span className="text-emerald-600">{c.label}:</span>
            <span className="max-w-[12rem] truncate">{c.value}</span>
            <button
              onClick={c.clear}
              aria-label={`Remove ${c.label} filter`}
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-emerald-700 outline-none transition-colors hover:bg-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          </span>
        ))}

        {chips.length > 0 && (
          <button
            onClick={onClearAll}
            className="rounded-lg px-2 py-1 font-bold text-rose-600 outline-none transition-colors hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
};

/** One dropdown style for the whole toolbar. `null` is encoded as "" because
 *  a DOM select value is always a string. */
const Select = ({ label, value, onChange, options }) => (
  <label className="inline-flex shrink-0 items-center">
    <span className="sr-only">{label}</span>
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`cursor-pointer rounded-lg border py-2 pl-2.5 pr-7 text-xs font-medium outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 ${
        value
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {options.map((o) => (
        <option key={String(o.id)} value={o.id ?? ""}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

export default OrdersToolbar;
