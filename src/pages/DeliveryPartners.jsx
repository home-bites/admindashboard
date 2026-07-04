import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useDeliveryPartnerStore } from "../store/deliveryPartnerStore";
import { uploadFile } from "../firebase/storage";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";
import { OrderService } from "../services";

export const DeliveryPartners = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { deliveryPartners, loading, fetchDeliveryPartners, addDeliveryPartner, updateDeliveryPartner, deleteDeliveryPartner } = useDeliveryPartnerStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editPartnerId, setEditPartnerId] = useState(null);

  // Form Fields
  const [partnerName, setPartnerName] = useState("");
  const [partnerMobile, setPartnerMobile] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [partnerAvatar, setPartnerAvatar] = useState("");
  const [currentStatus, setCurrentStatus] = useState("Offline");
  const [rating, setRating] = useState(5.0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [currentLatitude, setCurrentLatitude] = useState(12.9716); 
  const [currentLongitude, setCurrentLongitude] = useState(77.5946); 
  const [uploading, setUploading] = useState(false);

  // Assign Order Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const fetchAvailableOrders = async () => {
    setLoadingOrders(true);
    try {
      const allOrders = await OrderService.getOrders();
      const unassigned = allOrders.filter(o => 
        (o.status === "Preparing" || o.status === "Ready" || o.status === "Placed" || o.status === "Pending") && 
        (!o.assignedPartnerId && !o.deliveryPartnerId)
      );
      setAvailableOrders(unassigned);
    } catch (err) {
      addToast(`Error fetching unassigned orders: ${err.message}`, "error");
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOpenAssignModal = () => {
    setIsAssignModalOpen(true);
    fetchAvailableOrders();
  };

  const handleAssignOrder = async (orderId) => {
    if (!activePartner) return;
    try {
      await OrderService.assignDeliveryPartner(orderId, activePartner.id, activePartner.name, user);
      addToast(`Order assigned to ${activePartner.name} successfully`, "success");
      setIsAssignModalOpen(false);
      fetchDeliveryPartners();
    } catch (err) {
      addToast(`Assignment failed: ${err.message}`, "error");
    }
  };

  useEffect(() => {
    fetchDeliveryPartners();
  }, [fetchDeliveryPartners]);

  useEffect(() => {
    if (deliveryPartners.length > 0 && !selectedPartnerId) {
      setSelectedPartnerId(deliveryPartners[0].id);
    }
  }, [deliveryPartners, selectedPartnerId]);

  const activePartner = deliveryPartners.find((p) => p.id === selectedPartnerId) || deliveryPartners[0];

  const filteredPartners = deliveryPartners.filter((p) =>
    (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.mobile || p.phone || "").includes(searchQuery)
  );

  const handleApprove = async (partner) => {
    if (window.confirm(`Are you sure you want to approve ${partner.name}?`)) {
      try {
        await updateDeliveryPartner(partner.id, {
          status: "Approved",
          isVerified: true,
          approved: true,
          documentsApproved: true,
          approvedAt: new Date().toISOString(),
          approvedBy: user?.uid || "admin",
          rejectionReason: "",
        }, user);
        addToast(`${partner.name} approved successfully`, "success");
      } catch (err) {
        addToast(`Error approving partner: ${err.message}`, "error");
      }
    }
  };

  const handleReject = async (partner) => {
    const reason = window.prompt(`Enter rejection reason for ${partner.name}:`);
    if (reason === null) return;
    if (!reason.trim()) {
      addToast("Rejection reason is required", "error");
      return;
    }
    try {
      await updateDeliveryPartner(partner.id, {
        status: "Rejected",
        isVerified: false,
        approved: false,
        documentsApproved: false,
        rejectionReason: reason.trim(),
      }, user);
      addToast(`${partner.name} verification rejected`, "warning");
    } catch (err) {
      addToast(`Error rejecting partner: ${err.message}`, "error");
    }
  };

  const handleSuspend = async (partner) => {
    const reason = window.prompt(`Enter suspension reason for ${partner.name}:`);
    if (reason === null) return;
    if (!reason.trim()) {
      addToast("Suspension reason is required", "error");
      return;
    }
    try {
      await updateDeliveryPartner(partner.id, {
        status: "Suspended",
        isSuspended: true,
        suspensionReason: reason.trim(),
      }, user);
      addToast(`${partner.name} suspended`, "error");
    } catch (err) {
      addToast(`Error suspending partner: ${err.message}`, "error");
    }
  };

  const handleRestore = async (partner) => {
    if (window.confirm(`Are you sure you want to restore ${partner.name}?`)) {
      try {
        await updateDeliveryPartner(partner.id, {
          status: "Approved",
          isSuspended: false,
          approved: true,
          documentsApproved: true,
          suspensionReason: "",
        }, user);
        addToast(`${partner.name} access restored`, "success");
      } catch (err) {
        addToast(`Error restoring partner: ${err.message}`, "error");
      }
    }
  };

  const handleOpenAddModal = () => {
    setEditPartnerId(null);
    setPartnerName("");
    setPartnerMobile("");
    setVehicleNumber("");
    setPartnerAvatar("");
    setCurrentStatus("Offline");
    setRating(5.0);
    setTotalDeliveries(0);
    setIsOnline(false);
    setCurrentLatitude(12.9716);
    setCurrentLongitude(77.5946);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (partner) => {
    setEditPartnerId(partner.id);
    setPartnerName(partner.name || "");
    setPartnerMobile(partner.mobile || partner.phone || "");
    setVehicleNumber(partner.vehicleNumber || "");
    setPartnerAvatar(partner.avatar || "");
    setCurrentStatus(partner.currentStatus || "Offline");
    setRating(partner.rating || 5.0);
    setTotalDeliveries(partner.totalDeliveries || partner.totalOrders || 0);
    setIsOnline(partner.isOnline || false);
    setCurrentLatitude(partner.currentLatitude || 12.9716);
    setCurrentLongitude(partner.currentLongitude || 77.5946);
    setIsModalOpen(true);
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const avatarUrl = await uploadFile(file, `avatars/${Date.now()}_${file.name}`);
      setPartnerAvatar(avatarUrl);
      addToast("Partner avatar uploaded successfully", "success");
    } catch (err) {
      console.error("Upload error:", err);
      addToast("Failed to upload partner avatar", "error");
    } finally {
      setUploading(false);
    }
  };

  const validateIndianMobile = (phone) => {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length !== 10) return false;
    if (!/^[6-9]\d{9}$/.test(cleaned)) return false;
    if (/^(\d)\1{9}$/.test(cleaned)) return false;
    const increasingSeq = "01234567890123456789";
    if (increasingSeq.includes(cleaned)) return false;
    const decreasingSeq = "98765432109876543210";
    if (decreasingSeq.includes(cleaned)) return false;
    if (/^(\d{2})\1{4}$/.test(cleaned)) return false;
    return true;
  };

  const handleSavePartner = async (e) => {
    e.preventDefault();
    if (!partnerName.trim() || !partnerMobile.trim() || !vehicleNumber.trim()) {
      addToast("Please fill in all required fields", "error");
      return;
    }

    if (!validateIndianMobile(partnerMobile.trim())) {
      addToast("Invalid mobile number. Repeated or sequential numbers are not allowed.", "error");
      return;
    }

    const payload = {
      name: partnerName,
      mobile: partnerMobile,
      phone: partnerMobile, 
      vehicleNumber,
      avatar: partnerAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
      currentStatus,
      rating: Number(rating),
      totalDeliveries: Number(totalDeliveries),
      totalOrders: Number(totalDeliveries),
      isOnline,
      currentLatitude: Number(currentLatitude),
      currentLongitude: Number(currentLongitude),
      lastActiveAt: new Date().toISOString()
    };

    try {
      if (editPartnerId) {
        await updateDeliveryPartner(editPartnerId, payload, user);
        addToast("Delivery Partner updated successfully", "success");
      } else {
        await addDeliveryPartner(payload, user);
        addToast("New Delivery Partner registered successfully", "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      addToast(`Error saving partner: ${err.message}`, "error");
    }
  };

  const handleDeletePartner = async (id, name) => {
    if (confirm(`Are you sure you want to delete delivery partner "${name}"?`)) {
      try {
        await deleteDeliveryPartner(id, user);
        addToast(`Partner "${name}" deleted (Soft Delete)`, "success");
        setSelectedPartnerId(null);
      } catch (err) {
        addToast(`Error deleting partner: ${err.message}`, "error");
      }
    }
  };

  if (loading && deliveryPartners.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  return (
    <div className="p-8 h-[calc(100vh-4rem)] flex gap-6 overflow-hidden bg-[#f4f6f9]">
      {/* Left Panel: Master Directory */}
      <section className="flex-grow flex flex-col bg-white border border-slate-200/80 rounded-xl shadow-3xs overflow-hidden relative">
        {/* Section Header */}
        <div className="px-6 py-5 border-b border-slate-150 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50">
          <div>
            <h2 className="font-bold text-lg text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
              Rider Operations Center
            </h2>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              Active fleet monitoring, credentials approval, and telemetry logs.
            </p>
          </div>
          <div className="flex gap-2.5 items-center">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 bg-white border border-slate-250 rounded-lg text-xs font-semibold text-slate-700 w-44 focus:outline-none focus:border-[#10b981] transition-all"
                placeholder="Search riders..."
                type="text"
              />
            </div>
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 rounded-lg bg-[#10b981] text-white font-bold text-xs shadow-xs hover:bg-[#059669] transition-colors flex items-center gap-1.5 inner-shine"
            >
              <span className="material-symbols-outlined text-[15px]">person_add</span> Register Rider
            </button>
          </div>
        </div>

        {/* List Header */}
        <div className="grid grid-cols-[minmax(180px,1fr)_120px_100px_130px_60px] gap-4 px-6 py-3 bg-slate-100/50 border-b border-slate-150 font-bold text-[10px] text-slate-450 uppercase tracking-wider">
          <div>Rider Profile</div>
          <div>Duty Status</div>
          <div>Rating</div>
          <div>Primary Contact</div>
          <div className="text-right">View</div>
        </div>

        {/* List Body */}
        <div className="flex-grow overflow-y-auto divide-y divide-slate-100">
          {filteredPartners.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon="local_shipping"
                title="No Partners Found"
                description="Try registering a new delivery partner."
                actionText="Add Partner"
                onActionClick={handleOpenAddModal}
              />
            </div>
          ) : (
            filteredPartners.map((partner) => (
              <div
                key={partner.id}
                onClick={() => setSelectedPartnerId(partner.id)}
                className={`grid grid-cols-[minmax(180px,1fr)_120px_100px_130px_60px] gap-4 px-6 py-4 items-center cursor-pointer transition-all group ${
                  selectedPartnerId === partner.id
                    ? "bg-[#10b981]/5 border-l-4 border-[#10b981]"
                    : "hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border border-slate-200 overflow-hidden shrink-0 shadow-3xs bg-slate-50">
                    <img className="w-full h-full object-cover" src={partner.avatar} alt={partner.name} />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-xs text-slate-750 group-hover:text-[#10b981] transition-colors truncate">
                      {partner.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold tracking-wide mt-0.5 truncate uppercase">ID: {partner.id.substring(0, 10)}</p>
                  </div>
                </div>
                <div>
                  {(() => {
                    const getStatusStyle = (p) => {
                      if (p.currentStatus === "On Delivery" || p.currentStatus === "On Duty") {
                        return {
                          label: "Delivering",
                          badge: "bg-amber-50 text-amber-700 border-amber-200",
                          dot: "bg-amber-500"
                        };
                      }
                      if (p.currentStatus === "Available") {
                        return {
                          label: "Available",
                          badge: "bg-green-50 text-green-700 border-green-200",
                          dot: "bg-green-500"
                        };
                      }
                      if (p.isOnline) {
                        return {
                          label: "Idle",
                          badge: "bg-yellow-50 text-yellow-700 border-yellow-200",
                          dot: "bg-yellow-500"
                        };
                      }
                      return {
                        label: "Offline",
                        badge: "bg-slate-100 text-slate-500 border-slate-200",
                        dot: "bg-slate-400"
                      };
                    };
                    const status = getStatusStyle(partner);
                    return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[9px] border uppercase tracking-wider ${status.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                        {status.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1 font-bold text-xs text-slate-700">
                  <span className="material-symbols-outlined text-[16px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  {(partner.rating || 5.0).toFixed(1)}
                </div>
                <div>
                  <p className="font-semibold text-xs text-slate-655 font-mono">{partner.mobile || partner.phone}</p>
                </div>
                <div className="text-right">
                  <button className="text-slate-400 group-hover:text-[#10b981] transition-colors p-1.5 rounded-full hover:bg-slate-50">
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Right Panel: Detail View */}
      <section className="w-[420px] flex flex-col gap-5 overflow-y-auto pr-1 pb-4 shrink-0">
        {activePartner ? (
          <>
            {/* Profile Inspector Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-3xs relative overflow-hidden flex flex-col items-center text-center">
              <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-[#10b981]/8 to-transparent"></div>
              
              {/* Quick Actions */}
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <button
                  onClick={() => handleOpenEditModal(activePartner)}
                  className="p-2 rounded-full bg-white/95 hover:bg-white text-slate-400 hover:text-[#10b981] shadow-3xs transition-colors border border-slate-200"
                  title="Configure Details"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button
                  onClick={() => handleDeletePartner(activePartner.id, activePartner.name)}
                  className="p-2 rounded-full bg-white/95 hover:bg-white text-rose-500 hover:text-rose-700 shadow-3xs transition-colors border border-slate-200"
                  title="Remove Account"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>

              <div className="w-20 h-20 rounded-full border-4 border-white shadow-2xs z-10 overflow-hidden mb-3 bg-slate-50">
                <img className="w-full h-full object-cover" src={activePartner.avatar} alt={activePartner.name} />
              </div>
              <h3 className="font-bold text-base text-slate-800 tracking-tight z-10" style={{ fontFamily: "Outfit, sans-serif" }}>
                {activePartner.name}
              </h3>
              <p className="text-[10px] text-slate-450 font-semibold mb-4 z-10 font-mono">
                PLATE: {activePartner.vehicleNumber || "N/A"} • ID: {activePartner.id}
              </p>
              
              <div className="flex gap-2 z-10 w-full">
                <button
                  onClick={() => addToast(`Chat message initialized for ${activePartner.name}`, "info")}
                  className="flex-grow py-2 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 transition-colors flex justify-center items-center gap-1.5 shadow-3xs text-xs font-bold"
                >
                  <span className="material-symbols-outlined text-[16px]">chat_bubble</span> Message
                </button>
                <a
                  href={`tel:${activePartner.mobile || activePartner.phone}`}
                  className="flex-grow py-2 border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 transition-colors flex justify-center items-center gap-1.5 shadow-3xs text-xs font-bold"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span> Call Rider
                </a>
              </div>
            </div>

            {/* Verification Status Banner */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Credential Status</h4>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                  activePartner.status === "Approved"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : activePartner.status === "Rejected"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : activePartner.status === "Suspended"
                    ? "bg-slate-100 text-slate-700 border-slate-300"
                    : "bg-orange-50 text-orange-700 border-orange-200"
                }`}>
                  {activePartner.status || (activePartner.approved ? "Approved" : "Pending Verification")}
                </span>
              </div>

              {activePartner.status === "Rejected" && activePartner.rejectionReason && (
                <div className="p-3 bg-rose-50 border border-rose-150 rounded-lg text-[10px] text-rose-700 font-semibold">
                  <strong>Rejection Reason:</strong> {activePartner.rejectionReason}
                </div>
              )}

              {activePartner.status === "Suspended" && activePartner.suspensionReason && (
                <div className="p-3 bg-slate-50 border border-slate-150 rounded-lg text-[10px] text-slate-655 font-semibold">
                  <strong>Suspension Reason:</strong> {activePartner.suspensionReason}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 mt-1">
                {activePartner.status !== "Approved" && (
                  <button
                    onClick={() => handleApprove(activePartner)}
                    className="flex-grow px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold rounded-lg shadow-3xs transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">verified</span> Approve Access
                  </button>
                )}
                {activePartner.status === "Pending Verification" && (
                  <button
                    onClick={() => handleReject(activePartner)}
                    className="flex-grow px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg shadow-3xs transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">cancel</span> Reject Request
                  </button>
                )}
                {activePartner.status === "Approved" && (
                  <button
                    onClick={() => handleSuspend(activePartner)}
                    className="flex-grow px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-[11px] font-bold rounded-lg shadow-3xs transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">block</span> Suspend Rider
                  </button>
                )}
                {activePartner.status === "Suspended" && (
                  <button
                    onClick={() => handleRestore(activePartner)}
                    className="flex-grow px-3 py-2 bg-[#10b981] hover:bg-[#059669] text-white text-[11px] font-bold rounded-lg shadow-3xs transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">settings_backup_restore</span> Restore Access
                  </button>
                )}
              </div>
            </div>

            {/* Rider Verification Documents */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs flex flex-col gap-3">
              <h4 className="font-bold text-xs text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                Verification Documents
              </h4>
              
              <div className="grid grid-cols-2 gap-3 text-[11px] border-b pb-3 border-slate-100">
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[9px] tracking-wider">Vehicle Type</span>
                  <strong className="text-slate-700 font-bold">{activePartner.vehicleType || "Motorcycle"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[9px] tracking-wider">Plate Number</span>
                  <strong className="text-slate-700 font-bold">{activePartner.vehicleNumber || "N/A"}</strong>
                </div>
              </div>

              {activePartner.documents && Object.keys(activePartner.documents).length > 0 ? (
                <div className="flex flex-col gap-2">
                  {Object.entries(activePartner.documents).map(([key, value]) => {
                    const label = key.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                    return (
                      <div key={key} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded-lg text-[11px]">
                        <span className="font-bold text-slate-500 uppercase text-[9px] tracking-wider">{label}</span>
                        {value && value.toString().startsWith("http") ? (
                          <a
                            href={value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-[#10b981] hover:bg-[#059669] text-white rounded-md text-[10px] font-bold transition-all flex items-center gap-0.5 shadow-3xs"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span> View Doc
                          </a>
                        ) : (
                          <span className="text-slate-350 font-bold">Not Uploaded</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-2">No credentials documents uploaded.</p>
              )}
            </div>

            {/* Bank Settlements details */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-3xs flex flex-col gap-3">
              <h4 className="font-bold text-xs text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                Settlement Details
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-700">
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[9px] tracking-wider">Bank Name</span>
                  <strong className="text-slate-700 block mt-0.5">{activePartner.bankName || "SBI Bank"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[9px] tracking-wider">Acc Number</span>
                  <strong className="text-slate-700 block mt-0.5">{activePartner.accountNumber || "*********1243"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[9px] tracking-wider">IFSC Code</span>
                  <strong className="text-slate-700 block mt-0.5">{activePartner.ifscCode || "SBIN0001004"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[9px] tracking-wider">UPI Address</span>
                  <strong className="text-[#10b981] block mt-0.5 truncate">{activePartner.upiId || "rider@upi"}</strong>
                </div>
              </div>
            </div>

            {/* Performance Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Shift State</span>
                  <span className="material-symbols-outlined text-[#10b981] text-[18px]">sensors</span>
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-750">
                    {(() => {
                      if (activePartner.currentStatus === "On Delivery") return "Delivering";
                      if (activePartner.currentStatus === "Available") return "Available";
                      if (activePartner.isOnline) return "Idle";
                      return "Offline";
                    })()}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                    Duty status
                  </p>
                </div>
              </div>
              
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Orders</span>
                  <span className="material-symbols-outlined text-[#10b981] text-[18px]">local_shipping</span>
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-750">
                    {activePartner.totalDeliveries || activePartner.totalOrders || 0}
                  </p>
                  <p className="text-[10px] text-green-700 font-bold uppercase mt-1 flex items-center gap-0.5">
                    Rating: {(activePartner.rating || 5.0).toFixed(1)} ★
                  </p>
                </div>
              </div>
            </div>

            {/* Live Map Telemetry Grid */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs flex flex-col gap-2 h-44 relative overflow-hidden">
              <div className="absolute inset-0 bg-slate-100 flex items-center justify-center z-0">
                <img 
                  className="w-full h-full object-cover grayscale opacity-20" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBnhNtXR_UWsu5gAmuz5LFW0--sYYWJCA0w6vsaq1Wtd5uBYyKdRQGIQBYg6PePKQ7z7TEozKlO0EI2ep78Um-YBSmU5UuBFEeqaoaIsXpVEvnFiMphKUc5jODtC7BwXoPxbpJUwLHySvdCeMIEOosKZcgR52zHxz-o_Q_DB9hquBU6_WtKINPbOG-Wjs_Z2uQhtyKyWqqc-qr_uZLC9cjMpfh9hplH9Bh2Zy1_BgoUuiu7kFErAKrnXKVJNb7D0hxhYxNlwSWBvc4"
                  alt="Telemetry Grid" 
                />
              </div>
              {activePartner.assignedOrderId || activePartner.activeDelivery ? (
                <>
                  <div className="relative z-10 flex justify-between items-center mb-auto">
                    <p className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
                      Transit Order Delivery
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-[#10b981] shadow-3xs uppercase tracking-wider">
                      {activePartner.assignedOrderId || (activePartner.activeDelivery && activePartner.activeDelivery.orderId) || "ORD-001"}
                    </span>
                  </div>
                  <div className="relative z-10 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg p-2.5 mt-auto">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Telemetry Coordinates:
                    </p>
                    <p className="text-[10px] text-slate-700 font-semibold font-mono mt-0.5">
                      Lat: {activePartner.currentLatitude || 12.9716}, Lon: {activePartner.currentLongitude || 77.5946}
                    </p>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-10 bg-white/60 backdrop-blur-xs">
                  <span className="material-symbols-outlined text-slate-400 text-2xl mb-1">map</span>
                  <p className="font-bold text-xs text-slate-700">No Active Shipment Assignment</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5 mb-2">
                    Coordinates: {activePartner.currentLatitude || 12.9716}, {activePartner.currentLongitude || 77.5946}
                  </p>
                  {activePartner.status === "Approved" && (
                    <button
                      onClick={handleOpenAssignModal}
                      className="px-3.5 py-1.5 bg-[#10b981] hover:bg-[#059669] text-white text-[10px] font-bold rounded-lg shadow-3xs transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[13px]">assignment_ind</span> Dispatch Order
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Rider audit timeline */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-3xs flex flex-col flex-1 min-h-[220px]">
              <div className="px-4 py-3 border-b border-slate-150 bg-slate-55 rounded-t-xl flex justify-between items-center shrink-0">
                <h4 className="font-bold text-xs text-slate-750">Rider Shift Log</h4>
                <span className="text-[10px] text-slate-400 font-bold">
                  Last Sync: {activePartner.lastActiveAt ? new Date(activePartner.lastActiveAt).toLocaleTimeString() : "N/A"}
                </span>
              </div>
              <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                {activePartner.history && activePartner.history.length > 0 ? (
                  activePartner.history.map((item, idx) => (
                    <div key={idx} className="flex gap-3 items-start pb-3 border-b border-slate-50 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-[#10b981]/10 flex items-center justify-center shrink-0 border border-[#10b981]/25 text-[#10b981]">
                        <span className="material-symbols-outlined text-[14px]">
                          {item.title.includes("Shift") ? "storefront" : "check_circle"}
                        </span>
                      </div>
                      <div className="flex-grow">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-xs text-slate-750">{item.title}</p>
                          <p className="text-[9px] text-slate-400 font-semibold">{item.time}</p>
                        </div>
                        <p className="text-[10px] text-slate-450 font-medium mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-450 italic text-[11px] font-semibold">
                    No active shift logs reported today.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 italic text-xs font-semibold">
            Select a delivery partner to inspect details.
          </div>
        )}
      </section>

      {/* Add / Edit Delivery Partner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-slate-200 w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                {editPartnerId ? "Edit Partner Details" : "Register New Delivery Partner"}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSavePartner} className="flex flex-col flex-grow overflow-y-auto">
              <div className="p-6 space-y-4 flex-grow">
                
                {/* Avatar upload */}
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Profile Avatar Image
                  </label>
                  <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      disabled={uploading}
                    />
                    {uploading ? (
                      <p className="font-bold text-xs text-[#10b981]">Uploading image...</p>
                    ) : partnerAvatar ? (
                      <div className="relative w-16 h-16 rounded-full overflow-hidden border border-slate-250 shadow-3xs">
                        <img src={partnerAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-white text-[10px] font-bold">Change</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-450">
                        <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                        <span className="font-bold text-xs text-slate-700">Upload profile image</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                    Partner Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                    placeholder="e.g. Marcus Johnson"
                    required
                    type="text"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={partnerMobile}
                      onChange={(e) => setPartnerMobile(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="e.g. 9876500123"
                      required
                      type="text"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Vehicle Plate <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      placeholder="e.g. KA-01-EF-1234"
                      required
                      type="text"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Fleet Status
                    </label>
                    <select
                      value={currentStatus}
                      onChange={(e) => setCurrentStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                    >
                      <option value="Available">Available</option>
                      <option value="Offline">Offline</option>
                      <option value="On Break">On Break</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Rating (Stars)
                    </label>
                    <input
                      value={rating}
                      onChange={(e) => setRating(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Total Deliveries Completed
                    </label>
                    <input
                      value={totalDeliveries}
                      onChange={(e) => setTotalDeliveries(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      type="number"
                      min="0"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-5">
                    <div>
                      <p className="font-bold text-xs text-slate-700">App Active Status</p>
                      <p className="text-[10px] text-slate-400 font-semibold">Toggle active online state</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        checked={isOnline}
                        onChange={(e) => setIsOnline(e.target.checked)}
                        className="sr-only peer"
                        type="checkbox"
                      />
                      <div className="w-11 h-6 bg-slate-250 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-150 pt-4">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Current Latitude
                    </label>
                    <input
                      value={currentLatitude}
                      onChange={(e) => setCurrentLatitude(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      type="number"
                      step="0.000001"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-1.5">
                      Current Longitude
                    </label>
                    <input
                      value={currentLongitude}
                      onChange={(e) => setCurrentLongitude(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d3daea] rounded-lg focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 font-semibold text-xs text-slate-700 transition-all"
                      type="number"
                      step="0.000001"
                    />
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 font-bold text-xs hover:bg-slate-100 transition-colors shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#10b981] text-white font-bold text-xs hover:bg-[#059669] transition-colors shadow-xs border-t border-white/20 inner-shine"
                >
                  Save Partner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Order Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsAssignModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-slate-200 w-full max-w-lg relative z-10 flex flex-col max-h-[80vh] overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                Assign Order to {activePartner?.name}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-655 p-1 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setIsAssignModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-6 space-y-4">
              {loadingOrders ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10b981]"></div>
                  <p className="text-xs text-slate-400 mt-2">Loading unassigned orders...</p>
                </div>
              ) : availableOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">inbox</span>
                  <p className="font-bold text-sm">No Unassigned Orders Available</p>
                  <p className="text-xs text-slate-450 mt-1">
                    All currently preparing or ready orders are already assigned to delivery partners.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-550 mb-4">
                    Select an active unassigned order to dispatch to {activePartner?.name}:
                  </p>
                  {availableOrders.map((order) => (
                    <div 
                      key={order.id} 
                      className="border border-slate-200 rounded-xl p-4 hover:bg-[#10b981]/5 transition-colors flex justify-between items-center gap-4 text-xs font-semibold text-slate-600"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <strong className="text-slate-850 text-sm">Order #{order.orderId || order.id}</strong>
                          <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[9px] font-bold">
                            {order.status}
                          </span>
                        </div>
                        <p className="text-slate-450">
                          Customer: {order.customerName || (order.customer && order.customer.name) || "Customer"}
                        </p>
                        <p className="text-slate-400 truncate font-mono text-[10px]">
                          Address: {order.deliveryAddress?.addressLine || order.address || "Address"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAssignOrder(order.id)}
                        className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-lg shadow-3xs transition-colors shrink-0"
                      >
                        Assign
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-550 font-bold text-xs hover:bg-slate-100 transition-colors shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryPartners;
