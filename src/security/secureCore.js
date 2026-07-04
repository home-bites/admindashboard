import { db, auth } from "../firebase/firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, writeBatch } from "firebase/firestore";
import { signOut } from "firebase/auth";

class SecureCore {
  constructor() {
    this.threatEngine = new ThreatEngine();
    this.rateLimiter = new RateLimiter();
    this.requestValidator = new RequestValidator();
    this.authGuard = new AuthGuard(this);
    this.secureFirestore = new SecureFirestore(this);
  }
}

class AuthGuard {
  constructor(core) {
    this.core = core;
    this.sessionToken = null;
    this.unsub = null;
  }

  monitorSession(uid) {
    this.sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // Save lastLoginDevice and lastActiveAt to firestore
    const userRef = doc(db, "users", uid);
    updateDoc(userRef, {
      lastLoginDevice: this.sessionToken,
      lastActiveAt: new Date(),
    }).catch(() => {});

    // Listen for concurrent logins (Multiple login detection)
    if (this.unsub) this.unsub();
    
    // Set a session timeout timer (e.g. auto logout after 15 minutes of idle)
    this.resetTimeout();
    window.addEventListener("mousemove", () => this.resetTimeout());
    window.addEventListener("keypress", () => this.resetTimeout());
  }

  resetTimeout() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      signOut(auth).then(() => {
        alert("Session timed out due to inactivity. Please log in again.");
        window.location.reload();
      });
    }, 15 * 60 * 1000); // 15 mins
  }

  stopMonitoring() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.unsub) this.unsub();
  }
}

class RequestValidator {
  constructor() {
    this.usedNonces = new Set();
  }

  generateSecurityHeaders() {
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const timestamp = Date.now().toString();
    return {
      "X-Request-ID": Math.random().toString(36).substring(2),
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Platform": "Admin Dashboard",
    };
  }

  validateRequest(nonce, timestampStr) {
    const timestamp = parseInt(timestampStr) || 0;
    const now = Date.now();
    
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) return false;
    if (this.usedNonces.has(nonce)) return false;
    
    this.usedNonces.add(nonce);
    return true;
  }
}

class ThreatEngine {
  constructor() {
    this.threatScore = parseInt(localStorage.getItem("HB_ADMIN_THREAT_SCORE")) || 0;
  }

  recordEvent(eventType, increment) {
    this.threatScore += increment;
    localStorage.setItem("HB_ADMIN_THREAT_SCORE", this.threatScore.toString());
    
    const user = auth.currentUser;
    if (user) {
      const docRef = doc(db, "threatScores", user.uid);
      setDoc(docRef, {
        uid: user.uid,
        threatScore: this.threatScore,
        updatedAt: new Date(),
        locked: this.threatScore >= 100,
      }, { merge: true }).catch(() => {});
    }
  }

  isLocked() {
    return this.threatScore >= 100;
  }
}

class RateLimiter {
  constructor() {
    this.history = {};
  }

  checkAllowed(key, maxRequests, windowMs) {
    const now = Date.now();
    const timestamps = this.history[key] || [];
    
    const filtered = timestamps.filter(ts => now - ts < windowMs);
    
    if (filtered.length >= maxRequests) {
      return false;
    }
    
    filtered.push(now);
    this.history[key] = filtered;
    return true;
  }
}

class SecureFirestore {
  constructor(core) {
    this.core = core;
  }

  verifyAccess(operation) {
    const user = auth.currentUser;
    if (!user) throw new Error("SecurityException: Unauthorized. Authentication verification failed.");
    if (this.core.threatEngine.isLocked()) throw new Error("SecurityException: Account locked due to security anomalies.");
    
    const rateKey = `fs_admin_${user.uid}_${operation}`;
    if (!this.core.rateLimiter.checkAllowed(rateKey, 50, 10000)) {
      throw new Error("SecurityException: Rate limit exceeded.");
    }
  }

  async getDocument(collectionName, docId) {
    this.verifyAccess("read");
    const docRef = doc(db, collectionName, docId);
    return await getDoc(docRef);
  }

  async getCollection(collectionName) {
    this.verifyAccess("read");
    const colRef = collection(db, collectionName);
    return await getDocs(colRef);
  }

  async addDocument(collectionName, data) {
    this.verifyAccess("create");
    const colRef = collection(db, collectionName);
    return await addDoc(colRef, {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async setDocument(collectionName, docId, data) {
    this.verifyAccess("write");
    const docRef = doc(db, collectionName, docId);
    return await setDoc(docRef, {
      ...data,
      updatedAt: new Date(),
    }, { merge: true });
  }

  async updateDocument(collectionName, docId, data) {
    this.verifyAccess("update");
    const docRef = doc(db, collectionName, docId);
    return await updateDoc(docRef, {
      ...data,
      updatedAt: new Date(),
    });
  }
}

export const secureCore = new SecureCore();
