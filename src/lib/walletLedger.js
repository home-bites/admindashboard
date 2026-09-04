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
