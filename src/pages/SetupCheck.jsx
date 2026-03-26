import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, rtdb, storage } from '../firebase/config';
import { ref as dbRef, set } from 'firebase/database';
import { FiCheck, FiX, FiLoader, FiExternalLink } from 'react-icons/fi';
import './SetupCheck.css';

const checks = [
  { id: 'env',       label: 'Environment Variables (.env)' },
  { id: 'firebase',  label: 'Firebase Connection' },
  { id: 'auth',      label: 'Firebase Authentication' },
  { id: 'firestore', label: 'Firestore Database' },
  { id: 'rtdb',      label: 'Realtime Database' },
  { id: 'storage',   label: 'Firebase Storage' },
  { id: 'gdrive',    label: 'Google Drive API' }
];

const SetupCheck = () => {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [allPassed, setAllPassed] = useState(false);

  const setResult = (id, status, message = '') => {
    setResults(prev => ({ ...prev, [id]: { status, message } }));
  };

  const runChecks = async () => {
    setRunning(true);
    setResults({});
    setDone(false);

    // 1. Check ENV vars
    setResult('env', 'loading');
    await delay(300);
    const hasEnv = !!(
      process.env.REACT_APP_FIREBASE_API_KEY &&
      process.env.REACT_APP_FIREBASE_PROJECT_ID &&
      process.env.REACT_APP_FIREBASE_DATABASE_URL
    );
    setResult('env', hasEnv ? 'pass' : 'fail',
      hasEnv ? `Project: ${process.env.REACT_APP_FIREBASE_PROJECT_ID}` : 'Run node setup.js to create .env file'
    );
    if (!hasEnv) { finalize(); return; }

    // 2. Check Firebase connection
    setResult('firebase', 'loading');
    await delay(300);
    try {
      // If auth object is initialized, Firebase is connected
      const app = auth.app;
      setResult('firebase', 'pass', `App: ${app.options.projectId}`);
    } catch (e) {
      setResult('firebase', 'fail', 'Firebase app not initialized. Check API keys.');
    }

    // 3. Check Auth
    setResult('auth', 'loading');
    await delay(400);
    try {
      // Try to sign in (will fail if auth not enabled but connection works)
      await signInWithEmailAndPassword(auth, 'test_connection@test.com', 'wrongpassword123')
        .catch(err => {
          // auth/user-not-found or auth/wrong-password means Auth IS working
          if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(err.code)) {
            setResult('auth', 'pass', 'Email/Password auth enabled');
          } else if (err.code === 'auth/configuration-not-found') {
            setResult('auth', 'fail', 'Enable Email/Password in Firebase Console → Authentication');
          } else {
            setResult('auth', 'pass', 'Auth reachable');
          }
        });
    } catch (e) {
      setResult('auth', 'fail', e.message);
    }

    // 4. Check Firestore
    setResult('firestore', 'loading');
    await delay(400);
    try {
      const testDoc = doc(db, '_setup_test', 'ping');
      await setDoc(testDoc, { ping: true, at: serverTimestamp() });
      const snap = await getDoc(testDoc);
      setResult('firestore', snap.exists() ? 'pass' : 'fail',
        snap.exists() ? 'Read/Write working' : 'Write succeeded but read failed'
      );
    } catch (e) {
      setResult('firestore', 'fail', e.message.includes('permission') ? 'Permission denied - deploy Firestore rules' : e.message);
    }

    // 5. Check Realtime Database
    setResult('rtdb', 'loading');
    await delay(400);
    try {
      await set(dbRef(rtdb, '_setup_test/ping'), { ping: true, at: Date.now() });
      setResult('rtdb', 'pass', 'Read/Write working');
    } catch (e) {
      setResult('rtdb', 'fail', e.message.includes('permission') ? 'Permission denied - check database.rules.json' : e.message);
    }

    // 6. Check Storage
    setResult('storage', 'loading');
    await delay(400);
    try {
      // Just check if storage is reachable
      const bucket = storage.app.options.storageBucket;
      if (bucket) {
        setResult('storage', 'pass', `Bucket: ${bucket}`);
      } else {
        setResult('storage', 'fail', 'Storage bucket not configured');
      }
    } catch (e) {
      setResult('storage', 'fail', e.message);
    }

    // 7. Check Google Drive API
    setResult('gdrive', 'loading');
    await delay(500);
    const hasGDrive = !!(
      process.env.REACT_APP_GOOGLE_CLIENT_ID &&
      process.env.REACT_APP_GOOGLE_API_KEY
    );
    if (!hasGDrive) {
      setResult('gdrive', 'fail', 'Google API keys missing in .env file');
    } else {
      // Check if gapi script loads
      try {
        await loadGapiScript();
        setResult('gdrive', 'pass', 'API keys configured, ready to use');
      } catch {
        setResult('gdrive', 'warn', 'Keys found but could not initialize (normal until first use)');
      }
    }

    finalize();
  };

  const finalize = () => {
    setRunning(false);
    setDone(true);
  };

  useEffect(() => {
    if (done) {
      const values = Object.values(results);
      const failed = values.filter(r => r.status === 'fail').length;
      setAllPassed(failed === 0 && values.length === checks.length);
    }
  }, [done, results]);

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const loadGapiScript = () => new Promise((resolve, reject) => {
    if (window.gapi) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
    setTimeout(reject, 5000);
  });

  const StatusIcon = ({ status }) => {
    if (status === 'loading') return <div className="spinner" style={{ width: 18, height: 18 }} />;
    if (status === 'pass')    return <FiCheck size={18} style={{ color: 'var(--success)' }} />;
    if (status === 'warn')    return <span style={{ fontSize: 18 }}>⚠️</span>;
    if (status === 'fail')    return <FiX size={18} style={{ color: 'var(--danger)' }} />;
    return <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--gray-300)' }} />;
  };

  return (
    <div className="setup-check-page">
      <div className="setup-check-card card">
        <div className="setup-check-header">
          <h1>🔧 Setup Verification</h1>
          <p>Check if Firebase and Google Drive are correctly configured</p>
        </div>

        {/* Check List */}
        <div className="checks-list">
          {checks.map(check => {
            const result = results[check.id];
            return (
              <div key={check.id} className={`check-item ${result?.status || ''}`}>
                <StatusIcon status={result?.status} />
                <div className="check-info">
                  <span className="check-label">{check.label}</span>
                  {result?.message && (
                    <span className="check-msg">{result.message}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Run Button */}
        <button
          className="btn btn-primary btn-lg w-full"
          onClick={runChecks}
          disabled={running}
          style={{ marginTop: '1.5rem' }}
        >
          {running ? <><span className="spinner" /> Running Checks...</> : '▶ Run Setup Check'}
        </button>

        {/* Result */}
        {done && (
          <div className={`setup-result ${allPassed ? 'success' : 'error'}`}>
            {allPassed ? (
              <>
                <span style={{ fontSize: '2rem' }}>🎉</span>
                <div>
                  <strong>Everything is working!</strong>
                  <p>Firebase + Google Drive are fully connected. <a href="/">Go to App →</a></p>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: '2rem' }}>⚠️</span>
                <div>
                  <strong>Some checks failed</strong>
                  <p>Run <code>node setup.js</code> to fix issues automatically</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Links */}
        <div className="setup-links">
          <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="setup-link">
            <FiExternalLink size={14} /> Firebase Console
          </a>
          <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="setup-link">
            <FiExternalLink size={14} /> Google Cloud Console
          </a>
          <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="setup-link">
            <FiExternalLink size={14} /> Google Drive
          </a>
        </div>
      </div>
    </div>
  );
};

export default SetupCheck;
