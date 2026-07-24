import { create } from "zustand";
import { CategoryService } from "../services";

export const useCategoryStore = create((set, get) => ({
  categories: [],
  loading: false,
  error: null,

  fetchCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await CategoryService.getCategories();
      set({ categories, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  unsubscribeCategories: null,

  subscribeCategories: () => {
    if (get().unsubscribeCategories) return;
    
    set({ loading: true, error: null });
    
    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchCategories();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.categoryRepository.listenAll((cats) => {
        set({ categories: cats, loading: false });
      });
      set({ unsubscribeCategories: unsub });
    }).catch(err => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectCategories: () => {
    const unsub = get().unsubscribeCategories;
    if (unsub) {
      unsub();
      set({ unsubscribeCategories: null });
    }
  },

  addCategory: async (categoryData, actor) => {
    set({ loading: true, error: null });
    try {
      await CategoryService.createCategory(categoryData, actor);
      await get().fetchCategories();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  updateCategory: async (id, categoryData, actor) => {
    set({ loading: true, error: null });
    try {
      await CategoryService.updateCategory(id, categoryData, actor);
      await get().fetchCategories();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteCategory: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await CategoryService.deleteCategory(id, actor);
      await get().fetchCategories();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useCategoryStore;
