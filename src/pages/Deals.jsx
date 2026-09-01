import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useDealStore } from "../store/dealStore";
import { notificationRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const Deals = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { deals, loading, subscribeDeals, disconnectDeals, addDeal, updateDeal, deleteDeal } = useDealStore();

  // Real, from the loaded deals — not a literal.
  const activeDealCount = deals.filter((d) => d.status === "Active").length;

  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editDealId, setEditDealId] = useState(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Buy 1 Get 1");
  const [minOrder, setMinOrder] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [status, setStatus] = useState("Active");

  // Live subscription rather than a one-shot read, and torn down on unmount
  // so navigating away doesn't leave a Firestore listener running.
  useEffect(() => {
    subscribeDeals();
    return () => disconnectDeals();
  }, [subscribeDeals, disconnectDeals]);

  const handleOpenAddModal = () => {
    setEditDealId(null);
    setTitle("");
    setType("Buy 1 Get 1");
    setMinOrder("");
    setExpiryDate("");
    setStatus("Active");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (deal) => {
    setEditDealId(deal.id);
    setTitle(deal.title || "");
    setType(deal.type || "Buy 1 Get 1");
    setMinOrder((deal.minimumOrderValue !== undefined ? deal.minimumOrderValue : deal.minOrder || 0).toString());
    setExpiryDate(deal.expiryDate || deal.expiry || "");
    setStatus(deal.status || "Active");
    setIsModalOpen(true);
  };

  const handleSaveDeal = async (e) => {
    e.preventDefault();
    if (!title.trim() || !minOrder) {
      addToast("Please fill in required fields", "error");
      return;
    }

    const minOrderVal = parseFloat(minOrder);

    const dealPayload = {
      title,
      type,
      minOrder: minOrderVal,
      expiry: expiryDate || "No Expiry",
      expiresAt: expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status,
      isActive: status === "Active",
      usage: "0 times"
    };

    try {
      if (editDealId) {
        await updateDeal(editDealId, dealPayload, user);
        addToast("Deal campaign updated successfully", "success");
      } else {
        await addDeal(dealPayload, user);

        /*
         * The broadcast must not be able to fail the save.
         *
         * This was awaited inside the same try/catch as `addDeal`, so a
         * notification write rejected by rules surfaced as "Failed to save
         * deal" for a deal that had already been created — and the natural
         * response is to create it again, producing duplicate campaigns and a
         * second broadcast.
         */
        addToast("New deal campaign created", "success");
        try {
          await notificationRepository.create({
            userId: "all",
            type: "marketing",
            title: "New Deal Available!",
            message: `${title}. Get this deal on orders above ₹${minOrderVal}!`,
            isRead: false
          });
        } catch (notifyErr) {
          addToast(`Deal saved, but customers were not notified: ${notifyErr.message}`, "warning");
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      addToast("Failed to save deal", "error");
    }
  };

  const handleDeleteDeal = async (id, title) => {
    if (confirm(`Are you sure you want to delete the deal campaign "${title}"?`)) {
      try {
        await deleteDeal(id, user);
        addToast(`Deal campaign "${title}" deleted`, "success");
      } catch (err) {
        console.error(err);
        addToast("Failed to delete deal", "error");
      }
    }
  };

  if (loading && deals.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  const filteredDeals = deals.filter((d) =>
    (d.title || "")?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.type || "")?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27]">Deals Campaign</h2>
          <p className="font-body-md text-body-md text-[#555f6f] mt-1">
            Manage restaurant combos, item discounts, and app specials.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-[#10b981] text-white font-label-md text-label-md px-5 py-2.5 rounded-lg border-t border-white/20 hover:bg-[#059669] transition-colors flex items-center gap-2 shadow-sm inner-shine"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Campaign Deal
        </button>
      </div>

      {/* KPI Row (Total Value Saved is monetary, so it must show ₹--) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* KPI 1: Value Saved */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#00af79]/10 rounded-full blur-2xl group-hover:bg-[#00af79]/20 transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="font-label-md text-label-md text-[#555f6f]">Deals Redeemed Value</span>
            <span className="material-symbols-outlined text-[#006c49] p-2 bg-[#00af79]/20 rounded-lg">local_offer</span>
          </div>
          <div className="relative z-10">
            {/* The figure was the literal "₹--" under a "+8.2% vs last
                month" trend. Nothing in the deal documents records redemption
                value, so neither the amount nor the trend was ever computed —
                the percentage was the same on every load, forever. Deals are
                applied at checkout without writing back a redemption record,
                so this cannot be derived here; saying so beats a number that
                looks measured. */}
            <span className="font-headline-display text-headline-display text-[#555f6f] font-bold">Not tracked</span>
            <div className="mt-2">
              <span className="font-label-sm text-label-sm text-[#555f6f]">
                Deal redemptions are not recorded against orders
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Deals Usage */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#10b981]/10 rounded-full blur-2xl group-hover:bg-[#10b981]/20 transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="font-label-md text-label-md text-[#555f6f]">Active Deals Count</span>
            <span className="material-symbols-outlined text-[#10b981] p-2 bg-[#10b981]/20 rounded-lg">campaign</span>
          </div>
          <div className="relative z-10">
            {/* Was the literal "6 Deals" with "Steady performance" beneath
                it, regardless of how many deals existed. This one is real. */}
            <span className="font-headline-display text-headline-display text-[#151c27] font-bold">
              {activeDealCount}
            </span>
            <div className="mt-2">
              <span className="font-label-sm text-label-sm text-[#555f6f]">
                of {deals.length} total campaigns
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3: Redeemed Count */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#d6e0f3]/40 rounded-full blur-2xl group-hover:bg-[#d6e0f3]/60 transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="font-label-md text-label-md text-[#555f6f]">Total Claims Today</span>
            <span className="material-symbols-outlined text-[#596373] p-2 bg-[#d6e0f3] rounded-lg">shopping_basket</span>
          </div>
          <div className="relative z-10">
            {/* "648 Claims" and "18% increase this week" were both literals. */}
            <span className="font-headline-display text-headline-display text-[#555f6f] font-bold">Not tracked</span>
            <div className="mt-2">
              <span className="font-label-sm text-label-sm text-[#555f6f]">
                No per-claim record is written when a deal is applied
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Deals Table List */}
      <div className="bg-white border border-[#dce2f3] rounded-xl shadow-sm flex flex-col">
        <div className="p-5 border-b border-[#dce2f3]/60 flex justify-between items-center bg-[#f9f9ff] rounded-t-xl">
          <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold">Active Campaigns</h3>
          <div className="flex gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555f6f]/60 text-sm">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-[#d3daea] rounded-lg text-xs font-body-sm w-48 focus:outline-none focus:border-[#10b981]"
                placeholder="Search campaigns..."
                type="text"
              />
            </div>
          </div>
        </div>
        
        {filteredDeals.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="local_offer"
              title="No Deals Available"
              description="No active campaign deals found matching your search."
              actionText="Create Deal Campaign"
              onActionClick={handleOpenAddModal}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f0f3ff]/40 border-b border-[#dce2f3]">
                <tr>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Campaign Deal</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Deal Type</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Min. Order</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Claims Count</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Expiry Date</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Status</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dce2f3]/30 text-[#151c27] font-body-sm text-body-sm">
                {filteredDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-[#f0f3ff]/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-label-md text-label-md text-[#10b981] font-bold">{deal.title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold">{deal.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#555f6f]">₹{(deal.minOrder !== undefined ? deal.minOrder : (deal.minimumOrderValue || 0)).toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span>{deal.usage}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#555f6f]">{deal.expiry}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full font-label-sm text-[10px] uppercase tracking-wide border ${
                          deal.status === "Active"
                            ? "bg-[#ecfdf5] text-[#006c49] border-[#10b981]"
                            : "bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]"
                        }`}
                      >
                        {deal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEditModal(deal)}
                        className="p-1.5 text-[#555f6f] hover:text-[#10b981] transition-colors"
                        title="Edit"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteDeal(deal.id, deal.title)}
                        className="p-1.5 text-[#555f6f] hover:text-[#ba1a1a] transition-colors"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Deal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#151c27]/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.08)] border border-[#dce2f3] w-full max-w-md relative z-10 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#dce2f3] bg-[#f9f9ff] flex justify-between items-center">
              <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">
                {editDealId ? "Edit Deal" : "Create New Deal"}
              </h3>
              <button
                className="text-[#555f6f] hover:text-[#151c27] p-1 rounded-full hover:bg-[#f0f3ff] transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveDeal}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                    Campaign Deal Title <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm font-body-sm text-[#151c27]"
                    placeholder="e.g. Free Starter Drink with Burger"
                    required
                    type="text"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                    Deal Promotion Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm font-body-sm text-[#151c27]"
                  >
                    <option value="Buy 1 Get 1 Free">Buy 1 Get 1 Free</option>
                    <option value="Free Item with Main Order">Free Item with Main Order</option>
                    <option value="Flat 30% Off Beverages">Flat 30% Off Beverages</option>
                    <option value="Combo Special Deal">Combo Special Deal</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Min. Order (₹) <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <input
                      value={minOrder}
                      onChange={(e) => setMinOrder(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm text-[#151c27]"
                      placeholder="0.00"
                      required
                      type="number"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Expiry Date
                    </label>
                    <input
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-[#555f6f] text-body-sm"
                      type="date"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm font-body-sm text-[#151c27]"
                  >
                    <option value="Active">Active</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-[#dce2f3] bg-[#f9f9ff] flex justify-end gap-3 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-label-md text-label-md text-[#555f6f] hover:bg-[#f0f3ff] rounded transition-colors bg-white border border-[#d3daea]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-label-md text-label-md text-white bg-[#10b981] hover:bg-[#059669] rounded shadow-sm border-t border-white/20 transition-colors inner-shine"
                >
                  Save Deal
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
