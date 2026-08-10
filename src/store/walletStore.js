import { create } from "zustand";
import { WalletService } from "../services";

export const useWalletStore = create((set, get) => ({
  transactions: [],
  loading: false,
  error: null,

  fetchTransactions: async () => {
    set({ loading: true, error: null });
    try {
      const transactions = await WalletService.getWalletTransactions();
      set({ transactions, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  unsubscribeTransactions: null,

  /**
   * Live subscription. Wallet rows are written by Cloud Functions on refunds
   * and cashback, not only by the admin, so the dashboard has to see writes it
   * didn't make itself. A one-shot read could show a balance that was already
   * out of date by the time it rendered.
   */
  subscribeTransactions: () => {
    if (get().unsubscribeTransactions) return;

    set({ loading: true, error: null });

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
    if (isMock) {
      get().fetchTransactions();
      return;
    }

    import("../repositories").then((repos) => {
      const unsub = repos.walletTransactionRepository.listenAll(
        (transactions) => set({ transactions, loading: false, error: null }),
        (err) => set({ error: err.message, loading: false }),
      );
      set({ unsubscribeTransactions: unsub });
    }).catch((err) => {
      set({ error: err.message, loading: false });
    });
  },

  disconnectTransactions: () => {
    const unsub = get().unsubscribeTransactions;
    if (unsub) {
      unsub();
      set({ unsubscribeTransactions: null });
    }
  },

  addTransaction: async (txnData, actor) => {
    set({ loading: true, error: null });
    try {
      await WalletService.createWalletTransaction(txnData, actor);
      if (get().unsubscribeTransactions) set({ loading: false });
      else await get().fetchTransactions();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useWalletStore;
