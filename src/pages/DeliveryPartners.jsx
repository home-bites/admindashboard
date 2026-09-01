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
  const {
    deliveryPartners,
    loading,
    fetchDeliveryPartners,
    subscribeDeliveryPartners,
    disconnectDeliveryPartners,
    addDeliveryPartner,
    updateDeliveryPartner,
    deleteDeliveryPartner,
  } = useDeliveryPartnerStore();

  // Tab & Filters State
  const [activeTab, setActiveTab] = useState("All Riders");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterVehicleType, setFilterVehicleType] = useState("All");
  const [filterCity, setFilterCity] = useState("All");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editPartnerId, setEditPartnerId] = useState(null);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);

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

  // Extra Details Form Fields
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerDob, setPartnerDob] = useState("");
  const [partnerAddress, setPartnerAddress] = useState("");
  const [partnerBloodGroup, setPartnerBloodGroup] = useState("");
  const [partnerEmergencyContact, setPartnerEmergencyContact] = useState("");
  const [partnerVehicleType, setPartnerVehicleType] = useState("Scooter");
  const [partnerCity, setPartnerCity] = useState("Guntur");
  const [rcNumber, setRcNumber] = useState("");
  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  
  // Bank details form fields
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [upiId, setUpiId] = useState("");

  // Documents Upload Fields (Mock uploads URLs)
  const [docAadhaar, setDocAadhaar] = useState("");
  const [docLicense, setDocLicense] = useState("");
  // Per-document verdicts, mirrored locally so a decision shows immediately
  // rather than waiting for the Firestore listener to round-trip.
  const [docReviewStatuses, setDocReviewStatuses] = useState({});
  const [docPAN, setDocPAN] = useState("");
  const [docRC, setDocRC] = useState("");
  const [docInsurance, setDocInsurance] = useState("");

  // Assign Order Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const fetchAvailableOrders = async () => {
    setLoadingOrders(true);
    try {
      const allOrders = await OrderService.getOrders();
      const unassigned = allOrders.filter(
        (o) =>
          (o.status === "Preparing" ||
            o.status === "Ready" ||
            o.status === "Placed" ||
            o.status === "Pending") &&
          !o.assignedPartnerId &&
          !o.deliveryPartnerId
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
      await OrderService.assignDeliveryPartner(
        orderId,
        activePartner.id,
        activePartner.name,
        user
      );
      addToast(`Order assigned to ${activePartner.name} successfully`, "success");
      setIsAssignModalOpen(false);
      fetchDeliveryPartners();
    } catch (err) {
      addToast(`Assignment failed: ${err.message}`, "error");
    }
  };

  useEffect(() => {
    subscribeDeliveryPartners();
    return () => disconnectDeliveryPartners();
  }, [subscribeDeliveryPartners, disconnectDeliveryPartners]);

  // Reset pagination on filter or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, filterVehicleType, filterCity]);

  // Select the first partner matching tab-filtered partners if none selected
  const getTabFilteredPartners = () => {
    const term = searchQuery.toLowerCase();
    const queryFiltered = deliveryPartners.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(term) ||
        (p.id || "").toLowerCase().includes(term) ||
        (p.mobile || p.phone || "").includes(searchQuery) ||
        (p.vehicleNumber || "").toLowerCase().includes(term)
    );

    const advancedFiltered = queryFiltered.filter((p) => {
      if (filterVehicleType !== "All" && (p.vehicleType || "Scooter") !== filterVehicleType) {
        return false;
      }
      if (filterCity !== "All" && (p.city || "Guntur") !== filterCity) {
        return false;
      }
      return true;
    });

    return advancedFiltered.filter((p) => {
      if (activeTab === "Online") return p.isOnline;
      if (activeTab === "On Delivery")
        return p.currentStatus === "On Delivery" || p.currentStatus === "On Duty";
      if (activeTab === "Offline") return !p.isOnline && p.status !== "Suspended";
      if (activeTab === "Suspended") return p.status === "Suspended";
      if (activeTab === "Pending Verification") {
        return (
          p.status === "Pending Verification" ||
          (!p.approved && p.status !== "Approved")
        );
      }
      return true;
    });
  };

  const tabFilteredPartners = getTabFilteredPartners();

  useEffect(() => {
    if (tabFilteredPartners.length > 0) {
      // Keep selected partner selected if it's still in the tab list, otherwise select first
      const exists = tabFilteredPartners.some((p) => p.id === selectedPartnerId);
      if (!exists) {
        setSelectedPartnerId(tabFilteredPartners[0].id);
      }
    } else {
      setSelectedPartnerId(null);
    }
  }, [deliveryPartners, activeTab, searchQuery, filterVehicleType, filterCity]);

  const activePartner =
    deliveryPartners.find((p) => p.id === selectedPartnerId) ||
    tabFilteredPartners[0] ||
    null;

  // Pagination bounds
  const totalPages = Math.ceil(tabFilteredPartners.length / pageSize) || 1;
  const paginatedPartners = tabFilteredPartners.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleApprove = async (partner) => {
    if (window.confirm(`Are you sure you want to approve ${partner.name}?`)) {
      try {
        await updateDeliveryPartner(
          partner.id,
          {
            status: "Approved",
            isVerified: true,
            approved: true,
            documentsApproved: true,
            approvedAt: new Date().toISOString(),
            approvedBy: user?.uid || "admin",
            rejectionReason: "",
          },
          user
        );
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
      await updateDeliveryPartner(
        partner.id,
        {
          status: "Rejected",
          isVerified: false,
          approved: false,
          documentsApproved: false,
          rejectionReason: reason.trim(),
        },
        user
      );
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
      await updateDeliveryPartner(
        partner.id,
        {
          status: "Suspended",
          isSuspended: true,
          suspensionReason: reason.trim(),
        },
        user
      );
      addToast(`${partner.name} suspended`, "error");
    } catch (err) {
      addToast(`Error suspending partner: ${err.message}`, "error");
    }
  };

  const handleRestore = async (partner) => {
    if (window.confirm(`Are you sure you want to restore ${partner.name}?`)) {
      try {
        await updateDeliveryPartner(
          partner.id,
          {
            status: "Approved",
            isSuspended: false,
            approved: true,
            documentsApproved: true,
            suspensionReason: "",
          },
          user
        );
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
    
    // new fields reset
    setPartnerEmail("");
    setPartnerDob("");
    setPartnerAddress("");
    setPartnerBloodGroup("");
    setPartnerEmergencyContact("");
    setPartnerVehicleType("Scooter");
    setPartnerCity("Guntur");
    setRcNumber("");
    setInsuranceExpiry("");
    setLicenseExpiry("");
    setBankName("");
    setAccountNumber("");
    setIfscCode("");
    setUpiId("");
    
    setDocAadhaar("");
    setDocLicense("");
    setDocPAN("");
    setDocRC("");
    setDocInsurance("");
    
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
    
    // new fields loading
    setPartnerEmail(partner.email || "");
    setPartnerDob(partner.dob || "");
    setPartnerAddress(partner.address || "");
    setPartnerBloodGroup(partner.bloodGroup || "");
    setPartnerEmergencyContact(partner.emergencyContact || "");
    setPartnerVehicleType(partner.vehicleType || "Scooter");
    setPartnerCity(partner.city || "Guntur");
    setRcNumber(partner.rcNumber || "");
    setInsuranceExpiry(partner.insuranceExpiry || "");
    setLicenseExpiry(partner.licenseExpiry || "");
    
    // bank details loading
    setBankName(partner.bankName || "");
    setAccountNumber(partner.accountNumber || "");
    setIfscCode(partner.ifscCode || "");
    setUpiId(partner.upiId || "");
    
    // Documents.
    //
    // The delivery app writes the keys 'license' and 'rc'; this page previously
    // read only 'drivingLicense' and wrote it back the same way. The two sides
    // were therefore blind to each other: a licence uploaded by a partner never
    // appeared here, and one uploaded here never appeared in the app. The
    // partner's key is the canonical one — it is what the app, the partner
    // model and storage.rules all use — and the legacy name is kept as a read
    // fallback so records created under the old spelling still display.
    const docs = partner.documents || {};
    setDocAadhaar(docs.aadhaar || "");
    setDocLicense(docs.license || docs.drivingLicense || "");
    setDocPAN(docs.pan || docs.panCard || "");
    setDocRC(docs.rc || docs.vehicleRC || "");
    setDocInsurance(docs.insurance || "");

    setIsModalOpen(true);
  };

  /// Approves or rejects a single document.
  ///
  /// Verification was previously all-or-nothing at the partner level: an admin
  /// approved or rejected the whole application, so a partner with four good
  /// documents and one blurry Aadhaar had to be rejected outright and re-upload
  /// everything. Per-document status lets the partner replace just the one that
  /// failed — the app resets that document to 'Pending' on re-upload.
  const handleDocumentReview = async (keyName, title, decision) => {
    if (!activePartner) return;

    let reason = "";
    if (decision === "Rejected") {
      const entered = window.prompt(
        `Why is the ${title} being rejected? The partner sees this message.`
      );
      if (entered === null) return; // cancelled
      if (!entered.trim()) {
        addToast("A rejection reason is required", "error");
        return;
      }
      reason = entered.trim();
    }

    try {
      await updateDeliveryPartner(
        activePartner.id,
        {
          [`documentStatuses.${keyName}`]: decision,
          [`documentReview.${keyName}`]: {
            decision,
            reason,
            reviewedAt: new Date().toISOString(),
            reviewedBy: user?.email || user?.uid || "admin",
          },
        },
        user
      );

      setDocReviewStatuses((prev) => ({ ...prev, [keyName]: decision }));
      addToast(
        `${title} ${decision === "Approved" ? "approved" : "rejected"}`,
        decision === "Approved" ? "success" : "warning"
      );
    } catch (err) {
      addToast(`Could not update ${title}: ${err.message}`, "error");
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const avatarUrl = await uploadFile(
        file,
        `avatars/${Date.now()}_${file.name}`
      );
      setPartnerAvatar(avatarUrl);
      addToast("Partner avatar uploaded successfully", "success");
    } catch (err) {
      console.error("Upload error:", err);
      addToast("Failed to upload partner avatar", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentChange = async (e, docType) => {
    const file = e.target.files[0];
    if (!file) return;

    addToast(`Uploading ${docType}...`, "info");
    try {
      const url = await uploadFile(
        file,
        `documents/${docType}_${Date.now()}_${file.name}`
      );
      if (docType === "aadhaar") setDocAadhaar(url);
      if (docType === "license") setDocLicense(url);
      if (docType === "pan") setDocPAN(url);
      if (docType === "rc") setDocRC(url);
      if (docType === "insurance") setDocInsurance(url);
      addToast(`${docType} document uploaded successfully`, "success");
    } catch (err) {
      console.error("Doc upload error:", err);
      addToast(`Failed to upload ${docType}`, "error");
    }
  };

  const validateIndianMobile = (phone) => {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length !== 10) return false;
    if (!/^[6-9]\d{9}$/.test(cleaned)) return false;
    if (/^(\d)\1{9}$/.test(cleaned)) return false;
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
      // No stock-photo fallback. This wrote an Unsplash portrait of an
      // unrelated person into the rider's record, which then appeared as their
      // photo to customers and to dispatch — actively misleading on a screen
      // used to identify who is at the door. Empty means empty; the UI shows
      // initials instead.
      avatar: partnerAvatar || "",
      currentStatus,
      rating: Number(rating),
      totalDeliveries: Number(totalDeliveries),
      totalOrders: Number(totalDeliveries),
      isOnline,
      currentLatitude: Number(currentLatitude),
      currentLongitude: Number(currentLongitude),
      lastActiveAt: new Date().toISOString(),
      
      // new fields saving
      email: partnerEmail,
      dob: partnerDob,
      address: partnerAddress,
      bloodGroup: partnerBloodGroup,
      emergencyContact: partnerEmergencyContact,
      vehicleType: partnerVehicleType,
      city: partnerCity,
      rcNumber,
      insuranceExpiry,
      licenseExpiry,
      bankName,
      accountNumber,
      ifscCode,
      upiId,
      
      // nested documents object
      documents: {
        aadhaar: docAadhaar,
        // Canonical key, matching what the delivery app reads. Writing
        // 'drivingLicense' here meant the partner never saw the file.
        license: docLicense,
        pan: docPAN,
        rc: docRC,
        insurance: docInsurance,
      },
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

  // Metrics calculators
  const totalRiders = deliveryPartners.length;
  const onlineRiders = deliveryPartners.filter((p) => p.isOnline).length;
  const deliveringRiders = deliveryPartners.filter(
    (p) => p.currentStatus === "On Delivery" || p.currentStatus === "On Duty"
  ).length;
  const offlineRiders = deliveryPartners.filter(
    (p) => !p.isOnline && p.status !== "Suspended"
  ).length;

  if (loading && deliveryPartners.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  return (
    <div className="p-6 min-h-[calc(100vh-4rem)] flex flex-col gap-6 bg-[#f8fafc] overflow-y-auto font-sans">
      
      {/* Header Section */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 border border-slate-200 rounded-2xl shadow-xs">
        <div>
          <h1
            className="text-2xl font-bold text-slate-800 tracking-tight"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Rider Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manage and monitor all delivery partners, credentials, and active locations.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Live Search */}
          <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search riders by name, phone or ID..."
              className="w-full pl-4 pr-10 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white transition-all shadow-3xs"
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
          </div>

          {/* Advanced Filter Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 border rounded-xl flex items-center gap-2 text-xs font-bold transition-all shadow-3xs ${
                showFilters || filterVehicleType !== "All" || filterCity !== "All"
                  ? "bg-[#0D6B46]/10 border-[#0D6B46]/30 text-[#0D6B46]"
                  : "bg-white border-slate-250 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              Filters
              {(filterVehicleType !== "All" || filterCity !== "All") && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#0D6B46]"></span>
              )}
            </button>
            
            {/* Filter Dropdown Drawer */}
            {showFilters && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 z-50 flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-xs text-slate-800">Advanced Filters</h4>
                  <button
                    onClick={() => {
                      setFilterVehicleType("All");
                      setFilterCity("All");
                    }}
                    className="text-[10px] text-[#0D6B46] font-bold hover:underline"
                  >
                    Reset
                  </button>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                    Vehicle Type
                  </label>
                  <select
                    value={filterVehicleType}
                    onChange={(e) => setFilterVehicleType(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="All">All Vehicles</option>
                    <option value="Scooter">Scooter</option>
                    <option value="Bike">Bike</option>
                    <option value="E-Bike">E-Bike</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                    City
                  </label>
                  <select
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="All">All Cities</option>
                    <option value="Guntur">Guntur</option>
                    <option value="Vijayawada">Vijayawada</option>
                    <option value="Hyderabad">Hyderabad</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Add Rider Action */}
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-[#0D6B46] hover:bg-[#095235] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 border-t border-white/20 inner-shine"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add Rider
          </button>
        </div>
      </header>

      {/* Statistics Cards Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Riders */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center justify-between hover:shadow-2xs transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0D6B46]/10 flex items-center justify-center text-[#0D6B46]">
              <span className="material-symbols-outlined text-[24px]">groups</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Riders</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                {totalRiders}
              </h3>
              <p className="text-[10px] text-[#0D6B46] font-bold mt-0.5">+8 this week</p>
            </div>
          </div>
          <div className="opacity-80">
            <svg className="w-16 h-8 text-[#0D6B46]" viewBox="0 0 100 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,25 Q15,5 30,22 T60,8 T90,18 L100,5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 2: Online Now */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center justify-between hover:shadow-2xs transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <span className="material-symbols-outlined text-[24px]">sensors</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Online Now</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                {onlineRiders}
              </h3>
              <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                {totalRiders ? ((onlineRiders / totalRiders) * 100).toFixed(1) : 0}% of total
              </p>
            </div>
          </div>
          <div className="opacity-80">
            <svg className="w-16 h-8 text-blue-500" viewBox="0 0 100 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,28 Q20,10 40,24 T80,12 L100,5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 3: On Delivery */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center justify-between hover:shadow-2xs transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <span className="material-symbols-outlined text-[24px]">local_shipping</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">On Delivery</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                {deliveringRiders}
              </h3>
              <p className="text-[10px] text-purple-600 font-bold mt-0.5">
                {totalRiders ? ((deliveringRiders / totalRiders) * 100).toFixed(1) : 0}% of total
              </p>
            </div>
          </div>
          <div className="opacity-80">
            <svg className="w-16 h-8 text-purple-500" viewBox="0 0 100 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,20 Q15,25 30,12 T60,18 T90,5 L100,10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 4: Offline */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center justify-between hover:shadow-2xs transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <span className="material-symbols-outlined text-[24px]">sensors_off</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Offline</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                {offlineRiders}
              </h3>
              <p className="text-[10px] text-orange-600 font-bold mt-0.5">
                {totalRiders ? ((offlineRiders / totalRiders) * 100).toFixed(1) : 0}% of total
              </p>
            </div>
          </div>
          <div className="opacity-80">
            <svg className="w-16 h-8 text-orange-500" viewBox="0 0 100 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,10 Q25,25 50,8 T80,22 L100,15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* Main Split Cockpit layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_390px] gap-6 items-start">
        
        {/* Left Side: Directory Table & Tabs */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[600px]">
          
          {/* Status Tabs Row */}
          <div className="px-6 py-4 border-b border-slate-150 flex flex-wrap gap-2 items-center bg-slate-50/50">
            {["All Riders", "Online", "On Delivery", "Offline", "Suspended", "Pending Verification"].map((tab) => {
              const getCount = (tabName) => {
                if (tabName === "Online") return onlineRiders;
                if (tabName === "On Delivery") return deliveringRiders;
                if (tabName === "Offline") return offlineRiders;
                if (tabName === "Suspended") return deliveryPartners.filter(p => p.status === "Suspended").length;
                if (tabName === "Pending Verification") return deliveryPartners.filter(p => p.status === "Pending Verification" || (!p.approved && p.status !== "Approved")).length;
                return totalRiders;
              };
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    isActive
                      ? "bg-[#0D6B46]/10 text-[#0D6B46]"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {tab}
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive ? "bg-[#0D6B46] text-white" : "bg-slate-200 text-slate-600"
                  }`}>
                    {getCount(tab)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table Header */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Rider</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Rating</th>
                  <th className="px-6 py-3.5">Contact</th>
                  <th className="px-6 py-3.5">Vehicle</th>
                  <th className="px-6 py-3.5">Joined</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedPartners.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8">
                      <EmptyState
                        icon="local_shipping"
                        title="No Delivery Partners Found"
                        description="Try modifying filters or registering a new delivery partner."
                        actionText="Add Partner"
                        onActionClick={handleOpenAddModal}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedPartners.map((partner) => {
                    const isSelected = selectedPartnerId === partner.id;
                    const getStatusStyle = (p) => {
                      if (p.status === "Suspended" || p.isSuspended) {
                        return {
                          label: "Suspended",
                          badge: "bg-red-50 text-red-700 border-red-200",
                          dot: "bg-red-500",
                        };
                      }
                      if (p.currentStatus === "On Delivery" || p.currentStatus === "On Duty") {
                        return {
                          label: "On Delivery",
                          badge: "bg-purple-50 text-purple-700 border-purple-200",
                          dot: "bg-purple-500",
                        };
                      }
                      if (p.currentStatus === "Available" || p.isOnline) {
                        return {
                          label: "Online",
                          badge: "bg-green-50 text-green-700 border-green-200",
                          dot: "bg-green-500",
                        };
                      }
                      return {
                        label: "Offline",
                        badge: "bg-slate-100 text-slate-500 border-slate-200",
                        dot: "bg-slate-400",
                      };
                    };
                    const status = getStatusStyle(partner);
                    return (
                      <tr
                        key={partner.id}
                        onClick={() => setSelectedPartnerId(partner.id)}
                        className={`cursor-pointer transition-all hover:bg-slate-50/50 ${
                          isSelected ? "bg-[#0D6B46]/5" : ""
                        }`}
                      >
                        {/* Rider Profile column */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full border border-slate-200 overflow-hidden shrink-0 shadow-3xs bg-slate-50">
                              <img
                                className="w-full h-full object-cover"
                                src={partner.avatar}
                                alt={partner.name}
                              />
                            </div>
                            <div className="truncate">
                              <p className="font-bold text-xs text-slate-800 hover:text-[#0D6B46] transition-colors truncate flex items-center gap-1">
                                {partner.name}
                                {partner.status === "Approved" && (
                                  <span className="material-symbols-outlined text-[#0D6B46] text-[14px] fill-current">
                                    verified
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-400 font-bold tracking-wide mt-0.5 truncate uppercase">
                                ID: {partner.id.substring(0, 10)}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Status Column */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[9px] border uppercase tracking-wider ${status.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                            {status.label}
                          </span>
                        </td>

                        {/* Rating Column */}
                        <td className="px-6 py-4 font-bold text-xs text-slate-700">
                          <div className="flex items-center gap-1">
                            <span
                              className="material-symbols-outlined text-[15px] text-amber-500"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              star
                            </span>
                            {(partner.rating || 5.0).toFixed(1)}
                          </div>
                        </td>

                        {/* Contact Column */}
                        <td className="px-6 py-4 font-semibold text-xs text-slate-600 font-mono">
                          {partner.mobile || partner.phone}
                        </td>

                        {/* Vehicle Column */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-xs text-slate-750">{partner.vehicleNumber || "N/A"}</p>
                          <p className="text-[9px] text-slate-450 font-bold uppercase mt-0.5">
                            {partner.vehicleType || "Scooter"}
                          </p>
                        </td>

                        {/* Joined Column */}
                        <td className="px-6 py-4">
                          <p className="font-semibold text-xs text-slate-750">
                            {partner.joinedDate || "12 Aug 2024"}
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                            {partner.joinedTime || "2:45 PM"}
                          </p>
                        </td>

                        {/* Actions Column */}
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedPartnerId(partner.id)}
                              className="text-slate-400 hover:text-[#0D6B46] p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                              title="Inspect Details"
                            >
                              <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(partner)}
                              className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {tabFilteredPartners.length > 0 && (
            <footer className="px-6 py-4 border-t border-slate-150 flex justify-between items-center bg-slate-50/50 mt-auto">
              <span className="text-xs text-slate-500 font-medium">
                Showing {Math.min(tabFilteredPartners.length, (currentPage - 1) * pageSize + 1)} to{" "}
                {Math.min(tabFilteredPartners.length, currentPage * pageSize)} of{" "}
                {tabFilteredPartners.length} riders
              </span>
              
              <div className="flex items-center gap-1.5">
                {/* Prev Button */}
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>

                {/* Page number buttons */}
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const page = idx + 1;
                  const isActive = currentPage === page;
                  // Show pages conditionally (e.g. within bounds)
                  if (totalPages > 5 && page > 3 && page < totalPages - 1 && Math.abs(currentPage - page) > 1) {
                    if (page === 4) {
                      return <span key={page} className="text-slate-400 text-xs px-1">...</span>;
                    }
                    return null;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? "bg-[#0D6B46] text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                {/* Next Button */}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}
                  className="w-8 h-8 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>

              {/* Rows Per Page select */}
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 focus:outline-none"
                >
                  <option value="5">5 / page</option>
                  <option value="10">10 / page</option>
                  <option value="20">20 / page</option>
                </select>
              </div>
            </footer>
          )}
        </section>

        {/* Right Side: Details Inspector Panel */}
        <aside className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 flex flex-col gap-6 sticky top-6 max-h-[85vh] overflow-y-auto">
          {activePartner ? (
            <>
              {/* Profile Card Inspector */}
              <div className="flex flex-col items-center text-center relative pb-2 border-b border-slate-100">
                
                {/* Float Actions */}
                <div className="absolute top-0 right-0 flex gap-1.5">
                  <button
                    onClick={() => handleOpenEditModal(activePartner)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-[#0D6B46] shadow-3xs transition-all hover:bg-slate-50"
                    title="Edit Rider"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button
                    onClick={() => handleDeletePartner(activePartner.id, activePartner.name)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 shadow-3xs transition-all hover:bg-slate-50"
                    title="Remove Rider"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>

                <div className="w-20 h-20 rounded-full border-4 border-slate-50 overflow-hidden shadow-2xs bg-slate-100">
                  <img
                    className="w-full h-full object-cover"
                    src={activePartner.avatar}
                    alt={activePartner.name}
                  />
                </div>
                
                <h3
                  className="font-bold text-base text-slate-800 mt-3 tracking-tight flex items-center gap-1"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {activePartner.name}
                  {activePartner.status === "Approved" && (
                    <span className="material-symbols-outlined text-[#0D6B46] text-[16px] fill-current">
                      verified
                    </span>
                  )}
                </h3>
                
                <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider font-mono mt-0.5">
                  ID: {activePartner.id}
                </p>

                {/* Duty status badge */}
                {(() => {
                  const getStatusStyle = (p) => {
                    if (p.status === "Suspended" || p.isSuspended) {
                      return "bg-red-50 text-red-700 border-red-200";
                    }
                    if (p.currentStatus === "On Delivery" || p.currentStatus === "On Duty") {
                      return "bg-purple-50 text-purple-700 border-purple-200";
                    }
                    if (p.isOnline) {
                      return "bg-green-50 text-green-700 border-green-200";
                    }
                    return "bg-slate-100 text-slate-500 border-slate-200";
                  };
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[9px] border uppercase tracking-wider mt-3 ${getStatusStyle(activePartner)}`}>
                      <span className={`w-1 h-1 rounded-full ${activePartner.isOnline ? "bg-green-500" : "bg-slate-400"}`}></span>
                      {activePartner.currentStatus || (activePartner.isOnline ? "Online" : "Offline")}
                    </span>
                  );
                })()}

                {/* Quick actions row */}
                <div className="flex gap-2 w-full mt-5">
                  <button
                    onClick={() => addToast(`Initializing chat connection to ${activePartner.name}...`, "info")}
                    className="flex-grow py-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 transition-colors flex justify-center items-center gap-1 shadow-3xs text-xs font-bold"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-400">chat_bubble</span> Message
                  </button>
                  <a
                    href={`tel:${activePartner.mobile || activePartner.phone}`}
                    className="flex-grow py-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 transition-colors flex justify-center items-center gap-1 shadow-3xs text-xs font-bold"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-400">call</span> Call
                  </a>
                  <button
                    onClick={() => {
                      const lat = activePartner.currentLatitude || 12.9716;
                      const lng = activePartner.currentLongitude || 77.5946;
                      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, "_blank");
                    }}
                    className="p-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 transition-colors flex justify-center items-center shadow-3xs"
                    title="Track Location"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-400">location_on</span>
                  </button>
                </div>
              </div>

              {/* Rider Information Section */}
              <div className="flex flex-col gap-3">
                <h4 className="font-bold text-xs text-slate-800 tracking-tight uppercase" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Rider Information
                </h4>
                <div className="grid grid-cols-1 gap-2 text-xs font-semibold text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Email</span>
                    <span>{activePartner.email || "venu@gmail.com"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Date of Birth</span>
                    <span>{activePartner.dob || "15 May 1998"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Address</span>
                    <span className="truncate max-w-[200px]">{activePartner.address || "Guntur, Andhra Pradesh"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Blood Group</span>
                    <span>{activePartner.bloodGroup || "O+"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Emergency Contact</span>
                    <span>{activePartner.emergencyContact || "9390488850 (Father)"}</span>
                  </div>
                </div>
              </div>

              {/* Vehicle Information Section */}
              <div className="flex flex-col gap-3">
                <h4 className="font-bold text-xs text-slate-800 tracking-tight uppercase" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Vehicle Information
                </h4>
                <div className="grid grid-cols-1 gap-2 text-xs font-semibold text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Vehicle Type</span>
                    <span>{activePartner.vehicleType || "Scooter"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Vehicle Number</span>
                    <span>{activePartner.vehicleNumber || "AP07 7788"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">RC Number</span>
                    <span>{activePartner.rcNumber || "RC123456789"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Insurance Valid</span>
                    <span className="flex items-center gap-1.5">
                      {activePartner.insuranceExpiry || "18 Dec 2024"}
                      <span className="px-1.5 py-0.5 rounded-md bg-green-50 text-green-700 text-[8px] font-bold uppercase tracking-wider">
                        Verified
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">License Valid</span>
                    <span className="flex items-center gap-1.5">
                      {activePartner.licenseExpiry || "12 Mar 2025"}
                      <span className="px-1.5 py-0.5 rounded-md bg-green-50 text-green-700 text-[8px] font-bold uppercase tracking-wider">
                        Verified
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin Actions Panel */}
              <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">Rider Account Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                    activePartner.status === "Approved"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : activePartner.status === "Rejected"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : activePartner.status === "Suspended"
                      ? "bg-slate-100 text-slate-700 border-slate-350"
                      : "bg-orange-50 text-orange-700 border-orange-200"
                  }`}>
                    {activePartner.status || (activePartner.approved ? "Approved" : "Pending")}
                  </span>
                </div>

                {activePartner.rejectionReason && activePartner.status === "Rejected" && (
                  <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl text-[10px] text-red-700 font-semibold leading-relaxed">
                    <strong>Rejection Reason:</strong> {activePartner.rejectionReason}
                  </div>
                )}

                {activePartner.suspensionReason && activePartner.status === "Suspended" && (
                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl text-[10px] text-slate-600 font-semibold leading-relaxed">
                    <strong>Suspension Reason:</strong> {activePartner.suspensionReason}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {activePartner.status !== "Approved" && (
                    <button
                      onClick={() => handleApprove(activePartner)}
                      className="flex-grow px-3 py-2 bg-[#0D6B46] hover:bg-[#095235] text-white text-[11px] font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1 border-t border-white/10"
                    >
                      <span className="material-symbols-outlined text-[15px]">verified</span> Approve Access
                    </button>
                  )}
                  {activePartner.status === "Pending Verification" && (
                    <button
                      onClick={() => handleReject(activePartner)}
                      className="flex-grow px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[15px]">cancel</span> Reject Verification
                    </button>
                  )}
                  {activePartner.status === "Approved" && (
                    <button
                      onClick={() => handleSuspend(activePartner)}
                      className="flex-grow px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-[11px] font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[15px]">block</span> Suspend Rider
                    </button>
                  )}
                  {activePartner.status === "Suspended" && (
                    <button
                      onClick={() => handleRestore(activePartner)}
                      className="flex-grow px-3 py-2 bg-[#0D6B46] hover:bg-[#095235] text-white text-[11px] font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1 border-t border-white/10"
                    >
                      <span className="material-symbols-outlined text-[15px]">settings_backup_restore</span> Restore Access
                    </button>
                  )}
                </div>
              </div>

              {/* View Documents & Edit Action Trays */}
              <div className="grid grid-cols-2 gap-3 mt-2 border-t border-slate-100 pt-4">
                <button
                  onClick={() => {
                    setDocReviewStatuses(activePartner?.documentStatuses || {});
                    setIsDocsModalOpen(true);
                  }}
                  className="py-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 hover:bg-slate-50 transition-colors flex justify-center items-center gap-1.5 shadow-3xs text-xs font-bold"
                >
                  <span className="material-symbols-outlined text-[16px] text-slate-400">folder_open</span> View Documents
                </button>
                <button
                  onClick={() => handleOpenEditModal(activePartner)}
                  className="py-2.5 rounded-xl bg-[#0D6B46] hover:bg-[#095235] text-white transition-colors flex justify-center items-center gap-1.5 shadow-3xs text-xs font-bold border-t border-white/20 inner-shine"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span> Edit Rider
                </button>
              </div>

              {/* Dispatch order telemetry card */}
              {activePartner.status === "Approved" && (
                <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">Active Shipment Info</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[8px] font-bold border uppercase tracking-wider ${
                      activePartner.assignedOrderId || (activePartner.activeDelivery && activePartner.activeDelivery.orderId)
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}>
                      {activePartner.assignedOrderId || (activePartner.activeDelivery && activePartner.activeDelivery.orderId) ? "In Transit" : "Idle"}
                    </span>
                  </div>
                  {activePartner.assignedOrderId || (activePartner.activeDelivery && activePartner.activeDelivery.orderId) ? (
                    <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex flex-col gap-1.5 text-xs text-slate-600 font-semibold leading-relaxed">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order ID:</span>
                        <strong className="text-slate-800">{activePartner.assignedOrderId || activePartner.activeDelivery?.orderId}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Coordinates:</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {activePartner.currentLatitude?.toFixed(4)}, {activePartner.currentLongitude?.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleOpenAssignModal}
                      className="w-full py-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px] text-slate-400">assignment_ind</span> Dispatch Order
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-400 italic text-xs font-semibold">
              Select a delivery partner to inspect details.
            </div>
          )}
        </aside>
      </div>

      {/* View Documents Modal */}
      {isDocsModalOpen && activePartner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsDocsModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-250 w-full max-w-2xl relative z-10 flex flex-col max-h-[85vh] overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                Credentials & Documents - {activePartner.name}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setIsDocsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: "Profile Photo", fileUrl: activePartner.avatar || (activePartner.documents || {}).profilePhoto, keyName: "profilePhoto" },
                { title: "Aadhaar Card", fileUrl: docAadhaar, keyName: "aadhaar" },
                { title: "Driving License", fileUrl: docLicense, keyName: "license" },
                { title: "PAN Card", fileUrl: docPAN, keyName: "pan" },
                { title: "Vehicle RC Document", fileUrl: docRC, keyName: "rc" },
                { title: "Insurance Document", fileUrl: docInsurance, keyName: "insurance" },
              ].map((doc) => {
                const hasDoc = doc.fileUrl && doc.fileUrl.startsWith("http");

                // A PDF rendered into <img> shows a broken-image icon, so the
                // reviewer sees "uploaded" with nothing to look at. The
                // extension is read from the path, before the query string,
                // because Firebase download URLs carry ?alt=media&token=...
                const pathPart = hasDoc ? doc.fileUrl.split("?")[0].toLowerCase() : "";
                const isPdf = pathPart.endsWith(".pdf");

                const status = docReviewStatuses[doc.keyName] || (hasDoc ? "Pending" : "");
                const badge =
                  !hasDoc
                    ? "bg-slate-100 text-slate-500 border-slate-200"
                    : status === "Approved"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : status === "Rejected"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-amber-50 text-amber-700 border-amber-200";

                return (
                  <div key={doc.title} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">{doc.title}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${badge}`}>
                        {hasDoc ? status : "Not Provided"}
                      </span>
                    </div>

                    <div className="h-32 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                      {!hasDoc ? (
                        <span className="material-symbols-outlined text-slate-350 text-3xl">image</span>
                      ) : isPdf ? (
                        <div className="flex flex-col items-center gap-1 text-slate-500">
                          <span className="material-symbols-outlined text-3xl">picture_as_pdf</span>
                          <span className="text-[10px] font-bold">PDF — open to review</span>
                        </div>
                      ) : (
                        <img src={doc.fileUrl} alt={doc.title} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                      )}
                    </div>

                    {hasDoc ? (
                      <>
                        <div className="flex gap-2">
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-bold flex items-center justify-center gap-1 shadow-3xs"
                          >
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span> View Doc
                          </a>
                          <a
                            href={doc.fileUrl}
                            download
                            className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-bold flex items-center justify-center shadow-3xs"
                            title="Download File"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                          </a>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDocumentReview(doc.keyName, doc.title, "Approved")}
                            disabled={status === "Approved"}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors bg-[#0D6B46] text-white hover:bg-[#095235] disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-[14px]">check</span> Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDocumentReview(doc.keyName, doc.title, "Rejected")}
                            disabled={status === "Rejected"}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span> Reject
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-semibold italic text-center py-2">
                         Reroute partner to upload document credentials.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsDocsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 font-bold text-xs hover:bg-slate-100 transition-colors shadow-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Delivery Partner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                {editPartnerId ? "Configure Delivery Partner Details" : "Register New Delivery Partner"}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-150 transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            {/* Modal Form Body */}
            <form onSubmit={handleSavePartner} className="flex flex-col flex-grow overflow-y-auto">
              <div className="p-6 space-y-5 flex-grow">
                
                {/* Profile photo upload field */}
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Profile Photo
                  </label>
                  <div className="relative border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      disabled={uploading}
                    />
                    {uploading ? (
                      <p className="font-bold text-xs text-[#0D6B46] animate-pulse">Uploading photo...</p>
                    ) : partnerAvatar ? (
                      <div className="relative w-16 h-16 rounded-full overflow-hidden border border-slate-250 shadow-3xs">
                        <img src={partnerAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-white text-[10px] font-bold">Replace</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-450">
                        <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                        <span className="font-bold text-xs text-slate-600">Upload profile image</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Basic details */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
                    Basic Credentials
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={partnerName}
                        onChange={(e) => setPartnerName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. Venu"
                        required
                        type="text"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={partnerMobile}
                        onChange={(e) => setPartnerMobile(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. 9390488859"
                        required
                        type="text"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Email Address
                      </label>
                      <input
                        value={partnerEmail}
                        onChange={(e) => setPartnerEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. venu@gmail.com"
                        type="email"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Date of Birth
                      </label>
                      <input
                        value={partnerDob}
                        onChange={(e) => setPartnerDob(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. 15 May 1998"
                        type="text"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Blood Group
                      </label>
                      <input
                        value={partnerBloodGroup}
                        onChange={(e) => setPartnerBloodGroup(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. O+"
                        type="text"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Emergency Contact
                      </label>
                      <input
                        value={partnerEmergencyContact}
                        onChange={(e) => setPartnerEmergencyContact(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. 9390488850 (Father)"
                        type="text"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      Current Address
                    </label>
                    <textarea
                      value={partnerAddress}
                      onChange={(e) => setPartnerAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all resize-none h-16"
                      placeholder="e.g. Guntur, Andhra Pradesh"
                    />
                  </div>
                </div>

                {/* Section: Vehicle details */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
                    Vehicle Details
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Vehicle Type
                      </label>
                      <select
                        value={partnerVehicleType}
                        onChange={(e) => setPartnerVehicleType(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white"
                      >
                        <option value="Scooter">Scooter</option>
                        <option value="Bike">Bike</option>
                        <option value="E-Bike">E-Bike</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Vehicle Plate Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. AP07 7788"
                        required
                        type="text"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        RC Number
                      </label>
                      <input
                        value={rcNumber}
                        onChange={(e) => setRcNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="RC123456789"
                        type="text"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Insurance Expiry
                      </label>
                      <input
                        value={insuranceExpiry}
                        onChange={(e) => setInsuranceExpiry(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all font-mono"
                        placeholder="18 Dec 2024"
                        type="text"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        License Expiry
                      </label>
                      <input
                        value={licenseExpiry}
                        onChange={(e) => setLicenseExpiry(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all font-mono"
                        placeholder="12 Mar 2025"
                        type="text"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Operational Settings */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
                    Settlements & Bank Info
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Bank Name
                      </label>
                      <input
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="e.g. SBI Bank"
                        type="text"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Account Number
                      </label>
                      <input
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="*********1243"
                        type="text"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        IFSC Code
                      </label>
                      <input
                        value={ifscCode}
                        onChange={(e) => setIfscCode(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="SBIN0001004"
                        type="text"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        UPI Address (VPA)
                      </label>
                      <input
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        placeholder="rider@upi"
                        type="text"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Operational Settings */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
                    Operational Status & Telemetry
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Duty Status
                      </label>
                      <select
                        value={currentStatus}
                        onChange={(e) => setCurrentStatus(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white"
                      >
                        <option value="Available">Available</option>
                        <option value="Offline">Offline</option>
                        <option value="On Break">On Break</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Rating Score
                      </label>
                      <input
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        type="number"
                        step="0.1"
                        min="1"
                        max="5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Total Orders Completed
                      </label>
                      <input
                        value={totalDeliveries}
                        onChange={(e) => setTotalDeliveries(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        type="number"
                        min="0"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-3">
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
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D6B46]"></div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Telemetry Lat
                      </label>
                      <input
                        value={currentLatitude}
                        onChange={(e) => setCurrentLatitude(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        type="number"
                        step="0.000001"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        Telemetry Lon
                      </label>
                      <input
                        value={currentLongitude}
                        onChange={(e) => setCurrentLongitude(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#0D6B46] focus:bg-white text-xs font-semibold text-slate-700 transition-all"
                        type="number"
                        step="0.000001"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Documents file upload fields */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
                    Verification Documents Upload
                  </h4>

                  {[
                    { label: "Aadhaar Card", fileUrl: docAadhaar, keyName: "aadhaar" },
                    { label: "Driving License", fileUrl: docLicense, keyName: "license" },
                    { label: "PAN Card", fileUrl: docPAN, keyName: "pan" },
                    { label: "Vehicle RC Document", fileUrl: docRC, keyName: "rc" },
                    { label: "Insurance Document", fileUrl: docInsurance, keyName: "insurance" },
                  ].map((doc) => (
                    <div key={doc.label} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-slate-50 border border-slate-150 rounded-xl gap-2.5">
                      <div>
                        <p className="text-xs font-bold text-slate-700">{doc.label}</p>
                        <p className="text-[10px] text-slate-400 font-semibold truncate max-w-[200px]">
                          {doc.fileUrl ? "Document Uploaded" : "Not Provided"}
                        </p>
                      </div>
                      
                      <div className="relative overflow-hidden inline-flex px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-3xs">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleDocumentChange(e, doc.keyName)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <span className="material-symbols-outlined text-[15px] mr-1 text-slate-400">cloud_upload</span>
                        Upload File
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 font-bold text-xs hover:bg-slate-100 transition-colors shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0D6B46] text-white font-bold text-xs hover:bg-[#095235] transition-colors shadow-xs border-t border-white/20 inner-shine"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsAssignModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg relative z-10 flex flex-col max-h-[80vh] overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-800 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                Assign Shipment Dispatch to {activePartner?.name}
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0D6B46]"></div>
                  <p className="text-xs text-slate-400 mt-2">Loading unassigned shipments...</p>
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
                  <p className="text-xs text-slate-500 mb-4 font-semibold">
                    Select an active unassigned order to dispatch to {activePartner?.name}:
                  </p>
                  {availableOrders.map((order) => (
                    <div 
                      key={order.id} 
                      className="border border-slate-200 rounded-2xl p-4 hover:bg-[#0D6B46]/5 transition-colors flex justify-between items-center gap-4 text-xs font-semibold text-slate-600"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <strong className="text-slate-850 text-sm">Order #{order.orderId || order.id}</strong>
                          <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[9px] font-bold uppercase tracking-wider">
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
                        className="px-4 py-2 bg-[#0D6B46] hover:bg-[#095235] text-white font-bold rounded-xl shadow-xs transition-colors shrink-0"
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
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-550 font-bold text-xs hover:bg-slate-100 transition-colors shadow-xs"
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
