import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";


/* ── Which of these controls actually does anything ─────────────────────────
 *
 * Audited against functions/index.js, firestore.rules, customer_app and
 * delivery_app. Of the nine settings on this page, exactly one is read by
 * anything:
 *
 *   codAbuseThreshold      → read by codAbuseThreshold() in functions/index.js
 *
 * The other eight are written to appSettings/security and then read by
 * nobody. Toggling them produced a success toast and changed nothing.
 *
 * That is not a cosmetic problem. An operator who believes rate limiting or
 * App Check enforcement is switched on, when it is not, is worse off than one
 * who knows it is unavailable — so the unenforced controls are disabled and
 * labelled rather than left looking live.
 *
 * `remoteMaintenanceMode` was also a duplicate: the working maintenance switch
 * is on the Settings page, which writes `maintenanceMode` to
 * appSettings/general, and that is the field customer_app reads. This page
 * wrote a different field on a different document, so the two disagreed and
 * the one here did nothing.
 *
 * Enforcing the rest needs real backend work — App Check enforcement, a rate
 * limiter, OTP throttling, admin session expiry and QR expiry are five
 * separate features, not configuration. They stay visible, disabled, so the
 * intent is not lost.
 * ─────────────────────────────────────────────────────────────────────────── */
const ENFORCED = new Set(["codAbuseThreshold"]);

/** Marks a control the backend does not yet read.
 *
 * Takes the field name and consults ENFORCED, so the badge and the audited
 * list cannot disagree — if a setting is later wired up, adding it to ENFORCED
 * removes its badge automatically. */
const NotEnforcedBadge = ({ field }) =>
  ENFORCED.has(field) ? null : (
  <span
    title="Saved, but no backend component reads this setting yet. It has no effect."
    className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200"
  >
    Not enforced
  </span>
);


const SecuritySettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState({
    enforceAppCheck: false,
    blockRootDevices: true,
    otpLimitPerHour: 5,
    rateLimitMaxRequests: 20,
    sessionTimeoutMins: 15,
    qrExpirationSeconds: 300,
    codAbuseThreshold: 3,
    maxQrScanAttempts: 5,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "appSettings", "security"));
        if (docSnap.exists()) {
          setSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (e) {
        console.error("Error loading security settings: ", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await setDoc(doc(db, "appSettings", "security"), {
        ...settings,
        updatedAt: new Date(),
      }, { merge: true });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error("Error saving settings: ", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium text-xs">
        Loading remote security configurations...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#10b981] text-[28px]">lock</span>
          Global Security Configurations
        </h2>
        <p className="text-xs text-slate-500 mt-1">Configure remote platform security thresholds. Settings propagate to client apps instantly without recompiling.</p>
      </div>

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 space-y-6 divide-y divide-slate-100">
          
          {/* Switched Integrity Checks */}
          <div className="space-y-4 pt-4 first:pt-0">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-500 text-[18px]">verified_user</span>
              App & Device Integrity Controls
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="text-xs font-bold text-slate-500 block">Enforce Firebase App Check<NotEnforcedBadge field="enforceAppCheck" /></label>
                  <span className="text-[10px] text-slate-400">Blocks fake clients and automation tools from queries.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enforceAppCheck}
                  onChange={(e) => setSettings({ ...settings, enforceAppCheck: e.target.checked })}
                  disabled
                  className="w-4 h-4 text-[#10b981] focus:ring-[#10b981] border-slate-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="text-xs font-bold text-slate-500 block">Restrict Rooted/Jailbroken Devices<NotEnforcedBadge field="blockRootDevices" /></label>
                  <span className="text-[10px] text-slate-400">Disables wallet deposits and checkout for modified OS.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.blockRootDevices}
                  onChange={(e) => setSettings({ ...settings, blockRootDevices: e.target.checked })}
                  disabled
                  className="w-4 h-4 text-[#10b981] focus:ring-[#10b981] border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Rate Limiting & Session Configuration */}
          <div className="space-y-4 pt-5">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-500 text-[18px]">av_timer</span>
              Throttling & Session Controls
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Max Request Rate (10s)<NotEnforcedBadge field="rateLimitMaxRequests" /></label>
                <input
                  type="number"
                  value={settings.rateLimitMaxRequests}
                  onChange={(e) => setSettings({ ...settings, rateLimitMaxRequests: parseInt(e.target.value) || 0 })}
                  disabled
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">OTP Limit Per Hour<NotEnforcedBadge field="otpLimitPerHour" /></label>
                <input
                  type="number"
                  value={settings.otpLimitPerHour}
                  onChange={(e) => setSettings({ ...settings, otpLimitPerHour: parseInt(e.target.value) || 0 })}
                  disabled
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Admin Session Timeout (Mins)<NotEnforcedBadge field="sessionTimeoutMins" /></label>
                <input
                  type="number"
                  value={settings.sessionTimeoutMins}
                  onChange={(e) => setSettings({ ...settings, sessionTimeoutMins: parseInt(e.target.value) || 0 })}
                  disabled
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>
            </div>
          </div>

          {/* QR Code and Wallet Security */}
          <div className="space-y-4 pt-5">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-500 text-[18px]">vpn_key</span>
              Token & Transaction Security
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">QR Expiration (Seconds)<NotEnforcedBadge field="qrExpirationSeconds" /></label>
                <input
                  type="number"
                  value={settings.qrExpirationSeconds}
                  onChange={(e) => setSettings({ ...settings, qrExpirationSeconds: parseInt(e.target.value) || 0 })}
                  disabled
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Max Scan Retries<NotEnforcedBadge field="maxQrScanAttempts" /></label>
                <input
                  type="number"
                  value={settings.maxQrScanAttempts}
                  onChange={(e) => setSettings({ ...settings, maxQrScanAttempts: parseInt(e.target.value) || 0 })}
                  disabled
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              {/* This box has always saved. Until now nothing read it — the
                  threshold that actually applied was hardcoded to 2 in the
                  customer app, so changing this number here did nothing at
                  all. The server now reads it, which is why the label says
                  plainly what it does rather than naming a field. */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Abandoned COD Checkouts Before Block</label>
                <input
                  type="number"
                  value={settings.codAbuseThreshold}
                  onChange={(e) => setSettings({ ...settings, codAbuseThreshold: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
                <span className="text-[10px] text-slate-400 block mt-1 leading-snug">
                  Number of abandoned COD checkouts before Cash on Delivery is
                  automatically blocked for 24 hours. The block then releases
                  itself, and the count starts again from zero.
                </span>
              </div>
            </div>
          </div>

          {/* Emergency Shut-Off Maintenance */}
          <div className="space-y-4 pt-5">
            <h3 className="font-bold text-red-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">gavel</span>
              Emergency Platform Controls
            </h3>
            {/* The switch that used to live here wrote
                appSettings/security.remoteMaintenanceMode, which nothing reads.
                The working control writes appSettings/general.maintenanceMode
                and is on the Settings page — that is the field customer_app
                actually checks. Two switches for one behaviour, only one of
                them real, is how an operator ends up believing the platform is
                in maintenance when it is serving orders normally. */}
            <div className="flex items-center justify-between p-3.5 bg-red-50 border border-red-200 rounded-lg">
              <div>
                <label className="text-xs font-bold text-red-800 block">Platform Maintenance Mode</label>
                <span className="text-[10px] text-red-600/80">
                  Managed on the Settings page, under Business Controls — that is
                  the switch the mobile apps read.
                </span>
              </div>
              <Link
                to="/settings"
                className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Open Settings
              </Link>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 items-center">
          {success && (
            <span className="text-xs text-green-600 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Settings saved successfully!
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-[#10b981] hover:bg-[#059669] disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-lg font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SecuritySettings;
