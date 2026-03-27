import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { saveGDriveToken, clearGDriveToken, setTokenRefresher } from '../firebase/googleDrive';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading,     setLoading]     = useState(true);

  // ─── Core: get a fresh Google OAuth token (with Drive scope) ─────────────────
  // silent=true → no UI if user already authorized (used on page load)
  // silent=false → shows Google account picker if needed (used on manual reconnect)
  const _refreshDriveToken = async (email, silent) => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    if (silent) {
      provider.setCustomParameters({
        prompt: 'none',                    // skip UI if already authorized
        ...(email ? { login_hint: email } : {})
      });
    }
    try {
      const result     = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        saveGDriveToken(credential.accessToken);
        return true;
      }
    } catch { /* silent fail */ }
    return false;
  };

  // ─── Register with googleDrive.js so uploads auto-refresh the token ──────────
  // This callback is called automatically inside uploadVideoToDrive when the
  // token is missing or expired — triggered by the upload button user-gesture
  // so the browser always allows the popup.
  useEffect(() => {
    setTokenRefresher(() => _refreshDriveToken(currentUser?.email, false));
  }, [currentUser]); // eslint-disable-line

  // ─── Google Sign-In ───────────────────────────────────────────────────────────
  const loginWithGoogle = async (role = 'student') => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    const result     = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) saveGDriveToken(credential.accessToken);

    const ref  = doc(db, 'users', result.user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid:             result.user.uid,
        email:           result.user.email,
        displayName:     result.user.displayName,
        photoURL:        result.user.photoURL || '',
        role,
        createdAt:       serverTimestamp(),
        blockedUsers:    [],
        enrolledCourses: [],
        createdCourses:  []
      });
    } else {
      await updateDoc(ref, { role, photoURL: result.user.photoURL || '' });
    }

    const updated = await getDoc(ref);
    setUserProfile(updated.data());
    return result;
  };

  // ─── Re-authorize Drive (manual reconnect button or auto-retry) ──────────────
  const refreshDriveToken = () => _refreshDriveToken(currentUser?.email, false);

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
    isTeacher: userProfile?.role === 'teacher',
    isStudent:  userProfile?.role === 'student'
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
