import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "../store/uiStore";
import * as repos from "../repositories";
import { ACTIVE_ORDER_WINDOW } from "../lib/orderStages";

/**
 * Catalogue collections, cached for the session.
 *
 * These have a natural ceiling in the hundreds and change rarely, so reading
 * them once and filtering in memory is both correct and cheap. The previous
 * implementation re-read them on every keystroke, along with `orders` and
 * `users`, which do not have a ceiling at all — a single search of a
 * production database was six figures of document reads, repeated 200ms after
 * the operator stopped typing.
 */
const CATALOGUE = ["menuItemRepository", "dietFoodRepository", "mealPlanRepository", "deliveryPartnerRepository"];

/** Digits only — how a phone number is matched regardless of formatting. */
const digitsOf = (s) => String(s || "").replace(/\D/g, "");

export const GlobalSearchModal = () => {
  const { isSearchOpen, setSearchOpen } = useUiStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  // Bumping this re-runs the search effect on an unchanged query, which is
  // what "Retry" has to do after a failure.
  const [retryNonce, setRetryNonce] = useState(0);
  const navigate = useNavigate();

  // Session cache for the bounded catalogue collections. A ref, not state:
  // filling it must not trigger a render, and it should survive the modal
  // being closed and reopened.
  const catalogueRef = useRef(null);

  const loadCatalogue = async () => {
    if (catalogueRef.current) return catalogueRef.current;
    const loaded = await Promise.all(
      CATALOGUE.map((name) => repos[name].getAll().catch(() => [])),
    );
    catalogueRef.current = loaded;
    return loaded;
  };

  /**
   * Orders matching the term.
   *
   * An order id is the thing operators actually paste in — from a support
   * chat, a payment dashboard, a refund request — so an exact id lookup is
   * tried first and is a single document read. Failing that, the recent
   * window is scanned for a partial id, customer name or status, which covers
   * "the order that just came in" without touching history.
   */
  const findOrders = async (q) => {
    const hits = [];
    const seen = new Set();

    const exact = await repos.orderRepository.getById(query.trim()).catch(() => null);
    if (exact) {
      hits.push(exact);
      seen.add(exact.id);
    }

    const { items } = await repos.orderRepository.getPage({ limitTo: ACTIVE_ORDER_WINDOW });
    items.forEach((o) => {
      if (seen.has(o.id)) return;
      const match =
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.status && o.status.toLowerCase().includes(q));
      if (match) hits.push(o);
    });
    return hits;
  };

  /**
   * Customers matching the term, by exact email or phone.
   *
   * Both are indexed equality lookups returning at most a handful of
   * documents. Name search is deliberately absent: Firestore cannot do it
   * without downloading the collection, and the footer says so rather than
   * silently returning nothing for a name that does exist.
   */
  const findCustomers = async (q) => {
    const digits = digitsOf(q);
    const lookups = [];

    if (q.includes("@")) {
      lookups.push(repos.userRepository.findByField("email", q).catch(() => []));
    }
    if (digits.length >= 10) {
      lookups.push(repos.userRepository.findByField("phone", digits).catch(() => []));
      lookups.push(repos.userRepository.findByField("phone", `+91${digits.slice(-10)}`).catch(() => []));
    }
    if (!lookups.length) return [];

    const byId = new Map();
    (await Promise.all(lookups)).flat().forEach((u) => byId.set(u.id, u));
    return [...byId.values()];
  };

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(!isSearchOpen);
      }
      if (e.key === "Escape" && isSearchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchOpen, setSearchOpen]);

  // Live search querying
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      const q = query.toLowerCase().trim();
      const combined = [];

      try {
        /*
         * Firestore has no substring index, so "search everything" cannot be
         * a server query. The honest split:
         *
         *  - Catalogue (menu, diet, plans, riders): bounded, cached once per
         *    session, filtered in memory. Substring matching works.
         *  - Orders: looked up by id — exact, then a scan of the recent
         *    window for a partial. Not a full-history text search, and the
         *    footer says so rather than implying otherwise.
         *  - Customers: matched on exact email or phone via an indexed
         *    query. Downloading 10k users to substring-match a name is what
         *    this replaced.
         */
        const [catalogue, orderHits, userHits] = await Promise.all([
          loadCatalogue(),
          findOrders(q),
          findCustomers(q),
        ]);
        const [menu, diet, plans, riders] = catalogue;

        orderHits.slice(0, 3).forEach(o => {
          combined.push({
            type: "Order",
            title: `Order #${o.id?.slice(-6) || o.id}`,
            subtitle: `${o.customerName || 'Customer'} • ₹${o.totalAmount || o.total || 0} • ${o.status || 'Pending'}`,
            // Deep-links to the order itself. This used to drop the operator
            // on an unfiltered /orders list, leaving them to find by hand the
            // order they had just searched for.
            // Deep-links to the order itself, rather than dropping the
            // operator on an unfiltered list to find it by hand.
            link: `/orders?order=${encodeURIComponent(o.id)}`,
            badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          });
        });

        // Filter Regular Menu Items
        menu.filter(m => 
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.categoryName && m.categoryName.toLowerCase().includes(q))
        ).slice(0, 3).forEach(m => {
          combined.push({
            type: "Menu Item",
            title: m.name,
            subtitle: `₹${m.price} • ${m.categoryName || 'General'}`,
            link: "/menu",
            badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
          });
        });

        // Filter Diet Foods
        diet.filter(d => 
          (d.name && d.name.toLowerCase().includes(q)) ||
          (d.healthTags && d.healthTags.some(t => t.toLowerCase().includes(q)))
        ).slice(0, 3).forEach(d => {
          combined.push({
            type: "Diet Food",
            title: d.name,
            subtitle: `₹${d.price} • ${d.calories || 0} kcal • ${(d.healthTags || []).join(", ")}`,
            link: "/diet-foods",
            badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
          });
        });

        // Filter Meal Plans
        plans.filter(p => 
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
        ).slice(0, 2).forEach(p => {
          combined.push({
            type: "Meal Plan",
            title: p.title,
            subtitle: `₹${p.price} • ${p.durationDays || 7} Days • ${p.activeSubscribers || 0} active`,
            link: "/meal-plans",
            badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
          });
        });

        // Filter Riders
        riders.filter(r => 
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.phone && r.phone.includes(q))
        ).slice(0, 2).forEach(r => {
          combined.push({
            type: "Delivery Partner",
            title: r.name || "Rider",
            subtitle: `${r.phone || 'No phone'} • ${r.status || 'Offline'}`,
            link: "/delivery-partners",
            badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20"
          });
        });

        userHits.slice(0, 3).forEach(u => {
          combined.push({
            type: "Customer",
            title: u.displayName || u.email || "Customer",
            subtitle: `${u.email || u.phone || 'Customer User'}`,
            link: `/customers?id=${encodeURIComponent(u.id)}`,
            badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
          });
        });

      } catch (err) {
        // A failed search used to be swallowed into a console warning and an
        // empty list — indistinguishable from "nothing matched", which sends
        // the operator looking for a record they have been wrongly told is
        // not there.
        setSearchError(err?.message || "Search failed.");
      } finally {
        setResults(combined);
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, retryNonce]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Search Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders, diet meals, customers, meal plans, riders... (Press Esc to close)"
            className="flex-1 bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-base font-medium"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded-md"
            >
              Clear
            </button>
          )}
          <span className="text-xs font-mono text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            ESC
          </span>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Searching Command Center...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((res, i) => (
              <div
                key={i}
                onClick={() => {
                  setSearchOpen(false);
                  navigate(res.link);
                }}
                className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 transition-all duration-150"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${res.badge}`}>
                    {res.type}
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {res.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{res.subtitle}</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))
          ) : searchError ? (
            // Distinct from "nothing matched" — the operator must not go on
            // believing a record does not exist when the query simply broke.
            <div className="py-10 text-center">
              <span className="material-symbols-outlined text-[24px] text-rose-500">error</span>
              <p className="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-400">Search failed</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{searchError}</p>
              <button
                onClick={() => setRetryNonce((n) => n + 1)}
                className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Retry
              </button>
            </div>
          ) : query.trim() ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400">No matching records found for &ldquo;{query}&rdquo;</p>
              {/* What is searchable is a real constraint of the datastore, not
                  a detail to hide — an operator who knows a name is not
                  indexed will paste the phone number instead of concluding
                  the customer is missing. */}
              <p className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-slate-400">
                Orders match on ID (any order) or on customer and status within the {ACTIVE_ORDER_WINDOW} most
                recent. Customers match on full email or phone number, not name. Menu, diet foods,
                meal plans and riders match on any part of the name.
              </p>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-sm">
              <p className="font-medium text-slate-500 dark:text-slate-400 mb-2">Quick Navigation Shortcuts</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                <button onClick={() => { setSearchOpen(false); navigate("/diet-foods"); }} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300">🥗 Diet Foods</button>
                <button onClick={() => { setSearchOpen(false); navigate("/meal-plans"); }} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300">📅 Meal Plans</button>
                <button onClick={() => { setSearchOpen(false); navigate("/subscriptions"); }} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300">🔄 Subscriptions</button>
                <button onClick={() => { setSearchOpen(false); navigate("/live-command"); }} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300">📡 Live Radar</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 flex justify-between items-center px-4">
          <span>HomeBites Ecosystem Command Palette</span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded shadow-sm text-slate-600 dark:text-slate-300">Ctrl + K</kbd> anytime</span>
        </div>

      </div>
    </div>
  );
};
export default GlobalSearchModal;
