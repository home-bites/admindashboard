import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useBannerStore } from "../store/bannerStore";
import { useCategoryStore } from "../store/categoryStore";
import { useMenuStore } from "../store/menuStore";
import { uploadFile } from "../firebase/storage";
import { notificationRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import * as LoadingComponents from "../components/LoadingComponents";

/**
 * Largest banner image accepted.
 *
 * Banners are downloaded by every customer opening the app, so the ceiling is
 * about their experience, not about what Storage will accept. `uploadFile`
 * compresses to 1200px wide before upload; this stops a 40 MB original from
 * being read into memory and canvas-resized on the admin's machine first.
 */
const MAX_BANNER_BYTES = 5 * 1024 * 1024;

export const Banners = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { banners, loading, error, subscribeBanners, disconnectBanners, addBanner, updateBanner, deleteBanner } = useBannerStore();
  const { categories, subscribeCategories, disconnectCategories } = useCategoryStore();
  const { menuItems, subscribeMenuItems, disconnectMenuItems } = useMenuStore();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editBannerId, setEditBannerId] = useState(null);

  // Form Fields
  const [bannerName, setBannerName] = useState("");
  const [bannerImage, setBannerImage] = useState("");
  const [bannerType, setBannerType] = useState("Offer");
  const [redirectTarget, setRedirectTarget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [bannerActive, setBannerActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  // Opt-in, and only offered when creating — see handleSaveBanner.
  const [notifyCustomers, setNotifyCustomers] = useState(false);

  useEffect(() => {
    subscribeBanners();
    subscribeCategories();
    subscribeMenuItems();
    return () => {
      disconnectBanners();
      disconnectCategories();
      disconnectMenuItems();
    };
  }, [subscribeBanners, subscribeCategories, subscribeMenuItems, disconnectBanners, disconnectCategories, disconnectMenuItems]);

  const handleOpenAddDrawer = () => {
    setEditBannerId(null);
    setBannerName("");
    setBannerImage("");
    setBannerType("Offer");
    setRedirectTarget("");
    setStartDate("");
    setEndDate("");
    setDisplayOrder(0);
    setBannerActive(true);
    setNotifyCustomers(false);
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (banner) => {
    setEditBannerId(banner.id);
    setBannerName(banner.name || banner.title || "");
    setBannerImage(banner.image || "");
    setBannerType(banner.bannerType || "Offer");
    setRedirectTarget(banner.redirectTarget || "");
    setStartDate(banner.startDate || "");
    setEndDate(banner.endDate || "");
    setDisplayOrder(banner.displayOrder || 0);
    setBannerActive(banner.status !== "Paused");
    setIsDrawerOpen(true);
  };

  const handleToggleStatus = async (banner) => {
    const currentVal = banner.status;
    const newStatus = currentVal === "Active" ? "Paused" : "Active";
    try {
      // Only the field being changed. This used to send `{...banner, status}`,
      // writing every field of a possibly-stale local copy back over the
      // document — including `id`, `createdAt` and `isDeleted`. If a colleague
      // had edited the banner since this list was rendered, toggling its
      // status silently reverted their edit.
      await updateBanner(banner.id, { status: newStatus }, user);
      addToast(
        `Banner is now ${newStatus}`,
        newStatus === "Active" ? "success" : "warning"
      );
    } catch (err) {
      addToast(`Error updating banner status: ${err.message}`, "error");
    }
  };

  /**
   * Banner image upload.
   *
   * Previously this accepted whatever the file picker returned and reported
   * "uploaded successfully" on the strength of the call not throwing. Three
   * gaps are closed here:
   *
   *  - The file is checked to be an image of a sane size before any upload
   *    starts. A PDF or a 40 MB TIFF used to be compressed (badly, or not at
   *    all) and pushed to Storage, ending up on every customer's home screen.
   *  - The real error message is surfaced. `uploadFile` distinguishes a CORS
   *    misconfiguration from an oversized file and says which; that detail was
   *    being replaced with a generic failure toast, leaving nothing to act on.
   *  - The input is reset, so re-picking the same file after a failed attempt
   *    fires `change` again. Without it a retry with the same file silently
   *    did nothing.
   */
  const handleImageChange = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      addToast("Choose an image file (JPG, PNG or WebP).", "error");
      input.value = "";
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      addToast(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep banners under ${MAX_BANNER_BYTES / 1024 / 1024} MB.`,
        "error",
      );
      input.value = "";
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const imageUrl = await uploadFile(
        file,
        `banners/${Date.now()}_${file.name}`,
        setUploadProgress,
      );
      setBannerImage(imageUrl);
      addToast("Banner image uploaded", "success");
    } catch (err) {
      addToast(err?.message || "Failed to upload banner image", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      input.value = "";
    }
  };

  const handleSaveBanner = async (e) => {
    e.preventDefault();
    if (!bannerName.trim() || !redirectTarget.trim()) {
      addToast("Please fill in the banner name and redirect target", "error");
      return;
    }

    /*
     * A banner is a picture. Saving one without an image used to substitute a
     * hardcoded Unsplash stock photograph of a table setting — see the note on
     * the payload below — so this now simply requires the image the feature is
     * built around.
     */
    if (!bannerImage) {
      addToast("Upload a banner image before saving.", "error");
      return;
    }

    // An end date before the start date produces a banner that can never be
    // live, with nothing on screen to explain why it never appeared.
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      addToast("The end date is before the start date.", "error");
      return;
    }

    if (saving) return; // Double-submit guard on a create.
    setSaving(true);

    const calculatedStatus = bannerActive
      ? startDate && new Date(startDate) > new Date()
        ? "Scheduled"
        : "Active"
      : "Paused";

    const payload = {
      name: bannerName,
      title: bannerName, // Map to both for schema compatibility
      bannerType,
      redirectTarget,
      startDate,
      endDate,
      displayOrder: Number(displayOrder),
      status: calculatedStatus,
      /*
       * This used to fall back to a hardcoded Unsplash URL — a stock
       * photograph of a restaurant table, served from a third-party CDN,
       * shown to real customers on the app's home carousel as though it were
       * HomBites content. It was also an uncontrolled external dependency in
       * the customer-facing UI. The image is now required at validation
       * above, so there is nothing to fall back to.
       */
      image: bannerImage,
    };

    try {
      if (editBannerId) {
        await updateBanner(editBannerId, payload, user);
        addToast("Banner updated", "success");
      } else {
        await addBanner(payload, user);

        /*
         * The marketing broadcast is now opt-in, and no longer able to fail
         * the save.
         *
         * It used to fire on every single banner creation, with no way to
         * decline: adding a banner pushed a notification to the entire
         * customer base, so correcting a typo by deleting and re-adding one
         * notified everyone twice. It was also awaited inside the same `try`
         * as the banner write, so a notification failure — a rules rejection,
         * say — surfaced as "Error saving banner" for a banner that had in
         * fact been created, inviting the admin to create it a second time.
         */
        if (notifyCustomers) {
          try {
            await notificationRepository.create({
              userId: "all",
              type: "marketing",
              title: "New Highlight Added!",
              message: `Check out our new featured update: ${bannerName}!`,
              isRead: false,
            });
            addToast("Banner added and customers notified", "success");
          } catch (notifyErr) {
            addToast(
              `Banner added, but the customer notification failed: ${notifyErr.message}`,
              "warning",
            );
          }
        } else {
          addToast("Banner added", "success");
        }
      }
      setIsDrawerOpen(false);
    } catch (err) {
      addToast(`Error saving banner: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBanner = async (id, name) => {
    if (confirm(`Are you sure you want to delete the banner "${name}"?`)) {
      try {
        await deleteBanner(id, user);
        addToast(`Banner "${name}" deleted (Soft Delete)`, "success");
      } catch (err) {
        addToast(`Error deleting banner: ${err.message}`, "error");
      }
    }
  };

  if (loading && banners.length === 0) {
    return <LoadingComponents.LoadingPage />;
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-[#151c27]">Banner Management</h1>
          <p className="font-body-sm text-body-sm text-[#555f6f] mt-1">
            Manage promotional carousels and featured placements across the app.
          </p>
        </div>
        <button
          onClick={handleOpenAddDrawer}
          className="bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md px-4 py-2.5 rounded flex items-center gap-2 shadow-sm border-t border-white/20 transition-all inner-shine"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add Banner
        </button>
      </div>

      {/* Grid of Banners */}
      {/* A broken listener is not an empty collection. Checked before the
          empty state, so a failure can never render as "no banners". */}
      {error ? (
        <ErrorState
          title="Could not load banners"
          message={error}
          onRetry={() => { disconnectBanners(); subscribeBanners(); }}
        />
      ) : banners.length === 0 ? (
        <EmptyState
          icon="ads_click"
          title="No Banners Found"
          description="Create promotional carousels to highlight offers."
          actionText="Add Banner"
          onActionClick={handleOpenAddDrawer}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className={`bg-white rounded-xl border border-[#dce2f3] overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col ${
                banner.status === "Paused" ? "opacity-75" : ""
              }`}
            >
              {/* Thumbnail */}
              <div className="relative h-40 bg-slate-100 w-full overflow-hidden">
                <img
                  alt={banner.name || banner.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  src={banner.image}
                />
                <div
                  className={`absolute top-3 left-3 px-2.5 py-1 rounded font-label-sm text-label-sm flex items-center gap-1 shadow-sm backdrop-blur-sm bg-opacity-90 ${
                    banner.status === "Active"
                      ? "bg-[#ecfdf5] text-[#006c49]"
                      : banner.status === "Scheduled"
                      ? "bg-[#fff8e1] text-[#5f1900]"
                      : "bg-[#f0f3ff] text-[#555f6f]"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {banner.status === "Active"
                      ? "check_circle"
                      : banner.status === "Scheduled"
                      ? "schedule"
                      : "pause_circle"}
                  </span>
                  {banner.status}
                </div>
              </div>
              
              {/* Details */}
              <div className="p-4 flex flex-col flex-1 gap-4">
                <div className="flex justify-between items-start">
                  <h3 className="font-headline-sm text-headline-sm text-[#151c27] font-bold truncate pr-2" title={banner.name || banner.title}>
                    {banner.name || banner.title}
                  </h3>
                  
                  {/* Status Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer mt-1 shrink-0">
                    <input
                      checked={banner.status === "Active" || banner.status === "Scheduled"}
                      onChange={() => handleToggleStatus(banner)}
                      className="sr-only peer"
                      type="checkbox"
                    />
                    <div className="w-9 h-5 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                  </label>
                </div>
                <div className="flex flex-col gap-2 mt-auto">
                  <div className="flex items-center gap-2 text-[#555f6f] font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-[18px]">ads_click</span>
                    <span className="truncate font-semibold text-[#151c27]">{banner.bannerType || "Offer"}:</span>
                    <span className="truncate">{banner.redirectTarget}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#555f6f] font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                    <span>
                      {banner.startDate && banner.endDate
                        ? `${banner.startDate} - ${banner.endDate}`
                        : "Ongoing Campaign"}
                    </span>
                  </div>
                  {banner.displayOrder !== undefined && (
                    <div className="flex items-center gap-2 text-[#555f6f] font-body-sm text-body-sm">
                      <span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
                      <span>Display Order: {banner.displayOrder}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="px-4 py-3 bg-[#f9f9ff] border-t border-[#dce2f3] flex justify-end gap-2">
                <button
                  onClick={() => handleOpenEditDrawer(banner)}
                  className="p-2 rounded text-[#555f6f] hover:bg-[#e7eefe] hover:text-[#151c27] transition-colors"
                  title="Edit"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
                <button
                  onClick={() => handleDeleteBanner(banner.id, banner.name || banner.title)}
                  className="p-2 rounded text-[#ba1a1a] hover:bg-[#ffdad6]/40 transition-colors"
                  title="Delete"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer */}
      {isDrawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-[#151c27]/40 backdrop-blur-sm z-50 transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          ></div>
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl border-l border-[#dce2f3] z-50 flex flex-col transition-all duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#dce2f3]">
              <h2 className="font-headline-md text-headline-md text-[#151c27] font-bold">
                {editBannerId ? "Edit Banner" : "Create New Banner"}
              </h2>
              <button
                className="p-2 rounded-full text-[#555f6f] hover:bg-[#f0f3ff] transition-colors"
                onClick={() => setIsDrawerOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveBanner} className="flex-1 flex flex-col overflow-hidden">
              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                {/* Upload Preview */}
                <div>
                  <label className="block font-label-md text-label-md text-[#151c27] mb-2 font-semibold">Banner Image</label>
                  <div className="relative border-2 border-dashed border-[#dce2f3] rounded-xl p-8 flex flex-col items-center justify-center bg-[#f9f9ff] hover:bg-[#f0f3ff] transition-colors cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      disabled={uploading}
                    />
                    {uploading ? (
                      <div className="w-full max-w-xs text-center">
                        <p className="font-label-md text-label-md text-[#10b981] font-bold">
                          Uploading… {uploadProgress}%
                        </p>
                        {/* A large banner on a slow connection took long
                            enough that "Uploading..." with no movement read as
                            a hang, and admins re-picked the file mid-upload. */}
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#dce2f3]">
                          <div
                            className="h-full rounded-full bg-[#10b981] transition-[width] duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : bannerImage ? (
                      <div className="relative w-full h-32 rounded-lg overflow-hidden">
                        <img src={bannerImage} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-white text-xs font-semibold">Change Image</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-[#f0f3ff] flex items-center justify-center text-[#555f6f] mb-3 group-hover:bg-[#10b981]/10 group-hover:text-[#10b981] transition-colors">
                          <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
                        </div>
                        <p className="font-label-md text-label-md text-[#151c27] text-center font-bold">Click to upload or drag &amp; drop</p>
                        <p className="font-body-sm text-body-sm text-[#555f6f] mt-1 text-center text-xs">Recommended 16:9 ratio (PNG, JPG)</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Inputs */}
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold" htmlFor="bannerName">
                      Banner Name / Title <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <input
                      value={bannerName}
                      onChange={(e) => setBannerName(e.target.value)}
                      className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#151c27]"
                      id="bannerName"
                      placeholder="e.g. Winter Holiday Special"
                      required
                      type="text"
                    />
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Banner Redirect Type <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <select
                      value={bannerType}
                      onChange={(e) => {
                        setBannerType(e.target.value);
                        setRedirectTarget(""); // Reset destination on change
                      }}
                      className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#151c27]"
                    >
                      <option value="Offer">Offer (Coupon)</option>
                      <option value="MenuItem">Menu Item (Food Item)</option>
                      <option value="Category">Category</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold">
                      Redirect Target <span className="text-[#ba1a1a]">*</span>
                    </label>
                    {bannerType === "MenuItem" ? (
                      <select
                        value={redirectTarget}
                        onChange={(e) => setRedirectTarget(e.target.value)}
                        className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#151c27]"
                        required
                      >
                        <option value="">Select a Menu Item</option>
                        {menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : bannerType === "Category" ? (
                      <select
                        value={redirectTarget}
                        onChange={(e) => setRedirectTarget(e.target.value)}
                        className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#151c27]"
                        required
                      >
                        <option value="">Select a Category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={redirectTarget}
                        onChange={(e) => setRedirectTarget(e.target.value)}
                        className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#151c27]"
                        placeholder="e.g. Coupon Code WELCOME20"
                        required
                        type="text"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold" htmlFor="displayOrder">
                      Display Order
                    </label>
                    <input
                      value={displayOrder}
                      onChange={(e) => setDisplayOrder(e.target.value)}
                      className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#151c27]"
                      id="displayOrder"
                      placeholder="e.g. 1"
                      type="number"
                      min="0"
                    />
                  </div>

                  {/* Schedule Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold" htmlFor="startDate">
                        Start Date
                      </label>
                      <input
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#555f6f]"
                        id="startDate"
                        type="date"
                      />
                    </div>
                    <div>
                      <label className="block font-label-md text-label-md text-[#151c27] mb-1 font-semibold" htmlFor="endDate">
                        End Date
                      </label>
                      <input
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded border border-[#d3daea] px-3 py-2 text-body-md focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 outline-none transition-all text-[#555f6f]"
                        id="endDate"
                        type="date"
                      />
                    </div>
                  </div>

                  {/* Initial Status Toggle */}
                  <div className="flex items-center justify-between mt-2 py-3 border-t border-[#dce2f3]">
                    <div>
                      <p className="font-label-md text-label-md text-[#151c27] font-semibold">Active Status</p>
                      <p className="font-body-sm text-body-sm text-[#555f6f] text-xs">Set whether this banner is active immediately.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        checked={bannerActive}
                        onChange={(e) => setBannerActive(e.target.checked)}
                        className="sr-only peer"
                        type="checkbox"
                      />
                      <div className="w-11 h-6 bg-[#d3daea] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Notifying the whole customer base is a deliberate act, so
                  it is a choice at save time rather than a side effect of
                  creating a banner. Editing never broadcasts. */}
              {!editBannerId && (
                <div className="mx-6 mb-6 rounded-xl border border-[#dce2f3] bg-[#f9f9ff] p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={notifyCustomers}
                      onChange={(e) => setNotifyCustomers(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#10b981]"
                    />
                    <span>
                      <span className="block font-label-md text-label-md font-semibold text-[#151c27]">
                        Notify all customers
                      </span>
                      <span className="mt-0.5 block text-xs text-[#555f6f]">
                        Sends a marketing notification to every customer. Leave off for
                        corrections and routine updates.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* Drawer Footer */}
              <div className="p-6 border-t border-[#dce2f3] bg-[#f9f9ff] flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 rounded border border-[#d3daea] bg-white text-[#555f6f] font-label-md text-label-md hover:bg-[#f0f3ff] transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  // Saving twice created two banners; saving mid-upload saved
                  // the previous image, or none.
                  disabled={saving || uploading}
                  className="px-4 py-2 rounded bg-[#10b981] text-white font-label-md text-label-md hover:bg-[#059669] transition-colors shadow-sm border-t border-white/20 inner-shine disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : uploading ? "Waiting for image…" : "Save Banner"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default Banners;
