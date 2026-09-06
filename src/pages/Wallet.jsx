import React, { useState, useEffect, useMemo } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { useWalletStore } from "../store/walletStore";
import { useOrderStore } from "../store/orderStore";
import { useDeliveryPartnerStore } from "../store/deliveryPartnerStore";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";
import { where } from "firebase/firestore";
import {
  userRepository,
  walletTransactionRepository,
  deliveryPartnerRepository,
} from "../repositories";
import {
  DEBIT_TYPES,
  isDebitRow,
  signedAmount,
  directionOf,
  ledgerTotals,
  ledgerErrorMessage,
  accountNameFor,
} from "../lib/walletLedger";

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
  // The customer actually chosen from the dropdown. Kept separate from the
  // search text: matching on the typed string alone meant a half-typed name
  // was sent to the server as a phone number, which then reported "no
  // customer found" for a customer who plainly exists.
  const [creditTarget, setCreditTarget] = useState(null);
  const [isCrediting, setIsCrediting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Admin display-only Clear/Hide History preference.
  // Persists the operator's display preference across refreshes without touching
  // Firestore documents, balances, refunds, debits, credits, or audits.
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
    addToast("Transaction history hidden from Admin view. Database records and customer balances remain untouched.", "info");
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

  /*
   * Customer lookup for the credit dialog.
   *
   * This was `userRepository.getAll()` on mount — the entire users collection
   * downloaded into memory so a dropdown could substring-match against it. At
   * ten thousand customers that is ten thousand document reads every time the
   * page opens, to support typing into one field.
   *
   * A credit is always issued against a specific known customer, and the
   * identifier to hand is their phone number, so the lookup is now an indexed
   * equality query fired once the operator has typed a full number. Both the
   * bare digits and the +91 form are tried, because both spellings exist in
   * the collection.
   */
  const [lookupState, setLookupState] = useState("idle"); // idle | searching | done
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

  /*
   * Lifetime ledger totals, from server-side aggregation.
   *
   * These were reduced from the `transactions` array. That array is now the
   * newest 200 rows rather than the whole ledger, so reducing it would have
   * produced a partial sum still captioned "Total Store Balance" — a wrong
   * number on a finance screen, which is worse than no number. `sum()` runs
   * server-side over the full collection and is unaffected by the window.
   */
  const [totals, setTotals] = useState(null);
  const [totalsError, setTotalsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTotalsError(null);
      try {
        /*
         * Two shapes of query, deliberately.
         *
         * The unfiltered `sum(amount)` is served by the automatic single-field
         * index on `amount` and needs nothing deployed. Only the debit sum
         * needs the composite index `(type ASC, amount ASC)` — which is why
         * that index, and only that index, was added to
         * `firestore.indexes.json` for this page.
         *
         * The debit spellings are queried one at a time rather than with a
         * single `in`, because equality is the aggregation filter with the
         * fewest surprises across SDK versions, and three extra aggregation
         * queries cost far less than one wrong number on a finance screen.
         *
         * These previously asked for `type == "Earning" | "Payout" | "Refund"`.
         * No writer in the system has ever produced those values: customer
         * rows are written `credit`/`debit` by `walletLedgerEntry()`, partner
         * rows `Credit`/`Debit` by the payout and withdrawal triggers. So the
         * three figures were structurally zero *and* the query needed an index
         * that did not exist — the card failed before it could display the
         * wrong answer, which is the only reason nobody acted on a fabricated
         * balance.
         */
        const [total, ...debitParts] = await Promise.all([
          walletTransactionRepository.sumWhere("amount", []),
          ...DEBIT_TYPES.map((t) =>
            walletTransactionRepository.sumWhere("amount", [where("type", "==", t)]),
          ),
        ]);
        if (cancelled) return;
        const debited = debitParts.reduce((acc, n) => acc + Math.abs(Number(n) || 0), 0);
        setTotals(ledgerTotals(total, debited));
      } catch (e) {
        // The operator gets a sentence they can act on; the developer gets the
        // whole error, index URL included, in the console where it belongs.
        console.error("[wallet] ledger totals failed:", e);
        if (!cancelled) setTotalsError(ledgerErrorMessage(e));
      }
    })();

    return () => { cancelled = true; };
    // Recomputed when the visible ledger changes, which is the cheapest
    // available signal that something was written.
  }, [transactions.length]);

  /*
   * Names for the accounts the ledger rows belong to.
   *
   * A row stores `userId` and nothing else identifying, so the table showed a
   * document id and left the operator to work out whose money had moved —
   * which on a refund or a dispute is the first thing they need to know.
   *
   * Both directories are consulted because the collection is shared: customer
   * rows point at `users`, rider payout and withdrawal rows at
   * `deliveryPartners`. Resolution is a key-only `documentId() in [...]` query
   * per 30 ids, so the whole 200-row window costs a handful of reads rather
   * than one per row.
   *
   * Failure here is deliberately silent. A name is an aid to reading the
   * table, not part of it — an unresolved id still renders, with the id.
   */
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
      // Customers win a collision: a uid that exists in both collections is a
      // customer who also rides, and the ledger row that named them was
      // written against their customer wallet in every path that writes to
      // `users`.
      const merged = new Map(partners);
      for (const [id, rec] of users) merged.set(id, rec);
      setDirectory(merged);
    })();

    return () => { cancelled = true; };
    // Keyed on the id set, not the array identity: a new snapshot that
    // contains the same accounts must not re-run the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerAccountKey]);

  // All three sources are live. Wallet rows in particular are written by
  // Cloud Functions on refunds and cashback, so the page has to reflect
  // writes the admin never made.
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

  // --- Lifetime figures (server-side aggregation; null until loaded) ---
  //
  // `outstanding` is what the store still owes: every rupee credited into a
  // customer or rider wallet, less every rupee spent or paid out of one. That
  // is the only balance this collection can honestly report — it is a wallet
  // ledger, not a P&L, and the previous "earnings − payouts − refunds"
  // arithmetic described a set of rows that does not exist in it.
  const totalCredited = totals?.credited ?? null;
  const totalDebited = totals?.debited ?? null;
  const totalStoreBalance = totals ? totals.outstanding : null;

  // Pending refunds are recent by nature, so the live window is the right
  // source — unlike the lifetime figures above.
  const pendingRefunds = transactions.filter(t => t.type === "Refund" && t.status === "Pending");
  const pendingRefundCount = pendingRefunds.length;
  const pendingRefundValue = pendingRefunds.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

  const partnerPayouts = orders
    .filter(o => o.status === "Delivered")
    .reduce((sum, o) => sum + Number(o.partnerEarnings || 0) + Number(o.earningsBonus || 0) + Number(o.earningsIncentive || 0), 0);

  const partnerCount = deliveryPartners.length;

  /*
   * "Record Transfer" is gone, and this is why.
   *
   * It collected an amount and a description through two `prompt()` dialogs
   * and wrote a wallet transaction straight into Firestore from the browser.
   * Three things were wrong with it, in increasing order of severity:
   *
   *  1. `prompt()` is a blocking browser dialog with no validation, no
   *     cancel-safety and no formatting — not an interface for entering a
   *     money amount.
   *
   *  2. The row it wrote had `userId: "system"`. It was attached to no
   *     customer and no rider, so nobody's balance moved. The ledger gained
   *     an entry that corresponded to no transfer of money.
   *
   *  3. Because the entry was real as far as the ledger was concerned, it
   *     counted toward the store totals. A mistyped digit permanently skewed
   *     the headline financial figures with no customer to reconcile against
   *     and no way to reverse it from the UI.
   *
   * Every legitimate movement already has a proper path: customer credits go
   * through `adminCreditCustomerWallet` below, which is a callable Cloud
   * Function that validates the target, moves the balance and writes the
   * ledger row as one server-side operation. Rider earnings are written by
   * the delivery flow. There is no remaining case for a free-text ledger
   * write from the browser, so the button now opens the credit dialog.
   */

  const handleCreditWallet = async () => {
    // A customer must be picked from the list, not merely typed.
    //
    // This previously sent whatever was in the search box as `phone`. If the
    // admin typed a name — which the field explicitly invites — the server
    // looked up a user whose phone equalled "Sivaji" and reported no match,
    // or the call silently did nothing. Requiring the selection makes the
    // failure impossible rather than merely reported.
    if (!creditTarget) {
      addToast("Search for the customer and pick them from the list first.", "error");
      return;
    }
    if (!creditForm.amount) {
      addToast("Please enter an amount.", "error");
      return;
    }
    const amt = parseFloat(creditForm.amount);
    if (isNaN(amt) || amt <= 0) {
      addToast("Please enter a valid positive amount.", "error");
      return;
    }

    setIsCrediting(true);
    // One key per credit intent. If the SDK or the network delivers this same
    // request twice, both carry this key and the Cloud Function credits once;
    // a manual retry after an error is a genuinely new intent and gets a new
    // key (and is already prevented mid-flight by `isCrediting`).
    const idempotencyKey =
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `credit_${creditTarget.id}_${amt}_${Date.now()}`;
    try {
      const functions = getFunctions(app);
      const creditFn = httpsCallable(functions, "adminCreditCustomerWallet");
      const result = await creditFn({
        // uid is the reliable key. phone is still sent so an older deployed
        // copy of the function keeps working during a rollout.
        uid: creditTarget.id,
        phone: creditTarget.phone || "",
        amount: amt,
        note: creditForm.note,
        idempotencyKey,
      });
      addToast(result.data.message || "Wallet credited successfully.", "success");
      setShowCreditModal(false);
      setCreditForm({ phone: "", amount: "", note: "" });
      setCreditTarget(null);
    } catch (err) {
      addToast(`Failed to credit wallet: ${err.message}`, "error");
    } finally {
      setIsCrediting(false);
    }
  };

  if (loading && transactions.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  /*
   * Tab and search.
   *
   * The tabs were "Earning / Payout / Refund" compared with
   * `t.type.toLowerCase() === selectedTab.toLowerCase()`. Against a ledger
   * holding `credit` and `Credit`, all three returned nothing, every time —
   * the filter was not slow or approximate, it was inert. They are now the
   * two directions money can actually travel, decided by `isDebitRow` so the
   * capitalisation split between the customer and partner writers cannot
   * reach the UI.
   *
   * Search also matches the resolved account name now, which is the thing an
   * operator actually types when a customer calls about a credit.
   */
  const needle = searchQuery.trim().toLowerCase();
  const filteredTxns = transactions.filter((t) => {
    const name = accountNameFor(t, directory) || "";
    const matchesSearch =
      needle === "" ||
      String(t.id || "").toLowerCase().includes(needle) ||
      String(t.description || "").toLowerCase().includes(needle) ||
      String(t.userId || t.customerId || "").toLowerCase().includes(needle) ||
      name.toLowerCase().includes(needle);

    if (selectedTab === "All") return matchesSearch;
    return directionOf(t) === selectedTab && matchesSearch;
  });

  const getStatusBadge = (status) => {
    return status === "Settled"
      ? "bg-[#ecfdf5] text-[#006c49] border-[#10b981]/20"
      : "bg-[#fff8e1] text-[#5f1900] border-[#ffb59d]/20";
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27] font-semibold">Financial Overview</h2>
          <p className="font-body-md text-body-md text-[#475569] mt-1">
            Manage store balances, transactions, and refund workflows.
          </p>
        </div>
        <div className="flex gap-2">
          {isHistoryHidden ? (
            <button 
              onClick={handleRestoreHistory}
              className="px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 font-label-md text-label-md rounded-lg flex items-center gap-2 hover:bg-emerald-100 transition-colors shadow-sm"
              title="Restore hidden transaction history in Admin view"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              Show History
            </button>
          ) : (
            <button 
              onClick={() => setShowClearConfirmModal(true)}
              className="px-4 py-2 bg-white border border-[#d3daea] text-[#151c27] font-label-md text-label-md rounded-lg flex items-center gap-2 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors shadow-sm"
              title="Clear transaction history display from this Admin view"
            >
              <span className="material-symbols-outlined text-[18px]">history_toggle_off</span>
              Clear History
            </button>
          )}
          <button 
            onClick={() => addToast("CSV export placeholder", "info")}
            className="px-4 py-2 bg-white border border-[#d3daea] text-[#151c27] font-label-md text-label-md rounded-lg flex items-center gap-2 hover:bg-[#f0f3ff] transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export CSV
          </button>
          <button 
            onClick={() => setShowCreditModal(true)}
            className="px-4 py-2 bg-[#f59e0b] text-white font-label-md text-label-md rounded-lg flex items-center gap-2 hover:bg-[#d97706] transition-colors shadow-sm border-t border-white/20 inner-shine"
          >
            <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            Credit Wallet
          </button>
          {/* "New Transfer" stood here. It wrote unattached ledger rows via
              prompt() dialogs — see the note above handleCreditWallet. Credit
              Wallet is the real, server-validated path and was already next
              to it, so removing this leaves no capability behind. */}
        </div>
      </div>

      {/* Clear History Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
                <span className="material-symbols-outlined text-2xl">visibility_off</span>
              </div>
              <div className="flex-1">
                <h3 className="font-headline-sm text-base font-bold text-slate-900">
                  Clear Transaction Display History?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Admin Dashboard UI display filter
                </p>
              </div>
              <button 
                onClick={() => setShowClearConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3.5 mb-5 text-xs text-amber-900 space-y-2">
              <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                <span className="material-symbols-outlined text-base">info</span>
                Display-Only Action:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-800/90 leading-relaxed">
                <li>This will <strong>ONLY</strong> clear/hide the transaction history from your Admin Dashboard display.</li>
                <li>It will <strong>NOT</strong> delete or modify any Firestore database documents.</li>
                <li>It will <strong>NOT</strong> change customer wallet balances.</li>
                <li>It will <strong>NOT</strong> affect customer wallet history in the Customer App.</li>
                <li>It will <strong>NOT</strong> affect wallet refunds, debits, credits, or financial accounting/audit records.</li>
                <li>You can restore the display at any time by clicking <strong>Show History</strong>.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">visibility_off</span>
                Clear Display History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Wallet Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-headline-sm text-headline-sm font-semibold">Credit Customer Wallet</h3>
              <button onClick={() => setShowCreditModal(false)} className="text-gray-500 hover:text-gray-800">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Search (Name, Email, or Phone)</label>
                <input 
                  type="text" 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#10b981] focus:border-transparent outline-none transition-all" 
                  value={creditForm.phone} 
                  onChange={(e) => {
                    setCreditForm({ ...creditForm, phone: e.target.value });
                    setCreditTarget(null);   // editing invalidates the choice
                    setShowCustomerDropdown(true);
                  }} 
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  placeholder="Type to search..."
                />
                {showCustomerDropdown && creditForm.phone && (
                  <ul
                    // Without this the item is gone before the click lands.
                    // Pressing the mouse down blurs the input, onBlur schedules
                    // the dropdown to close, and the click event — which only
                    // fires on mouse *up* — arrives at an element that no longer
                    // exists. Suppressing the default mousedown keeps focus on
                    // the input, so no blur happens and the click registers.
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg text-left"
                  >
                    {/* No client-side filter here any more. The lookup is a
                        server query by phone, so everything in `customers` is
                        already a match — and re-filtering was actively wrong:
                        selecting a customer rewrites the field to
                        "Name · phone", which matched none of the three
                        predicates, so the chosen row vanished from the list
                        the instant it was picked. */}
                    {lookupState === "searching" && (
                      <li className="px-4 py-3 text-center text-sm italic text-gray-500">Searching…</li>
                    )}
                    {customers
                      .slice(0, 8)
                      .map(c => (
                        <li 
                          key={c.id} 
                          className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
                          onClick={() => {
                            setCreditTarget(c);
                            // Show something the admin can verify at a glance,
                            // so a mis-click is visible before they credit money.
                            setCreditForm({
                              ...creditForm,
                              phone: `${c.firstName || ''} ${c.lastName || ''}`.trim()
                                ? `${c.firstName || ''} ${c.lastName || ''}`.trim() + ` · ${c.phone || c.email || ''}`
                                : (c.phone || c.email || ''),
                            });
                            setShowCustomerDropdown(false);
                          }}
                        >
                          <div className="font-semibold text-gray-800">{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.displayName || 'Customer'}</div>
                          <div className="text-gray-500 text-xs flex justify-between mt-0.5">
                            <span>{c.email}</span>
                            <span className="text-[#10b981] font-medium">{c.phone}</span>
                          </div>
                        </li>
                    ))}
                    {/* "No customers found" is only true once a lookup has
                        actually run. Before that the honest message is that
                        a full number is needed — the previous version showed
                        "not found" while the admin was still typing. */}
                    {lookupState === "idle" && (
                      <li className="px-4 py-3 text-center text-sm italic text-gray-500">
                        Enter the customer&apos;s full phone number
                      </li>
                    )}
                    {lookupState === "done" && customers.length === 0 && (
                      <li className="px-4 py-3 text-center text-sm italic text-gray-500">
                        No customer with that phone number
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input 
                  type="number" 
                  className="w-full border rounded-lg p-2" 
                  value={creditForm.amount} 
                  onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })} 
                  placeholder="500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                <input 
                  type="text" 
                  className="w-full border rounded-lg p-2" 
                  value={creditForm.note} 
                  onChange={(e) => setCreditForm({ ...creditForm, note: e.target.value })} 
                  placeholder="Support refund, etc."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowCreditModal(false)}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreditWallet}
                disabled={isCrediting}
                className="px-4 py-2 bg-[#f59e0b] text-white rounded-lg hover:bg-[#d97706] disabled:opacity-50 flex items-center gap-2"
              >
                {isCrediting ? "Processing..." : "Credit Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Balance KPI (Money KPI = ₹--) */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#10b981]/5 rounded-full blur-xl group-hover:bg-[#10b981]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#f0f3ff] rounded-lg text-[#10b981]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
            </div>
            {/* "+12.5% this month" used to sit here as a literal. It was not
                computed from anything — the same figure showed on every
                account, in every period, forever. A fabricated trend badge on
                a balance card is worse than no badge: it invites a decision.
                Replaced with the real scope of the number below it. */}
            <span className="font-label-sm text-label-sm px-2 py-0.5 bg-[#f0f3ff] text-[#555f6f] rounded-full border border-[#dce2f3]">
              Lifetime
            </span>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">Total Store Balance</p>
          {totalsError ? (
            <h3 className="font-headline-display text-headline-display text-[#ba1a1a] font-bold">
              Unavailable
            </h3>
          ) : totals ? (
            <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">
              ₹{totalStoreBalance.toFixed(2)}
            </h3>
          ) : (
            <div className="h-9 w-40 animate-pulse rounded-md bg-slate-100" aria-label="Loading balance" />
          )}
          {totalsError && (
            <p className="font-body-sm text-body-sm text-[#ba1a1a] mt-1">{totalsError}</p>
          )}
          {totals && (
            <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
              ₹{totalCredited.toFixed(0)} credited · ₹{totalDebited.toFixed(0)} spent or paid out
            </p>
          )}
        </div>

        {/* Pending Refunds KPI (Monetary value details = Value: ₹--) */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#ba1a1a]/5 rounded-full blur-xl group-hover:bg-[#ba1a1a]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#ffdad6] rounded-lg text-[#ba1a1a]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>pending_actions</span>
            </div>
            <span className="font-label-sm text-label-sm px-2 py-0.5 bg-[#f0f3ff] text-[#555f6f] rounded-full border border-[#dce2f3]">Requires Action</span>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">Pending Refunds</p>
          <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">{pendingRefundCount}</h3>
          <p className="font-body-sm text-body-sm text-[#ba1a1a] mt-1 font-semibold">Value: ₹{pendingRefundValue.toFixed(2)}</p>
        </div>

        {/* Partner Payouts KPI (Money KPI = ₹--) */}
        <div className="bg-white rounded-xl border border-[#dce2f3] p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#00af79]/5 rounded-full blur-xl group-hover:bg-[#00af79]/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#f0f3ff] rounded-lg text-[#006c49]">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
            </div>
            {/* Was labelled "Due Today". Nothing about the figure is scoped to
                today — it sums rider earnings across every delivered order in
                the loaded window. An operator paying out against a number
                captioned "due today" would pay the wrong amount. */}
            <span className="font-label-sm text-label-sm px-2 py-0.5 bg-[#f0f3ff] text-[#555f6f] rounded-full border border-[#dce2f3]">
              Recent orders
            </span>
          </div>
          <p className="font-label-md text-label-md text-[#555f6f] mb-1">Rider Earnings Accrued</p>
          <h3 className="font-headline-display text-headline-display text-[#151c27] font-bold">₹{partnerPayouts.toFixed(2)}</h3>
          <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
            Delivered orders in view · {partnerCount} partners
          </p>
        </div>
      </div>

      {/* Transaction List Card */}
      <div className="bg-white border border-[#dce2f3] rounded-xl shadow-sm flex flex-col">
        {/* Table Header Filter */}
        <div className="p-5 border-b border-[#dce2f3] flex flex-wrap justify-between items-center bg-[#f9f9ff] gap-4 rounded-t-xl">
          <div className="flex items-center gap-2">
            {["All", "Credit", "Debit"].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-3 py-1.5 rounded-full font-label-sm text-label-sm transition-colors ${
                  selectedTab === tab
                    ? "bg-[#10b981] text-white"
                    : "bg-[#f0f3ff] text-[#151c27] hover:bg-[#e7eefe]"
                }`}
              >
                {tab}s
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-3">
            {isHistoryHidden ? (
              <button
                onClick={handleRestoreHistory}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"
                title="Restore hidden transaction history"
              >
                <span className="material-symbols-outlined text-sm">visibility</span>
                Show History
              </button>
            ) : (
              <button
                onClick={() => setShowClearConfirmModal(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300 flex items-center gap-1.5 transition-colors"
                title="Hide transaction history from display"
              >
                <span className="material-symbols-outlined text-sm">visibility_off</span>
                Clear History
              </button>
            )}

            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555f6f]/60 text-sm">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-[#d3daea] rounded-lg text-xs font-body-sm w-48 focus:outline-none focus:border-[#10b981]"
                placeholder="Search transactions..."
                type="text"
                disabled={isHistoryHidden}
              />
            </div>
          </div>
        </div>

        {isHistoryHidden ? (
          <div className="p-12 text-center bg-slate-50/60 rounded-b-xl border-t border-[#dce2f3]/50">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 text-slate-500 mb-3">
              <span className="material-symbols-outlined text-3xl">visibility_off</span>
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1">Transaction History Display Hidden</h4>
            <p className="text-xs text-slate-500 max-w-lg mx-auto mb-4 leading-relaxed">
              Transaction history is currently hidden from this Admin Dashboard view only.
              All Firestore database records, customer wallet balances, refunds, and financial audit trails remain completely untouched, active, and secure.
            </p>
            <button
              onClick={handleRestoreHistory}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-label-md text-xs rounded-lg inline-flex items-center gap-2 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-base">visibility</span>
              Show / Restore History
            </button>
          </div>
        ) : filteredTxns.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="account_balance_wallet"
              title="No Transactions Found"
              description="No financial ledger items match your filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f0f3ff]/40 border-b border-[#dce2f3]">
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider">Transaction ID</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider">Account</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider">Date &amp; Time</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider text-right">Amount</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dce2f3]/30 font-body-sm text-body-sm text-[#151c27]">
                {filteredTxns.map((txn) => {
                  const accountId = String(txn.userId || txn.customerId || "");
                  const accountName = accountNameFor(txn, directory);
                  const signed = signedAmount(txn);
                  const debit = isDebitRow(txn);
                  return (
                  <tr key={txn.id} className="hover:bg-[#f0f3ff]/30 transition-colors">
                    <td className="px-6 py-4 font-label-md font-bold text-[#10b981]">#{txn.id}</td>
                    {/* The name is the label; the uid stays underneath it,
                        because that is what a support conversation or a
                        Firestore lookup is keyed on. An unresolved account
                        shows the id alone rather than a made-up name. */}
                    <td className="px-6 py-4">
                      {accountName ? (
                        <>
                          <div className="font-label-md font-semibold text-[#151c27]">{accountName}</div>
                          <div className="text-[10px] text-[#555f6f]/70 font-mono">{accountId}</div>
                        </>
                      ) : (
                        <span className="text-[#555f6f]/70 font-mono text-xs">{accountId || "—"}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {/* Coloured by direction, not by the stored string: the
                          same movement is spelled `credit` on a customer row
                          and `Credit` on a rider row, and both must read the
                          same way. The raw value is still what is printed, so
                          nothing about the document is hidden. */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        debit ? "bg-[#ffdad6] text-[#ba1a1a]" : "bg-[#ecfdf5] text-[#006c49]"
                      }`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[#555f6f] font-semibold">{txn.description}</td>
                    <td className="px-6 py-4 text-[#555f6f]">
                      {txn.date || (txn.createdAt ? (txn.createdAt.toDate ? txn.createdAt.toDate().toLocaleString() : new Date(txn.createdAt).toLocaleString()) : "Just now")}
                    </td>
                    {/* Signed from `type`, not from the stored number. The
                        ledger stores a positive magnitude and puts the
                        direction in `type`, so signing on `amount >= 0` showed
                        every debit as a green credit — a payment of ₹97.50 out
                        of a wallet rendered as "+₹97.50". */}
                    <td className="px-6 py-4 text-right font-label-md font-bold">
                      <span className={signed < 0 ? "text-[#ba1a1a]" : "text-[#006c49]"}>
                        {signed < 0 ? "-" : "+"}₹{Math.abs(signed).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {/* Most rows carry no `status` — only refund rows ever
                          did — so an empty badge was rendered on every line.
                          A dash says "not applicable" without pretending. */}
                      {txn.status ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-label-sm text-[10px] uppercase tracking-wide border ${getStatusBadge(txn.status)}`}>
                          {txn.status}
                        </span>
                      ) : (
                        <span className="text-[#555f6f]/50">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default Wallet;
