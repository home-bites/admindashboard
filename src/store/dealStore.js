import { create } from "zustand";
import { DealService } from "../services";

export const useDealStore = create((set, get) => ({
  deals: [],
  loading: false,
  error: null,

  fetchDeals: async () => {
    set({ loading: true, error: null });
    try {
      const deals = await DealService.getDeals();
      set({ deals, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  addDeal: async (dealData, actor) => {
    set({ loading: true, error: null });
    try {
      await DealService.createDeal(dealData, actor);
      await get().fetchDeals();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateDeal: async (id, dealData, actor) => {
    set({ loading: true, error: null });
    try {
      await DealService.updateDeal(id, dealData, actor);
      await get().fetchDeals();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteDeal: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await DealService.deleteDeal(id, actor);
      await get().fetchDeals();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useDealStore;
