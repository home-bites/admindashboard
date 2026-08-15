import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, MAPS_ENABLED } from '../lib/googleMaps';

/**
 * Live positions of riders who are currently out on a delivery.
 *
 * Replaces a grey "Live Map Stub" panel that had sat there since the page was
 * written. Riders already report `currentLatitude` / `currentLongitude` on
 * every position update, so the data existed — nothing was drawing it.
 *
 * Markers are created once and then *moved*, rather than being cleared and
 * rebuilt on each snapshot. Recreating them makes the map flicker on every
 * update and throws away Google's own marker animation, which is the thing
 * that makes movement legible.
 *
 * Styling is Tailwind rather than MUI. This component and its page were the
 * only two of thirty-one using MUI, which is why the panel never sat right
 * next to the rest of the dashboard: different type scale, different spacing
 * unit, different shadow ramp.
 */
export default function LiveDeliveryMap({ riders = [], className = '' }) {
  const holderRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());   // riderId -> google.maps.Marker
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Riders with a usable fix. A rider who has never reported cannot be drawn,
  // and (0, 0) is the Gulf of Guinea rather than a real position — that pair
  // is what an uninitialised field looks like, so it is excluded explicitly.
  const plottable = riders.filter(
    (r) =>
      Number.isFinite(Number(r.currentLatitude)) &&
      Number.isFinite(Number(r.currentLongitude)) &&
      !(Number(r.currentLatitude) === 0 && Number(r.currentLongitude) === 0),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadGoogleMaps();
      if (cancelled || !ok || !holderRef.current) { setFailed(true); return; }

      const g = window.google.maps;
      mapRef.current = new g.Map(holderRef.current, {
        // Guntur. Only the opening view — it re-centres on the riders below.
        center: { lat: 16.3067, lng: 80.4365 },
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google.maps;
    const map = mapRef.current;
    const seen = new Set();

    plottable.forEach((r) => {
      const pos = {
        lat: Number(r.currentLatitude),
        lng: Number(r.currentLongitude),
      };
      seen.add(r.id);

      // Colour carries the battery warning, so a dispatcher watching the map
      // sees a rider about to go dark without cross-referencing the list.
      const low = typeof r.batteryLevel === 'number' && r.batteryLevel <= 15;
      const colour = low ? '#dc2626' : r.isOnline ? '#10b981' : '#94a3b8';

      const existing = markersRef.current.get(r.id);
      if (existing) {
        existing.setPosition(pos);
        existing.setIcon({ ...existing.getIcon(), fillColor: colour });
        return;
      }

      const marker = new g.Marker({
        position: pos,
        map,
        title: `${r.name || 'Rider'}${
          typeof r.batteryLevel === 'number' ? ` · ${r.batteryLevel}%` : ''
        }`,
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: colour,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      markersRef.current.set(r.id, marker);
    });

    // A rider who went offline should leave the map, not linger at their last
    // known spot pretending to still be there.
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    // Frame everyone. Skipped for a single rider, because fitBounds on one
    // point zooms to maximum and shows a rooftop instead of a neighbourhood.
    if (plottable.length > 1) {
      const bounds = new g.LatLngBounds();
      plottable.forEach((r) =>
        bounds.extend({
          lat: Number(r.currentLatitude),
          lng: Number(r.currentLongitude),
        }),
      );
      map.fitBounds(bounds, 64);
    } else if (plottable.length === 1) {
      map.setCenter({
        lat: Number(plottable[0].currentLatitude),
        lng: Number(plottable[0].currentLongitude),
      });
      map.setZoom(15);
    }
  }, [ready, plottable]);

  if (!MAPS_ENABLED || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-[#dce2f3] bg-slate-50 ${className}`}
      >
        <div className="px-6 text-center">
          <span className="material-symbols-outlined mb-2 text-5xl text-slate-300">
            map
          </span>
          <p className="text-xs font-bold text-slate-600">
            {MAPS_ENABLED ? 'Map could not load' : 'Map not configured'}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">
            {MAPS_ENABLED
              ? 'Check that this domain is allowed on the Maps API key.'
              : 'Set VITE_GOOGLE_MAPS_KEY and restart the dev server.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-[#dce2f3] ${className}`}>
      {/* The map fills its parent rather than taking a fixed pixel height.
          A hardcoded 600px was taller than the viewport on a laptop, which
          is what pushed the legend off the bottom of the panel. */}
      <div ref={holderRef} className="h-full w-full bg-slate-200" />

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-lg border border-[#dce2f3] bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
        <Legend colour="#10b981" label="Online" />
        <Legend colour="#dc2626" label="Low battery" />
        <Legend colour="#94a3b8" label="Idle" />
        <span className="border-l border-slate-200 pl-3 text-[11px] font-bold text-slate-500">
          {plottable.length} tracked
        </span>
      </div>
    </div>
  );
}

function Legend({ colour, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
    </span>
  );
}
