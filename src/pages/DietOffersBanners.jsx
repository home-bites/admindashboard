import React, { useState, useEffect } from "react";
// Offers are now read through the live hook, so only the banner writes need
// the service layer.
import { DietBannerService } from "../services";
import { useUiStore } from "../store/uiStore";
import { useLiveCollection } from "../hooks/useLiveCollection";
import { ImageUploader } from "../components/ImageUploader";

export const DietOffersBanners = () => {
  const { addToast } = useUiStore();

  // Live, not a one-shot read. Previously this page loaded once at mount, so
  // a banner deleted here stayed on screen — and, more confusingly, the
  // customer app's diet page kept rendering it too, making it look like the
  // delete had failed when it had actually succeeded.
  const { data: offers, loading: offersLoading, error: offersError } =
    useLiveCollection("dietOfferRepository");
  const { data: banners, loading: bannersLoading, error: bannersError } =
    useLiveCollection("dietBannerRepository");

  const loading = offersLoading || bannersLoading;
  const liveError = offersError || bannersError;

  const [activeTab, setActiveTab] = useState("BANNERS"); // BANNERS or OFFERS
  const [isModalOpen, setIsModalOpen] = useState(false);

  /*
   * An empty form, not a pre-filled one.
   *
   * The initial state carried a finished-looking banner: a title, a "Flat 20%
   * OFF" subtitle promising a discount nobody had configured, and an Unsplash
   * stock photograph. Opening the dialog and pressing save — which is exactly
   * what happens when an admin is only exploring — published all three to the
   * customer app as a live promotional banner, including an offer the business
   * had not agreed to honour.
   */
  const EMPTY_BANNER = {
    title: "",
    subtitle: "",
    imageUrl: "",
    actionUrl: "/meal-plans",
    isActive: true,
    displayOrder: 1,
  };
  const [bannerForm, setBannerForm] = useState(EMPTY_BANNER);

  // Surface a broken listener once rather than silently showing stale rows.
  useEffect(() => {
    if (liveError) addToast(`Live updates stopped: ${liveError}`, "error");
  }, [liveError, addToast]);

  // No reload after writes — the subscription delivers them, and does so from
  // the local cache before the server round-trip completes.
  const handleSaveBanner = async (e) => {
    e.preventDefault();
    try {
      await DietBannerService.create(bannerForm);
      addToast("Diet hero banner created successfully!", "success");
      setIsModalOpen(false);
    } catch (e) {
      addToast(`Error creating banner: ${e.message}`, "error");
    }
  };

  const handleDeleteBanner = async (id) => {
    if (!window.confirm("Delete this diet banner?")) return;
    try {
      await DietBannerService.delete(id);
      addToast("Diet banner removed", "info");
    } catch (e) {
      addToast(`Error deleting banner: ${e.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Diet Offers &amp; Hero Banners</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage marketing campaigns and promotional hero banners for customer app diet section.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Campaign Banner
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("BANNERS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "BANNERS"
              ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Hero Banners ({banners.length})
        </button>
        <button
          onClick={() => setActiveTab("OFFERS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "OFFERS"
              ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Special Promos ({offers.length})
        </button>
      </div>

      {/* Hero Banners Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400 gap-2">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading marketing campaigns...</span>
        </div>
      ) : activeTab === "BANNERS" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {banners.map(b => (
            <div
              key={b.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl transition-all"
            >
              <div className="relative h-44 bg-slate-800">
                <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent p-4 flex flex-col justify-end">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Active Campaign</span>
                  <h3 className="text-base font-black text-white">{b.title}</h3>
                  <p className="text-xs text-slate-300 line-clamp-1">{b.subtitle}</p>
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500">Order #{b.displayOrder || 1}</span>
                <button
                  onClick={() => handleDeleteBanner(b.id)}
                  className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center text-slate-400">
          <span className="material-symbols-outlined text-4xl text-slate-300">campaign</span>
          <p className="font-semibold text-sm mt-2">Diet promo codes and active discounts synchronized with customer app.</p>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">New Hero Banner Campaign</h2>
            <form onSubmit={handleSaveBanner} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Banner Title</label>
                <input
                  type="text"
                  required
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Subtitle / Offer Tagline</label>
                <input
                  type="text"
                  value={bannerForm.subtitle}
                  onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl text-xs"
                />
              </div>
              <div>
                <ImageUploader
                  value={bannerForm.imageUrl}
                  onChange={(url) => setBannerForm({ ...bannerForm, imageUrl: url })}
                  folder="diet_banners"
                  label="Hero Banner Image"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 border rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold">Create Campaign</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default DietOffersBanners;
