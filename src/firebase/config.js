import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyB6i4e5Zx2rDNIZsba7qsq6zCCIEAsKcGk",
  authDomain: "krishna-acedmy.firebaseapp.com",
  projectId: "krishna-acedmy",
  storageBucket: "krishna-acedmy.firebasestorage.app",
  messagingSenderId: "1083537478502",
  appId: "1:1083537478502:web:1432c00451a60042182ea7",
  measurementId: "G-EXJV4BQ0FX",
  databaseURL: "https://krishna-acedmy-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export const rtdb    = getDatabase(app);

export const GDRIVE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
export const GDRIVE_API_KEY   = process.env.REACT_APP_GOOGLE_API_KEY   || '';

export default app;
