import React, { useState, useEffect, useMemo } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { uploadFile } from "../firebase/storage";
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

  // Clock & Quiet Hours calculation (IST = UTC + 5:30)
  const [currentIst, setCurrentIst] = useState({ timeStr: "", isQuiet: false, hour: 12 });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const utcMs = now.getTime();
      const istDate = new Date(utcMs + (5.5 * 3600000));
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

  // Fetch campaigns
  const fetchCampaigns = async (silent = true) => {
    setLoading(true);
    // 1. Immediately hydrate from local storage
    const local = loadLocalCampaigns();
    setCampaigns(local);

    // 2. Only query Cloud Function callable when explicitly requested (e.g. Refresh click)
    // to prevent unwanted CORS preflight errors in console while functions are pending deployment.
    if (!silent) {
      try {
        const fn = httpsCallable(getFunctions(), "listEngagementCampaigns");
        const res = await fn();
        if (res.data && res.data.campaigns) {
          const remote = res.data.campaigns;
          const merged = [...remote];
          for (const loc of local) {
            if (!remote.some((r) => r.id === loc.id)) {
              merged.push(loc);
            }
          }
          setCampaigns(merged);
          localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(merged));
        }
      } catch (err) {
        addToast("Cloud Functions are pending deployment. Displaying local campaigns.", "info");
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    // Hydrate locally on mount without firing remote preflights
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

    // Validate type (JPEG, PNG, WebP)
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast("Please select a JPEG, PNG, or WebP image.", "error");
      return;
    }

    // Validate size (max 2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      addToast("Image must be 2 MB or smaller.", "error");
      return;
    }

    setImageFile(file);
    const localUrl = URL.createObjectURL(file);
    setImagePreview(localUrl);

    // Upload to Firebase Storage under uploads/ (allowed by Storage rules)
    setUploadingImage(true);
    setUploadProgress(10);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `uploads/push_campaigns/${Date.now()}_${cleanName}`;
      const downloadUrl = await uploadFile(file, path);
      setImageUrl(downloadUrl);
      setUploadProgress(100);
      addToast("Banner image uploaded and ready for push campaign.", "success");
    } catch (err) {
      console.error("Image upload failed:", err);
      addToast(err.message || "Failed to upload image.", "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    if (imagePreview && imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview("");
    setImageUrl("");
  };

  const handleCreateOrSend = async (sendNow = false) => {
    if (!title.trim()) {
      addToast("Please enter a campaign title.", "error");
      return;
    }
    if (!message.trim()) {
      addToast("Please enter a campaign message.", "error");
      return;
    }

    if (sendNow && currentIst.isQuiet && !overrideQuietHours) {
      const confirmOverride = window.confirm(
        `It is currently Quiet Hours (${currentIst.timeStr}). Sending now might wake or disturb customers. Do you want to override quiet hours?`
      );
      if (!confirmOverride) return;
      setOverrideQuietHours(true);
    }

    setSubmitting(true);
    const canonicalDeepLink = buildRedirectUrl(destinationType, destinationId) || deepLink || "home";
    const payload = {
      title: title.trim(),
      message: message.trim(),
      category,
      audience,
      destinationType,
      destinationId,
      deepLink: canonicalDeepLink,
      imageUrl: imageUrl.trim() || null,
      sendNow,
      overrideQuietHours: overrideQuietHours || (sendNow && currentIst.isQuiet),
      scheduledAt: !sendNow && sendMode === "schedule" && scheduledAt ? new Date(scheduledAt).getTime() : null,
    };

    try {
      const fn = httpsCallable(getFunctions(), "createEngagementCampaign");
      const res = await fn(payload);
      if (res.data?.ok) {
        addToast(
          sendNow
            ? `Push sent to eligible recipients (${res.data.execution?.stats?.sent || 0} delivered)`
            : (payload.scheduledAt ? "Campaign scheduled successfully." : "Campaign saved successfully."),
          "success"
        );
        fetchCampaigns(false);
      } else {
        throw new Error(res.data?.execution?.error || "Failed to process campaign");
      }
    } catch (err) {
      // Offline / Pre-deployment local draft fallback
      // CRITICAL: Must clearly remain a draft and NEVER claim to be sent or have delivered notifications.
      const localCamp = {
        id: `camp_${Date.now()}`,
        title: payload.title,
        message: payload.message,
        category: payload.category,
        audience: payload.audience,
        destinationType: payload.destinationType,
        destinationId: payload.destinationId,
        deepLink: payload.deepLink,
        imageUrl: payload.imageUrl,
        status: "draft",
        isLocalDraft: true,
        scheduledAt: payload.scheduledAt,
        createdAt: new Date().toISOString(),
        stats: null, // NEVER fake sent stats for local drafts
      };
      saveLocalCampaign(localCamp);
      setCampaigns(loadLocalCampaigns());
      const isDeployPending = err.message?.includes("internal") || err.message?.includes("Failed to fetch") || err.message?.includes("CORS") || err.code === "internal";
      const userMsg = isDeployPending
        ? "Backend functions pending deployment. Campaign saved locally as Draft."
        : (err.message || "Failed to submit campaign.");
      addToast(userMsg, isDeployPending ? "info" : "error");
    } finally {
      // Reset form
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

  const handleTriggerSend = async (campaign) => {
    const campaignId = typeof campaign === "string" ? campaign : campaign.id;
    const isLocal = typeof campaign === "object" ? Boolean(campaign.isLocalDraft) : campaignId.startsWith("camp_");

    if (currentIst.isQuiet && !overrideQuietHours) {
      const confirmOverride = window.confirm(
        `It is currently Quiet Hours (${currentIst.timeStr}). Are you sure you want to trigger this campaign now?`
      );
      if (!confirmOverride) return;
    }

    try {
      if (isLocal) {
        // Local draft being published to production Cloud Functions
        const fn = httpsCallable(getFunctions(), "createEngagementCampaign");
        const campObj = typeof campaign === "object" ? campaign : loadLocalCampaigns().find((c) => c.id === campaignId);
        if (!campObj) throw new Error("Campaign data not found");
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
        });
        if (res.data?.ok) {
          const existing = loadLocalCampaigns().filter((c) => c.id !== campaignId);
          localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(existing));
          addToast(`Delivered to ${res.data.execution?.stats?.sent || 0} customers.`, "success");
          fetchCampaigns(false);
          return;
        } else {
          throw new Error(res.data?.execution?.error || "Send failed");
        }
      } else {
        const fn = httpsCallable(getFunctions(), "sendEngagementCampaign");
        const res = await fn({ campaignId, overrideQuietHours: true });
        if (res.data?.ok) {
          addToast(`Delivered to ${res.data.execution?.stats?.sent || 0} customers.`, "success");
          fetchCampaigns(false);
        } else {
          throw new Error(res.data?.execution?.error || "Send failed");
        }
      }
    } catch (err) {
      addToast(err.message || "Send failed", "error");
    }
  };

  const handleCancelCampaign = async (campaignId) => {
    // 1. Always update local state immediately
    const existing = loadLocalCampaigns();
    const updated = existing.map((c) => (c.id === campaignId ? { ...c, status: "cancelled" } : c));
    localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(updated));
    setCampaigns(updated);

    try {
      const fn = httpsCallable(getFunctions(), "cancelScheduledCampaign");
      await fn({ campaignId });
    } catch {
      // Ignored if backend functions are pending deployment
    }
    addToast("Campaign marked as cancelled.", "info");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#10b981] flex items-center justify-center font-bold text-xl shadow-sm border border-emerald-100">
              <span className="material-symbols-outlined">campaign</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Push Notification Campaigns</h1>
              <p className="text-sm font-medium text-slate-500">
                Engage customers with playful Telugu, English & emoji-rich notifications with deep links & anti-spam guardrails.
              </p>
            </div>
          </div>
        </div>

        {/* Live IST Status & Anti-Spam Indicator */}
        <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col text-right">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Indian Standard Time</span>
            <span className="text-sm font-black text-slate-800">{currentIst.timeStr}</span>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              currentIst.isQuiet
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
            {currentIst.isQuiet ? "Quiet Hours Active (10PM-8AM)" : "Active Engagement Hours"}
          </div>
        </div>
      </div>

      {/* Guardrail Info Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-400 text-2xl">verified_user</span>
          <div>
            <h3 className="font-bold text-sm">Automated Anti-Spam Protection Active</h3>
            <p className="text-xs text-slate-300">
              Active in-flight orders are suppressed • 2-hr recent order cooldown • 18-hr per-user frequency cap • Invalid tokens cleaned up automatically.
            </p>
          </div>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 bg-slate-700/60 rounded-xl border border-slate-600/50 text-slate-200 shrink-0">
          Quiet Hours: 10:00 PM – 08:00 AM IST
        </div>
      </div>

      {/* Preset Quick Fill Pill Bar */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Preset Templates (Telugu / English)</span>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {PRESET_TEMPLATES.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset)}
              className="px-3.5 py-2 bg-white hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition flex items-center gap-2 whitespace-nowrap shadow-sm"
            >
              <span>{preset.title.slice(0, 18)}...</span>
              <span className="text-slate-400 font-normal capitalize">({preset.category})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Composer + Live Smartphone Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Composer Form (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-black text-lg text-slate-900">Campaign Composer</h2>
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

          {/* Message Body with Emoji Quick Add */}
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

          {/* 2 Dropdowns: Category, Audience */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* Unified Destination Selector */}
          <DestinationSelector
            destinationType={destinationType}
            destinationId={destinationId}
            onChange={({ destinationType: dt, destinationId: di, redirectUrl: ru }) => {
              setDestinationType(dt);
              setDestinationId(di);
              setDeepLink(ru);
            }}
          />

          {/* Direct Image Upload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Notification Banner Image (Optional)
              </label>
              <span className="text-[11px] text-slate-400 font-medium">JPEG, PNG, WebP · Max 2 MB</span>
            </div>

            {imagePreview || imageUrl ? (
              <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-3">
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
                    {imageFile && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {(imageFile.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                    {uploadingImage ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
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
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
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
                <p className="text-xs font-bold text-slate-700">Click to upload campaign banner</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Supports JPG, PNG, or WebP up to 2 MB</p>
              </label>
            )}
          </div>

          {/* Schedule vs Send Now */}
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
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Pick Date & Time (IST)</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-[#10b981]"
                />
              </div>
            )}

            {currentIst.isQuiet && (
              <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="overrideQuiet"
                  checked={overrideQuietHours}
                  onChange={(e) => setOverrideQuietHours(e.target.checked)}
                  className="accent-amber-500 w-4 h-4 rounded"
                />
                <label htmlFor="overrideQuiet" className="text-xs font-bold text-amber-900 cursor-pointer">
                  Override Quiet Hours (Forces delivery during 10 PM – 8 AM IST)
                </label>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleCreateOrSend(false)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-sm transition disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleCreateOrSend(sendMode === "now")}
              className="px-6 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl font-bold text-sm transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Processing...</span>
                </>
              ) : sendMode === "now" ? (
                <>
                  <span className="material-symbols-outlined text-lg">send</span>
                  <span>Send Push Now</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">schedule</span>
                  <span>Schedule Push</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Mobile Mockup Preview (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[340px] bg-slate-950 rounded-[42px] p-3.5 shadow-2xl border-4 border-slate-800">
            {/* Phone Speaker & Dynamic Island */}
            <div className="w-full flex justify-center mb-4">
              <div className="w-24 h-5 bg-black rounded-full flex items-center justify-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800"></div>
                <div className="w-2 h-2 rounded-full bg-slate-900"></div>
              </div>
            </div>

            {/* Simulated Phone Screen */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 rounded-[32px] p-4 text-white min-h-[500px] flex flex-col justify-between relative overflow-hidden shadow-inner">
              {/* Lock Screen Clock Header */}
              <div className="text-center pt-2 space-y-1">
                <div className="text-4xl font-light tracking-tight text-slate-100">
                  {currentIst.timeStr.split(" ")[0]}
                </div>
                <div className="text-xs font-medium text-slate-300">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </div>
              </div>

              {/* Notification Shade Card */}
              <div className="my-auto">
                <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-lg border border-white/20 text-slate-900 space-y-2 transform transition-all duration-200">
                  {/* Notification App Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-md bg-[#10b981] flex items-center justify-center text-white text-[11px] font-black">
                        H
                      </div>
                      <span className="text-[11px] font-black text-slate-800 tracking-wide uppercase">HomeBites</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">now</span>
                  </div>

                  {/* Title & Body */}
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
                      {destinationType || "category"}{destinationId ? ` (${destinationId})` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Home Indicator Bar */}
              <div className="w-full flex justify-center pb-2">
                <div className="w-28 h-1 bg-white/40 rounded-full"></div>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 mt-2">Interactive Device Preview</span>
        </div>
      </div>

      {/* Campaign History & Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg text-slate-900">Campaign History & Delivery Analytics</h2>
            <p className="text-xs font-medium text-slate-500">Track sent, scheduled, and suppressed push notifications</p>
          </div>
          <button
            onClick={() => fetchCampaigns(false)}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-black uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Campaign</th>
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
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 font-semibold">
                    No campaigns created yet. Compose your first campaign above!
                  </td>
                </tr>
              ) : (
                campaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{camp.title}</div>
                      <div className="text-xs text-slate-500 line-clamp-1 max-w-sm">{camp.message}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">Route: /{camp.deepLink || "menu"}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-xs font-bold capitalize">
                          {camp.category}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold capitalize">
                          {camp.audience?.replace(/_/g, " ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
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
                    <td className="px-5 py-4">
                      {camp.stats ? (
                        <div className="text-xs space-y-0.5">
                          <div className="font-bold text-slate-800">
                            Sent: <span className="text-[#10b981] font-black">{camp.stats.sent || 0}</span> / {camp.stats.targeted || 0}
                          </div>
                          {camp.stats.suppressed > 0 && (
                            <div className="text-[11px] text-amber-700 font-medium">
                              Suppressed: {camp.stats.suppressed}
                              <span className="text-slate-400 text-[10px] ml-1">
                                (Active: {camp.stats.suppressedReasons?.activeOrder || 0}, Cool: {camp.stats.suppressedReasons?.cooldown || 0})
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">
                          {camp.isLocalDraft ? "Awaiting backend deployment" : "Not dispatched"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right space-x-2">
                      {camp.status === "draft" && (
                        <button
                          onClick={() => handleTriggerSend(camp)}
                          className="px-3 py-1 bg-[#10b981] hover:bg-[#059669] text-white rounded-lg text-xs font-bold transition"
                        >
                          {camp.isLocalDraft ? "Publish & Send" : "Send Now"}
                        </button>
                      )}
                      {camp.status === "scheduled" && (
                        <button
                          onClick={() => handleCancelCampaign(camp.id)}
                          className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
