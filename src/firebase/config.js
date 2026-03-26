import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';

// ─── Check if setup is complete ───────────────────────────────────────────────
const isConfigured = process.env.REACT_APP_FIREBASE_API_KEY &&
  !process.env.REACT_APP_FIREBASE_API_KEY.includes('replace');

if (!isConfigured && process.env.NODE_ENV === 'development') {
  console.warn(
    '%c⚠️ Firebase not configured!',
    'color: orange; font-size: 16px; font-weight: bold'
  );
  console.warn('Run: node setup.js  to auto-configure Firebase');
}

// ─── Firebase Config (from .env file) ────────────────────────────────────────
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
  databaseURL:       process.env.REACT_APP_FIREBASE_DATABASE_URL,
  measurementId:     process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// ─── Initialize Firebase ──────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);

// ─── Export Services ──────────────────────────────────────────────────────────
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export const rtdb    = getDatabase(app);

// ─── Google Drive Config ──────────────────────────────────────────────────────
export const GDRIVE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
export const GDRIVE_API_KEY   = process.env.REACT_APP_GOOGLE_API_KEY;

export default app;
