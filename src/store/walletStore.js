import { create } from "zustand";
import { WalletService } from "../services";

/**
 * How many of the newest ledger rows the wallet screen streams.
 *
 * Enough to cover recent activity at a glance; the page pages back through
 * history on demand and reads lifetime totals from server-side aggregation
 * rather than from this array.
 */
export const WALLET_LEDGER_WINDOW = 200;

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

    /*
     * Bounded to the newest slice of the ledger.
     *
     * This was `listenAll` — a live subscription to every wallet transaction
     * ever written. The ledger is append-only and grows with every order,
     * refund and cashback, so it is one of the fastest-growing collections in
     * the system and the one least suited to being streamed in full.
     *
     * The list on screen only ever shows recent activity, so a window costs
     * nothing there. The lifetime totals that used to be reduced from this
     * array are now server-side `sum()` aggregations, which stay correct at
     * any collection size — see `Wallet.jsx`. Bounding the array without
     * moving those totals would have turned them into partial sums still
     * labelled as lifetime figures.
     */
    import("../repositories").then((repos) => {
      const unsub = repos.walletTransactionRepository.listenRecent(
        { limitTo: WALLET_LEDGER_WINDOW },
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
