import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  setDoc,
  updateDoc, 
  query, 
  where,
  serverTimestamp,
  onSnapshot
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
