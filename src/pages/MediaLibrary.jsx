import React, { useState, useEffect, useCallback } from "react";
import { ImageUploader } from "../components/ImageUploader";
import ErrorState from "../components/ErrorState";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { mediaAssetRepository } from "../repositories";

/**
 * Media Library.
 *
 * ── What this page used to be ────────────────────────────────────────────
 *
 * A `useState` array seeded with four hardcoded Unsplash URLs — "Blinkit Hero
 * Banner", "Biryani Special" and two others — presented as the contents of an
 * "Enterprise Media Library" with an asset count above it.
 *
 * Uploading did put the file in Firebase Storage (the shared ImageUploader
 * did that part), but "Save to Media Library" then pushed a record onto the
 * local array and reported "added successfully". Deleting spliced the array
 * and said "deleted". Neither touched a database. On the next refresh every
 * asset the admin had catalogued was gone and the four stock photographs were
 * back, and the delete button implied a destructive action it never performed
 * — a file "deleted" here stayed in Storage forever.
 *
 * It is now backed by the `mediaAssets` collection through the same
 * repository layer as every other page, so the library persists, is shared
 * between admins, and its counts are real.
 */
const FOLDERS = ["all", "banners", "categories", "foods", "diet", "mealplans", "general"];

/** Bytes to a human size, or a dash when the size was never recorded. */
const formatSize = (bytes) =>
  Number.isFinite(bytes) && bytes > 0
    ? bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`
    : "—";

export const MediaLibrary = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [newUploadUrl, setNewUploadUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [targetFolder, setTargetFolder] = useState("general");

  /* Live, so two admins cataloguing assets see each other's work. The
     collection is a catalogue — bounded by how many images the business has —
     so a full subscription is appropriate here. */
  const subscribe = useCallback(() => {
    setLoading(true);
    setError(null);
    return mediaAssetRepository.listenAll(
      (items) => {
        setImages(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Could not load the media library.");
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    const unsub = subscribe();
    return () => unsub && unsub();
  }, [subscribe]);

  const handleAddMedia = async () => {
    if (!newUploadUrl) {
      addToast("Please upload or paste an image URL first", "error");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await mediaAssetRepository.create({
        name: uploadName.trim() || `Asset ${new Date().toLocaleDateString()}`,
        url: newUploadUrl,
        folder: targetFolder,
        uploadedBy: user?.uid || "unknown",
      });
      setNewUploadUrl("");
      setUploadName("");
      addToast("Asset saved to the media library", "success");
    } catch (err) {
      // Previously impossible to reach, because nothing was written.
      addToast(`Could not save the asset: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedia = async (asset) => {
    if (
      !window.confirm(
        `Remove "${asset.name}" from the media library?\n\n` +
          "This removes the catalogue entry. Anywhere the image is already in " +
          "use — a banner, a menu item — keeps working, because those store the " +
          "URL themselves.",
      )
    ) {
      return;
    }
    setDeletingId(asset.id);
    try {
      await mediaAssetRepository.delete(asset.id);
      addToast("Asset removed from the library", "success");
    } catch (err) {
      addToast(`Could not remove the asset: ${err.message}`, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      addToast("Image URL copied", "success");
    } catch {
      // clipboard is unavailable over plain HTTP and when permission is
      // refused; claiming success there sends the admin to paste nothing.
      addToast("Could not copy — your browser blocked clipboard access.", "error");
    }
  };

  const filteredImages = images.filter((img) => {
    const matchesFolder = selectedFolder === "all" || img.folder === selectedFolder;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      String(img.name || "").toLowerCase().includes(q) ||
      String(img.folder || "").toLowerCase().includes(q);
    return matchesFolder && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#10b981]">photo_library</span>
            Media Library
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reusable images for banners, categories, foods and meal plans. Uploaded to
            Firebase Storage and catalogued here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-[#10b981] rounded-xl text-xs font-bold">
            {loading ? "Loading…" : `${images.length} assets`}
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
            disabled={saving}
            className="w-full py-2.5 bg-[#10b981] hover:bg-[#0ea5e9] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">cloud_done</span>
            {saving ? "Saving…" : "Save to Media Library"}
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        {/* Folder Tabs */}
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          {FOLDERS.map((folder) => (
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

      {/* Media Grid — three distinct outcomes, previously all one blank grid. */}
      {error ? (
        <ErrorState
          title="Could not load the media library"
          message={error}
          onRetry={subscribe}
        />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl border border-slate-200/80 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" />
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <span className="material-symbols-outlined text-[30px] text-slate-400">photo_library</span>
          <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            {images.length === 0 ? "No assets yet" : "Nothing matches these filters"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {images.length === 0
              ? "Upload an image above to add the first asset."
              : "Try a different folder or clear the search."}
          </p>
        </div>
      ) : (
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
                <span>{img.createdAt ? new Date(img.createdAt).toLocaleDateString() : "—"}</span>
                <span>{formatSize(img.sizeBytes)}</span>
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
                  onClick={() => handleDeleteMedia(img)}
                  disabled={deletingId === img.id}
                  aria-label={`Remove ${img.name}`}
                  className="px-2 py-1 bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50 rounded-lg text-[10px] font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-[12px]">delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
};
