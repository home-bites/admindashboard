/**
 * Inspects and seeds the `serviceAreas` collection.
 *
 * Why this exists: the customer app's "HomeBites isn't available here yet"
 * card is driven entirely by this collection, and a real address in Gorantla
 * (a Guntur suburb roughly 4.4 km from the city centre) was being refused.
 * That is only possible if the configured zones do not actually reach it, so
 * this script first *prints* what is configured and how far the test point sits
 * from each zone, then upserts the missing ones.
 *
 * Run the diagnostic before writing anything:
 *
 *   node seed_service_areas.js --check
 *   node seed_service_areas.js --check --lat 16.3459 --lng 80.4420
 *
 * Then apply:
 *
 *   node seed_service_areas.js --apply --email admin@homebites.com --password '...'
 *
 * Writes require a dashboard admin (see isDashboardAdmin in firestore.rules);
 * reads only require any signed-in user, so --check also needs credentials.
 * Existing zones are matched by name and updated in place rather than
 * duplicated, so the script is safe to re-run.
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxA3kG-KQTjNoDhZ-yaUQ9c3B70YaMFHs",
  authDomain: "homebites-production-56afa.firebaseapp.com",
  projectId: "homebites-production-56afa",
  storageBucket: "homebites-production-56afa.firebasestorage.app",
  messagingSenderId: "552260980743",
  appId: "1:552260980743:web:f055a11755d1d7957cdaa2",
};

const COLLECTION = "serviceAreas";

/**
 * Zones to guarantee exist.
 *
 * Gorantla is inside Guntur city, so a correctly configured Guntur zone would
 * already cover it. It is listed explicitly anyway: naming it means the
 * customer-facing "we deliver to …" copy says a place the customer recognises,
 * and it survives someone later tightening the Guntur radius.
 */
const DESIRED_AREAS = [
  {
    name: "Guntur City",
    centerLat: 16.3067,
    centerLng: 80.4365,
    radiusKm: 12,
    isActive: true,
    displayOrder: 0,
    note: "Main city zone. Centre matches appSettings centerLatitude/centerLongitude.",
  },
  {
    name: "Gorantla",
    centerLat: 16.3459,
    centerLng: 80.442,
    radiusKm: 6,
    isActive: true,
    displayOrder: 1,
    note: "Guntur suburb, ~4.4 km north of the city centre.",
  },
];

const EARTH_RADIUS_KM = 6371;

/** Mirrors ServiceArea.haversineKm (Dart) and the copy in functions/index.js. */
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

const argOf = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const hasFlag = (flag) => process.argv.includes(flag);

const apply = hasFlag("--apply");
const email = argOf("--email", process.env.HB_ADMIN_EMAIL);
const password = argOf("--password", process.env.HB_ADMIN_PASSWORD);

// Defaults to Gorantla — the address that was being refused.
const testLat = Number(argOf("--lat", "16.3459"));
const testLng = Number(argOf("--lng", "80.4420"));

if (!email || !password) {
  console.error(
    "Missing credentials.\n" +
      "  node seed_service_areas.js --check --email <admin email> --password <password>\n" +
      "or set HB_ADMIN_EMAIL / HB_ADMIN_PASSWORD."
  );
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** Prints the existing zones and how the test point scores against each. */
const report = (areas) => {
  console.log(`\nConfigured service areas: ${areas.length}`);

  if (areas.length === 0) {
    console.log(
      "  (none)\n" +
        "  An empty collection reads as 'not configured', which the app treats as\n" +
        "  permissive — nobody is blocked in the UI, but onOrderCreatedValidateArea\n" +
        "  still flags every order server-side after checkout."
    );
  }

  let covered = false;
  for (const a of areas) {
    const active = a.isActive ?? true;
    const d = haversineKm(a.centerLat, a.centerLng, testLat, testLng);
    const inside = active && a.radiusKm > 0 && d <= a.radiusKm;
    if (inside) covered = true;
    console.log(
      `  - ${a.name || "(unnamed)"} [${a.id}]  centre ${a.centerLat}, ${a.centerLng}` +
        `  radius ${a.radiusKm} km  ${active ? "active" : "INACTIVE"}` +
        `\n      distance to test point: ${d.toFixed(2)} km  ->  ${
          inside ? "COVERED" : `outside by ${(d - a.radiusKm).toFixed(2)} km`
        }`
    );
  }

  console.log(
    `\nTest point ${testLat}, ${testLng}: ${
      covered ? "COVERED" : "NOT COVERED — this is what shows the 'not available here yet' card"
    }\n`
  );
};

const run = async () => {
  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log("Signed in.");

  const before = (await getDocs(collection(db, COLLECTION))).docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  report(before);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write the zones below:");
    DESIRED_AREAS.forEach((a) =>
      console.log(`  - ${a.name}: ${a.centerLat}, ${a.centerLng} @ ${a.radiusKm} km`)
    );
    process.exit(0);
  }

  for (const desired of DESIRED_AREAS) {
    const existing = before.find(
      (a) => (a.name || "").trim().toLowerCase() === desired.name.toLowerCase()
    );
    // Deterministic ids for new docs so a re-run without the read (or against a
    // partially written collection) still cannot create a second copy.
    const id = existing?.id ?? desired.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

    await setDoc(
      doc(db, COLLECTION, id),
      { ...desired, updatedAt: serverTimestamp() },
      { merge: true }
    );
    console.log(`${existing ? "Updated" : "Created"} "${desired.name}" (${id})`);
  }

  const after = (await getDocs(collection(db, COLLECTION))).docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  console.log("\n--- after ---");
  report(after);

  console.log(
    "Note: the customer app caches serviceAreas in memory for the session\n" +
      "(ServiceAreaRepository._cache), so restart the app to see the change."
  );
  process.exit(0);
};

run().catch((err) => {
  console.error("Failed:", err.code || "", err.message || err);
  process.exit(1);
});
