import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import {
  saveGDriveToken, clearGDriveToken, setTokenRefresher,
  saveAdminDriveToken, ADMIN_EMAIL
} from '../firebase/googleDrive';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser,    setCurrentUser]    = useState(null);
  const [userProfile,    setUserProfile]    = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [adminDriveReady,setAdminDriveReady]= useState(false);

  // ─── Silent Drive token refresh (no popup, no UI) ────────────────────────────
  const silentRefreshDrive = async (email) => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({ prompt: 'none', login_hint: email });
      const result     = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        saveGDriveToken(credential.accessToken);
        await saveAdminDriveToken(credential.accessToken);
        setAdminDriveReady(true);
        return true;
      }
    } catch { /* silent fail */ }
    return false;
  };

  // ─── Auto-refresh admin Drive token every 50 min ──────────────────────────────
  useEffect(() => {
    if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;

    silentRefreshDrive(ADMIN_EMAIL); // immediately on login/app open
    const timer = setInterval(() => silentRefreshDrive(ADMIN_EMAIL), 50 * 60 * 1000);
    return () => clearInterval(timer);
  }, [currentUser?.uid]); // eslint-disable-line

  // ─── Register upload fallback refresher ───────────────────────────────────────
  useEffect(() => {
    setTokenRefresher(() => silentRefreshDrive(currentUser?.email || ADMIN_EMAIL));
  }, [currentUser?.uid]); // eslint-disable-line

  // ─── Google Sign-In ───────────────────────────────────────────────────────────
  const loginWithGoogle = async (role = 'student') => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    const result     = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    // Admin account always logs in as teacher and saves Drive token
    const effectiveRole = result.user.email === ADMIN_EMAIL ? 'teacher' : role;

    if (credential?.accessToken) {
      saveGDriveToken(credential.accessToken);
      if (result.user.email === ADMIN_EMAIL) {
        await saveAdminDriveToken(credential.accessToken);
      }
    }

    const ref  = doc(db, 'users', result.user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid:             result.user.uid,
        email:           result.user.email,
        displayName:     result.user.displayName,
        photoURL:        result.user.photoURL || '',
        role:            effectiveRole,
        createdAt:       serverTimestamp(),
        blockedUsers:    [],
        enrolledCourses: [],
        createdCourses:  []
      });
    } else {
      await updateDoc(ref, { role: effectiveRole, photoURL: result.user.photoURL || '' });
    }

    const updated = await getDoc(ref);
    setUserProfile(updated.data());
    return result;
  };

  // ─── Manual Drive reconnect (shows Google popup) ─────────────────────────────
  const refreshDriveToken = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ login_hint: currentUser?.email || ADMIN_EMAIL, prompt: 'consent' });
    try {
      const result     = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        saveGDriveToken(credential.accessToken);
        if (result.user.email === ADMIN_EMAIL) {
          await saveAdminDriveToken(credential.accessToken);
          setAdminDriveReady(true);
        }
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  const logout = () => { clearGDriveToken(); return signOut(auth); };

  const fetchUserProfile = async (uid) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) setUserProfile(snap.data());
    } catch (e) {
      console.error('fetchUserProfile error', e);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []); // eslint-disable-line

  const value = {
    currentUser,
    userProfile,
    loginWithGoogle,
    logout,
    fetchUserProfile,
    refreshDriveToken,
    isAdmin:        currentUser?.email === ADMIN_EMAIL,
    isTeacher:      userProfile?.role === 'teacher' || currentUser?.email === ADMIN_EMAIL,
    isStudent:      userProfile?.role === 'student' && currentUser?.email !== ADMIN_EMAIL,
    adminDriveReady
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
