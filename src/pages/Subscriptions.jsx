import React, { useEffect, useMemo, useState } from "react";
import { useLiveCollection } from "../hooks/useLiveCollection";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import * as repos from "../repositories";

/**
 * Subscriptions.
 *
 * This page was a mockup. 220 lines of hardcoded MUI showing "124 Active
 * Plans", "48 Today's Deliveries" and "₹45K Monthly Revenue" — none of it
 * read from anywhere — plus `renderTablePlaceholder` for every table. It was
 * also the only page in the dashboard using MUI rather than Tailwind, which
 * is why it alone produced `Received true for a non-boolean attribute item`.
 *
 * Rewritten against the collections that actually exist:
 *
 *   subscriptions                 the plan a customer bought, and its status
 *   mealPlans                     plan definitions (title, price, duration)
 *   users                         customer name, phone
 *   subscriptionMealSelections    what the customer chose, per day and slot
 *
 * Everything is live. Subscription status is written by Cloud Functions —
 * razorpayWebhook activates on capture, pauseSubscription and
 * skipSubscriptionDay on customer action — so a one-shot read would show an
 * operator a state the backend had already moved on from.
 */

const SLOT_LABEL = {
  breakfast: "Morning",
  lunch: "Afternoon",
  snacks: "Evening",
  dinner: "Night",
};

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-sky-50 text-sky-700 border-sky-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Firestore Timestamp, ISO string or millis — all reach this page. */
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") return new Date(v);
  if (v.seconds !== undefined) return new Date(v.seconds * 1000);
  return null;
}

const fmtDate = (v) => {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
};

/** Today in IST, matching the selection ids the customer app builds. */
const istToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

function StatusChip({ status }) {
  const key = String(status || "pending").toLowerCase();
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[key] || STATUS_STYLES.pending}`}>
      {status || "Pending"}
    </span>
  );
}

function Stat({ label, value, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900 dark:text-white",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-black tracking-tight ${tones[tone]}`}>{value}</p>
    </div>
  );
}

export const Subscriptions = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();

  const { data: subscriptions, loading, error } = useLiveCollection("subscriptionRepository");
  const { data: plans } = useLiveCollection("mealPlanRepository");
  const { data: customers } = useLiveCollection("userRepository");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [selections, setSelections] = useState({});   // subId -> rows
  const [selectionsBusy, setSelectionsBusy] = useState(false);
  const [actingId, setActingId] = useState(null);

  // Bulk selection. Held as a Set of ids rather than a flag on each row so
  // that filtering the table doesn't silently drop a ticked row from the
  // pending action — you can search, tick, search again, and still delete
  // what you ticked.
  const [checked, setChecked] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (error) addToast(`Live updates stopped: ${error}`, "error");
  }, [error, addToast]);

  const planById = useMemo(
    () => Object.fromEntries(plans.map((p) => [p.id, p])),
    [plans]
  );
  const customerById = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );

  const enriched = useMemo(() => {
    return subscriptions.map((s) => {
      const plan = planById[s.planId] || {};
      // userId and customerId are both in use — the rules accept either, so
      // the dashboard has to look under both or half the rows show "Unknown".
      const cust = customerById[s.userId || s.customerId] || {};
      return {
        ...s,
        _planTitle: plan.title || s.planTitle || "—",
        _planPrice: s.amount ?? s.price ?? plan.discountedPrice ?? plan.price ?? 0,
        _customerName: cust.name || cust.displayName || s.customerName || "Unknown customer",
        _customerPhone: cust.phone || s.customerMobile || s.customerPhone || "—",
        _statusKey: String(s.status || "Pending").toLowerCase(),
        _paidKey: String(s.paymentStatus || "").toLowerCase(),
      };
    });
  }, [subscriptions, planById, customerById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((s) => statusFilter === "ALL" || s._statusKey === statusFilter.toLowerCase())
      .filter((s) => {
        if (paymentFilter === "ALL") return true;
        // "Unpaid" is the operationally interesting bucket: these are the
        // plans an admin may need to pause.
        const paid = s._paidKey === "paid" || s._paidKey === "verified";
        return paymentFilter === "PAID" ? paid : !paid;
      })
      .filter((s) =>
        !q ||
        s._customerName.toLowerCase().includes(q) ||
        String(s._customerPhone).includes(q) ||
        s._planTitle.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      )
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
  }, [enriched, statusFilter, paymentFilter, search]);

  const stats = useMemo(() => {
    const active = enriched.filter((s) => s._statusKey === "active");
    const unpaid = enriched.filter(
      (s) => !["paid", "verified"].includes(s._paidKey) && s._statusKey !== "cancelled"
    );
    // Revenue counts only money actually captured. Summing every row would
    // report pending and failed payments as income.
    const collected = enriched
      .filter((s) => ["paid", "verified"].includes(s._paidKey))
      .reduce((t, s) => t + Number(s._planPrice || 0), 0);
    return {
      active: active.length,
      paused: enriched.filter((s) => s._statusKey === "paused").length,
      unpaid: unpaid.length,
      collected,
    };
  }, [enriched]);

  /**
   * Meal selections are loaded per subscription, on expand.
   *
   * Deliberately not a live subscription across the whole collection: with a
   * few hundred subscribers over a month-long plan this collection runs to
   * tens of thousands of documents, and streaming all of them to hydrate a
   * table nobody has opened would be slow and expensive.
   */
  async function loadSelections(subId) {
    if (selections[subId]) return;
    setSelectionsBusy(true);
    try {
      const rows = await repos.subscriptionMealSelectionRepository.getAll();
      const mine = rows
        .filter((r) => r.subscriptionId === subId)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setSelections((prev) => ({ ...prev, [subId]: mine }));
    } catch (e) {
      addToast(`Could not load meal selections: ${e.message}`, "error");
      setSelections((prev) => ({ ...prev, [subId]: [] }));
    } finally {
      setSelectionsBusy(false);
    }
  }

  function toggleExpand(subId) {
    if (expandedId === subId) { setExpandedId(null); return; }
    setExpandedId(subId);
    loadSelections(subId);
  }

  /**
   * Admin pause, for a plan whose payment never landed.
   *
   * Writes directly rather than calling `pauseSubscription`: that callable
   * verifies the caller *owns* the subscription, which an admin never does.
   * The rules allow an admin to write status here, and the audit entry
   * records who did it — an operator suspending someone's meals is exactly
   * the kind of action that needs a name attached.
   */
  async function adminSetStatus(sub, nextStatus) {
    const verb = nextStatus === "Paused" ? "pause" : "resume";
    if (!window.confirm(
      `${verb === "pause" ? "Pause" : "Resume"} ${sub._customerName}'s ` +
      `"${sub._planTitle}" subscription?`
    )) return;

    setActingId(sub.id);
    try {
      await repos.subscriptionRepository.update(sub.id, {
        status: nextStatus,
        ...(nextStatus === "Paused"
          ? { pausedAt: new Date().toISOString(), pauseReason: "Paused by admin — payment not received" }
          : { resumedAt: new Date().toISOString() }),
      });
      await repos.auditLogRepository.logAction(
        user?.uid || "system",
        "subscriptions",
        nextStatus === "Paused" ? "SUBSCRIPTION_ADMIN_PAUSE" : "SUBSCRIPTION_ADMIN_RESUME",
        { subscriptionId: sub.id, customer: sub._customerName }
      );
      addToast(`Subscription ${verb}d.`, "success");
    } catch (e) {
      addToast(`Could not ${verb}: ${e.message}`, "error");
    } finally {
      setActingId(null);
    }
  }

  /* ── bulk selection and deletion ───────────────────────────────────────
   *
   * `BaseRepository.delete` is a soft delete: it sets `isDeleted: true` and
   * stamps who did it, and every reader filters those out. That matters here
   * more than anywhere else in the dashboard. A subscription row carries the
   * Razorpay payment id and the amount captured — it is a financial record
   * with a statutory retention period, and hard-deleting it would break
   * reconciliation against the Razorpay settlement report.
   *
   * So "delete" here means "remove from the dashboard", and the data survives
   * for accounting. The confirmation text says so, because an operator who
   * believes they have destroyed a record and an operator who has hidden one
   * make different decisions afterwards.
   */

  const toggleChecked = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allVisibleChecked = filtered.length > 0 && filtered.every((s) => checked.has(s.id));

  const toggleAllVisible = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      // Acts on what's on screen, not the whole collection. A "select all"
      // that silently included rows hidden by a filter would be a trap.
      if (allVisibleChecked) filtered.forEach((s) => next.delete(s.id));
      else filtered.forEach((s) => next.add(s.id));
      return next;
    });
  };

  async function softDeleteMany(ids, label) {
    setBulkBusy(true);
    let done = 0;
    const failures = [];

    for (const id of ids) {
      try {
        await repos.subscriptionRepository.delete(id);
        done++;
      } catch (e) {
        failures.push(`${id}: ${e.message}`);
      }
    }

    // Logged as one entry naming the count, not one per row — a bulk action
    // is a single decision and should read as one in the audit trail.
    await repos.auditLogRepository.logAction(
      user?.uid || "system",
      "subscriptions",
      "SUBSCRIPTION_BULK_DELETE",
      { requested: ids.length, deleted: done, scope: label }
    );

    setChecked(new Set());
    setBulkBusy(false);

    if (failures.length) {
      console.error("[subscriptions] bulk delete failures:", failures);
      addToast(`Removed ${done} of ${ids.length}. ${failures.length} failed — see console.`, "error");
    } else {
      addToast(`Removed ${done} subscription${done === 1 ? "" : "s"}.`, "success");
    }
  }

  function deleteSelected() {
    const ids = filtered.filter((s) => checked.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return;

    const paidCount = filtered.filter(
      (s) => checked.has(s.id) && ["paid", "verified"].includes(s._paidKey)
    ).length;
    const activeCount = filtered.filter(
      (s) => checked.has(s.id) && s._statusKey === "active"
    ).length;

    // The counts that should give someone pause are stated plainly. "Delete 12
    // subscriptions?" and "12 subscriptions, 9 of them paid and 7 still
    // running" are very different questions.
    const warning =
      `Remove ${ids.length} subscription${ids.length === 1 ? "" : "s"} from the dashboard?\n\n` +
      (paidCount ? `• ${paidCount} of these have a captured payment\n` : "") +
      (activeCount ? `• ${activeCount} are still ACTIVE — meals stop appearing for those customers\n` : "") +
      `\nRecords are retained for accounting and can be restored by support.`;

    if (!window.confirm(warning)) return;
    softDeleteMany(ids, "selected");
  }

  function deleteAll() {
    const ids = filtered.map((s) => s.id);
    if (ids.length === 0) return;

    const scope = statusFilter === "ALL" && paymentFilter === "ALL" && !search.trim()
      ? "EVERY subscription in the system"
      : `all ${ids.length} subscriptions matching the current filters`;

    // A free-text confirmation, not just an OK button. This is the one action
    // on the page that can clear the whole collection, and a reflexive Enter
    // on a native confirm() is far too cheap for that.
    const typed = window.prompt(
      `This will remove ${scope}.\n\n` +
      `Records are soft-deleted and retained for accounting.\n\n` +
      `Type DELETE to confirm:`
    );
    if (typed !== "DELETE") {
      if (typed !== null) addToast("Cancelled — confirmation text did not match.", "info");
      return;
    }
    softDeleteMany(ids, scope);
  }

  const selectedCount = filtered.filter((s) => checked.has(s.id)).length;
  const today = istToday();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subscriptions</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Every meal plan, its payment state, and the dishes each customer chose. Updates live.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Active plans" value={stats.active} tone="emerald" />
        <Stat label="Paused" value={stats.paused} tone="amber" />
        <Stat label="Payment pending" value={stats.unpaid} tone={stats.unpaid ? "red" : "slate"} />
        <Stat label="Collected" value={inr(stats.collected)} />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col lg:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, phone, plan or subscription id…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:border-emerald-400"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold outline-none"
        >
          {["ALL", "Active", "Paused", "Pending", "Cancelled", "Failed"].map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold outline-none"
        >
          <option value="ALL">All payments</option>
          <option value="PAID">Paid</option>
          <option value="UNPAID">Payment pending</option>
        </select>
      </div>

      {/* Bulk actions. Only rendered when there is something to act on, so
          destructive buttons aren't sitting on screen by default. */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 px-4 py-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleChecked}
              onChange={toggleAllVisible}
              className="w-4 h-4 rounded accent-emerald-500"
            />
            Select all {filtered.length} shown
          </label>

          {selectedCount > 0 && (
            <span className="text-xs font-bold text-emerald-600">{selectedCount} selected</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={deleteSelected}
              disabled={selectedCount === 0 || bulkBusy}
              className="px-3.5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bulkBusy ? "Removing…" : `Delete selected${selectedCount ? ` (${selectedCount})` : ""}`}
            </button>
            <button
              onClick={deleteAll}
              disabled={bulkBusy}
              className="px-3.5 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs font-bold disabled:opacity-40"
            >
              Delete all shown
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400 gap-2">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading subscriptions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 py-20 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-300">event_repeat</span>
          <p className="mt-2 font-bold text-slate-700 dark:text-slate-200 text-sm">
            {subscriptions.length === 0 ? "No subscriptions yet" : "Nothing matches these filters"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {subscriptions.length === 0
              ? "Plans appear here as soon as a customer's payment is captured."
              : "Try widening the status or payment filter."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pl-5 pr-2 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={allVisibleChecked}
                      onChange={toggleAllVisible}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                  </th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Plan</th>
                  <th className="px-5 py-3 font-bold">Period</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Payment</th>
                  <th className="px-5 py-3 font-bold text-right">Amount</th>
                  <th className="px-5 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((s) => {
                  const paid = ["paid", "verified"].includes(s._paidKey);
                  const rows = selections[s.id];
                  const isOpen = expandedId === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <tr className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${checked.has(s.id) ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`}>
                        <td className="pl-5 pr-2 py-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${s._customerName}'s subscription`}
                            checked={checked.has(s.id)}
                            onChange={() => toggleChecked(s.id)}
                            className="w-4 h-4 rounded accent-emerald-500"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-800 dark:text-slate-100">{s._customerName}</p>
                          <p className="text-xs text-slate-400">{s._customerPhone}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-700 dark:text-slate-200">{s._planTitle}</p>
                          <p className="text-xs text-slate-400">{s.id}</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {fmtDate(s.startDate)} → {fmtDate(s.endDate)}
                          {Number(s.pausedDaysTotal) > 0 && (
                            <span className="block text-amber-600 font-semibold">
                              +{s.pausedDaysTotal} day(s) banked
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4"><StatusChip status={s.status} /></td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-bold ${paid ? "text-emerald-600" : "text-red-600"}`}>
                            {paid ? "Paid" : (s.paymentStatus || "Pending")}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-100">
                          {inr(s._planPrice)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleExpand(s.id)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-emerald-400"
                            >
                              {isOpen ? "Hide meals" : "View meals"}
                            </button>
                            {s._statusKey === "active" && (
                              <button
                                disabled={actingId === s.id}
                                onClick={() => adminSetStatus(s, "Paused")}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50"
                              >
                                Pause
                              </button>
                            )}
                            {s._statusKey === "paused" && (
                              <button
                                disabled={actingId === s.id}
                                onClick={() => adminSetStatus(s, "Active")}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                              >
                                Resume
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                          <td colSpan={8} className="px-5 py-4">
                            {selectionsBusy && !rows ? (
                              <p className="text-xs text-slate-400">Loading meal selections…</p>
                            ) : !rows || rows.length === 0 ? (
                              <p className="text-xs text-slate-400">
                                This customer hasn't chosen any meals yet.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {Object.entries(
                                  rows.reduce((acc, r) => {
                                    (acc[r.date] ||= []).push(r);
                                    return acc;
                                  }, {})
                                ).map(([date, dayRows]) => (
                                  <div key={date} className="flex flex-wrap items-center gap-2">
                                    <span className={`w-28 shrink-0 text-xs font-bold ${date === today ? "text-emerald-600" : "text-slate-500"}`}>
                                      {date}{date === today ? " (today)" : ""}
                                    </span>
                                    {dayRows.map((r) => (
                                      <span
                                        key={r.id}
                                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                                          String(r.status).toLowerCase() === "skipped"
                                            ? "bg-slate-100 text-slate-400 border-slate-200 line-through"
                                            : "bg-white text-slate-700 border-slate-200"
                                        }`}
                                      >
                                        <span className="text-slate-400">{SLOT_LABEL[r.slot] || r.slot}:</span>{" "}
                                        {r.mealNameSnapshot || r.mealId}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
