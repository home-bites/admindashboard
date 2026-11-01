import { create } from "zustand";
import { SeasonalThemeService } from "../services";

export const BUILT_IN_THEMES = [
  {
    id: "standard-homebites",
    name: "Standard HomeBites",
    category: "Classic",
    description: "The official HomeBites identity with deep emerald green, forest dark, and crisp lime highlights.",
    primaryColor: "#0B4D3B",
    secondaryColor: "#073025",
    accentColor: "#B7D52D",
    backgroundColor: "#F8F5EE",
    surfaceColor: "#FFFFFF",
    textColor: "#1B1C1E",
    textSecondaryColor: "#74777F",
    cardBorderColor: "#E2E8E5",
    greetingText: "Good food, delivered fresh",
    seasonalTag: "HomeBites Classic",
    launcherIconKey: "default",
    loadingStyle: "standard_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "diwali-celebration",
    name: "Diwali Celebration",
    category: "Festive",
    description: "Festival of Lights theme featuring royal crimson, rich marigold gold, glowing diyas, and festive warmth.",
    primaryColor: "#8B1E0F",
    secondaryColor: "#D97706",
    accentColor: "#F59E0B",
    backgroundColor: "#FDF8F0",
    surfaceColor: "#FFFFFF",
    textColor: "#2B1810",
    textSecondaryColor: "#786256",
    cardBorderColor: "#FDE68A",
    greetingText: "Shubh Deepavali ✨ Special Festive Feasts",
    seasonalTag: "Diwali Specials",
    launcherIconKey: "diwali",
    loadingStyle: "festive_gold_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1605197584547-c93de1a02951?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "sankranthi-harvest",
    name: "Sankranthi Harvest",
    category: "Harvest Festival",
    description: "Celebrating harvest abundance with earthen pot warmth, sugarcane gold, and traditional Andhra/Telangana flavors.",
    primaryColor: "#9A3412",
    secondaryColor: "#C2410C",
    accentColor: "#FBBF24",
    backgroundColor: "#FFFBEB",
    surfaceColor: "#FFFFFF",
    textColor: "#451A03",
    textSecondaryColor: "#78350F",
    cardBorderColor: "#FDE68A",
    greetingText: "Happy Sankranthi 🌾 Authentic Harvest Delights",
    seasonalTag: "Sankranthi Specials",
    launcherIconKey: "sankranthi",
    loadingStyle: "harvest_amber_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "ugadi-celebration",
    name: "Ugadi Celebration",
    category: "New Year",
    description: "Telugu & Kannada New Year theme with fresh neem & mango green, jaggery sweetness, and blooming prosperity.",
    primaryColor: "#15803D",
    secondaryColor: "#166534",
    accentColor: "#EAB308",
    backgroundColor: "#FEFCE8",
    surfaceColor: "#FFFFFF",
    textColor: "#14532D",
    textSecondaryColor: "#3F6212",
    cardBorderColor: "#FEF08A",
    greetingText: "Ugadi Subhakankshalu 🌿 Shadruchula Ruchulu",
    seasonalTag: "Ugadi Specials",
    launcherIconKey: "ugadi",
    loadingStyle: "mango_green_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "holi-festival",
    name: "Holi Festival",
    category: "Colors & Joy",
    description: "Joyous celebration of colors with vibrant gulal magenta, royal purple, and playful sweets.",
    primaryColor: "#BE185D",
    secondaryColor: "#7E22CE",
    accentColor: "#06B6D4",
    backgroundColor: "#FDF4FF",
    surfaceColor: "#FFFFFF",
    textColor: "#3B0764",
    textSecondaryColor: "#831843",
    cardBorderColor: "#F5D0FE",
    greetingText: "Happy Holi 🎨 Color Your Palate",
    seasonalTag: "Holi Feast",
    launcherIconKey: "summer",
    loadingStyle: "colorful_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "christmas-celebration",
    name: "Christmas Celebration",
    category: "Winter Holidays",
    description: "Rich evergreen, holly crimson, warm spices, and festive baked gourmet treats.",
    primaryColor: "#1E3A1E",
    secondaryColor: "#B91C1C",
    accentColor: "#D97706",
    backgroundColor: "#F8FAFC",
    surfaceColor: "#FFFFFF",
    textColor: "#0F172A",
    textSecondaryColor: "#475569",
    cardBorderColor: "#CBD5E1",
    greetingText: "Merry Christmas 🎄 Holiday Spices & Bakes",
    seasonalTag: "Holiday Feast",
    launcherIconKey: "christmas",
    loadingStyle: "pine_holiday_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1512474932049-78ac69ede12c?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "new-year-celebration",
    name: "New Year Celebration",
    category: "Celebration",
    description: "Midnight navy elegance, champagne shimmer, and party platter feasts.",
    primaryColor: "#0F172A",
    secondaryColor: "#1E293B",
    accentColor: "#F59E0B",
    backgroundColor: "#F8FAFC",
    surfaceColor: "#FFFFFF",
    textColor: "#020617",
    textSecondaryColor: "#334155",
    cardBorderColor: "#E2E8E5",
    greetingText: "Happy New Year 🎉 Ring In New Flavors",
    seasonalTag: "New Year Feast",
    launcherIconKey: "winter",
    loadingStyle: "champagne_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1482517967863-00e15c9b44be?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "summer-specials",
    name: "Summer Specials",
    category: "Seasonal",
    description: "Refreshing mango, citrus coolers, chilled healthy bowls, and tropical delight.",
    primaryColor: "#EA580C",
    secondaryColor: "#F97316",
    accentColor: "#84CC16",
    backgroundColor: "#FFF7ED",
    surfaceColor: "#FFFFFF",
    textColor: "#431407",
    textSecondaryColor: "#7C2D12",
    cardBorderColor: "#FFEDD5",
    greetingText: "Beat the Heat ☀️ Coolers & Fresh Bowls",
    seasonalTag: "Summer Chillers",
    launcherIconKey: "summer",
    loadingStyle: "citrus_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "monsoon-specials",
    name: "Monsoon Specials",
    category: "Seasonal",
    description: "Warm chai, crisp pakoras, hot soups, and cozy rainy day comfort dining.",
    primaryColor: "#0E7490",
    secondaryColor: "#155E75",
    accentColor: "#10B981",
    backgroundColor: "#F0FDF4",
    surfaceColor: "#FFFFFF",
    textColor: "#083344",
    textSecondaryColor: "#164E63",
    cardBorderColor: "#CCFBF1",
    greetingText: "Rainy Day Comfort 🌧️ Hot Chai & Snacks",
    seasonalTag: "Monsoon Cravings",
    launcherIconKey: "winter",
    loadingStyle: "teal_rain_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
  {
    id: "winter-specials",
    name: "Winter Specials",
    category: "Seasonal",
    description: "Warm soups, slow-cooked gravies, rich ghee delicacies, and hearty winter meals.",
    primaryColor: "#7C2D12",
    secondaryColor: "#9A3412",
    accentColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
    surfaceColor: "#FFFFFF",
    textColor: "#451A03",
    textSecondaryColor: "#78350F",
    cardBorderColor: "#FEF3C7",
    greetingText: "Warm Up Your Winter 🍲 Slow-Cooked Comfort",
    seasonalTag: "Winter Warmers",
    launcherIconKey: "winter",
    loadingStyle: "cinnamon_shimmer",
    heroBannerUrl: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80",
    backgroundArtworkUrl: "",
    decorativeIllustrationUrl: "",
  },
];

export const useSeasonalThemeStore = create((set, get) => ({
  themes: BUILT_IN_THEMES,
  activeTheme: {
    isActive: false,
    themeId: "standard-homebites",
    themeName: "Standard HomeBites",
    launcherIconKey: "default",
  },
  loading: false,
  error: null,
  unsubscribeThemes: null,

  fetchThemes: async () => {
    set({ loading: true, error: null });
    try {
      const remoteThemes = await SeasonalThemeService.getThemes();
      const active = await SeasonalThemeService.getActiveTheme();
      
      // Combine built-in templates with custom remote themes
      const customOnly = remoteThemes.filter(
        (rt) => !BUILT_IN_THEMES.some((bt) => bt.id === rt.id)
      );
      
      set({
        themes: [...BUILT_IN_THEMES, ...customOnly],
        activeTheme: active || { isActive: false, themeId: "standard-homebites", launcherIconKey: "default" },
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  subscribeThemes: () => {
    if (get().unsubscribeThemes) return;
    get().fetchThemes();

    import("../repositories").then((repos) => {
      const unsub = repos.seasonalThemeRepository.listenAll((themeList) => {
        const customOnly = (themeList || []).filter(
          (rt) => !BUILT_IN_THEMES.some((bt) => bt.id === rt.id)
        );
        set({ themes: [...BUILT_IN_THEMES, ...customOnly] });
      });
      set({ unsubscribeThemes: unsub });
    }).catch((err) => {
      console.warn("Could not attach seasonalTheme listener:", err.message);
    });
  },

  disconnectThemes: () => {
    const unsub = get().unsubscribeThemes;
    if (unsub) {
      unsub();
      set({ unsubscribeThemes: null });
    }
  },

  publishTheme: async (theme, actor) => {
    set({ loading: true, error: null });
    try {
      const activePayload = await SeasonalThemeService.publishTheme(theme, actor);
      set({ activeTheme: activePayload, loading: false });
      await get().fetchThemes();
      return activePayload;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  restoreStandardTheme: async (actor) => {
    set({ loading: true, error: null });
    try {
      const standardPayload = await SeasonalThemeService.restoreStandardTheme(actor);
      set({ activeTheme: standardPayload, loading: false });
      await get().fetchThemes();
      return standardPayload;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateLauncherIcon: async (iconKey, actor) => {
    set({ loading: true, error: null });
    try {
      const updated = await SeasonalThemeService.updateLauncherIcon(iconKey, actor);
      set({ activeTheme: updated, loading: false });
      return updated;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  saveCustomTheme: async (themeData, actor) => {
    set({ loading: true, error: null });
    try {
      if (themeData.id && !BUILT_IN_THEMES.some((t) => t.id === themeData.id)) {
        await SeasonalThemeService.updateTheme(themeData.id, themeData, actor);
      } else {
        await SeasonalThemeService.createTheme(themeData, actor);
      }
      await get().fetchThemes();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteCustomTheme: async (id, actor) => {
    if (BUILT_IN_THEMES.some((t) => t.id === id)) {
      throw new Error("Built-in system templates cannot be deleted.");
    }
    set({ loading: true, error: null });
    try {
      await SeasonalThemeService.deleteTheme(id, actor);
      await get().fetchThemes();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },
}));

export default useSeasonalThemeStore;
