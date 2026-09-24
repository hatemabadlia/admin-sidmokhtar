// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBbgBgJoHBY0wFIsN7-Ayjn-mvqOi9XMoQ",
  authDomain: "sidmokhtar-b6532.firebaseapp.com",
  projectId: "sidmokhtar-b6532",
  storageBucket: "sidmokhtar-b6532.firebasestorage.app",
  messagingSenderId: "266001768183",
  appId: "1:266001768183:web:b02d64989fd8bbd5c1fdf2",
  measurementId: "G-T6RTBY1K0M"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase App Check (reCAPTCHA v3): يضمن أن طلبات Firestore/Auth تأتي من موقعنا فقط
// وليس من سكربتات خارجية تستعمل مفتاح API العام. يُفعَّل تلقائيًا عند ضبط
// VITE_RECAPTCHA_SITE_KEY في .env (بعد تسجيل الموقع في Firebase Console → App Check).
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (typeof window !== "undefined" && appCheckSiteKey) {
  try {
    if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // توكن تصحيح محلي
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // App Check غير متاح — تستمر التطبيقات بالعمل (الإلزام يُضبط من Console)
  }
}


// Firebase Authentication
const auth = getAuth(app);

// Cloud Firestore
const db = getFirestore(app);

// Cloud Storage
const storage = getStorage(app);

// Analytics is optional and can be disabled for privacy-sensitive setups
let analytics = null;
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
  } catch (e) {
    // analytics unavailable (e.g. blocked in some browsers) — ignore
  }
}

export { app, auth, db, storage, analytics };