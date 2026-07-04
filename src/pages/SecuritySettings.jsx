import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
    remoteMaintenanceMode: false,
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
                  <label className="text-xs font-bold text-slate-700 block">Enforce Firebase App Check</label>
                  <span className="text-[10px] text-slate-400">Blocks fake clients and automation tools from queries.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enforceAppCheck}
                  onChange={(e) => setSettings({ ...settings, enforceAppCheck: e.target.checked })}
                  className="w-4 h-4 text-[#10b981] focus:ring-[#10b981] border-slate-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="text-xs font-bold text-slate-700 block">Restrict Rooted/Jailbroken Devices</label>
                  <span className="text-[10px] text-slate-400">Disables wallet deposits and checkout for modified OS.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.blockRootDevices}
                  onChange={(e) => setSettings({ ...settings, blockRootDevices: e.target.checked })}
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
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Max Request Rate (10s)</label>
                <input
                  type="number"
                  value={settings.rateLimitMaxRequests}
                  onChange={(e) => setSettings({ ...settings, rateLimitMaxRequests: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">OTP Limit Per Hour</label>
                <input
                  type="number"
                  value={settings.otpLimitPerHour}
                  onChange={(e) => setSettings({ ...settings, otpLimitPerHour: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Admin Session Timeout (Mins)</label>
                <input
                  type="number"
                  value={settings.sessionTimeoutMins}
                  onChange={(e) => setSettings({ ...settings, sessionTimeoutMins: parseInt(e.target.value) || 0 })}
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
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">QR Expiration (Seconds)</label>
                <input
                  type="number"
                  value={settings.qrExpirationSeconds}
                  onChange={(e) => setSettings({ ...settings, qrExpirationSeconds: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Max Scan Retries</label>
                <input
                  type="number"
                  value={settings.maxQrScanAttempts}
                  onChange={(e) => setSettings({ ...settings, maxQrScanAttempts: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">COD Block Threshold</label>
                <input
                  type="number"
                  value={settings.codAbuseThreshold}
                  onChange={(e) => setSettings({ ...settings, codAbuseThreshold: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] font-semibold"
                  required
                />
              </div>
            </div>
          </div>

          {/* Emergency Shut-Off Maintenance */}
          <div className="space-y-4 pt-5">
            <h3 className="font-bold text-red-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">gavel</span>
              Emergency Platform Controls
            </h3>
            <div className="flex items-center justify-between p-3.5 bg-red-50 border border-red-200 rounded-lg">
              <div>
                <label className="text-xs font-bold text-red-800 block">Enforce Platform Maintenance Mode</label>
                <span className="text-[10px] text-red-600/80">Forces all mobile clients to exit and displays a maintenance screen.</span>
              </div>
              <input
                type="checkbox"
                checked={settings.remoteMaintenanceMode}
                onChange={(e) => setSettings({ ...settings, remoteMaintenanceMode: e.target.checked })}
                className="w-4 h-4 text-red-700 focus:ring-red-700 border-red-300 rounded"
              />
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
