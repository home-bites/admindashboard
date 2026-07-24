import React, { useState, useEffect } from "react";
import { MealPlanService } from "../services";
import { useUiStore } from "../store/uiStore";

export const MealPlans = () => {
  const { addToast } = useUiStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    description: "",
    planType: "WEEKLY", // WEEKLY or MONTHLY
    durationDays: 7,
    price: 1999,
    discountedPrice: 1699,
    caloriesPerDay: 1800,
    mealsPerDay: 3,
    activeSubscribers: 24,
    imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=800&q=80",
    tags: ["Weight Loss", "Low Calorie", "Chef Curated"],
    isPopular: true
  });

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
        planType: plan.planType || "WEEKLY",
        durationDays: plan.durationDays || 7,
        price: plan.price || 0,
        discountedPrice: plan.discountedPrice || plan.price || 0,
        caloriesPerDay: plan.caloriesPerDay || 1800,
        mealsPerDay: plan.mealsPerDay || 3,
        activeSubscribers: plan.activeSubscribers || 0,
        imageUrl: plan.imageUrl || "",
        tags: plan.tags || [],
        isPopular: !!plan.isPopular
      });
    } else {
      setEditingPlan(null);
      setFormData({
        title: "7-Day Lean Protein & Weight Loss Plan",
        subtitle: "High Protein • Controlled Carbs • Calorie Deficit",
        description: "Complete 7-day chef curated diet program delivered fresh every morning with precise calorie calculation.",
        planType: "WEEKLY",
        durationDays: 7,
        price: 2499,
        discountedPrice: 1999,
        caloriesPerDay: 1600,
        mealsPerDay: 3,
        activeSubscribers: 18,
        imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=800&q=80",
        tags: ["Weight Loss", "High Protein"],
        isPopular: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await MealPlanService.update(editingPlan.id, formData);
        addToast("Meal Plan updated successfully!", "success");
      } else {
        await MealPlanService.create(formData);
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
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage weekly &amp; monthly subscription plans for diet customers.</p>
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
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <span className="px-2.5 py-1 bg-slate-900/90 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider">
                      {plan.planType || 'WEEKLY'} ({plan.durationDays || 7} Days)
                    </span>
                    {plan.isPopular && (
                      <span className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg">
                        ⭐ Bestseller
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{plan.title}</h3>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">{plan.subtitle}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-2">{plan.description}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Target Cals</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{plan.caloriesPerDay || 1800} kcal/day</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Daily Meals</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{plan.mealsPerDay || 3} meals</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Subscribers</span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{plan.activeSubscribers || 0} active</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div>
                  <span className="text-lg font-black text-slate-900 dark:text-white">₹{plan.discountedPrice || plan.price}</span>
                  <span className="text-[10px] text-slate-400 block">per subscription package</span>
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

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {editingPlan ? "Edit Meal Plan" : "Create New Meal Plan"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Plan Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Subtitle / Tagline</label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Daily Calories (kcal)</label>
                  <input
                    type="number"
                    value={formData.caloriesPerDay}
                    onChange={(e) => setFormData({ ...formData, caloriesPerDay: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Package Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Offer Price (₹)</label>
                  <input
                    type="number"
                    value={formData.discountedPrice}
                    onChange={(e) => setFormData({ ...formData, discountedPrice: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cover Image URL</label>
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 border rounded-xl text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold"
                >
                  Save Plan
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
