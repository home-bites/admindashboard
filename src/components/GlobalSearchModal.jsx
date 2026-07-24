import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "../store/uiStore";
import * as repos from "../repositories";

export const GlobalSearchModal = () => {
  const { isSearchOpen, setSearchOpen } = useUiStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
      const q = query.toLowerCase().trim();
      const combined = [];

      try {
        const [orders, menu, diet, plans, riders, users] = await Promise.all([
          repos.orderRepository.getAll().catch(() => []),
          repos.menuItemRepository.getAll().catch(() => []),
          repos.dietFoodRepository.getAll().catch(() => []),
          repos.mealPlanRepository.getAll().catch(() => []),
          repos.deliveryPartnerRepository.getAll().catch(() => []),
          repos.userRepository.getAll().catch(() => [])
        ]);

        // Filter Orders
        orders.filter(o => 
          (o.id && o.id.toLowerCase().includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.status && o.status.toLowerCase().includes(q))
        ).slice(0, 3).forEach(o => {
          combined.push({
            type: "Order",
            title: `Order #${o.id?.slice(-6) || o.id}`,
            subtitle: `${o.customerName || 'Customer'} • ₹${o.totalAmount || o.total || 0} • ${o.status || 'Pending'}`,
            link: "/orders",
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

        // Filter Customers
        users.filter(u => 
          (u.displayName && u.displayName.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.phone && u.phone.includes(q))
        ).slice(0, 2).forEach(u => {
          combined.push({
            type: "Customer",
            title: u.displayName || u.email || "Customer",
            subtitle: `${u.email || u.phone || 'Customer User'}`,
            link: "/customers",
            badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
          });
        });

      } catch (err) {
        console.warn("Global search error:", err);
      } finally {
        setResults(combined);
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

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
          ) : query.trim() ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No matching records found for "{query}"
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
