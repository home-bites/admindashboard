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
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

const COLLECTION = "serviceAreas";

/**
 * Delivery coverage zones.
 *
 * `serviceAreas` decides whether the customer app offers checkout at all — the
 * "HomeBites isn't available here yet" card is driven entirely by this
 * collection — and it is re-checked server-side in `onOrderCreatedValidateArea`.
 * Until now it had no editor anywhere in the dashboard, so coverage could only
 * be changed by hand in the Firebase console. A customer standing in a suburb
 * we actually deliver to was told the whole business was unavailable, with no
 * in-product way to correct it.
 *
 * Field names and bounds mirror firestore.rules exactly (name non-empty,
 * lat/lng in range, 0 < radiusKm <= 100). Anything the rules would reject is
 * rejected here first, so an admin gets a readable message instead of a raw
 * permission-denied.
 */

const RADIUS_MAX_KM = 100;

const EARTH_RADIUS_KM = 6371;

/** Mirrors ServiceArea.haversineKm in the Flutter client and functions/index.js. */
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

  // Coverage tester — paste a customer's coordinates and see the same verdict
  // the app would reach, instead of guessing why someone is being refused.
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
      // Absent means active, matching ServiceArea.fromFirestore — a legacy doc
      // without the flag should keep serving customers.
      isActive: area.isActive ?? true,
      displayOrder: area.displayOrder ?? 0,
      note: area.note ?? "",
    });
    setIsModalOpen(true);
  };

  const setField = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** Returns an error string, or null when the payload will pass firestore.rules. */
  const validate = ({ name, lat, lng, radius }) => {
    if (!name) return "Area name is required";
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      return "Latitude must be a number between -90 and 90";
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      return "Longitude must be a number between -180 and 180";
    if (!Number.isFinite(radius) || radius <= 0)
      return "Radius must be greater than 0 km";
    if (radius > RADIUS_MAX_KM)
      return `Radius cannot exceed ${RADIUS_MAX_KM} km`;
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const name = form.name.trim();
    const lat = Number(form.centerLat);
    const lng = Number(form.centerLng);
    const radius = Number(form.radiusKm);

    const problem = validate({ name, lat, lng, radius });
    if (problem) {
      addToast(problem, "error");
      return;
    }

    const payload = {
      name,
      centerLat: lat,
      centerLng: lng,
      radiusKm: radius,
      isActive: Boolean(form.isActive),
      displayOrder: Number(form.displayOrder) || 0,
      note: form.note.trim(),
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, COLLECTION, editId), payload);
        addToast(`Service area "${name}" updated`, "success");
      } else {
        await addDoc(collection(db, COLLECTION), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        addToast(`Service area "${name}" created`, "success");
      }
      setIsModalOpen(false);
    } catch (err) {
      addToast(`Error saving service area: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (area) => {
    // A hard delete, unlike categories: coverage is a live gate on ordering and
    // a soft-deleted zone that still matched would keep taking orders we cannot
    // fulfil. To pause a zone without losing it, switch it inactive instead.
    if (
      !confirm(
        `Delete the service area "${area.name}"?\n\nCustomers inside it will immediately be told HomeBites is unavailable. To pause it temporarily, set it inactive instead.`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, COLLECTION, area.id));
      addToast(`Service area "${area.name}" deleted`, "success");
    } catch (err) {
      addToast(`Error deleting service area: ${err.message}`, "error");
    }
  };

  const toggleActive = async (area) => {
    const next = !(area.isActive ?? true);
    try {
      await updateDoc(doc(db, COLLECTION, area.id), {
        // The rules require these four keys on every update, so they are resent
        // unchanged rather than patching isActive alone.
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

  // Same evaluation order as CoverageResult.evaluate on the client.
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

  if (loading) {
    return <LoadingComponents.LoadingPage />;
  }

  return (
    <div className="p-8 bg-[#f9f9ff] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="font-bold text-2xl text-slate-800 tracking-tight"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Service Areas
          </h1>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Circular delivery zones. A customer is served if their coordinates fall
            inside any active zone.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs px-5 py-2.5 rounded-lg border-t border-white/20 transition-all flex items-center gap-2 shadow-xs justify-center w-full sm:w-auto inner-shine"
        >
          <span className="material-symbols-outlined text-[16px]">add_location_alt</span>
          Add Service Area
        </button>
      </div>

      {/*
        An empty collection is treated as "not configured" by the app and is
        deliberately permissive — every customer passes. That is the right
        failure mode for a Firestore outage but a bad steady state, because the
        Cloud Function still refuses the order after the customer has checked
        out. Worth saying plainly rather than leaving the list looking merely empty.
      */}
      {activeCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <span className="material-symbols-outlined text-amber-600 text-[20px]">warning</span>
          <div>
            <p className="font-bold text-xs text-amber-900">No active service areas</p>
            <p className="text-[11px] text-amber-800 font-semibold mt-1">
              With none configured the app stops blocking anyone at checkout, but
              <code className="mx-1 px-1 bg-amber-100 rounded">onOrderCreatedValidateArea</code>
              still flags the order server-side. Add at least one zone.
            </p>
          </div>
        </div>
      )}

      {/* Coverage tester */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 mb-6 shadow-2xs">
        <p className="font-bold text-xs text-slate-700 mb-1">Coverage tester</p>
        <p className="text-[11px] text-slate-400 font-semibold mb-4">
          Paste a customer&apos;s coordinates to see the exact verdict the app would reach.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            value={testLat}
            onChange={(e) => setTestLat(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-semibold text-[#151c27] placeholder:text-slate-400 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 w-full sm:w-44"
            placeholder="Latitude e.g. 16.3200"
            type="text"
            inputMode="decimal"
          />
          <input
            value={testLng}
            onChange={(e) => setTestLng(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-semibold text-[#151c27] placeholder:text-slate-400 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 w-full sm:w-44"
            placeholder="Longitude e.g. 80.4100"
            type="text"
            inputMode="decimal"
          />
          {testResult && (
            <div className="text-xs font-bold">
              {testResult.invalid ? (
                <span className="text-slate-400">Enter two valid numbers</span>
              ) : testResult.covering ? (
                <span className="text-emerald-600">
                  Covered by &quot;{testResult.covering.area.name}&quot; (
                  {testResult.covering.distanceKm.toFixed(2)} km from centre)
                </span>
              ) : testResult.nearest ? (
                <span className="text-rose-600">
                  Not covered — nearest is &quot;{testResult.nearest.name}&quot;,{" "}
                  {testResult.nearestKm.toFixed(2)} km away (
                  {(testResult.nearestKm - testResult.nearest.radiusKm).toFixed(2)} km
                  beyond its {testResult.nearest.radiusKm} km radius)
                </span>
              ) : (
                <span className="text-amber-600">No active zones to test against</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      {areas.length === 0 ? (
        <EmptyState
          icon="pin_drop"
          title="No Service Areas Configured"
          description="Add the places HomeBites delivers to. Each zone is a centre point and a radius in kilometres."
          actionText="Add Service Area"
          onActionClick={openAdd}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((area) => {
            const active = area.isActive ?? true;
            return (
              <div
                key={area.id}
                className={`bg-white border border-slate-150 rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow relative ${
                  active ? "" : "opacity-75"
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-150">
                      <span className="material-symbols-outlined text-[22px] text-[#10b981]">
                        pin_drop
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3
                        className="font-bold text-base text-slate-800 tracking-tight truncate"
                        style={{ fontFamily: "Outfit, sans-serif" }}
                      >
                        {area.name || "(unnamed)"}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-semibold">
                        {area.radiusKm} km radius
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 items-center shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                        active
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-slate-100 text-slate-500 border-slate-250"
                      }`}
                    >
                      {active ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={() => openEdit(area)}
                      className="text-slate-400 hover:text-[#10b981] p-1 rounded hover:bg-slate-50 transition-colors"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(area)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>

                <dl className="text-[11px] font-semibold text-slate-500 space-y-1">
                  <div className="flex justify-between gap-2">
                    <dt>Centre</dt>
                    <dd className="text-slate-700 tabular-nums">
                      {Number(area.centerLat).toFixed(5)}, {Number(area.centerLng).toFixed(5)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Display order</dt>
                    <dd className="text-slate-700">{area.displayOrder ?? 0}</dd>
                  </div>
                </dl>

                {area.note ? (
                  <p className="text-[11px] text-slate-400 font-semibold border-l-2 border-slate-150 pl-2">
                    {area.note}
                  </p>
                ) : null}

                <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                  <button
                    onClick={() => toggleActive(area)}
                    className="text-slate-500 font-bold text-xs hover:underline"
                  >
                    {active ? "Set inactive" : "Set active"}
                  </button>
                  <button
                    onClick={() => openEdit(area)}
                    className="text-[#10b981] font-bold text-xs hover:underline"
                  >
                    Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#151c27]/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-[0_10px_30px_rgba(0,0,0,0.08)] overflow-hidden border border-slate-200 animate-slide-up max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-150 shrink-0">
              <h2
                className="font-bold text-base text-slate-800 tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {editId ? "Edit Service Area" : "Add Service Area"}
              </h2>
              <button
                className="text-slate-400 hover:bg-slate-50 p-2 rounded-full transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col min-h-0">
              <div className="p-6 space-y-5 overflow-y-auto">
                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Area Name
                  </label>
                  <input
                    value={form.name}
                    onChange={setField("name")}
                    className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                    placeholder="e.g. Gorantla"
                    required
                    type="text"
                  />
                  <p className="text-[10px] text-slate-400 font-semibold mt-1.5">
                    Shown to customers in the &quot;we deliver to …&quot; copy, so use the
                    name a local would recognise.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Centre Latitude
                    </label>
                    <input
                      value={form.centerLat}
                      onChange={setField("centerLat")}
                      className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                      placeholder="16.32000"
                      required
                      type="text"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Centre Longitude
                    </label>
                    <input
                      value={form.centerLng}
                      onChange={setField("centerLng")}
                      className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                      placeholder="80.41000"
                      required
                      type="text"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Radius (km)
                    </label>
                    <input
                      value={form.radiusKm}
                      onChange={setField("radiusKm")}
                      className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                      placeholder="8"
                      required
                      type="text"
                      inputMode="decimal"
                    />
                    <p className="text-[10px] text-slate-400 font-semibold mt-1.5">
                      Max {RADIUS_MAX_KM} km.
                    </p>
                  </div>
                  <div>
                    <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Display Order
                    </label>
                    <input
                      value={form.displayOrder}
                      onChange={setField("displayOrder")}
                      className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                      placeholder="0"
                      type="number"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Internal Note
                  </label>
                  <input
                    value={form.note}
                    onChange={setField("note")}
                    className="w-full bg-white border border-[#d3daea] rounded-lg px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all font-semibold"
                    placeholder="Not shown to customers"
                    type="text"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="font-bold text-xs text-slate-700">Active</p>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      Inactive zones are ignored when deciding coverage
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      checked={form.isActive}
                      onChange={setField("isActive")}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-11 h-6 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                  </label>
                </div>
              </div>

              <div className="p-6 border-t border-slate-150 flex justify-end gap-3 bg-[#f9f9ff] rounded-b-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-xs text-slate-500 bg-white border border-[#d3daea] rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 font-bold text-xs text-white bg-[#10b981] border-t border-white/20 rounded-lg hover:bg-[#059669] transition-colors shadow-xs inner-shine disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Service Area"}
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
