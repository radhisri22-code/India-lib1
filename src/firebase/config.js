import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';

// Firebase configuration
// Replace with your actual Firebase project values from .env file
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyD_replace_with_real_key",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "edulive-classroom.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "edulive-classroom",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "edulive-classroom.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:123456789012:web:abcdef",
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "https://edulive-classroom-default-rtdb.firebaseio.com",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-XXXXXXXXXX"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);

export default app;
