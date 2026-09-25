import React, { useState, useEffect, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { functions, db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { uploadFile } from "../firebase/storage";
import { notificationRepository } from "../repositories";
import DestinationSelector, { parseDestination, buildRedirectUrl } from "../components/DestinationSelector";

const PRESET_TEMPLATES = [
  {
    id: "lunch_biryani",
    category: "lunch",
    title: "వేడి వేడి బిర్యానీ రెడీ! 🍲",
    message: "Hungry? Piping hot authentic home-style biryani is waiting for you! Order now before lunch rush.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "lunch_telugu_general",
    category: "lunch",
    title: "మధ్యాహ్న భోజనం సమయం అయింది! 😋",
    message: "Fresh, healthy, home-cooked meals delivered right to your doorstep. What's on your plate today?",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "dinner_comfort",
    category: "dinner",
    title: "రాత్రికి వంట చేసే మూడ్ లేదా? 🌙",
    message: "Relax after a long day! Delicious, homely dinner is just a tap away. Order hot rotis & curries.",
    deepLink: "menu",
    audience: "all",
  },
  {
    id: "evening_snacks",
    category: "curiosity",
    title: "చల్లని సాయంత్రం.. వేడి వేడి స్నాక్స్! ☕",
    message: "Craving crispy samosas or hot pakoras with your evening chai? Treat yourself to fresh snacks!",
    deepLink: "menu",
    audience: "active_30_days",
  },
  {
    id: "weekend_feast",
    category: "weekend",
    title: "ఇవాళ సండే స్పెషల్ దావత్! 🎉",
    message: "Weekend calls for special food with family! Check out today's chef specials and weekend feasts.",
    deepLink: "offers",
    audience: "all",
  },
  {
    id: "veg_special",
    category: "offer",
    title: "రుచికరమైన ప్యూర్ వెజ్ వంటకాలు 🌿",
    message: "Wholesome sattvic & home-style vegetarian delicacies crafted with pure ingredients.",
    deepLink: "diet_veg",
    audience: "veg_lovers",
  },
  {
    id: "wallet_cashback",
    category: "offer",
    title: "మీ వాలెట్‌లో ఆఫర్ ఉంది! 💰",
    message: "Use your wallet balance or enjoy special discounts on your next delicious home-style meal.",
    deepLink: "wallet",
    audience: "with_offers",
  },
];

const EMOJI_PICKER = ["🍲", "😋", "🍗", "🌿", "🌙", "🎉", "💰", "☕", "🔥", "❤️", "🍛", "🛵"];

export default function PushCampaigns() {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("lunch");
  const [audience, setAudience] = useState("all");
  const [destinationType, setDestinationType] = useState("category");
  const [destinationId, setDestinationId] = useState("");
  const [deepLink, setDeepLink] = useState("menu");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sendMode, setSendMode] = useState("now"); // 'now' | 'schedule'
  const [scheduledAt, setScheduledAt] = useState("");
  const [overrideQuietHours, setOverrideQuietHours] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all"); // 'all' | 'sent' | 'draft' | 'scheduled'
  const [historySearch, setHistorySearch] = useState("");

  // Clock & Quiet Hours calculation (IST = UTC + 5:30)
  const [currentIst, setCurrentIst] = useState({ timeStr: "", isQuiet: false, hour: 12 });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const utcMs = now.getTime();
      const istDate = new Date(utcMs + 5.5 * 3600000);
      const hours = istDate.getUTCHours();
      const minutes = istDate.getUTCMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = (hours % 12 || 12).toString().padStart(2, "0");
      const isQuiet = hours >= 22 || hours < 8; // 10 PM - 8 AM IST
      setCurrentIst({
        timeStr: `${displayHours}:${minutes} ${ampm} IST`,
        isQuiet,
        hour: hours,
      });
    };

    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, []);

  const LOCAL_CAMPAIGNS_KEY = "homebites_engagement_campaigns";

  const loadLocalCampaigns = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CAMPAIGNS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalCampaign = (campaign) => {
    try {
      const existing = loadLocalCampaigns();
      const filtered = existing.filter((c) => c.id !== campaign.id);
      const updated = [campaign, ...filtered];
      localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(updated));
      return updated;
    } catch {
      return [];
    }
  };

  // Fetch campaigns from remote Firestore or callable
  const fetchCampaigns = async (silent = false) => {
    if (!silent) setLoading(true);
    const local = loadLocalCampaigns();
    setCampaigns(local);

    try {
      let remote = null;
      try {
        const fn = httpsCallable(functions, "listEngagementCampaigns");
        const res = await fn();
        if (res.data && res.data.campaigns) {
          remote = res.data.campaigns;
        }
      } catch (fnErr) {
        if (db) {
          const snap = await getDocs(collection(db, "engagementCampaigns"));
          remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
      }

      if (remote) {
        remote.sort((a, b) => {
          const aTs = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const bTs = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return bTs - aTs;
        });

        // Merge remote records with only genuine un-sent local drafts
        const merged = [...remote];
        for (const loc of local) {
          if (!remote.some((r) => r.id === loc.id) && loc.id.startsWith("camp_") && loc.isLocalDraft) {
            merged.push(loc);
          }
        }
        setCampaigns(merged);
        localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(merged));
      }
    } catch (err) {
      if (!silent) console.warn("Could not sync remote campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns(true);
  }, []);

  const handleApplyPreset = (preset) => {
    setTitle(preset.title);
    setMessage(preset.message);
    setCategory(preset.category);
    setAudience(preset.audience || "all");
    const dest = parseDestination("", "", preset.deepLink || "menu");
    setDestinationType(dest.destinationType);
    setDestinationId(dest.destinationId);
    setDeepLink(preset.deepLink || buildRedirectUrl(dest.destinationType, dest.destinationId));
    addToast(`Template applied: "${preset.title}"`, "info");
  };

  const handleInsertEmoji = (emoji) => {
    setMessage((prev) => prev + emoji);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast("Please select a JPEG, PNG, or WebP image.", "error");
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      addToast("Image must be 2 MB or smaller.", "error");
      return;
    }

    setImageFile(file);
    const localUrl = URL.createObjectURL(file);
    setImagePreview(localUrl);

    setUploadingImage(true);
    setUploadProgress(10);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `uploads/push_campaigns/${Date.now()}_${cleanName}`;
      const downloadUrl = await uploadFile(file, path);
      setImageUrl(downloadUrl);
      setUploadProgress(100);
      addToast("Banner image uploaded successfully!", "success");
    } catch (err) {
      console.error("Image upload failed:", err);
      addToast("Failed to upload image. Please try again.", "error");
      setImagePreview("");
      setImageFile(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview("");
    setImageUrl("");
    setUploadProgress(0);
  };

  // Submit & Dispatch Campaign
  const handleSubmitCampaign = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast("Please enter a campaign title.", "error");
      return;
    }
    if (!message.trim()) {
      addToast("Please enter message content.", "error");
      return;
    }

    const sendNow = sendMode === "now";

    if (sendNow && currentIst.isQuiet && !overrideQuietHours) {
      const confirmOverride = window.confirm(
        `It is currently Quiet Hours (${currentIst.timeStr}). Are you sure you want to send this push notification to customers right now?`
      );
      if (!confirmOverride) return;
    }

    setSubmitting(true);
    const canonicalDeepLink = deepLink || buildRedirectUrl(destinationType, destinationId);

    const payload = {
      title: title.trim(),
      message: message.trim(),
      category,
      audience,
      destinationType,
      destinationId: destinationId || "",
      deepLink: canonicalDeepLink,
      imageUrl: imageUrl || null,
      scheduledAt: !sendNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      overrideQuietHours: overrideQuietHours || (sendNow && currentIst.isQuiet),
      overrideCooldown: true,
      sendNow,
    };

    try {
      const fn = httpsCallable(functions, "createEngagementCampaign");
      const res = await fn(payload);
      if (res.data?.ok) {
        const sent = res.data.execution?.stats?.sent || 0;
        const suppressed = res.data.execution?.stats?.suppressed || 0;
        if (sendNow) {
          if (sent > 0) {
            addToast(`Push delivered quickly to ${sent} eligible customer${sent > 1 ? "s" : ""}!`, "success");
          } else {
            addToast(`Push processed (${suppressed} suppressed by active order / cooldown).`, "info");
          }
        } else {
          addToast("Campaign scheduled successfully!", "success");
        }
        await fetchCampaigns(false);
      } else {
        throw new Error(res.data?.execution?.error || "Failed to process campaign");
      }
    } catch (err) {
      if (sendNow) {
        // Direct FCM topic broadcast fallback
        try {
          const topicTarget = payload.audience === "partners" ? "all_partners" : "all";
          await notificationRepository.create({
            userId: topicTarget,
            audience: payload.audience === "partners" ? "partners" : "customers",
            type: payload.category === "offer" ? "offer" : "marketing",
            title: payload.title,
            message: payload.message,
            imageUrl: payload.imageUrl || null,
            deepLink: canonicalDeepLink,
            isRead: false,
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: user?.uid || "admin",
            source: "admin_campaign_broadcast",
          });

          addToast("Push notification broadcast sent quickly to all customers via FCM!", "success");
          await fetchCampaigns(false);
          return;
        } catch (directErr) {
          console.error("Direct broadcast fallback error:", directErr);
        }
      }

      addToast(err.message || "Failed to submit campaign.", "error");
    } finally {
      setTitle("");
      setMessage("");
      setImageUrl("");
      setImageFile(null);
      setImagePreview("");
      setScheduledAt("");
      setSendMode("now");
      setSubmitting(false);
    }
  };

  // Trigger Send for a draft or existing campaign
  const handleTriggerSend = async (campaign) => {
    const campaignId = typeof campaign === "string" ? campaign : campaign.id;
    const isLocal = typeof campaign === "object" ? Boolean(campaign.isLocalDraft) : campaignId.startsWith("camp_");
    const campObj = typeof campaign === "object" ? campaign : loadLocalCampaigns().find((c) => c.id === campaignId);

    setSubmitting(true);
    try {
      let sentSuccess = false;
      try {
        if (isLocal && campObj) {
          const fn = httpsCallable(functions, "createEngagementCampaign");
          const res = await fn({
            title: campObj.title,
            message: campObj.message,
            category: campObj.category,
            audience: campObj.audience,
            destinationType: campObj.destinationType,
            destinationId: campObj.destinationId,
            deepLink: campObj.deepLink,
            imageUrl: campObj.imageUrl || null,
            sendNow: true,
            overrideQuietHours: true,
            overrideCooldown: true,
          });
          if (res.data?.ok) {
            sentSuccess = true;
            const existing = loadLocalCampaigns().filter((c) => c.id !== campaignId);
            localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(existing));
            addToast(`Push delivered to customers successfully!`, "success");
          }
        } else {
          const fn = httpsCallable(functions, "sendEngagementCampaign");
          const res = await fn({ campaignId, overrideQuietHours: true, overrideCooldown: true });
          if (res.data?.ok) {
            sentSuccess = true;
            addToast(`Push delivered to customers successfully!`, "success");
          }
        }
      } catch (fnErr) {
        console.warn("Backend function dispatch failed, using direct FCM broadcast fallback:", fnErr);
      }

      if (!sentSuccess && campObj) {
        const topicTarget = campObj.audience === "partners" ? "all_partners" : "all";
        await notificationRepository.create({
          userId: topicTarget,
          audience: campObj.audience === "partners" ? "partners" : "customers",
          type: campObj.category === "offer" ? "offer" : "marketing",
          title: campObj.title,
          message: campObj.message,
          imageUrl: campObj.imageUrl || null,
          deepLink: campObj.deepLink || "menu",
          isRead: false,
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: user?.uid || "admin",
          source: "admin_campaign_broadcast",
        });

        // Remove draft status locally
        const existing = loadLocalCampaigns().filter((c) => c.id !== campaignId);
        localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(existing));
        addToast("Push notification broadcast sent quickly to all customers via FCM!", "success");
      }

      await fetchCampaigns(false);
    } catch (err) {
      console.error("Trigger send error:", err);
      addToast(err.message || "Failed to send campaign.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Campaign cleanly everywhere
  const handleDeleteCampaign = async (campaignId) => {
    // 1. Instantly update local state & local storage
    const existing = loadLocalCampaigns();
    const updated = existing.filter((c) => c.id !== campaignId);
    localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(updated));
    setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));

    // 2. Direct Firestore deletion
    if (db && !campaignId.startsWith("camp_")) {
      try {
        await deleteDoc(doc(db, "engagementCampaigns", campaignId));
        await deleteDoc(doc(db, "notifications", campaignId));
      } catch (err) {
        console.warn("Direct Firestore campaign delete warning:", err);
      }
    }

    // 3. Callable Cloud Function deletion
    try {
      const fn = httpsCallable(functions, "deleteEngagementCampaign");
      await fn({ campaignId });
    } catch (_) {
      // Non-fatal if already deleted
    }

    addToast("Campaign deleted from history.", "info");
  };

  // Cancel Scheduled Campaign
  const handleCancelCampaign = async (campaignId) => {
    const existing = loadLocalCampaigns();
    const updated = existing.map((c) => (c.id === campaignId ? { ...c, status: "cancelled" } : c));
    localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(updated));
    setCampaigns(updated);

    try {
      const fn = httpsCallable(functions, "cancelScheduledCampaign");
      await fn({ campaignId });
    } catch {
      // Ignored
    }
    addToast("Campaign marked as cancelled.", "info");
  };

  // Clear Entire Notification & Campaign History
  const handleClearNotificationHistory = async () => {
    setClearingHistory(true);
    try {
      // 1. Instantly wipe local storage and UI table state
      localStorage.removeItem(LOCAL_CAMPAIGNS_KEY);
      setCampaigns([]);

      let deletedNotifs = 0;
      let deletedCamps = 0;

      // 2. Direct Firestore collections cleanup
      if (db) {
        try {
          const [notifsSnap, campsSnap] = await Promise.all([
            getDocs(collection(db, "notifications")),
            getDocs(collection(db, "engagementCampaigns")),
          ]);

          if (!notifsSnap.empty) {
            const batch = writeBatch(db);
            notifsSnap.docs.slice(0, 450).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            deletedNotifs = notifsSnap.size;
          }

          if (!campsSnap.empty) {
            const batch = writeBatch(db);
            campsSnap.docs.slice(0, 450).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            deletedCamps = campsSnap.size;
          }
        } catch (dbErr) {
          console.warn("Direct Firestore cleanup notice:", dbErr);
        }
      }

      // 3. Call backend Cloud Function clearNotificationHistory
      try {
        const fn = httpsCallable(functions, "clearNotificationHistory");
        const res = await fn();
        if (res.data?.ok) {
          deletedNotifs = Math.max(deletedNotifs, res.data.deletedCount || 0);
          deletedCamps = Math.max(deletedCamps, res.data.deletedCampaignsCount || 0);
        }
      } catch (fnErr) {
        console.warn("Cloud function clearNotificationHistory fallback notice:", fnErr);
      }

      setShowClearModal(false);
      addToast(
        `History cleared (${deletedNotifs} notifications & ${deletedCamps} campaigns removed).`,
        "success"
      );
    } catch (err) {
      console.error("Clear notification history error:", err);
      addToast(err.message || "Failed to clear notification history.", "error");
    } finally {
      setClearingHistory(false);
      await fetchCampaigns(true);
    }
  };

  // Discard all unsaved local drafts in one click
  const handleDiscardLocalDrafts = () => {
    const kept = campaigns.filter((c) => !c.isLocalDraft && !c.id.startsWith("camp_"));
    localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(kept));
    setCampaigns(kept);
    addToast("All local drafts discarded.", "info");
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const sentCampaigns = campaigns.filter((c) => c.status === "sent" || (!c.isLocalDraft && c.stats?.sent > 0));
    const totalSentCount = sentCampaigns.reduce((sum, c) => sum + (Number(c.stats?.sent) || 0), 0);
    const draftCount = campaigns.filter((c) => c.isLocalDraft || c.status === "draft").length;
    const scheduledCount = campaigns.filter((c) => c.status === "scheduled").length;

    return {
      totalCampaigns,
      sentCampaignsCount: sentCampaigns.length,
      totalSentCount,
      draftCount,
      scheduledCount,
    };
  }, [campaigns]);

  // Filtered Campaign History
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (historyFilter === "sent" && c.status !== "sent") return false;
      if (historyFilter === "draft" && !c.isLocalDraft && c.status !== "draft") return false;
      if (historyFilter === "scheduled" && c.status !== "scheduled") return false;

      if (historySearch) {
        const q = historySearch.toLowerCase();
        return (
          c.title?.toLowerCase().includes(q) ||
          c.message?.toLowerCase().includes(q) ||
          c.audience?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [campaigns, historyFilter, historySearch]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-xl shadow-sm">
              <span className="material-symbols-outlined text-[24px]">campaign</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Push Campaigns Command Center</h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
                Engage hungry customers with personalized Telugu & English notifications, deep links, and automated anti-spam guardrails.
              </p>
            </div>
          </div>
        </div>

        {/* Live IST Status & Anti-Spam Indicator */}
        <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Indian Standard Time</span>
            <span className="text-sm font-black text-slate-900">{currentIst.timeStr}</span>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              currentIst.isQuiet
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
            {currentIst.isQuiet ? "Quiet Hours (10PM-8AM)" : "Active Engagement Hours"}
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Campaigns</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">mark_email_read</span>
          </div>
          <span className="text-2xl font-black text-slate-900">{kpis.totalCampaigns}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Delivered Pushes</span>
            <span className="material-symbols-outlined text-teal-600 text-[20px]">send_and_archive</span>
          </div>
          <span className="text-2xl font-black text-emerald-700">{kpis.totalSentCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Drafts Pending</span>
            <span className="material-symbols-outlined text-amber-500 text-[20px]">drafts</span>
          </div>
          <span className="text-2xl font-black text-amber-700">{kpis.draftCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Scheduled</span>
            <span className="material-symbols-outlined text-blue-500 text-[20px]">schedule</span>
          </div>
          <span className="text-2xl font-black text-blue-700">{kpis.scheduledCount}</span>
        </div>
      </div>

      {/* Preset Quick Fill Pills Bar */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Quick Preset Templates (Telugu / English)
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {PRESET_TEMPLATES.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset)}
              className="px-3.5 py-2 bg-white hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition flex items-center gap-2 whitespace-nowrap shadow-2xs"
            >
              <span>{preset.title.slice(0, 20)}...</span>
              <span className="text-slate-400 font-normal capitalize">({preset.category})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Two-Column Layout: Composer + Live Smartphone Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Campaign Composer Form (7 Cols) */}
        <form
          onSubmit={handleSubmitCampaign}
          className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-bold text-base text-slate-900">Campaign Composer</h2>
            <span className="text-xs font-semibold text-slate-400">Supports Unicode, Telugu & Emojis</span>
          </div>

          {/* Title */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Notification Title *</label>
              <span className={`text-xs font-semibold ${title.length > 90 ? "text-rose-500" : "text-slate-400"}`}>
                {title.length}/100
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. వేడి వేడి బిర్యానీ రెడీ! 🍲 / Weekend Special Treat!"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 text-sm"
              maxLength={100}
            />
          </div>

          {/* Message Body with Quick Emoji Adder */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Message Content *</label>
              <span className={`text-xs font-semibold ${message.length > 450 ? "text-rose-500" : "text-slate-400"}`}>
                {message.length}/500
              </span>
            </div>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter engaging message copy in Telugu or English..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-medium text-slate-800 placeholder:text-slate-400 text-sm resize-none"
              maxLength={500}
            />

            {/* Quick Emoji Bar */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 mr-1">Quick Add:</span>
              {EMOJI_PICKER.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleInsertEmoji(emoji)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-base transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Category & Audience Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-semibold text-sm text-slate-800"
              >
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="weekend">Weekend Special</option>
                <option value="offer">Special Offer</option>
                <option value="curiosity">Curiosity / Snacks</option>
                <option value="reorder">Reorder Prompt</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Target Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#10b981] font-semibold text-sm text-slate-800"
              >
                <option value="all">All Customers</option>
                <option value="active_30_days">Active (Ordered in 30d)</option>
                <option value="inactive_7_days">Dormant (Inactive 7+ days)</option>
                <option value="inactive_30_days">Inactive (30+ days)</option>
                <option value="veg_lovers">Vegetarian Lovers</option>
                <option value="non_veg_lovers">Non-Veg Lovers</option>
                <option value="with_offers">With Wallet / Promo Offers</option>
              </select>
            </div>
          </div>

          {/* Destination / Deep Link Selector */}
          <DestinationSelector
            destinationType={destinationType}
            destinationId={destinationId}
            onChange={({ destinationType: dt, destinationId: di, redirectUrl: ru }) => {
              setDestinationType(dt);
              setDestinationId(di);
              setDeepLink(ru);
            }}
          />

          {/* Banner Image Uploader */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Notification Banner Image (Optional)
              </label>
              <span className="text-[11px] text-slate-400 font-medium">JPEG, PNG, WebP · Max 2 MB</span>
            </div>

            {imagePreview || imageUrl ? (
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-3">
                <div className="flex items-center gap-4">
                  <img
                    src={imagePreview || imageUrl}
                    alt="Upload Preview"
                    className="w-24 h-20 object-cover rounded-xl border border-slate-200 shadow-sm shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {imageFile ? imageFile.name : "Uploaded Banner Image"}
                    </p>
                    {uploadingImage ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 shrink-0">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-2">
                        <label className="cursor-pointer px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                          Change
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-200 hover:border-emerald-400 bg-slate-50/60 hover:bg-emerald-50/20 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition text-center group">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploadingImage}
                />
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                  <span className="material-symbols-outlined text-xl">add_photo_alternate</span>
                </div>
                <p className="text-xs font-bold text-slate-700">Click to upload campaign banner image</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Supports JPG, PNG, or WebP up to 2 MB</p>
              </label>
            )}
          </div>

          {/* Delivery Timing Mode */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "now"}
                  onChange={() => setSendMode("now")}
                  className="accent-[#10b981] w-4 h-4"
                />
                <span className="text-sm font-bold text-slate-800">Send Immediately</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "schedule"}
                  onChange={() => setSendMode("schedule")}
                  className="accent-[#10b981] w-4 h-4"
                />
                <span className="text-sm font-bold text-slate-800">Schedule for Later</span>
              </label>
            </div>

            {sendMode === "schedule" && (
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Dispatch Date & Time (IST)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-emerald-600 font-medium text-slate-900 text-xs outline-none"
                  required={sendMode === "schedule"}
                />
              </div>
            )}

            {currentIst.isQuiet && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                <input
                  type="checkbox"
                  id="overrideQuiet"
                  checked={overrideQuietHours}
                  onChange={(e) => setOverrideQuietHours(e.target.checked)}
                  className="accent-amber-600 w-4 h-4 rounded"
                />
                <label htmlFor="overrideQuiet" className="text-xs font-semibold text-amber-800 cursor-pointer">
                  Override Quiet Hours (Dispatch immediately despite 10 PM - 8 AM curfew)
                </label>
              </div>
            )}
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-2xs transition flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Dispatching Push...</span>
                </>
              ) : sendMode === "now" ? (
                <>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  <span>Publish & Send Push</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  <span>Schedule Push Campaign</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Smartphone Lock Screen Preview (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[340px] bg-slate-950 rounded-[44px] p-3.5 shadow-2xl border-4 border-slate-800">
            {/* Phone Speaker & Dynamic Island */}
            <div className="w-full flex justify-center mb-3">
              <div className="w-24 h-5 bg-black rounded-full flex items-center justify-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800"></div>
                <div className="w-2 h-2 rounded-full bg-slate-900"></div>
              </div>
            </div>

            {/* Simulated Phone Screen */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 rounded-[32px] p-4 text-white min-h-[480px] flex flex-col justify-between relative overflow-hidden shadow-inner">
              {/* Lock Screen Clock */}
              <div className="text-center pt-2 space-y-1">
                <div className="text-4xl font-light tracking-tight text-slate-100">
                  {currentIst.timeStr.split(" ")[0] || "12:00"}
                </div>
                <div className="text-xs font-medium text-slate-300">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </div>
              </div>

              {/* Notification Card */}
              <div className="my-auto">
                <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-lg border border-white/20 text-slate-900 space-y-2 transform transition-all">
                  {/* App Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-md bg-[#10b981] flex items-center justify-center text-white text-[11px] font-black">
                        H
                      </div>
                      <span className="text-[11px] font-black text-slate-800 tracking-wide uppercase">HomeBites</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">now</span>
                  </div>

                  {/* Title & Message */}
                  <div className="space-y-0.5">
                    <div className="text-xs font-black text-slate-900 leading-snug">
                      {title || "వేడి వేడి బిర్యానీ రెడీ! 🍲"}
                    </div>
                    <div className="text-xs text-slate-600 font-medium line-clamp-3 leading-relaxed">
                      {message || "Hungry? Piping hot authentic home-style food is waiting for you! Tap to order now."}
                    </div>
                  </div>

                  {/* Optional Image */}
                  {(imagePreview || imageUrl) && (
                    <div className="rounded-xl overflow-hidden mt-1 border border-slate-100 max-h-28">
                      <img
                        src={imagePreview || imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  {/* Deep Link indicator */}
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-bold">
                    <span>Tap opens:</span>
                    <span className="px-2 py-0.5 bg-emerald-50 text-[#10b981] rounded-full border border-emerald-100 uppercase tracking-wide">
                      {destinationType || "category"}
                      {destinationId ? ` (${destinationId})` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Home Indicator */}
              <div className="w-full flex justify-center pb-2">
                <div className="w-28 h-1 bg-white/40 rounded-full"></div>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 mt-2">Live Lockscreen Preview</span>
        </div>
      </div>

      {/* Campaign History & Performance Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#f9f9ff]">
          <div>
            <h2 className="font-bold text-base text-slate-900">Campaign History & Delivery Analytics</h2>
            <p className="text-xs text-slate-500 mt-0.5">Track delivered, scheduled, and suppressed push notifications</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {kpis.draftCount > 0 && (
              <button
                type="button"
                onClick={handleDiscardLocalDrafts}
                className="px-3 py-1.5 rounded-xl border border-amber-200 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 transition shadow-2xs"
                title="Discard all pending local drafts"
              >
                Discard Drafts ({kpis.draftCount})
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="px-3.5 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 flex items-center gap-1.5 transition shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">delete_sweep</span>
              Clear All History
            </button>

            <button
              onClick={() => fetchCampaigns(false)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 transition"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            <button
              onClick={() => setHistoryFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                historyFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({campaigns.length})
            </button>
            <button
              onClick={() => setHistoryFilter("sent")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                historyFilter === "sent" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Sent ({kpis.sentCampaignsCount})
            </button>
            <button
              onClick={() => setHistoryFilter("draft")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                historyFilter === "draft" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Drafts ({kpis.draftCount})
            </button>
            <button
              onClick={() => setHistoryFilter("scheduled")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                historyFilter === "scheduled" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Scheduled ({kpis.scheduledCount})
            </button>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search campaigns..."
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f0f3ff] text-[#555f6f] font-bold uppercase tracking-wider border-b border-[#dce2f3]">
              <tr>
                <th className="px-5 py-3.5">Campaign Info</th>
                <th className="px-5 py-3.5">Category & Audience</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Performance</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 font-semibold">
                    Loading campaigns...
                  </td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 font-semibold">
                    No campaigns found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900">{camp.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 max-w-sm">{camp.message}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">Route: /{camp.deepLink || "menu"}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold capitalize">
                          {camp.category}
                        </span>
                        <span className="text-[11px] text-slate-500 font-semibold capitalize">
                          {camp.audience?.replace(/_/g, " ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                          camp.isLocalDraft
                            ? "bg-amber-50 text-amber-900 border border-amber-300"
                            : camp.status === "sent"
                            ? "bg-emerald-100 text-emerald-800"
                            : camp.status === "scheduled"
                            ? "bg-blue-100 text-blue-800"
                            : camp.status === "cancelled"
                            ? "bg-slate-100 text-slate-500"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {camp.isLocalDraft ? "Local Draft" : camp.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {camp.stats ? (
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">
                            Sent: <span className="text-emerald-700 font-black">{camp.stats.sent || 0}</span> / {camp.stats.targeted || 0}
                          </div>
                          {camp.stats.suppressed > 0 && (
                            <div className="text-[10px] text-amber-700 font-medium">
                              Suppressed: {camp.stats.suppressed}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {camp.isLocalDraft ? "Draft not yet dispatched" : "Not dispatched"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      {(camp.status === "draft" || camp.isLocalDraft) && (
                        <button
                          onClick={() => handleTriggerSend(camp)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs"
                          title="Quickly send push notification to all users"
                        >
                          Send Now
                        </button>
                      )}
                      {camp.status === "scheduled" && (
                        <button
                          onClick={() => handleCancelCampaign(camp.id)}
                          className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg font-bold transition"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCampaign(camp.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded-lg font-semibold transition border border-slate-200"
                        title="Delete this campaign from history"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clear Notification History Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-slide-up">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <h3 className="font-bold text-lg text-slate-900">Clear Notification History?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              This will permanently delete all past notification logs and campaign records from the Admin dashboard and Firestore database.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={clearingHistory}
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearingHistory}
                onClick={handleClearNotificationHistory}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {clearingHistory ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Clear All History</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
