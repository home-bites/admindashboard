import React, { useEffect, useMemo, useState } from "react";
import { useLiveCollection } from "../hooks/useLiveCollection";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import * as repos from "../repositories";

const SLOT_CONFIG = [
  { id: "breakfast", label: "Morning Breakfast", icon: "wb_twilight", time: "7:00 AM - 9:30 AM" },
  { id: "lunch", label: "Afternoon Lunch", icon: "sunny", time: "12:00 PM - 2:30 PM" },
  { id: "snacks", label: "Evening Snacks", icon: "coffee", time: "4:30 PM - 6:30 PM" },
  { id: "dinner", label: "Night Dinner", icon: "dark_mode", time: "7:30 PM - 10:00 PM" },
];

const STATUS_CONFIG = {
  active: {
    label: "Active",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500 animate-pulse",
  },
  paused: {
    label: "Paused",
    badge: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  pending: {
    label: "Pending",
    badge: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    dot: "bg-sky-400",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
  failed: {
    label: "Failed",
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
};

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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
  return d
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
};

const istToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function StatusBadge({ status }) {
  const key = String(status || "pending").toLowerCase();
  const cfg = STATUS_CONFIG[key] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold tracking-wide ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SubscriptionTimelineModal({ subscription, selections, onClose }) {
  if (!subscription) return null;

  const start = toDate(subscription.startDate);
  const end = toDate(subscription.endDate);
  const skippedDates = subscription.skippedDates || [];
  const pausedDates = subscription.pausedDates || [];
  const pausedAt = subscription.pausedAt ? toDate(subscription.pausedAt) : null;
  const resumedAt = subscription.resumedAt ? toDate(subscription.resumedAt) : null;

  const dates = [];
  if (start && end) {
    let current = new Date(start);
    let limit = 0;
    while (current <= end && limit < 180) {
      const dStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(current);
      dates.push(dStr);
      current.setDate(current.getDate() + 1);
      limit++;
    }
  }

  const activeMeals = new Set();
  if (selections) {
    selections.forEach((sel) => {
      const st = String(sel.status || "").toLowerCase();
      if (st !== "skipped" && st !== "cancelled") {
        activeMeals.add(sel.date);
      }
    });
  }

  const todayStr = istToday();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 space-y-5 overflow-hidden">
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-xl">event_available</span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Subscription Calendar & History
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {subscription._customerName} • {subscription._planTitle} ({subscription.id.slice(0, 8)})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {dates.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            No start or end dates configured for this subscription.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-7 sm:grid-cols-10 gap-2 max-h-56 overflow-y-auto p-1">
              {dates.map((d) => {
                const isToday = d === todayStr;
                const isSkipped = skippedDates.includes(d);
                const isPaused = pausedDates.includes(d);
                const hasMeal = activeMeals.has(d);

                let bg = "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
                if (isSkipped) bg = "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold border border-amber-300";
                else if (isPaused) bg = "bg-amber-400 text-amber-950 font-black";
                else if (hasMeal) bg = "bg-emerald-500 text-white font-black shadow-xs shadow-emerald-500/20";

                const dayNum = parseInt(d.split("-")[2], 10);
                const monthShort = new Date(d).toLocaleDateString("en-IN", { month: "short" });

                return (
                  <div
                    key={d}
                    title={`${d} ${hasMeal ? "• Meal Booked" : isSkipped ? "• Skipped" : isPaused ? "• Paused" : ""}`}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center text-center transition ${bg} ${
                      isToday ? "ring-2 ring-emerald-600 ring-offset-2 dark:ring-offset-slate-900" : ""
                    }`}
                  >
                    <span className="text-[9px] uppercase leading-none opacity-70">{monthShort}</span>
                    <span className="text-xs font-black leading-tight mt-0.5">{dayNum}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-md bg-emerald-500" />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Active Meals</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-md bg-amber-400" />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Paused</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-md bg-amber-100 border border-amber-300" />
                <span className="font-semibold text-slate-600 dark:text-slate-300">Skipped</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-md bg-slate-100 border border-slate-200 dark:bg-slate-800" />
                <span className="font-semibold text-slate-500 dark:text-slate-400">Rest / No Meal</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Total Banked Days</p>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{subscription.pausedDaysTotal || 0} day(s)</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Skipped Days</p>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{skippedDates.length} day(s)</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Last Paused</p>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{pausedAt ? fmtDate(pausedAt) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Last Resumed</p>
                <p className="font-black text-slate-900 dark:text-white mt-0.5">{resumedAt ? fmtDate(resumedAt) : "—"}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition"
          >
            Close Calendar
          </button>
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
  const { data: appSettings } = useLiveCollection("appSettingsRepository");

  const [customerById, setCustomerById] = useState({});
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selections, setSelections] = useState({});
  const [calendarSub, setCalendarSub] = useState(null);
  const [actingId, setActingId] = useState(null);

  // Bulk actions
  const [checked, setChecked] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Edit subscription modal
  const [editingSub, setEditingSub] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    planId: "",
    planTitle: "",
    subscriptionType: "weekly",
    endDate: "",
    durationDays: 7,
    coveredSlots: ["lunch", "dinner"],
    mealsPerDay: 2,
    specialInstructions: "",
    reason: "",
  });

  const dailyOrderingStatus = useMemo(() => {
    return appSettings.find((s) => s.id === "dailyOrderingStatus") || {};
  }, [appSettings]);

  const toggleSlotStatus = async (slotId) => {
    try {
      const current = dailyOrderingStatus[slotId] !== false;
      await repos.appSettingsRepository.update("dailyOrderingStatus", {
        [slotId]: !current,
        updatedAt: new Date().toISOString(),
      });
      addToast(`Updated ordering status for ${slotId}`, "success");
    } catch (e) {
      if (e.message?.includes("No document to update")) {
        await repos.appSettingsRepository.set("dailyOrderingStatus", {
          id: "dailyOrderingStatus",
          [slotId]: false,
          updatedAt: new Date().toISOString(),
        });
        addToast(`Updated ordering status for ${slotId}`, "success");
      } else {
        addToast(`Failed to update status: ${e.message}`, "error");
      }
    }
  };

  useEffect(() => {
    if (error) addToast(`Live subscription sync paused: ${error}`, "error");
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
          .filter(Boolean)
      ),
    ].filter((id) => !customerById[id]);

    if (wanted.length === 0) return;

    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(
        wanted.map((id) => repos.userRepository.getById(id).catch(() => null))
      );
      if (cancelled) return;
      setCustomerById((prev) => {
        const next = { ...prev };
        wanted.forEach((id, i) => {
          next[id] = fetched[i] || { id, _missing: true };
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [subscriptions, customerById]);

  const enriched = useMemo(() => {
    return subscriptions
      .filter((s) => s.isDeleted !== true)
      .map((s) => {
        const custId = s.userId || s.customerId;
        const cust = customerById[custId];
        const plan = planById[s.planId];

        const rawCustomerName =
          s.customerName ||
          s.userName ||
          cust?.displayName ||
          [cust?.firstName, cust?.lastName].filter(Boolean).join(" ") ||
          "";

        const cleanCustomerName =
          rawCustomerName.toLowerCase().includes("gourmet") || !rawCustomerName.trim()
            ? (cust?.phone ? `Subscriber (${cust.phone.slice(-4)})` : `Subscriber #${(custId || s.id).slice(0, 6)}`)
            : rawCustomerName;

        const customerPhone = s.customerPhone || s.phone || cust?.phone || cust?.phoneNumber || "No phone";
        const planTitle = s.planTitle || s.planName || plan?.title || plan?.name || "Custom Meal Plan";
        const planPrice = s.price || s.totalAmount || s.planPrice || plan?.price || 0;

        const statusKey = String(s.status || "pending").toLowerCase();
        const paidKey = String(s.paymentStatus || "").toLowerCase();

        return {
          ...s,
          _customerName: cleanCustomerName,
          _customerPhone: customerPhone,
          _planTitle: planTitle,
          _planPrice: planPrice,
          _statusKey: statusKey,
          _paidKey: paidKey,
        };
      });
  }, [subscriptions, customerById, planById]);

  const filtered = useMemo(() => {
    return enriched.filter((s) => {
      if (statusFilter !== "ALL" && s._statusKey !== statusFilter.toLowerCase()) return false;
      if (paymentFilter === "PAID" && !["paid", "verified"].includes(s._paidKey)) return false;
      if (paymentFilter === "UNPAID" && ["paid", "verified"].includes(s._paidKey)) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        s._customerName.toLowerCase().includes(q) ||
        s._customerPhone.toLowerCase().includes(q) ||
        s._planTitle.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [enriched, statusFilter, paymentFilter, search]);

  // KPIs
  const stats = useMemo(() => {
    const active = enriched.filter((s) => s._statusKey === "active");
    const paused = enriched.filter((s) => s._statusKey === "paused");
    const totalRev = enriched.reduce((sum, s) => sum + Number(s._planPrice || 0), 0);
    return {
      total: enriched.length,
      active: active.length,
      paused: paused.length,
      revenue: totalRev,
    };
  }, [enriched]);

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
      if (allVisibleChecked) filtered.forEach((s) => next.delete(s.id));
      else filtered.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const adminSetStatus = async (s, targetStatus) => {
    setActingId(s.id);
    try {
      const isPausing = targetStatus.toLowerCase() === "paused";
      const isResuming = targetStatus.toLowerCase() === "active";
      const now = new Date().toISOString();

      const payload = {
        status: targetStatus,
        updatedAt: now,
        updatedBy: user?.uid || "admin",
      };

      if (isPausing) {
        payload.pausedAt = now;
      } else if (isResuming) {
        payload.resumedAt = now;
      }

      await repos.subscriptionRepository.update(s.id, payload);
      addToast(`Subscription marked as ${targetStatus}`, "success");
    } catch (e) {
      addToast(`Status update failed: ${e.message}`, "error");
    } finally {
      setActingId(null);
    }
  };

  const openCalendarModal = async (s) => {
    setCalendarSub(s);
    if (!selections[s.id]) {
      try {
        const rows = await repos.subscriptionMealSelectionRepository.getByField("subscriptionId", s.id);
        setSelections((prev) => ({ ...prev, [s.id]: rows || [] }));
      } catch (e) {
        console.warn("Could not fetch meal selections:", e);
      }
    }
  };

  const openEditModal = (s) => {
    setEditingSub(s);
    setEditForm({
      planId: s.planId || "",
      planTitle: s._planTitle || "",
      subscriptionType: s.subscriptionType || "weekly",
      endDate: s.endDate ? fmtDate(s.endDate) : "",
      durationDays: s.durationDays || 7,
      coveredSlots: s.coveredSlots || ["lunch", "dinner"],
      mealsPerDay: s.mealsPerDay || 2,
      specialInstructions: s.specialInstructions || "",
      reason: "",
    });
  };

  const saveEditModal = async (e) => {
    e.preventDefault();
    if (!editForm.reason.trim()) {
      addToast("Please provide an administrative reason for updating this subscription.", "error");
      return;
    }
    setIsSavingEdit(true);
    try {
      await repos.subscriptionRepository.update(editingSub.id, {
        planTitle: editForm.planTitle,
        subscriptionType: editForm.subscriptionType,
        durationDays: Number(editForm.durationDays),
        coveredSlots: editForm.coveredSlots,
        mealsPerDay: Number(editForm.mealsPerDay),
        specialInstructions: editForm.specialInstructions,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid || "admin",
      });
      addToast("Subscription details updated successfully", "success");
      setEditingSub(null);
    } catch (err) {
      addToast(`Update failed: ${err.message}`, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    if (!window.confirm(`Are you sure you want to remove ${ids.length} selected subscriptions from the active view?`)) return;

    setBulkBusy(true);
    let done = 0;
    for (const id of ids) {
      try {
        await repos.subscriptionRepository.delete(id);
        done++;
      } catch (e) {
        console.error("Delete error:", e);
      }
    }
    setChecked(new Set());
    setBulkBusy(false);
    addToast(`Archived ${done} subscriptions`, "success");
  };

  return (
    <div className="space-y-6">
      {/* ── Meal Slots Dispatch Control Tower ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                Daily Meal Slots Control
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Instantly open or suspend live subscription dispatching per meal window.
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-xl font-bold self-start sm:self-auto">
            IST Service Timezone
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
          {SLOT_CONFIG.map((slot) => {
            const isOpen = dailyOrderingStatus[slot.id] !== false;
            return (
              <div
                key={slot.id}
                className={`p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between ${
                  isOpen
                    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800"
                    : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 opacity-75"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isOpen ? "bg-emerald-500 text-white shadow-xs shadow-emerald-500/20" : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                  }`}>
                    <span className="material-symbols-outlined text-[20px]">{slot.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">{slot.label}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold">{slot.time}</p>
                  </div>
                </div>

                <button
                  onClick={() => toggleSlotStatus(slot.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isOpen
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                      : "bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-white" : "bg-slate-500"}`} />
                  {isOpen ? "Open" : "Paused"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── KPI Bento Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Plans</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">event_repeat</span>
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-3">{stats.total}</p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Active customer subscriptions</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Service</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">local_dining</span>
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-3">{stats.active}</p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Currently receiving daily meals</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Paused / Banked</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">pause_circle</span>
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-3">{stats.paused}</p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">On hold or banking days</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Monthly Run-Rate</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">payments</span>
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-3">{inr(stats.revenue)}</p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Total active plan commitment</p>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl">
          {["ALL", "ACTIVE", "PAUSED", "PENDING", "CANCELLED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === st
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {st === "ALL" ? "All Status" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search & Payment Filter */}
        <div className="flex items-center gap-3">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="ALL">All Payments</option>
            <option value="PAID">Paid Only</option>
            <option value="UNPAID">Payment Pending</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subscriber, phone, plan..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bulk Actions Floating Strip ── */}
      {checked.size > 0 && (
        <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 px-5 py-3 rounded-2xl animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-lg">check_box</span>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {checked.size} subscription{checked.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <button
            onClick={deleteSelected}
            disabled={bulkBusy}
            className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">archive</span>
            {bulkBusy ? "Archiving..." : "Archive Selected"}
          </button>
        </div>
      )}

      {/* ── Main Subscriptions Table ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-400">Loading subscriptions...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <span className="material-symbols-outlined text-2xl">event_busy</span>
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Subscriptions Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {search || statusFilter !== "ALL"
                ? "No subscriptions match your current search or filter criteria."
                : "Active meal plans will appear here as soon as orders are booked."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider font-bold text-slate-400">
                  <th className="pl-6 pr-2 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={toggleAllVisible}
                      className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-4">Subscriber</th>
                  <th className="px-4 py-4">Meal Plan</th>
                  <th className="px-4 py-4">Validity & Banking</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Payment</th>
                  <th className="px-4 py-4 text-right">Price</th>
                  <th className="pr-6 pl-4 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filtered.map((s) => {
                  const paid = ["paid", "verified"].includes(s._paidKey);
                  const isChecked = checked.has(s.id);
                  const initial = s._customerName.charAt(0).toUpperCase() || "S";

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors ${
                        isChecked ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""
                      }`}
                    >
                      <td className="pl-6 pr-2 py-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecked(s.id)}
                          className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* Subscriber Info */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-xs shadow-xs">
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {s._customerName}
                            </div>
                            <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                              <span className="material-symbols-outlined text-[13px] text-emerald-600">call</span>
                              {s._customerPhone}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Plan Info */}
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">{s._planTitle}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {s.id.slice(0, 10)}</p>
                        </div>
                      </td>

                      {/* Period & Banking */}
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="text-slate-600 dark:text-slate-300 font-semibold">
                            {fmtDate(s.startDate)} → {fmtDate(s.endDate)}
                          </div>
                          {Number(s.pausedDaysTotal) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/80">
                              <span className="material-symbols-outlined text-[12px]">hourglass_top</span>
                              +{s.pausedDaysTotal} banked days
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <StatusBadge status={s.status} />
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            paid
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                              : "bg-rose-50 text-rose-700 border border-rose-200/80"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${paid ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {paid ? "Paid" : s.paymentStatus || "Unpaid"}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-4 text-right">
                        <span className="font-black text-slate-900 dark:text-white text-sm">
                          {inr(s._planPrice)}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="pr-6 pl-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openCalendarModal(s)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="View meal calendar & history"
                          >
                            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                          </button>

                          <button
                            onClick={() => openEditModal(s)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Edit subscription details"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>

                          {s._statusKey === "active" && (
                            <button
                              disabled={actingId === s.id}
                              onClick={() => adminSetStatus(s, "Paused")}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition disabled:opacity-50"
                              title="Pause subscription deliveries"
                            >
                              Pause
                            </button>
                          )}

                          {s._statusKey === "paused" && (
                            <button
                              disabled={actingId === s.id}
                              onClick={() => adminSetStatus(s, "Active")}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition disabled:opacity-50"
                              title="Resume subscription deliveries"
                            >
                              Resume
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Calendar Modal ── */}
      {calendarSub && (
        <SubscriptionTimelineModal
          subscription={calendarSub}
          selections={selections[calendarSub.id]}
          onClose={() => setCalendarSub(null)}
        />
      )}

      {/* ── Edit Subscription Modal ── */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Edit Subscription</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editingSub._customerName} • {editingSub.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => setEditingSub(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={saveEditModal} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Plan Title</label>
                <input
                  type="text"
                  value={editForm.planTitle}
                  onChange={(e) => setEditForm({ ...editForm, planTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Duration (Days)</label>
                  <input
                    type="number"
                    value={editForm.durationDays}
                    onChange={(e) => setEditForm({ ...editForm, durationDays: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Meals Per Day</label>
                  <input
                    type="number"
                    value={editForm.mealsPerDay}
                    onChange={(e) => setEditForm({ ...editForm, mealsPerDay: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Special Instructions</label>
                <textarea
                  rows={2}
                  value={editForm.specialInstructions}
                  onChange={(e) => setEditForm({ ...editForm, specialInstructions: e.target.value })}
                  placeholder="Diet preferences, spice level, delivery notes..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Reason for Edit <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="e.g. Customer requested upgrade via WhatsApp"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
