/**
 * Google Drive – pure REST API
 * ALL uploads go to the ADMIN account (hackthetech0000@gmail.com).
 * Admin token is stored in Firestore so every teacher's upload uses it.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';

const LOCAL_TOKEN_KEY   = 'edulive_gd_token';
const LOCAL_EXPIRY_KEY  = 'edulive_gd_token_expiry';
const FOLDER_NAME       = 'EduLive-Videos';
export const ADMIN_EMAIL = 'hackthetech0000@gmail.com';

// In-memory cache for admin token (avoids repeated Firestore reads)
let _cachedAdminToken  = null;
let _cachedAdminExpiry = 0;
let cachedFolderId     = null;
let _tokenRefresher    = null;

// ─── Local token (used only for the admin account session) ───────────────────
export const saveGDriveToken = (token) => {
  if (!token) return;
  localStorage.setItem(LOCAL_TOKEN_KEY,  token);
  localStorage.setItem(LOCAL_EXPIRY_KEY, String(Date.now() + 55 * 60 * 1000));
};

export const getGDriveToken = () => {
  const token  = localStorage.getItem(LOCAL_TOKEN_KEY);
  const expiry = Number(localStorage.getItem(LOCAL_EXPIRY_KEY) || 0);
  return (token && Date.now() < expiry) ? token : null;
};

export const isTokenFresh = () => !!getGDriveToken();

export const clearGDriveToken = () => {
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  localStorage.removeItem(LOCAL_EXPIRY_KEY);
};

// ─── Admin token stored in Firestore ─────────────────────────────────────────
// Saved when the admin account (hackthetech0000@gmail.com) signs in.
// Read by ALL teacher uploads so every video goes to the admin Drive.

export const saveAdminDriveToken = async (token) => {
  if (!token) return;
  const expiry = Date.now() + 55 * 60 * 1000;
  _cachedAdminToken  = token;
  _cachedAdminExpiry = expiry;
  try {
    await setDoc(doc(db, 'system', 'adminDrive'), {
      token,
      expiry,
      savedAt: Date.now(),
      email: ADMIN_EMAIL
    }, { merge: true });
  } catch { /* ignore write errors silently */ }
};

export const getAdminDriveToken = async () => {
  // Use memory cache first
  if (_cachedAdminToken && Date.now() < _cachedAdminExpiry) {
    return _cachedAdminToken;
  }
  // Read from Firestore
  try {
    const snap = await getDoc(doc(db, 'system', 'adminDrive'));
    if (!snap.exists()) return null;
    const { token, expiry } = snap.data();
    if (!token || Date.now() > expiry) return null;
    _cachedAdminToken  = token;
    _cachedAdminExpiry = expiry;
    return token;
  } catch { return null; }
};

export const isAdminTokenFresh = () =>
  _cachedAdminToken && Date.now() < _cachedAdminExpiry;

// ─── Token refresher (injected by AuthContext) ────────────────────────────────
export const setTokenRefresher = (fn) => { _tokenRefresher = fn; };

// ─── Ensure a valid admin token, auto-refresh if needed ──────────────────────
const ensureToken = async () => {
  // 1. Try admin token from Firestore (preferred — all uploads go to admin Drive)
  const adminToken = await getAdminDriveToken();
  if (adminToken) return adminToken;

  // 2. Admin token expired/missing — try to refresh via registered callback
  if (_tokenRefresher) {
    const ok = await _tokenRefresher();
    if (ok) {
      const refreshed = await getAdminDriveToken();
      if (refreshed) return refreshed;
    }
  }

  // 3. Last resort: use current user's local token (should only happen if admin is uploading)
  const localToken = getGDriveToken();
  if (localToken) return localToken;

  throw new Error(
    'Admin Google Drive not connected.\n' +
    'Please ask the admin (hackthetech0000@gmail.com) to log in at /admin/setup to reconnect.'
  );
};

// ─── Authenticated fetch wrappers ─────────────────────────────────────────────
const driveGet = async (url) => {
  const token = await ensureToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    _cachedAdminToken = null; _cachedAdminExpiry = 0;
    throw new Error('Drive token rejected. Admin needs to re-authorize at /admin/setup.');
  }
  return res;
};

const drivePost = async (url, body, extraHeaders = {}) => {
  const token = await ensureToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body
  });
  if (res.status === 401) {
    _cachedAdminToken = null; _cachedAdminExpiry = 0;
    throw new Error('Drive token rejected. Admin needs to re-authorize at /admin/setup.');
  }
  return res;
};

// ─── Get or create EduLive-Videos folder ─────────────────────────────────────
const getOrCreateFolder = async () => {
  if (cachedFolderId) return cachedFolderId;
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res  = await driveGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  const data = await res.json();
  if (data.files?.length > 0) { cachedFolderId = data.files[0].id; return cachedFolderId; }
  const createRes = await drivePost(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    { 'Content-Type': 'application/json' }
  );
  const created = await createRes.json();
  cachedFolderId = created.id;
  return cachedFolderId;
};

// ─── Make file publicly readable ─────────────────────────────────────────────
const makePublic = async (fileId) => {
  try {
    await drivePost(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      JSON.stringify({ role: 'reader', type: 'anyone' }),
      { 'Content-Type': 'application/json' }
    );
  } catch { /* ignore */ }
};

// ─── Upload File to Drive (multipart, no size limit, with progress) ───────────
export const uploadVideoToDrive = async (file, fileName, onProgress) => {
  const token     = await ensureToken();
  cachedFolderId  = null; // reset folder cache to use fresh token
  const folderId  = await getOrCreateFolder();

  return new Promise((resolve, reject) => {
    const metadata = { name: fileName, parents: [folderId] };
    const form     = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = async () => {
      if (xhr.status === 200 || xhr.status === 201) {
        const res = JSON.parse(xhr.responseText);
        await makePublic(res.id);
        resolve({
          fileId:     res.id,
          fileName:   res.name,
          embedLink:  `https://drive.google.com/file/d/${res.id}/preview`,
          directLink: `https://drive.google.com/uc?export=download&id=${res.id}`,
          viewLink:   res.webViewLink
        });
      } else if (xhr.status === 401) {
        _cachedAdminToken = null; _cachedAdminExpiry = 0;
        reject(new Error('Drive token expired mid-upload. Please try again.'));
      } else if (xhr.status === 403) {
        const body = JSON.parse(xhr.responseText || '{}');
        const reason = body?.error?.errors?.[0]?.reason || '';
        if (reason === 'accessNotConfigured' || xhr.responseText.includes('SERVICE_DISABLED')) {
          reject(new Error(
            'Google Drive API is not enabled.\n' +
            'Admin must go to: console.developers.google.com → APIs → Drive API → Enable'
          ));
        } else {
          reject(new Error(`Upload forbidden (403): ${xhr.responseText}`));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload. Check your connection.'));
    xhr.send(form);
  });
};

// ─── Upload Blob (recordings) ─────────────────────────────────────────────────
export const uploadBlobToDrive = (blob, fileName, onProgress) => {
  const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
  return uploadVideoToDrive(file, fileName, onProgress);
};

// ─── Delete file ──────────────────────────────────────────────────────────────
export const deleteFromDrive = async (fileId) => {
  const token = getGDriveToken();
  if (!token) return;
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};
