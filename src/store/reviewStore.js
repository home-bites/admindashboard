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

  unsubscribeReviews: null,

  /**
   * Live subscription. Reviews arrive from customers at unpredictable times,
   * so a one-shot read meant the admin only ever saw whatever existed at the
   * moment they opened the page — a review left thirty seconds later stayed
   * invisible until a manual refresh.
   */
  subscribeReviews: () => {
    if (get().unsubscribeReviews) return;

    set({ loading: true, error: null });

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchReviews();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.reviewRepository.listenAll(
        (reviews) => set({ reviews, loading: false, error: null }),
        (err) => set({ error: err.message, loading: false }),
      );
      set({ unsubscribeReviews: unsub });
    }).catch((err) => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectReviews: () => {
    const unsub = get().unsubscribeReviews;
    if (unsub) {
      unsub();
      set({ unsubscribeReviews: null });
    }
  },

  deleteReview: async (id, actor) => {
    set({ loading: true, error: null });
    try {
      await ReviewService.deleteReview(id, actor);
      // The snapshot delivers the removal when a listener is active; only
      // fall back to a full re-read when there isn't one.
      if (get().unsubscribeReviews) set({ loading: false });
      else await get().fetchReviews();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useReviewStore;
