import React, { useState, useEffect, useMemo } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useSeasonalThemeStore, BUILT_IN_THEMES } from "../store/seasonalThemeStore";
import { uploadFile } from "../firebase/storage";

export const LAUNCHER_ICONS = [
  { key: "homebites_default", legacyKey: "default", name: "Classic HomeBites", color: "#0B4D3B", icon: "restaurant", img: "/app_icons/homebites_default.png", desc: "Core emerald green with golden spoon" },
  { key: "homebites_diwali", legacyKey: "diwali", name: "Diwali Sparkle", color: "#8B1E0F", icon: "flare", img: "/app_icons/homebites_diwali.png", desc: "Festive diya with golden halo" },
  { key: "homebites_sankranthi", legacyKey: "sankranthi", name: "Sankranthi Sun", color: "#9A3412", icon: "wb_sunny", img: "/app_icons/homebites_sankranthi.png", desc: "Earthen pot with harvest sugarcane" },
  { key: "homebites_ugadi", legacyKey: "ugadi", name: "Ugadi Blossom", color: "#15803D", icon: "eco", img: "/app_icons/homebites_ugadi.png", desc: "Mango leaf toran and festive neem" },
  { key: "homebites_christmas", legacyKey: "christmas", name: "Christmas Pine", color: "#1E3A1E", icon: "celebration", img: "/app_icons/homebites_christmas.png", desc: "Holiday evergreen and crimson ribbon" },
  { key: "homebites_summer", legacyKey: "summer", name: "Summer Breeze", color: "#EA580C", icon: "sunny", img: "/app_icons/homebites_summer.png", desc: "Tropical citrus and fresh cooler" },
  { key: "homebites_winter", legacyKey: "winter", name: "Winter Hearth", color: "#7C2D12", icon: "fireplace", img: "/app_icons/homebites_winter.png", desc: "Cozy warm spice and comforting soup" },
];

export const ThemeStudio = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const {
    themes,
    activeTheme,
    subscribeThemes,
    disconnectThemes,
    publishTheme,
    restoreStandardTheme,
    updateLauncherIcon,
    saveCustomTheme,
  } = useSeasonalThemeStore();

  // Tab navigation inside Theme Studio
  const [activeTab, setActiveTab] = useState("library"); // 'library', 'editor', 'identity', 'history'

  // Selected theme in editor / preview
  const [selectedTheme, setSelectedTheme] = useState(() => BUILT_IN_THEMES[0]);
  const [previewScreen, setPreviewScreen] = useState("home"); // 'home', 'login', 'details'
  const [compareWithStandard, setCompareWithStandard] = useState(false);

  // Asset upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingField, setUploadingField] = useState(null);

  // Modals
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRollbackRunning, setIsRollbackRunning] = useState(false);

  // Filter in Library
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    subscribeThemes();
    return () => disconnectThemes();
  }, [subscribeThemes, disconnectThemes]);

  // Set selectedTheme when activeTheme loads
  useEffect(() => {
    if (activeTheme?.themeId) {
      const found = themes.find((t) => t.id === activeTheme.themeId);
      if (found) setSelectedTheme(found);
    }
  }, [activeTheme, themes]);

  const filteredThemes = useMemo(() => {
    return themes.filter((t) => {
      const matchesCat = categoryFilter === "all" || t.category === categoryFilter;
      const matchesSearch =
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.seasonalTag?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [themes, categoryFilter, searchQuery]);

  const categories = useMemo(() => {
    const set = new Set(themes.map((t) => t.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [themes]);

  // Handle color change in editor
  const handleColorChange = (key, value) => {
    setSelectedTheme((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle asset upload
  const handleAssetUpload = async (e, field) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting same file triggers change
    e.target.value = "";

    if (uploadingField) {
      addToast({ type: "info", message: "Another asset is currently uploading. Please wait." });
      return;
    }

    if (!user) {
      addToast({ type: "error", message: "Authentication required: Please sign in as an administrator to upload theme assets." });
      return;
    }

    const userRole = (user.role || "").toLowerCase().replace(/[-_]/g, " ");
    const isSuperOrAdmin =
      userRole.includes("admin") ||
      user.email === "homebites0657@gmail.com" ||
      user.email === "admin@homebites.com" ||
      user.email === "support@hombites.com";

    if (!isSuperOrAdmin) {
      addToast({ type: "error", message: "Access denied: Only Admins or Super Admins can upload theme assets." });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "video/mp4"];
    const isMediaByName = file.name?.toLowerCase().endsWith(".gif") || file.name?.toLowerCase().endsWith(".mp4");
    if (!allowedTypes.includes(file.type.toLowerCase()) && !isMediaByName && !file.type?.startsWith("video/")) {
      addToast({ type: "error", message: "Invalid file type: Only PNG, JPEG, WebP, GIF, and MP4 files are permitted." });
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      addToast({ type: "error", message: `Image exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a smaller image.` });
      return;
    }

    setUploadingField(field);
    setUploadProgress(10);
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `theme-assets/${field}_${Date.now()}_${sanitizedName}`;
      const url = await uploadFile(file, path, (pct) => setUploadProgress(pct));

      setSelectedTheme((prev) => ({
        ...prev,
        [field]: url,
      }));
      addToast({ type: "success", message: "Asset uploaded and linked to theme successfully!" });
    } catch (err) {
      console.error("[ThemeStudio] Upload failed:", err);
      let errMsg = err.message || "Unknown error";
      if (/unauthorized|permission-denied|403/i.test(errMsg)) {
        errMsg = "Storage permission denied (403). Verify that your admin session is active and storage rules permit theme-assets.";
      } else if (/quota-exceeded/i.test(errMsg)) {
        errMsg = "Firebase Storage quota exceeded. Please check storage usage in Firebase console.";
      } else if (/canceled/i.test(errMsg)) {
        errMsg = "Upload was cancelled.";
      } else if (/retry-limit-exceeded|network/i.test(errMsg)) {
        errMsg = "Network timeout during upload. Please check your internet connection.";
      }
      addToast({ type: "error", message: `Upload failed: ${errMsg}` });
    } finally {
      setUploadingField(null);
      setUploadProgress(0);
    }
  };

  // Handle Publish Now
  const handleConfirmPublish = async () => {
    setIsPublishing(true);
    try {
      await publishTheme(selectedTheme, user);
      addToast({
        type: "success",
        message: `Theme "${selectedTheme.name}" published! Customer app will reflect this experience instantly.`,
      });
      setShowPublishModal(false);
    } catch (err) {
      addToast({ type: "error", message: `Publishing failed: ${err.message}` });
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle Emergency Rollback
  const handleConfirmRollback = async () => {
    setIsRollbackRunning(true);
    try {
      await restoreStandardTheme(user);
      addToast({
        type: "success",
        message: "Emergency Rollback complete: Standard HomeBites palette and default icon restored across all apps.",
      });
      setShowRollbackModal(false);
    } catch (err) {
      addToast({ type: "error", message: `Rollback failed: ${err.message}` });
    } finally {
      setIsRollbackRunning(false);
    }
  };

  // Handle Saving Custom Theme
  const handleSaveTheme = async () => {
    try {
      await saveCustomTheme(selectedTheme, user);
      addToast({ type: "success", message: `Theme "${selectedTheme.name}" saved to library.` });
      setActiveTab("library");
    } catch (err) {
      addToast({ type: "error", message: `Save failed: ${err.message}` });
    }
  };

  const isCurrentActive = (themeId) => {
    return activeTheme?.isActive && activeTheme?.themeId === themeId;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-gradient-to-r from-[#073025] to-[#0B4D3B] p-6 text-white shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#B7D52D] text-3xl">palette</span>
            <h1 className="text-2xl font-bold tracking-tight">Seasonal Theme Studio</h1>
            <span className="rounded-full bg-[#B7D52D]/20 px-2.5 py-0.5 text-xs font-semibold text-[#B7D52D] border border-[#B7D52D]/40">
              Live App Branding
            </span>
          </div>
          <p className="mt-1 text-sm text-emerald-100/80">
            Publish seasonal themes, festive banners, and launcher icons to the customer app without a Play Store update.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowRollbackModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600/90 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold shadow-md transition-all active:scale-95"
            title="Immediately clear seasonal overrides and restore standard HomeBites branding"
          >
            <span className="material-symbols-outlined text-lg">restore</span>
            Restore Standard Theme
          </button>

          <button
            onClick={() => {
              setSelectedTheme({
                id: `custom-${Date.now()}`,
                name: "New Custom Theme",
                category: "Custom",
                description: "Custom seasonal theme created by HomeBites admin.",
                primaryColor: "#0B4D3B",
                secondaryColor: "#073025",
                accentColor: "#FF7A00",
                backgroundColor: "#F8F5EE",
                surfaceColor: "#FFFFFF",
                textColor: "#1B1C1E",
                textSecondaryColor: "#74777F",
                cardBorderColor: "#E2E8E5",
                greetingText: "Delicious feasts prepared with love",
                seasonalTag: "Special Feast",
                launcherIconKey: "default",
                loadingStyle: "standard_shimmer",
                heroBannerUrl: "",
                backgroundArtworkUrl: "",
                decorativeIllustrationUrl: "",
              });
              setActiveTab("editor");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B7D52D] hover:bg-[#a6c226] text-[#073025] px-4 py-2 text-sm font-bold shadow-md transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Create Theme
          </button>
        </div>
      </div>

      {/* Active Theme Status Bar */}
      <div className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: activeTheme?.primaryColor || "#0B4D3B" }}
          >
            {activeTheme?.isActive ? "★" : "✓"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Live State:</span>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTheme?.isActive
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${activeTheme?.isActive ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                {activeTheme?.isActive ? `Active: ${activeTheme.themeName}` : "Standard HomeBites (Active)"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Launcher Icon Key: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{activeTheme?.launcherIconKey || "default"}</span> •
              Last Updated: {activeTheme?.updatedAt ? new Date(activeTheme.updatedAt).toLocaleDateString() : "Default"}
            </p>
          </div>
        </div>

        {activeTheme?.isActive && (
          <button
            onClick={() => setShowRollbackModal(true)}
            className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-base">emergency_home</span>
            Emergency Revert
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        {[
          { id: "library", label: "Theme Library (10 Templates)", icon: "grid_view" },
          { id: "editor", label: "Visual Editor & Simulator", icon: "tune" },
          { id: "identity", label: "App Launcher Identity", icon: "smartphone" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === tab.id
                ? "border-[#0B4D3B] dark:border-[#B7D52D] text-[#0B4D3B] dark:text-[#B7D52D]"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: THEME LIBRARY */}
      {activeTab === "library" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                    categoryFilter === cat
                      ? "bg-[#0B4D3B] text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  {cat === "all" ? "All Themes" : cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Themes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredThemes.map((theme) => {
              const isActive = isCurrentActive(theme.id);
              return (
                <div
                  key={theme.id}
                  className={`relative rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md flex flex-col justify-between ${
                    isActive
                      ? "border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  {/* Top Swatch Header */}
                  <div
                    className="h-28 relative p-4 flex flex-col justify-between"
                    style={{
                      background: theme.primaryColor
                        ? `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.secondaryColor || theme.primaryColor} 100%)`
                        : "#0B4D3B",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-black/30 backdrop-blur-md px-2.5 py-0.5 text-[11px] font-bold text-white tracking-wide">
                        {theme.category}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-extrabold text-[#073025] shadow">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                          LIVE ON APP
                        </span>
                      )}
                    </div>

                    <div className="text-white">
                      <h3 className="font-bold text-lg drop-shadow-sm">{theme.name}</h3>
                      <p className="text-xs text-white/80 line-clamp-1">{theme.greetingText}</p>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {theme.description}
                    </p>

                    {/* Color Swatches */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Palette:</div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-inner"
                          style={{ backgroundColor: theme.primaryColor }}
                          title={`Primary: ${theme.primaryColor}`}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-inner"
                          style={{ backgroundColor: theme.secondaryColor }}
                          title={`Secondary: ${theme.secondaryColor}`}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-inner"
                          style={{ backgroundColor: theme.accentColor }}
                          title={`Accent: ${theme.accentColor}`}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-inner"
                          style={{ backgroundColor: theme.backgroundColor }}
                          title={`Background: ${theme.backgroundColor}`}
                        />
                      </div>
                      <div className="ml-auto text-[11px] text-slate-500 font-mono">
                        Icon: {theme.launcherIconKey || "default"}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => {
                          setSelectedTheme(theme);
                          setActiveTab("editor");
                        }}
                        className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2 text-xs font-bold transition-all text-center flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        Preview &amp; Edit
                      </button>

                      <button
                        onClick={() => {
                          setSelectedTheme(theme);
                          setShowPublishModal(true);
                        }}
                        disabled={isActive}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all text-center flex items-center justify-center gap-1 ${
                          isActive
                            ? "bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed"
                            : "bg-[#0B4D3B] hover:bg-[#073025] text-white shadow-sm"
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">publish</span>
                        {isActive ? "Published" : "Publish"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: VISUAL EDITOR & SIMULATOR */}
      {activeTab === "editor" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Column (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Theme Identity Card */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0B4D3B] dark:text-[#B7D52D]">badge</span>
                  Theme Information
                </h2>
                <span className="text-xs font-mono text-slate-400">ID: {selectedTheme.id}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Theme Name</label>
                  <input
                    type="text"
                    value={selectedTheme.name || ""}
                    onChange={(e) => setSelectedTheme({ ...selectedTheme, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Category</label>
                  <input
                    type="text"
                    value={selectedTheme.category || ""}
                    onChange={(e) => setSelectedTheme({ ...selectedTheme, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Seasonal Tagline / Greeting</label>
                <input
                  type="text"
                  value={selectedTheme.greetingText || ""}
                  onChange={(e) => setSelectedTheme({ ...selectedTheme, greetingText: e.target.value })}
                  placeholder="e.g. Shubh Deepavali ✨ Special Festive Feasts"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Pill Badge Tag</label>
                <input
                  type="text"
                  value={selectedTheme.seasonalTag || ""}
                  onChange={(e) => setSelectedTheme({ ...selectedTheme, seasonalTag: e.target.value })}
                  placeholder="e.g. Festive Specials"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Color Tokens Card */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0B4D3B] dark:text-[#B7D52D]">colorize</span>
                Color Tokens
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { key: "primaryColor", label: "Primary Brand", desc: "Top header, buttons" },
                  { key: "secondaryColor", label: "Secondary Dark", desc: "Cards, containers" },
                  { key: "accentColor", label: "Accent Highlight", desc: "Offers, badges" },
                  { key: "backgroundColor", label: "Background Cream", desc: "Screen surface" },
                  { key: "surfaceColor", label: "Surface White", desc: "Card background" },
                  { key: "textColor", label: "Text Primary", desc: "Headings, body" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedTheme[key] || "#0B4D3B"}
                        onChange={(e) => handleColorChange(key, e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0"
                      />
                      <input
                        type="text"
                        value={selectedTheme[key] || ""}
                        onChange={(e) => handleColorChange(key, e.target.value)}
                        className="w-full font-mono text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 uppercase"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Asset Upload & Artwork Manager */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0B4D3B] dark:text-[#B7D52D]">photo_library</span>
                Asset Upload Manager (Firebase Storage)
              </h2>

              {uploadingField && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-3 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                    <span>Uploading {uploadingField}...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-600 h-2 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Hero Banner Upload */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-center">
                  <div className="w-24 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center border">
                    {selectedTheme.heroBannerUrl ? (
                      selectedTheme.heroBannerUrl.toLowerCase().includes(".mp4") ? (
                        <video src={selectedTheme.heroBannerUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={selectedTheme.heroBannerUrl} alt="Hero" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <span className="material-symbols-outlined text-slate-400">landscape</span>
                    )}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Hero Promotional Banner</h4>
                    <p className="text-[11px] text-slate-400">Recommended: 1200 × 500 px (2.4:1 ratio), max 5 MB (PNG, JPG, WebP, GIF, MP4)</p>
                  </div>
                  <label className={`cursor-pointer rounded-lg text-xs font-bold px-3 py-2 flex items-center gap-1.5 transition-all ${
                    uploadingField === "heroBannerUrl"
                      ? "bg-amber-100 text-amber-800 cursor-not-allowed"
                      : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
                  }`}>
                    {uploadingField === "heroBannerUrl" ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        {uploadProgress}%
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">cloud_upload</span>
                        {selectedTheme.heroBannerUrl ? "Replace" : "Upload"}
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                      disabled={!!uploadingField}
                      onChange={(e) => handleAssetUpload(e, "heroBannerUrl")}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Decorative Illustration */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-center">
                  <div className="w-24 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center border">
                    {selectedTheme.decorativeIllustrationUrl ? (
                      selectedTheme.decorativeIllustrationUrl.toLowerCase().includes(".mp4") ? (
                        <video src={selectedTheme.decorativeIllustrationUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={selectedTheme.decorativeIllustrationUrl} alt="Deco" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <span className="material-symbols-outlined text-slate-400">auto_awesome</span>
                    )}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Auth &amp; Splash Decorative Artwork</h4>
                    <p className="text-[11px] text-slate-400">Transparent PNG/WebP, animated GIF, or MP4 video for backdrop (max 5 MB)</p>
                  </div>
                  <label className={`cursor-pointer rounded-lg text-xs font-bold px-3 py-2 flex items-center gap-1.5 transition-all ${
                    uploadingField === "decorativeIllustrationUrl"
                      ? "bg-amber-100 text-amber-800 cursor-not-allowed"
                      : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
                  }`}>
                    {uploadingField === "decorativeIllustrationUrl" ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        {uploadProgress}%
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">cloud_upload</span>
                        {selectedTheme.decorativeIllustrationUrl ? "Replace" : "Upload"}
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                      disabled={!!uploadingField}
                      onChange={(e) => handleAssetUpload(e, "decorativeIllustrationUrl")}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Launcher Icon Key Selector */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0B4D3B] dark:text-[#B7D52D]">app_shortcut</span>
                Bundled App Icon Variant
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {LAUNCHER_ICONS.map((icon) => {
                  const isCur = selectedTheme.launcherIconKey === icon.key || selectedTheme.launcherIconKey === icon.legacyKey;
                  return (
                    <button
                      key={icon.key}
                      onClick={() => setSelectedTheme({ ...selectedTheme, launcherIconKey: icon.key })}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                        isCur
                          ? "border-[#0B4D3B] ring-2 ring-[#0B4D3B]/20 bg-emerald-50/50 dark:bg-emerald-950/20"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: icon.color }}
                      >
                        {icon.img ? (
                          <img src={icon.img} alt={icon.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <span className="material-symbols-outlined text-base">{icon.icon}</span>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{icon.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{icon.key}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleSaveTheme}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100"
              >
                Save as Custom Draft
              </button>

              <button
                onClick={() => setShowPublishModal(true)}
                className="rounded-xl bg-[#0B4D3B] hover:bg-[#073025] text-white px-6 py-2.5 text-xs font-bold shadow-md flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">rocket_launch</span>
                Publish Theme Now
              </button>
            </div>
          </div>

          {/* Simulator Column (5 Cols) */}
          <div className="lg:col-span-5 sticky top-20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setPreviewScreen("home")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    previewScreen === "home" ? "bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-white" : "text-slate-500"
                  }`}
                >
                  Home Screen
                </button>
                <button
                  onClick={() => setPreviewScreen("login")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    previewScreen === "login" ? "bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-white" : "text-slate-500"
                  }`}
                >
                  Login Screen
                </button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={compareWithStandard}
                  onChange={(e) => setCompareWithStandard(e.target.checked)}
                  className="rounded text-[#0B4D3B]"
                />
                Compare Standard
              </label>
            </div>

            {/* Smartphone Frame */}
            <div className="relative mx-auto w-full max-w-[340px] aspect-[9/19] rounded-[40px] border-8 border-slate-800 dark:border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
              {/* Dynamic Screen Inside Phone */}
              <div
                className="flex-1 flex flex-col overflow-y-auto text-slate-900 select-none"
                style={{
                  backgroundColor: compareWithStandard ? "#F8F5EE" : selectedTheme.backgroundColor || "#F8F5EE",
                }}
              >
                {/* Status Bar */}
                <div className="h-6 px-5 flex items-center justify-between text-[10px] font-bold text-slate-600 pt-1">
                  <span>9:41</span>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">signal_cellular_alt</span>
                    <span className="material-symbols-outlined text-[12px]">wifi</span>
                    <span className="material-symbols-outlined text-[12px]">battery_full</span>
                  </div>
                </div>

                {previewScreen === "home" ? (
                  // Home Screen Simulator
                  <div className="p-3 space-y-3 flex-1 flex flex-col">
                    {/* Header */}
                    <div
                      className="p-3.5 rounded-2xl text-white shadow-sm transition-colors duration-300"
                      style={{
                        background: compareWithStandard
                          ? "linear-gradient(135deg, #073025, #0B4D3B)"
                          : `linear-gradient(135deg, ${selectedTheme.secondaryColor || "#073025"}, ${selectedTheme.primaryColor || "#0B4D3B"})`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-white/70 uppercase tracking-wider font-bold">Delivering To</div>
                          <div className="text-xs font-bold flex items-center gap-1">
                            <span>Madhapur, Hyderabad</span>
                            <span className="material-symbols-outlined text-xs">expand_more</span>
                          </div>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase"
                          style={{
                            backgroundColor: compareWithStandard ? "#B7D52D" : selectedTheme.accentColor || "#B7D52D",
                            color: "#073025",
                          }}
                        >
                          {compareWithStandard ? "Classic" : selectedTheme.seasonalTag || "Specials"}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-white/90">
                        {compareWithStandard ? "Good food, delivered fresh" : selectedTheme.greetingText}
                      </p>
                    </div>

                    {/* Hero Banner Carousel Item */}
                    <div className="h-28 rounded-2xl overflow-hidden relative shadow-sm border border-black/5 bg-slate-200">
                      {selectedTheme.heroBannerUrl ? (
                        selectedTheme.heroBannerUrl.toLowerCase().includes(".mp4") ? (
                          <video src={selectedTheme.heroBannerUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                        ) : (
                          <img src={selectedTheme.heroBannerUrl} alt="Banner" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div
                          className="w-full h-full flex flex-col justify-end p-3 text-white"
                          style={{
                            backgroundColor: selectedTheme.primaryColor || "#0B4D3B",
                          }}
                        >
                          <span className="text-xs font-bold">{selectedTheme.seasonalTag}</span>
                          <span className="text-[10px] text-white/80">Flat ₹150 OFF on Festival Platters</span>
                        </div>
                      )}
                    </div>

                    {/* Categories Rail */}
                    <div className="flex gap-2 overflow-x-hidden">
                      {["Biryani", "Thali", "Diet Meals", "Snacks"].map((cat, idx) => (
                        <div
                          key={cat}
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap shadow-xs"
                          style={{
                            backgroundColor: idx === 0
                              ? (compareWithStandard ? "#0B4D3B" : selectedTheme.primaryColor || "#0B4D3B")
                              : "#FFFFFF",
                            color: idx === 0 ? "#FFFFFF" : "#1B1C1E",
                          }}
                        >
                          {cat}
                        </div>
                      ))}
                    </div>

                    {/* Dish Card */}
                    <div className="rounded-2xl bg-white p-3 shadow-xs border border-slate-100 flex gap-3">
                      <div className="w-16 h-16 rounded-xl bg-slate-200 overflow-hidden flex-shrink-0">
                        <img
                          src="https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=200&q=80"
                          alt="Dish"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] font-bold text-slate-800">Festive Hyderabadi Thali</div>
                          <div className="text-[10px] text-slate-400">Authentic royal flavors</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900">₹249</span>
                          <button
                            className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold text-white shadow-xs"
                            style={{
                              backgroundColor: compareWithStandard ? "#0B4D3B" : selectedTheme.primaryColor || "#0B4D3B",
                            }}
                          >
                            ADD +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Login Screen Simulator
                  <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-3 pt-4 text-center">
                      <div
                        className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-md"
                        style={{
                          backgroundColor: compareWithStandard ? "#0B4D3B" : selectedTheme.primaryColor || "#0B4D3B",
                        }}
                      >
                        <span className="material-symbols-outlined text-2xl">restaurant</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Welcome to HomeBites</h3>
                        <p className="text-[10px] text-slate-500">
                          {compareWithStandard ? "Fresh homestyle meals at your doorstep" : selectedTheme.greetingText}
                        </p>
                      </div>

                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold"
                        style={{
                          backgroundColor: compareWithStandard ? "#B7D52D" : selectedTheme.accentColor || "#B7D52D",
                          color: "#073025",
                        }}
                      >
                        {selectedTheme.seasonalTag}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs flex items-center gap-2">
                        <span className="font-bold text-slate-700">+91</span>
                        <span className="text-slate-400">Enter mobile number</span>
                      </div>
                      <button
                        className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-sm"
                        style={{
                          backgroundColor: compareWithStandard ? "#0B4D3B" : selectedTheme.primaryColor || "#0B4D3B",
                        }}
                      >
                        Continue with OTP
                      </button>
                    </div>

                    <div className="text-[9px] text-slate-400 text-center pb-2">
                      By signing up you agree to our Terms &amp; Privacy
                    </div>
                  </div>
                )}

                {/* Bottom Nav Bar */}
                <div className="h-10 bg-white border-t border-slate-100 flex items-center justify-around text-slate-400">
                  <span
                    className="material-symbols-outlined text-base"
                    style={{ color: compareWithStandard ? "#0B4D3B" : selectedTheme.primaryColor }}
                  >
                    home
                  </span>
                  <span className="material-symbols-outlined text-base">search</span>
                  <span className="material-symbols-outlined text-base">shopping_cart</span>
                  <span className="material-symbols-outlined text-base">person</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: APP LAUNCHER IDENTITY */}
      {activeTab === "identity" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0B4D3B] dark:text-[#B7D52D]">install_mobile</span>
              Pre-bundled Dynamic Launcher Icon Variants
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select which native icon alias the customer app enables. These 7 icon variants are pre-bundled in the app build, enabling zero-reinstall switching on Android &amp; iOS.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {LAUNCHER_ICONS.map((icon) => {
                const isSelected = activeTheme?.launcherIconKey === icon.key || activeTheme?.launcherIconKey === icon.legacyKey;
                return (
                  <div
                    key={icon.key}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 bg-amber-50/20 dark:bg-amber-950/10"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center text-white shadow-md shrink-0"
                        style={{ backgroundColor: icon.color }}
                      >
                        {icon.img ? (
                          <img src={icon.img} alt={icon.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <span className="material-symbols-outlined text-2xl">{icon.icon}</span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{icon.name}</div>
                        <div className="text-xs text-slate-400">{icon.desc}</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">key: {icon.key}</span>
                      {isSelected ? (
                        <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Currently Active
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await updateLauncherIcon(icon.key, user);
                              addToast({
                                type: "success",
                                message: `Launcher icon changed to "${icon.name}"! Customers' app icons will update.`,
                              });
                            } catch (err) {
                              addToast({ type: "error", message: err.message });
                            }
                          }}
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                        >
                          Switch to this Icon
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION PUBLISH MODAL */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: selectedTheme.primaryColor || "#0B4D3B" }}
              >
                ★
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Publish Seasonal Theme</h3>
                <p className="text-xs text-slate-500">Confirm publishing to all active customers</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Theme Name:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTheme.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Greeting:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTheme.greetingText}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Launcher Icon:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedTheme.launcherIconKey || "default"}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              The active theme reference in <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">/appSettings/seasonalTheme</code> will be updated. Customer applications will seamlessly adapt on next launch or background resume.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPublish}
                disabled={isPublishing}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B4D3B] hover:bg-[#073025] text-white shadow-md flex items-center gap-2"
              >
                {isPublishing ? "Publishing..." : "Confirm & Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY ROLLBACK MODAL */}
      {showRollbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-red-200 dark:border-red-900/40 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <span className="material-symbols-outlined text-3xl">emergency_home</span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Emergency Rollback to Standard</h3>
                <p className="text-xs text-slate-500">Restore classic HomeBites branding immediately</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              This will immediately deactivate any seasonal campaign, reset colors to official HomeBites Primary Green (#0B4D3B) &amp; Cream (#F8F5EE), restore the default launcher icon, and stamp an emergency audit log.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRollbackModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRollback}
                disabled={isRollbackRunning}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center gap-2"
              >
                {isRollbackRunning ? "Restoring..." : "Restore Standard Theme"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeStudio;
