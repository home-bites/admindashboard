/**
 * Canonical reading of a `walletTransactions` row.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * The Wallet page filtered and totalled the ledger on `type` values that no
 * writer in the system has ever produced. It asked for `"Earning"`,
 * `"Payout"` and `"Refund"`; production contains `"credit"`, `"debit"`,
 * `"Credit"` and one legacy `"WELCOME"`. The consequences were not cosmetic:
 *
 *  - Every lifetime total summed a value that matches nothing, so the three
 *    figures behind "Total Store Balance" were structurally zero.
 *  - The Earnings / Payouts / Refunds tabs could never return a row.
 *  - The amount column signed on `amount >= 0`, but the ledger stores a
 *    positive magnitude with the direction in `type` — so a debit rendered
 *    as a green `+₹97.50` against a balance that had gone *down*.
 *
 * There are two writers and they disagree on case, which is the fact this
 * module exists to absorb:
 *
 *  - `walletLedgerEntry()` in `functions/index.js` writes customer rows as
 *    `credit` / `debit` (lower case).
 *  - The delivery payout and withdrawal triggers write partner rows as
 *    `Credit` / `Debit` (capitalised).
 *
 * Rather than enumerate every credit spelling — which would silently drop the
 * legacy `WELCOME` row and anything a future writer invents — the direction is
 * decided by asking whether a row is a *debit*. Everything else is a credit.
 * Money only ever moves two ways, so the complement is exhaustive by
 * construction and needs no maintenance.
 */

/**
 * Type values that mean "money left the wallet".
 *
 * Written as an explicit list rather than a case-insensitive comparison
 * because the same list is handed to Firestore as equality filters, and
 * Firestore comparisons are case-sensitive. Keeping one list means the
 * server-side aggregation and the client-side filter can never disagree
 * about what a debit is.
 */
export const DEBIT_TYPES = ["debit", "Debit", "DEBIT"];

/** True when this row reduced a wallet balance. */
export function isDebitRow(row) {
  return DEBIT_TYPES.includes(String(row?.type ?? ""));
}

/**
 * The row's effect on the balance: negative for a debit, positive otherwise.
 *
 * `amount` is stored as a magnitude, so the sign has to be reconstructed from
 * `type`. `Math.abs` guards the one case where a writer stored a signed value
 * anyway — applying the sign twice would flip a debit back to a credit.
 */
export function signedAmount(row) {
  const magnitude = Math.abs(Number(row?.amount) || 0);
  return isDebitRow(row) ? -magnitude : magnitude;
}

/** Bucket used by the ledger tabs. */
export function directionOf(row) {
  return isDebitRow(row) ? "Debit" : "Credit";
}

/**
 * Lifetime figures, derived from two server-side sums.
 *
 * `total` is an unfiltered `sum(amount)` — it needs no composite index,
 * because an aggregation with no `where` clause is served by the automatic
 * single-field index on `amount`. `debited` is the only figure that needs
 * one.
 *
 * Credits are then the remainder rather than a third query. That is not a
 * saving for its own sake: querying credits by name would have to enumerate
 * `credit`, `Credit` and `WELCOME`, and would miss the next spelling somebody
 * introduces. Subtracting guarantees `credited + debited === total` for every
 * row in the collection, whatever it is labelled.
 *
 * @param {number} total   sum of `amount` over the whole collection
 * @param {number} debited sum of `amount` over debit-typed rows
 */
export function ledgerTotals(total, debited) {
  const t = Math.abs(Number(total) || 0);
  const d = Math.abs(Number(debited) || 0);
  const credited = t - d;
  return {
    credited,
    debited: d,
    // What the store still owes its customers and riders: everything credited
    // into wallets, less everything spent or paid out of them.
    outstanding: credited - d,
  };
}

/**
 * Turns a Firestore failure into something an operator can act on.
 *
 * The raw `failed-precondition` message ends with a
 * `console.firebase.google.com/...?create_composite=...` URL. Rendering that
 * on the dashboard invites an admin to hand-create an index that then exists
 * in production and in no repository — the next `firebase deploy` does not
 * know about it, and nobody can tell which of the project's indexes are
 * intentional. The index belongs in `firestore.indexes.json`; the screen
 * should say what is wrong, not offer a shortcut around version control.
 */
export function ledgerErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("failed-precondition")) {
    return "Ledger totals need a Firestore index that has not been deployed yet.";
  }
  if (code.includes("permission-denied")) {
    return "You do not have permission to read the wallet ledger.";
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return "Could not reach Firestore. Check the connection and reload.";
  }
  return "Could not load ledger totals.";
}

/**
 * Display name for the account a ledger row belongs to.
 *
 * Rows carry `userId` and nothing else identifying — the page showed a
 * document id and left the operator to guess whose money moved. `directory`
 * is a `Map` from uid to a resolved record; a miss returns null rather than a
 * placeholder, so the caller decides how to render "not resolved" instead of
 * this function inventing a name.
 */
export function accountNameFor(row, directory) {
  const uid = String(row?.userId || row?.customerId || "");
  if (!uid || !directory) return null;
  const record = directory.get(uid);
  if (!record) return null;
  const name = [record.firstName, record.lastName].filter(Boolean).join(" ").trim();
  return name || record.displayName || record.name || record.fullName || null;
}

/**
 * Returns the formal classification tag for a wallet transaction row.
 * E.g. CREDIT — WELCOME BONUS, CREDIT — WALLET TOP-UP, DEBIT — FOOD ORDER, etc.
 */
export function classificationTagOf(row) {
  if (row?.classificationTag) return String(row.classificationTag);

  const cat = String(row?.category || "").toUpperCase();
  const desc = String(row?.description || row?.note || "").toLowerCase();
  const id = String(row?.id || "");
  const isDebit = isDebitRow(row);

  if (cat === "WELCOME" || desc.includes("welcome") || id.startsWith("welcome_")) {
    return "CREDIT — WELCOME BONUS";
  }
  if (cat === "TOPUP" || desc.includes("top-up") || desc.includes("topup")) {
    return "CREDIT — WALLET TOP-UP";
  }
  if (cat === "ORDER" || desc.includes("order") || id.startsWith("order_debit")) {
    return isDebit ? "DEBIT — FOOD ORDER" : "CREDIT — ORDER ADJUSTMENT";
  }
  if (cat === "REFUND" || desc.includes("refund")) {
    return "CREDIT — REFUND";
  }
  if (cat === "REFERRAL" || desc.includes("referral")) {
    return "CREDIT — REFERRAL";
  }
  if (cat === "REDEMPTION" || cat === "LOYALTY" || desc.includes("loyalty") || desc.includes("redeem")) {
    return "CREDIT — LOYALTY";
  }
  if (cat === "ADMIN" || desc.includes("admin") || desc.includes("manual")) {
    return "ADJUSTMENT — ADMIN";
  }
  if (id.startsWith("reversal_") || desc.includes("delivery marked undone") || desc.includes("delivery reversal")) {
    return "DEBIT — DELIVERY REVERSAL";
  }
  if (id.startsWith("payout_") || desc.includes("earnings for order")) {
    return "CREDIT — DELIVERY EARNINGS";
  }

  return isDebit ? "DEBIT — FOOD ORDER" : "CREDIT — WALLET TOP-UP";
}

/**
 * Returns the funding source for a transaction row:
 * PROMOTIONAL, CUSTOMER_FUNDED, REWARD, REFUND, ADMIN
 */
export function sourceOf(row) {
  if (row?.source) return String(row.source).toUpperCase();

  const tag = classificationTagOf(row);
  if (tag.includes("WELCOME")) return "PROMOTIONAL";
  if (tag.includes("TOP-UP")) return "CUSTOMER_FUNDED";
  if (tag.includes("REFERRAL") || tag.includes("LOYALTY")) return "REWARD";
  if (tag.includes("REFUND")) return "REFUND";
  if (tag.includes("ADMIN") || tag.includes("ADJUSTMENT")) return "ADMIN";
  if (tag.includes("DELIVERY")) return "ADMIN";
  return isDebitRow(row) ? "CUSTOMER_FUNDED" : "CUSTOMER_FUNDED";
}

/**
 * Tailwind styling for classification badges.
 */
export function tagColorOf(tag) {
  const t = String(tag).toUpperCase();
  if (t.includes("WELCOME BONUS")) {
    return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40";
  }
  if (t.includes("TOP-UP") || t.includes("DELIVERY EARNINGS")) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40";
  }
  if (t.includes("FOOD ORDER") || t.includes("REVERSAL")) {
    return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40";
  }
  if (t.includes("REFUND")) {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40";
  }
  if (t.includes("REFERRAL")) {
    return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/40";
  }
  if (t.includes("LOYALTY")) {
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40";
  }
  if (t.includes("ADMIN")) {
    return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/40";
  }
  return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
}

/**
 * Tailwind styling for funding source badges.
 */
export function sourceColorOf(source) {
  const s = String(source).toUpperCase();
  if (s === "PROMOTIONAL") return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300";
  if (s === "CUSTOMER_FUNDED") return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300";
  if (s === "REWARD") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300";
  if (s === "REFUND") return "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300";
  if (s === "ADMIN") return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

