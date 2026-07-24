import React, { useState, useEffect } from "react";
import { SubscriptionService } from "../services";
import { useUiStore } from "../store/uiStore";

export const Subscriptions = () => {
  const { addToast } = useUiStore();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const list = await SubscriptionService.getAll();
      setSubscriptions(list || []);
    } catch (e) {
      addToast("Failed to load subscriptions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await SubscriptionService.updateStatus(id, newStatus, null, "Admin override");
      addToast(`Subscription status updated to ${newStatus}`, "success");
      loadSubscriptions();
    } catch (e) {
      addToast(`Error updating subscription: ${e.message}`, "error");
    }
  };

  const filtered = subscriptions.filter(s => {
    const matchesSearch = (s.userName || s.userEmail || s.planTitle || s.id || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "ALL" || s.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Active Customer Subscriptions</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Live recurring delivery schedules, plan renewals, and pause/resume control.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 font-bold text-xs">
            {subscriptions.filter(s => s.status === 'ACTIVE').length} Active Subscriptions
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="relative w-full md:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, email, plan..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {["ALL", "ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterStatus === st
                  ? "bg-slate-900 dark:bg-emerald-500 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Subscriptions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400 gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Loading subscriptions ledger...</span>
          </div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4">Subscriber</th>
                  <th className="p-4">Meal Plan Package</th>
                  <th className="p-4">Duration &amp; Price</th>
                  <th className="p-4">Delivery Window</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{sub.userName || "Customer"}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{sub.userEmail || sub.userId}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{sub.planTitle || "Weekly Meal Plan"}</div>
                      <div className="text-[10px] text-emerald-600 font-bold">{sub.caloriesPerDay || 1800} kcal / day</div>
                    </td>
                    <td className="p-4 font-mono">
                      <div className="font-bold text-slate-800 dark:text-slate-100">₹{sub.price || 0}</div>
                      <div className="text-[10px] text-slate-400">{sub.durationDays || 7} Days Package</div>
                    </td>
                    <td className="p-4">
                      <div className="text-slate-700 dark:text-slate-300 font-medium">{sub.deliverySlot || "08:00 AM - 09:00 AM"}</div>
                      <div className="text-[10px] text-slate-400">Next: {sub.nextDeliveryDate || "Tomorrow"}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        sub.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                        sub.status === 'PAUSED' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                        'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                      }`}>
                        {sub.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {sub.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleStatusChange(sub.id, "PAUSED")}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-bold text-[10px] rounded-lg transition-colors"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(sub.id, "ACTIVE")}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 font-bold text-[10px] rounded-lg transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => handleStatusChange(sub.id, "CANCELLED")}
                        className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-bold text-[10px] rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <span className="material-symbols-outlined text-4xl text-slate-300">autorenew</span>
            <p className="font-semibold text-sm">No subscription records match filters</p>
          </div>
        )}
      </div>

    </div>
  );
};
export default Subscriptions;
