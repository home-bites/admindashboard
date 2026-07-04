import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthService } from "../services";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      login: async (email, password) => {
        set({ loading: true, error: null });
        try {
          const user = await AuthService.login(email, password);
          set({ user, isAuthenticated: true, loading: false });
          return user;
        } catch (error) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ loading: true });
        try {
          await AuthService.logout(get().user);
        } catch (e) {
          console.warn("Sign out service warning:", e.message);
        }
        set({ user: null, isAuthenticated: false, loading: false });
      },

      clearError: () => set({ error: null })
    }),
    {
      name: "homebites_auth" // LocalStorage key
    }
  )
);
