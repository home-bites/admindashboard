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
