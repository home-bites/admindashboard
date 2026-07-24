import { create } from "zustand";
import { DeliveryPartnerService } from "../services";

export const useDeliveryPartnerStore = create((set, get) => ({
  deliveryPartners: [],
  loading: false,
  error: null,

  fetchDeliveryPartners: async () => {
    set({ loading: true, error: null });
    try {
      const deliveryPartners = await DeliveryPartnerService.getDeliveryPartners();
      set({ deliveryPartners, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  unsubscribePartners: null,

  subscribeDeliveryPartners: () => {
    if (get().unsubscribePartners) return;
    
    set({ loading: true, error: null });
    
    // Fallback to fetch if mock mode
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchDeliveryPartners();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.deliveryPartnerRepository.listenAll((partners) => {
        set({ deliveryPartners: partners, loading: false });
      });
      set({ unsubscribePartners: unsub });
    }).catch(err => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectDeliveryPartners: () => {
    const unsub = get().unsubscribePartners;
    if (unsub) {
      unsub();
      set({ unsubscribePartners: null });
    }
  },

  addDeliveryPartner: async (partnerData, actor) => {
    set({ loading: true, error: null });
    try {
      await DeliveryPartnerService.createDeliveryPartner(partnerData, actor);
      await get().fetchDeliveryPartners();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateDeliveryPartner: async (id, partnerData, actor) => {
    set({ loading: true, error: null });
    try {
      await DeliveryPartnerService.updateDeliveryPartner(id, partnerData, actor);
      await get().fetchDeliveryPartners();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteDeliveryPartner: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await DeliveryPartnerService.deleteDeliveryPartner(id, actor);
      await get().fetchDeliveryPartners();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useDeliveryPartnerStore;
