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

  addTransaction: async (txnData, actor) => {
    set({ loading: true, error: null });
    try {
      await WalletService.createWalletTransaction(txnData, actor);
      await get().fetchTransactions();
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));

export default useWalletStore;
