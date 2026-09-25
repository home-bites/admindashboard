import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import ServiceAreaMapPicker from "../components/ServiceAreaMapPicker";

const COLLECTION = "serviceAreas";
const RADIUS_MAX_KM = 100;
const EARTH_RADIUS_KM = 6371;

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

const PRESET_LOCALITIES = [
  { name: "Brodipet Center", lat: 16.3056, lng: 80.4378 },
  { name: "Arundelpet Main", lat: 16.3012, lng: 80.4421 },
  { name: "Collector Office", lat: 16.3120, lng: 80.4285 },
  { name: "Railway Station", lat: 16.3060, lng: 80.4530 },
  { name: "Koretipadu Junction", lat: 16.3210, lng: 80.4190 },
];

const blankForm = {
  name: "",
  centerLat: "",
  centerLng: "",
  radiusKm: "",
  isActive: true,
  displayOrder: 0,
  note: "",
};

export const ServiceAreas = () => {
  const { addToast } = useUiStore();

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blankForm);

  const [testLat, setTestLat] = useState("");
  const [testLng, setTestLng] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        setAreas(rows);
        setLoading(false);
      },
      (err) => {
        console.error("serviceAreas listen failed:", err);
        addToast(`Could not load service areas: ${err.message}`, "error");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [addToast]);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...blankForm, displayOrder: areas.length });
    setIsModalOpen(true);
  };

  const openEdit = (area) => {
    setEditId(area.id);
    setForm({
      name: area.name ?? "",
      centerLat: String(area.centerLat ?? ""),
      centerLng: String(area.centerLng ?? ""),
      radiusKm: String(area.radiusKm ?? ""),
      isActive: area.isActive ?? true,
      displayOrder: area.displayOrder ?? 0,
      note: area.note ?? "",
    });
    setIsModalOpen(true);
  };

  const validate = ({ name, lat, lng, radius }) => {
    if (!name) return "Area name is required";
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      return "Latitude must be a valid number between -90 and 90";
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      return "Longitude must be a valid number between -180 and 180";
    if (!Number.isFinite(radius) || radius <= 0)
      return "Radius must be greater than 0 km";
    if (radius > RADIUS_MAX_KM)
      return `Radius cannot exceed ${RADIUS_MAX_KM} km`;
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const lat = Number(form.centerLat);
    const lng = Number(form.centerLng);
    const radius = Number(form.radiusKm);
    const order = Number(form.displayOrder) || 0;

    const err = validate({ name: form.name.trim(), lat, lng, radius });
    if (err) {
      addToast(err, "error");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      centerLat: lat,
      centerLng: lng,
      radiusKm: radius,
      isActive: Boolean(form.isActive),
      displayOrder: order,
      note: form.note.trim(),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editId) {
        await updateDoc(doc(db, COLLECTION, editId), payload);
        addToast(`Updated service area "${payload.name}"`, "success");
      } else {
        await addDoc(collection(db, COLLECTION), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        addToast(`Added service area "${payload.name}"`, "success");
      }
      setIsModalOpen(false);
      setForm(blankForm);
      setEditId(null);
    } catch (e) {
      addToast(`Error saving service area: ${e.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete service area "${name}"? Customers in this radius may lose checkout eligibility.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, COLLECTION, id));
      addToast(`Deleted service area "${name}"`, "info");
    } catch (err) {
      addToast(`Error deleting service area: ${err.message}`, "error");
    }
  };

  const toggleActive = async (area) => {
    const next = !(area.isActive ?? true);
    try {
      await updateDoc(doc(db, COLLECTION, area.id), {
        name: area.name,
        centerLat: area.centerLat,
        centerLng: area.centerLng,
        radiusKm: area.radiusKm,
        isActive: next,
        updatedAt: serverTimestamp(),
      });
      addToast(`"${area.name}" is now ${next ? "active" : "inactive"}`, "success");
    } catch (err) {
      addToast(`Error updating service area: ${err.message}`, "error");
    }
  };

  const activeCount = areas.filter((a) => (a.isActive ?? true) && a.radiusKm > 0).length;
  const maxRadius = areas.reduce((m, a) => Math.max(m, Number(a.radiusKm || 0)), 0);

  const testResult = useMemo(() => {
    const lat = Number(testLat);
    const lng = Number(testLng);
    if (testLat === "" || testLng === "") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { invalid: true };
    }

    let covering = null;
    let nearest = null;
    let nearestKm = Infinity;

    areas.forEach((a) => {
      if (!(a.isActive ?? true) || !(a.radiusKm > 0)) return;
      const d = haversineKm(a.centerLat, a.centerLng, lat, lng);
      if (d < nearestKm) {
        nearestKm = d;
        nearest = a;
      }
      if (d <= a.radiusKm && !covering) covering = { area: a, distanceKm: d };
    });

    return { covering, nearest, nearestKm };
  }, [testLat, testLng, areas]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Delivery Service Areas & Geofencing
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure delivery coverage radii. Customers whose GPS coordinates fall inside active zones are served.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
          Add Coverage Zone
        </button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Service Zones</span>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{activeCount} Zones</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Covering customer orders</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">pin_drop</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Max Delivery Radius</span>
            <p className="text-2xl font-black text-blue-600 mt-1">{maxRadius} km</p>
            <p className="text-[10px] text-slate-400 mt-0.5">From hub epicenter</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">radar</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Checkout Gate Status</span>
            <p className={`text-2xl font-black mt-1 ${activeCount > 0 ? "text-emerald-600" : "text-amber-500"}`}>
              {activeCount > 0 ? "Protected" : "Unrestricted"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Geofence validation active</p>
          </div>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            activeCount > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
          }`}>
            <span className="material-symbols-outlined text-2xl">shield</span>
          </div>
        </div>
      </div>

      {/* ── Interactive Coverage Diagnostic Tester ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-emerald-600 text-lg">explore</span>
              Customer Coordinate & Coverage Diagnostic
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              Paste customer GPS coordinates or choose a preset locality to test if checkout will succeed.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            value={testLat}
            onChange={(e) => setTestLat(e.target.value)}
            placeholder="Latitude (e.g. 16.3056)"
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-emerald-500 w-full sm:w-48"
          />
          <input
            type="text"
            value={testLng}
            onChange={(e) => setTestLng(e.target.value)}
            placeholder="Longitude (e.g. 80.4378)"
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-emerald-500 w-full sm:w-48"
          />

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_LOCALITIES.map((loc) => (
              <button
                key={loc.name}
                type="button"
                onClick={() => {
                  setTestLat(String(loc.lat));
                  setTestLng(String(loc.lng));
                }}
                className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 dark:text-slate-300 font-bold text-[11px] transition"
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Verdict Display */}
        {testResult && (
          <div className={`p-4 rounded-2xl border text-xs font-bold animate-in fade-in duration-150 ${
            testResult.invalid
              ? "bg-slate-50 dark:bg-slate-800/40 text-slate-500 border-slate-200 dark:border-slate-700"
              : testResult.covering
              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800"
          }`}>
            {testResult.invalid ? (
              <span>Please enter two valid numbers for latitude and longitude.</span>
            ) : testResult.covering ? (
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <span>
                  Delivering Available! Covered by &ldquo;{testResult.covering.area.name}&rdquo; ({testResult.covering.distanceKm.toFixed(2)} km from zone hub).
                </span>
              </div>
            ) : testResult.nearest ? (
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600">error</span>
                <span>
                  Outside Delivery Coverage! Nearest zone is &ldquo;{testResult.nearest.name}&rdquo; ({testResult.nearestKm.toFixed(2)} km away, {(testResult.nearestKm - testResult.nearest.radiusKm).toFixed(2)} km outside radius limit).
                </span>
              </div>
            ) : (
              <span>No active delivery zones available to test.</span>
            )}
          </div>
        )}
      </div>

      {/* ── Service Zones Cards Grid ── */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400">Loading service zones...</span>
        </div>
      ) : areas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <span className="material-symbols-outlined text-2xl">pin_drop</span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Service Areas Configured</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Add delivery coverage zones so customers can place orders with geofenced delivery assurance.
          </p>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            Add Service Area
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {areas.map((a) => {
            const active = a.isActive ?? true;
            return (
              <div
                key={a.id}
                className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-xs space-y-4 transition-all duration-200 flex flex-col justify-between ${
                  active
                    ? "border-slate-200/80 dark:border-slate-800"
                    : "border-slate-200 dark:border-slate-800 opacity-60"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                        <span className="material-symbols-outlined text-xl">pin_drop</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{a.name}</h4>
                        <p className="text-[11px] text-slate-400 font-semibold">{a.radiusKm} km radius circle</p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleActive(a)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                        active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {active ? "Active" : "Inactive"}
                    </button>
                  </div>

                  {a.note && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic line-clamp-2">
                      &ldquo;{a.note}&rdquo;
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                    <span>Center GPS:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {Number(a.centerLat).toFixed(4)}, {Number(a.centerLng).toFixed(4)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => openEdit(a)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Edit Zone
                    </button>
                    <button
                      onClick={() => handleDelete(a.id, a.name)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 transition"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editId ? "Edit Delivery Service Zone" : "Add New Delivery Zone"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Zone Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Brodipet & Arundelpet Central Zone"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Center Latitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.centerLat}
                    onChange={(e) => setForm({ ...form, centerLat: e.target.value })}
                    placeholder="16.3056"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Center Longitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.centerLng}
                    onChange={(e) => setForm({ ...form, centerLng: e.target.value })}
                    placeholder="80.4378"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Radius (Kilometers) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max={RADIUS_MAX_KM}
                    required
                    value={form.radiusKm}
                    onChange={(e) => setForm({ ...form, radiusKm: e.target.value })}
                    placeholder="e.g. 8"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    Zone Active for Orders
                  </label>
                </div>
              </div>

              {/* Map Coordinates Picker Helper */}
              <div className="pt-2">
                <ServiceAreaMapPicker
                  centerLat={form.centerLat}
                  centerLng={form.centerLng}
                  radiusKm={form.radiusKm}
                  onLocationSelect={({ lat, lng }) => {
                    setForm((prev) => ({
                      ...prev,
                      centerLat: String(lat),
                      centerLng: String(lng),
                    }));
                  }}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Zone Operational Notes
                </label>
                <textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Heavy traffic near railway overbridge during peak 6 PM"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : editId ? "Save Zone Changes" : "Create Zone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceAreas;
