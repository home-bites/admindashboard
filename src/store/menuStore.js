import { create } from "zustand";
import { MenuItemService } from "../services";

export const useMenuStore = create((set, get) => ({
  menuItems: [],
  loading: false,
  error: null,

  fetchMenuItems: async () => {
    set({ loading: true, error: null });
    try {
      const menuItems = await MenuItemService.getMenuItems();
      set({ menuItems, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  unsubscribeMenuItems: null,

  subscribeMenuItems: () => {
    if (get().unsubscribeMenuItems) return;
    
    set({ loading: true, error: null });
    
    // Fallback to fetch if mock mode
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchMenuItems();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.menuItemRepository.listenAll((items) => {
        set({ menuItems: items, loading: false });
      });
      set({ unsubscribeMenuItems: unsub });
    }).catch(err => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectMenuItems: () => {
    const unsub = get().unsubscribeMenuItems;
    if (unsub) {
      unsub();
      set({ unsubscribeMenuItems: null });
    }
  },

  addMenuItem: async (menuData, actor) => {
    set({ loading: true, error: null });
    try {
      await MenuItemService.createMenuItem(menuData, actor);
      await get().fetchMenuItems();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateMenuItem: async (id, menuData, actor) => {
    set({ loading: true, error: null });
    try {
      await MenuItemService.updateMenuItem(id, menuData, actor);
      await get().fetchMenuItems();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteMenuItem: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await MenuItemService.deleteMenuItem(id, actor);
      await get().fetchMenuItems();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useMenuStore;
