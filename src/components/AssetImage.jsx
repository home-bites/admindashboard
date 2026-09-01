import React, { useEffect, useState } from "react";

/**
 * An image that admits when there is no image.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 *
 * Diet Categories, Diet Foods and Meal Plans each rendered
 * `src={item.imageUrl || "https://images.unsplash.com/..."}`. An item with no
 * picture therefore displayed a professional stock photograph of food, and an
 * item whose picture had a dead URL displayed nothing or a browser-broken
 * icon. Both are wrong in the same direction:
 *
 *  - The admin cannot tell which items are missing images, because the ones
 *    missing images look the best.
 *  - Customers see the real state — an empty slot — which the dashboard was
 *    specifically hiding from the only people able to fix it.
 *  - Every such page also fetched images from a third-party CDN on load.
 *
 * A placeholder is fine; a placeholder that looks like real content is not.
 * This renders an unmistakably empty slot, and says so again if a URL that
 * exists fails to load, so "no image" and "broken image" stay distinct.
 *
 * @param {string} src
 * @param {string} alt
 * @param {string} [className]  applied to the <img>; the placeholder fills the
 *                              same box
 * @param {string} [label="No image"]
 */
export const AssetImage = ({ src, alt = "", className = "", label = "No image" }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  if (!src || broken) {
    return (
      <div
        role="img"
        aria-label={broken ? `${alt} — image failed to load` : `${alt} — no image`}
        className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 ${className}`}
      >
        <span className="material-symbols-outlined text-[22px]">
          {broken ? "broken_image" : "image_not_supported"}
        </span>
        <span className="px-2 text-center text-[10px] font-semibold leading-tight">
          {broken ? "Image failed to load" : label}
        </span>
      </div>
    );
  }

  return (
    <img src={src} alt={alt} className={className} onError={() => setBroken(true)} loading="lazy" />
  );
};

export default AssetImage;
