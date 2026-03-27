import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { saveGDriveToken, clearGDriveToken } from '../firebase/googleDrive';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser]   = useState(null);
  const [userProfile, setUserProfile]   = useState(null);
  const [loading, setLoading]           = useState(true);

  // Google Sign-In — creates or updates user profile
  const loginWithGoogle = async (role = 'student') => {
    const provider = new GoogleAuthProvider();
    // Allow any Google account (not just hackthetech)
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    const result     = await signInWithPopup(auth, provider);
    // Save Google OAuth token for Drive REST API (no gapi / origin registration needed)
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) saveGDriveToken(credential.accessToken);
    const ref    = doc(db, 'users', result.user.uid);
    const snap   = await getDoc(ref);

    if (!snap.exists()) {
      // New user — create profile with chosen role
      await setDoc(ref, {
        uid:            result.user.uid,
        email:          result.user.email,
        displayName:    result.user.displayName,
        photoURL:       result.user.photoURL || '',
        role,
        createdAt:      serverTimestamp(),
        blockedUsers:   [],
        enrolledCourses:[],
        createdCourses: []
      });
    } else {
      // Existing user — always update role to what they selected
      await updateDoc(ref, { role, photoURL: result.user.photoURL || '' });
    }

    // Refresh local profile immediately
    const updated = await getDoc(ref);
    setUserProfile(updated.data());
    return result;
  };

  // Re-authorize Google Drive — gets a fresh OAuth token (called when token is expired)
  const refreshDriveToken = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        saveGDriveToken(credential.accessToken);
        return true;
      }
    } catch { /* user cancelled */ }
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
  }, []);

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
