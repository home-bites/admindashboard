import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  getCountFromServer,
  getAggregateFromServer,
  sum as fsSum,
  serverTimestamp,
  onSnapshot,
  documentId
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/firebaseConfig";

// Global in-memory storage for mock mode
const mockDatabases = {};

const getCurrentUserId = () => {
  try {
    const authData = localStorage.getItem("homebites_auth");
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed?.state?.user?.uid || "system";
    }
  } catch (e) {
    console.warn("Could not read auth state from localStorage:", e.message);
  }
  return "system";
};

export class BaseRepository {
  constructor(collectionName) {
    this.collectionName = collectionName;
    if (!mockDatabases[collectionName]) {
      mockDatabases[collectionName] = [];
    }
  }

  isMockMode() {
    return import.meta.env.VITE_ENABLE_MOCK_DATA === "true";
  }

  verifyConfiguration() {
    if (!isFirebaseConfigured && !this.isMockMode()) {
      throw new Error("Firebase database configuration is missing, and VITE_ENABLE_MOCK_DATA is not enabled.");
    }
  }

  getCollection() {
    this.verifyConfiguration();
    if (this.isMockMode()) return null;
    return collection(db, this.collectionName);
  }

  getDocRef(id) {
    this.verifyConfiguration();
    if (this.isMockMode()) return null;
    return doc(db, this.collectionName, id);
  }

  async getById(id) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      const item = mockDatabases[this.collectionName].find(
        (t) => t.id === id && t.isDeleted !== true
      );
      return item ? { ...item } : null;
    }

    const docRef = this.getDocRef(id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.isDeleted === true) return null;
      return { id: docSnap.id, ...data };
    }
    return null;
  }

  async getAll() {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      return mockDatabases[this.collectionName]
        .filter((t) => t.isDeleted !== true)
        .map((t) => ({ ...t }));
    }

    const colRef = this.getCollection();
    const querySnapshot = await getDocs(colRef);
    const items = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.isDeleted !== true) {
        items.push({ id: doc.id, ...data });
      }
    });
    return items;
  }

  /**
   * Live subscription to the whole collection.
   *
   * @param {(items: object[]) => void} callback   fires on every change
   * @param {(error: Error) => void}   [onError]   fires if the listener breaks
   *
   * On error this used to call `callback([])`, which was worse than useless:
   * a permission-denied rule, a missing index or a dropped connection would
   * silently blank the admin's list and log nothing but a console warning.
   * The page then looked like an empty collection rather than a broken
   * listener — indistinguishable from "the data is gone", which is the most
   * alarming thing a dashboard can show an operator.
   *
   * Now the last known-good data is left on screen and the error is handed
   * to the caller so the UI can say what actually went wrong. Callers that
   * pass no `onError` get a console error instead of a swallowed warning.
   */
  listenAll(callback, onError) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      const items = mockDatabases[this.collectionName]
        .filter((t) => t.isDeleted !== true)
        .map((t) => ({ ...t }));
      callback(items);
      return () => {}; // Unsubscribe function
    }

    const colRef = this.getCollection();
    const unsubscribe = onSnapshot(colRef, (querySnapshot) => {
      const items = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isDeleted !== true) {
          items.push({ id: doc.id, ...data });
        }
      });
      callback(items);
    }, (error) => {
      console.error(`[${this.collectionName}] live listener failed:`, error);
      if (typeof onError === "function") onError(error);
    });

    return unsubscribe;
  }

  subscribeToAll(callback, onError) {
    return this.listenAll(callback, onError);
  }

  async create(data) {
    this.verifyConfiguration();
    const currentUserId = getCurrentUserId();
    const timestamp = new Date().toISOString();

    const auditData = {
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: currentUserId,
      updatedBy: currentUserId,
      isDeleted: false
    };

    if (this.isMockMode()) {
      const newId = Math.random().toString(36).substr(2, 9).toUpperCase();
      const newItem = { id: newId, ...auditData };
      mockDatabases[this.collectionName].push(newItem);
      return newId;
    }

    /*
     * One write, not two.
     *
     * This used to be:
     *
     *     const docRef = await addDoc(colRef, auditData);
     *     await updateDoc(docRef, { id: docRef.id });
     *
     * — create the document, then update it to stamp its own id into a field.
     * That second call is an UPDATE, and it broke every audit log write,
     * because auditLogs is deliberately append-only:
     *
     *     allow create: if isSignedIn();
     *     allow update, delete: if false;   // Logs should be immutable
     *
     * So the entry was created successfully and the follow-up update was
     * refused, surfacing as "Missing or insufficient permissions" on an
     * operation that had in fact already succeeded. Every immutable
     * collection would have hit the same wall.
     *
     * Firestore can generate an id client-side without a round trip, so the
     * id is known before the write and goes in with everything else. Also
     * halves the write cost and removes the window where a document exists
     * without its own id.
     */
    const colRef = this.getCollection();
    const docRef = doc(colRef);
    await setDoc(docRef, { ...auditData, id: docRef.id });
    return docRef.id;
  }

  async set(id, data) {
    this.verifyConfiguration();
    const currentUserId = getCurrentUserId();
    const timestamp = new Date().toISOString();

    if (this.isMockMode()) {
      const index = mockDatabases[this.collectionName].findIndex((t) => t.id === id);
      if (index !== -1) {
        mockDatabases[this.collectionName][index] = {
          ...mockDatabases[this.collectionName][index],
          ...data,
          updatedAt: timestamp,
          updatedBy: currentUserId
        };
      } else {
        mockDatabases[this.collectionName].push({
          id,
          ...data,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: currentUserId,
          updatedBy: currentUserId,
          isDeleted: false
        });
      }
      return id;
    }

    const docRef = this.getDocRef(id);
    await setDoc(docRef, {
      ...data,
      updatedAt: timestamp,
      updatedBy: currentUserId,
    }, { merge: true });
    return id;
  }

  async update(id, data) {
    this.verifyConfiguration();
    const currentUserId = getCurrentUserId();
    const timestamp = new Date().toISOString();

    if (this.isMockMode()) {
      const index = mockDatabases[this.collectionName].findIndex(
        (t) => t.id === id && t.isDeleted !== true
      );
      if (index !== -1) {
        mockDatabases[this.collectionName][index] = {
          ...mockDatabases[this.collectionName][index],
          ...data,
          updatedAt: timestamp,
          updatedBy: currentUserId
        };
        return id;
      }
      throw new Error(`Document with ID ${id} not found in mock ${this.collectionName}`);
    }

    const docRef = this.getDocRef(id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: currentUserId,
    });
    return id;
  }

  async delete(id) {
    this.verifyConfiguration();
    const currentUserId = getCurrentUserId();
    const timestamp = new Date().toISOString();

    if (this.isMockMode()) {
      const index = mockDatabases[this.collectionName].findIndex(
        (t) => t.id === id && t.isDeleted !== true
      );
      if (index !== -1) {
        mockDatabases[this.collectionName][index] = {
          ...mockDatabases[this.collectionName][index],
          isDeleted: true,
          deletedAt: timestamp,
          deletedBy: currentUserId,
          updatedAt: timestamp,
          updatedBy: currentUserId
        };
        return id;
      }
      throw new Error(`Document with ID ${id} not found in mock ${this.collectionName}`);
    }

    const docRef = this.getDocRef(id);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: currentUserId,
      updatedAt: serverTimestamp(),
      updatedBy: currentUserId
    });
    return id;
  }

  /**
   * Fetches many documents by id in as few reads as possible.
   *
   * The alternative — a `getDoc` per id — is what turns "show the customer's
   * name on each ledger row" into two hundred reads every time the wallet
   * page paints. `documentId() in [...]` is a key-only query: it needs no
   * index and no `where` on a data field, and Firestore caps the disjunction
   * at 30 values, hence the chunking.
   *
   * Missing ids are simply absent from the result. A ledger row can point at
   * a deleted account, and that must degrade to "no name" rather than to a
   * rejected promise that takes the whole table down with it — so a failed
   * chunk is logged and skipped, not thrown.
   *
   * @param {string[]} ids
   * @returns {Promise<Map<string, object>>} id → document (id included)
   */
  async getByIds(ids) {
    this.verifyConfiguration();
    const unique = [...new Set((ids || []).map((v) => String(v || "")).filter(Boolean))];
    const out = new Map();
    if (unique.length === 0) return out;

    if (this.isMockMode()) {
      for (const row of mockDatabases[this.collectionName] || []) {
        if (unique.includes(row.id)) out.set(row.id, { ...row });
      }
      return out;
    }

    const CHUNK = 30;
    const chunks = [];
    for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const snap = await getDocs(query(this.getCollection(), where(documentId(), "in", chunk)));
          snap.forEach((d) => out.set(d.id, { id: d.id, ...d.data() }));
        } catch (e) {
          console.warn(`[${this.collectionName}] getByIds chunk failed:`, e?.message || e);
        }
      }),
    );

    return out;
  }

  async findByField(fieldName, value) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      return mockDatabases[this.collectionName]
        .filter((t) => t[fieldName] === value && t.isDeleted !== true)
        .map((t) => ({ ...t }));
    }

    const colRef = this.getCollection();
    const q = query(colRef, where(fieldName, "==", value));
    const querySnapshot = await getDocs(q);
    const items = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.isDeleted !== true) {
        items.push({ id: doc.id, ...data });
      }
    });
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * Bounded reads.
   *
   * `getAll` and `listenAll` above read an entire collection. For a catalogue
   * — categories, menu items, banners, coupons — that is correct and cheap:
   * the collection has a natural ceiling in the hundreds and an admin editing
   * it wants to see all of it.
   *
   * For a collection that grows with business volume it is neither. `orders`,
   * `users`, `walletTransactions`, `auditLogs`, `reviews` and `subscriptions`
   * grow forever, and several pages were calling `getAll`/`listenAll` on
   * exactly those. At the target scale in the brief — 100k orders, 10k
   * customers — a single page visit downloaded six figures of documents to
   * compute a handful of numbers, and in the live case re-delivered them on
   * every write.
   *
   * The methods below are the bounded equivalents. They are additive: nothing
   * that legitimately reads a whole catalogue had to change.
   *
   * A note on `isDeleted`. The unbounded methods filter soft-deleted docs in
   * JavaScript after downloading them. That cannot be moved into the query
   * with `where("isDeleted", "!=", true)`, because a Firestore inequality
   * excludes documents where the field is ABSENT — and most historical
   * documents predate the field entirely, so such a query would silently drop
   * most of the collection. The filtering therefore stays client-side here
   * too, and the `limit` is applied by the server before it. That means a
   * page may come back holding fewer than `limitTo` live rows; callers that
   * page must key off the raw document count, which `getPage` returns
   * separately as `fetched`.
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * One page of a collection, newest first, with a cursor for the next.
   *
   * @param {object}  [opts]
   * @param {number}  [opts.limitTo=50]        documents to request
   * @param {string}  [opts.orderByField="createdAt"]
   * @param {"asc"|"desc"} [opts.direction="desc"]
   * @param {object}  [opts.cursor]            `lastDoc` from a previous call
   * @param {Array}   [opts.constraints=[]]    extra `where(...)` clauses
   * @returns {Promise<{items: object[], lastDoc: object|null, fetched: number,
   *                    hasMore: boolean}>}
   */
  async getPage({
    limitTo = 50,
    orderByField = "createdAt",
    direction = "desc",
    cursor = null,
    constraints = [],
  } = {}) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      const all = mockDatabases[this.collectionName]
        .filter((t) => t.isDeleted !== true)
        .map((t) => ({ ...t }));
      return { items: all.slice(0, limitTo), lastDoc: null, fetched: all.length, hasMore: false };
    }

    const parts = [...constraints, orderBy(orderByField, direction)];
    if (cursor) parts.push(startAfter(cursor));
    parts.push(fsLimit(limitTo));

    const snap = await getDocs(query(this.getCollection(), ...parts));

    const items = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.isDeleted !== true) items.push({ id: d.id, ...data });
    });

    return {
      items,
      lastDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
      fetched: snap.docs.length,
      // A short page means the collection ran out; a full one means there is
      // probably more. Keyed on documents fetched, not rows kept, so a page
      // that is entirely soft-deleted does not read as the end of history.
      hasMore: snap.docs.length === limitTo,
    };
  }

  /**
   * Live subscription to the most recent slice of a collection.
   *
   * The bounded counterpart to {@link listenAll}, for collections that grow
   * without limit. Use it wherever "what is happening now" is the question —
   * the answer is always in the newest N documents.
   */
  listenRecent(
    { limitTo = 100, orderByField = "createdAt", direction = "desc", constraints = [] } = {},
    callback,
    onError,
  ) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      callback(
        mockDatabases[this.collectionName]
          .filter((t) => t.isDeleted !== true)
          .map((t) => ({ ...t }))
          .slice(0, limitTo),
      );
      return () => {};
    }

    const q = query(
      this.getCollection(),
      ...constraints,
      orderBy(orderByField, direction),
      fsLimit(limitTo),
    );

    return onSnapshot(
      q,
      (snap) => {
        const items = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.isDeleted !== true) items.push({ id: d.id, ...data });
        });
        callback(items, { fetched: snap.size, saturated: snap.size === limitTo });
      },
      (error) => {
        console.error(`[${this.collectionName}] bounded listener failed:`, error);
        if (typeof onError === "function") onError(error);
      },
    );
  }

  /**
   * Server-side count. Returns an integer without transferring the documents.
   *
   * This is the difference between "how many customers are there" costing one
   * aggregation query and costing ten thousand document reads. Deliberately
   * takes no `isDeleted` filter, for the inequality reason described above —
   * the count includes soft-deleted rows, which is a small over-count and far
   * better than the near-zero an inequality would produce.
   */
  async countWhere(constraints = []) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      return mockDatabases[this.collectionName].filter((t) => t.isDeleted !== true).length;
    }
    const snap = await getCountFromServer(
      constraints.length ? query(this.getCollection(), ...constraints) : this.getCollection(),
    );
    return snap.data().count;
  }

  /**
   * Server-side sum of a numeric field.
   *
   * Financial totals were being computed by downloading a collection and
   * reducing it in JavaScript. That is wrong twice over: it costs a document
   * read per row, and the moment the collection is bounded to keep that cost
   * sane the totals silently become "the sum of whatever happened to be
   * loaded" while still being labelled as lifetime figures. A ledger total
   * that quietly means something other than what its label says is the worst
   * outcome available on a finance screen.
   *
   * `sum()` aggregation returns the real total over the whole matching set in
   * one query, whatever the collection's size, so the displayed figure and
   * its label agree again.
   *
   * @param {string} field         numeric field to total
   * @param {Array}  [constraints] `where(...)` clauses
   * @returns {Promise<number>}
   */
  async sumWhere(field, constraints = []) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      return mockDatabases[this.collectionName]
        .filter((t) => t.isDeleted !== true)
        .reduce((acc, t) => acc + (Number(t[field]) || 0), 0);
    }
    const snap = await getAggregateFromServer(
      constraints.length ? query(this.getCollection(), ...constraints) : this.getCollection(),
      { total: fsSum(field) },
    );
    return Number(snap.data().total) || 0;
  }

  listenByField(fieldName, value, callback) {
    this.verifyConfiguration();
    if (this.isMockMode()) {
      const items = mockDatabases[this.collectionName]
        .filter((t) => t[fieldName] === value && t.isDeleted !== true)
        .map((t) => ({ ...t }));
      callback(items);
      return () => {};
    }

    const colRef = this.getCollection();
    const q = query(colRef, where(fieldName, "==", value));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isDeleted !== true) {
          items.push({ id: doc.id, ...data });
        }
      });
      callback(items);
    }, (error) => {
      console.error(`Error listening to ${this.collectionName} where ${fieldName}==${value}:`, error);
    });

    return unsubscribe;
  }
}
