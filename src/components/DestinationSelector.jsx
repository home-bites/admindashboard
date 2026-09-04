import React, { useEffect, useState, useMemo } from "react";
import { useCategoryStore } from "../store/categoryStore";
import { useMenuStore } from "../store/menuStore";
import { useCouponStore } from "../store/couponStore";

export const DESTINATION_TYPES = [
  { value: "home", label: "Home Screen", hint: "Customer app home feed" },
  { value: "category", label: "Menu / Category", hint: "Specific food category dishes" },
  { value: "food", label: "Food Item", hint: "Specific dish details & order sheet" },
  { value: "coupon", label: "Coupon", hint: "Opens offers tab with a specific coupon" },
  { value: "offers", label: "Offers & Deals", hint: "All active deals, discounts & specials" },
  { value: "diet", label: "Diet / Subscription", hint: "Diet meal plans & subscription management" },
  { value: "orders", label: "My Orders", hint: "Customer's past & live orders" },
  { value: "wallet", label: "User Wallet", hint: "Wallet balance & transaction ledger" },
];

export function buildRedirectUrl(destinationType, destinationId) {
  const type = (destinationType || "offers").toLowerCase().trim();
  const id = (destinationId || "").trim();
  switch (type) {
    case "food":
    case "dish":
    case "menuitem":
      return id ? `dish:${id}` : "menu";
    case "category":
      return id ? `category:${id}` : "menu";
    case "coupon":
      return id ? `coupon:${id}` : "offers";
    case "offers":
      return "offers";
    case "diet":
      return "diet";
    case "orders":
      return id ? `order:${id}` : "orders";
    case "wallet":
      return "wallet";
    case "home":
    default:
      return "home";
  }
}

export function parseDestination(destinationType, destinationId, redirectUrl = "") {
  if (destinationType) {
    return {
      destinationType: destinationType.toLowerCase().trim(),
      destinationId: destinationId ? String(destinationId).trim() : "",
    };
  }

  const raw = (redirectUrl || "").trim();
  if (!raw) return { destinationType: "offers", destinationId: "" };

  if (raw.includes(":")) {
    const [t, ...rest] = raw.split(":");
    const id = rest.join(":").trim();
    const cleanT = t.toLowerCase().trim();
    if (cleanT === "category" || cleanT === "cat") return { destinationType: "category", destinationId: id };
    if (cleanT === "dish" || cleanT === "menuitem" || cleanT === "food") return { destinationType: "food", destinationId: id };
    if (cleanT === "coupon") return { destinationType: "coupon", destinationId: id };
    if (cleanT === "order") return { destinationType: "orders", destinationId: id };
  }

  const lower = raw.toLowerCase().trim();
  if (lower === "menu" || lower === "all-dishes") return { destinationType: "category", destinationId: "" };
  if (lower === "offers" || lower === "coupons" || lower === "deals") return { destinationType: "offers", destinationId: "" };
  if (lower === "wallet") return { destinationType: "wallet", destinationId: "" };
  if (lower === "orders" || lower === "my-orders") return { destinationType: "orders", destinationId: "" };
  if (lower === "diet" || lower.startsWith("diet_")) return { destinationType: "diet", destinationId: "" };
  if (lower === "home") return { destinationType: "home", destinationId: "" };

  return { destinationType: "offers", destinationId: "" };
}

export default function DestinationSelector({
  destinationType = "offers",
  destinationId = "",
  onChange,
  className = "",
}) {
  const { categories, subscribeCategories, disconnectCategories } = useCategoryStore();
  const { menuItems, subscribeMenuItems, disconnectMenuItems } = useMenuStore();
  const { coupons, subscribeCoupons, disconnectCoupons } = useCouponStore();

  const [foodSearch, setFoodSearch] = useState("");

  useEffect(() => {
    subscribeCategories();
    subscribeMenuItems();
    subscribeCoupons();
    return () => {
      disconnectCategories();
      disconnectMenuItems();
      disconnectCoupons();
    };
  }, [subscribeCategories, subscribeMenuItems, subscribeCoupons, disconnectCategories, disconnectMenuItems, disconnectCoupons]);

  const activeCategories = useMemo(() => {
    return categories.filter((c) => c.isActive !== false && c.isDeleted !== true);
  }, [categories]);

  const activeMenuItems = useMemo(() => {
    return menuItems.filter((i) => i.isDeleted !== true);
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    if (!foodSearch.trim()) return activeMenuItems;
    const q = foodSearch.toLowerCase().trim();
    return activeMenuItems.filter(
      (item) =>
        (item.name || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q) ||
        (item.categoryId || "").toLowerCase().includes(q)
    );
  }, [activeMenuItems, foodSearch]);

  const activeCoupons = useMemo(() => {
    return coupons.filter((c) => c.isActive !== false && c.isDeleted !== true);
  }, [coupons]);

  const handleTypeChange = (newType) => {
    let newId = "";
    if (newType === "category" && activeCategories.length > 0) {
      newId = activeCategories[0].id;
    } else if (newType === "food" && activeMenuItems.length > 0) {
      newId = activeMenuItems[0].id;
    } else if (newType === "coupon" && activeCoupons.length > 0) {
      newId = activeCoupons[0].code || activeCoupons[0].id;
    }

    const redirectUrl = buildRedirectUrl(newType, newId);
    if (onChange) {
      onChange({ destinationType: newType, destinationId: newId, redirectUrl });
    }
  };

  const handleIdChange = (newId) => {
    const redirectUrl = buildRedirectUrl(destinationType, newId);
    if (onChange) {
      onChange({ destinationType, destinationId: newId, redirectUrl });
    }
  };

  const inputCls =
    "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-900 text-sm outline-none focus:border-emerald-500 transition font-medium text-slate-800 dark:text-slate-100";

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
          Destination Type <span className="text-emerald-600">*</span>
        </label>
        <select
          value={destinationType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className={inputCls}
        >
          {DESTINATION_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label} — ({dt.hint})
            </option>
          ))}
        </select>
      </div>

      {/* Dynamic Sub-Selector 1: Food Item */}
      {destinationType === "food" && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Select Food / Menu Item <span className="text-emerald-600">*</span>
            </label>
            <span className="text-xs text-slate-400">
              {activeMenuItems.length} available
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search dishes by name..."
              value={foodSearch}
              onChange={(e) => setFoodSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-emerald-500"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              search
            </span>
          </div>

          <select
            value={destinationId}
            onChange={(e) => handleIdChange(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Choose a Dish --</option>
            {filteredMenuItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.price ? `(₹${item.price})` : ""} {item.foodType ? `[${item.foodType}]` : ""}
              </option>
            ))}
          </select>
          {destinationId && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Selected Item Doc ID: <span className="font-mono">{destinationId}</span>
            </p>
          )}
        </div>
      )}

      {/* Dynamic Sub-Selector 2: Menu / Category */}
      {destinationType === "category" && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Select Category <span className="text-emerald-600">*</span>
          </label>
          <select
            value={destinationId}
            onChange={(e) => handleIdChange(e.target.value)}
            className={inputCls}
          >
            <option value="">-- All Categories (Full Menu) --</option>
            {activeCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {destinationId && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Selected Category ID: <span className="font-mono">{destinationId}</span>
            </p>
          )}
        </div>
      )}

      {/* Dynamic Sub-Selector 3: Coupon */}
      {destinationType === "coupon" && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Select Coupon Code <span className="text-emerald-600">*</span>
          </label>
          <select
            value={destinationId}
            onChange={(e) => handleIdChange(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Choose a Coupon --</option>
            {activeCoupons.map((c) => {
              const code = c.code || c.id;
              const desc = c.discountPercentage
                ? `${c.discountPercentage}% OFF`
                : c.discountAmount
                ? `₹${c.discountAmount} OFF`
                : c.title || "";
              return (
                <option key={c.id || code} value={code}>
                  {code} {desc ? `— ${desc}` : ""}
                </option>
              );
            })}
          </select>
          {destinationId && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Selected Coupon: <span className="font-mono font-bold">{destinationId}</span>
            </p>
          )}
        </div>
      )}

      {/* Direct landing info chip for non-parameterized destinations */}
      {["home", "offers", "diet", "orders", "wallet"].includes(destinationType) && (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-medium">
          <span className="material-symbols-outlined text-sm">navigation</span>
          <span>
            {destinationType === "home" && "Opens customer home screen feed directly."}
            {destinationType === "offers" && "Opens all ongoing restaurant combo deals & promo offers."}
            {destinationType === "diet" && "Opens Diet Meals & Subscription plans management."}
            {destinationType === "orders" && "Opens customer's live tracking and past order history."}
            {destinationType === "wallet" && "Opens HomBites digital cash wallet & top-up screen."}
          </span>
        </div>
      )}
    </div>
  );
}
