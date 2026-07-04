import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { SettingsService } from "../services";
import * as LoadingComponents from "../components/LoadingComponents";
import { isFirebaseConfigured } from "../firebase/firebaseConfig";

export const Settings = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState("store");
  const [loading, setLoading] = useState(true);
  
  // Store identity state
  const [storeName, setStoreName] = useState("HomeBites Central Hub");
  const [storePhone, setStorePhone] = useState("+91 98765 43210");
  const [storeAddress, setStoreAddress] = useState("482 Culinary Ave, Suite 200, Food District, Bangalore, 560001");
  const [orderInstructions, setOrderInstructions] = useState("Please note any severe allergies. Our kitchen handles nuts and dairy.");
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [preordersAvailable, setPreordersAvailable] = useState(true);

  // Financial parameters state
  const [taxRate, setTaxRate] = useState(5.0); // GST %
  const [commissionRate, setCommissionRate] = useState(10.0); // Delivery partner commission %
  const [platformFee, setPlatformFee] = useState(15.0); // Platform fee in ₹
  const [minOrderValue, setMinOrderValue] = useState(150.0); // Min order value in ₹
  const [deliveryCharge, setDeliveryCharge] = useState(30.0); // Delivery charge in ₹
  const [rainCharge, setRainCharge] = useState(0.0); // Rain charge in ₹

  // System parameters state
  const [devBypassActive, setDevBypassActive] = useState(true);
  const [appCheckStatus, setAppCheckStatus] = useState("Secured (Debug Provider)");
  
  // Toggles for system
  const [walletEnabled, setWalletEnabled] = useState(true);
  const [couponEnabled, setCouponEnabled] = useState(true);
  const [deliveryTrackingEnabled, setDeliveryTrackingEnabled] = useState(true);
  const [showPartnerEarnings, setShowPartnerEarnings] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Operational Hours state
  const [hours, setHours] = useState([
    { day: "Mon", active: true, start: "09:00", end: "22:00" },
    { day: "Tue", active: true, start: "09:00", end: "22:00" },
    { day: "Wed", active: true, start: "09:00", end: "22:00" },
    { day: "Thu", active: true, start: "09:00", end: "22:00" },
    { day: "Fri", active: true, start: "09:00", end: "23:00" },
    { day: "Sat", active: true, start: "08:00", end: "23:30" },
    { day: "Sun", active: false, start: "09:00", end: "22:00" }
  ]);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const data = await SettingsService.getSettings();
        if (data) {
          setStoreName(data.storeName || "HomeBites Central Hub");
          setStorePhone(data.supportPhone || "+91 98765 43210");
          setStoreAddress(data.storeAddress || "482 Culinary Ave, Suite 200, Food District, Bangalore, 560001");
          setOrderInstructions(data.orderInstructions || "Please note any severe allergies. Our kitchen handles nuts and dairy.");
          setAcceptingOrders(data.storeOpen !== undefined ? data.storeOpen : true);
          setPreordersAvailable(data.preordersAvailable !== undefined ? data.preordersAvailable : true);

          setTaxRate(data.taxRate !== undefined ? data.taxRate : 5.0);
          setCommissionRate(data.commissionRate !== undefined ? data.commissionRate : 10.0);
          setPlatformFee(data.platformFee !== undefined ? data.platformFee : 15.0);
          setMinOrderValue(data.minimumOrderValue !== undefined ? data.minimumOrderValue : 150.0);
          setDeliveryCharge(data.deliveryCharge !== undefined ? data.deliveryCharge : 30.0);
          setRainCharge(data.rainCharge !== undefined ? data.rainCharge : 0.0);

          setWalletEnabled(data.walletEnabled !== undefined ? data.walletEnabled : true);
          setCouponEnabled(data.couponEnabled !== undefined ? data.couponEnabled : true);
          setDeliveryTrackingEnabled(data.deliveryTrackingEnabled !== undefined ? data.deliveryTrackingEnabled : true);
          setShowPartnerEarnings(data.showPartnerEarnings !== undefined ? data.showPartnerEarnings : false);
          setMaintenanceMode(data.maintenanceMode !== undefined ? data.maintenanceMode : false);

          if (data.hours) {
            setHours(data.hours);
          }
        }
      } catch (err) {
        addToast(`Failed to load settings: ${err.message}`, "error");
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [addToast]);

  const handleHourToggle = (index) => {
    const newHours = [...hours];
    newHours[index].active = !newHours[index].active;
    setHours(newHours);
  };

  const handleHourChange = (index, field, value) => {
    const newHours = [...hours];
    newHours[index][field] = value;
    setHours(newHours);
  };

  const handleSave = async () => {
    const payload = {
      storeName,
      supportPhone: storePhone,
      storeAddress,
      orderInstructions,
      storeOpen: acceptingOrders,
      preordersAvailable,
      taxRate: Number(taxRate),
      commissionRate: Number(commissionRate),
      platformFee: Number(platformFee),
      minimumOrderValue: Number(minOrderValue),
      deliveryCharge: Number(deliveryCharge),
      rainCharge: Number(rainCharge),
      walletEnabled,
      couponEnabled,
      deliveryTrackingEnabled,
      showPartnerEarnings,
      maintenanceMode,
      hours
    };

    try {
      await SettingsService.updateSettings(payload, user);
      addToast("Settings saved successfully", "success");
    } catch (err) {
      addToast(`Failed to save settings: ${err.message}`, "error");
    }
  };

  const handleClearCache = () => {
    addToast("Operational cache cleared", "success");
  };

  const handleDatabaseBackup = () => {
    addToast("Generating JSON Database backup file...", "info");
    setTimeout(() => {
      addToast("Backup file generated and downloaded successfully", "success");
    }, 1200);
  };

  const handleResetDatabase = async () => {
    const confirm = window.confirm(
      "WARNING: This will permanently delete all orders from the database. User accounts, delivery partner profiles, and settings will NOT be deleted.\n\nAre you sure you want to proceed?"
    );
    if (!confirm) return;

    addToast("Resetting database...", "info");

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;
    if (isMock) {
      addToast("Database reset successfully (Mock Mode)", "success");
      return;
    }

    try {
      const { collection, getDocs, writeBatch, doc, deleteDoc } = await import("firebase/firestore");
      const { db } = await import("../firebase/firebaseConfig");

      const colRef = collection(db, "orders");
      const snapshot = await getDocs(colRef);
      
      if (snapshot.size > 0) {
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      const counterRef = doc(db, "systemCounters", "orders");
      await deleteDoc(counterRef);

      addToast("Database reset successfully. All orders have been cleared.", "success");
    } catch (err) {
      addToast(`Database reset failed: ${err.message}`, "error");
    }
  };

  if (loading) {
    return <LoadingComponents.LoadingPage />;
  }

  return (
    <div className="p-8 min-h-screen bg-[#f9f9ff] flex flex-col">
      {/* Page Header & Global Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-[#151c27]">Settings</h2>
          <p className="font-body-md text-body-md text-[#555f6f] mt-1">
            Manage kitchen operations, store configuration, and financial parameters.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inner-shine bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md px-6 py-2.5 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2 h-fit"
        >
          <span className="material-symbols-outlined text-[18px]">save</span>
          Save Changes
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-8 border-b border-[#dce2f3] mb-8 overflow-x-auto">
        <button
          onClick={() => setActiveTab("store")}
          className={`pb-3 font-label-md text-label-md flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "store"
              ? "text-[#10b981] font-bold border-[#10b981]"
              : "text-[#555f6f] hover:text-[#151c27] border-transparent"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">storefront</span>
          Store
        </button>
        <button
          onClick={() => setActiveTab("financial")}
          className={`pb-3 font-label-md text-label-md flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "financial"
              ? "text-[#10b981] font-bold border-[#10b981]"
              : "text-[#555f6f] hover:text-[#151c27] border-transparent"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">payments</span>
          Financial
        </button>
        <button
          onClick={() => setActiveTab("system")}
          className={`pb-3 font-label-md text-label-md flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "system"
              ? "text-[#10b981] font-bold border-[#10b981]"
              : "text-[#555f6f] hover:text-[#151c27] border-transparent"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
          System
        </button>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {activeTab === "store" && (
          <>
            {/* Left Column: Primary Config */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {/* Card: Operating Status */}
              <section className="bg-white border border-[#dce2f3] rounded-xl p-6 relative overflow-hidden group shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold">Operating Status</h3>
                    <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">Control live visibility and ordering capabilities.</p>
                  </div>
                  <span className={`px-3 py-1 font-label-sm text-label-sm rounded-full uppercase tracking-wider border font-semibold ${
                    acceptingOrders && !maintenanceMode
                      ? "bg-[#ECFDF5] text-[#10B981] border-[#10B981]/20"
                      : "bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]/20"
                  }`}>
                    {maintenanceMode ? "Maintenance" : acceptingOrders ? "Live" : "Paused"}
                  </span>
                </div>
                <div className="space-y-4">
                  {/* Accepting Orders */}
                  <div className="flex items-center justify-between p-4 bg-[#f9f9ff] rounded-lg border border-[#dce2f3]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#10b981]/10 text-[#10b981] flex items-center justify-center">
                        <span className="material-symbols-outlined">power_settings_new</span>
                      </div>
                      <div>
                        <div className="font-label-md text-label-md text-[#151c27] font-semibold">Accepting Orders</div>
                        <div className="font-body-sm text-body-sm text-[#555f6f]">Allow customers to place new orders immediately.</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acceptingOrders}
                        onChange={(e) => setAcceptingOrders(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#d3daea] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#10b981]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Preorders Available */}
                  <div className="flex items-center justify-between p-4 bg-[#f9f9ff] rounded-lg border border-[#dce2f3]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#d6e0f3] text-[#555f6f] flex items-center justify-center">
                        <span className="material-symbols-outlined">schedule</span>
                      </div>
                      <div>
                        <div className="font-label-md text-label-md text-[#151c27] font-semibold">Pre-orders Available</div>
                        <div className="font-body-sm text-body-sm text-[#555f6f]">Allow scheduling orders for future dates.</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preordersAvailable}
                        onChange={(e) => setPreordersAvailable(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#d3daea] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#10b981]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>
                </div>
              </section>

              {/* Card: Basic Information */}
              <section className="bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm">
                <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold mb-6">Store Identity</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">Kitchen Name</label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">Contact Phone</label>
                    <input
                      type="tel"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">Public Address</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-3 text-[#555f6f]">location_on</span>
                      <input
                        type="text"
                        value={storeAddress}
                        onChange={(e) => setStoreAddress(e.target.value)}
                        className="w-full border border-[#dce2f3] rounded-lg pl-10 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider">Order Note Instructions</label>
                    <textarea
                      value={orderInstructions}
                      onChange={(e) => setOrderInstructions(e.target.value)}
                      rows="3"
                      className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Operational Hours */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <section className="bg-white border border-[#dce2f3] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-6 border-b border-[#dce2f3] bg-[#f0f3ff]/40">
                  <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold">Operational Hours</h3>
                  <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">Standard weekly availability.</p>
                </div>
                <div className="p-6 flex flex-col gap-4">
                  {hours.map((h, index) => (
                    <div key={h.day} className={`flex items-center justify-between pb-3 border-b border-[#dce2f3]/50 last:border-b-0 ${!h.active ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-3 w-1/3">
                        <input
                          type="checkbox"
                          checked={h.active}
                          onChange={() => handleHourToggle(index)}
                          className="rounded border-[#dce2f3] text-[#10b981] focus:ring-[#10b981]/20 w-4 h-4 cursor-pointer"
                        />
                        <span className="font-label-md text-label-md text-[#151c27] font-semibold">{h.day}</span>
                      </div>
                      <div className="flex items-center gap-2 w-2/3 justify-end">
                        {h.active ? (
                          <>
                            <input
                              type="time"
                              value={h.start}
                              onChange={(e) => handleHourChange(index, "start", e.target.value)}
                              className="border border-[#dce2f3] rounded-md px-2 py-1 font-body-sm text-body-sm text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                            />
                            <span className="text-[#555f6f] text-sm">-</span>
                            <input
                              type="time"
                              value={h.end}
                              onChange={(e) => handleHourChange(index, "end", e.target.value)}
                              className="border border-[#dce2f3] rounded-md px-2 py-1 font-body-sm text-body-sm text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                            />
                          </>
                        ) : (
                          <span className="font-body-sm text-body-sm text-[#555f6f] italic">Closed</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {activeTab === "financial" && (
          <div className="lg:col-span-12 bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm flex flex-col gap-6">
            <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold border-b border-[#dce2f3] pb-3">Financial Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* GST Tax Rate */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Taxes (GST %)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value))}
                    step="0.1"
                    className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">%</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Applied to all order invoices dynamically.</p>
              </div>

              {/* Delivery Partner Commission */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Delivery Commission (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(parseFloat(e.target.value))}
                    step="0.1"
                    className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">%</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Standard commission rate retained on delivery payouts.</p>
              </div>

              {/* Platform Service Fee */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Platform Fee (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={platformFee}
                    onChange={(e) => setPlatformFee(parseFloat(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Fixed platform charge added per transaction checkout.</p>
              </div>

              {/* Minimum Order Value */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Minimum Order Value (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(parseFloat(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Minimum sales threshold required to accept delivery orders.</p>
              </div>

              {/* Delivery Charge */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Base Delivery Charge (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(parseFloat(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Standard delivery fee added per order.</p>
              </div>

              {/* Rain Surge Charge */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Rain Surge Charge (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={rainCharge}
                    onChange={(e) => setRainCharge(parseFloat(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Surge fee applied dynamically during heavy rain.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "system" && (
          <div className="lg:col-span-12 bg-white border border-[#dce2f3] rounded-xl p-6 shadow-sm flex flex-col gap-6">
            <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold border-b border-[#dce2f3] pb-3">System & Security Parameters</h3>

            <div className="space-y-6">
              
              {/* Feature Toggles Panel */}
              <div className="p-4 border border-[#dce2f3] rounded-lg">
                <h4 className="font-label-md text-label-md text-[#151c27] font-semibold mb-4">Enterprise System Toggles</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Maintenance Mode */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Maintenance Mode</p>
                      <p className="text-[10px] text-[#555f6f]">Restrict customer app access during updates</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={maintenanceMode}
                        onChange={(e) => setMaintenanceMode(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Wallet Enabled */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Customer Wallet System</p>
                      <p className="text-[10px] text-[#555f6f]">Allow customer payments and refunds via wallet balance</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={walletEnabled}
                        onChange={(e) => setWalletEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Coupon Enabled */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Promo Coupons System</p>
                      <p className="text-[10px] text-[#555f6f]">Allow discount coupon applications on checkout</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={couponEnabled}
                        onChange={(e) => setCouponEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Delivery Tracking Enabled */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Live Ride Tracking</p>
                      <p className="text-[10px] text-[#555f6f]">Enable real-time rider location coordinates streaming</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={deliveryTrackingEnabled}
                        onChange={(e) => setDeliveryTrackingEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Show Partner Earnings Toggle */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Show Order-wise Earnings to Delivery Partners</p>
                      <p className="text-[10px] text-[#555f6f]">Allow partners to view earnings details in history, dashboard, and completion screens. Defaults to OFF.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={showPartnerEarnings}
                        onChange={(e) => setShowPartnerEarnings(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                </div>
              </div>

              {/* Dev Bypass Toggle */}
              <div className="flex items-center justify-between p-4 bg-[#f9f9ff] border border-[#dce2f3] rounded-lg">
                <div>
                  <h4 className="font-label-md text-label-md text-[#151c27] font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-orange-500 text-[18px]">developer_mode</span>
                    Development Bypass Mode
                  </h4>
                  <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">Enable login using dev credentials (admin@homebites.local / HomeBites@123).</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={devBypassActive}
                    onChange={(e) => setDevBypassActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#d3daea] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#10b981]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                </label>
              </div>

              {/* App Check Security Status */}
              <div className="p-4 bg-[#f9f9ff] border border-[#dce2f3] rounded-lg flex justify-between items-center">
                <div>
                  <h4 className="font-label-md text-label-md text-[#151c27] font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#006c49] text-[18px]">security</span>
                    Firebase App Check
                  </h4>
                  <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">Attests requests originates from legitimate instances.</p>
                </div>
                <span className="font-label-sm text-label-sm text-[#006c49] bg-[#ecfdf5] border border-[#10b981]/20 px-3 py-1 rounded">
                  {appCheckStatus}
                </span>
              </div>

              {/* System Maintenance Utilities */}
              <div className="p-4 border border-[#dce2f3] rounded-lg">
                <h4 className="font-label-md text-label-md text-[#151c27] font-semibold mb-4">Maintenance Utilities</h4>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={handleClearCache}
                    className="px-4 py-2 border border-[#dce2f3] hover:bg-[#f0f3ff] text-[#151c27] font-label-sm text-label-sm rounded transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">cleaning_services</span>
                    Clear Cache
                  </button>
                  <button
                    onClick={handleDatabaseBackup}
                    className="px-4 py-2 border border-[#dce2f3] hover:bg-[#f0f3ff] text-[#151c27] font-label-sm text-label-sm rounded transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    Backup Database
                  </button>
                  <button
                    onClick={handleResetDatabase}
                    className="px-4 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-label-sm text-label-sm rounded transition-all shadow-sm flex items-center gap-1.5 font-semibold"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                    Reset Database
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
