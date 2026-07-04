import React, { useState, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useBannerStore } from "../store/bannerStore";
import { useCategoryStore } from "../store/categoryStore";
import { useMenuStore } from "../store/menuStore";
import { uploadFile } from "../firebase/storage";
import { notificationRepository } from "../repositories";
import EmptyState from "../components/EmptyState";
import * as LoadingComponents from "../components/LoadingComponents";

export const Banners = () => {
  const { addToast } = useUiStore();
  const { user } = useAuthStore();
  const { banners, loading, error, fetchBanners, addBanner, updateBanner, deleteBanner } = useBannerStore();
  const { categories, fetchCategories } = useCategoryStore();
  const { menuItems, fetchMenuItems } = useMenuStore();

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

  useEffect(() => {
    fetchBanners();
    fetchCategories();
    fetchMenuItems();
  }, [fetchBanners, fetchCategories, fetchMenuItems]);

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
      await updateBanner(banner.id, { ...banner, status: newStatus }, user);
      addToast(
        `Banner is now ${newStatus}`,
        newStatus === "Active" ? "success" : "warning"
      );
    } catch (err) {
      addToast(`Error updating banner status: ${err.message}`, "error");
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const imageUrl = await uploadFile(file, `banners/${Date.now()}_${file.name}`);
      setBannerImage(imageUrl);
      addToast("Banner image uploaded successfully", "success");
    } catch (err) {
      console.error("Upload error:", err);
      addToast("Failed to upload banner image", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveBanner = async (e) => {
    e.preventDefault();
    if (!bannerName.trim() || !redirectTarget.trim()) {
      addToast("Please fill in the banner name and redirect target", "error");
      return;
    }

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
      image: bannerImage || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600"
    };

    try {
      if (editBannerId) {
        await updateBanner(editBannerId, payload, user);
        addToast("Banner updated successfully", "success");
      } else {
        await addBanner(payload, user);

        // Send a marketing notification to all customers
        await notificationRepository.create({
          userId: "all",
          type: "marketing",
          title: "New Highlight Added!",
          message: `Check out our new featured update: ${bannerName}!`,
          isRead: false
        });

        addToast("New banner added successfully", "success");
      }
      setIsDrawerOpen(false);
    } catch (err) {
      addToast(`Error saving banner: ${err.message}`, "error");
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
      {banners.length === 0 ? (
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
                      <p className="font-label-md text-label-md text-[#10b981] font-bold">Uploading...</p>
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
                  className="px-4 py-2 rounded bg-[#10b981] text-white font-label-md text-label-md hover:bg-[#059669] transition-colors shadow-sm border-t border-white/20 inner-shine"
                >
                  Save Banner
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
