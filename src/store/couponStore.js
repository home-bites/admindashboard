import { create } from "zustand";
import { CouponService } from "../services";

export const useCouponStore = create((set, get) => ({
  coupons: [],
  loading: false,
  error: null,

  fetchCoupons: async () => {
    set({ loading: true, error: null });
    try {
      const coupons = await CouponService.getCoupons();
      set({ coupons, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  unsubscribeCoupons: null,

  subscribeCoupons: () => {
    if (get().unsubscribeCoupons) return;
    
    set({ loading: true, error: null });
    
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchCoupons();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.couponRepository.listenAll((couponsList) => {
        set({ coupons: couponsList, loading: false });
      });
      set({ unsubscribeCoupons: unsub });
    }).catch(err => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectCoupons: () => {
    const unsub = get().unsubscribeCoupons;
    if (unsub) {
      unsub();
      set({ unsubscribeCoupons: null });
    }
  },

  addCoupon: async (couponData, actor) => {
    set({ loading: true, error: null });
    try {
      await CouponService.createCoupon(couponData, actor);
      await get().fetchCoupons();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateCoupon: async (id, couponData, actor) => {
    set({ loading: true, error: null });
    try {
      await CouponService.updateCoupon(id, couponData, actor);
      await get().fetchCoupons();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteCoupon: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await CouponService.deleteCoupon(id, actor);
      await get().fetchCoupons();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useCouponStore;
