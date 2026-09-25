import React, { useState, useEffect, useMemo } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useDealStore } from "../store/dealStore";
import { useMenuStore } from "../store/menuStore";
import { notificationRepository } from "../repositories";

const DEAL_TYPES = [
  "Buy 1 Get 1",
  "Flat Discount",
  "Free Starter / Beverage",
  "Combo Special",
  "Weekend Daawat Offer",
];

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const Deals = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { deals, loading, subscribeDeals, disconnectDeals, addDeal, updateDeal, deleteDeal } = useDealStore();
  const { menuItems, subscribeMenuItems, disconnectMenuItems } = useMenuStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editDealId, setEditDealId] = useState(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Buy 1 Get 1");
  const [minOrder, setMinOrder] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [status, setStatus] = useState("Active");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [notifyCustomers, setNotifyCustomers] = useState(true);

  useEffect(() => {
    subscribeDeals();
    subscribeMenuItems();
    return () => {
      disconnectDeals();
      disconnectMenuItems();
    };
  }, [subscribeDeals, disconnectDeals, subscribeMenuItems, disconnectMenuItems]);

  const availableMenuItems = useMemo(() => {
    const list = menuItems.filter((i) => i.isDeleted !== true);
    if (!itemSearch.trim()) return list;
    const q = itemSearch.toLowerCase().trim();
    return list.filter(
      (i) =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q)
    );
  }, [menuItems, itemSearch]);

  const handleOpenAddModal = () => {
    setEditDealId(null);
    setTitle("");
    setType("Buy 1 Get 1");
    setMinOrder("");
    setStartDate("");
    setExpiryDate("");
    setStatus("Active");
    setSelectedItemIds([]);
    setItemSearch("");
    setNotifyCustomers(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (deal) => {
    setEditDealId(deal.id);
    setTitle(deal.title || deal.name || "");
    setType(deal.type || "Buy 1 Get 1");
    setMinOrder(
      (deal.minimumOrderValue !== undefined
        ? deal.minimumOrderValue
        : deal.minOrder || 0
      ).toString()
    );
    setStartDate(deal.startDate || "");
    setExpiryDate(deal.expiryDate || deal.expiry || "");
    setStatus(deal.status || "Active");
    const existingIds = Array.isArray(deal.menuItemIds)
      ? deal.menuItemIds
      : deal.menuItemId
      ? [deal.menuItemId]
      : [];
    setSelectedItemIds(existingIds);
    setItemSearch("");
    setNotifyCustomers(false);
    setIsModalOpen(true);
  };

  const handleSaveDeal = async (e) => {
    e.preventDefault();
    if (!title.trim() || !minOrder) {
      addToast("Please fill in required fields", "error");
      return;
    }

    const minOrderVal = parseFloat(minOrder) || 0;
    const dealToEdit = editDealId ? deals.find((d) => d.id === editDealId) : null;

    const dealPayload = {
      title: title.trim(),
      name: title.trim(),
      type,
      minOrder: minOrderVal,
      minimumOrderValue: minOrderVal,
      menuItemIds: selectedItemIds,
      menuItemId: selectedItemIds[0] || "",
      startDate: startDate || null,
      expiry: expiryDate || "No Expiry",
      expiryDate: expiryDate || null,
      status,
      isActive: status === "Active",
      usage: dealToEdit?.usage || "0 times",
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editDealId) {
        await updateDeal(editDealId, dealPayload, user);
        addToast("Deal updated successfully", "success");
      } else {
        await addDeal(dealPayload, user);
        addToast("New deal campaign created", "success");

        if (notifyCustomers) {
          try {
            await notificationRepository.create({
              userId: "all",
              type: "marketing",
              title: "🔥 Special Deal Alert!",
              message: `${title}. Unlock on orders above ₹${minOrderVal}!`,
              isRead: false,
            });
          } catch (notifyErr) {
            console.warn("Could not send broadcast:", notifyErr);
          }
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      addToast(`Save failed: ${err.message}`, "error");
    }
  };

  const handleDeleteDeal = async (id, dealTitle) => {
    if (!window.confirm(`Delete deal campaign "${dealTitle}"?`)) return;
    try {
      await deleteDeal(id, user);
      addToast("Deal removed", "info");
    } catch (err) {
      addToast(`Could not delete: ${err.message}`, "error");
    }
  };

  const toggleDealStatus = async (deal) => {
    const next = deal.status === "Active" ? "Inactive" : "Active";
    try {
      await updateDeal(deal.id, { status: next, isActive: next === "Active" }, user);
      addToast(`Deal is now ${next}`, "success");
    } catch (err) {
      addToast(`Could not update: ${err.message}`, "error");
    }
  };

  // KPIs
  const activeCount = deals.filter((d) => d.status === "Active" || d.isActive === true).length;
  const linkedItemsCount = deals.filter((d) => (d.menuItemIds && d.menuItemIds.length > 0) || d.menuItemId).length;

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (selectedTypeFilter !== "ALL" && d.type !== selectedTypeFilter) return false;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        (d.title || "").toLowerCase().includes(q) ||
        (d.type || "").toLowerCase().includes(q)
      );
    });
  }, [deals, selectedTypeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Promotional Deals & Combos
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Create high-converting menu promotions, BOGO treats, cart threshold perks, and daawat combos.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Create Deal Campaign
        </button>
      </div>

      {/* ── KPI Bento Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Deals</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{activeCount} Live</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Visible to customers in app</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">local_offer</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Campaigns</span>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{deals.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Campaigns created to date</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">campaign</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dish-Linked Deals</span>
            <p className="text-2xl font-black text-purple-600 mt-1">{linkedItemsCount}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Targeting specific foods</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">fastfood</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar: Filter & Search ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Deal Types Filter */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl">
          {["ALL", "Buy 1 Get 1", "Flat Discount", "Combo Special"].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTypeFilter(t)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                selectedTypeFilter === t
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {t === "ALL" ? "All Deals" : t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deals..."
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

      {/* ── Deals Table ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-400">Loading promotional deals...</span>
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <span className="material-symbols-outlined text-2xl">local_offer</span>
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Deals Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || selectedTypeFilter !== "ALL"
                ? "No deals match your filter criteria."
                : "Create promotional deals to incentivize customers."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider font-bold text-slate-400">
                  <th className="pl-6 pr-4 py-4">Campaign Title</th>
                  <th className="px-4 py-4">Deal Type</th>
                  <th className="px-4 py-4">Min. Cart Value</th>
                  <th className="px-4 py-4">Linked Food Items</th>
                  <th className="px-4 py-4">Expiry Date</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="pr-6 pl-4 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredDeals.map((deal) => {
                  const isActive = deal.status === "Active" || deal.isActive === true;
                  const minOrderVal = deal.minOrder !== undefined ? deal.minOrder : deal.minimumOrderValue || 0;
                  const itemsCount = deal.menuItemIds?.length || (deal.menuItemId ? 1 : 0);

                  return (
                    <tr key={deal.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      {/* Title */}
                      <td className="pl-6 pr-4 py-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-600 text-sm">local_offer</span>
                          {deal.title}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {deal.id.slice(0, 10)}</p>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                          {deal.type}
                        </span>
                      </td>

                      {/* Min Order */}
                      <td className="px-4 py-4 font-black text-slate-900 dark:text-white">
                        {inr(minOrderVal)}
                      </td>

                      {/* Linked Items */}
                      <td className="px-4 py-4">
                        {itemsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                            {itemsCount} dish{itemsCount > 1 ? "es" : ""} linked
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Entire menu</span>
                        )}
                      </td>

                      {/* Expiry */}
                      <td className="px-4 py-4 text-slate-500 font-semibold">
                        {deal.expiry || deal.expiryDate || "Ongoing"}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleDealStatus(deal)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition flex items-center gap-1 ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {isActive ? "Active" : "Inactive"}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="pr-6 pl-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(deal)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Edit Deal"
                          >
                            <span className="material-symbols-outlined text-[17px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteDeal(deal.id, deal.title)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 transition"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-[17px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editDealId ? "Edit Deal Campaign" : "Create New Deal Campaign"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveDeal} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Campaign Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Free Starter Beverage on Orders Above ₹399"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Deal Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  >
                    {DEAL_TYPES.map((dt) => (
                      <option key={dt} value={dt}>{dt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Min. Order Value (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                    placeholder="e.g. 299"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Linked Items Multi-Select */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Target Food Items (Leave empty to apply to entire menu)
                </label>
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search dishes to link..."
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500 mb-2"
                />

                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-1 bg-slate-50/50 dark:bg-slate-800/40">
                  {availableMenuItems.slice(0, 15).map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition ${
                          isSelected ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold" : "hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedItemIds((prev) =>
                                isSelected ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                              );
                            }}
                            className="w-3.5 h-3.5 accent-emerald-500"
                          />
                          <span>{item.name || item.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">₹{item.price}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {!editDealId && (
                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={notifyCustomers}
                      onChange={(e) => setNotifyCustomers(e.target.checked)}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    Notify all customers via in-app broadcast alert
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition"
                >
                  {editDealId ? "Save Deal" : "Publish Deal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deals;
