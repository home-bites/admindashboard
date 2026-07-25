import React, { useState, useEffect } from "react";
import { uploadFile } from "../firebase/storage";
import { ImageUploader } from "../components/ImageUploader";
import { useUiStore } from "../store/uiStore";

export const MediaLibrary = () => {
  const { addToast } = useUiStore();
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState([
    {
      id: "img_1",
      name: "Blinkit Hero Banner",
      url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80",
      folder: "banners",
      size: "245 KB",
      createdAt: "2026-07-25",
    },
    {
      id: "img_2",
      name: "Biryani Special",
      url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80",
      folder: "foods",
      size: "310 KB",
      createdAt: "2026-07-25",
    },
    {
      id: "img_3",
      name: "Keto Protein Bowl",
      url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
      folder: "diet",
      size: "180 KB",
      createdAt: "2026-07-25",
    },
    {
      id: "img_4",
      name: "South Indian Tiffin",
      url: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&q=80",
      folder: "categories",
      size: "220 KB",
      createdAt: "2026-07-25",
    },
  ]);
  const [newUploadUrl, setNewUploadUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [targetFolder, setTargetFolder] = useState("general");

  const handleAddMedia = () => {
    if (!newUploadUrl) {
      addToast("Please upload or paste an image URL first", "error");
      return;
    }
    const newMedia = {
      id: `img_${Date.now()}`,
      name: uploadName || `Media_${Date.now()}`,
      url: newUploadUrl,
      folder: targetFolder,
      size: "Compressed WebP/JPG",
      createdAt: new Date().toISOString().split("T")[0],
    };
    setImages([newMedia, ...images]);
    setNewUploadUrl("");
    setUploadName("");
    addToast("Image added to Media Library successfully!", "success");
  };

  const handleDeleteMedia = (id) => {
    setImages(images.filter((img) => img.id !== id));
    addToast("Image deleted from Media Library", "info");
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    addToast("Image URL copied to clipboard!", "success");
  };

  const filteredImages = images.filter((img) => {
    const matchesFolder = selectedFolder === "all" || img.folder === selectedFolder;
    const matchesSearch =
      img.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.folder.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#10b981]">photo_library</span>
            Enterprise Media Library
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Shopify &amp; WordPress style centralized media management with automatic canvas compression.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-[#10b981] rounded-xl text-xs font-bold">
            {images.length} Assets Registered
          </span>
        </div>
      </div>

      {/* Upload Box Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          Upload New Asset to Cloud Storage
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Asset Name</label>
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="e.g. Summer Special Thali Banner"
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Target Folder</label>
            <select
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="general">General</option>
              <option value="banners">Banners &amp; Marketing</option>
              <option value="categories">Food Categories</option>
              <option value="foods">Menu Foods</option>
              <option value="diet">Diet &amp; Nutri Meals</option>
              <option value="mealplans">Weekly Meal Schedules</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <ImageUploader
              value={newUploadUrl}
              onChange={setNewUploadUrl}
              folder={targetFolder}
              label="Select / Drag File"
              helpText="Auto-compressed to max 1200px JPEG"
            />
          </div>
        </div>
        {newUploadUrl && (
          <button
            onClick={handleAddMedia}
            className="w-full py-2.5 bg-[#10b981] hover:bg-[#0ea5e9] text-white rounded-xl font-bold text-xs transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">cloud_done</span>
            Save to Media Library
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        {/* Folder Tabs */}
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          {["all", "banners", "categories", "foods", "diet", "mealplans"].map((folder) => (
            <button
              key={folder}
              onClick={() => setSelectedFolder(folder)}
              className={`px-3 py-1.5 rounded-xl capitalize transition-all ${
                selectedFolder === folder
                  ? "bg-[#10b981] text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              {folder}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search media assets..."
            className="pl-9 pr-4 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          />
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-base">search</span>
        </div>
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {filteredImages.map((img) => (
          <div
            key={img.id}
            className="group relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all"
          >
            <div className="h-32 bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
              <img src={img.url} alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <span className="absolute top-2 left-2 bg-slate-900/80 text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase">
                {img.folder}
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{img.name}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{img.createdAt}</span>
                <span>{img.size}</span>
              </div>
              <div className="pt-2 flex gap-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => handleCopyUrl(img.url)}
                  className="flex-1 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-[#10b981] hover:text-white text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-[12px]">content_copy</span>
                  Copy
                </button>
                <button
                  onClick={() => handleDeleteMedia(img.id)}
                  className="px-2 py-1 bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-[10px] font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-[12px]">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
