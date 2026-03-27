/**
 * Google Drive – pure REST API approach (no gapi, no origin registration needed)
 * Token comes from Firebase Google Sign-In (stored by AuthContext)
 */

const TOKEN_KEY  = 'edulive_gd_token';
const FOLDER_NAME = 'EduLive-Videos';
let cachedFolderId = null;

// ─── Token helpers (called by AuthContext after sign-in) ──────────────────────
export const saveGDriveToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};

export const getGDriveToken = () => localStorage.getItem(TOKEN_KEY);

export const clearGDriveToken = () => localStorage.removeItem(TOKEN_KEY);

// ─── Authenticated fetch wrapper ──────────────────────────────────────────────
const driveGet = async (url) => {
  const token = getGDriveToken();
  if (!token) throw new Error('Not connected to Google Drive. Please sign out and sign in again.');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { clearGDriveToken(); throw new Error('Drive session expired. Please sign out and sign in again.'); }
  return res;
};

const drivePost = async (url, body, extraHeaders = {}) => {
  const token = getGDriveToken();
  if (!token) throw new Error('Not connected to Google Drive. Please sign out and sign in again.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body
  });
  if (res.status === 401) { clearGDriveToken(); throw new Error('Drive session expired. Please sign out and sign in again.'); }
  return res;
};

// ─── Get or create EduLive-Videos folder ─────────────────────────────────────
const getOrCreateFolder = async () => {
  if (cachedFolderId) return cachedFolderId;

  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveGet(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  const data = await res.json();

  if (data.files?.length > 0) {
    cachedFolderId = data.files[0].id;
    return cachedFolderId;
  }

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
  } catch { /* ignore permission errors silently */ }
};

// ─── Upload File to Drive (multipart, no size limit, with progress) ───────────
export const uploadVideoToDrive = (file, fileName, onProgress) => {
  return new Promise(async (resolve, reject) => {
    try {
      const token = getGDriveToken();
      if (!token) throw new Error('Not connected to Google Drive. Please sign out and sign in again.');

      const folderId = await getOrCreateFolder();

      const metadata = { name: fileName, parents: [folderId] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file); // no size restriction

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
          reject(new Error('Drive session expired. Please sign out and sign in again.'));
        } else {
          reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload. Check your connection.'));
      xhr.send(form);
    } catch (err) {
      reject(err);
    }
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
