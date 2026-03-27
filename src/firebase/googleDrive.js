/**
 * Google Drive – pure REST API (no gapi, no origin registration needed)
 *
 * PERMANENT TOKEN SOLUTION:
 *  - Token saved with a 55-minute expiry timestamp
 *  - isTokenFresh() returns false when within 5 min of expiry
 *  - A "token refresher" callback is registered by AuthContext so
 *    uploadVideoToDrive can auto-refresh the token before uploading
 *    (the upload button click is a user gesture → popup is allowed)
 */

const TOKEN_KEY        = 'edulive_gd_token';
const TOKEN_EXPIRY_KEY = 'edulive_gd_token_expiry';
const FOLDER_NAME      = 'EduLive-Videos';

let cachedFolderId = null;
let _tokenRefresher = null; // injected by AuthContext

// ─── Token helpers ────────────────────────────────────────────────────────────
export const saveGDriveToken = (token) => {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
  // Tokens last 1 hour; we treat ours as expired after 55 min to be safe
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + 55 * 60 * 1000));
};

export const getGDriveToken = () => {
  const token  = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
  if (!token || Date.now() > expiry) return null; // expired → treat as missing
  return token;
};

export const isTokenFresh = () => !!getGDriveToken();

export const clearGDriveToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
};

/**
 * AuthContext calls this once at startup to register the refresh callback.
 * The callback calls signInWithPopup with the Drive scope and saves the new token.
 */
export const setTokenRefresher = (fn) => { _tokenRefresher = fn; };

/**
 * Ensure a valid token exists. If missing/expired, auto-refresh via the
 * registered callback (triggered from a user gesture → popup allowed).
 * Returns the fresh token, or throws if refresh fails.
 */
const ensureToken = async () => {
  if (getGDriveToken()) return getGDriveToken();
  if (!_tokenRefresher) throw new Error('Google Drive not connected. Please sign out and sign in again.');
  const ok = await _tokenRefresher();
  if (!ok || !getGDriveToken()) throw new Error('Could not connect to Google Drive. Please try signing in again.');
  return getGDriveToken();
};

// ─── Authenticated fetch wrappers ─────────────────────────────────────────────
const driveGet = async (url) => {
  const token = await ensureToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { clearGDriveToken(); throw new Error('Drive token rejected. Please upload again to reconnect.'); }
  return res;
};

const drivePost = async (url, body, extraHeaders = {}) => {
  const token = await ensureToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body
  });
  if (res.status === 401) { clearGDriveToken(); throw new Error('Drive token rejected. Please upload again to reconnect.'); }
  return res;
};

// ─── Get or create EduLive-Videos folder ─────────────────────────────────────
const getOrCreateFolder = async () => {
  if (cachedFolderId) return cachedFolderId;
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
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
  // ensureToken auto-refreshes if expired (inline, transparent to the user)
  const token = await ensureToken();
  cachedFolderId = null; // reset so folder lookup uses fresh token
  const folderId = await getOrCreateFolder();

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
        clearGDriveToken();
        reject(new Error('Drive session expired mid-upload. Please try uploading again.'));
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
