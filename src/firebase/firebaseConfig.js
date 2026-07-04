import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";
import { getRemoteConfig } from "firebase/remote-config";
import { getAnalytics } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Check if we have minimum config to initialize
const isFirebaseConfigured = 
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  firebaseConfig.appId;

let app;
let auth;
let db;
let storage;
let analytics = null;
let messaging = null;
let remoteConfig = null;
let appCheck = null;
let crashlytics = null; 

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    
    // Services that require browser capabilities
    if (typeof window !== "undefined") {
      try {
        analytics = getAnalytics(app);
      } catch (e) {
        console.warn("Firebase Analytics failed to initialize:", e.message);
      }

      try {
        messaging = getMessaging(app);
      } catch (e) {
        console.warn("Firebase Messaging could not be initialized in this browser environment:", e.message);
      }

      try {
        remoteConfig = getRemoteConfig(app);
        remoteConfig.settings = {
          minimumFetchIntervalMillis: 3600000,
          defaultConfig: {},
        };
      } catch (e) {
        console.warn("Firebase Remote Config could not be initialized:", e.message);
      }

      // App Check (configured if recaptcha site key is provided)
      const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
      if (recaptchaKey) {
        try {
          appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(recaptchaKey),
            isTokenAutoRefreshEnabled: true,
          });
        } catch (e) {
          console.warn("Firebase App Check failed to initialize:", e.message);
        }
      }
    }
  } catch (error) {
    console.error("Error initializing Firebase services:", error);
  }
} else {
  console.warn(
    "Firebase environment variables are missing. Firebase services are running in mock/offline fallback mode."
  );
  app = null;
  auth = null;
  db = null;
  storage = null;
}

crashlytics = {
  log: (message) => console.log(`[Crashlytics Log]: ${message}`),
  recordError: (error) => console.error(`[Crashlytics Record]:`, error),
  setUserId: (userId) => console.log(`[Crashlytics User]: ${userId}`),
};

export {
  app,
  auth,
  db,
  storage,
  analytics,
  messaging,
  remoteConfig,
  appCheck,
  crashlytics,
  isFirebaseConfigured
};
