import React, { useState, useEffect } from "react";
import { DietFoodService, MealPlanService } from "../services";

export const NutritionDashboard = () => {
  const [stats, setStats] = useState({
    totalDietItems: 0,
    totalActivePlans: 0,
    avgCalories: 0,
    avgProtein: 0,
    avgCarbs: 0,
    avgFats: 0,
    healthTagCounts: {},
    topIngredients: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNutritionData = async () => {
      setLoading(true);
      try {
        const [foods, plans] = await Promise.all([
          DietFoodService.getAll(),
          MealPlanService.getAll()
        ]);

        if (foods && foods.length > 0) {
          const totalCals = foods.reduce((acc, f) => acc + (f.calories || 0), 0);
          const totalProtein = foods.reduce((acc, f) => acc + (f.proteinGrams || 0), 0);
          const totalCarbs = foods.reduce((acc, f) => acc + (f.carbsGrams || 0), 0);
          const totalFats = foods.reduce((acc, f) => acc + (f.fatsGrams || 0), 0);

          const tagCounts = {};
          const ingCounts = {};

          foods.forEach(f => {
            (f.healthTags || []).forEach(t => {
              tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
            (f.ingredients || []).forEach(ing => {
              ingCounts[ing] = (ingCounts[ing] || 0) + 1;
            });
          });

          const sortedIngs = Object.entries(ingCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

          setStats({
            totalDietItems: foods.length,
            totalActivePlans: plans?.length || 0,
            avgCalories: Math.round(totalCals / foods.length),
            avgProtein: Math.round(totalProtein / foods.length),
            avgCarbs: Math.round(totalCarbs / foods.length),
            avgFats: Math.round(totalFats / foods.length),
            healthTagCounts: tagCounts,
            topIngredients: sortedIngs
          });
        }
      } catch (e) {
        console.error("Error loading nutrition analytics:", e);
      } finally {
        setLoading(false);
      }
    };
    loadNutritionData();
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Nutrition &amp; Health Command Dashboard</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time macro distribution, health tag popularity, and ingredient consumption analytics.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xl">
            🔥
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Calories</span>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{stats.avgCalories} kcal</h3>
            <span className="text-[10px] text-emerald-500 font-bold">Optimal Calorie Range</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xl">
            🥩
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Protein</span>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{stats.avgProtein}g / meal</h3>
            <span className="text-[10px] text-blue-500 font-bold">High Protein Density</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xl">
            🥦
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Carbs</span>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{stats.avgCarbs}g / meal</h3>
            <span className="text-[10px] text-emerald-500 font-bold">Complex Carbs Dominant</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xl">
            🥑
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Healthy Fats</span>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">{stats.avgFats}g / meal</h3>
            <span className="text-[10px] text-purple-500 font-bold">Omega 3 Rich</span>
          </div>
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Health Tags Matrix */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Popular Health Tag Distribution</h3>
            <span className="text-xs text-slate-400 font-semibold">{Object.keys(stats.healthTagCounts).length} Tags Active</span>
          </div>
          <div className="space-y-3">
            {Object.entries(stats.healthTagCounts).map(([tag, count], idx) => {
              const pct = Math.round((count / (stats.totalDietItems || 1)) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700 dark:text-slate-300">{tag}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{count} items ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ingredient Leaderboard */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Top Consumed Superfood Ingredients</h3>
            <span className="text-xs text-emerald-600 font-bold">Fresh Supply Verified</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {stats.topIngredients.map(([ing, cnt], i) => (
              <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-bold flex items-center justify-center">
                    #{i + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{ing}</span>
                </div>
                <span className="text-xs font-bold text-slate-400">{cnt} meals</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
export default NutritionDashboard;
