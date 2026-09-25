import React, { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { ImageUploader } from "../components/ImageUploader";
import DestinationSelector, { parseDestination, buildRedirectUrl } from "../components/DestinationSelector";

const EMPTY = {
  title: "",
  subtitle: "",
  caption: "",
  imageUrl: "",
  backgroundColor: "#F1F8F4",
  accentColor: "#0F2C25",
  couponCode: "",
  ctaLabel: "",
  destinationType: "offers",
  destinationId: "",
  redirectUrl: "offers",
  displayOrder: 0,
  isActive: true,
};

const PALETTES = [
  { name: "Mint Fresh", bg: "#F1F8F4", accent: "#0F2C25" },
  { name: "Warm Peach", bg: "#FFF1E8", accent: "#9A3412" },
  { name: "Golden Honey", bg: "#FFF8E1", accent: "#854D0E" },
  { name: "Sky Comfort", bg: "#EFF6FF", accent: "#1E3A8A" },
  { name: "Berry Rose", bg: "#FFF1F2", accent: "#9F1239" },
  { name: "Royal Purple", bg: "#F5F3FF", accent: "#5B21B6" },
  { name: "Night Emerald", bg: "#064E3B", accent: "#ECFDF5" },
];

function PromoPreviewCard({ card }) {
  const bg = card.backgroundColor || "#F1F8F4";
  const fg = card.accentColor || "#0F2C25";
  const isDark = bg === "#064E3B";

  return (
    <div
      className="w-full max-w-[340px] rounded-3xl p-5 shadow-sm transition-all relative overflow-hidden flex flex-col justify-between min-h-[140px]"
      style={{ backgroundColor: bg, color: fg }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          {card.caption && (
            <span
              className={`inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isDark ? "bg-white/10 text-emerald-300" : "bg-black/5 text-slate-700"
              }`}
            >
              {card.caption}
            </span>
          )}
          <h4 className="text-base font-black tracking-tight leading-snug line-clamp-2">
            {card.title || "Promo Card Title"}
          </h4>
          {card.subtitle && (
            <p className="text-xs opacity-80 font-medium line-clamp-2">
              {card.subtitle}
            </p>
          )}
        </div>

        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            className="w-16 h-16 rounded-2xl object-cover shrink-0 shadow-xs border border-white/20"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-black/5 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl opacity-40">style</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-black/5 dark:border-white/10">
        {card.couponCode ? (
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold tracking-wider ${
              isDark ? "bg-white/15 text-white" : "bg-white text-slate-900 shadow-2xs"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">confirmation_number</span>
            {card.couponCode}
          </span>
        ) : (
          <span className="text-[11px] font-bold opacity-60">
            {card.ctaLabel || "View Special Offer"}
          </span>
        )}

        <button
          type="button"
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
            isDark ? "bg-white text-emerald-950 font-black" : "bg-slate-900 text-white"
          }`}
        >
          {card.ctaLabel || "Apply"}
          <span className="material-symbols-outlined text-xs">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

export default function PromoCards() {
  const { addToast } = useUiStore();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "promoCards"),
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const v = d.data();
          if (v.isDeleted !== true) list.push({ id: d.id, ...v });
        });
        list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        setCards(list);
        setLoading(false);
      },
      (err) => {
        addToast(`Could not load promo cards: ${err.message}`, "error");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [addToast]);

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      addToast("Give the card a title — it is required for display.", "error");
      return;
    }
    setSaving(true);
    try {
      const destType = form.destinationType || "offers";
      const destId = (form.destinationId || "").trim();
      const redirectUrl = form.redirectUrl || buildRedirectUrl(destType, destId);

      const payload = {
        ...form,
        title: form.title.trim(),
        couponCode: form.couponCode.trim().toUpperCase(),
        destinationType: destType,
        destinationId: destId,
        redirectUrl: redirectUrl,
        displayOrder: Number(form.displayOrder) || 0,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      };

      if (editingId) {
        await setDoc(doc(db, "promoCards", editingId), payload, { merge: true });
        addToast("Promo card updated live in customer app", "success");
      } else {
        await addDoc(collection(db, "promoCards"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        addToast("Promo card added live to customer app", "success");
      }
      reset();
    } catch (err) {
      addToast(`Save failed: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this promo card from the customer app?")) return;
    try {
      await deleteDoc(doc(db, "promoCards", id));
      addToast("Promo card removed", "info");
    } catch (err) {
      addToast(`Could not remove: ${err.message}`, "error");
    }
  };

  const toggleActive = async (card) => {
    try {
      await setDoc(
        doc(db, "promoCards", card.id),
        { isActive: !(card.isActive !== false) },
        { merge: true }
      );
      addToast(`Card is now ${card.isActive !== false ? "hidden" : "visible"}`, "success");
    } catch (err) {
      addToast(`Could not update: ${err.message}`, "error");
    }
  };

  // KPIs
  const activeCount = cards.filter((c) => c.isActive !== false).length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Home Screen Promo Cards
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Design interactive promotional tiles displayed beneath the hero carousel in the mobile app.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {activeCount} Active on Home Screen
          </span>
        </div>
      </div>

      {/* ── Main Layout: Split Form & Live Mobile Carousel Preview ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form & Live Preview */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card Form */}
          <form
            onSubmit={save}
            className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {editingId ? "Edit Promo Card" : "Create New Promo Tile"}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕ Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Card Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={40}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Flat 30% Off First Feast"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Subtitle</label>
                <input
                  type="text"
                  maxLength={60}
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  placeholder="e.g. Valid on all homestyle biryanis"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Top Badge Tag</label>
                <input
                  type="text"
                  maxLength={20}
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                  placeholder="e.g. TODAY ONLY"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Coupon Code (Optional)</label>
                <input
                  type="text"
                  maxLength={15}
                  value={form.couponCode}
                  onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. FEAST30"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold uppercase outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Button CTA Text</label>
                <input
                  type="text"
                  maxLength={20}
                  value={form.ctaLabel}
                  onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                  placeholder="e.g. Claim Now"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Destination Selector */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Deep Link Target</label>
              <DestinationSelector
                destinationType={form.destinationType || "offers"}
                destinationId={form.destinationId || ""}
                onChange={({ destinationType, destinationId, redirectUrl }) =>
                  setForm((f) => ({ ...f, destinationType, destinationId, redirectUrl }))
                }
              />
            </div>

            {/* Palette Selection */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1.5">Color Palette Theme</label>
              <div className="flex flex-wrap gap-2">
                {PALETTES.map((p) => {
                  const isSelected = form.backgroundColor === p.bg;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setForm({ ...form, backgroundColor: p.bg, accentColor: p.accent })}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[11px] border-2 transition flex items-center gap-1.5 ${
                        isSelected ? "border-emerald-600 shadow-xs" : "border-transparent"
                      }`}
                      style={{ backgroundColor: p.bg, color: p.accent }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.accent }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Image Uploader */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Tile Icon or Thumbnail</label>
              <ImageUploader
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
                folder="promoCards"
                label="Square Icon (84x84)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Display Priority Order</label>
                <input
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.isActive !== false}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  Visible on Home Screen
                </label>
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Save Promo Tile" : "Add to App Screen"}
              </button>
            </div>
          </form>

          {/* Live In-App Preview */}
          <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Live In-App Render Preview
            </span>
            <div className="flex justify-center py-2">
              <PromoPreviewCard card={form} />
            </div>
          </div>
        </div>

        {/* Right Column: Existing Cards List */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Configured Promo Tiles ({cards.length})
            </h3>
            <span className="text-[11px] text-slate-400 font-semibold">Ordered by priority</span>
          </div>

          {loading ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-xs">
              Loading promo tiles...
            </div>
          ) : cards.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-12 text-center space-y-2">
              <span className="material-symbols-outlined text-3xl text-slate-300">style</span>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No promo cards created yet</p>
              <p className="text-[11px] text-slate-400">Add a card using the composer to display it on the customer app home screen.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Priority Order: #{c.displayOrder ?? 0}
                    </span>
                    <button
                      onClick={() => toggleActive(c)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                        c.isActive !== false
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {c.isActive !== false ? "Visible" : "Hidden"}
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <PromoPreviewCard card={c} />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-[11px] text-slate-400 truncate max-w-xs">
                      Target: <strong className="text-slate-700 dark:text-slate-300">{c.destinationType || "offers"}</strong>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const dest = parseDestination(c.destinationType, c.destinationId, c.redirectUrl);
                          setEditingId(c.id);
                          setForm({
                            ...EMPTY,
                            ...c,
                            destinationType: dest.destinationType,
                            destinationId: dest.destinationId,
                            redirectUrl: c.redirectUrl || buildRedirectUrl(dest.destinationType, dest.destinationId),
                          });
                        }}
                        className="px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="p-1 rounded-xl text-slate-400 hover:text-rose-600 transition"
                        title="Remove"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
