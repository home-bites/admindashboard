import { create } from "zustand";
import { ReviewService } from "../services";

export const useReviewStore = create((set, get) => ({
  reviews: [],
  loading: false,
  error: null,

  fetchReviews: async () => {
    set({ loading: true, error: null });
    try {
      const reviews = await ReviewService.getReviews();
      set({ reviews, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  deleteReview: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await ReviewService.deleteReview(id, actor);
      await get().fetchReviews();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useReviewStore;
