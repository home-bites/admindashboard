import React, { useState, useEffect } from "react";
import { MealPlanService } from "../services";
import { useUiStore } from "../store/uiStore";
import { ImageUploader } from "../components/ImageUploader";

export const MealPlans = () => {
  const { addToast } = useUiStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  const initialFormState = {
    title: "7-Day Lean Protein & Weight Loss Plan",
    subtitle: "High Protein • Controlled Carbs • Calorie Deficit",
    description: "Complete 7-day chef curated diet program delivered fresh every morning with precise calorie & macro calculation.",
    planType: "WEEKLY",
    durationDays: 7,
    price: 2499,
    discountedPrice: 1999,
    caloriesPerDay: 1600,
    calories: 1600,
    protein: 120,
    carbs: 160,
    fats: 40,
    fiber: 28,
    mealsPerDay: 3,
    breakfastMenu: "Oats Vegetable Upma / Multigrain Moong Dal Cheela with Mint Chutney",
    lunchMenu: "Grilled Paneer / Chicken Protein Bowl with Quinoa & Steamed Veggies",
    dinnerMenu: "Millet & Lentil Khichdi / Pan Seared Tofu with Cucumber Salad",
    snackMenu: "Sprouts & Pomegranate Chaat + Cold Pressed Green Detox Juice",
    foodType: "Veg",
    deliveryTiming: "07:30 AM - 08:30 AM",
    availableDays: "Monday to Sunday",
    maxSubscribers: 50,
    activeSubscribers: 18,
    imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=800&q=80",
    tags: ["Weight Loss", "High Protein"],
    isPopular: true,
    isActive: true,
    weeklySchedule: {
      Monday: "Breakfast: Oats Upma | Lunch: Paneer Quinoa Bowl | Dinner: Millet Khichdi",
      Tuesday: "Breakfast: Moong Dal Cheela | Lunch: Grilled Chicken Bowl | Dinner: Tofu Salad",
      Wednesday: "Breakfast: Sprouted Chaat | Lunch: Rajma Brown Rice | Dinner: Vegetable Soup",
      Thursday: "Breakfast: Multigrain Paratha | Lunch: Paneer Salad | Dinner: Dal Khichdi",
      Friday: "Breakfast: Vegetable Upma | Lunch: Tikka Protein Bowl | Dinner: Roasted Veggies",
      Saturday: "Breakfast: Protein Pancake | Lunch: Egg/Paneer Macro Box | Dinner: Light Soup",
      Sunday: "Breakfast: Chef Special Bowl | Lunch: Biryani Macro Box | Dinner: Detox Juice",
    }
  };

  const [formData, setFormData] = useState(initialFormState);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await MealPlanService.getAll();
      setPlans(data || []);
    } catch (e) {
      addToast("Failed to load meal plans", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openModal = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        title: plan.title || "",
        subtitle: plan.subtitle || "",
        description: plan.description || "",
        planType: plan.planType || plan.type || "WEEKLY",
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
      const payload = {
        ...formData,
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
      loadPlans();
    } catch (e) {
      addToast(`Error saving plan: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this Meal Plan?")) return;
    try {
      await MealPlanService.delete(id);
      addToast("Meal Plan deleted", "info");
      loadPlans();
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

              {/* Meal Menu Breakdown */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">4. Daily Meals Included</h3>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">🍳 Breakfast Options</label>
                  <input
                    type="text"
                    value={formData.breakfastMenu}
                    onChange={(e) => setFormData({ ...formData, breakfastMenu: e.target.value })}
                    placeholder="e.g. Oats Upma / Moong Dal Cheela with Mint Chutney"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">🥗 Lunch Options</label>
                  <input
                    type="text"
                    value={formData.lunchMenu}
                    onChange={(e) => setFormData({ ...formData, lunchMenu: e.target.value })}
                    placeholder="e.g. Grilled Paneer / Chicken Protein Bowl with Quinoa"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">🍗 Dinner Options</label>
                  <input
                    type="text"
                    value={formData.dinnerMenu}
                    onChange={(e) => setFormData({ ...formData, dinnerMenu: e.target.value })}
                    placeholder="e.g. Millet Khichdi / Pan Seared Tofu with Roasted Veggies"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">🍇 Snack Options (Optional)</label>
                  <input
                    type="text"
                    value={formData.snackMenu}
                    onChange={(e) => setFormData({ ...formData, snackMenu: e.target.value })}
                    placeholder="e.g. Sprouts & Pomegranate Chaat + Cold Pressed Juice"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
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
