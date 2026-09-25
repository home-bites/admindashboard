import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, isFirebaseConfigured } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

/** A COD block lasts 24 hours. Same figure the backend applies on abuse. */
const COD_BLOCK_HOURS = 24;

/**
 * Universal timestamp parser for Firestore Timestamp, Date object, Unix seconds, or ISO string.
 */
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (typeof val === "number") return new Date(val);
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Evaluates whether Cash On Delivery is currently restricted for a customer.
 */
const getCodBlock = (customer) => {
  const until = parseDate(customer?.codBlockedUntil);
  const abandonments = Number(customer?.codAbandonments || 0);
  const cancellations = Number(customer?.codCancellations || 0);

  if (!until) {
    return { blocked: false, until: null, reason: null, reasonText: "", remainingText: "", abandonments, cancellations };
  }

  const msLeft = until.getTime() - Date.now();
  const blocked = msLeft > 0;
  const reason = customer?.codBlockedReason || null;

  let reasonText;
  if (reason === "admin") {
    reasonText = "Blocked by support";
  } else if (reason === "abuse") {
    reasonText = abandonments > 0
      ? `Auto-blocked: ${abandonments} checkout abandonment${abandonments === 1 ? "" : "s"}`
      : "Auto-blocked: too many abandoned COD checkouts";
  } else {
    reasonText = "Blocked (reason not recorded)";
  }

  if (!blocked) {
    return { blocked: false, until, reason, reasonText, remainingText: "released", abandonments, cancellations };
  }

  const totalMinutes = Math.floor(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remainingText = totalMinutes < 1
    ? "releases in under a minute"
    : hours > 0
      ? `releases in ${hours}h ${minutes}m`
      : `releases in ${minutes}m`;

  return { blocked: true, until, reason, reasonText, remainingText, abandonments, cancellations };
};

/**
 * Normalizes phone numbers to standard 10 digits for accurate deduplication and searching.
 */
const normalizePhone = (p) => {
  if (!p) return "";
  const digits = String(p).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

/**
 * Formats a phone number for user display.
 */
const formatPhoneNumber = (p) => {
  if (!p) return "N/A";
  const digits = String(p).replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return p;
};

/**
 * Strict placeholder name detector to eliminate "Gourmet Customer" and other dummy defaults.
 */
const isPlaceholderName = (name) => {
  if (!name || typeof name !== "string") return true;
  const lower = name.trim().toLowerCase();
  return (
    lower === "" ||
    lower === "gourmet customer" ||
    lower === "gourmet" ||
    lower === "customer" ||
    lower === "user" ||
    lower === "guest" ||
    lower === "guest user" ||
    lower === "unknown" ||
    lower === "n/a" ||
    lower === "null" ||
    lower === "undefined" ||
    lower.startsWith("customer #") ||
    lower.startsWith("user #")
  );
};

/**
 * Resolves customer's genuine real name with zero placeholder fallbacks.
 */
const resolveCustomerIdentity = (u) => {
  if (!u) return "HomeBites Member";

  const candidates = [
    u.name,
    u.displayName,
    u.fullName,
    u.userName,
    u.customerName,
    u.profile?.name,
    u.shippingAddress?.name,
    u.deliveryAddress?.name,
  ];

  for (const c of candidates) {
    if (c && !isPlaceholderName(c)) {
      return c.trim();
    }
  }

  // Check email prefix
  if (u.email && u.email.includes("@")) {
    const local = u.email.split("@")[0].replace(/[._0-9]/g, " ").trim();
    if (local.length > 2) {
      return local
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  // Check phone number representation
  const rawPhone = u.phone || u.mobileNumber || u.phoneNumber;
  if (rawPhone) {
    const digits = String(rawPhone).replace(/\D/g, "");
    if (digits.length >= 4) {
      return `Customer (${digits.slice(-4)})`;
    }
  }

  return u.id ? `Customer (${u.id.substring(0, 5)})` : "HomeBites Member";
};

/**
 * Deduplicates and consolidates customer records across multiple sign-in methods (Phone, Google, etc.)
 */
const consolidateCustomerProfiles = (rawList) => {
  const groups = new Map();

  for (const u of rawList) {
    const normPhone = normalizePhone(u.phone || u.mobileNumber || u.phoneNumber);
    const normEmail = (u.email || "").toLowerCase().trim();

    // Grouping key: Prefer 10-digit phone, then valid email, else UID
    let key = "";
    if (normPhone && normPhone.length === 10) {
      key = `phone_${normPhone}`;
    } else if (normEmail && normEmail.includes("@")) {
      key = `email_${normEmail}`;
    } else {
      key = `uid_${u.id}`;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(u);
  }

  const consolidated = [];

  for (const [, records] of groups.entries()) {
    if (records.length === 1) {
      const u = records[0];
      const canonicalName = resolveCustomerIdentity(u);
      const rawPhone = u.phone || u.mobileNumber || u.phoneNumber || "";
      const normPhone = normalizePhone(rawPhone);

      consolidated.push({
        ...u,
        canonicalName,
        canonicalPhone: rawPhone,
        normalizedPhone: normPhone,
        displayPhone: formatPhoneNumber(rawPhone),
        canonicalEmail: u.email || "",
        walletBalance: Number(u.walletBalance || 0),
        totalOrders: Number(u.totalOrders || 0),
        totalSpent: Number(u.totalSpent || 0),
        isMerged: false,
        mergedCount: 1,
        linkedUids: [u.id],
        records: [u],
      });
    } else {
      // Pick best non-placeholder name across merged accounts
      let bestName = "";
      for (const r of records) {
        const n = resolveCustomerIdentity(r);
        if (!n.startsWith("Customer (") && !n.startsWith("Customer #")) {
          bestName = n;
          break;
        }
      }
      if (!bestName) bestName = resolveCustomerIdentity(records[0]);

      // Sum all wallet balances across linked accounts so customer doesn't lose money
      const totalWallet = records.reduce((sum, r) => sum + Number(r.walletBalance || 0), 0);
      const totalOrders = records.reduce((sum, r) => sum + Number(r.totalOrders || 0), 0);
      const totalSpent = records.reduce((sum, r) => sum + Number(r.totalSpent || 0), 0);

      // Best phone & email
      const primaryPhone = records.find((r) => r.phone || r.mobileNumber)?.phone || records[0].phone || "";
      const primaryEmail = records.find((r) => r.email && r.email.includes("@"))?.email || records[0].email || "";

      // Check if any linked record has active COD block
      const blockedRecord = records.find((r) => getCodBlock(r).blocked);
      const primaryRecord = records[0];

      // Check if any linked record is active
      const anyActive = records.some((r) => r.isActive !== false);

      consolidated.push({
        ...primaryRecord,
        id: primaryRecord.id,
        canonicalName: bestName,
        canonicalPhone: primaryPhone,
        normalizedPhone: normalizePhone(primaryPhone),
        displayPhone: formatPhoneNumber(primaryPhone),
        canonicalEmail: primaryEmail,
        walletBalance: totalWallet,
        totalOrders,
        totalSpent,
        isActive: anyActive,
        isMerged: true,
        mergedCount: records.length,
        linkedUids: records.map((r) => r.id),
        records: records,
        codBlockedUntil: blockedRecord ? blockedRecord.codBlockedUntil : primaryRecord.codBlockedUntil,
        codBlockedReason: blockedRecord ? blockedRecord.codBlockedReason : primaryRecord.codBlockedReason,
        codBlockedAt: blockedRecord ? blockedRecord.codBlockedAt : primaryRecord.codBlockedAt,
      });
    }
  }

  // Sort by created date or active activity
  consolidated.sort((a, b) => {
    const timeA = parseDate(a.createdAt)?.getTime() || 0;
    const timeB = parseDate(b.createdAt)?.getTime() || 0;
    return timeB - timeA;
  });

  return consolidated;
};

export const Customers = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();

  const [rawCustomers, setRawCustomers] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Layout & Filtering States
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'with_wallet' | 'active' | 'suspended' | 'cod_blocked' | 'merged'
  const [drawerTab, setDrawerTab] = useState("orders"); // "orders" | "wallet" | "addresses" | "merged" | "security"

  // Quick Wallet Credit / Debit Modal State
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [walletTargetCustomer, setWalletTargetCustomer] = useState(null);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [walletActionType, setWalletActionType] = useState("credit"); // 'credit' | 'debit' | 'set'
  const [isProcessingWallet, setIsProcessingWallet] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);

  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCodBlocked, setEditCodBlocked] = useState(false);
  const [editCodWasBlocked, setEditCodWasBlocked] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  // Per-customer order history
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [customerOrdersError, setCustomerOrdersError] = useState(false);

  // Real-time clock tick for COD expiry
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const isMockMode = import.meta.env.VITE_ENABLE_MOCK_DATA === "true" || !isFirebaseConfigured;

  // Real-time user listener with NO 200 LIMIT and complete case-insensitive role filtering
  useEffect(() => {
    if (isMockMode) {
      const mockList = [
        {
          id: "cust1",
          name: "Sarah Jenkins",
          email: "sarah@jenkins.com",
          phone: "+91 98765 43210",
          mobileNumber: "+91 98765 43210",
          createdAt: new Date().toISOString(),
          isActive: true,
          codBlockedUntil: null,
          codBlockedReason: null,
          codAbandonments: 0,
          codCancellations: 0,
          walletBalance: 250,
          referredBy: "Michael Chen",
          totalOrders: 14,
          totalSpent: 4200,
        },
        {
          id: "cust2",
          name: "Michael Chen",
          email: "michael@chen.com",
          phone: "+91 98765 43211",
          mobileNumber: "+91 98765 43211",
          createdAt: new Date().toISOString(),
          isActive: true,
          codBlockedUntil: new Date(Date.now() + 6 * 3600000).toISOString(),
          codBlockedReason: "abuse",
          codBlockedAt: new Date(Date.now() - 18 * 3600000).toISOString(),
          codAbandonments: 3,
          codCancellations: 1,
          walletBalance: 0,
          referredBy: "",
          totalOrders: 3,
          totalSpent: 850,
        },
        {
          id: "cust3",
          name: "Emma Watson",
          email: "emma@watson.com",
          phone: "+91 98765 43212",
          mobileNumber: "+91 98765 43212",
          createdAt: new Date().toISOString(),
          isActive: false,
          codBlockedUntil: null,
          walletBalance: 1200,
          referredBy: "Sarah Jenkins",
          totalOrders: 28,
          totalSpent: 11200,
        },
      ];
      setRawCustomers(mockList);
      setAddresses([
        { id: "addr1", userId: "cust1", houseNumber: "12A", street: "Kitchener Rd", landmark: "Near park", city: "Guntur", pincode: "522001", label: "Home" },
      ]);
      setReviews([
        { id: "rev1", customerId: "cust1", itemName: "Spicy Tuna Bowl", rating: 5, comment: "Super fresh and delicious, Chef!", createdAt: new Date().toISOString() },
      ]);
      setAuditLogs([
        { id: "log1", uid: "cust1", email: "sarah@jenkins.com", action: "LOGIN", timestamp: new Date().toISOString(), loginMethod: "firebase_auth" },
      ]);
      setLoading(false);
      return;
    }

    // Live subscription to users collection without arbitrary limit
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.isDeleted !== true) {
            const rawRole = String(data.role || "").toLowerCase().replace(/[_-]/g, " ").trim();
            // Exclude staff, admin, and delivery partners
            if (!["admin", "super admin", "delivery", "rider", "partner", "kitchen", "restaurant", "staff"].includes(rawRole)) {
              list.push({
                id: docSnap.id,
                ...data,
              });
            }
          }
        });
        setRawCustomers(list);
        setLoading(false);
      },
      (err) => {
        console.error("Customers listener error:", err);
        setLoading(false);
      }
    );

    const unsubAddresses = onSnapshot(
      query(collection(db, "addresses"), limit(300)),
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setAddresses(list);
      },
      (err) => console.warn("Addresses listener warning:", err)
    );

    const unsubReviews = onSnapshot(
      query(collection(db, "reviews"), limit(200)),
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setReviews(list);
      },
      (err) => console.warn("Reviews listener warning:", err)
    );

    const unsubLogs = onSnapshot(
      query(collection(db, "auditLogs"), limit(200)),
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setAuditLogs(list);
      },
      (err) => console.warn("AuditLogs listener warning:", err)
    );

    return () => {
      unsubUsers();
      unsubAddresses();
      unsubReviews();
      unsubLogs();
    };
  }, [isMockMode]);

  // Consolidate duplicates into clean unified customer entities
  const consolidatedCustomers = useMemo(() => {
    return consolidateCustomerProfiles(rawCustomers);
  }, [rawCustomers]);

  // Keep selectedCustomer synchronized with live updates
  useEffect(() => {
    if (selectedCustomer) {
      const refreshed = consolidatedCustomers.find(
        (c) => c.id === selectedCustomer.id || c.linkedUids?.includes(selectedCustomer.id)
      );
      if (refreshed) {
        setSelectedCustomer(refreshed);
      }
    }
  }, [consolidatedCustomers]);

  // Advanced Multi-field Search and Status Filtering
  const filteredCustomers = useMemo(() => {
    const qLower = searchQuery.toLowerCase().trim();
    const qDigits = searchQuery.replace(/\D/g, "");

    return consolidatedCustomers.filter((c) => {
      // 1. Status Filter
      if (statusFilter === "with_wallet" && (c.walletBalance || 0) <= 0) return false;
      if (statusFilter === "active" && c.isActive === false) return false;
      if (statusFilter === "suspended" && c.isActive !== false) return false;
      if (statusFilter === "cod_blocked" && !getCodBlock(c).blocked) return false;
      if (statusFilter === "merged" && !c.isMerged) return false;

      // 2. Search Query Filter
      if (!qLower && !qDigits) return true;

      // Name match
      if (c.canonicalName?.toLowerCase().includes(qLower)) return true;
      // Email match
      if (c.canonicalEmail?.toLowerCase().includes(qLower)) return true;
      // UID match (including linked UIDs)
      if (c.id?.toLowerCase().includes(qLower)) return true;
      if (c.linkedUids?.some((uid) => uid.toLowerCase().includes(qLower))) return true;

      // Phone digits match (e.g. typing "98765" or "43210")
      if (qDigits && qDigits.length >= 3) {
        const rawDigits = (c.canonicalPhone || "").replace(/\D/g, "");
        if (rawDigits.includes(qDigits)) return true;
        if (c.records?.some((r) => (r.phone || r.mobileNumber || "").replace(/\D/g, "").includes(qDigits))) return true;
      }

      return false;
    });
  }, [consolidatedCustomers, searchQuery, statusFilter]);

  // Key Performance Indicators (KPIs)
  const kpis = useMemo(() => {
    const totalCustomers = consolidatedCustomers.length;
    const rawProfilesCount = rawCustomers.length;
    const totalWalletLiability = consolidatedCustomers.reduce((acc, c) => acc + (c.walletBalance || 0), 0);
    const fundedWalletsCount = consolidatedCustomers.filter((c) => (c.walletBalance || 0) > 0).length;
    const activeCount = consolidatedCustomers.filter((c) => c.isActive !== false).length;
    const codBlockedCount = consolidatedCustomers.filter((c) => getCodBlock(c).blocked).length;
    const mergedCount = consolidatedCustomers.filter((c) => c.isMerged).length;

    return {
      totalCustomers,
      rawProfilesCount,
      totalWalletLiability,
      fundedWalletsCount,
      activeCount,
      codBlockedCount,
      mergedCount,
    };
  }, [consolidatedCustomers, rawCustomers]);

  // Load customer orders across all linked accounts
  useEffect(() => {
    if (!selectedCustomer || isMockMode) return;
    let cancelled = false;

    setCustomerOrdersError(false);
    setCustomerOrdersLoading(true);

    const targetUids = selectedCustomer.linkedUids && selectedCustomer.linkedUids.length > 0
      ? selectedCustomer.linkedUids.slice(0, 10)
      : [selectedCustomer.id];

    getDocs(
      query(
        collection(db, "orders"),
        where("customerId", "in", targetUids),
        orderBy("createdAt", "desc"),
        limit(30)
      )
    )
      .then((snap) => {
        if (cancelled) return;
        setCustomerOrders(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((o) => o.isDeleted !== true)
        );
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[Customers] order history load error:", e);
        setCustomerOrdersError(true);
      })
      .finally(() => {
        if (!cancelled) setCustomerOrdersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer, isMockMode]);

  // Suspend / Activate Account
  const handleToggleSuspend = async (customer) => {
    const newActiveState = customer.isActive === false;
    const targetUids = customer.linkedUids || [customer.id];

    if (isMockMode) {
      setRawCustomers((prev) =>
        prev.map((c) => (targetUids.includes(c.id) ? { ...c, isActive: newActiveState } : c))
      );
      addToast(newActiveState ? "Customer account activated" : "Customer account suspended", "success");
      return;
    }

    try {
      await Promise.all(
        targetUids.map((uid) => updateDoc(doc(db, "users", uid), { isActive: newActiveState }))
      );
      addToast(
        newActiveState ? "Customer account(s) activated successfully" : "Customer account(s) suspended",
        "success"
      );
    } catch (err) {
      addToast(`Failed to update customer status: ${err.message}`, "error");
    }
  };

  // COD Block / Unblock Payload
  const codBlockPayload = (shouldBlock) => {
    if (!shouldBlock) return { codBlockedUntil: null, codBlockedReason: null };
    const now = new Date();
    return {
      codBlockedUntil: new Date(now.getTime() + COD_BLOCK_HOURS * 3600000),
      codBlockedReason: "admin",
      codBlockedAt: now,
    };
  };

  // Toggle COD Restriction
  const handleToggleCodBlock = async (customer) => {
    const shouldBlock = !getCodBlock(customer).blocked;
    const payload = codBlockPayload(shouldBlock);
    const targetUids = customer.linkedUids || [customer.id];

    if (isMockMode) {
      setRawCustomers((prev) =>
        prev.map((c) => (targetUids.includes(c.id) ? { ...c, ...payload } : c))
      );
      addToast(
        shouldBlock ? `Cash on Delivery blocked for ${COD_BLOCK_HOURS} hours` : "Cash on Delivery released",
        "success"
      );
      return;
    }

    try {
      await Promise.all(
        targetUids.map((uid) => updateDoc(doc(db, "users", uid), payload))
      );
      addToast(
        shouldBlock
          ? `Cash on Delivery blocked for ${COD_BLOCK_HOURS} hours`
          : "Cash on Delivery released — customer can pay cash again",
        "success"
      );
    } catch (err) {
      addToast(`Failed to update COD block: ${err.message}`, "error");
    }
  };

  // Soft Delete Customer
  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`Are you sure you want to delete customer "${customer.canonicalName}"?`)) return;
    const targetUids = customer.linkedUids || [customer.id];

    if (isMockMode) {
      setRawCustomers((prev) => prev.filter((c) => !targetUids.includes(c.id)));
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
      addToast("Customer account deleted successfully", "success");
      return;
    }

    try {
      await Promise.all(
        targetUids.map((uid) => updateDoc(doc(db, "users", uid), { isDeleted: true }))
      );
      addToast("Customer account deleted successfully", "success");
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
    } catch (err) {
      addToast(`Failed to delete customer: ${err.message}`, "error");
    }
  };

  // Quick Wallet Credit / Debit Handler
  const handleOpenWalletModal = (customer, defaultType = "credit") => {
    setWalletTargetCustomer(customer);
    setWalletActionType(defaultType);
    setWalletAmount("");
    setWalletNote("");
    setIsWalletModalOpen(true);
  };

  const handleProcessWalletAdjustment = async (e) => {
    e.preventDefault();
    if (!walletTargetCustomer) return;

    const amt = parseFloat(walletAmount);
    if (isNaN(amt) || amt <= 0) {
      addToast("Please enter a valid amount greater than ₹0.", "error");
      return;
    }

    setIsProcessingWallet(true);
    const targetUid = walletTargetCustomer.id;
    const linkedRecords =
      walletTargetCustomer.records && walletTargetCustomer.records.length > 0
        ? walletTargetCustomer.records
        : [{ id: targetUid, walletBalance: walletTargetCustomer.walletBalance || 0 }];
    const linkedUids = linkedRecords.map((r) => r.id);

    try {
      if (isMockMode) {
        let newBalance = walletTargetCustomer.walletBalance || 0;
        if (walletActionType === "credit") newBalance += amt;
        else if (walletActionType === "debit") newBalance = Math.max(0, newBalance - amt);
        else if (walletActionType === "set") newBalance = amt;

        setRawCustomers((prev) =>
          prev.map((c) => {
            if (c.id === targetUid) return { ...c, walletBalance: newBalance };
            if (linkedUids.includes(c.id)) return { ...c, walletBalance: 0 };
            return c;
          })
        );
        addToast(`Wallet updated to ₹${newBalance.toFixed(2)}`, "success");
        setIsWalletModalOpen(false);
        return;
      }

      if (walletActionType === "credit") {
        // Use callable Cloud Function for authoritative ledger and notifications
        const idempotencyKey =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `credit_${targetUid}_${amt}_${Date.now()}`;

        const creditFn = httpsCallable(functions, "adminCreditCustomerWallet");
        const res = await creditFn({
          uid: targetUid,
          phone: walletTargetCustomer.canonicalPhone || "",
          amount: amt,
          note: walletNote || "Admin credit adjustment",
          idempotencyKey,
        });

        addToast(res.data?.message || `Successfully credited ₹${amt} to primary wallet!`, "success");
      } else if (walletActionType === "debit") {
        // Multi-Account Aware Debit: debits across all linked duplicate accounts sequentially
        const userRefs = linkedRecords.map((r) => doc(db, "users", r.id));

        await runTransaction(db, async (tx) => {
          // 1. All reads first (strictly required by Firestore runTransaction)
          const snaps = await Promise.all(userRefs.map((ref) => tx.get(ref)));
          const activeAccounts = [];
          let totalAvailable = 0;

          for (let i = 0; i < snaps.length; i++) {
            const snap = snaps[i];
            if (snap.exists()) {
              const bal = Number(snap.data().walletBalance || 0);
              totalAvailable += bal;
              activeAccounts.push({
                ref: userRefs[i],
                id: linkedRecords[i].id,
                balance: bal,
              });
            }
          }

          if (totalAvailable <= 0) {
            throw new Error("Customer has ₹0.00 wallet balance across all linked accounts. Cannot debit.");
          }

          const actualDebitTotal = Math.min(amt, totalAvailable);
          let remainingToDebit = actualDebitTotal;

          // 2. All writes after
          for (const acc of activeAccounts) {
            if (remainingToDebit <= 0) break;
            if (acc.balance <= 0) continue;

            const deductThis = Math.min(acc.balance, remainingToDebit);
            const finalBal = Math.max(0, acc.balance - deductThis);
            remainingToDebit -= deductThis;

            tx.update(acc.ref, {
              walletBalance: finalBal,
              updatedAt: serverTimestamp(),
            });

            // Write ledger transaction for this account
            const txnRef = doc(collection(db, "walletTransactions"));
            tx.set(txnRef, {
              userId: acc.id,
              amount: -deductThis,
              type: "DEBIT",
              description: walletNote
                ? `${walletNote} (Multi-account debit)`
                : `Admin wallet debit for ${walletTargetCustomer.canonicalName || walletTargetCustomer.displayPhone}`,
              adminId: user?.uid || "admin",
              createdAt: serverTimestamp(),
            });
          }
        });

        addToast(
          linkedRecords.length > 1
            ? `Successfully debited ₹${amt} across ${linkedRecords.length} linked accounts!`
            : `Customer wallet balance debited successfully!`,
          "success"
        );
      } else if (walletActionType === "set") {
        // Set Balance: sets primary account to amt, sets any secondary duplicate accounts to 0
        const primaryRef = doc(db, "users", targetUid);
        const secondaryRefs = linkedRecords
          .filter((r) => r.id !== targetUid)
          .map((r) => doc(db, "users", r.id));

        await runTransaction(db, async (tx) => {
          // 1. All reads first
          const primarySnap = await tx.get(primaryRef);
          if (!primarySnap.exists()) throw new Error("Primary customer account not found.");
          const primaryCurBal = Number(primarySnap.data().walletBalance || 0);

          const secSnaps = await Promise.all(secondaryRefs.map((ref) => tx.get(ref)));

          // 2. All writes after
          tx.update(primaryRef, {
            walletBalance: amt,
            updatedAt: serverTimestamp(),
          });

          const primTxnRef = doc(collection(db, "walletTransactions"));
          tx.set(primTxnRef, {
            userId: targetUid,
            amount: amt - primaryCurBal,
            type: "ADJUSTMENT",
            description: walletNote || `Admin set balance to ₹${amt}`,
            adminId: user?.uid || "admin",
            createdAt: serverTimestamp(),
          });

          for (let i = 0; i < secSnaps.length; i++) {
            const snap = secSnaps[i];
            if (snap.exists()) {
              const secCurBal = Number(snap.data().walletBalance || 0);
              if (secCurBal !== 0) {
                tx.update(secondaryRefs[i], {
                  walletBalance: 0,
                  updatedAt: serverTimestamp(),
                });

                const secTxnRef = doc(collection(db, "walletTransactions"));
                tx.set(secTxnRef, {
                  userId: secondaryRefs[i].id,
                  amount: -secCurBal,
                  type: "ADJUSTMENT",
                  description: `Duplicate account balance reset during balance set to ₹${amt}`,
                  adminId: user?.uid || "admin",
                  createdAt: serverTimestamp(),
                });
              }
            }
          }
        });

        addToast(`Customer wallet balance set to ₹${amt.toFixed(2)} successfully!`, "success");
      }

      setIsWalletModalOpen(false);
    } catch (err) {
      console.error("Wallet adjustment error:", err);
      addToast(`Wallet adjustment failed: ${err.message}`, "error");
    } finally {
      setIsProcessingWallet(false);
    }
  };

  // Consolidate Multiple Duplicate Accounts into Primary Account
  const handleConsolidateCustomerAccounts = async (customer) => {
    if (!customer?.records || customer.records.length < 2) {
      addToast("This customer does not have multiple accounts to consolidate.", "info");
      return;
    }

    const primaryRec = customer.records[0];
    const secondaryRecs = customer.records.slice(1);
    const primaryId = primaryRec.id;

    const confirmMerge = window.confirm(
      `Are you sure you want to consolidate ${customer.records.length} accounts for ${
        customer.canonicalName || customer.displayPhone
      }?\n\n` +
      `This will transfer all wallet balances from duplicate accounts into Primary Account (${primaryId}) and link them permanently.`
    );
    if (!confirmMerge) return;

    setIsConsolidating(true);
    try {
      if (isMockMode) {
        let totalTransferred = 0;
        for (const r of secondaryRecs) {
          totalTransferred += Number(r.walletBalance || 0);
        }
        setRawCustomers((prev) =>
          prev.map((c) => {
            if (c.id === primaryId) {
              return { ...c, walletBalance: (c.walletBalance || 0) + totalTransferred };
            }
            if (secondaryRecs.some((s) => s.id === c.id)) {
              return { ...c, walletBalance: 0, isDuplicateAccount: true, mergedIntoUid: primaryId };
            }
            return c;
          })
        );
        addToast(
          `Successfully consolidated accounts! Transferred ₹${totalTransferred.toFixed(2)} to Primary Account.`,
          "success"
        );
        return;
      }

      const primaryRef = doc(db, "users", primaryId);
      const secondaryRefs = secondaryRecs.map((r) => doc(db, "users", r.id));

      let totalTransferred = 0;

      await runTransaction(db, async (tx) => {
        // 1. All reads first
        const primarySnap = await tx.get(primaryRef);
        if (!primarySnap.exists()) throw new Error("Primary customer account not found.");

        const secSnaps = await Promise.all(secondaryRefs.map((r) => tx.get(r)));

        const curPrimaryBal = Number(primarySnap.data().walletBalance || 0);

        for (let i = 0; i < secSnaps.length; i++) {
          const snap = secSnaps[i];
          if (snap.exists()) {
            const bal = Number(snap.data().walletBalance || 0);
            if (bal > 0) {
              totalTransferred += bal;
            }
          }
        }

        // 2. All writes after
        const newPrimaryBal = curPrimaryBal + totalTransferred;
        tx.update(primaryRef, {
          walletBalance: newPrimaryBal,
          consolidatedUids: customer.linkedUids,
          updatedAt: serverTimestamp(),
        });

        // Update secondary accounts
        for (let i = 0; i < secSnaps.length; i++) {
          const snap = secSnaps[i];
          const secId = secondaryRecs[i].id;
          if (snap.exists()) {
            const bal = Number(snap.data().walletBalance || 0);
            tx.update(secondaryRefs[i], {
              walletBalance: 0,
              isDuplicateAccount: true,
              mergedIntoUid: primaryId,
              mergedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            if (bal > 0) {
              const secTxnRef = doc(collection(db, "walletTransactions"));
              tx.set(secTxnRef, {
                userId: secId,
                amount: -bal,
                type: "CONSOLIDATION_DEBIT",
                description: `Balance transferred to primary account ${primaryId}`,
                adminId: user?.uid || "admin",
                createdAt: serverTimestamp(),
              });
            }
          }
        }

        if (totalTransferred > 0) {
          const primTxnRef = doc(collection(db, "walletTransactions"));
          tx.set(primTxnRef, {
            userId: primaryId,
            amount: totalTransferred,
            type: "CONSOLIDATION_CREDIT",
            description: `Consolidated balance from ${secondaryRecs.length} duplicate account(s)`,
            adminId: user?.uid || "admin",
            createdAt: serverTimestamp(),
          });
        }
      });

      addToast(
        `Successfully consolidated accounts! Transferred ₹${totalTransferred.toFixed(2)} to Primary Account.`,
        "success"
      );
    } catch (err) {
      console.error("Account consolidation error:", err);
      addToast(`Consolidation failed: ${err.message}`, "error");
    } finally {
      setIsConsolidating(false);
    }
  };

  // Open Edit Customer Modal
  const handleOpenEditModal = (customer) => {
    setEditCustomer(customer);
    setEditName(customer.canonicalName || "");
    setEditEmail(customer.canonicalEmail || "");
    setEditPhone(customer.canonicalPhone || "");
    const codBlocked = getCodBlock(customer).blocked;
    setEditCodBlocked(codBlocked);
    setEditCodWasBlocked(codBlocked);
    setEditIsActive(customer.isActive !== false);
    setIsEditModalOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      addToast("Customer name is required", "error");
      return;
    }

    const payload = {
      name: editName.trim(),
      displayName: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      mobileNumber: editPhone.trim(),
      isActive: editIsActive,
      ...(editCodBlocked !== editCodWasBlocked ? codBlockPayload(editCodBlocked) : {}),
    };

    if (isMockMode) {
      setRawCustomers((prev) =>
        prev.map((c) => (c.id === editCustomer.id ? { ...c, ...payload } : c))
      );
      addToast("Customer updated successfully", "success");
      setIsEditModalOpen(false);
      return;
    }

    try {
      await updateDoc(doc(db, "users", editCustomer.id), payload);
      addToast("Customer details updated successfully", "success");
      setIsEditModalOpen(false);
    } catch (err) {
      addToast(`Failed to update customer: ${err.message}`, "error");
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredCustomers.length === 0) {
      addToast("No customer records to export.", "warning");
      return;
    }

    const headers = [
      "Customer Name",
      "Mobile Number",
      "Email Address",
      "Wallet Balance (INR)",
      "Total Orders",
      "Total Spent (INR)",
      "Account Status",
      "COD Status",
      "Merged Accounts Count",
      "Created Date",
      "Primary User ID",
    ];

    const rows = filteredCustomers.map((c) => [
      `"${(c.canonicalName || "").replace(/"/g, '""')}"`,
      `"${c.canonicalPhone || ""}"`,
      `"${c.canonicalEmail || ""}"`,
      (c.walletBalance || 0).toFixed(2),
      c.totalOrders || 0,
      (c.totalSpent || 0).toFixed(2),
      c.isActive !== false ? "Active" : "Suspended",
      getCodBlock(c).blocked ? "COD Blocked" : "COD Allowed",
      c.isMerged ? c.mergedCount : 1,
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "N/A",
      `"${c.id}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `HomeBites_Customers_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(`Exported ${filteredCustomers.length} customers to CSV!`, "success");
  };

  if (loading) {
    return <LoadingComponents.LoadingPage />;
  }

  // Filtered customer details calculations
  const customerAddresses = selectedCustomer
    ? addresses.filter((a) =>
        selectedCustomer.linkedUids
          ? selectedCustomer.linkedUids.includes(a.userId)
          : a.userId === selectedCustomer.id
      )
    : [];

  const customerReviews = selectedCustomer
    ? reviews.filter((r) =>
        selectedCustomer.linkedUids
          ? selectedCustomer.linkedUids.includes(r.customerId)
          : r.customerId === selectedCustomer.id
      )
    : [];

  const customerLogs = selectedCustomer
    ? auditLogs.filter(
        (l) =>
          selectedCustomer.linkedUids?.includes(l.uid) ||
          l.email === selectedCustomer.canonicalEmail
      )
    : [];

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#f9f9ff] flex flex-col gap-6 relative">
      {/* Top Header & Export Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#151c27] flex items-center gap-2">
            <span>Customer Directory</span>
            {kpis.mergedCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                {kpis.mergedCount} Merged
              </span>
            )}
          </h1>
          <p className="text-sm text-[#555f6f] mt-1">
            Manage profiles, real-time wallets, cash-on-delivery access, and deduplicated identities.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportCsv}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-[#dce2f3] hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs shadow-2xs transition active:scale-95"
            title="Download CSV report of current view"
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-600">download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Customers */}
        <div className="bg-white p-4 rounded-xl border border-[#dce2f3] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Customers</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">groups</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{kpis.totalCustomers}</span>
            {kpis.rawProfilesCount > kpis.totalCustomers && (
              <span className="text-[11px] text-slate-400 font-semibold" title="Raw user records merged">
                ({kpis.rawProfilesCount} profiles)
              </span>
            )}
          </div>
        </div>

        {/* Total Wallet Liability */}
        <div className="bg-white p-4 rounded-xl border border-[#dce2f3] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Wallet Balance</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">account_balance_wallet</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-700">
              ₹{kpis.totalWalletLiability.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Funded Wallets */}
        <div className="bg-white p-4 rounded-xl border border-[#dce2f3] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Funded Wallets</span>
            <span className="material-symbols-outlined text-teal-600 text-[20px]">savings</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{kpis.fundedWalletsCount}</span>
            <span className="text-[11px] text-emerald-700 font-semibold">Active balances</span>
          </div>
        </div>

        {/* Active Accounts */}
        <div className="bg-white p-4 rounded-xl border border-[#dce2f3] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Active Customers</span>
            <span className="material-symbols-outlined text-green-600 text-[20px]">verified_user</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{kpis.activeCount}</span>
            <span className="text-[11px] text-slate-400 font-semibold">Verified</span>
          </div>
        </div>

        {/* COD Blocked */}
        <div className="bg-white p-4 rounded-xl border border-[#dce2f3] shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">COD Restricted</span>
            <span className="material-symbols-outlined text-rose-500 text-[20px]">block</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-700">{kpis.codBlockedCount}</span>
            <span className="text-[11px] text-rose-600 font-semibold">Under 24h hold</span>
          </div>
        </div>
      </div>

      {/* Main Container: Directory + Customer Slide-over Panel */}
      <div className="flex gap-6 items-start">
        {/* Customer Directory Table Section */}
        <div className="flex-1 bg-white border border-[#dce2f3] rounded-2xl shadow-xs overflow-hidden flex flex-col min-w-0">
          {/* Controls Bar: Search & Status Filter Chips */}
          <div className="p-4 md:p-5 border-b border-[#dce2f3] bg-[#f9f9ff] flex flex-col md:flex-row md:items-center justify-between gap-3.5">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-[#d3daea] rounded-xl focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/15 transition-all text-xs text-slate-900 placeholder:text-slate-400 font-medium outline-none shadow-2xs"
                placeholder="Search real name, 10-digit phone, email, UID..."
                type="text"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="Clear search"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === "all"
                    ? "bg-[#10b981] text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-[#dce2f3] hover:bg-slate-50"
                }`}
              >
                All ({consolidatedCustomers.length})
              </button>
              <button
                onClick={() => setStatusFilter("with_wallet")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === "with_wallet"
                    ? "bg-[#10b981] text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-[#dce2f3] hover:bg-slate-50"
                }`}
              >
                Has Balance ({kpis.fundedWalletsCount})
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === "active"
                    ? "bg-[#10b981] text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-[#dce2f3] hover:bg-slate-50"
                }`}
              >
                Active ({kpis.activeCount})
              </button>
              <button
                onClick={() => setStatusFilter("cod_blocked")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === "cod_blocked"
                    ? "bg-rose-600 text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-[#dce2f3] hover:bg-slate-50"
                }`}
              >
                COD Blocked ({kpis.codBlockedCount})
              </button>
              {kpis.mergedCount > 0 && (
                <button
                  onClick={() => setStatusFilter("merged")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    statusFilter === "merged"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-[#dce2f3] hover:bg-slate-50"
                  }`}
                >
                  Duplicates Merged ({kpis.mergedCount})
                </button>
              )}
            </div>
          </div>

          {/* Directory Table */}
          <div className="overflow-x-auto flex-1 min-h-[400px]">
            {filteredCustomers.length === 0 ? (
              <EmptyState
                title="No Customers Match Filter"
                description={
                  searchQuery
                    ? `No customers found matching "${searchQuery}". Check phone digits or name.`
                    : "There are no customers matching the selected category."
                }
                icon="person_search"
              />
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f0f3ff] border-b border-[#dce2f3] text-[11px] font-bold text-[#555f6f] uppercase tracking-wider">
                    <th className="py-3.5 px-5">Customer Identity</th>
                    <th className="py-3.5 px-5">Mobile & Contact</th>
                    <th className="py-3.5 px-5 text-right">Real-Time Wallet</th>
                    <th className="py-3.5 px-5">COD Eligibility</th>
                    <th className="py-3.5 px-5">Account Status</th>
                    <th className="py-3.5 px-5 text-center">Orders</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-xs text-slate-900 divide-y divide-[#dce2f3]/50">
                  {filteredCustomers.map((c) => {
                    const isActive = c.isActive !== false;
                    const cod = getCodBlock(c);
                    const isSelected = selectedCustomer?.id === c.id;
                    const initials =
                      c.canonicalName
                        ?.split(" ")
                        .filter(Boolean)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "CU";

                    return (
                      <tr
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setDrawerTab("orders");
                        }}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isSelected ? "bg-emerald-50/50 border-l-4 border-[#10b981]" : ""
                        }`}
                      >
                        {/* Customer Identity */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 truncate" title={c.canonicalName}>
                                  {c.canonicalName}
                                </span>
                                {c.isMerged && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    title={`Merged ${c.mergedCount} profiles sharing phone: ${c.displayPhone}`}
                                  >
                                    Merged ({c.mergedCount})
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block truncate" title={c.id}>
                                UID: {c.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Mobile & Contact */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-800 text-xs">
                              {c.displayPhone}
                            </span>
                            {c.canonicalPhone && (
                              <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <a
                                  href={`tel:${c.canonicalPhone.replace(/\D/g, "")}`}
                                  className="w-5 h-5 rounded hover:bg-emerald-50 text-emerald-700 flex items-center justify-center transition"
                                  title="Call customer"
                                >
                                  <span className="material-symbols-outlined text-[13px]">call</span>
                                </a>
                                <a
                                  href={`https://wa.me/91${c.normalizedPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-5 h-5 rounded hover:bg-green-50 text-green-700 flex items-center justify-center transition"
                                  title="Chat on WhatsApp"
                                >
                                  <span className="material-symbols-outlined text-[13px]">chat</span>
                                </a>
                              </div>
                            )}
                          </div>
                          {c.canonicalEmail ? (
                            <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                              {c.canonicalEmail}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No email linked</span>
                          )}
                        </td>

                        {/* Real-time Wallet Amount */}
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex flex-col items-end gap-1">
                            <span
                              className={`px-2.5 py-0.5 rounded-lg font-mono font-bold text-xs ${
                                (c.walletBalance || 0) > 0
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              ₹{(c.walletBalance || 0).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenWalletModal(c, "credit");
                              }}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-0.5"
                              title="Credit or adjust wallet balance"
                            >
                              <span className="material-symbols-outlined text-[13px]">add_circle</span>
                              Adjust
                            </button>
                          </div>
                        </td>

                        {/* COD Eligibility */}
                        <td className="py-3.5 px-5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              !cod.blocked
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${!cod.blocked ? "bg-emerald-500" : "bg-rose-500"}`}
                            />
                            {!cod.blocked ? "COD Allowed" : "COD Blocked"}
                          </span>
                          {cod.blocked && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                              {cod.reasonText} • {cod.remainingText}
                            </p>
                          )}
                        </td>

                        {/* Account Status */}
                        <td className="py-3.5 px-5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              isActive
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`} />
                            {isActive ? "Active" : "Suspended"}
                          </span>
                        </td>

                        {/* Total Orders */}
                        <td className="py-3.5 px-5 text-center font-bold text-slate-800">
                          {c.totalOrders || 0}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditModal(c)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
                              title="Edit Customer"
                            >
                              <span className="material-symbols-outlined text-[17px]">edit</span>
                            </button>
                            <button
                              onClick={() => handleToggleCodBlock(c)}
                              className={`p-1.5 rounded-lg transition ${
                                cod.blocked
                                  ? "text-rose-600 hover:bg-rose-50"
                                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              }`}
                              title={cod.blocked ? "Release COD Restriction" : "Block Cash On Delivery"}
                            >
                              <span className="material-symbols-outlined text-[17px]">
                                {cod.blocked ? "lock_open" : "lock"}
                              </span>
                            </button>
                            <button
                              onClick={() => handleToggleSuspend(c)}
                              className={`p-1.5 rounded-lg transition ${
                                isActive
                                  ? "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  : "text-amber-600 hover:bg-amber-50"
                              }`}
                              title={isActive ? "Suspend Customer Account" : "Activate Customer Account"}
                            >
                              <span className="material-symbols-outlined text-[17px]">
                                {isActive ? "block" : "check_circle"}
                              </span>
                            </button>
                            <button
                              onClick={() => handleDeleteCustomer(c)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                              title="Delete Customer Account"
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
            )}
          </div>
        </div>

        {/* 360 Customer Detail Slide-Over / Panel */}
        {selectedCustomer && (
          <aside className="w-full lg:w-[420px] bg-white border border-[#dce2f3] rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#dce2f3] bg-[#f9f9ff] flex justify-between items-start">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                  {selectedCustomer.canonicalName
                    ?.split(" ")
                    .filter(Boolean)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "CU"}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-slate-900 truncate">
                    {selectedCustomer.canonicalName}
                  </h3>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">{selectedCustomer.displayPhone}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
                title="Close Profile"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Quick Balance & Contact Actions Banner */}
            <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                  Wallet Balance
                </span>
                <span className="text-xl font-black text-emerald-800">
                  ₹{(selectedCustomer.walletBalance || 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenWalletModal(selectedCustomer, "credit")}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[15px]">add_card</span>
                  <span>Top-up</span>
                </button>
                {selectedCustomer.canonicalPhone && (
                  <a
                    href={`https://wa.me/91${selectedCustomer.normalizedPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-white border border-green-200 text-green-700 hover:bg-green-50 rounded-xl shadow-2xs transition"
                    title="WhatsApp"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                  </a>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#dce2f3] bg-white text-xs font-bold text-slate-600 overflow-x-auto">
              <button
                onClick={() => setDrawerTab("orders")}
                className={`flex-1 py-3 px-3 text-center border-b-2 transition whitespace-nowrap ${
                  drawerTab === "orders"
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Orders ({selectedCustomer.totalOrders || 0})
              </button>
              <button
                onClick={() => setDrawerTab("wallet")}
                className={`flex-1 py-3 px-3 text-center border-b-2 transition whitespace-nowrap ${
                  drawerTab === "wallet"
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Wallet & Funds
              </button>
              <button
                onClick={() => setDrawerTab("addresses")}
                className={`flex-1 py-3 px-3 text-center border-b-2 transition whitespace-nowrap ${
                  drawerTab === "addresses"
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Addresses ({customerAddresses.length})
              </button>
              {selectedCustomer.isMerged && (
                <button
                  onClick={() => setDrawerTab("merged")}
                  className={`flex-1 py-3 px-3 text-center border-b-2 transition whitespace-nowrap ${
                    drawerTab === "merged"
                      ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
                      : "border-transparent hover:text-slate-900"
                  }`}
                >
                  Merged ({selectedCustomer.mergedCount})
                </button>
              )}
              <button
                onClick={() => setDrawerTab("security")}
                className={`flex-1 py-3 px-3 text-center border-b-2 transition whitespace-nowrap ${
                  drawerTab === "security"
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                Security
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4 max-h-[550px]">
              {/* Tab 1: Orders */}
              {drawerTab === "orders" && (
                <div className="space-y-3">
                  {customerOrdersLoading ? (
                    <div className="py-8 flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent"></div>
                    </div>
                  ) : customerOrdersError ? (
                    <p className="text-xs text-rose-500 text-center py-4">Failed to load order history.</p>
                  ) : customerOrders.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">No previous orders placed.</p>
                  ) : (
                    customerOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs"
                      >
                        <div className="flex justify-between items-center font-bold">
                          <span className="font-mono text-emerald-700">#{ord.id}</span>
                          <span className="font-black text-slate-900">₹{ord.totalAmount || ord.total || 0}</span>
                        </div>
                        <p className="text-slate-600 text-[11px] line-clamp-1">{ord.itemsText || "Food order"}</p>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-200/50">
                          <span>{ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : "Recent"}</span>
                          <span className="px-2 py-0.5 rounded font-bold uppercase bg-slate-200 text-slate-700">
                            {ord.status || "Completed"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Wallet & Funds */}
              {drawerTab === "wallet" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Available Balance</span>
                      <span className="text-base font-black text-emerald-700">
                        ₹{(selectedCustomer.walletBalance || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                      <span className="text-slate-500 font-semibold">Total Spent on Food</span>
                      <span className="font-bold text-slate-900">
                        ₹{(selectedCustomer.totalSpent || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenWalletModal(selectedCustomer, "credit")}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-2xs transition flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    <span>Credit / Debit Customer Wallet</span>
                  </button>
                </div>
              )}

              {/* Tab 3: Saved Addresses */}
              {drawerTab === "addresses" && (
                <div className="space-y-3">
                  {customerAddresses.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">No saved addresses on file.</p>
                  ) : (
                    customerAddresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1"
                      >
                        <div className="flex justify-between items-center font-bold text-slate-800">
                          <span className="capitalize">{addr.label || "Delivery Location"}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{addr.pincode}</span>
                        </div>
                        <p className="text-slate-600 text-[11px]">
                          {[addr.houseNumber, addr.street, addr.landmark, addr.city].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 4: Merged Profiles Audit */}
              {drawerTab === "merged" && selectedCustomer.isMerged && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <span className="material-symbols-outlined text-[16px]">group_work</span>
                      {selectedCustomer.mergedCount} Accounts Linked to {selectedCustomer.displayPhone}
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      These profiles were created separately (e.g. Email & Password login vs. Phone OTP login) with the same mobile number.
                    </p>
                  </div>

                  {/* Consolidate Wallets Card */}
                  {(() => {
                    const secondaryBal = (selectedCustomer.records?.slice(1) || []).reduce(
                      (sum, r) => sum + Number(r.walletBalance || 0),
                      0
                    );
                    return (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-emerald-600 text-[16px]">call_merge</span>
                              Wallet Consolidation
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {secondaryBal > 0
                                ? `₹${secondaryBal.toFixed(2)} is held in duplicate accounts. Consolidate to Primary to prevent login balance discrepancies.`
                                : "All duplicate account balances are already ₹0.00."}
                            </p>
                          </div>
                          {secondaryBal > 0 && (
                            <button
                              type="button"
                              onClick={() => handleConsolidateCustomerAccounts(selectedCustomer)}
                              disabled={isConsolidating}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1 disabled:opacity-60 whitespace-nowrap"
                            >
                              {isConsolidating ? (
                                <>
                                  <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                                  Merging...
                                </>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-[14px]">merge</span>
                                  Consolidate
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Account List */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Linked Account Breakdown
                    </div>
                    {selectedCustomer.records?.map((rec, idx) => {
                      const isPrimary = idx === 0;
                      return (
                        <div
                          key={rec.id}
                          className={`p-3.5 rounded-xl border text-xs space-y-2 transition ${
                            isPrimary
                              ? "bg-emerald-50/40 border-emerald-200"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">
                                Account #{idx + 1}
                              </span>
                              {isPrimary ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Primary
                                </span>
                              ) : rec.isDuplicateAccount || rec.mergedIntoUid ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  Merged Duplicate
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Duplicate
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-emerald-700 text-xs">
                              ₹{(rec.walletBalance || 0).toFixed(2)}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                            <div>
                              <span className="text-slate-400">UID:</span>{" "}
                              <span className="font-mono text-slate-700">{rec.id.slice(0, 12)}...</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Email:</span>{" "}
                              <span className="text-slate-700 truncate">{rec.email || "None"}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Phone:</span>{" "}
                              <span className="text-slate-700">{rec.phone || rec.mobileNumber || "None"}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Created:</span>{" "}
                              <span className="text-slate-700">
                                {rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 5: Account Controls & Security */}
              {drawerTab === "security" && (
                <div className="space-y-4">
                  {/* COD Block Widget */}
                  {(() => {
                    const cod = getCodBlock(selectedCustomer);
                    return (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2.5">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-700">Cash on Delivery</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              cod.blocked ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {cod.blocked ? "Blocked" : "Allowed"}
                          </span>
                        </div>
                        {cod.blocked && (
                          <p className="text-[11px] text-rose-600">
                            {cod.reasonText} • {cod.remainingText}
                          </p>
                        )}
                        <button
                          onClick={() => handleToggleCodBlock(selectedCustomer)}
                          className={`w-full py-2 rounded-lg font-bold text-xs transition border ${
                            cod.blocked
                              ? "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              : "bg-white border-rose-300 text-rose-700 hover:bg-rose-50"
                          }`}
                        >
                          {cod.blocked ? "Release COD Restriction Now" : `Block COD for ${COD_BLOCK_HOURS} Hours`}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Account Status Switch */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-800">Account Standing</p>
                      <p className="text-[11px] text-slate-500">
                        {selectedCustomer.isActive !== false ? "Active and permitted" : "Currently suspended"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleSuspend(selectedCustomer)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                        selectedCustomer.isActive !== false
                          ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                          : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      }`}
                    >
                      {selectedCustomer.isActive !== false ? "Suspend" : "Activate"}
                    </button>
                  </div>

                  {/* Soft Delete */}
                  <div className="pt-2">
                    <button
                      onClick={() => handleDeleteCustomer(selectedCustomer)}
                      className="w-full py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-xs transition"
                    >
                      Soft Delete Customer Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Quick Wallet Credit / Debit Modal */}
      {isWalletModalOpen && walletTargetCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-200 bg-[#f9f9ff] flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-slate-900">Adjust Customer Wallet</h3>
                <p className="text-xs text-slate-500 mt-0.5">{walletTargetCustomer.canonicalName}</p>
              </div>
              <button
                onClick={() => setIsWalletModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleProcessWalletAdjustment} className="p-5 space-y-4 text-xs">
              {/* Current Balance Display */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                <span className="font-semibold text-emerald-900">Current Wallet Balance</span>
                <span className="font-black text-emerald-800 text-base">
                  ₹{(walletTargetCustomer.walletBalance || 0).toFixed(2)}
                </span>
              </div>

              {/* Multi-Account Notice */}
              {walletTargetCustomer.isMerged && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <span className="material-symbols-outlined text-[15px]">group_work</span>
                    Multi-Account Notice ({walletTargetCustomer.mergedCount} linked profiles)
                  </div>
                  <p className="text-slate-600">
                    {walletActionType === "debit"
                      ? "Debit will automatically deduct across all linked accounts with active balances."
                      : walletActionType === "set"
                      ? "Target balance will be applied to the primary account and duplicate accounts will be set to ₹0."
                      : "Credit will be applied to the primary customer account."}
                  </p>
                </div>
              )}

              {/* Mode Selector */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Action Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setWalletActionType("credit")}
                    className={`py-2 rounded-lg font-bold text-xs transition ${
                      walletActionType === "credit"
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Credit (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletActionType("debit")}
                    className={`py-2 rounded-lg font-bold text-xs transition ${
                      walletActionType === "debit"
                        ? "bg-rose-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Debit (-)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletActionType("set")}
                    className={`py-2 rounded-lg font-bold text-xs transition ${
                      walletActionType === "set"
                        ? "bg-slate-800 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Set Balance
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="any"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    placeholder="e.g. 150"
                    required
                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-slate-900 font-bold text-sm outline-none transition"
                  />
                </div>

                {/* Preset Chips */}
                <div className="flex gap-2 mt-2">
                  {[50, 100, 200, 500].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setWalletAmount(val.toString())}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-lg text-xs font-bold transition"
                    >
                      +₹{val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason / Note */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Reason / Note
                </label>
                <input
                  type="text"
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  placeholder="e.g. Customer support resolution, promotional credit"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-slate-900 text-xs outline-none transition"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsWalletModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingWallet}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold shadow-2xs transition disabled:opacity-50"
                >
                  {isProcessingWallet ? "Processing..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && editCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-200 bg-[#f9f9ff] flex justify-between items-center">
              <h3 className="font-bold text-base text-slate-900">Edit Customer Information</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Full Real Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Ramesh Varma"
                  required
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-slate-900 text-xs font-semibold outline-none transition"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-slate-900 text-xs font-semibold outline-none transition"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-slate-900 text-xs font-semibold outline-none transition"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">Block Cash On Delivery</p>
                    <p className="text-[10px] text-slate-400">
                      {editCodWasBlocked
                        ? "Currently blocked. Toggling off unblocks immediately."
                        : `Toggling on blocks COD for ${COD_BLOCK_HOURS} hours.`}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editCodBlocked}
                      onChange={(e) => setEditCodBlocked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">Account Active</p>
                    <p className="text-[10px] text-slate-400">Allow access to HomeBites ordering services</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold shadow-2xs transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
