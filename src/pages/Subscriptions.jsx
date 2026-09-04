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

function SubscriptionTimeline({ subscription, selections }) {
  if (!subscription.startDate || !subscription.endDate) return null;

  const start = toDate(subscription.startDate);
  const end = toDate(subscription.endDate);
  const skippedDates = subscription.skippedDates || [];
  const pausedDates = subscription.pausedDates || [];
  const pausedAt = subscription.pausedAt ? toDate(subscription.pausedAt) : null;
  const resumedAt = subscription.resumedAt ? toDate(subscription.resumedAt) : null;

  // Generate date range
  const dates = [];
  let current = new Date(start);
  // Ensure we don't loop forever if dates are weird
  let limit = 0;
  while (current <= end && limit < 365) {
    const dStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(current);
    dates.push(dStr);
    current.setDate(current.getDate() + 1);
    limit++;
  }

  // Get active meal dates
  const activeMeals = new Set();
  if (selections) {
    selections.forEach(sel => {
      const status = String(sel.status || "").toLowerCase();
      if (status !== "skipped" && status !== "cancelled") {
        activeMeals.add(sel.date);
      }
    });
  }

  // Generate a date string for today to check if pausedAt is currently active
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let currentPausedDates = [];
  if (pausedAt) {
    let curr = new Date(pausedAt);
    let endPaused = new Date();
    while (curr <= endPaused) {
      currentPausedDates.push(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(curr));
      curr.setDate(curr.getDate() + 1);
    }
  }

  return (
    <div className="mt-6 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-5">Subscription Timeline & Calendar</h4>
      
      <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 gap-1.5 mb-5">
        {dates.map((d) => {
          const isSkipped = skippedDates.includes(d);
          const isHistoricalPaused = pausedDates.includes(d);
          const isCurrentlyPaused = currentPausedDates.includes(d);
          const isPaused = isHistoricalPaused || isCurrentlyPaused;
          const hasMeal = activeMeals.has(d);
          
          let bgColor = "bg-slate-100 dark:bg-slate-800 text-slate-400";
          if (isSkipped) bgColor = "bg-amber-400 text-amber-900 opacity-60"; // Skipped is amber
          else if (isPaused) bgColor = "bg-yellow-400 text-yellow-900"; // Paused is yellow
          else if (hasMeal) bgColor = "bg-emerald-400 text-emerald-900"; // Booked is green

          let ring = "";
          if (resumedAt && d === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(resumedAt)) {
             ring = "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900"; // Resume is blue ring
          }

          const dayNum = parseInt(d.split("-")[2], 10);

          return (
            <div key={d} title={d} className={`h-9 rounded-lg flex items-center justify-center text-xs font-black ${bgColor} ${ring} transition-all hover:scale-110 cursor-default`}>
              {dayNum}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs mb-6">
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-400"></div><span className="font-bold text-slate-600 dark:text-slate-400">Active Meals</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-amber-400"></div><span className="font-bold text-slate-600 dark:text-slate-400">Skipped/Paused</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700"></div><span className="font-bold text-slate-600 dark:text-slate-400">No Meals</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded border-2 border-blue-500 border-dashed"></div><span className="font-bold text-slate-600 dark:text-slate-400">Paused/Resumed Event</span></div>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Banked Days</p>
          <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{subscription.pausedDaysTotal || 0} day(s)</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Skipped Days</p>
          <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{skippedDates.length} day(s)</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Paused At</p>
          <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{pausedAt ? fmtDate(pausedAt) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Resumed At</p>
          <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{resumedAt ? fmtDate(resumedAt) : "—"}</p>
        </div>
      </div>
    </div>
  );
}

export const Subscriptions = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();

  const { data: subscriptions, loading, error } = useLiveCollection("subscriptionRepository");
  const { data: plans } = useLiveCollection("mealPlanRepository");
  /*
   * Customers are fetched by id, not streamed.
   *
   * This was `useLiveCollection("userRepository")` — a live subscription to
   * the entire users collection — whose only purpose is the `customerById`
   * lookup below, used to show a subscriber's name. At ten thousand customers
   * that is ten thousand documents streamed and re-streamed on every profile
   * write anywhere in the business, to render a column of names.
   *
   * Only the customers who actually hold a subscription are needed, and that
   * set is bounded by the subscription list itself. They are read once each
   * and cached for the life of the page.
   */
  const [customerById, setCustomerById] = useState({});
  const { data: appSettings } = useLiveCollection("appSettingsRepository");

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

  // Daily ordering status
  const dailyOrderingStatus = useMemo(() => {
    return appSettings.find(s => s.id === "dailyOrderingStatus") || {};
  }, [appSettings]);

  const toggleSlotStatus = async (slot) => {
    try {
      const current = dailyOrderingStatus[slot] !== false; // defaults to true
      await repos.appSettingsRepository.update("dailyOrderingStatus", {
        [slot]: !current,
        updatedAt: new Date().toISOString(),
      });
      addToast(`Updated ordering status for ${slot}`, "success");
    } catch (e) {
      if (e.message?.includes("No document to update")) {
        // If it doesn't exist yet, create it using set() so we control the ID
        await repos.appSettingsRepository.set("dailyOrderingStatus", {
          id: "dailyOrderingStatus",
          [slot]: false,
          updatedAt: new Date().toISOString(),
        });
        addToast(`Updated ordering status for ${slot}`, "success");
      } else {
        addToast(`Failed to update status: ${e.message}`, "error");
      }
    }
  };

  useEffect(() => {
    if (error) addToast(`Live updates stopped: ${error}`, "error");
  }, [error, addToast]);

  const planById = useMemo(
    () => Object.fromEntries(plans.map((p) => [p.id, p])),
    [plans]
  );
  useEffect(() => {
    const wanted = [
      ...new Set(
        subscriptions
          .map((s) => s.userId || s.customerId)
          .filter(Boolean),
      ),
    ].filter((id) => !customerById[id]);
    if (wanted.length === 0) return;

    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(
        wanted.map((id) =>
          repos.userRepository.getById(id).catch(() => null),
        ),
      );
      if (cancelled) return;
      setCustomerById((prev) => {
        const next = { ...prev };
        wanted.forEach((id, i) => {
          // Cache the miss too, so a deleted customer is not re-requested on
          // every render for the life of the session.
          next[id] = fetched[i] || { id, _missing: true };
        });
        return next;
      });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptions]);

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
      const rows = await repos.subscriptionMealSelectionRepository.findByField("subscriptionId", subId);
      const mine = rows
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

  /* ── subscription editing and plan management ─────────────────────────
   *
   * Admins can adjust the customer's plan (upgrade/downgrade), extend duration
   * / end date, adjust covered slots, and add operational notes. Every change
   * captures a before/after snapshot in `adminHistory` on the document and
   * writes an audit log, preserving full historical and financial traceability.
   */
  const [editingSub, setEditingSub] = useState(null);
  const [editForm, setEditForm] = useState({
    planId: "",
    planTitle: "",
    subscriptionType: "diet",
    endDate: "",
    durationDays: 7,
    coveredSlots: ["breakfast", "lunch", "snacks", "dinner"],
    mealsPerDay: 3,
    specialInstructions: "",
    reason: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const toIsoDateString = (v) => {
    const d = toDate(v);
    if (!d) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addDaysToDateString = (dateStr, days) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const openEditModal = (sub) => {
    const plan = planById[sub.planId] || {};
    setEditingSub(sub);
    setEditForm({
      planId: sub.planId || "",
      planTitle: sub._planTitle || plan.title || "",
      subscriptionType: sub.subscriptionType || plan.subscriptionType || "diet",
      endDate: toIsoDateString(sub.endDate),
      durationDays: sub.durationDays || plan.durationDays || 7,
      coveredSlots: Array.isArray(sub.coveredSlots) && sub.coveredSlots.length > 0 
        ? [...sub.coveredSlots] 
        : (Array.isArray(plan.coveredSlots) ? [...plan.coveredSlots] : ["breakfast", "lunch", "snacks", "dinner"]),
      mealsPerDay: sub.mealsPerDay || plan.mealsPerDay || 3,
      specialInstructions: sub.specialInstructions || "",
      reason: "",
    });
  };

  const handleSaveSubscriptionEdit = async () => {
    if (!editingSub) return;
    if (!editForm.reason.trim()) {
      addToast("Please provide an audit reason for modifying this subscription.", "error");
      return;
    }
    if (!editForm.endDate) {
      addToast("Please select a valid end date.", "error");
      return;
    }
    if (!editForm.coveredSlots || editForm.coveredSlots.length === 0) {
      addToast("At least one meal slot must be selected.", "error");
      return;
    }

    setIsSavingEdit(true);
    try {
      const currentHistory = Array.isArray(editingSub.adminHistory) ? editingSub.adminHistory : [];
      const historyEntry = {
        timestamp: new Date().toISOString(),
        adminUid: user?.uid || "admin",
        adminEmail: user?.email || "admin",
        reason: editForm.reason.trim(),
        previousState: {
          planId: editingSub.planId || null,
          planTitle: editingSub._planTitle || null,
          endDate: editingSub.endDate || null,
          durationDays: editingSub.durationDays || null,
          coveredSlots: editingSub.coveredSlots || null,
          mealsPerDay: editingSub.mealsPerDay || null,
        },
        newState: {
          planId: editForm.planId,
          planTitle: editForm.planTitle,
          subscriptionType: editForm.subscriptionType,
          endDate: editForm.endDate,
          durationDays: Number(editForm.durationDays) || editingSub.durationDays || 7,
          coveredSlots: editForm.coveredSlots,
          mealsPerDay: Number(editForm.mealsPerDay) || 3,
          specialInstructions: editForm.specialInstructions.trim(),
        }
      };

      await repos.subscriptionRepository.update(editingSub.id, {
        planId: editForm.planId,
        planTitle: editForm.planTitle,
        subscriptionType: editForm.subscriptionType,
        endDate: editForm.endDate,
        durationDays: Number(editForm.durationDays) || editingSub.durationDays || 7,
        coveredSlots: editForm.coveredSlots,
        mealsPerDay: Number(editForm.mealsPerDay) || 3,
        specialInstructions: editForm.specialInstructions.trim(),
        adminHistory: [...currentHistory, historyEntry],
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid || "admin",
      });

      await repos.auditLogRepository.logAction(
        user?.uid || "system",
        "subscriptions",
        "SUBSCRIPTION_ADMIN_EDIT",
        {
          subscriptionId: editingSub.id,
          customer: editingSub._customerName,
          previousPlan: editingSub._planTitle,
          newPlan: editForm.planTitle,
          previousEndDate: editingSub.endDate,
          newEndDate: editForm.endDate,
          reason: editForm.reason.trim(),
        }
      );

      addToast("Subscription updated successfully.", "success");
      setEditingSub(null);
    } catch (err) {
      addToast(`Failed to update subscription: ${err.message}`, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };


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

      {/* Daily Ordering Status Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Today's Ordering Availability</h3>
        <p className="text-xs text-slate-500 mb-4">Toggle these off to prevent customers from selecting meals for the current day. Used to enforce cut-off times.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {["breakfast", "lunch", "snacks", "dinner"].map((slot) => {
            const isOpen = dailyOrderingStatus[slot] !== false; // defaults to true
            return (
              <div key={slot} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">{slot}</span>
                <button
                  onClick={() => toggleSlotStatus(slot)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isOpen ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isOpen ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })}
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
                              onClick={() => openEditModal(s)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors"
                              title="Edit plan, duration, and benefits"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                              Edit
                            </button>
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
                                        {r.mealName || r.mealNameSnapshot || r.mealId}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                                
                                <SubscriptionTimeline subscription={s} selections={rows} />
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
      {/* Edit Subscription Modal */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex justify-between items-start mb-5 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Edit Subscription
                  </h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                    #{editingSub.id}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Customer: <span className="font-bold text-slate-700 dark:text-slate-300">{editingSub._customerName}</span> ({editingSub._customerPhone})
                </p>
              </div>
              <button
                onClick={() => setEditingSub(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Plan Selection (Upgrade / Downgrade) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Subscription Plan (Upgrade / Downgrade)
                </label>
                <select
                  value={editForm.planId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const p = planById[selId] || {};
                    setEditForm((prev) => ({
                      ...prev,
                      planId: selId,
                      planTitle: p.title || prev.planTitle,
                      subscriptionType: p.subscriptionType || prev.subscriptionType || "diet",
                      durationDays: p.durationDays || prev.durationDays || 7,
                      coveredSlots: Array.isArray(p.coveredSlots) && p.coveredSlots.length > 0 ? p.coveredSlots : prev.coveredSlots,
                      mealsPerDay: p.mealsPerDay || prev.mealsPerDay || 3,
                    }));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                >
                  <option value="">Custom / Retain Current ({editForm.planTitle})</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.subscriptionType || "diet"} · {p.durationDays || 7}d · ₹{p.discountedPrice || p.price || 0}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Currently selected: <span className="font-semibold text-slate-600 dark:text-slate-300">{editForm.planTitle}</span> ({editForm.subscriptionType})
                </p>
              </div>

              {/* End Date & Extension */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Expiration Date &amp; Duration Extension
                  </label>
                  <span className="text-xs text-slate-400">
                    Original: {fmtDate(editingSub.endDate)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="w-full sm:w-48 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-400 mr-1">Quick Extend:</span>
                    {[7, 14, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          const base = editForm.endDate || toIsoDateString(new Date());
                          setEditForm((prev) => ({
                            ...prev,
                            endDate: addDaysToDateString(base, days),
                            durationDays: (Number(prev.durationDays) || 0) + days,
                          }));
                        }}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                      >
                        +{days} Days
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Extending the end date seamlessly updates active duration and prevents premature expiration in the renewal engine.
                </p>
              </div>

              {/* Covered Slots */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Covered Meal Slots
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(SLOT_LABEL).map(([slotKey, label]) => {
                    const isChecked = editForm.coveredSlots.includes(slotKey);
                    return (
                      <label
                        key={slotKey}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                          isChecked
                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm((prev) => ({ ...prev, coveredSlots: [...prev.coveredSlots, slotKey] }));
                            } else {
                              setEditForm((prev) => ({ ...prev, coveredSlots: prev.coveredSlots.filter((k) => k !== slotKey) }));
                            }
                          }}
                          className="w-4 h-4 rounded accent-emerald-500"
                        />
                        <span className="text-xs font-bold">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Meals Per Day & Special Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Meals Per Day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={editForm.mealsPerDay}
                    onChange={(e) => setEditForm({ ...editForm, mealsPerDay: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Special Instructions / Notes
                  </label>
                  <input
                    type="text"
                    value={editForm.specialInstructions}
                    onChange={(e) => setEditForm({ ...editForm, specialInstructions: e.target.value })}
                    placeholder="e.g. Less spicy, diabetic-friendly..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Audit Reason (Mandatory) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">edit_note</span>
                  Reason for Modification (Mandatory Audit Requirement)
                </label>
                <input
                  type="text"
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="e.g. Customer upgraded to Premium plan, compensated 7 days for holiday"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-sm outline-none focus:border-amber-500 font-medium"
                />
              </div>

              {/* History / Audit Trail of Previous Changes */}
              {Array.isArray(editingSub.adminHistory) && editingSub.adminHistory.length > 0 && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Previous Modification History ({editingSub.adminHistory.length})
                  </p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {editingSub.adminHistory.slice().reverse().map((h, i) => (
                      <div key={i} className="text-xs border-b border-slate-200 dark:border-slate-700 pb-1.5 last:border-0">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{fmtDate(h.timestamp)} {toDate(h.timestamp)?.toLocaleTimeString()}</span>
                          <span className="font-mono">{h.adminEmail || h.adminUid}</span>
                        </div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                          {h.reason || "Admin update"}
                        </p>
                        {h.previousState?.planTitle !== h.newState?.planTitle && (
                          <span className="text-[10px] text-emerald-600 block">
                            Plan: {h.previousState?.planTitle} → {h.newState?.planTitle}
                          </span>
                        )}
                        {h.previousState?.endDate !== h.newState?.endDate && (
                          <span className="text-[10px] text-blue-600 block">
                            End Date: {fmtDate(h.previousState?.endDate)} → {fmtDate(h.newState?.endDate)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                disabled={isSavingEdit}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSubscriptionEdit}
                disabled={isSavingEdit}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">save</span>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;

