import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useUiStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "light",
      lastVisitedPage: "/dashboard",
      toasts: [],
      isSearchOpen: false,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      
      toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      
      setTheme: (theme) => {
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
          document.documentElement.classList.remove("light");
        } else {
          document.documentElement.classList.add("light");
          document.documentElement.classList.remove("dark");
        }
        set({ theme });
      },

      setLastVisitedPage: (page) => set({ lastVisitedPage: page }),

      // Toast Notification System
      addToast: (message, type = "info", duration = 4000) => {
        const id = Date.now().toString();
        const toast = { id, message, type };
        
        set((state) => ({ toasts: [...state.toasts, toast] }));

        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
          }, duration);
        }
        return id;
      },

      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
      clearToasts: () => set({ toasts: [] })
    }),
    {
      name: "homebites_ui", // LocalStorage key
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        lastVisitedPage: state.lastVisitedPage
      })
    }
  )
);
