import { create } from "zustand";
import { BannerService } from "../services";

export const useBannerStore = create((set, get) => ({
  banners: [],
  loading: false,
  error: null,

  fetchBanners: async () => {
    set({ loading: true, error: null });
    try {
      const banners = await BannerService.getBanners();
      set({ banners, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  unsubscribeBanners: null,

  subscribeBanners: () => {
    if (get().unsubscribeBanners) return;
    
    set({ loading: true, error: null });
    
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchBanners();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.bannerRepository.listenAll((bannersList) => {
        set({ banners: bannersList, loading: false });
      });
      set({ unsubscribeBanners: unsub });
    }).catch(err => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectBanners: () => {
    const unsub = get().unsubscribeBanners;
    if (unsub) {
      unsub();
      set({ unsubscribeBanners: null });
    }
  },

  addBanner: async (bannerData, actor) => {
    set({ loading: true, error: null });
    try {
      await BannerService.createBanner(bannerData, actor);
      await get().fetchBanners();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateBanner: async (id, bannerData, actor) => {
    set({ loading: true, error: null });
    try {
      await BannerService.updateBanner(id, bannerData, actor);
      await get().fetchBanners();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteBanner: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await BannerService.deleteBanner(id, actor);
      await get().fetchBanners();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useBannerStore;
