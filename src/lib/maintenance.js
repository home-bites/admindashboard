import { collection, getDocs, Timestamp, GeoPoint } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/**
 * Real implementations for the Settings → Maintenance Utilities buttons.
 *
 * Both buttons previously announced success and did nothing. "Clear Cache"
 * showed "Operational cache cleared" and cleared no cache. "Backup Database"
 * waited 1.2 seconds on a setTimeout and then reported that a backup file had
 * been "generated and downloaded successfully" — there was no file, no read,
 * and nothing written to disk.
 *
 * The backup one was the dangerous half: it invites someone to click it before
 * a risky change and proceed believing they have a restore point.
 */

/* ------------------------------------------------------------------ */
/* Cache                                                              */
/* ------------------------------------------------------------------ */

/**
 * localStorage keys this dashboard owns, and whether they may be cleared.
 *
 * `homebites_auth` is excluded deliberately. Clearing it signs the admin out
 * mid-task with no warning, which is a surprising outcome for a button
 * labelled "Clear Cache" — session state is not cache.
 *
 * `HB_ADMIN_THREAT_SCORE` is also excluded. It is a security counter that
 * rises with suspicious activity; letting an admin reset it from a maintenance
 * button turns the control into one anybody can switch off. If it ever needs
 * resetting, that should be a deliberate, audited action rather than a side
 * effect of clearing caches.
 */
const CLEARABLE_KEYS = ['homebites_ui'];

/**
 * Clears what the dashboard can honestly clear, and reports exactly what went.
 *
 * @returns {Promise<{caches: number, keys: string[], serviceWorker: boolean}>}
 */
export async function clearLocalCaches() {
  const cleared = { caches: 0, keys: [], serviceWorker: false };

  // 1. Cache Storage. This is the real one — the PWA service worker keeps
  //    built assets here, and it is the cache that actually causes an admin to
  //    see a stale build after a deploy.
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      cleared.caches = names.length;
    } catch (e) {
      // Reported rather than swallowed: a cache that refused to clear is the
      // one thing the person clicking this button most needs to know about.
      throw new Error(`Could not clear asset caches: ${e.message}`);
    }
  }

  // 2. Persisted UI preferences — sidebar state, table density, dismissed
  //    banners. Safe to drop; they rebuild on next render.
  for (const key of CLEARABLE_KEYS) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      cleared.keys.push(key);
    }
  }

  // 3. Ask the service worker to step aside so the next load fetches fresh.
  //    Unregistering without reloading leaves the current page still driven by
  //    the old worker, which is why the caller reloads afterwards.
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      cleared.serviceWorker = regs.length > 0;
    } catch {
      // Non-fatal. The caches are already gone, which is the bulk of the win.
    }
  }

  return cleared;
}

/* ------------------------------------------------------------------ */
/* Backup                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every collection the dashboard's repositories know about.
 *
 * Kept as a literal list rather than discovered at runtime because Firestore
 * has no client-side "list all collections" call — the admin SDK can, the web
 * SDK cannot. A collection added to repositories/index.js and not added here
 * will be missing from the backup silently, so the two lists have to be kept
 * in step by hand.
 */
export const BACKUP_COLLECTIONS = [
  'addresses', 'appSettings', 'auditLogs', 'banners', 'carts', 'categories',
  'coupons', 'deals', 'deliveryPartners', 'dietBanners', 'dietCategories',
  'dietFoods', 'dietOffers', 'favorites', 'mealPlans', 'menuItems',
  'notifications', 'orderTracking', 'orders', 'payments', 'reviews',
  'subscriptionMealAvailability', 'subscriptionMealSelections', 'subscriptions',
  'supportTickets', 'systemCounters', 'threatScores', 'users',
  'walletTransactions',
];

/**
 * Converts Firestore's own types into something JSON can hold.
 *
 * Without this a Timestamp serialises as `{"seconds":…,"nanoseconds":…}` and a
 * GeoPoint as `{}` — the latter losing the coordinates entirely, which would
 * make a "successful" backup quietly useless for addresses.
 */
function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof GeoPoint) {
    return { _type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(toPlain);
  // DocumentReference — keep the path, which is the useful part.
  if (typeof value === 'object' && typeof value.path === 'string' && value.id) {
    return { _type: 'ref', path: value.path };
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

/**
 * Reads every collection and returns a JSON backup plus a per-collection report.
 *
 * Important limitation, surfaced in the UI as well as here: this runs in the
 * browser as the signed-in admin, so it exports **what Firestore rules let
 * that account read**. It is a convenience export, not a substitute for a
 * server-side scheduled export, and it makes no consistency guarantee — the
 * collections are read one after another, so a write landing midway shows in
 * some and not others.
 *
 * A collection that fails is recorded and the export continues. Aborting the
 * whole run because one collection was unreadable would turn a mostly-good
 * backup into no backup.
 *
 * @param {(done: number, total: number, name: string) => void} [onProgress]
 */
export async function exportFirestoreBackup(onProgress) {
  if (!db) throw new Error('Firestore is not configured.');

  const data = {};
  const report = [];
  let done = 0;

  for (const name of BACKUP_COLLECTIONS) {
    onProgress?.(done, BACKUP_COLLECTIONS.length, name);
    try {
      const snap = await getDocs(collection(db, name));
      data[name] = snap.docs.map((d) => ({ id: d.id, ...toPlain(d.data()) }));
      report.push({ collection: name, documents: snap.size, ok: true });
    } catch (e) {
      data[name] = [];
      report.push({ collection: name, documents: 0, ok: false, error: e.message });
    }
    done++;
  }

  onProgress?.(done, BACKUP_COLLECTIONS.length, '');

  const failed = report.filter((r) => !r.ok);
  const totalDocs = report.reduce((n, r) => n + r.documents, 0);

  const payload = {
    _meta: {
      generatedAt: new Date().toISOString(),
      projectId: db.app.options.projectId,
      collections: report,
      totalDocuments: totalDocs,
      note:
        'Client-side export. Contains only documents readable by the admin ' +
        'account that generated it, and is not point-in-time consistent. ' +
        'Not a replacement for a scheduled server-side export.',
    },
    data,
  };

  return { payload, report, failed, totalDocs };
}

/** Triggers a browser download without leaking the object URL. */
export function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick — revoking immediately can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
