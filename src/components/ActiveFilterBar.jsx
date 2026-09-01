import React from "react";

/**
 * The strip that says what the list you are looking at has been narrowed to.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The Orders page carries two entirely separate filter systems: `searchQuery`
 * / `paymentFilter` / `modeFilter` / `dateFilter` for live orders, and
 * `histSearch` / `histStatus` / `histPayment` / `histRider` / `histStartDate`
 * / `histEndDate` for history. Same concepts, different names, different
 * controls, different wording — "Payment Method" on one tab, "Payment" on the
 * other.
 *
 * Both shared a worse problem than the duplication. The controls live in a
 * panel that collapses, and nothing outside that panel indicated a filter was
 * set. An admin who filtered to COD on Tuesday, collapsed the panel, and came
 * back later saw a short list of orders and no reason for it. During service
 * that reads as "the orders have stopped coming in" — the single most
 * alarming thing an operations screen can imply, and it was being caused by a
 * dropdown left in a drawer.
 *
 * So: applied filters are always visible, each is removable where it sits,
 * the result count is stated, and one control clears everything. Rendering
 * nothing when no filter is set keeps the quiet case quiet.
 *
 * @param {{label: string, value: string, onClear: Function}[]} filters
 *        only the filters actually applied
 * @param {number}   resultCount    rows after filtering
 * @param {number}   [totalCount]   rows before filtering, if known
 * @param {Function} onClearAll
 * @param {string}   [noun="orders"]
 */
export const ActiveFilterBar = ({
  filters = [],
  resultCount = 0,
  totalCount = null,
  onClearAll,
  noun = "orders",
}) => {
  const hasFilters = filters.length > 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-slate-600">
        {/* Stated as a fraction when the unfiltered size is known, so a short
            list is immediately legible as "filtered" rather than "quiet". */}
        {hasFilters && totalCount !== null
          ? `Showing ${resultCount} of ${totalCount} ${noun}`
          : `${resultCount} ${noun}`}
      </span>

      {hasFilters && (
        <>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="font-semibold text-slate-500">Filtered by</span>

          {filters.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-2.5 pr-1 font-semibold text-emerald-800"
            >
              <span className="text-emerald-600">{f.label}:</span>
              <span className="max-w-[14rem] truncate">{f.value}</span>
              <button
                type="button"
                onClick={f.onClear}
                aria-label={`Remove ${f.label} filter`}
                title={`Remove ${f.label} filter`}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={onClearAll}
            className="rounded-lg px-2 py-1 font-bold text-rose-600 transition-colors hover:bg-rose-50 hover:underline focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
};

export default ActiveFilterBar;
