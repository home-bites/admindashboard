import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useMenuStore } from "../store/menuStore";
import { useCategoryStore } from "../store/categoryStore";
import { uploadFile } from "../firebase/storage";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const MenuItems = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  
  const { menuItems, loading: menuLoading, subscribeMenuItems, disconnectMenuItems, addMenuItem, updateMenuItem, deleteMenuItem } = useMenuStore();
  const { categories, subscribeCategories, disconnectCategories } = useCategoryStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItemId, setEditItemId] = useState(null);

  // Modal fields
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemOfferPrice, setItemOfferPrice] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemFoodType, setItemFoodType] = useState("Veg"); // maps to isVeg, isEgg, foodType ("Veg", "Non-Veg", "Egg")
  const [itemAvailable, setItemAvailable] = useState(true); // maps to isAvailable
  const [itemRecommended, setItemRecommended] = useState(false); // maps to isRecommended
  const [itemPrepTime, setItemPrepTime] = useState(""); // maps to preparationTime
  const [itemDisplayOrder, setItemDisplayOrder] = useState(0); // maps to displayOrder
  const [itemImage, setItemImage] = useState("");
  const [itemTags, setItemTags] = useState(""); // parses to array of strings
  const [itemAddons, setItemAddons] = useState([{ name: "", price: "", isVeg: true }]); // array of objects

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    subscribeMenuItems();
    subscribeCategories();
    return () => {
      disconnectMenuItems();
      disconnectCategories();
    };
  }, [subscribeMenuItems, subscribeCategories, disconnectMenuItems, disconnectCategories]);

  useEffect(() => {
    if (categories.length > 0 && !itemCategory) {
      setItemCategory(categories[0].name);
    }
  }, [categories, itemCategory]);

  const handleOpenAddModal = () => {
    setEditItemId(null);
    setItemName("");
    setItemCategory(categories[0]?.name || "Mains");
    setItemPrice("");
    setItemOfferPrice("");
    setItemDesc("");
    setItemFoodType("Veg");
    setItemAvailable(true);
    setItemRecommended(false);
    setItemPrepTime("15");
    setItemDisplayOrder(0);
    setItemImage("");
    setItemTags("");
    setItemAddons([{ name: "", price: "", isVeg: true }]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditItemId(item.id);
    setItemName(item.name);
    setItemCategory(item.categoryId || "");
    setItemPrice(item.price ? item.price.toString() : "");
    setItemOfferPrice(item.offerPrice ? item.offerPrice.toString() : "");
    setItemDesc(item.description || "");
    
    // Parse Veg / Non-Veg / Egg states
    if (item.foodType === "Egg" || item.isEgg) {
      setItemFoodType("Egg");
    } else if (item.isVeg !== false) {
      setItemFoodType("Veg");
    } else {
      setItemFoodType("Non-Veg");
    }

    setItemAvailable(item.isAvailable !== false);
    setItemRecommended(item.isRecommended || false);
    setItemPrepTime(item.preparationTime ? item.preparationTime.toString() : "15");
    setItemDisplayOrder(item.displayOrder || 0);
    setItemImage(item.image || "");
    setItemTags(item.tags ? item.tags.join(", ") : "");
    setItemAddons(
      item.addons && item.addons.length > 0
        ? item.addons.map((a) => ({ name: a.name, price: a.price.toString(), isVeg: a.isVeg !== false }))
        : [{ name: "", price: "", isVeg: true }]
    );
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadFile(file, `menuItems/${Date.now()}_${file.name}`);
      setItemImage(url);
      addToast("Item image uploaded successfully", "success");
    } catch (err) {
      console.error("Upload error:", err);
      addToast("Failed to upload image", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleAddAddonRow = () => {
    setItemAddons([...itemAddons, { name: "", price: "", isVeg: true }]);
  };

  const handleRemoveAddonRow = (index) => {
    const newAddons = itemAddons.filter((_, idx) => idx !== index);
    setItemAddons(newAddons.length > 0 ? newAddons : [{ name: "", price: "", isVeg: true }]);
  };

  const handleAddonChange = (index, field, value) => {
    const newAddons = [...itemAddons];
    newAddons[index][field] = value;
    setItemAddons(newAddons);
  };

  const handleToggleAvailable = async (item) => {
    const nextVal = !item.isAvailable;
    try {
      await updateMenuItem(item.id, { isAvailable: nextVal }, user);
      addToast(
        `Item "${item.name}" is now ${nextVal ? "Available" : "Out of Stock"}`,
        nextVal ? "success" : "warning"
      );
    } catch (err) {
      addToast(`Error updating item availability: ${err.message}`, "error");
    }
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!itemName.trim() || !itemPrice || !itemCategory) {
      addToast("Please fill in all required fields", "error");
      return;
    }

    // Process tags
    const tagsArray = itemTags
      ? itemTags.split(",").map((t) => t.trim()).filter((t) => t !== "")
      : [];

    // Process addons
    const addonsArray = itemAddons
      .filter((a) => a.name.trim() !== "" && a.price !== "")
      .map((a) => ({ name: a.name.trim(), price: Number(a.price), isVeg: a.isVeg !== false }));

    const isVegVal = itemFoodType === "Veg";
    const isEggVal = itemFoodType === "Egg";

    const payload = {
      name: itemName,
      categoryId: itemCategory, 
      price: Number(itemPrice),
      offerPrice: itemOfferPrice ? Number(itemOfferPrice) : null,
      description: itemDesc,
      isVeg: isVegVal,
      isEgg: isEggVal,
      foodType: itemFoodType,
      isAvailable: itemAvailable,
      isRecommended: itemRecommended,
      preparationTime: Number(itemPrepTime),
      displayOrder: Number(itemDisplayOrder),
      image: itemImage,
      tags: tagsArray,
      addons: addonsArray
    };

    try {
      if (editItemId) {
        await updateMenuItem(editItemId, payload, user);
        addToast("Menu item updated successfully", "success");
      } else {
        await addMenuItem(payload, user);
        addToast("New menu item created successfully", "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      addToast(`Error saving item: ${err.message}`, "error");
    }
  };

  const handleDeleteItem = async (id, name) => {
    if (confirm(`Are you sure you want to delete the menu item "${name}"?`)) {
      try {
        await deleteMenuItem(id, user);
        addToast(`Menu item "${name}" deleted (Soft Delete)`, "success");
      } catch (err) {
        addToast(`Error deleting item: ${err.message}`, "error");
      }
    }
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || item.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-8 bg-[#f4f6f9] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-bold text-2xl text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Menu Management
          </h1>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Configure dishes, prices, tags, options, and addons.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs px-5 py-2.5 rounded-lg border-t border-white/20 transition-all flex items-center gap-2 shadow-xs justify-center w-full sm:w-auto inner-shine animate-none"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add Menu Item
        </button>
      </div>

      {/* Toolbar Filter Section */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mb-6 shadow-3xs">
        <div className="relative w-full md:max-w-xs flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[18px]">search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-lg focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all text-xs font-semibold text-slate-700 placeholder:text-slate-400"
            placeholder="Search menu items..."
            type="text"
          />
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 items-center w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory("All")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              selectedCategory === "All"
                ? "bg-[#10b981] text-white border-transparent shadow-3xs"
                : "bg-white text-slate-500 border-slate-200 hover:text-slate-800"
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${
                selectedCategory === cat.name
                  ? "bg-[#10b981] text-white border-transparent shadow-3xs"
                  : "bg-white text-slate-500 border-slate-200 hover:text-slate-800"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid View */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon="restaurant_menu"
          title="No Dishes Registered"
          description="Create your first delicious recipe and publish it for customer ordering."
          actionText="Add Menu Item"
          onActionClick={handleOpenAddModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`bg-white border border-slate-150 rounded-xl overflow-hidden shadow-3xs hover:shadow-2xs transition-shadow flex flex-col ${
                item.isAvailable === false ? "opacity-75" : ""
              }`}
            >
              {/* Card Image Area */}
              <div className="h-44 w-full bg-slate-100 relative">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-350">
                    <span className="material-symbols-outlined text-4xl">restaurant</span>
                    <span className="text-[10px] font-bold mt-1 uppercase">No dish image</span>
                  </div>
                )}
                {item.isRecommended && (
                  <span className="absolute top-3 left-3 bg-[#10b981] text-white font-bold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs">
                    Best Seller
                  </span>
                )}
              </div>

              {/* Card Body */}
              <div className="p-5 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-base text-slate-800 tracking-tight truncate pr-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                    {item.name}
                  </h3>
                  
                  {/* Actions */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="text-slate-400 hover:text-[#10b981] p-1 rounded hover:bg-slate-50 transition-colors"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id, item.name)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>

                {/* Dietary Tags (Veg / Non-Veg / Egg) */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`w-3.5 h-3.5 border flex items-center justify-center text-[7px] font-bold rounded-sm ${
                    item.foodType === "Egg" || item.isEgg 
                      ? "border-amber-500 text-amber-500" 
                      : item.isVeg 
                        ? "border-green-600 text-green-600" 
                        : "border-red-600 text-red-600"
                  }`}>
                    ●
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {item.foodType === "Egg" || item.isEgg 
                      ? "Eggitarian" 
                      : item.isVeg 
                        ? "Veg" 
                        : "Non-Veg"}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 mb-3 flex-1">
                  {item.description || "No dish description available."}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
                  <div className="flex flex-col">
                    <span className="font-black text-[#10b981] text-base">
                      ₹{Number(item.price || 0).toFixed(2)}
                    </span>
                    {item.offerPrice && (
                      <span className="text-[10px] text-slate-400 line-through">
                        ₹{Number(item.offerPrice || 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                  
                  {/* Availability */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {item.isAvailable ? "In Stock" : "Out of Stock"}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        checked={item.isAvailable !== false}
                        onChange={() => handleToggleAvailable(item)}
                        className="sr-only peer"
                        type="checkbox"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Menu Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-slate-200 w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                {editItemId ? "Edit Menu Item" : "Add New Menu Item"}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveItem} className="flex flex-col flex-1 overflow-y-auto">
              <div className="p-6 space-y-5 flex-1">
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                    Item Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                    placeholder="e.g. Spicy Chicken Sandwich"
                    required
                    type="text"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={itemCategory}
                      onChange={(e) => setItemCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                      {categories.length === 0 && (
                        <>
                          <option value="Mains">Mains</option>
                          <option value="Sides">Sides</option>
                          <option value="Beverages">Beverages</option>
                        </>
                      )}
                    </select>
                  </div>
                  
                  {/* Veg / Non-Veg / Egg toggles */}
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Food Type <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setItemFoodType("Veg")}
                        className={`py-2 border rounded-lg font-bold text-xs transition-all ${
                          itemFoodType === "Veg"
                            ? "bg-green-50 border-green-500 text-green-700 font-semibold" 
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        Veg
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemFoodType("Non-Veg")}
                        className={`py-2 border rounded-lg font-bold text-xs transition-all ${
                          itemFoodType === "Non-Veg"
                            ? "bg-red-50 border-red-500 text-red-700 font-semibold" 
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        Non-Veg
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemFoodType("Egg")}
                        className={`py-2 border rounded-lg font-bold text-xs transition-all ${
                          itemFoodType === "Egg"
                            ? "bg-amber-50 border-amber-500 text-amber-700 font-semibold" 
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        Egg
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Price (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                      type="number"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Offer Price (₹)
                    </label>
                    <input
                      value={itemOfferPrice}
                      onChange={(e) => setItemOfferPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="e.g. 120"
                      step="0.01"
                      min="0"
                      type="number"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Prep Time (min)
                    </label>
                    <input
                      value={itemPrepTime}
                      onChange={(e) => setItemPrepTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="15"
                      type="number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">Display Order</label>
                    <input
                      value={itemDisplayOrder}
                      onChange={(e) => setItemDisplayOrder(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="0"
                      type="number"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">Tags (Comma-separated)</label>
                    <input
                      value={itemTags}
                      onChange={(e) => setItemTags(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="e.g. Best Seller, Spicy"
                      type="text"
                    />
                  </div>
                </div>

                {/* File Upload Image */}
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">Item Image</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {itemImage ? (
                        <img src={itemImage} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-3xl text-slate-400">image</span>
                      )}
                    </div>
                    <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-750 font-bold text-xs px-4 py-2 rounded-lg border border-slate-200 transition-all flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                      {uploading ? "Uploading..." : "Upload Image"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all resize-none"
                    placeholder="Describe the food item..."
                    rows="2"
                  />
                </div>

                {/* Add-ons Builder */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider">Customizable Add-ons</label>
                    <button
                      type="button"
                      onClick={handleAddAddonRow}
                      className="text-[#10b981] font-bold text-xs flex items-center gap-1 hover:underline animate-none"
                    >
                      <span className="material-symbols-outlined text-[15px]">add_circle</span> Add Row
                    </button>
                  </div>
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {itemAddons.map((addon, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          value={addon.name}
                          onChange={(e) => handleAddonChange(index, "name", e.target.value)}
                          className="flex-grow min-w-0 px-2 py-1.5 bg-white border border-[#d3daea] rounded-lg font-semibold text-xs text-slate-700 focus:outline-none"
                          placeholder="e.g. Extra Cheese"
                          type="text"
                        />
                        <div className="relative w-20 flex-shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">₹</span>
                          <input
                            value={addon.price}
                            onChange={(e) => handleAddonChange(index, "price", e.target.value)}
                            className="w-full pl-5 pr-2 py-1.5 bg-white border border-[#d3daea] rounded-lg font-semibold text-xs text-slate-700 focus:outline-none"
                            placeholder="Price"
                            type="number"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddonChange(index, "isVeg", addon.isVeg === undefined ? false : !addon.isVeg)}
                          className={`p-1 border rounded-lg flex items-center justify-center min-w-[28px] h-[28px] shrink-0 ${
                            addon.isVeg !== false ? "border-green-600 text-green-600 bg-green-50" : "border-red-600 text-red-600 bg-red-50"
                          }`}
                          title={addon.isVeg !== false ? "Veg" : "Non-Veg"}
                        >
                          <span className="text-[10px]">●</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveAddonRow(index)}
                          className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-all shrink-0 animate-none"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#f0f3ff] rounded-lg p-4 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-750">Available for Order</h4>
                      <p className="text-[10px] text-slate-400 font-semibold">Visible and purchasable by customers.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        checked={itemAvailable}
                        onChange={(e) => setItemAvailable(e.target.checked)}
                        className="sr-only peer"
                        type="checkbox"
                      />
                      <div className="w-11 h-6 bg-slate-250 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>
                  <div className="h-px bg-slate-200 w-full"></div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-750">Mark as Recommended</h4>
                      <p className="text-[10px] text-slate-400 font-semibold">Highlight item with best seller badge.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        checked={itemRecommended}
                        onChange={(e) => setItemRecommended(e.target.checked)}
                        className="sr-only peer"
                        type="checkbox"
                      />
                      <div className="w-11 h-6 bg-slate-250 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors bg-white border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 font-bold text-xs text-white bg-[#10b981] hover:bg-[#059669] rounded-lg shadow-xs border-t border-white/20 transition-colors inner-shine disabled:opacity-75"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuItems;
