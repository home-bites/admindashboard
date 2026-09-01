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
  const { coupons, loading, subscribeCoupons, disconnectCoupons, addCoupon, updateCoupon, deleteCoupon } = useCouponStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editCouponId, setEditCouponId] = useState(null);

  // Form Fields
  const [couponName, setCouponName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState("Percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [totalLimit, setTotalLimit] = useState("1000");
  const [userLimit, setUserLimit] = useState("1");
  const [userEligibility, setUserEligibility] = useState("All"); // All | New Customers Only | Existing Customers Only
  
  // Applicable Types
  const [appliesRegular, setAppliesRegular] = useState(true);
  const [appliesSubscription, setAppliesSubscription] = useState(true);
  const [subWeekly, setSubWeekly] = useState(true);
  const [subMonthly, setSubMonthly] = useState(true);
  const [subQuarterly, setSubQuarterly] = useState(true);
  
  // Control States
  const [status, setStatus] = useState("Active"); // Active | Inactive | Expired
  const [showToCustomer, setShowToCustomer] = useState(true); // Customer Visibility: ON/OFF
  const [autoApply, setAutoApply] = useState(false);

  useEffect(() => {
    subscribeCoupons();
    return () => disconnectCoupons();
  }, [subscribeCoupons, disconnectCoupons]);

  const handleOpenAddModal = () => {
    setEditCouponId(null);
    setCouponName("");
    setCode("");
    setDescription("");
    setDiscountType("Percentage");
    setDiscountValue("");
    setMaxDiscount("");
    setMinOrder("0");
    setValidFrom(new Date().toISOString().split('T')[0]);
    setExpiryDate("");
    setTotalLimit("1000");
    setUserLimit("1");
    setUserEligibility("All");
    setAppliesRegular(true);
    setAppliesSubscription(true);
    setSubWeekly(true);
    setSubMonthly(true);
    setSubQuarterly(true);
    setStatus("Active");
    setShowToCustomer(true);
    setAutoApply(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (coupon) => {
    setEditCouponId(coupon.id);
    setCouponName(coupon.name || coupon.couponName || "");
    setCode(coupon.code || "");
    setDescription(coupon.description || "");
    
    const dbType = coupon.discountType || "Percentage";
    setDiscountType(dbType === "percentage" ? "Percentage" : dbType === "flat" ? "Flat Discount" : dbType);
    setDiscountValue(coupon.discountValue?.toString() || "");
    setMaxDiscount(coupon.maxDiscount?.toString() || coupon.maxDiscountAmount?.toString() || "");
    setMinOrder((coupon.minimumOrderValue !== undefined ? coupon.minimumOrderValue : coupon.minOrder || 0).toString());
    setValidFrom(coupon.validFrom || coupon.startDate || new Date().toISOString().split('T')[0]);
    const exp = coupon.expiryDate || coupon.expiresAt || coupon.expiry || "";
    setExpiryDate(exp === "No Expiry" ? "" : exp);
    setTotalLimit((coupon.totalLimit || 1000).toString());
    setUserLimit((coupon.userLimit || coupon.perCustomerLimit || 1).toString());
    setUserEligibility(coupon.userEligibility || "All");
    
    setAppliesRegular(coupon.appliesRegular !== false);
    setAppliesSubscription(coupon.appliesSubscription !== false);
    setSubWeekly(coupon.subWeekly !== false);
    setSubMonthly(coupon.subMonthly !== false);
    setSubQuarterly(coupon.subQuarterly !== false);
    
    setStatus(coupon.status || (coupon.isActive !== false ? "Active" : "Inactive"));
    setShowToCustomer(coupon.showToCustomer !== undefined ? coupon.showToCustomer : !coupon.isHidden);
    setAutoApply(coupon.autoApply || false);
    
    setIsModalOpen(true);
  };

  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    if (!code.trim() || !minOrder) {
      addToast("Please fill in required code & minimum order", "error");
      return;
    }

    const minOrderVal = parseFloat(minOrder) || 0;
    const discountValNum = parseFloat(discountValue) || 0;
    const maxDiscountNum = parseFloat(maxDiscount) || (discountType === "Percentage" ? discountValNum * 2 : discountValNum);

    if (minOrderVal < 0) return addToast("Minimum order cannot be negative", "error");
    if (discountValNum < 0 || maxDiscountNum < 0) return addToast("Discount cannot be negative", "error");
    if (discountType === "Percentage" && discountValNum > 100) return addToast("Percentage cannot exceed 100", "error");
    if (parseInt(totalLimit) <= 0 || parseInt(userLimit) <= 0) return addToast("Limits must be greater than 0", "error");

    let displayType = "";
    if (discountType === "Percentage") {
      displayType = `${discountValNum}% Off`;
    } else if (discountType === "Flat Discount") {
      displayType = `₹${discountValNum}.00 Flat Off`;
    } else {
      displayType = "Free Delivery";
    }

    const descText = description.trim() || `Get ${displayType} on orders above ₹${minOrderVal}`;

    const couponPayload = {
      name: couponName.trim() || code.toUpperCase(),
      code: code.toUpperCase(),
      description: descText,
      discountType: discountType === "Percentage" ? "percentage" : discountType === "Flat Discount" ? "flat" : "free_delivery",
      discountValue: discountValNum,
      minOrderValue: minOrderVal,
      minOrder: minOrderVal,
      maxDiscount: maxDiscountNum,
      maxDiscountAmount: maxDiscountNum,
      validFrom: validFrom,
      expiresAt: expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      totalLimit: parseInt(totalLimit) || 1000,
      userLimit: parseInt(userLimit) || 1,
      userEligibility: userEligibility,
      
      appliesRegular: appliesRegular,
      appliesSubscription: appliesSubscription,
      subWeekly: subWeekly,
      subMonthly: subMonthly,
      subQuarterly: subQuarterly,
      
      status: status,
      isActive: status === "Active",
      showToCustomer: showToCustomer,
      isHidden: !showToCustomer,
      isVisible: showToCustomer,
      autoApply: autoApply,
      
      type: displayType,
      expiry: expiryDate || null,
      hasExpiry: !!expiryDate,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editCouponId) {
        await updateCoupon(editCouponId, couponPayload, user);
        addToast("Coupon updated successfully", "success");
      } else {
        await addCoupon(couponPayload, user);

        // Only send marketing push notification if coupon is public (showToCustomer = true) and active
        addToast("New coupon created", "success");

        // Non-fatal, for the same reason as Deals: a failed broadcast must not
        // report the coupon itself as unsaved and invite a duplicate.
        if (showToCustomer === true && String(status).toLowerCase() === "active") {
          try {
            await notificationRepository.create({
              userId: "all",
              type: "marketing",
              title: "New Offer Available!",
              message: `Use code ${code.toUpperCase()} to get ${displayType} on your orders!`,
              isRead: false
            });
          } catch (notifyErr) {
            addToast(`Coupon saved, but customers were not notified: ${notifyErr.message}`, "warning");
          }
        }
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

  // Analytics Metrics Calculation
  const totalCoupons = coupons.length;
  const activeCoupons = coupons.filter(c => (c.status === "Active" || c.isActive) && (c.showToCustomer !== false && !c.isHidden)).length;
  const hiddenCoupons = coupons.filter(c => c.showToCustomer === false || c.isHidden || c.status === "Hidden").length;
  const expiredCoupons = coupons.filter(c => c.status === "Expired" || (c.expiresAt && new Date(c.expiresAt) < new Date())).length;
  const totalRedemptions = coupons.reduce((acc, c) => acc + (c.redemptionCount || c.usageCount || 0), 0);

  const filteredCoupons = coupons.filter((c) => {
    const matchesSearch = c.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.name || c.description || c.type)?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterStatus === "ALL") return matchesSearch;
    if (filterStatus === "ACTIVE") return matchesSearch && (c.status === "Active" || c.isActive);
    if (filterStatus === "PUBLIC") return matchesSearch && (c.showToCustomer !== false && !c.isHidden);
    if (filterStatus === "HIDDEN") return matchesSearch && (c.showToCustomer === false || c.isHidden);
    if (filterStatus === "EXPIRED") return matchesSearch && (c.status === "Expired" || (c.expiresAt && new Date(c.expiresAt) < new Date()));
    return matchesSearch;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Promotional Coupons &amp; Discount Engine
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Configure public offers, private influencer codes, and subscription plan discounts.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs px-5 py-2.5 rounded-xl border-t border-white/20 transition-all flex items-center gap-2 shadow-xs"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Coupon
        </button>
      </div>

      {/* Analytics KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Total Coupons</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalCoupons}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Public (App Visible)</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{activeCoupons}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Hidden (Private/VIP)</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{hiddenCoupons}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Expired</div>
          <div className="text-2xl font-black text-rose-500 mt-1">{expiredCoupons}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Total Redemptions</div>
          <div className="text-2xl font-black text-blue-600 mt-1">{totalRedemptions}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs">
        <div className="relative w-full md:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#10b981]"
            placeholder="Search coupon codes, names..."
            type="text"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {["ALL", "ACTIVE", "PUBLIC", "HIDDEN", "EXPIRED"].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                filterStatus === st
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:text-slate-900"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Coupons Table List */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-3xs overflow-hidden">
        {filteredCoupons.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon="confirmation_number"
              title="No Coupons Found"
              description="No promotional coupons match your current filter settings."
              actionText="Create Coupon"
              onActionClick={handleOpenAddModal}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-6 py-4">Code &amp; Name</th>
                  <th className="px-6 py-4">Discount</th>
                  <th className="px-6 py-4">Min. Order</th>
                  <th className="px-6 py-4">Applicability</th>
                  <th className="px-6 py-4">App Visibility</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredCoupons.map((coupon) => {
                  const isHidden = coupon.showToCustomer === false || coupon.isHidden;
                  return (
                    <tr key={coupon.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-black text-[#10b981] font-mono text-sm">{coupon.code}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{coupon.name || coupon.description}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800">{coupon.type || `${coupon.discountValue}% Off`}</span>
                      </td>
                      <td className="px-6 py-4 font-mono">
                        ₹{(coupon.minimumOrderValue !== undefined ? coupon.minimumOrderValue : (coupon.minOrder || 0)).toFixed(0)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {coupon.appliesRegular !== false && (
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-2 py-0.5 rounded">Regular</span>
                          )}
                          {coupon.appliesSubscription !== false && (
                            <span className="bg-purple-50 text-purple-700 text-[9px] font-bold px-2 py-0.5 rounded">Subscription</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isHidden ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 font-bold text-[10px] px-2.5 py-1 rounded-full border border-amber-200">
                            <span className="material-symbols-outlined text-[12px]">visibility_off</span>
                            HIDDEN (Code Only)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2.5 py-1 rounded-full border border-emerald-200">
                            <span className="material-symbols-outlined text-[12px]">visibility</span>
                            SHOW IN APP
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                          coupon.status === "Active" || coupon.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {coupon.status || (coupon.isActive ? "Active" : "Inactive")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(coupon)}
                          className="p-1.5 text-slate-400 hover:text-[#10b981] transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteCoupon(coupon.id, coupon.code)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Coupon Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl relative z-10 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-900">
                  {editCouponId ? "Edit Coupon" : "Configure New Coupon"}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Set discount parameters, visibility, and eligibility rules.</p>
              </div>
              <button
                className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveCoupon} className="overflow-y-auto p-6 space-y-5 text-xs">
              {/* Row 1: Code & Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Coupon Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-mono font-bold uppercase text-slate-900"
                    placeholder="e.g. VIP50 / DIET20"
                    required
                    type="text"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Coupon Campaign Name
                  </label>
                  <input
                    value={couponName}
                    onChange={(e) => setCouponName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-medium text-slate-900"
                    placeholder="e.g. Influencer Special / New Customer Offer"
                    type="text"
                  />
                </div>
              </div>

              {/* Row 2: Customer Visibility Control */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Customer App Visibility</span>
                    <span className="text-[11px] text-slate-500">Controls whether coupon appears in customer banners &amp; offers list.</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowToCustomer(true)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        showToCustomer
                          ? "bg-emerald-500 text-white shadow-3xs"
                          : "bg-white text-slate-600 border border-slate-200"
                      }`}
                    >
                      SHOW TO CUSTOMERS
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowToCustomer(false)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        !showToCustomer
                          ? "bg-amber-600 text-white shadow-3xs"
                          : "bg-white text-slate-600 border border-slate-200"
                      }`}
                    >
                      HIDE (CODE ONLY)
                    </button>
                  </div>
                </div>
                {!showToCustomer && (
                  <div className="p-2.5 bg-amber-50 rounded-lg text-amber-800 text-[11px] font-medium border border-amber-200 flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-base">info</span>
                    This coupon will NOT be listed on app banners or offers screens. Customers can only redeem it by typing the exact code at checkout!
                  </div>
                )}
              </div>

              {/* Row 3: Discount Type & Values */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-semibold"
                  >
                    <option value="Percentage">Percentage (%)</option>
                    <option value="Flat Discount">Flat Amount (₹)</option>
                    <option value="Free Delivery">Free Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Discount Value</label>
                  <input
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    disabled={discountType === "Free Delivery"}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-bold text-slate-900 disabled:opacity-50"
                    placeholder="e.g. 20"
                    type="number"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Max Discount (₹)</label>
                  <input
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(e.target.value)}
                    disabled={discountType === "Free Delivery"}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-bold text-slate-900 disabled:opacity-50"
                    placeholder="e.g. 100"
                    type="number"
                  />
                </div>
              </div>

              {/* Row 4: Min Order & Limits */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Min. Order Value (₹) *</label>
                  <input
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-bold text-slate-900"
                    placeholder="0"
                    required
                    type="number"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Per Customer Limit</label>
                  <input
                    value={userLimit}
                    onChange={(e) => setUserLimit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-semibold text-slate-900"
                    placeholder="1"
                    type="number"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Expiry Date</label>
                  <input
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-medium text-slate-700"
                    type="date"
                  />
                </div>
              </div>

              {/* Row 5: Applicability & Subscription Support */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 block">Applicable Order Types</span>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={appliesRegular}
                      onChange={(e) => setAppliesRegular(e.target.checked)}
                      className="rounded accent-[#10b981]"
                    />
                    Regular Food Orders
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={appliesSubscription}
                      onChange={(e) => setAppliesSubscription(e.target.checked)}
                      className="rounded accent-[#10b981]"
                    />
                    Diet Subscription Plans
                  </label>
                </div>

                {appliesSubscription && (
                  <div className="pt-2 border-t border-slate-200 flex gap-4 text-[11px] font-semibold">
                    <span className="text-slate-500">Subscription Plans:</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={subWeekly} onChange={(e) => setSubWeekly(e.target.checked)} className="accent-[#10b981]" />
                      Weekly
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={subMonthly} onChange={(e) => setSubMonthly(e.target.checked)} className="accent-[#10b981]" />
                      Monthly
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={subQuarterly} onChange={(e) => setSubQuarterly(e.target.checked)} className="accent-[#10b981]" />
                      Quarterly
                    </label>
                  </div>
                )}
              </div>

              {/* Row 6: Status */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">Coupon Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-bold text-slate-900"
                >
                  <option value="Active">Active (Valid for Redemption)</option>
                  <option value="Inactive">Inactive (Disabled)</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold bg-white border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-white bg-[#10b981] hover:bg-[#059669] rounded-xl font-bold shadow-xs border-t border-white/20"
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
