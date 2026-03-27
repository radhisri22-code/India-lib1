import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../../firebase/config';
import {
  saveAdminDriveToken,
  getAdminDriveToken,
  isAdminTokenFresh,
  ADMIN_EMAIL
} from '../../firebase/googleDrive';
import { useAuth } from '../../contexts/AuthContext';

const AdminSetup = () => {
  const { currentUser, isAdmin } = useAuth();
  const [tokenStatus, setTokenStatus] = useState('checking'); // 'checking' | 'fresh' | 'expired'
  const [reauthing,   setReauthing]   = useState(false);
  const [message,     setMessage]     = useState('');

  useEffect(() => {
    const check = async () => {
      if (isAdminTokenFresh()) { setTokenStatus('fresh'); return; }
      const t = await getAdminDriveToken();
      setTokenStatus(t ? 'fresh' : 'expired');
    };
    check();
  }, []);

  if (!currentUser) return <Navigate to="/login" replace />;
  if (!isAdmin)     return <Navigate to="/" replace />;

  const handleReauthorize = async () => {
    setReauthing(true);
    setMessage('');
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: 'consent' });
      const result     = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        await saveAdminDriveToken(credential.accessToken);
        setTokenStatus('fresh');
        setMessage('Drive re-authorized successfully! All teacher uploads will now use this account.');
      } else {
        setMessage('Re-authorization failed: no token received. Please try again.');
      }
    } catch (err) {
      setMessage(`Re-authorization failed: ${err.message}`);
    } finally {
      setReauthing(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '4rem auto', padding: '2rem' }}>
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚙️</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--gray-900)' }}>
          Admin Drive Setup
        </h2>
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
          All video uploads from any teacher use the admin Google Drive account.
          Keep this token fresh so uploads never fail.
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '1rem', borderRadius: 8, marginBottom: '1.5rem',
          background: tokenStatus === 'fresh' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: tokenStatus === 'fresh' ? '#22c55e' : tokenStatus === 'checking' ? '#f59e0b' : '#ef4444'
          }} />
          <span style={{
            fontWeight: 600,
            color: tokenStatus === 'fresh' ? '#16a34a' : tokenStatus === 'checking' ? '#d97706' : '#dc2626'
          }}>
            {tokenStatus === 'checking' && 'Checking token…'}
            {tokenStatus === 'fresh'    && 'Drive token is active — uploads will work.'}
            {tokenStatus === 'expired'  && 'Drive token expired — uploads will fail until re-authorized.'}
          </span>
        </div>

        <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--gray-500)' }}>
          Admin account: <strong>{ADMIN_EMAIL}</strong>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleReauthorize}
          disabled={reauthing}
          style={{ width: '100%' }}
        >
          {reauthing ? 'Authorizing…' : 'Re-authorize Google Drive'}
        </button>

        {message && (
          <div style={{
            marginTop: '1rem', padding: '0.75rem 1rem',
            borderRadius: 8,
            background: message.startsWith('Drive re-authorized') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: message.startsWith('Drive re-authorized') ? '#16a34a' : '#dc2626',
            fontSize: '0.85rem', fontWeight: 500
          }}>
            {message}
          </div>
        )}

        <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 8, textAlign: 'left' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontWeight: 600, marginBottom: '0.5rem' }}>
            If uploads show "Google Drive API not enabled":
          </p>
          <ol style={{ fontSize: '0.8rem', color: 'var(--gray-600)', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            <li>Go to Google Cloud Console → APIs &amp; Services</li>
            <li>Search for "Google Drive API"</li>
            <li>Click Enable</li>
            <li>Come back here and re-authorize</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default AdminSetup;
