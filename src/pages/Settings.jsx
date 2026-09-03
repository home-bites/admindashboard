import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { SettingsService } from "../services";
import * as LoadingComponents from "../components/LoadingComponents";
import { isFirebaseConfigured } from "../firebase/firebaseConfig";
import { ImageUploader } from "../components/ImageUploader";
import {
  clearLocalCaches,
  exportFirestoreBackup,
  downloadJson,
  BACKUP_COLLECTIONS,
} from "../lib/maintenance";

/**
 * Reads a number out of an <input type="number"> without ever producing NaN.
 *
 * ## What this fixes
 *
 * Every numeric field on this page was
 * `onChange={e => setX(parseFloat(e.target.value))}`. `parseFloat("")` is
 * **NaN**, and the field is empty for a moment every time an admin selects the
 * value and deletes it before typing a new one — or backspaces the last digit.
 * NaN went into state, `Number(NaN)` is NaN, and `setDoc` wrote NaN straight
 * into `appSettings/general`.
 *
 * It then became permanent. The loader guarded with `data.x !== undefined`,
 * and `NaN !== undefined` is true, so NaN loaded back into the form and was
 * saved again on the next visit. The live document was found holding NaN for
 * taxRate, deliveryCharge, rainCharge, platformFee, minimumOrderValue and
 * commissionRate.
 *
 * In the app that is not cosmetic: any arithmetic touching NaN is NaN, so the
 * bill total was NaN — and `minimumOrderValue > 0` is *false* for NaN, which
 * silently switched the minimum-order rule off altogether.
 *
 * An empty field reads as 0 rather than as "unchanged", which is what an admin
 * clearing a charge means.
 */
const numField = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Anything already poisoned loads as its default instead of round-tripping. */
const finiteOr = (value, fallback) =>
  (typeof value === "number" && Number.isFinite(value)) ? value : fallback;

export const Settings = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState("store");
  const [loading, setLoading] = useState(true);

  // Maintenance utilities. Both run for long enough to need a visible busy
  // state — the backup reads 29 collections, which is seconds, not instant.
  const [cacheBusy, setCacheBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupProgress, setBackupProgress] = useState(null);
  
  // Store identity state
  const [storeName, setStoreName] = useState("HomeBites Central Hub");
  const [storePhone, setStorePhone] = useState("+91 98765 43210");
  const [storeAddress, setStoreAddress] = useState("482 Culinary Ave, Suite 200, Food District, Bangalore, 560001");
  const [orderInstructions, setOrderInstructions] = useState("Please note any severe allergies. Our kitchen handles nuts and dairy.");
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [preordersAvailable, setPreordersAvailable] = useState(true);
  const [heroBackgroundImageUrl, setHeroBackgroundImageUrl] = useState("");
  const [dietHeroBackgroundImageUrl, setDietHeroBackgroundImageUrl] = useState("");
  const [splashImageUrl, setSplashImageUrl] = useState("");

  // Financial parameters state
  const [taxRate, setTaxRate] = useState(5.0); // GST %
  const [commissionRate, setCommissionRate] = useState(10.0); // Delivery partner commission %
  const [platformFee, setPlatformFee] = useState(15.0); // Platform fee in ₹
  const [minOrderValue, setMinOrderValue] = useState(0); // Min order value in ₹; 0 = no minimum
  const [deliveryCharge, setDeliveryCharge] = useState(30.0); // Delivery charge in ₹
  const [rainCharge, setRainCharge] = useState(0.0); // Rain charge in ₹

  /*
   * Distance-based delivery pricing.
   *
   * `deliveryCharge` above is the flat legacy fee. These three describe the
   * rule that replaces it: a base charge covering the first N km, then a
   * fixed amount for every started kilometre beyond. 3.1 km and 3.9 km both
   * cost one extra kilometre; 4.1 km costs two.
   *
   * The customer app, the website preview and the server-side re-check all
   * read these same three fields, so changing one here changes what every
   * customer is quoted. The defaults are the launch rule: ₹20 / 3 km / ₹8.
   */
  const [deliveryBaseCharge, setDeliveryBaseCharge] = useState(20.0);
  const [deliveryBaseDistanceKm, setDeliveryBaseDistanceKm] = useState(3.0);
  const [deliveryPerExtraKm, setDeliveryPerExtraKm] = useState(8.0);

  /*
   * Pickup / kitchen coordinates.
   *
   * These were never editable. `centerLatitude`/`centerLongitude` are read by
   * the delivery app to place its "HomeBites Kitchen" marker and, from now on,
   * by the customer app to build the pin on a takeaway order — but the only
   * way to set them was to edit the Firestore document by hand, so in practice
   * every surface fell back to the same hardcoded pair, 16.3067 / 80.4365.
   * That pair is the Guntur **city centre**. A takeaway customer following it
   * walks to the middle of town.
   *
   * Blank is a real, meaningful state: it means nobody has set the kitchen
   * location, and the clients say so rather than presenting the city centre as
   * an address. So these start empty rather than pre-filled — a pre-filled
   * default is exactly how the minimum-order field ended up writing a value
   * nobody chose.
   */
  const [kitchenLat, setKitchenLat] = useState("");
  const [kitchenLng, setKitchenLng] = useState("");

  // System parameters state
  const [devBypassActive, setDevBypassActive] = useState(true);
  const [appCheckStatus, setAppCheckStatus] = useState("Secured (Debug Provider)");
  
  // Toggles for system
  const [walletEnabled, setWalletEnabled] = useState(true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(true);
  const [loyaltyPointsPerReferral, setLoyaltyPointsPerReferral] = useState(50);
  const [loyaltyPointValueRupees, setLoyaltyPointValueRupees] = useState(1);
  const [loyaltyRedeemThreshold, setLoyaltyRedeemThreshold] = useState(100);
  const [loyaltyWelcomeCredit, setLoyaltyWelcomeCredit] = useState(25);
  const [couponEnabled, setCouponEnabled] = useState(true);

  /*
   * Cash on Delivery controls.
   *
   * None of these existed before. COD was always on, with no floor, no
   * ceiling, and no way to turn it off during an incident — the only lever
   * anyone had was a per-customer block that nothing read. `codEnabled`
   * defaults to true so adding the field changes nothing until someone
   * deliberately switches it off.
   *
   * `codReleaseOnPrepaidOrder` defaults to FALSE, unlike every other toggle on
   * this page. Releasing an abuse block early because the customer paid online
   * once is a policy decision, not a default: it hands anyone who has been
   * blocked a one-order way out of the block.
   */
  const [codEnabled, setCodEnabled] = useState(true);
  const [codMinOrderValue, setCodMinOrderValue] = useState(0);
  const [codMaxOrderValue, setCodMaxOrderValue] = useState(0);
  const [codReleaseOnPrepaidOrder, setCodReleaseOnPrepaidOrder] = useState(false);

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
          setHeroBackgroundImageUrl(data.heroBackgroundImageUrl || data.heroImage || "");
          setSplashImageUrl(data.splashImageUrl || "");
          setDietHeroBackgroundImageUrl(data.dietHeroBackgroundImageUrl || data.dietHeroImage || "");

          setTaxRate(finiteOr(data.taxRate, 5.0));
          setCommissionRate(finiteOr(data.commissionRate, 10.0));
          setPlatformFee(finiteOr(data.platformFee, 15.0));
          // A fourth number used to live here: the form pre-filled 150 when the
          // field was unset, so an admin who saved the page without touching it
          // wrote a minimum nobody had chosen. Everywhere else treats an unset
          // minimum as 0 — the website's useAppSettings, the app's
          // AppSettings.fallback, and the server — and 0 means "no minimum".
          setMinOrderValue(finiteOr(data.minimumOrderValue, 0));
          setDeliveryCharge(finiteOr(data.deliveryCharge, 30.0));
          setRainCharge(finiteOr(data.rainCharge, 0.0));
          setDeliveryBaseCharge(finiteOr(data.deliveryBaseCharge, 20.0));
          setDeliveryBaseDistanceKm(finiteOr(data.deliveryBaseDistanceKm, 3.0));
          setDeliveryPerExtraKm(finiteOr(data.deliveryPerExtraKm, 8.0));

          setWalletEnabled(data.walletEnabled !== undefined ? data.walletEnabled : true);
          setLoyaltyEnabled(data.loyaltyEnabled !== undefined ? data.loyaltyEnabled : true);
          setLoyaltyPointsPerReferral(finiteOr(data.loyaltyPointsPerReferral, 50));
          setLoyaltyPointValueRupees(finiteOr(data.loyaltyPointValueRupees, 1));
          setLoyaltyRedeemThreshold(finiteOr(data.loyaltyRedeemThreshold, 100));
          setLoyaltyWelcomeCredit(finiteOr(data.loyaltyWelcomeCredit, 25));
          setCouponEnabled(data.couponEnabled !== undefined ? data.couponEnabled : true);

          setCodEnabled(data.codEnabled !== undefined ? data.codEnabled : true);
          setCodMinOrderValue(finiteOr(data.codMinOrderValue, 0));
          setCodMaxOrderValue(finiteOr(data.codMaxOrderValue, 0));
          // Absent means false here, deliberately. Every other toggle on this
          // page reads an absent field as "on"; this one must not, or the
          // early release would switch itself on for every kitchen the moment
          // the feature ships.
          setCodReleaseOnPrepaidOrder(data.codReleaseOnPrepaidOrder !== undefined ? data.codReleaseOnPrepaidOrder : false);

          // Absent stays absent. Substituting the city centre here would make
          // the clients believe a kitchen location had been configured.
          setKitchenLat(
            data.centerLatitude !== undefined && data.centerLatitude !== null
              ? String(data.centerLatitude)
              : ""
          );
          setKitchenLng(
            data.centerLongitude !== undefined && data.centerLongitude !== null
              ? String(data.centerLongitude)
              : ""
          );

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

  /**
   * A latitude/longitude pair is only usable when *both* halves are real.
   *
   * Returns `{ ok, lat, lng, error }`. `ok` with null coordinates means the
   * pair was left blank, which is allowed — the clients handle "not
   * configured" honestly. Half a pair is not allowed: it would write one
   * coordinate and leave the other defaulting to the city centre, producing a
   * point somewhere neither the admin nor the kitchen chose.
   */
  const parsePickupPoint = () => {
    const latRaw = String(kitchenLat).trim();
    const lngRaw = String(kitchenLng).trim();
    if (!latRaw && !lngRaw) return { ok: true, lat: null, lng: null };
    if (!latRaw || !lngRaw) {
      return { ok: false, error: "Enter both the pickup latitude and longitude, or leave both blank." };
    }
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { ok: false, error: "Pickup latitude must be a number between -90 and 90." };
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { ok: false, error: "Pickup longitude must be a number between -180 and 180." };
    }
    if (lat === 0 && lng === 0) {
      return { ok: false, error: "0, 0 is a point in the Atlantic — leave both blank instead." };
    }
    return { ok: true, lat, lng };
  };

  const handleSave = async () => {
    const pickup = parsePickupPoint();
    if (!pickup.ok) {
      addToast(pickup.error, "error");
      return;
    }

    const payload = {
      storeName,
      supportPhone: storePhone,
      storeAddress,
      orderInstructions,
      storeOpen: acceptingOrders,
      preordersAvailable,
      heroBackgroundImageUrl,
      dietHeroBackgroundImageUrl,
      splashImageUrl,
      // numField, not Number(). `Number(NaN)` is NaN, and this payload goes
      // straight into Firestore — which stores NaN happily and hands it to
      // every client. The handlers already prevent it; this is the guard that
      // holds if a new field is added without one.
      taxRate: numField(taxRate, 5),
      commissionRate: numField(commissionRate, 10),
      platformFee: numField(platformFee, 15),
      minimumOrderValue: numField(minOrderValue, 0),
      deliveryCharge: numField(deliveryCharge, 30),
      rainCharge: numField(rainCharge, 0),
      deliveryBaseCharge: numField(deliveryBaseCharge, 20),
      deliveryBaseDistanceKm: numField(deliveryBaseDistanceKm, 3),
      deliveryPerExtraKm: numField(deliveryPerExtraKm, 8),
      walletEnabled,
      loyaltyEnabled,
      loyaltyPointsPerReferral: numField(loyaltyPointsPerReferral, 50),
      loyaltyPointValueRupees: numField(loyaltyPointValueRupees, 1),
      loyaltyRedeemThreshold: numField(loyaltyRedeemThreshold, 100),
      loyaltyWelcomeCredit: numField(loyaltyWelcomeCredit, 25),
      couponEnabled,
      codEnabled,
      // Numbers, not strings. The number inputs hand back strings, and the
      // server compares these against an order subtotal — "500" > 1000 is
      // false in JavaScript for the wrong reason, which is the sort of limit
      // that silently never fires.
      codMinOrderValue: numField(codMinOrderValue, 0),
      codMaxOrderValue: numField(codMaxOrderValue, 0),
      codReleaseOnPrepaidOrder,
      deliveryTrackingEnabled,
      showPartnerEarnings,
      maintenanceMode,
      hours,
      // Spread, not assigned: when the pair is blank the keys are absent from
      // the payload entirely, so an existing value is left alone and an unset
      // one stays unset. Writing null or 0 here would read downstream as a
      // configured location at the wrong place.
      ...(pickup.lat !== null
        ? { centerLatitude: pickup.lat, centerLongitude: pickup.lng }
        : {})
    };

    try {
      await SettingsService.updateSettings(payload, user);
      addToast("Settings saved successfully", "success");
    } catch (err) {
      addToast(`Failed to save settings: ${err.message}`, "error");
    }
  };

  /**
   * Clears the caches that actually exist, and says which.
   *
   * The previous version showed "Operational cache cleared" and cleared
   * nothing — no cache API call, no storage key removed. Someone seeing a
   * stale build after a deploy would have clicked it, been told it worked,
   * and still had the stale build.
   */
  const handleClearCache = async () => {
    if (cacheBusy) return;
    setCacheBusy(true);
    try {
      const r = await clearLocalCaches();

      const parts = [];
      if (r.caches) parts.push(`${r.caches} asset cache${r.caches === 1 ? "" : "s"}`);
      if (r.keys.length) parts.push("saved UI preferences");
      if (r.serviceWorker) parts.push("service worker");

      if (parts.length === 0) {
        // Nothing to clear is a real, useful answer — not a failure, and not
        // something to dress up as a successful cleanup.
        addToast("Nothing cached to clear.", "info");
        setCacheBusy(false);
        return;
      }

      addToast(`Cleared ${parts.join(", ")}. Reloading…`, "success");
      // The running page is still controlled by the worker that was just
      // unregistered, so the clear only takes visible effect after a reload.
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      addToast(`Could not clear cache: ${e.message}`, "error");
      setCacheBusy(false);
    }
  };

  /**
   * Reads every known collection and downloads a real JSON file.
   *
   * The previous version was a 1.2-second setTimeout followed by "Backup file
   * generated and downloaded successfully". No read, no file. The risk was not
   * the wasted click — it was someone taking a backup before a migration and
   * proceeding on the belief they had a restore point.
   */
  const handleDatabaseBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupProgress({ done: 0, total: BACKUP_COLLECTIONS.length, name: "" });

    try {
      const { payload, failed, totalDocs } = await exportFirestoreBackup(
        (done, total, name) => setBackupProgress({ done, total, name })
      );

      if (totalDocs === 0) {
        // An empty file is worse than no file: it looks like a backup.
        addToast(
          "Backup aborted — no documents could be read. Check your admin permissions.",
          "error"
        );
        return;
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadJson(payload, `homebites-backup-${stamp}.json`);

      if (failed.length) {
        // Partial success is reported as partial. Rounding it up to "success"
        // is how a backup with holes gets trusted.
        addToast(
          `Backup downloaded with ${failed.length} collection${
            failed.length === 1 ? "" : "s"
          } unreadable (${failed.map((f) => f.collection).join(", ")}). ` +
            `${totalDocs} documents saved.`,
          "warning",
          12000 // Longer than the 4s default: this one names collections the
                // reader has to act on, and it must not vanish while reading.
        );
      } else {
        addToast(
          `Backup downloaded — ${totalDocs} documents across ${BACKUP_COLLECTIONS.length} collections.`,
          "success"
        );
      }
    } catch (e) {
      addToast(`Backup failed: ${e.message}`, "error");
    } finally {
      setBackupBusy(false);
      setBackupProgress(null);
    }
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
          onClick={() => setActiveTab("customization")}
          className={`pb-3 font-label-md text-label-md flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "customization"
              ? "text-[#10b981] font-bold border-[#10b981]"
              : "text-[#555f6f] hover:text-[#151c27] border-transparent"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">wallpaper</span>
          Hero & App Banner
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
                    onChange={(e) => setTaxRate(numField(e.target.value))}
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
                    onChange={(e) => setCommissionRate(numField(e.target.value))}
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
                    onChange={(e) => setPlatformFee(numField(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Fixed platform charge added per transaction checkout.</p>
              </div>

              {/* Minimum Order Value */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Minimum Order Value (₹)</label>
                <p className="font-label-sm text-[11px] text-[#555f6f]">
                  Set to 0 for no minimum. Enforced on the website, in the app,
                  and server-side when the order is created.
                </p>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={minOrderValue}
                    // parseFloat('') is NaN, which was written straight to
                    // Firestore as a broken minimum that every surface then
                    // read as "no minimum" only by accident.
                    onChange={(e) => setMinOrderValue(numField(e.target.value))}
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
                    onChange={(e) => setDeliveryCharge(numField(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Standard delivery fee added per order.</p>
              </div>

              {/* ── Distance-based delivery pricing ──────────────────────────
                  These three fields are the live rule. The customer app, the
                  website and the server-side price check all read them from
                  appSettings/general, so a change here reaches every customer
                  without an app release or a website redeploy. */}
              <div className="md:col-span-2 pt-2">
                <h3 className="font-label-sm text-label-sm text-[#151c27] uppercase tracking-wider font-semibold">Distance-based delivery pricing</h3>
                <p className="text-[11px] text-[#555f6f] mt-1">
                  The base charge covers everything up to the base distance. Beyond
                  that, every <em>started</em> kilometre adds the extra charge — so
                  3.1&nbsp;km and 3.9&nbsp;km both cost one extra kilometre, and
                  4.1&nbsp;km costs two. Distance is measured from the service centre
                  set below to the customer&rsquo;s delivery pin.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Base Charge (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={deliveryBaseCharge}
                    onChange={(e) => setDeliveryBaseCharge(numField(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Charged on every order, and the whole charge inside the base distance. Default ₹20.</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Base Distance (km)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={deliveryBaseDistanceKm}
                    onChange={(e) => setDeliveryBaseDistanceKm(numField(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">km</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Distance the base charge covers. Default 3 km.</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Extra per km (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={deliveryPerExtraKm}
                    onChange={(e) => setDeliveryPerExtraKm(numField(e.target.value))}
                    className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                </div>
                <p className="text-[11px] text-[#555f6f]">Added for each started kilometre beyond the base distance. Default ₹8.</p>
              </div>

              {/* A worked preview, so an admin sees the effect of a change
                  before saving it rather than discovering it at checkout. */}
              <div className="md:col-span-2 rounded-lg border border-[#dce2f3] bg-[#f9f9ff] px-4 py-3">
                <p className="text-[11px] text-[#555f6f] uppercase tracking-wider font-semibold mb-2">Preview</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {[3, 3.1, 4, 4.1, 5, 6, 8].map((km) => {
                    const base = numField(deliveryBaseCharge, 20);
                    const baseKm = numField(deliveryBaseDistanceKm, 3);
                    const per = numField(deliveryPerExtraKm, 8);
                    const extra = km <= baseKm
                      ? 0
                      : Math.ceil(Number((km - baseKm).toFixed(6)));
                    const fee = base + extra * per;
                    return (
                      <span key={km} className="font-body-md text-body-md text-[#151c27]">
                        <span className="text-[#555f6f]">{km} km</span> → ₹{Number(fee.toFixed(2))}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Pickup / Kitchen Location */}
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Pickup Location (Kitchen)</label>
                <p className="font-label-sm text-[11px] text-[#555f6f]">
                  The exact point a takeaway customer collects from, and the
                  marker the delivery app draws as the kitchen. Leave blank if
                  it has not been surveyed — the apps will say the pickup point
                  is not set rather than pointing at the city centre.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={kitchenLat}
                    onChange={(e) => setKitchenLat(e.target.value)}
                    placeholder="Latitude e.g. 16.30120"
                    className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={kitchenLng}
                    onChange={(e) => setKitchenLng(e.target.value)}
                    placeholder="Longitude e.g. 80.43990"
                    className="w-full border border-[#dce2f3] rounded-lg px-4 py-2.5 font-body-md text-body-md text-[#151c27] bg-[#f9f9ff] focus:border-[#10b981] outline-none"
                  />
                </div>
                <p className="text-[11px] text-[#555f6f]">
                  Stand at the collection door and read the coordinates off
                  Google Maps. Both fields are required together.
                </p>
              </div>

              {/* Rain Surge Charge */}
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Rain Surge Charge (₹)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={rainCharge}
                    onChange={(e) => setRainCharge(numField(e.target.value))}
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

                  {/* Loyalty Enabled */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Loyalty Points System</p>
                      <p className="text-[10px] text-[#555f6f]">Master toggle to enable/disable loyalty points earnings</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={loyaltyEnabled}
                        onChange={(e) => setLoyaltyEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {loyaltyEnabled && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-[#f0f4ff] rounded border border-blue-100">
                      <div>
                        <label className="text-[11px] font-semibold text-[#151c27]">Points Per Referral</label>
                        <input
                          type="number"
                          value={loyaltyPointsPerReferral}
                          onChange={(e) => setLoyaltyPointsPerReferral(e.target.value)}
                          className="w-full mt-1 p-2 text-xs bg-white border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#151c27]">Point Value (₹)</label>
                        <input
                          type="number"
                          value={loyaltyPointValueRupees}
                          onChange={(e) => setLoyaltyPointValueRupees(e.target.value)}
                          className="w-full mt-1 p-2 text-xs bg-white border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#151c27]">Redeem Threshold</label>
                        <input
                          type="number"
                          value={loyaltyRedeemThreshold}
                          onChange={(e) => setLoyaltyRedeemThreshold(e.target.value)}
                          className="w-full mt-1 p-2 text-xs bg-white border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#151c27]">Welcome Credit</label>
                        <input
                          type="number"
                          value={loyaltyWelcomeCredit}
                          onChange={(e) => setLoyaltyWelcomeCredit(e.target.value)}
                          className="w-full mt-1 p-2 text-xs bg-white border rounded"
                        />
                      </div>
                    </div>
                  )}

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

              {/* Cash on Delivery Panel */}
              <div className="p-4 border border-[#dce2f3] rounded-lg">
                <h4 className="font-label-md text-label-md text-[#151c27] font-semibold mb-1">Cash on Delivery</h4>
                <p className="mb-4 text-[11px] text-[#555f6f]">
                  These apply everywhere — the customer app, the website and the
                  server-side order check — so a COD order that fails them is
                  refused, not just hidden. Per-customer blocks are separate and
                  live on the customer's file.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* COD Enabled */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Accept Cash on Delivery</p>
                      <p className="text-[10px] text-[#555f6f]">Master switch. Turning this off removes COD from every checkout immediately.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={codEnabled}
                        onChange={(e) => setCodEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Release an auto block on a prepaid order */}
                  <div className="flex items-center justify-between p-3 bg-[#f9f9ff] rounded border">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Release an Auto COD Block on a Prepaid Order</p>
                      <p className="text-[10px] text-[#555f6f]">Also release an auto COD block when the customer completes a prepaid order. Defaults to OFF — a block otherwise ends only when its 24 hours are up.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={codReleaseOnPrepaidOrder}
                        onChange={(e) => setCodReleaseOnPrepaidOrder(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>

                  {/* Minimum COD order value */}
                  <div className="flex flex-col gap-2 p-3 bg-[#f9f9ff] rounded border">
                    <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Minimum COD Order Value (₹)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={codMinOrderValue}
                        onChange={(e) => setCodMinOrderValue(e.target.value)}
                        className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2 font-body-md text-body-md text-[#151c27] bg-white focus:border-[#10b981] outline-none"
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                    </div>
                    <p className="text-[10px] text-[#555f6f]">Minimum COD order value (0 = no minimum).</p>
                  </div>

                  {/* Maximum COD order value */}
                  <div className="flex flex-col gap-2 p-3 bg-[#f9f9ff] rounded border">
                    <label className="font-label-sm text-label-sm text-[#555f6f] uppercase tracking-wider font-semibold">Maximum COD Order Value (₹)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={codMaxOrderValue}
                        onChange={(e) => setCodMaxOrderValue(e.target.value)}
                        className="w-full border border-[#dce2f3] rounded-lg pl-8 pr-4 py-2 font-body-md text-body-md text-[#151c27] bg-white focus:border-[#10b981] outline-none"
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#555f6f] font-semibold">₹</span>
                    </div>
                    <p className="text-[10px] text-[#555f6f]">Maximum COD order value (0 = no maximum), which caps the cash a rider carries.</p>
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
                <h4 className="font-label-md text-label-md text-[#151c27] font-semibold mb-1">Maintenance Utilities</h4>
                {/* Says plainly what the backup is, so nobody treats a
                    convenience export as a disaster-recovery plan. */}
                <p className="mb-4 text-xs font-semibold text-slate-500">
                  Backup downloads a JSON export of every collection this
                  account can read. It is not point-in-time consistent and does
                  not replace a scheduled server-side export.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={handleClearCache}
                    disabled={cacheBusy}
                    className="px-4 py-2 border border-[#dce2f3] hover:bg-[#f0f3ff] text-[#151c27] font-label-sm text-label-sm rounded transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">cleaning_services</span>
                    {cacheBusy ? "Clearing…" : "Clear Cache"}
                  </button>
                  <button
                    onClick={handleDatabaseBackup}
                    disabled={backupBusy}
                    className="px-4 py-2 border border-[#dce2f3] hover:bg-[#f0f3ff] text-[#151c27] font-label-sm text-label-sm rounded transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    {backupBusy && backupProgress
                      ? `Reading ${backupProgress.done}/${backupProgress.total}…`
                      : "Backup Database"}
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

        {activeTab === "customization" && (
          <div className="lg:col-span-12 flex flex-col gap-6">
            <section className="bg-white border border-[#dce2f3] rounded-xl p-6 relative overflow-hidden group shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#10b981]">wallpaper</span>
                    Customer App Hero Section Background Image
                  </h3>
                  <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
                    Upload or replace the full-bleed cover image displayed behind the location header, greeting, and search bar on the Customer App Home Screen.
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  className="inner-shine bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md px-5 py-2 rounded-lg shadow-xs flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save Image
                </button>
              </div>

              {/* Live Preview of Hero Banner */}
              <div className="mb-6 relative rounded-2xl overflow-hidden h-56 border border-slate-200 bg-slate-900 shadow-md">
                {heroBackgroundImageUrl ? (
                  <img
                    src={heroBackgroundImageUrl}
                    alt="Hero Background Preview"
                    className="w-full h-full object-cover opacity-90"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500 text-sm">
                    No custom hero background set (Default theme active)
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-[#0F172A] flex flex-col justify-between p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-extrabold text-[11px] tracking-wider uppercase bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-full backdrop-blur-md">
                      CUSTOMER APP LIVE COVER PREVIEW
                    </span>
                    <span className="bg-[#10b981] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                      ACTIVE HERO
                    </span>
                  </div>
                  <div>
                    <span className="text-white/80 font-bold text-xs uppercase tracking-widest block">BONJOUR,</span>
                    <span className="text-white font-black text-3xl tracking-tight">Customer Name</span>
                    <div className="mt-4 bg-white/95 backdrop-blur-md rounded-full px-4 py-2.5 text-slate-400 text-xs font-semibold flex items-center gap-2 max-w-md shadow-lg">
                      <span className="material-symbols-outlined text-[#10b981] text-base">search</span>
                      Search homemade biryani, pizza, thalis...
                    </div>
                  </div>
                </div>
              </div>

              {/* Image Uploader Component */}
              <ImageUploader
                value={heroBackgroundImageUrl}
                onChange={(url) => setHeroBackgroundImageUrl(url)}
                folder="settings/hero"
                label="Upload / Change Home Hero Background Cover Image"
              />
            </section>

            {/* Diet Page Hero Customization */}
            <section className="bg-white border border-[#dce2f3] rounded-xl p-6 relative overflow-hidden group shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#10b981]">spa</span>
                    Diet Meals Page Hero Background Image
                  </h3>
                  <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
                    Upload or update the custom banner cover image displayed on the Diet Meals landing page in the Customer App.
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  className="inner-shine bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md px-5 py-2 rounded-lg shadow-xs flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save Diet Hero Image
                </button>
              </div>

              {/* Live Preview of Diet Hero Banner */}
              <div className="mb-6 relative rounded-2xl overflow-hidden h-48 border border-slate-200 bg-slate-900 shadow-md">
                {dietHeroBackgroundImageUrl ? (
                  <img
                    src={dietHeroBackgroundImageUrl}
                    alt="Diet Hero Background Preview"
                    className="w-full h-full object-cover opacity-90"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500 text-sm">
                    No custom diet hero background set (Default theme active)
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0F172A] flex flex-col justify-between p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-extrabold text-[11px] tracking-wider uppercase bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-full backdrop-blur-md">
                      DIET PAGE HERO PREVIEW
                    </span>
                    <span className="bg-[#10b981] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                      LIVE DIET HERO
                    </span>
                  </div>
                  <div>
                    <span className="text-white font-black text-2xl tracking-tight">KETO &amp; HIGH PROTEIN MEALS</span>
                    <p className="text-emerald-300 font-semibold text-xs mt-1">100% Curated Clinical Nutrition &amp; Macro Tracker</p>
                  </div>
                </div>
              </div>

              {/* Image Uploader Component */}
              <ImageUploader
                value={dietHeroBackgroundImageUrl}
                onChange={(url) => setDietHeroBackgroundImageUrl(url)}
                folder="settings/diet_hero"
                label="Upload / Change Diet Page Hero Background Cover Image"
              />
            </section>

            {/* Customer App Splash Screen */}
            <section className="bg-white border border-[#dce2f3] rounded-xl p-6 relative overflow-hidden group shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-headline-md text-headline-md text-[#151c27] font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#10b981]">smartphone</span>
                    Customer App Splash Screen
                  </h3>
                  <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
                    The full-screen artwork shown while the app starts. Upload a
                    tall portrait image &mdash; 1284 &times; 2778 or the same 1:2.17
                    shape. Leave this empty to use the artwork built into the app.
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  className="inner-shine bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md px-5 py-2 rounded-lg shadow-xs flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save Splash Image
                </button>
              </div>

              {/*
                * Says plainly when the change reaches customers.
                *
                * The splash is the first thing drawn, so the app cannot ask
                * Firestore what to show without putting a network round trip
                * in front of every cold start. It uses the copy it already has
                * on the device. That means a new image appears on a customer's
                * *next* launch, not the one during which their app first sees
                * this setting — and an admin who is not told that will report
                * it as a bug after checking their own phone once.
                */}
              <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="material-symbols-outlined text-amber-600 text-[18px] mt-[1px]">schedule</span>
                <p className="text-[13px] text-amber-900 leading-relaxed">
                  <strong>Takes effect on the customer&rsquo;s second launch.</strong> The
                  app downloads the new artwork in the background the first time it
                  sees this setting, and shows it from the launch after that. This is
                  deliberate &mdash; waiting for the download would delay every app
                  start. Customers who never open the app will not download it at all.
                </p>
              </div>

              {/* Phone-shaped preview, because a wide crop of a 1:2.17 image
                  tells you nothing about how it will actually sit on a phone. */}
              <div className="mb-6 flex justify-center">
                <div className="relative w-[200px] h-[434px] rounded-[28px] overflow-hidden border-[6px] border-slate-800 bg-[#FDF8EF] shadow-lg">
                  {splashImageUrl ? (
                    <img
                      src={splashImageUrl}
                      alt="Splash screen preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center px-4">
                      <span className="material-symbols-outlined text-[#10b981] text-[32px]">
                        image
                      </span>
                      <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                        No custom image.<br />Using the artwork built into the app.
                      </p>
                    </div>
                  )}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-[5px] rounded-full bg-slate-800/70" />
                </div>
              </div>

              <ImageUploader
                value={splashImageUrl}
                onChange={(url) => setSplashImageUrl(url)}
                folder="settings/splash"
                label="Upload / Change Customer App Splash Screen Image"
              />

              {splashImageUrl && (
                <button
                  onClick={() => setSplashImageUrl("")}
                  className="mt-3 text-[13px] font-semibold text-slate-600 hover:text-red-600 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                  Clear and go back to the built-in artwork
                </button>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
