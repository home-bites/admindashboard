import React, { useState, useEffect } from "react";
import { DietCategoryService } from "../services";
import { useUiStore } from "../store/uiStore";

export const DietCategories = () => {
  const { addToast } = useUiStore();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    imageUrl: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
    displayOrder: 1,
    isActive: true
  });

  const loadCategories = async () => {
    setLoading(true);
    try {
      const list = await DietCategoryService.getAll();
      setCategories(list || []);
    } catch (e) {
      addToast("Failed to load diet categories", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openModal = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      setFormData({
        name: cat.name || "",
        description: cat.description || "",
        imageUrl: cat.imageUrl || "",
        displayOrder: cat.displayOrder || 1,
        isActive: cat.isActive !== false
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: "Lean Muscle & Power",
        description: "High-protein, complex-carb meals tailored for athletic performance and recovery.",
        imageUrl: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
        displayOrder: categories.length + 1,
        isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await DietCategoryService.update(editingCategory.id, formData);
        addToast("Diet category updated successfully!", "success");
      } else {
        await DietCategoryService.create(formData);
        addToast("New diet category created successfully!", "success");
      }
      setIsModalOpen(false);
      loadCategories();
    } catch (e) {
      addToast(`Error saving category: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this diet category?")) return;
    try {
      await DietCategoryService.delete(id);
      addToast("Diet category deleted", "info");
      loadCategories();
    } catch (e) {
      addToast(`Error deleting category: ${e.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Diet Categories</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage health &amp; wellness taxonomies for customer app discovery.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Category
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400 gap-2">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading diet categories...</span>
        </div>
      ) : categories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl transition-all flex flex-col justify-between"
            >
              <div>
                <div className="relative h-36 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={cat.imageUrl || "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80"}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 text-white text-[10px] font-bold rounded">
                    Order #{cat.displayOrder || 1}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{cat.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{cat.description}</p>
                </div>
              </div>

              <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cat.isActive !== false ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                  {cat.isActive !== false ? 'Active' : 'Disabled'}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => openModal(cat)} className="p-1.5 text-slate-500 hover:text-emerald-600 rounded">
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-slate-500 hover:text-rose-600 rounded">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-slate-400 space-y-3">
          <span className="material-symbols-outlined text-4xl text-slate-300">spa</span>
          <p className="font-semibold text-sm">No diet categories defined yet</p>
          <button onClick={() => openModal()} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold">
            Create First Diet Category
          </button>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {editingCategory ? "Edit Category" : "Add Category"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Image URL</label>
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 border rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold">Save Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default DietCategories;
