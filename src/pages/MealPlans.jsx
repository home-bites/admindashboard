import React, { useState, useEffect } from "react";
import { MealPlanService } from "../services";
import { useUiStore } from "../store/uiStore";
import { useLiveCollection } from "../hooks/useLiveCollection";
import { ImageUploader } from "../components/ImageUploader";

/** The four services. Must stay in step with the slot set in firestore.rules. */
const SLOTS = [
  { id: "breakfast", label: "Morning", window: "7:00 – 9:30 AM", icon: "🍳" },
  { id: "lunch", label: "Afternoon", window: "12:00 – 2:30 PM", icon: "🥗" },
  { id: "snacks", label: "Evening Snacks", window: "4:30 – 6:30 PM", icon: "🍇" },
  { id: "dinner", label: "Night", window: "7:30 – 9:30 PM", icon: "🍗" },
];

const EMPTY_SLOTS = { breakfast: [], lunch: [], snacks: [], dinner: [] };

/**
 * Per-dish nutrition, collected for diet plans only.
 *
 * A regular subscription is sold on what the food is; a diet subscription is
 * sold on its macros, and a customer may be managing diabetes or a training
 * plan around these numbers. They are entered per dish rather than per plan
 * because a plan's daily total is meaningless when the customer picks one
 * dish out of four each service.
 */
const NUTRIENTS = [
  { id: "calories", label: "kcal", width: "w-16" },
  { id: "protein", label: "P (g)", width: "w-14" },
  { id: "carbs", label: "C (g)", width: "w-14" },
  { id: "fats", label: "F (g)", width: "w-14" },
  { id: "fiber", label: "Fib (g)", width: "w-14" },
];

export const MealPlans = () => {
  const { addToast } = useUiStore();
  const { data: plans, loading, error: liveError } =
    useLiveCollection("mealPlanRepository");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  /**
   * A new plan starts empty.
   *
   * This form used to open pre-filled with a complete fictional plan — "7-Day
   * Lean Protein & Weight Loss Plan", ₹2499, a full week of invented dishes.
   * Convenient to demo, dangerous in production: every field looked already
   * answered, so anything the admin didn't consciously overwrite was saved as
   * real customer-facing content. A price of ₹2499 and a Monday menu of "Oats
   * Upma" would ship to subscribers because nobody noticed they were defaults.
   *
   * Empty strings render as placeholders in the inputs instead, which asks
   * the question rather than answering it wrongly. Only genuinely structural
   * choices keep a default: plan type, and the active flag.
   */
  const initialFormState = {
    title: "",
    subtitle: "",
    description: "",
    planType: "WEEKLY",
    // Read by the customer app's DietPlan model and the
    // subscription detail screen — all of which fell back to "diet" because
    // this form never wrote the field, making a Regular plan impossible to
    // create through the dashboard.
    subscriptionType: "diet",
    coveredSlots: ["breakfast", "lunch", "snacks", "dinner"],
    slotMeals: EMPTY_SLOTS,
    durationDays: 7,
    price: "",
    discountedPrice: "",
    caloriesPerDay: "",
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
    fiber: "",
    mealsPerDay: 3,
    breakfastMenu: "",
    lunchMenu: "",
    dinnerMenu: "",
    snackMenu: "",
    foodType: "Veg",
    deliveryTiming: "",
    availableDays: "",
    maxSubscribers: "",
    // Never seeded. This is a live count of real subscribers; presetting it
    // to 18 made an empty plan advertise subscribers it did not have.
    activeSubscribers: 0,
    imageUrl: "",
    tags: [],
    isPopular: false,
    isActive: true,
    weeklySchedule: {
      Monday: "", Tuesday: "", Wednesday: "", Thursday: "",
      Friday: "", Saturday: "", Sunday: "",
    }
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    if (liveError) addToast(`Live updates stopped: ${liveError}`, "error");
  }, [liveError, addToast]);

  const isDietPlan = String(formData.subscriptionType || "diet").toLowerCase() === "diet";

  /* ── slot dish editing ─────────────────────────────────────────────────
   *
   * Dishes are typed here, not chosen from the Menu Items catalogue.
   *
   * A picker tied the plan to whatever already existed in `menuItems` or
   * `dietFoods`, which meant inventing a catalogue entry before a plan could
   * mention a dish, and editing that entry to reword a plan. Subscription
   * menus change week to week and are written by the person planning them, so
   * typing is the faster and more honest tool — the plan holds its own text.
   *
   * Shape: slotMeals[slot] is an array of `{ name, calories, protein, carbs,
   * fats, fiber }`. Nutrition fields are only collected for diet plans, where
   * macros are the product; a regular plan stores name only.
   */

  /** Older plans stored an array of catalogue ids. Read them as names. */
  const normaliseSlotRows = (rows) =>
    (Array.isArray(rows) ? rows : []).map((r) =>
      typeof r === "string" ? { name: r } : { ...r }
    );

  const addSlotRow = (slotId) => {
    setFormData((prev) => {
      const slots = { ...EMPTY_SLOTS, ...(prev.slotMeals || {}) };
      slots[slotId] = [...normaliseSlotRows(slots[slotId]), { name: "" }];
      return { ...prev, slotMeals: slots };
    });
  };

  const removeSlotRow = (slotId, index) => {
    setFormData((prev) => {
      const slots = { ...EMPTY_SLOTS, ...(prev.slotMeals || {}) };
      slots[slotId] = normaliseSlotRows(slots[slotId]).filter((_, i) => i !== index);
      return { ...prev, slotMeals: slots };
    });
  };

  const setSlotField = (slotId, index, field, value) => {
    setFormData((prev) => {
      const slots = { ...EMPTY_SLOTS, ...(prev.slotMeals || {}) };
      const rows = normaliseSlotRows(slots[slotId]);
      rows[index] = { ...rows[index], [field]: value };
      slots[slotId] = rows;
      return { ...prev, slotMeals: slots };
    });
  };

  /**
   * Display strings regenerated from the typed rows.
   *
   * The plan cards and the customer app read `breakfastMenu` and its siblings.
   * Deriving them at save time keeps one source of truth: the card text can
   * never describe a dish the plan no longer contains.
   */
  const summariseSlots = (slotMeals) => {
    const join = (rows) =>
      normaliseSlotRows(rows).map((r) => (r.name || "").trim()).filter(Boolean).join(" / ");
    return {
      breakfastMenu: join(slotMeals?.breakfast),
      lunchMenu: join(slotMeals?.lunch),
      dinnerMenu: join(slotMeals?.dinner),
      snackMenu: join(slotMeals?.snacks),
    };
  };

  /**
   * Flat list of dish names per slot, written alongside the rich `slotMeals`.
   *
   * This exists for firestore.rules. The rule that authorises a customer's
   * meal selection has to answer "is this dish on the plan for that slot?",
   * and the rules language cannot project a field out of an array of maps —
   * there is no way to express `slotMeals.breakfast.map(m => m.name)`. A
   * plain array of strings can be tested with `in` directly.
   *
   * Derived at save time from the same rows, so the two cannot disagree.
   */
  const slotMealNames = (cleaned) => {
    const out = {};
    for (const slot of SLOTS) {
      out[slot.id] = (cleaned[slot.id] || []).map((r) => r.name);
    }
    return out;
  };

  /** Blank rows are dropped, and numbers stored as numbers, not strings. */
  const cleanSlotMeals = (slotMeals) => {
    const out = {};
    for (const slot of SLOTS) {
      out[slot.id] = normaliseSlotRows(slotMeals?.[slot.id])
        .filter((r) => (r.name || "").trim())
        .map((r) => {
          const row = { name: r.name.trim() };
          if (!isDietPlan) return row;
          for (const key of NUTRIENTS) {
            const n = Number(r[key.id]);
            // Only recorded when actually entered. Writing 0 for a blank field
            // would publish "0 g protein" as though it were a measurement.
            if (r[key.id] !== "" && r[key.id] != null && Number.isFinite(n)) {
              row[key.id] = n;
            }
          }
          return row;
        });
    }
    return out;
  };

  const openModal = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        title: plan.title || "",
        subtitle: plan.subtitle || "",
        description: plan.description || "",
        planType: plan.planType || plan.type || "WEEKLY",
        subscriptionType: String(plan.subscriptionType || "diet").toLowerCase(),
        coveredSlots: plan.coveredSlots || ["breakfast", "lunch", "snacks", "dinner"],
        // Merged over EMPTY_SLOTS so a plan saved before per-slot dishes
        // existed opens with four empty lists rather than undefined, which
        // would make `picked.includes(...)` throw on the first render.
        slotMeals: { ...EMPTY_SLOTS, ...(plan.slotMeals || {}) },
        durationDays: plan.durationDays || 7,
        price: plan.price || 0,
        discountedPrice: plan.discountedPrice || plan.price || 0,
        caloriesPerDay: plan.caloriesPerDay || plan.calories || 1800,
        calories: plan.calories || plan.caloriesPerDay || 1800,
        protein: plan.protein || 120,
        carbs: plan.carbs || 180,
        fats: plan.fats || 45,
        fiber: plan.fiber || 30,
        mealsPerDay: plan.mealsPerDay || 3,
        breakfastMenu: plan.breakfastMenu || "",
        lunchMenu: plan.lunchMenu || "",
        dinnerMenu: plan.dinnerMenu || "",
        snackMenu: plan.snackMenu || "",
        foodType: plan.foodType || "Veg",
        deliveryTiming: plan.deliveryTiming || plan.deliverySlot || "07:30 AM - 08:30 AM",
        availableDays: plan.availableDays || "Monday to Sunday",
        maxSubscribers: plan.maxSubscribers || 100,
        activeSubscribers: plan.activeSubscribers || 0,
        imageUrl: plan.imageUrl || "",
        tags: plan.tags || [],
        isPopular: !!plan.isPopular,
        isActive: plan.isActive !== false,
        weeklySchedule: plan.weeklySchedule || initialFormState.weeklySchedule
      });
    } else {
      setEditingPlan(null);
      setFormData(initialFormState);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const cleanedSlots = cleanSlotMeals(formData.slotMeals);
      const payload = {
        ...formData,
        subscriptionType: String(formData.subscriptionType || "diet").toLowerCase(),
        coveredSlots: formData.coveredSlots || ["breakfast", "lunch", "snacks", "dinner"],
        slotMeals: cleanedSlots,
        slotMealNames: slotMealNames(cleanedSlots),
        // Display strings regenerated from the typed rows so the card text and
        // the actual selectable dishes can never disagree.
        ...summariseSlots(cleanedSlots),
        price: parseFloat(formData.price),
        discountedPrice: parseFloat(formData.discountedPrice || formData.price),
        caloriesPerDay: parseInt(formData.caloriesPerDay || formData.calories),
        calories: parseInt(formData.calories || formData.caloriesPerDay),
        protein: parseInt(formData.protein),
        carbs: parseInt(formData.carbs),
        fats: parseInt(formData.fats),
        fiber: parseInt(formData.fiber),
        mealsPerDay: parseInt(formData.mealsPerDay),
        maxSubscribers: parseInt(formData.maxSubscribers),
      };

      if (editingPlan) {
        await MealPlanService.update(editingPlan.id, payload);
        addToast("Meal Plan updated successfully!", "success");
      } else {
        await MealPlanService.create(payload);
        addToast("New Meal Plan created successfully!", "success");
      }
      setIsModalOpen(false);
      // Live subscription delivers the change.
    } catch (e) {
      addToast(`Error saving plan: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this Meal Plan?")) return;
    try {
      await MealPlanService.delete(id);
      addToast("Meal Plan deleted", "info");
      // Live subscription delivers the change.
    } catch (e) {
      addToast(`Error deleting plan: ${e.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subscription Meal Plans</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure weekly &amp; monthly subscription meal packages for customer apps.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Create New Meal Plan
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400 gap-2">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading Meal Plans...</span>
        </div>
      ) : plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div
              key={plan.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl transition-all flex flex-col justify-between"
            >
              <div>
                <div className="relative h-48 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={plan.imageUrl || "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=800&q=80"}
                    alt={plan.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                    <span className="px-2.5 py-1 bg-slate-900/90 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider">
                      {plan.planType || plan.type || 'WEEKLY'} ({plan.durationDays || 7} Days)
                    </span>
                    <span className={`px-2.5 py-1 text-white text-[10px] font-bold rounded-lg ${plan.foodType === 'Veg' ? 'bg-emerald-600' : plan.foodType === 'Non-Veg' ? 'bg-rose-600' : 'bg-amber-600'}`}>
                      {plan.foodType || 'Veg'}
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{plan.title}</h3>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">{plan.subtitle}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-2">{plan.description}</p>
                  </div>

                  <div className="grid grid-cols-4 gap-1 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Cals</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{plan.caloriesPerDay || plan.calories || 1800}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Protein</span>
                      <span className="text-xs font-bold text-emerald-600">{plan.protein || 120}g</span>
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Carbs</span>
                      <span className="text-xs font-bold text-amber-600">{plan.carbs || 160}g</span>
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Meals</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{plan.mealsPerDay || 3}/day</span>
                    </div>
                  </div>

                  {/* Meals Preview */}
                  <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {plan.breakfastMenu && <div className="truncate"><span className="font-bold text-slate-800 dark:text-slate-100">🍳 B'fast:</span> {plan.breakfastMenu}</div>}
                    {plan.lunchMenu && <div className="truncate"><span className="font-bold text-slate-800 dark:text-slate-100">🥗 Lunch:</span> {plan.lunchMenu}</div>}
                    {plan.dinnerMenu && <div className="truncate"><span className="font-bold text-slate-800 dark:text-slate-100">🍗 Dinner:</span> {plan.dinnerMenu}</div>}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div>
                  <span className="text-lg font-black text-slate-900 dark:text-white">₹{plan.discountedPrice || plan.price}</span>
                  {plan.price > plan.discountedPrice && (
                    <span className="text-xs text-slate-400 line-through ml-2">₹{plan.price}</span>
                  )}
                  <span className="text-[10px] text-slate-400 block">Slot: {plan.deliveryTiming || "07:30 AM - 08:30 AM"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openModal(plan)}
                    className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(plan.id)}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-slate-400 space-y-3">
          <span className="material-symbols-outlined text-4xl text-slate-300">calendar_month</span>
          <p className="font-semibold text-sm">No subscription meal plans found</p>
          <button onClick={() => openModal()} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold">
            Create First Meal Plan
          </button>
        </div>
      )}

      {/* Create/Edit Full Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 my-8">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                {editingPlan ? "Edit Meal Plan Package" : "Create New Meal Plan Package"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">1. Package Info</h3>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Plan Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. 7-Day Lean Protein & Weight Loss Plan"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Subtitle / Tagline</label>
                  <input
                    type="text"
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                    placeholder="e.g. High Protein • Controlled Carbs • Calorie Deficit"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Full Description</label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Comprehensive description of the plan..."
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Type, Pricing & Category */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">2. Type, Pricing &amp; Food Type</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Plan Type</label>
                    <select
                      value={formData.planType}
                      onChange={(e) => setFormData({ ...formData, planType: e.target.value, durationDays: e.target.value === 'WEEKLY' ? 7 : 30 })}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="WEEKLY">Weekly (7 Days)</option>
                      <option value="MONTHLY">Monthly (30 Days)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Original Price (₹) *</label>
                    <input
                      type="number"
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Discounted Price (₹)</label>
                    <input
                      type="number"
                      value={formData.discountedPrice}
                      onChange={(e) => setFormData({ ...formData, discountedPrice: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Diet Preference</label>
                    <select
                      value={formData.foodType}
                      onChange={(e) => setFormData({ ...formData, foodType: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="Veg">Vegetarian</option>
                      <option value="Non-Veg">Non-Vegetarian</option>
                      <option value="Both">Both (Flexible)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Delivery Timing</label>
                    <input
                      type="text"
                      value={formData.deliveryTiming}
                      onChange={(e) => setFormData({ ...formData, deliveryTiming: e.target.value })}
                      placeholder="07:30 AM - 08:30 AM"
                      className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Available Days</label>
                    <input
                      type="text"
                      value={formData.availableDays}
                      onChange={(e) => setFormData({ ...formData, availableDays: e.target.value })}
                      placeholder="Monday to Sunday"
                      className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Nutritional Information */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">3. Daily Nutritional Summary</h3>
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Calories (kcal)</label>
                    <input
                      type="number"
                      value={formData.caloriesPerDay}
                      onChange={(e) => setFormData({ ...formData, caloriesPerDay: e.target.value, calories: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Protein (g)</label>
                    <input
                      type="number"
                      value={formData.protein}
                      onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Carbs (g)</label>
                    <input
                      type="number"
                      value={formData.carbs}
                      onChange={(e) => setFormData({ ...formData, carbs: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Fats (g)</label>
                    <input
                      type="number"
                      value={formData.fats}
                      onChange={(e) => setFormData({ ...formData, fats: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Fiber (g)</label>
                    <input
                      type="number"
                      value={formData.fiber}
                      onChange={(e) => setFormData({ ...formData, fiber: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Plan type. Drives which catalogue every downstream screen
                  reads, so it belongs with the meal selection rather than
                  buried among the pricing fields. */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                  4. Plan type
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "diet", label: "Diet", hint: "Per-dish macros collected" },
                    { id: "regular", label: "Regular", hint: "Dish names only" },
                  ].map((t) => {
                    const active = String(formData.subscriptionType || "diet").toLowerCase() === t.id;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        // Dishes survive the switch now that they're plain text —
                        // only the nutrition columns appear or disappear, and
                        // stored macros are kept in case the admin switches back.
                        onClick={() => setFormData({ ...formData, subscriptionType: t.id })}
                        className={`text-left px-4 py-3 rounded-xl border-2 transition ${
                          active
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:border-emerald-300"
                        }`}
                      >
                        <p className={`text-sm font-bold ${active ? "text-emerald-700" : "text-slate-700 dark:text-slate-200"}`}>
                          {t.label}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{t.hint}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  Diet plans collect calories and macros for each dish, because that's
                  what the customer is buying. Regular plans record the dish name only.
                </p>
              </div>

              {/* Covered Slots Selection */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                  4b. Subscription Coverage
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { id: "all", label: "Full Day", slots: ["breakfast", "lunch", "snacks", "dinner"] },
                    { id: "breakfast", label: "Breakfast Only", slots: ["breakfast"] },
                    { id: "lunch", label: "Lunch Only", slots: ["lunch"] },
                    { id: "dinner", label: "Dinner Only", slots: ["dinner"] },
                  ].map((t) => {
                    const active = (formData.coveredSlots || []).length === t.slots.length && 
                                   t.slots.every(s => (formData.coveredSlots || []).includes(s));
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setFormData({ ...formData, coveredSlots: t.slots })}
                        className={`text-center px-2 py-2 rounded-xl border-2 transition ${
                          active
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:border-emerald-300"
                        }`}
                      >
                        <p className={`text-xs font-bold ${active ? "text-emerald-700" : "text-slate-700 dark:text-slate-200"}`}>
                          {t.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  Select which meals the customer will receive each day. The customer app will hide the selection tabs for slots that are not covered by this package.
                </p>
              </div>

              {/* Per-slot dish selection.
                  These were four free-text boxes — "Oats Upma / Moong Dal
                  Cheela" typed as prose. Nothing downstream could read them:
                  the customer's meal picker and the kitchen's list both work
                  from dish ids, so a plan's advertised menu and its actual
                  selectable dishes were unrelated pieces of data that only
                  looked connected. Picking real dishes here makes them the
                  same thing. */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                  5. Dishes included, by meal time
                </h3>

                <p className="text-[11px] text-slate-400">
                  Type the dishes yourself — these aren't tied to the Menu Items list,
                  so you can word them however you like and change them each week.
                  {isDietPlan && " Macros are per dish and shown to the customer."}
                </p>

                <div className="space-y-3">
                  {SLOTS.map((slot) => {
                    const rows = normaliseSlotRows(formData.slotMeals?.[slot.id]);
                    return (
                      <div key={slot.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {slot.icon} {slot.label}
                            <span className="ml-1.5 font-normal text-slate-400">{slot.window}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => addSlotRow(slot.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold"
                          >
                            + Add dish
                          </button>
                        </div>

                        <div className="p-2 space-y-2">
                          {rows.length === 0 && (
                            <p className="text-[11px] text-slate-400 px-1 py-1.5">
                              No dishes for this meal time yet.
                            </p>
                          )}

                          {rows.map((row, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="text"
                                value={row.name || ""}
                                onChange={(e) => setSlotField(slot.id, i, "name", e.target.value)}
                                placeholder="Dish name"
                                className="flex-1 min-w-[10rem] px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                              />

                              {isDietPlan && NUTRIENTS.map((n) => (
                                <input
                                  key={n.id}
                                  type="number"
                                  min="0"
                                  value={row[n.id] ?? ""}
                                  onChange={(e) => setSlotField(slot.id, i, n.id, e.target.value)}
                                  placeholder={n.label}
                                  title={n.label}
                                  className={`${n.width} px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-center`}
                                />
                              ))}

                              <button
                                type="button"
                                onClick={() => removeSlotRow(slot.id, i)}
                                title="Remove this dish"
                                className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <span className="material-symbols-outlined text-[16px]">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cover Image Uploader */}
              <div className="pt-2">
                <ImageUploader
                  value={formData.imageUrl}
                  onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                  folder="meal_plans"
                  label="Meal Plan Cover Image"
                />
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20"
                >
                  Save Meal Plan Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default MealPlans;
