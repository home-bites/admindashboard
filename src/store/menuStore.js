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
