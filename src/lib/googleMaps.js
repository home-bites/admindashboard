/**
 * Loads the Google Maps JavaScript API on demand.
 *
 * Uses the `callback` parameter rather than `importLibrary`. That function is
 * defined by the inline bootstrap snippet in Google's docs, not by the API
 * itself — loading the plain script URL and then calling it throws
 * "importLibrary is not a function". The callback fires once the core API,
 * including google.maps.Map, is ready, and works on every version.
 *
 * Resolves false instead of throwing so the caller can show an explanation
 * rather than an empty panel.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || "";

/** False when no key is configured, so callers can explain rather than hang. */
export const MAPS_ENABLED = Boolean(KEY);

/**
 * Give up after this long.
 *
 * A key rejected by referrer restrictions fires neither `load` nor `error` —
 * the script tag simply never resolves. Without a timeout the panel spins
 * forever and looks like a code fault rather than a console setting.
 */
const LOAD_TIMEOUT_MS = 15000;
const CALLBACK = "__hbAdminMapsReady";

let pending = null;

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!KEY) return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);
  if (pending) return pending;

  pending = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (!ok) pending = null; // let a later mount retry
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);

    window[CALLBACK] = () => {
      clearTimeout(timer);
      finish(Boolean(window.google?.maps?.Map));
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}` +
      `&v=weekly&loading=async&callback=${CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.dataset.hbMaps = "1";
    script.onerror = () => { clearTimeout(timer); finish(false); };
    document.head.appendChild(script);
  });

  return pending;
}
