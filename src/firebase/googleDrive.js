/**
 * Google Drive – pure REST API
 * ALL uploads go to the ADMIN account (hackthetech0000@gmail.com).
 * Uses a Service Account for PERMANENT token generation — never expires.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';

export const ADMIN_EMAIL  = 'hackthetech0000@gmail.com';
const FOLDER_NAME         = 'Edulive-video';   // must match the folder shared with service account
const LOCAL_TOKEN_KEY     = 'edulive_gd_token';
const LOCAL_EXPIRY_KEY    = 'edulive_gd_token_expiry';

// ─── Service Account (permanent — generates tokens automatically) ─────────────
const SA_EMAIL     = 'firebase-adminsdk-fbsvc@krishna-acedmy.iam.gserviceaccount.com';
const SA_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SA_SCOPE     = 'https://www.googleapis.com/auth/drive';
const SA_KEY       = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDK+9sFFmweXw2S
rxGQ+PToJ5lzLJU6LCygRgxs2TVXA2rdvbrVyWIbzOvGDt/ff7u6xylpSND5RrQB
ntesy5a6xI0rGDf9+DT/xl86KoJPzBhgbyVPftFB0bKDC9cidUiyU+xdY7Ze68YP
BHMNthjLNT5KjXqpLkMMcPYmiGAPWfum5yIUClfDw+BjPo6Zz2VXWb0Pkb5FbV/Q
V9alQqJvNhxVsuSASJjjYF9lH88dj+DTK/QCxBT8iIxiassB+rFO1AAAs9HnnPjW
hEPRI9JtY7C8GUou6XyZ9+kpnvorOdlZNu/Qq7W4GGaUvFsdBjpp9OuLO2QwdQp8
UEY0oxLNAgMBAAECggEARXfObD5RQE+tmH7b1y6sumsbBCTE6YTGvQ9cH0BzFdVw
lHTjZVknf3YxVrYufhH8EJ8qmAK4qic9YbSYAWYnrsGnwpDmUL/Ke6LLYl+7+01R
JmfDcCJpwUnf+yNpPDzBZW59XTTL7E5qmScfrRieAaW2LNOgoBfaEH70bxmLLpUz
PX6hLNNcUX7RgPlb/ybogGx16pEhAFzX4MMOZSa/7j94Ve8BOt34Adk9Ew9o932j
xz6m+AhVmuocI545274UFt+wWhsWJpGNz6QjQDzVwMhdfKqW92GFqj0/lRVzR9DY
T6j4Ygsbe8pp34S+3JtLlNb/NJzlvkbBfiBtgheJDQKBgQD9E0e07v0xs1Zc7fd0
L2D49DqXi53JtyoJVpaNdDVVERbIXrTfLJjDQjTlbjHOonRi6FobxLzLYbWq2Noo
/GUoyztwxqGDcaliJahciXwayi5qZDoeP25earbSKIMoyj381YfPqea7lLiIjlTZ
kzLcjp6ZCQ0yMhopNzMdw3TatwKBgQDNVGFifY8pXUlmeC2scCC+u+MeFbH3NaL+
etE3v7vxmczvwi0/zR2uqjrFk9o4sejVmW83NWtD3F1xoNJ2VIXLqXVBCITrvyyk
URM0WlyDDvy6TppW1xtd97RNgFxV/iClh0PKLr35dFtFeBE2oCkgszvjLs0vdS2m
VJpzjOSKmwKBgQDjtmpqEjR+eOh3m6NxxoPR3ieuXnDupMHNPz0eMHcggMzoI9dJ
jF40KylfW2Szkhd5O6qAm+hodBW7kX3TLS90olFsqz1/AVGwv0ObaBXkIRHcpyxo
NRkBGbJArTU/CaL3EccvAqhbFnloXfFZCIrWS/nGp49ZIB3MAiAbYtiNRwKBgFPj
EHJjp9SXd0B1Avv7R3WFX5HP/UhpUnEzjjx/ifJ4CoE9zKzPSTwt8hr8f+A/10dF
C2n72hn8cvTUZofPmmYNkokCSQPjtAJh2T2/WSJ2Qgx/xpCKC3VFmRU8xvye+YmH
DMwScqzyu8NS/X1ay9K/R01Wtp+X+RGGaR+iRVDXAoGBAMw4venFqrss+Fupe+WD
rT/tnED+Oyl/EGPg4U2YMvsizqYkPKqiVRufHUNBD1IvQTHhY7PiY3NlZjtcgVMj
LyZL7FulLrYD1DuuQooCMxAIIaKYO6P4p+yNzkcXq5XXrGY9g+zBK8pdjVR2tfUX
jKl6lFIERx4IhngJHnEgDUJa
-----END PRIVATE KEY-----`;

// ─── In-memory caches ─────────────────────────────────────────────────────────
let _saToken           = null;
let _saTokenExpiry     = 0;
let _cachedAdminToken  = null;
let _cachedAdminExpiry = 0;
let cachedFolderId     = null;
let _tokenRefresher    = null;

// ─── JWT helpers (Web Crypto API — no external library needed) ────────────────
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const b64urlStr = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const importSAKey = async () => {
  const pem = SA_KEY.replace(/-----BEGIN PRIVATE KEY-----/, '')
                    .replace(/-----END PRIVATE KEY-----/, '')
                    .replace(/\s+/g, '');
  const der  = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
};

// ─── Get Service Account access token (auto-refreshes, never needs user) ──────
const getServiceAccountToken = async () => {
  if (_saToken && Date.now() < _saTokenExpiry) return _saToken;

  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: SA_EMAIL, scope: SA_SCOPE, aud: SA_TOKEN_URI, iat: now, exp: now + 3600 };

  const hdr = b64urlStr(JSON.stringify(header));
  const pay = b64urlStr(JSON.stringify(payload));
  const key = await importSAKey();
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${hdr}.${pay}`)
  );
  const jwt = `${hdr}.${pay}.${b64url(sig)}`;

  const res  = await fetch(SA_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Service account token error: ${JSON.stringify(data)}`);

  _saToken       = data.access_token;
  _saTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _saToken;
};

// ─── Local token (fallback only) ──────────────────────────────────────────────
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
export const isTokenFresh  = () => !!getGDriveToken();
export const clearGDriveToken = () => {
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  localStorage.removeItem(LOCAL_EXPIRY_KEY);
};

// ─── Admin Firestore token (kept for AdminSetup page status display) ──────────
export const saveAdminDriveToken = async (token) => {
  if (!token) return;
  const expiry = Date.now() + 55 * 60 * 1000;
  _cachedAdminToken = token; _cachedAdminExpiry = expiry;
  try {
    await setDoc(doc(db, 'system', 'adminDrive'),
      { token, expiry, savedAt: Date.now(), email: ADMIN_EMAIL }, { merge: true });
  } catch { /* ignore */ }
};
export const getAdminDriveToken = async () => {
  if (_cachedAdminToken && Date.now() < _cachedAdminExpiry) return _cachedAdminToken;
  try {
    const snap = await getDoc(doc(db, 'system', 'adminDrive'));
    if (!snap.exists()) return null;
    const { token, expiry } = snap.data();
    if (!token || Date.now() > expiry) return null;
    _cachedAdminToken = token; _cachedAdminExpiry = expiry;
    return token;
  } catch { return null; }
};
export const isAdminTokenFresh = () => _cachedAdminToken && Date.now() < _cachedAdminExpiry;

// ─── Token refresher (injected by AuthContext) ────────────────────────────────
export const setTokenRefresher = (fn) => { _tokenRefresher = fn; };

// ─── ensureToken: service account ALWAYS first → permanent, no expiry ─────────
const ensureToken = async () => {
  // Service account = permanent, auto-refreshes
  try {
    const saToken = await getServiceAccountToken();
    if (saToken) return saToken;
  } catch (e) {
    console.warn('Service account token failed, falling back:', e.message);
  }
  // Fallback: Firestore admin token
  const adminToken = await getAdminDriveToken();
  if (adminToken) return adminToken;
  // Last resort
  throw new Error(
    'Drive upload failed. Please contact admin (hackthetech0000@gmail.com).'
  );
};

// ─── Authenticated fetch helpers ──────────────────────────────────────────────
const driveGet = async (url) => {
  const token = await ensureToken();
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { _saToken = null; throw new Error('Drive token rejected, retrying...'); }
  return res;
};

const drivePost = async (url, body, extraHeaders = {}) => {
  const token = await ensureToken();
  const res   = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body
  });
  if (res.status === 401) { _saToken = null; throw new Error('Drive token rejected, retrying...'); }
  return res;
};

// ─── Get or create upload folder ──────────────────────────────────────────────
const getOrCreateFolder = async () => {
  if (cachedFolderId) return cachedFolderId;
  const q   = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res  = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`
  );
  const data = await res.json();
  if (data.files?.length > 0) { cachedFolderId = data.files[0].id; return cachedFolderId; }
  // Create folder
  const cr   = await drivePost(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    { 'Content-Type': 'application/json' }
  );
  const created = await cr.json();
  cachedFolderId = created.id;
  return cachedFolderId;
};

// ─── Make file publicly readable ──────────────────────────────────────────────
const makePublic = async (fileId) => {
  try {
    await drivePost(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      JSON.stringify({ role: 'reader', type: 'anyone' }),
      { 'Content-Type': 'application/json' }
    );
  } catch { /* ignore */ }
};

// ─── Upload file to Drive ─────────────────────────────────────────────────────
export const uploadVideoToDrive = async (file, fileName, onProgress) => {
  const token    = await ensureToken();
  cachedFolderId = null; // reset so folder lookup uses fresh token
  const folderId = await getOrCreateFolder();

  return new Promise((resolve, reject) => {
    const metadata = { name: fileName, parents: [folderId] };
    const form     = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = async () => {
      if (xhr.status === 200 || xhr.status === 201) {
        const data = JSON.parse(xhr.responseText);
        await makePublic(data.id);
        resolve({
          fileId:     data.id,
          fileName:   data.name,
          embedLink:  `https://drive.google.com/file/d/${data.id}/preview`,
          directLink: `https://drive.google.com/uc?export=download&id=${data.id}`,
          viewLink:   data.webViewLink
        });
      } else if (xhr.status === 401) {
        _saToken = null;
        reject(new Error('Drive token expired. Please try uploading again.'));
      } else if (xhr.status === 403) {
        const body   = JSON.parse(xhr.responseText || '{}');
        const reason = body?.error?.errors?.[0]?.reason || '';
        if (reason === 'accessNotConfigured' || xhr.responseText.includes('SERVICE_DISABLED')) {
          reject(new Error(
            'Google Drive API is not enabled.\n' +
            'Go to console.developers.google.com → APIs → Drive API → Enable'
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
  try {
    const token = await ensureToken();
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch { /* ignore */ }
};
