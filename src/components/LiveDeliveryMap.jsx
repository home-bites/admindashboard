import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Map as MapIcon } from '@mui/icons-material';
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
 */
export default function LiveDeliveryMap({ riders = [], height = 600 }) {
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
      <Paper
        sx={{
          height, display: 'flex', alignItems: 'center',
          justifyContent: 'center', bgcolor: 'grey.100', borderRadius: 2,
        }}
      >
        <Box sx={{ textAlign: 'center', px: 4 }}>
          <MapIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
          <Typography variant="subtitle1" color="text.secondary">
            {MAPS_ENABLED ? 'Map could not load' : 'Map not configured'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {MAPS_ENABLED
              ? 'Check that this domain is allowed on the Maps API key.'
              : 'Set VITE_GOOGLE_MAPS_KEY and restart the dev server.'}
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={holderRef}
        sx={{ height, borderRadius: 2, overflow: 'hidden', bgcolor: 'grey.200' }}
      />
      <Paper
        elevation={2}
        sx={{
          position: 'absolute', left: 12, bottom: 12,
          px: 1.5, py: 0.75, display: 'flex', gap: 2, alignItems: 'center',
        }}
      >
        <Legend colour="#10b981" label="Online" />
        <Legend colour="#dc2626" label="Low battery" />
        <Legend colour="#94a3b8" label="Idle" />
        <Typography variant="caption" color="text.secondary">
          {plottable.length} tracked
        </Typography>
      </Paper>
    </Box>
  );
}

function Legend({ colour, label }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colour }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
