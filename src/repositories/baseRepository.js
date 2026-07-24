import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
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

  listenAll(callback) {
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
      console.warn(`Error listening to ${this.collectionName}:`, error.message);
      callback([]);
    });

    return unsubscribe;
  }

  subscribeToAll(callback) {
    return this.listenAll(callback);
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

    const colRef = this.getCollection();
    const docRef = await addDoc(colRef, auditData);
    await updateDoc(docRef, { id: docRef.id });
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
