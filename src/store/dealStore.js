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

  unsubscribeDeals: null,

  subscribeDeals: () => {
    if (get().unsubscribeDeals) return;

    set({ loading: true, error: null });

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchDeals();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.dealRepository.listenAll(
        (deals) => set({ deals, loading: false, error: null }),
        // Keep whatever is already on screen. Blanking the list on a dropped
        // connection makes a transient network blip look like every deal was
        // deleted.
        (err) => set({ error: err.message, loading: false }),
      );
      set({ unsubscribeDeals: unsub });
    }).catch((err) => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectDeals: () => {
    const unsub = get().unsubscribeDeals;
    if (unsub) {
      unsub();
      set({ unsubscribeDeals: null });
    }
  },

  /**
   * After a write, only re-read when nothing is listening.
   *
   * With a live subscription the snapshot already delivers the change — and
   * it does so from the local cache before the server even acknowledges, so
   * it lands first. An extra getAll here would bill a second full-collection
   * read and could briefly overwrite newer snapshot data with an older
   * server response.
   */
  _settle: async () => {
    if (get().unsubscribeDeals) { set({ loading: false }); return; }
    await get().fetchDeals();
  },

  addDeal: async (dealData, actor) => {
    set({ loading: true, error: null });
    try {
      await DealService.createDeal(dealData, actor);
      await get()._settle();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateDeal: async (id, dealData, actor) => {
    set({ loading: true, error: null });
    try {
      await DealService.updateDeal(id, dealData, actor);
      await get()._settle();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteDeal: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await DealService.deleteDeal(id, actor);
      await get()._settle();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useDealStore;
