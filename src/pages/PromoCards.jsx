import React, { useEffect, useState } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useUiStore } from "../store/uiStore";
import { uploadFile } from "../firebase/storage";
import { ImageUploader } from "../components/ImageUploader";
import DestinationSelector, { parseDestination, buildRedirectUrl } from "../components/DestinationSelector";

/**
 * Promotional cards shown under the hero banner on the app's home screen.
 *
 * Separate from Banners on purpose. A banner is one full-bleed photograph; a
 * promo card is a short text-led tile with a coupon code. Putting both behind
 * one editor would mean showing every admin a form where half the fields do
 * nothing depending on which type they picked — the commonest way a CMS
 * becomes something people avoid using.
 *
 * Writes go straight to Firestore rather than through the service layer,
 * because the service layer's whitelists have twice silently dropped fields
 * in this project. Here the document *is* the form.
 */
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

// Ready-made palettes. Typing hex into a text box is how you end up with one
// card that looks nothing like the rest of the app.
const PALETTES = [
  { name: "Mint", bg: "#F1F8F4", accent: "#0F2C25" },
  { name: "Peach", bg: "#FFF1E8", accent: "#9A3412" },
  { name: "Butter", bg: "#FFF8E1", accent: "#854D0E" },
  { name: "Sky", bg: "#EFF6FF", accent: "#1E3A8A" },
  { name: "Rose", bg: "#FFF1F2", accent: "#9F1239" },
];

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
      },
    );
    return () => unsub();
  }, [addToast]);

  const reset = () => { setForm(EMPTY); setEditingId(null); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      addToast("Give the card a title — it's the only part that always shows.", "error");
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
        addToast("Promo card updated. It's already live in the app.", "success");
      } else {
        await addDoc(collection(db, "promoCards"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        addToast("Promo card added. It's already live in the app.", "success");
      }
      reset();
    } catch (err) {
      addToast(`Save failed: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this promo card from the app?")) return;
    try {
      await deleteDoc(doc(db, "promoCards", id));
      addToast("Promo card removed.", "info");
    } catch (err) {
      addToast(`Could not remove: ${err.message}`, "error");
    }
  };

  const toggleActive = async (card) => {
    try {
      await setDoc(
        doc(db, "promoCards", card.id),
        { isActive: !(card.isActive !== false) },
        { merge: true },
      );
    } catch (err) {
      addToast(`Could not update: ${err.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Promo Cards</h1>
        <p className="text-sm text-slate-500 mt-1">
          The offer tiles under the main banner on the app home screen. Changes
          appear immediately — customers do not need to update the app.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---------------- Editor ---------------- */}
        <form
          onSubmit={save}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4"
        >
          <h2 className="font-bold text-slate-900 dark:text-white">
            {editingId ? "Edit card" : "New card"}
          </h2>

          <Field label="Title" hint="Shown largest. Keep it under about 30 characters.">
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Flat 15% OFF up to ₹150"
              maxLength={60}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Subtitle" hint="Optional second line.">
              <input
                className={inputCls}
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="On orders above ₹499"
                maxLength={60}
              />
            </Field>
            <Field label="Caption" hint="Small print, optional.">
              <input
                className={inputCls}
                value={form.caption}
                onChange={(e) => setForm({ ...form, caption: e.target.value })}
                placeholder="Valid till Sunday"
                maxLength={60}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Coupon code" hint="Shown as a pill. Leave blank to show the button instead.">
              <input
                className={inputCls}
                value={form.couponCode}
                onChange={(e) => setForm({ ...form, couponCode: e.target.value })}
                placeholder="FIRSTBITE"
                maxLength={20}
              />
            </Field>
            <Field label="Button text" hint="Only used when there is no coupon code.">
              <input
                className={inputCls}
                value={form.ctaLabel}
                onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                placeholder="View offers"
                maxLength={24}
              />
            </Field>
          </div>

          <DestinationSelector
            destinationType={form.destinationType || "offers"}
            destinationId={form.destinationId || ""}
            onChange={({ destinationType, destinationId, redirectUrl }) =>
              setForm((f) => ({ ...f, destinationType, destinationId, redirectUrl }))
            }
          />

          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {PALETTES.map((p) => {
                const on = form.backgroundColor === p.bg;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setForm({ ...form, backgroundColor: p.bg, accentColor: p.accent })}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition ${
                      on ? "border-emerald-500" : "border-transparent"
                    }`}
                    style={{ background: p.bg, color: p.accent }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Image" hint="Optional. Square works best — it renders at 84×84.">
            <ImageUploader
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              folder="promoCards"
              label="Card image"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Order" hint="Lower shows first.">
              <input
                type="number"
                className={inputCls}
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
              />
            </Field>
            <Field label="Visible">
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive !== false}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  Show in the app
                </span>
              </label>
            </Field>
          </div>

          {/* Live preview at the app's real width, so what is approved here is
              what ships. A preview at a different size hides overflow. */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
              Preview
            </p>
            <PromoPreview card={form} />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add card"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* ---------------- List ---------------- */}
        <div className="space-y-3">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {!loading && cards.length === 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold text-slate-700 dark:text-slate-200">No promo cards yet</p>
              <p className="text-sm text-slate-500 mt-1">
                The app simply omits the row until you add one, so nothing looks broken.
              </p>
            </div>
          )}

          {cards.map((card) => (
            <div
              key={card.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
            >
              <PromoPreview card={card} />
              <div className="flex items-center gap-1.5 mt-2.5 text-[11px] font-semibold text-slate-500">
                <span className="material-symbols-outlined text-xs text-emerald-600">near_me</span>
                <span>Opens: <strong className="text-slate-700 dark:text-slate-200 capitalize">{card.destinationType || (card.redirectUrl ? card.redirectUrl.split(':')[0] : "offers")}</strong>{card.destinationId ? ` (${card.destinationId})` : card.redirectUrl && card.redirectUrl.includes(':') ? ` (${card.redirectUrl.split(':')[1]})` : ""}</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    const dest = parseDestination(card.destinationType, card.destinationId, card.redirectUrl);
                    setEditingId(card.id);
                    setForm({
                      ...EMPTY,
                      ...card,
                      destinationType: dest.destinationType,
                      destinationId: dest.destinationId,
                      redirectUrl: card.redirectUrl || buildRedirectUrl(dest.destinationType, dest.destinationId),
                    });
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(card)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg ${
                    card.isActive !== false
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {card.isActive !== false ? "Visible" : "Hidden"}
                </button>
                <button
                  onClick={() => remove(card.id)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 ml-auto"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-900 text-sm outline-none focus:border-emerald-500 transition";

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
        {label}
        {hint && <span className="ml-1.5 font-normal text-slate-400 text-xs">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** Mirrors the Flutter card so the dashboard shows what the customer sees. */
function PromoPreview({ card }) {
  const bg = card.backgroundColor || "#F1F8F4";
  const accent = card.accentColor || "#0F2C25";
  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: bg, width: 268, maxWidth: "100%" }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold leading-tight truncate" style={{ color: accent, fontSize: 15 }}>
          {card.title || "Card title"}
        </p>
        {card.subtitle && (
          <p className="text-xs truncate mt-0.5" style={{ color: accent, opacity: 0.75 }}>
            {card.subtitle}
          </p>
        )}
        {card.caption && (
          <p className="text-[11px] truncate" style={{ color: accent, opacity: 0.55 }}>
            {card.caption}
          </p>
        )}
        {card.couponCode ? (
          <span
            className="inline-block mt-2 px-2 py-0.5 rounded-md bg-white text-[11px] font-bold"
            style={{ color: accent }}
          >
            {card.couponCode.toUpperCase()}
          </span>
        ) : card.ctaLabel ? (
          <span className="inline-block mt-2 text-xs font-bold" style={{ color: accent }}>
            {card.ctaLabel} →
          </span>
        ) : null}
      </div>
      {card.imageUrl && (
        <img
          src={card.imageUrl}
          alt=""
          className="rounded-xl object-cover flex-shrink-0"
          style={{ width: 72, height: 72 }}
        />
      )}
    </div>
  );
}
