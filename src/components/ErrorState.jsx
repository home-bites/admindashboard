import React from "react";

/**
 * The failure counterpart to `EmptyState`.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Several pages subscribe to a collection through a store that exposes
 * `{ data, loading, error }`, render a spinner while `loading`, and then fall
 * through to `<EmptyState title="No Banners Found" />` — for both outcomes.
 * The `error` field was destructured and never read.
 *
 * So a permission-denied rule, a missing composite index or a dropped
 * connection all displayed as "No banners found. Create promotional carousels
 * to highlight offers." An operator has no way to tell that from a collection
 * that is genuinely empty, and the natural response to the message shown is
 * to re-create records that already exist.
 *
 * Three things distinguish this from an empty state, and all three matter:
 * it says a failure occurred, it shows what actually failed, and it offers a
 * retry — because most of these failures are transient.
 *
 * @param {string}   title
 * @param {string}   message   the underlying error text; shown verbatim,
 *                             because "something went wrong" is not actionable
 * @param {Function} [onRetry] omit to render no retry button
 */
export const ErrorState = ({
  title = "Could not load this data",
  message = "",
  onRetry = null,
  retryText = "Try again",
}) => {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center justify-center gap-5 rounded-xl border border-[#f5c2c7] bg-white p-8 text-center shadow-sm md:p-12"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#ffdad6] text-[#ba1a1a]">
        <span className="material-symbols-outlined text-3xl">error</span>
      </div>

      <div className="space-y-1">
        <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">{title}</h3>
        {message && (
          <p className="font-body-sm text-body-sm max-w-sm break-words text-[#555f6f]">{message}</p>
        )}
        <p className="pt-1 text-xs text-[#555f6f]">
          This is a loading failure, not an empty list — existing records have not been lost.
        </p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="inner-shine flex items-center gap-2 rounded-lg bg-[#151c27] px-4 py-2 font-label-md text-label-md text-white shadow transition-colors hover:bg-[#2a3441]"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          {retryText}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
