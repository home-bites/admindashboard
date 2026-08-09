import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection, getDocs, doc, setDoc, query, where, serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase/firestore";
import { useUiStore } from "../store/uiStore";

/**
 * Daily subscription menu editor.
 *
 * The `publishDailyMenus` Cloud Function seeds one document per plan, per slot,
 * at 05:00 IST so an admin always has something concrete to edit rather than
 * building each morning's menu from nothing. This page is where that seeded
 * menu is reviewed and changed.
 *
 * Document id is `{planId}_{YYYY-MM-DD}_{slot}` — the same contract enforced in
 * firestore.rules and rebuilt client-side in SubscriptionMealAvailability.buildId.
 * Writing any other id would produce a document the customer app can never find,
 * so the id is always constructed here, never typed.
 *
 * Saving sets `isAutoPublished: false`, which is what stops the next 05:00 run
 * from overwriting a menu a human has curated.
 */

const SLOTS = [
  { id: "breakfast", label: "Morning", window: "7:00 – 9:30 AM" },
  { id: "lunch", label: "Afternoon", window: "12:00 – 2:30 PM" },
  { id: "snacks", label: "Evening Snacks", window: "4:30 – 6:30 PM" },
  { id: "dinner", label: "Night", window: "7:30 – 9:30 PM" },
];

/** Today in IST as YYYY-MM-DD, regardless of the browser's timezone. */
const istToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

export const DailyMenu = () => {
  const { addToast } = useUiStore();

  const [date, setDate] = useState(istToday());
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [catalogue, setCatalogue] = useState([]);
  const [menu, setMenu] = useState({});      // slot -> { mealIds, isActive, isAutoPublished }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  // --- plans -----------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "mealPlans"));
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.isActive !== false && p.isDeleted !== true);
        setPlans(rows);
        if (rows.length && !selectedPlanId) setSelectedPlanId(rows[0].id);
      } catch (e) {
        addToast?.("Could not load meal plans.", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- catalogue for the selected plan type ----------------------------------
  useEffect(() => {
    if (!selectedPlan) return;
    (async () => {
      // Diet plans draw from dietFoods, regular plans from menuItems. Loading
      // the wrong catalogue would offer dishes the kitchen cannot make for
      // that plan.
      const isDiet =
        String(selectedPlan.subscriptionType || "diet").toLowerCase() === "diet";
      const name = isDiet ? "dietFoods" : "menuItems";
      try {
        const snap = await getDocs(collection(db, name));
        setCatalogue(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((m) => m.isDeleted !== true)
        );
      } catch (e) {
        addToast?.(`Could not load ${name}.`, "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId, plans]);

  // --- the day's published menu ----------------------------------------------
  const loadMenu = useCallback(async () => {
    if (!selectedPlanId || !date) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "subscriptionMealAvailability"),
        where("planId", "==", selectedPlanId),
        where("date", "==", date)
      ));
      const next = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        next[data.slot] = {
          mealIds: Array.isArray(data.mealIds) ? data.mealIds : [],
          isActive: data.isActive !== false,
          isAutoPublished: data.isAutoPublished === true,
        };
      });
      setMenu(next);
    } catch (e) {
      addToast?.("Could not load this day's menu.", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedPlanId, date, addToast]);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  // --- edits ------------------------------------------------------------------
  const toggleMeal = (slot, mealId) => {
    setMenu((prev) => {
      const current = prev[slot] || { mealIds: [], isActive: true, isAutoPublished: false };
      const has = current.mealIds.includes(mealId);
      return {
        ...prev,
        [slot]: {
          ...current,
          mealIds: has
            ? current.mealIds.filter((id) => id !== mealId)
            : [...current.mealIds, mealId],
        },
      };
    });
  };

  const toggleSlotActive = (slot) => {
    setMenu((prev) => {
      const current = prev[slot] || { mealIds: [], isActive: true, isAutoPublished: false };
      return { ...prev, [slot]: { ...current, isActive: !current.isActive } };
    });
  };

  const saveSlot = async (slot) => {
    const entry = menu[slot] || { mealIds: [], isActive: true };
    setSaving(true);
    try {
      // Id built from the contract, never typed. An id that does not equal
      // planId_date_slot is unreachable from the security rule, so every
      // customer selection for that slot would fail closed with no clue why.
      const docId = `${selectedPlanId}_${date}_${slot}`;
      await setDoc(doc(db, "subscriptionMealAvailability", docId), {
        planId: selectedPlanId,
        date,
        slot,
        mealIds: entry.mealIds,
        isActive: entry.isActive && entry.mealIds.length > 0,
        // Marks the menu as human-curated so the 05:00 job leaves it alone.
        isAutoPublished: false,
        subscriptionType:
          String(selectedPlan?.subscriptionType || "diet").toLowerCase() === "diet"
            ? "diet" : "regular",
        updatedAt: serverTimestamp(),
      }, { merge: true });

      addToast?.(`${SLOTS.find((s) => s.id === slot)?.label} menu saved.`, "success");
      await loadMenu();
    } catch (e) {
      addToast?.(`Save failed: ${e.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const republish = async () => {
    setSaving(true);
    try {
      const fn = httpsCallable(getFunctions(), "republishDailyMenus");
      const res = await fn({ date, planId: selectedPlanId });
      addToast?.(
        `Re-seeded ${res.data.written} slot(s); ${res.data.preserved} edited menu(s) left untouched.`,
        "success"
      );
      await loadMenu();
    } catch (e) {
      addToast?.(`Re-publish failed: ${e.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const filteredCatalogue = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((m) => (m.name || "").toLowerCase().includes(q));
  }, [catalogue, search]);

  const mealName = (id) =>
    catalogue.find((m) => m.id === id)?.name || `Unknown (${id})`;

  const planSlots = useMemo(() => {
    // A plan that only fills lunchMenu sells lunch only; showing four sections
    // would invite the admin to publish a menu no customer can ever see.
    if (!selectedPlan) return SLOTS;
    const enabled = [];
    if (selectedPlan.breakfastMenu?.trim()) enabled.push("breakfast");
    if (selectedPlan.lunchMenu?.trim()) enabled.push("lunch");
    if (selectedPlan.snackMenu?.trim()) enabled.push("snacks");
    if (selectedPlan.dinnerMenu?.trim()) enabled.push("dinner");
    return enabled.length ? SLOTS.filter((s) => enabled.includes(s.id)) : SLOTS;
  }, [selectedPlan]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Daily Menu</h1>
          <p className="text-sm text-slate-500 mt-1">
            Published automatically at 5:00 AM IST. Anything you change here is
            marked as curated and will not be overwritten by the next run.
          </p>
        </div>
        <button
          onClick={republish}
          disabled={saving || !selectedPlanId}
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium
                     text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Re-seed from plan template
        </button>
      </header>

      <div className="flex flex-wrap gap-4 items-end bg-white border border-slate-200 rounded-xl p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 min-w-64">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Plan</span>
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || p.id}
                {String(p.subscriptionType || "diet").toLowerCase() === "diet"
                  ? "  (Diet)" : "  (Regular)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-48">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Search dishes</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter the catalogue"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading menu…</div>
      ) : plans.length === 0 ? (
        <div className="text-sm text-slate-500 py-12 text-center">
          No active meal plans. Create one under Meal Plans first.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {planSlots.map((slot) => {
            const entry = menu[slot.id];
            const selected = entry?.mealIds || [];
            return (
              <section key={slot.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                  <div>
                    <h2 className="font-semibold text-slate-900">{slot.label}</h2>
                    <p className="text-xs text-slate-500">{slot.window}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {entry ? (
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                        entry.isAutoPublished
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}>
                        {entry.isAutoPublished ? "Auto-published" : "Curated"}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                        Not published
                      </span>
                    )}
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={entry?.isActive !== false}
                        onChange={() => toggleSlotActive(slot.id)}
                      />
                      Offered
                    </label>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-500">
                    {selected.length} dish{selected.length === 1 ? "" : "es"} on this menu
                    {selected.length === 0 && " — customers will see nothing for this slot"}
                  </p>

                  <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                    {filteredCatalogue.length === 0 && (
                      <p className="text-xs text-slate-400 p-3">No dishes match.</p>
                    )}
                    {filteredCatalogue.map((meal) => (
                      <label
                        key={meal.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(meal.id)}
                          onChange={() => toggleMeal(slot.id, meal.id)}
                        />
                        <span className="text-sm text-slate-700 flex-1">{meal.name || meal.id}</span>
                        {meal.isAvailable === false && (
                          <span className="text-[10px] text-red-600 font-medium">unavailable</span>
                        )}
                      </label>
                    ))}
                  </div>

                  {selected.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.map((id) => (
                        <span key={id} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          {mealName(id)}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => saveSlot(slot.id)}
                    disabled={saving}
                    className="w-full py-2 rounded-lg bg-slate-900 text-white text-sm font-medium
                               hover:bg-slate-800 disabled:opacity-50"
                  >
                    Save {slot.label}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DailyMenu;
