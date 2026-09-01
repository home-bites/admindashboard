import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { ReportExportService } from "../services";
import { ExportModal } from "../components/ExportModal";
import { where } from "firebase/firestore";
import * as repos from "../repositories";

/**
 * Row cap for a single report.
 *
 * Every dataset here was read with `getAll()` — the entire collection, no
 * bound. At the scale this dashboard is meant to survive that is 100k order
 * documents downloaded to build a table, and the browser then rendering every
 * row of it. A report is a working document, not an archive dump: a bounded,
 * date-scoped slice is what an operator actually acts on, and the banner says
 * plainly when the cap has truncated the result rather than presenting a
 * partial ledger as a complete one.
 */
const REPORT_ROW_CAP = 1000;

/** Report windows. `all` is still bounded by REPORT_ROW_CAP. */
const RANGES = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

/** Blank cell. Never a plausible-looking default — see `fmtDate`. */
const DASH = "—";

/**
 * A date, or an explicit blank.
 *
 * This used to be `new Date(o.createdAt || Date.now())`, so an order with no
 * stored date was exported as having been placed *today*. In a revenue ledger
 * that is not a cosmetic default, it is a fabricated financial record — and
 * the same pattern gave undated orders a "Paid" payment status, undated
 * customers a join date of today, and every subscription a status of ACTIVE.
 * A missing value is now shown as missing.
 */
const fmtDate = (v, withTime = false) => {
  if (!v) return DASH;
  const d = new Date(typeof v?.toDate === "function" ? v.toDate() : v);
  if (!Number.isFinite(d.getTime())) return DASH;
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
};

const money = (v) => (Number.isFinite(Number(v)) ? `₹${Number(v).toFixed(2)}` : DASH);
const text = (v) => (v === 0 ? "0" : v || DASH);

export const Reports = () => {
  const { addToast } = useUiStore();
  const [datasetScope, setDatasetScope] = useState("sales");
  // Was declared, rendered nowhere and read nowhere: the report silently
  // covered all time no matter what. It now drives the query below and has a
  // control in the header.
  const [range, setRange] = useState("30d");
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const datasetCategories = [
    { id: "sales", label: "Sales & Revenue", icon: "payments" },
    { id: "customers", label: "Customers Directory", icon: "group" },
    { id: "delivery", label: "Rider Fleet & Payouts", icon: "local_shipping" },
    { id: "diet_meals", label: "Diet Meals & Macros", icon: "nutrition" },
    { id: "meal_plans", label: "Meal Plans & Subscriptions", icon: "calendar_month" },
    { id: "coupons", label: "Coupons & Redemptions", icon: "confirmation_number" },
    { id: "wallet", label: "Wallet & Ledger", icon: "account_balance_wallet" },
  ];

  /*
   * One descriptor per dataset button.
   *
   * Previously there were four `if` branches for seven buttons, and the final
   * `else` caught the other three — so "Rider Fleet & Payouts", "Coupons &
   * Redemptions" and "Wallet & Ledger" all produced a table of audit log
   * entries under the heading "HomeBites Operational Dataset". Three of the
   * seven controls returned data unrelated to their label, which is worse
   * than their being missing: an operator exporting a wallet ledger got a
   * file that looked like a report and contained the wrong records.
   *
   * A table keyed by scope makes it structurally impossible for a button to
   * exist without its own dataset — adding a category without an entry here
   * renders an explicit "not available" rather than someone else's data.
   */
  const DATASETS = {
    sales: {
      title: "Sales & Revenue Ledger",
      repo: "orderRepository",
      dateField: "createdAt",
      headers: ["Order ID", "Customer", "Date", "Total", "Payment", "Status"],
      row: (o) => [o.id, text(o.customerName || o.customer), fmtDate(o.createdAt),
        money(o.totalAmount ?? o.total), text(o.paymentStatus), text(o.status)],
    },
    customers: {
      title: "Registered Customers Directory",
      repo: "userRepository",
      dateField: "createdAt",
      headers: ["User ID", "Name", "Email", "Phone", "Orders", "Lifetime Spend", "Joined"],
      row: (u) => [u.id, text(u.displayName || u.name), text(u.email),
        text(u.phone || u.mobileNumber), text(u.totalOrders ?? 0),
        money(u.totalSpent ?? 0), fmtDate(u.createdAt)],
    },
    delivery: {
      title: "Rider Fleet & Payouts",
      repo: "deliveryPartnerRepository",
      dateField: "createdAt",
      headers: ["Rider ID", "Name", "Phone", "Vehicle", "Online", "Rating", "Deliveries", "Joined"],
      row: (r) => [r.id, text(r.name), text(r.phone), text(r.vehicleType),
        r.isOnline ? "Yes" : "No", text(r.rating), text(r.totalDeliveries ?? 0),
        fmtDate(r.createdAt)],
    },
    diet_meals: {
      title: "Diet Meals & Macro Audit",
      repo: "dietFoodRepository",
      dateField: "createdAt",
      headers: ["Food ID", "Meal", "Category", "kcal", "Protein g", "Carbs g", "Fats g", "Price"],
      row: (d) => [d.id, text(d.name), text(d.categoryName), text(d.calories),
        text(d.proteinGrams), text(d.carbsGrams), text(d.fatsGrams),
        money(d.discountedPrice ?? d.price)],
    },
    meal_plans: {
      title: "Meal Plans & Subscriptions",
      repo: "subscriptionRepository",
      dateField: "createdAt",
      headers: ["Subscription ID", "Subscriber", "Plan", "Duration", "Price", "Status", "Started"],
      row: (s) => [s.id, text(s.userName || s.userId), text(s.planTitle),
        s.durationDays ? `${s.durationDays} days` : DASH, money(s.price),
        text(s.status), fmtDate(s.createdAt)],
    },
    coupons: {
      title: "Coupons & Redemptions",
      repo: "couponRepository",
      dateField: "createdAt",
      headers: ["Code", "Type", "Value", "Min Order", "Used", "Limit", "Active", "Expires"],
      row: (c) => [text(c.code), text(c.discountType), text(c.discountValue),
        money(c.minOrderValue ?? 0), text(c.usedCount ?? 0), text(c.usageLimit),
        c.isActive ? "Yes" : "No", fmtDate(c.expiryDate ?? c.validUntil)],
    },
    wallet: {
      title: "Wallet & Ledger",
      repo: "walletTransactionRepository",
      dateField: "createdAt",
      headers: ["Txn ID", "Customer", "Type", "Amount", "Balance After", "Reason", "Date"],
      row: (t) => [t.id, text(t.userId), text(t.type), money(t.amount),
        money(t.balanceAfter), text(t.reason || t.description), fmtDate(t.createdAt, true)],
    },
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setReportError(null);
    setReportData(null);

    const spec = DATASETS[datasetScope];
    if (!spec) {
      setReportError(`No dataset is defined for "${datasetScope}".`);
      setGenerating(false);
      return;
    }

    try {
      const days = RANGES.find((r) => r.id === range)?.days;
      const constraints = [];
      if (days) {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        // `createdAt` is written as an ISO string by BaseRepository.create, so
        // a string comparison is a valid range filter and sorts correctly.
        constraints.push(where(spec.dateField, ">=", since));
      }

      const { items, hasMore } = await repos[spec.repo].getPage({
        limitTo: REPORT_ROW_CAP,
        orderByField: spec.dateField,
        direction: "desc",
        constraints,
      });

      setReportData({
        title: spec.title,
        headers: spec.headers,
        rows: items.map(spec.row),
        truncated: hasMore,
      });
      addToast("Report compiled", "success");
    } catch (e) {
      // A failed report used to surface only as a toast, leaving the previous
      // table on screen and no indication the numbers were stale.
      setReportError(
        e?.code === "failed-precondition"
          ? "This report needs a Firestore index that has not been created yet. The exact index is named in the browser console."
          : e?.message || "Failed to compile the report.",
      );
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetScope, range]);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Executive Reports &amp; Exports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Compile comprehensive operational, financial, and nutrition ledgers with 1-click export.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* The range now actually scopes the query. */}
          <label className="sr-only" htmlFor="report-range">Report period</label>
          <select
            id="report-range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>

          {reportData && reportData.rows.length > 0 && (
            <button
              onClick={() => setIsExportOpen(true)}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export PDF / Excel / CSV
            </button>
          )}
        </div>
      </div>

      {/* An export that silently stops at the cap would be read as a complete
          ledger. Say so before it is downloaded, not after. */}
      {reportData?.truncated && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-amber-500">info</span>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong className="font-bold">Showing the newest {REPORT_ROW_CAP} rows.</strong>{" "}
            More records match this period. Narrow the period for a complete export.
          </p>
        </div>
      )}

      {/* Dataset Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {datasetCategories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setDatasetScope(cat.id)}
            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
              datasetScope === cat.id
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold ring-2 ring-emerald-500/20"
                : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{cat.icon}</span>
            <span className="text-[11px] leading-tight">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Compiled Data Table Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        
        {/* Table Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{reportData?.title || "Compiled Dataset"}</h3>
            <p className="text-xs text-slate-400">Total compiled rows: {reportData?.rows?.length || 0}</p>
          </div>
          {reportData && reportData.rows.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => ReportExportService.exportCSV(reportData.title, reportData.headers, reportData.rows)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                CSV
              </button>
              <button
                onClick={() => ReportExportService.exportExcel(reportData.title, reportData.headers, reportData.rows)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Excel
              </button>
              <button
                onClick={() => ReportExportService.exportPDF(reportData.title, reportData.headers, reportData.rows)}
                className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/20"
              >
                PDF Print
              </button>
            </div>
          )}
        </div>

        {generating ? (
          <div className="flex justify-center py-20 text-slate-400 gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Compiling report dataset...</span>
          </div>
        ) : reportData && reportData.rows.length > 0 ? (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  {reportData.headers.map((h, i) => (
                    <th key={i} className="p-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`p-3.5 ${cIdx === 0 ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : reportError ? (
          // A failed query must not read as "this period had no business".
          <div className="py-16 text-center">
            <span className="material-symbols-outlined text-[28px] text-rose-500">error</span>
            <p className="mt-2 text-sm font-bold text-rose-600 dark:text-rose-400">Could not compile this report</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{reportError}</p>
            <button
              onClick={handleGenerate}
              className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="py-20 text-center">
            <p className="text-sm font-semibold text-slate-500">No records in this period</p>
            <p className="mt-1 text-xs text-slate-400">
              Nothing matched {RANGES.find((r) => r.id === range)?.label.toLowerCase()}. Try a wider period.
            </p>
          </div>
        )}

      </div>

      {/* Export Modal */}
      {reportData && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title={reportData.title}
          headers={reportData.headers}
          data={reportData.rows}
          defaultFilename={datasetScope}
        />
      )}

    </div>
  );
};
export default Reports;

