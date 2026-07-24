import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useCategoryStore } from "../store/categoryStore";
import { uploadFile } from "../firebase/storage";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const Categories = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { categories, loading, error, subscribeCategories, disconnectCategories, addCategory, updateCategory, deleteCategory } = useCategoryStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState(null);
  
  // Modal Fields
  const [catName, setCatName] = useState("");
  const [catImage, setCatImage] = useState("");
  const [catStatus, setCatStatus] = useState("Active");
  const [displayOrder, setDisplayOrder] = useState(0);
  
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    subscribeCategories();
    return () => disconnectCategories();
  }, [subscribeCategories, disconnectCategories]);

  const handleOpenAddModal = () => {
    setEditCategoryId(null);
    setCatName("");
    setCatImage("");
    setCatStatus("Active");
    setDisplayOrder(0);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat) => {
    setEditCategoryId(cat.id);
    setCatName(cat.name);
    setCatImage(cat.image || "");
    setCatStatus(cat.status || "Active");
    setDisplayOrder(cat.displayOrder || 0);
    setIsModalOpen(true);
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const imageUrl = await uploadFile(file, `categories/${Date.now()}_${file.name}`);
      setCatImage(imageUrl);
      addToast("Category image uploaded successfully", "success");
    } catch (err) {
      console.error("Upload error:", err);
      addToast("Failed to upload category image", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) {
      addToast("Please enter a category name", "error");
      return;
    }

    const payload = {
      name: catName,
      image: catImage,
      status: catStatus,
      displayOrder: Number(displayOrder)
    };

    try {
      if (editCategoryId) {
        await updateCategory(editCategoryId, payload, user);
        addToast("Category updated successfully", "success");
      } else {
        await addCategory(payload, user);
        addToast("New category created successfully", "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      addToast(`Error saving category: ${err.message}`, "error");
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (confirm(`Are you sure you want to delete the category "${name}"?`)) {
      try {
        await deleteCategory(id, user);
        addToast(`Category "${name}" deleted (Soft Delete)`, "success");
      } catch (err) {
        addToast(`Error deleting category: ${err.message}`, "error");
      }
    }
  };

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading && categories.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  return (
    <div className="p-8 bg-[#f9f9ff] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-bold text-2xl text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Categories</h1>
          <p className="text-xs text-slate-400 font-semibold mt-1">Manage your menu categories and their display order.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs px-5 py-2.5 rounded-lg border-t border-white/20 transition-all flex items-center gap-2 shadow-xs justify-center w-full sm:w-auto inner-shine"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add Category
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-100 rounded-xl p-3.5 flex items-center gap-3 mb-6 shadow-2xs">
        <div className="relative flex-grow max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-lg focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all text-xs font-semibold text-[#151c27] placeholder:text-slate-400"
            placeholder="Search categories..."
            type="text"
          />
        </div>
      </div>

      {/* Grid of Categories */}
      {filteredCategories.length === 0 ? (
        <EmptyState
          icon="category"
          title="No Categories Available"
          description="Click the button to create a new category."
          actionText="Add Category"
          onActionClick={handleOpenAddModal}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className={`bg-white border border-slate-150 rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow group relative ${
                cat.status !== "Active" ? "opacity-75" : ""
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-150">
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-3xl text-[#10b981]">fastfood</span>
                  )}
                </div>
                <div className="flex gap-1.5 items-center">
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                      cat.status === "Active"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-slate-100 text-slate-500 border-slate-250"
                    }`}
                  >
                    {cat.status}
                  </span>
                  
                  {/* Action Buttons */}
                  <div className="flex">
                    <button
                      onClick={() => handleOpenEditModal(cat)}
                      className="text-slate-400 hover:text-[#10b981] p-1 rounded hover:bg-slate-50 transition-colors"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>{cat.name}</h3>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">Display Order: {cat.displayOrder || 0}</p>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => handleOpenEditModal(cat)}
                  className="text-[#10b981] font-bold text-xs hover:underline"
                >
                  Configure Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#151c27]/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-[0_10px_30px_rgba(0,0,0,0.08)] overflow-hidden border border-slate-200 animate-slide-up">
            <div className="flex justify-between items-center p-6 border-b border-slate-150">
              <h2 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                {editCategoryId ? "Edit Category" : "Add Category"}
              </h2>
              <button
                className="text-slate-400 hover:bg-slate-50 p-2 rounded-full transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveCategory}>
              <div className="p-6 space-y-5">
                {/* Name Input */}
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">Category Name</label>
                  <input
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                    placeholder="e.g. Burgers"
                    required
                    type="text"
                  />
                </div>

                {/* Display Order */}
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">Display Order</label>
                  <input
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value)}
                    className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                    placeholder="0"
                    type="number"
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">Category Image</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {catImage ? (
                        <img src={catImage} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-3xl text-slate-400">image</span>
                      )}
                    </div>
                    <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg border border-slate-200 transition-all flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      {uploading ? "Uploading..." : "Upload Image"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="font-bold text-xs text-slate-700">Active Status</p>
                    <p className="text-[10px] text-slate-400 font-semibold">Toggle visible/hidden status</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      checked={catStatus === "Active"}
                      onChange={(e) => setCatStatus(e.target.checked ? "Active" : "Inactive")}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-11 h-6 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                  </label>
                </div>
              </div>

              <div className="p-6 border-t border-slate-150 flex justify-end gap-3 bg-[#f9f9ff] rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-xs text-slate-500 bg-white border border-[#d3daea] rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 font-bold text-xs text-white bg-[#10b981] border-t border-white/20 rounded-lg hover:bg-[#059669] transition-colors shadow-xs inner-shine disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;
