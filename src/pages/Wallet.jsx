import React, { useState, useEffect, useMemo } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { useWalletStore } from "../store/walletStore";
import { useOrderStore } from "../store/orderStore";
import { useDeliveryPartnerStore } from "../store/deliveryPartnerStore";
import {
  userRepository,
  deliveryPartnerRepository,
} from "../repositories";
import {
  isDebitRow,
  directionOf,
  accountNameFor,
} from "../lib/walletLedger";

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

const QUICK_NOTES = [
  "Goodwill compensation",
  "Delivery delay refund",
  "Missing dish compensation",
  "Promotional bonus cashback",
  "Support escalation resolution",
];

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const Wallet = () => {
  const { addToast } = useUiStore();
  const { transactions, loading, subscribeTransactions, disconnectTransactions } = useWalletStore();
  const { orders, subscribeOrders, disconnectOrders } = useOrderStore();
  const {
    deliveryPartners, subscribeDeliveryPartners, disconnectDeliveryPartners,
  } = useDeliveryPartnerStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditForm, setCreditForm] = useState({ phone: "", amount: "", note: "" });
  const [creditTarget, setCreditTarget] = useState(null);
  const [isCrediting, setIsCrediting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [lookupState, setLookupState] = useState("idle");

  const [isHistoryHidden, setIsHistoryHidden] = useState(() => {
    try {
      return localStorage.getItem("admin_wallet_display_hidden") === "true";
    } catch {
      return false;
    }
  });
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  const handleClearHistory = () => {
    setIsHistoryHidden(true);
    try {
      localStorage.setItem("admin_wallet_display_hidden", "true");
    } catch (e) {
      console.warn("Could not save wallet display preference:", e);
    }
    setShowClearConfirmModal(false);
    addToast("Transaction history hidden from Admin view. Database records remain untouched.", "info");
  };

  const handleRestoreHistory = () => {
    setIsHistoryHidden(false);
    try {
      localStorage.removeItem("admin_wallet_display_hidden");
    } catch (e) {
      console.warn("Could not remove wallet display preference:", e);
    }
    addToast("Transaction history display restored.", "success");
  };

  useEffect(() => {
    const digits = String(creditForm.phone || "").replace(/\D/g, "");
    if (digits.length < 10) {
      setCustomers([]);
      setLookupState("idle");
      return;
    }

    let cancelled = false;
    setLookupState("searching");
    const timer = setTimeout(async () => {
      try {
        const found = (
          await Promise.all([
            userRepository.findByField("phone", digits).catch(() => []),
            userRepository.findByField("phone", `+91${digits.slice(-10)}`).catch(() => []),
          ])
        ).flat();
        if (cancelled) return;
        const byId = new Map(found.map((u) => [u.id, u]));
        setCustomers([...byId.values()]);
      } finally {
        if (!cancelled) setLookupState("done");
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [creditForm.phone]);

  const [directory, setDirectory] = useState(() => new Map());
  const ledgerAccountIds = useMemo(
    () => [...new Set(transactions.map((t) => String(t.userId || t.customerId || "")).filter(Boolean))],
    [transactions],
  );
  const ledgerAccountKey = ledgerAccountIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (ledgerAccountIds.length === 0) {
      setDirectory(new Map());
      return undefined;
    }

    (async () => {
      const [users, partners] = await Promise.all([
        userRepository.getByIds(ledgerAccountIds),
        deliveryPartnerRepository.getByIds(ledgerAccountIds),
      ]);
      if (cancelled) return;
      const merged = new Map(partners);
      for (const [id, rec] of users) merged.set(id, rec);
      setDirectory(merged);
    })();

    return () => { cancelled = true; };
  }, [ledgerAccountKey]);

  useEffect(() => {
    subscribeTransactions();
    subscribeOrders();
    subscribeDeliveryPartners();
    return () => {
      disconnectTransactions();
      disconnectOrders();
      disconnectDeliveryPartners();
    };
  }, [
    subscribeTransactions, disconnectTransactions,
    subscribeOrders, disconnectOrders,
    subscribeDeliveryPartners, disconnectDeliveryPartners,
  ]);

  // Financial KPIs computed
  const kpiStats = useMemo(() => {
    let totalCredited = 0;
    let totalDebited = 0;
    let pendingRefundsVal = 0;
    let pendingRefundsCount = 0;

    transactions.forEach((t) => {
      const amt = Math.abs(Number(t.amount || 0));
      if (isDebitRow(t)) {
        totalDebited += amt;
      } else {
        totalCredited += amt;
      }

      if (t.type === "Refund" && t.status === "Pending") {
        pendingRefundsCount++;
        pendingRefundsVal += amt;
      }
    });

    const netCirculating = Math.max(0, totalCredited - totalDebited);

    return {
      netCirculating,
      totalCredited,
      totalDebited,
      pendingRefundsVal,
      pendingRefundsCount,
    };
  }, [transactions]);

  const handleCreditWallet = async () => {
    if (!creditTarget) {
      addToast("Search for the customer and select them from the dropdown list first.", "error");
      return;
    }
    if (!creditForm.amount) {
      addToast("Please enter a valid credit amount.", "error");
      return;
    }
    const amt = parseFloat(creditForm.amount);
    if (isNaN(amt) || amt <= 0) {
      addToast("Please enter a valid positive amount.", "error");
      return;
    }

    setIsCrediting(true);
    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `credit_${creditTarget.id}_${amt}_${Date.now()}`;

    try {
      const functions = getFunctions(app);
      const creditFn = httpsCallable(functions, "adminCreditCustomerWallet");
      const result = await creditFn({
        uid: creditTarget.id,
        phone: creditTarget.phone || "",
        amount: amt,
        note: creditForm.note || "Admin Wallet Credit",
        idempotencyKey,
      });
      addToast(result.data?.message || `Successfully credited ₹${amt} to ${creditTarget.displayName || "Customer"}`, "success");
      setShowCreditModal(false);
      setCreditForm({ phone: "", amount: "", note: "" });
      setCreditTarget(null);
    } catch (err) {
      addToast(`Failed to credit wallet: ${err.message}`, "error");
    } finally {
      setIsCrediting(false);
    }
  };

  const needle = searchQuery.trim().toLowerCase();
  const visibleTxns = useMemo(() => {
    if (isHistoryHidden) return [];

    return transactions.filter((t) => {
      const name = accountNameFor(t, directory) || "";
      const matchesSearch =
        needle === "" ||
        String(t.id || "").toLowerCase().includes(needle) ||
        String(t.description || "").toLowerCase().includes(needle) ||
        String(t.userId || t.customerId || "").toLowerCase().includes(needle) ||
        name.toLowerCase().includes(needle);

      if (!matchesSearch) return false;

      if (selectedTab === "All") return true;
      if (selectedTab === "Credits") return !isDebitRow(t);
      if (selectedTab === "Debits") return isDebitRow(t);
      if (selectedTab === "Refunds") return t.type === "Refund" || String(t.description || "").toLowerCase().includes("refund");

      return true;
    });
  }, [transactions, isHistoryHidden, needle, selectedTab, directory]);

  const exportCSV = () => {
    if (visibleTxns.length === 0) {
      addToast("No transactions to export.", "info");
      return;
    }
    const headers = ["Transaction ID,Account Name,Type,Amount,Direction,Status,Created At,Description"];
    const rows = visibleTxns.map((t) => {
      const name = (accountNameFor(t, directory) || "Unknown").replace(/,/g, " ");
      const isDebit = isDebitRow(t);
      const date = t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : t.createdAt || "";
      const desc = (t.description || "").replace(/,/g, " ");
      return `"${t.id}","${name}","${t.type || 'Transfer'}",${Math.abs(t.amount || 0)},"${isDebit ? 'Debit' : 'Credit'}","${t.status || 'Settled'}","${date}","${desc}"`;
    });
    const blob = new Blob([[...headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `homebites_wallet_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Exported wallet transactions CSV", "success");
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Customer Wallet & Ledger
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reconcile wallet credits, promotional incentives, order debits, and instant customer refunds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isHistoryHidden ? (
            <button
              onClick={handleRestoreHistory}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition shadow-xs"
            >
              <span className="material-symbols-outlined text-[17px]">visibility</span>
              Show History
            </button>
          ) : (
            <button
              onClick={() => setShowClearConfirmModal(true)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition shadow-xs"
            >
              <span className="material-symbols-outlined text-[17px]">visibility_off</span>
              Clear Display History
            </button>
          )}

          <button
            onClick={exportCSV}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-xs"
          >
            <span className="material-symbols-outlined text-[17px]">download</span>
            Export CSV
          </button>

          <button
            onClick={() => setShowCreditModal(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition"
          >
            <span className="material-symbols-outlined text-[18px]">add_card</span>
            Credit Customer Wallet
          </button>
        </div>
      </div>

      {/* ── Financial KPI Bento Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Circulating Balance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Circulating Balance</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-3">
            {inr(kpiStats.netCirculating)}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Live customer wallet liability</p>
        </div>

        {/* Total Credits */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Inflow (Credits)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">arrow_downward</span>
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-3">
            +{inr(kpiStats.totalCredited)}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Top-ups, cashbacks & refunds</p>
        </div>

        {/* Total Debits */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Outflow (Debits)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">arrow_upward</span>
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-3">
            -{inr(kpiStats.totalDebited)}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Order redemptions & deductions</p>
        </div>

        {/* Pending Refunds */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pending Review</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg">hourglass_top</span>
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-3">
            {kpiStats.pendingRefundsCount} Cases
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-1">Worth {inr(kpiStats.pendingRefundsVal)}</p>
        </div>
      </div>

      {/* ── Toolbar: Tabs & Search ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl self-start md:self-auto">
          {[
            { id: "All", label: "All Movements" },
            { id: "Credits", label: "Credits In" },
            { id: "Debits", label: "Debits Out" },
            { id: "Refunds", label: "Refunds" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                selectedTab === tab.id
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search account name, user ID, note..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Ledger Table ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-400">Loading ledger records...</span>
          </div>
        ) : isHistoryHidden ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">visibility_off</span>
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">History Display Hidden</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Transaction history is currently hidden from your display. All backend database balances remain intact.
            </p>
            <button
              onClick={handleRestoreHistory}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              Restore Display
            </button>
          </div>
        ) : visibleTxns.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <span className="material-symbols-outlined text-2xl">receipt_long</span>
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Transactions Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || selectedTab !== "All"
                ? "No ledger movements match your current filters."
                : "Wallet transactions will record here automatically when top-ups or order payments occur."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider font-bold text-slate-400">
                  <th className="pl-6 pr-4 py-4">Account Holder</th>
                  <th className="px-4 py-4">Type & Description</th>
                  <th className="px-4 py-4">Date & Time</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="pr-6 pl-4 py-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {visibleTxns.map((t) => {
                  const name = accountNameFor(t, directory) || "Account User";
                  const initial = name.charAt(0).toUpperCase() || "U";
                  const isDebit = isDebitRow(t);
                  const amt = Math.abs(Number(t.amount || 0));
                  const isSettled = (t.status || "Settled").toLowerCase() === "settled";

                  let dateStr = "—";
                  if (t.createdAt) {
                    const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
                    if (!isNaN(d.getTime())) {
                      dateStr = d.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    }
                  }

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      {/* Account */}
                      <td className="pl-6 pr-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white ${
                            isDebit ? "bg-slate-700" : "bg-emerald-600"
                          }`}>
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{name}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              ID: {String(t.userId || t.customerId || t.id).slice(0, 10)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type & Description */}
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className={`material-symbols-outlined text-sm ${isDebit ? 'text-rose-500' : 'text-emerald-500'}`}>
                              {isDebit ? "arrow_upward" : "arrow_downward"}
                            </span>
                            {t.type || (isDebit ? "Order Debit" : "Top-up Credit")}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs truncate">
                            {t.description || t.note || "Standard wallet movement"}
                          </p>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-4 text-slate-500 dark:text-slate-400 font-semibold">
                        {dateStr}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isSettled
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSettled ? "bg-emerald-500" : "bg-amber-500"}`} />
                          {t.status || "Settled"}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="pr-6 pl-4 py-4 text-right">
                        <span className={`font-black text-sm tracking-tight ${
                          isDebit ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {isDebit ? "-" : "+"}{inr(amt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Credit Customer Wallet Modal ── */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">add_card</span>
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Credit Customer Wallet</h3>
                  <p className="text-[11px] text-slate-400">Directly top-up customer balance with instant ledger entry.</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreditModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Customer Search */}
              <div className="relative">
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Customer Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={creditForm.phone}
                  onChange={(e) => {
                    setCreditForm({ ...creditForm, phone: e.target.value });
                    setCreditTarget(null);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Enter 10-digit customer phone..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />

                {/* Dropdown search matches */}
                {showCustomerDropdown && creditForm.phone && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-1.5">
                    {lookupState === "searching" && (
                      <div className="p-3 text-center text-slate-400 font-semibold">Searching customer directory...</div>
                    )}
                    {lookupState === "done" && customers.length === 0 && (
                      <div className="p-3 text-center text-slate-400 font-semibold">No customer found with this phone number.</div>
                    )}
                    {customers.map((c) => {
                      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.displayName || "Customer";
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCreditTarget(c);
                            setCreditForm({ ...creditForm, phone: `${name} • ${c.phone || c.phoneNumber || ""}` });
                            setShowCustomerDropdown(false);
                          }}
                          className="w-full text-left p-2.5 hover:bg-emerald-50 dark:hover:bg-slate-700/60 rounded-xl transition flex items-center justify-between"
                        >
                          <div>
                            <p className="font-bold text-slate-800 dark:text-white">{name}</p>
                            <p className="text-[10px] text-slate-400">{c.phone || c.phoneNumber} {c.email ? `• ${c.email}` : ""}</p>
                          </div>
                          <span className="material-symbols-outlined text-emerald-600 text-sm">check_circle</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {creditTarget && (
                  <div className="mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-800 dark:text-emerald-200 text-xs">
                        Verified: {[creditTarget.firstName, creditTarget.lastName].filter(Boolean).join(" ") || creditTarget.displayName || "Customer"}
                      </span>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">UID: {creditTarget.id.slice(0, 10)}</p>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-md">Selected</span>
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Credit Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={creditForm.amount}
                  onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                  placeholder="e.g. 250"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-black outline-none focus:border-emerald-500"
                />

                {/* Quick denomination chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCreditForm({ ...creditForm, amount: String(amt) })}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 dark:text-slate-300 font-bold text-[11px] transition"
                    >
                      +₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note / Preset */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Purpose / Reason
                </label>
                <input
                  type="text"
                  value={creditForm.note}
                  onChange={(e) => setCreditForm({ ...creditForm, note: e.target.value })}
                  placeholder="e.g. Compensation for missing dish"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />

                <div className="flex flex-wrap gap-1 mt-2">
                  {QUICK_NOTES.map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setCreditForm({ ...creditForm, note })}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 dark:text-slate-400 font-semibold text-[10px] transition"
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreditModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreditWallet}
                  disabled={isCrediting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isCrediting ? "Processing..." : "Confirm & Credit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Display History Modal ── */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">visibility_off</span>
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Clear Display History?</h3>
                <p className="text-xs text-slate-400">Admin Dashboard UI preference</p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <p className="font-bold">Display-Only Safety Notice:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                <li>This ONLY hides the transaction rows from your admin view.</li>
                <li>It does <strong>NOT</strong> delete or alter customer wallet balances.</li>
                <li>It does <strong>NOT</strong> delete ledger entries from Firestore.</li>
                <li>You can restore full visibility anytime with <strong>Show History</strong>.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition"
              >
                Clear Display
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallet;
