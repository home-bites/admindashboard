import React, { useState, useEffect } from "react";
import { DietFoodService, DietCategoryService } from "../services";
import { useUiStore } from "../store/uiStore";
import { ImageUploader } from "../components/ImageUploader";

export const DietFoods = () => {
  const { addToast } = useUiStore();
  const [foods, setFoods] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    discountedPrice: "",
    categoryId: "",
    categoryName: "",
    imageUrl: "",
    mealTime: "Morning",
    calories: 350,
    proteinGrams: 28,
    carbsGrams: 30,
    fatsGrams: 12,
    fiberGrams: 8,
    glycemicIndex: 45,
    healthTags: ["High Protein", "Low Carb"],
    allergens: ["Nuts"],
    ingredients: ["Grilled Chicken Breast", "Quinoa", "Avocado", "Steamed Broccoli"],
    isAvailable: true,
    stockQuantity: 50
  });

  const availableTags = ["Keto", "High Protein", "Low Carb", "Vegan", "Vegetarian", "Gluten-Free", "Diabetic Friendly", "Heart Healthy", "Weight Loss"];

  const loadData = async () => {
    setLoading(true);
    try {
      const [foodList, catList] = await Promise.all([
        DietFoodService.getAll(),
        DietCategoryService.getAll()
      ]);
      setFoods(foodList || []);
      setCategories(catList || []);
    } catch (e) {
      console.error("Error loading diet foods:", e);
      addToast("Failed to load diet foods", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingFood(null);
    setFormData({
      name: "",
      description: "",
      price: "",
      discountedPrice: "",
      categoryId: categories[0]?.id || "",
      categoryName: categories[0]?.name || "Weight Loss",
      imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
      mealTime: "Morning",
      calories: 420,
      proteinGrams: 35,
      carbsGrams: 25,
      fatsGrams: 14,
      fiberGrams: 7,
      glycemicIndex: 40,
      healthTags: ["High Protein", "Keto"],
      allergens: [],
      ingredients: ["Salmon", "Asparagus", "Olive Oil", "Lemon"],
      isAvailable: true,
      stockQuantity: 40
    });
    
    setMealThumbnail(meal.thumbnail || '');
    setMealGallery(meal.gallery || []);
    setMealIngredients(meal.ingredients ? meal.ingredients.join(', ') : '');
    setMealAllergens(meal.allergens ? meal.allergens.join(', ') : '');
    setMealCookingTime(meal.cookingTime || '');
    setMealSpiceLevel(meal.spiceLevel || 'Mild');
    setMealBadges(meal.badges ? meal.badges.join(', ') : '');
    setMealIsHidden(meal.isHidden || false);

    setIsModalOpen(true);
  };

  const openEditModal = (food) => {
    setEditingFood(food);
    setFormData({
      name: food.name || "",
      description: food.description || "",
      price: food.price || "",
      discountedPrice: food.discountedPrice || food.price || "",
      categoryId: food.categoryId || "",
      categoryName: food.categoryName || "",
      imageUrl: food.imageUrl || "",
      mealTime: food.mealTime || "Morning",
      calories: food.calories || 0,
      proteinGrams: food.proteinGrams || 0,
      carbsGrams: food.carbsGrams || 0,
      fatsGrams: food.fatsGrams || 0,
      fiberGrams: food.fiberGrams || 0,
      glycemicIndex: food.glycemicIndex || 0,
      healthTags: food.healthTags || [],
      allergens: food.allergens || [],
      ingredients: food.ingredients || [],
      isAvailable: food.isAvailable !== false,
      stockQuantity: food.stockQuantity || 0
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingFood) {
        await DietFoodService.update(editingFood.id, formData);
        addToast("Diet Food updated successfully!", "success");
      } else {
        await DietFoodService.create(formData);
        addToast("New Diet Food created successfully!", "success");
      }
      setIsModalOpen(false);
      loadData();
    } catch (e) {
      addToast(`Error saving food item: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this diet food item?")) return;
    try {
      await DietFoodService.delete(id);
      addToast("Diet Food item deleted", "info");
      loadData();
    } catch (e) {
      addToast(`Error deleting item: ${e.message}`, "error");
    }
  };

  const toggleHealthTag = (tag) => {
    setFormData(prev => {
      const exists = prev.healthTags.includes(tag);
      return {
        ...prev,
        healthTags: exists ? prev.healthTags.filter(t => t !== tag) : [...prev.healthTags, tag]
      };
    });
  };

  const filteredFoods = foods.filter(f => {
    const matchesSearch = f.name?.toLowerCase().includes(search.toLowerCase()) || f.description?.toLowerCase().includes(search.toLowerCase());
    const matchesTag = selectedTag === "ALL" || (f.healthTags && f.healthTags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Diet &amp; Health Foods</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage nutrient-dense, calorie-counted meals with complete macro breakdowns.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Diet Meal
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="relative w-full md:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by meal name or ingredient..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Health Tag Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedTag("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              selectedTag === "ALL"
                ? "bg-slate-900 dark:bg-emerald-500 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            All Items
          </button>
          {availableTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                selectedTag === tag
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Diet Foods Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400 gap-2">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading Diet Foods catalog...</span>
        </div>
      ) : filteredFoods.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredFoods.map(food => (
            <div
              key={food.id}
              className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                {/* Image & Badges */}
                <div className="relative h-44 overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={food.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"}
                    alt={food.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 bg-slate-900/80 backdrop-blur-md text-white font-mono font-bold text-[10px] rounded-lg">
                      🔥 {food.calories || 0} kcal
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
                    {(food.healthTags || []).slice(0, 2).map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-emerald-500/90 backdrop-blur-md text-white text-[9px] font-bold rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-snug">{food.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{food.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">₹{food.discountedPrice || food.price}</span>
                      {food.discountedPrice && food.discountedPrice !== food.price && (
                        <span className="text-[10px] text-slate-400 line-through block">₹{food.price}</span>
                      )}
                    </div>
                  </div>

                  {/* Macro Pills Matrix */}
                  <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Protein</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{food.proteinGrams || 0}g</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Carbs</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{food.carbsGrams || 0}g</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Fats</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{food.fatsGrams || 0}g</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Fiber</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{food.fiberGrams || 0}g</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${food.isAvailable !== false ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                  {food.isAvailable !== false ? 'In Stock' : 'Out of Stock'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(food)}
                    className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(food.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
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
          <span className="material-symbols-outlined text-4xl text-slate-300">nutrition</span>
          <p className="font-semibold text-sm">No diet food items found</p>
          <button onClick={openCreateModal} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold">
            Create First Diet Food Item
          </button>
        </div>
      )}

      {/* Modal for Create/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {editingFood ? "Edit Diet Meal" : "Add New Diet Meal"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Meal Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Avocado Grilled Salmon Bowl"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => {
                      const cat = categories.find(c => c.id === e.target.value);
                      setFormData({ ...formData, categoryId: e.target.value, categoryName: cat?.name || "" });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Meal Time Selector */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Meal Time Filter</label>
                <div className="grid grid-cols-4 gap-2">
                  {["Morning", "Afternoon", "Evening", "Night"].map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setFormData({ ...formData, mealTime: time })}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                        formData.mealTime === time
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Pricing & Image */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Regular Price (₹)</label>
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
              <div className="col-span-full">
                <ImageUploader
                  value={formData.imageUrl}
                  onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                  folder="diet_foods"
                  label="Diet Meal Photo"
                />
              </div>
              </div>

              {/* Macros Breakdown */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Nutrition &amp; Macros Breakdown</h4>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Calories (kcal)</label>
                    <input type="number" value={formData.calories} onChange={(e) => setFormData({ ...formData, calories: e.target.value })} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Protein (g)</label>
                    <input type="number" value={formData.proteinGrams} onChange={(e) => setFormData({ ...formData, proteinGrams: e.target.value })} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Carbs (g)</label>
                    <input type="number" value={formData.carbsGrams} onChange={(e) => setFormData({ ...formData, carbsGrams: e.target.value })} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Fats (g)</label>
                    <input type="number" value={formData.fatsGrams} onChange={(e) => setFormData({ ...formData, fatsGrams: e.target.value })} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Fiber (g)</label>
                    <input type="number" value={formData.fiberGrams} onChange={(e) => setFormData({ ...formData, fiberGrams: e.target.value })} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">GI Index</label>
                    <input type="number" value={formData.glycemicIndex} onChange={(e) => setFormData({ ...formData, glycemicIndex: e.target.value })} className="w-full mt-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded text-xs" />
                  </div>
                </div>
              </div>

              {/* Health Tags Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Health Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleHealthTag(tag)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        formData.healthTags.includes(tag)
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold"
                >
                  Save Diet Food Item
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default DietFoods;
