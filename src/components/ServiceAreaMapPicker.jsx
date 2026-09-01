import React, { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, MAPS_ENABLED } from "../lib/googleMaps";

/**
 * Map picker for a radius-based service area.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Service Areas was a form with three number inputs: centre latitude, centre
 * longitude and radius. Defining where the business delivers meant reading
 * coordinates off some other map and typing them in, with no way to see the
 * resulting circle, no way to see it against the areas that already existed,
 * and no way to notice that a digit had been fat-fingered until customers
 * outside the zone started being refused.
 *
 * The data model is unchanged — this writes the same `centerLat`, `centerLng`
 * and `radiusKm` the page always saved, and the customer app's service-area
 * enforcement is untouched. What changes is that the admin can now see and
 * drag the thing they are defining.
 *
 * ── Deliberate choices ───────────────────────────────────────────────────
 *
 * **Geocoder, not Places Autocomplete.** `google.maps.Geocoder` ships with the
 * core API; Places is a separate library, and requesting it would mean editing
 * the shared loader that `LiveDeliveryMap` also uses. A geocoder search box
 * covers "find Brodipet, Guntur" without that blast radius.
 *
 * **Controlled from the parent.** Centre and radius live in the form's state,
 * so typing a coordinate moves the map and dragging the map updates the
 * inputs. One source of truth, either direction.
 *
 * **Degrades to the old form.** With no `VITE_GOOGLE_MAPS_KEY`, or if the
 * script fails, this renders an explanation and the numeric inputs keep
 * working exactly as before. The map is an improvement to the editing
 * experience, not a new dependency for defining coverage.
 */
const ServiceAreaMapPicker = ({
  centerLat,
  centerLng,
  radiusKm,
  onChange,
  otherAreas = [],
  fallbackCenter = { lat: 16.3067, lng: 80.4365 },
}) => {
  const holderRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const othersRef = useRef([]);
  const geocoderRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // The parent owns these; the map reads them on every render. Held in a ref
  // as well so the map's own event handlers see current values without being
  // torn down and rebuilt on each keystroke.
  const latestRef = useRef({ centerLat, centerLng, radiusKm, onChange });
  latestRef.current = { centerLat, centerLng, radiusKm, onChange };

  const hasPoint =
    Number.isFinite(Number(centerLat)) &&
    Number.isFinite(Number(centerLng)) &&
    centerLat !== "" &&
    centerLng !== "";

  /* ── Boot the map once ─────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await loadGoogleMaps();
      if (cancelled) return;
      if (!ok || !holderRef.current) {
        setFailed(true);
        return;
      }

      const g = window.google.maps;
      const start = hasPoint
        ? { lat: Number(centerLat), lng: Number(centerLng) }
        : fallbackCenter;

      const map = new g.Map(holderRef.current, {
        center: start,
        zoom: hasPoint ? 13 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      mapRef.current = map;
      geocoderRef.current = new g.Geocoder();

      // Clicking anywhere sets the centre. This is the primary interaction —
      // the whole point is not having to know the number.
      map.addListener("click", (e) => {
        const { onChange: cb } = latestRef.current;
        cb({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // Boot once. Subsequent coordinate changes are handled by the sync effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Keep marker and circle in step with the form ──────────────────── */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google.maps;
    const map = mapRef.current;

    if (!hasPoint) {
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      return;
    }

    const pos = { lat: Number(centerLat), lng: Number(centerLng) };
    const radiusMetres = Math.max(0, Number(radiusKm) || 0) * 1000;

    if (!markerRef.current) {
      markerRef.current = new g.Marker({
        map,
        position: pos,
        draggable: true,
        title: "Service area centre — drag to move",
      });
      // Dragging is the fine adjustment after the click puts it roughly right.
      markerRef.current.addListener("dragend", (e) => {
        const { onChange: cb } = latestRef.current;
        cb({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
    } else {
      markerRef.current.setPosition(pos);
    }

    if (!circleRef.current) {
      circleRef.current = new g.Circle({
        map,
        center: pos,
        radius: radiusMetres,
        strokeColor: "#10b981",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#10b981",
        fillOpacity: 0.12,
      });
    } else {
      circleRef.current.setCenter(pos);
      circleRef.current.setRadius(radiusMetres);
    }
  }, [ready, centerLat, centerLng, radiusKm, hasPoint]);

  /* ── Draw the areas that already exist ─────────────────────────────── */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google.maps;

    othersRef.current.forEach((c) => c.setMap(null));
    othersRef.current = [];

    // Grey, behind the one being edited, so an overlap is visible while it is
    // being created rather than reported by the validator afterwards.
    otherAreas.forEach((a) => {
      const lat = Number(a.centerLat);
      const lng = Number(a.centerLng);
      const r = Number(a.radiusKm);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r)) return;

      othersRef.current.push(
        new g.Circle({
          map: mapRef.current,
          center: { lat, lng },
          radius: r * 1000,
          strokeColor: a.isActive === false ? "#94a3b8" : "#475569",
          strokeOpacity: 0.7,
          strokeWeight: 1,
          fillColor: "#64748b",
          fillOpacity: a.isActive === false ? 0.04 : 0.08,
          clickable: false,
          zIndex: 1,
        }),
      );
    });

    return () => {
      othersRef.current.forEach((c) => c.setMap(null));
      othersRef.current = [];
    };
  }, [ready, otherAreas]);

  /* ── Recentre when the point moves far from view ───────────────────── */
  useEffect(() => {
    if (!ready || !mapRef.current || !hasPoint) return;
    const map = mapRef.current;
    const pos = new window.google.maps.LatLng(Number(centerLat), Number(centerLng));
    // Only pan when the point has left the viewport, so typing a radius does
    // not yank the map around under the operator.
    const bounds = map.getBounds();
    if (bounds && !bounds.contains(pos)) map.panTo(pos);
  }, [ready, centerLat, centerLng, hasPoint]);

  const runSearch = async (e) => {
    e?.preventDefault();
    const term = search.trim();
    if (!term || !geocoderRef.current) return;

    setSearching(true);
    setSearchError("");
    try {
      const { results } = await geocoderRef.current.geocode({ address: term });
      const hit = results?.[0];
      if (!hit) {
        setSearchError("No match for that place.");
        return;
      }
      const loc = hit.geometry.location;
      onChange({ lat: loc.lat(), lng: loc.lng() });
      mapRef.current?.panTo(loc);
      mapRef.current?.setZoom(13);
    } catch (err) {
      // ZERO_RESULTS arrives as a rejection, so an unknown place lands here
      // too — worth distinguishing from a key or network problem.
      setSearchError(
        String(err?.code || err).includes("ZERO_RESULTS")
          ? "No match for that place."
          : "Search failed. Check the Maps key or your connection.",
      );
    } finally {
      setSearching(false);
    }
  };

  if (!MAPS_ENABLED || failed) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <span className="material-symbols-outlined text-[26px] text-slate-400">map</span>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          {MAPS_ENABLED ? "Map could not load" : "Map not configured"}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {MAPS_ENABLED
            ? "The Maps script did not load. Check the API key's referrer restrictions."
            : "Set VITE_GOOGLE_MAPS_KEY to pick the centre on a map."}{" "}
          The coordinate fields below still work.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <form onSubmit={runSearch} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a place, e.g. Brodipet, Guntur"
          aria-label="Search for a location"
          className="min-w-0 flex-grow rounded-md border border-slate-300 px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={searching || !search.trim()}
          className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {searchError && (
        <p className="text-[11px] font-medium text-rose-600">{searchError}</p>
      )}

      <div
        ref={holderRef}
        role="application"
        aria-label="Service area map. Click to set the centre."
        className="h-[300px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      />

      <p className="text-[11px] leading-snug text-slate-500">
        {hasPoint
          ? "Click the map or drag the pin to move the centre. The green circle is this area; grey circles are areas that already exist."
          : "Click the map to place the centre of this service area."}
      </p>
    </div>
  );
};

export default ServiceAreaMapPicker;
