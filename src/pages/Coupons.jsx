import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useCouponStore } from "../store/couponStore";
import { notificationRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const Coupons = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { coupons, loading, fetchCoupons, addCoupon, updateCoupon, deleteCoupon } = useCouponStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editCouponId, setEditCouponId] = useState(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("Percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [status, setStatus] = useState("Active");

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleOpenAddModal = () => {
    setEditCouponId(null);
    setCode("");
    setDiscountType("Percentage");
    setDiscountValue("");
    setMinOrder("");
    setExpiryDate("");
    setStatus("Active");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (coupon) => {
    setEditCouponId(coupon.id);
    setCode(coupon.code);
    const dbType = coupon.discountType || "Percentage";
    setDiscountType(dbType === "percentage" ? "Percentage" : dbType === "flat" ? "Flat Discount" : dbType);
    setDiscountValue(coupon.discountValue?.toString() || "");
    setMinOrder((coupon.minimumOrderValue !== undefined ? coupon.minimumOrderValue : coupon.minOrder || 0).toString());
    setExpiryDate(coupon.expiryDate || coupon.expiry || "");
    setStatus(coupon.status || (coupon.isActive !== false ? "Active" : "Expired"));
    setIsModalOpen(true);
  };

  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    if (!code.trim() || !minOrder) {
      addToast("Please fill in required fields", "error");
      return;
    }

    const minOrderVal = parseFloat(minOrder);
    const discountValNum = parseFloat(discountValue) || 0;
    let displayType = "";
    if (discountType === "Percentage") {
      displayType = `${discountValNum}% Off`;
    } else if (discountType === "Flat Discount") {
      displayType = `₹${discountValNum}.00 Flat Off`;
    } else {
      displayType = "Free Delivery";
    }

    const couponPayload = {
      code: code.toUpperCase(),
      description: `Get ${displayType} on orders above ₹${minOrderVal}`,
      discountType: discountType === "Percentage" ? "percentage" : "flat",
      discountValue: discountValNum,
      minOrderValue: minOrderVal,
      maxDiscount: discountType === "Percentage" ? discountValNum * 2 : discountValNum,
      expiresAt: expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: status === "Active",
      status: status,
      usage: "0 / ∞",
      type: displayType,
      expiry: expiryDate || "No Expiry"
    };

    try {
      if (editCouponId) {
        await updateCoupon(editCouponId, couponPayload, user);
        addToast("Coupon updated successfully", "success");
      } else {
        await addCoupon(couponPayload, user);

        // Send a marketing notification to all customers
        await notificationRepository.create({
          userId: "all",
          type: "marketing",
          title: "New Coupon Available!",
          message: `Use code ${code.toUpperCase()} to get ${displayType} on orders above ₹${minOrderVal}.`,
          isRead: false
        });

        addToast("New coupon created successfully", "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      addToast("Failed to save coupon", "error");
    }
  };

  const handleDeleteCoupon = async (id, code) => {
    if (confirm(`Are you sure you want to delete coupon "${code}"?`)) {
      try {
        await deleteCoupon(id, user);
        addToast(`Coupon "${code}" deleted`, "success");
      } catch (err) {
        console.error(err);
        addToast("Failed to delete coupon", "error");
      }
    }
  };

  if (loading && coupons.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  const filteredCoupons = coupons.filter((c) =>
    c.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.type || c.description)?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27]">Coupons</h2>
          <p className="font-body-md text-body-md text-[#555f6f] mt-1">
            Manage promotional campaigns and track discount performance.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-[#10b981] text-white font-label-md text-label-md px-5 py-2.5 rounded-lg border-t border-white/20 hover:bg-[#059669] transition-colors flex items-center gap-2 shadow-sm inner-shine"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Coupon
        </button>
      </div>

      {/* KPI Row (Total Value Saved is monetary, so it must show ₹--) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* KPI 1: Value Saved */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#00af79]/10 rounded-full blur-2xl group-hover:bg-[#00af79]/20 transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="font-label-md text-label-md text-[#555f6f]">Total Value Saved</span>
            <span className="material-symbols-outlined text-[#006c49] p-2 bg-[#00af79]/20 rounded-lg">savings</span>
          </div>
          <div className="relative z-10">
            <span className="font-headline-display text-headline-display text-[#151c27] font-bold">₹--</span>
            <div className="flex items-center gap-1 mt-2 text-[#006c49]">
              <span className="material-symbols-outlined text-[16px]">trending_up</span>
              <span className="font-label-sm text-label-sm">+12.5% vs last month</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Coupon Usage Rate */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#10b981]/10 rounded-full blur-2xl group-hover:bg-[#10b981]/20 transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="font-label-md text-label-md text-[#555f6f]">Avg. Coupon Usage Rate</span>
            <span className="material-symbols-outlined text-[#10b981] p-2 bg-[#10b981]/20 rounded-lg">percent</span>
          </div>
          <div className="relative z-10">
            <span className="font-headline-display text-headline-display text-[#151c27] font-bold">28.4%</span>
            <div className="flex items-center gap-1 mt-2 text-[#555f6f]">
              <span className="material-symbols-outlined text-[16px]">horizontal_rule</span>
              <span className="font-label-sm text-label-sm">Steady performance</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Active Campaigns */}
        <div className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#d6e0f3]/40 rounded-full blur-2xl group-hover:bg-[#d6e0f3]/60 transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="font-label-md text-label-md text-[#555f6f]">Active Campaigns</span>
            <span className="material-symbols-outlined text-[#596373] p-2 bg-[#d6e0f3] rounded-lg">campaign</span>
          </div>
          <div className="relative z-10">
            <span className="font-headline-display text-headline-display text-[#151c27] font-bold">12</span>
            <div className="flex items-center gap-1 mt-2 text-[#555f6f]">
              <span className="font-label-sm text-label-sm">3 expiring this week</span>
            </div>
          </div>
        </div>
      </div>

      {/* Coupons Table List */}
      <div className="bg-white border border-[#dce2f3] rounded-xl shadow-sm flex flex-col">
        <div className="p-5 border-b border-[#dce2f3]/60 flex justify-between items-center bg-[#f9f9ff] rounded-t-xl">
          <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold">Active Coupons</h3>
          <div className="flex gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555f6f]/60 text-sm">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-[#d3daea] rounded-lg text-xs font-body-sm w-48 focus:outline-none focus:border-[#10b981]"
                placeholder="Search coupons..."
                type="text"
              />
            </div>
          </div>
        </div>
        
        {filteredCoupons.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="confirmation_number"
              title="No Coupons Available"
              description="No active promotional coupons found matching your search."
              actionText="Create Coupon"
              onActionClick={handleOpenAddModal}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f0f3ff]/40 border-b border-[#dce2f3]">
                <tr>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Coupon Code</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Discount Type</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Min. Order</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Usage</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Expiry Date</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold">Status</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[#555f6f] font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dce2f3]/30 text-[#151c27] font-body-sm text-body-sm">
                {filteredCoupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-[#f0f3ff]/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-label-md text-label-md text-[#10b981] font-bold">{coupon.code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold">{coupon.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#555f6f]">₹{(coupon.minOrder !== undefined ? coupon.minOrder : (coupon.minimumOrderValue || 0)).toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span>{coupon.usage}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#555f6f]">{coupon.expiry}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full font-label-sm text-[10px] uppercase tracking-wide border ${
                          coupon.status === "Active"
                            ? "bg-[#ecfdf5] text-[#006c49] border-[#10b981]"
                            : "bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]"
                        }`}
                      >
                        {coupon.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEditModal(coupon)}
                        className="p-1.5 text-[#555f6f] hover:text-[#10b981] transition-colors"
                        title="Edit"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCoupon(coupon.id, coupon.code)}
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

      {/* Add / Edit Coupon Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#151c27]/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.08)] border border-[#dce2f3] w-full max-w-md relative z-10 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#dce2f3] bg-[#f9f9ff] flex justify-between items-center">
              <h3 className="font-headline-md text-headline-md font-semibold text-[#151c27]">
                {editCouponId ? "Edit Coupon" : "Create New Coupon"}
              </h3>
              <button
                className="text-[#555f6f] hover:text-[#151c27] p-1 rounded-full hover:bg-[#f0f3ff] transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveCoupon}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                    Coupon Code <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-body-sm text-body-sm text-[#151c27]"
                    placeholder="e.g. EXTRA50"
                    required
                    type="text"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Discount Type
                    </label>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm font-body-sm"
                    >
                      <option value="Percentage">Percentage (%)</option>
                      <option value="Flat Discount">Flat (₹)</option>
                      <option value="Free Delivery">Free Delivery</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Value
                    </label>
                    <input
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      disabled={discountType === "Free Delivery"}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm disabled:opacity-50"
                      placeholder={discountType === "Percentage" ? "20" : "50"}
                      type="number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Min. Order (₹) <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <input
                      value={minOrder}
                      onChange={(e) => setMinOrder(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm"
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
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded focus:outline-none focus:border-[#10b981] text-body-sm font-body-sm"
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
                  Save Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default Coupons;
