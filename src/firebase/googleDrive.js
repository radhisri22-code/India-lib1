/**
 * Google Drive Integration
 * Same Google account as Firebase: hackthetech0000@gmail.com
 * Videos, recordings saved here automatically
 */

import { GDRIVE_CLIENT_ID, GDRIVE_API_KEY } from './config';

const FOLDER_NAME  = 'EduLive-Videos';
const SCOPE        = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY    = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let gapiReady       = false;
let driveFolderId   = null;
let initPromise     = null;

// ─── Load & Init Google API ────────────────────────────────────────────────────
export const initGoogleDrive = () => {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    if (typeof window.gapi !== 'undefined' && gapiReady) { resolve(); return; }

    // Load gapi script
    const existing = document.getElementById('gapi-script');
    if (existing) { existing.onload = () => initGapiClient(resolve, reject); return; }

    const script = document.createElement('script');
    script.id  = 'gapi-script';
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => initGapiClient(resolve, reject);
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(script);
  });

  return initPromise;
};

const initGapiClient = (resolve, reject) => {
  window.gapi.load('client:auth2', async () => {
    try {
      await window.gapi.client.init({
        apiKey:         GDRIVE_API_KEY,
        clientId:       GDRIVE_CLIENT_ID,
        discoveryDocs:  [DISCOVERY],
        scope:          SCOPE
      });
      gapiReady = true;
      resolve();
    } catch (err) {
      reject(new Error('Google API init failed: ' + (err.details || err.message)));
    }
  });
};

// ─── Sign In (uses hackthetech0000@gmail.com) ─────────────────────────────────
export const signInToDrive = async () => {
  await initGoogleDrive();
  const auth2 = window.gapi.auth2.getAuthInstance();
  if (!auth2.isSignedIn.get()) {
    await auth2.signIn({
      login_hint: 'hackthetech0000@gmail.com'
    });
  }
  return auth2.currentUser.get().getAuthResponse().access_token;
};

export const isDriveSignedIn = () => {
  if (!gapiReady) return false;
  return window.gapi.auth2.getAuthInstance()?.isSignedIn.get() || false;
};

export const getAccessToken = () => {
  return window.gapi.auth.getToken()?.access_token;
};

// ─── Get/Create EduLive Folder in Drive ──────────────────────────────────────
export const getOrCreateFolder = async () => {
  if (driveFolderId) return driveFolderId;

  // Search for existing folder
  const res = await window.gapi.client.drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive'
  });

  if (res.result.files.length > 0) {
    driveFolderId = res.result.files[0].id;
    return driveFolderId;
  }

  // Create folder
  const folder = await window.gapi.client.drive.files.create({
    resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  driveFolderId = folder.result.id;
  return driveFolderId;
};

// ─── Upload Video/File to Drive ────────────────────────────────────────────────
export const uploadVideoToDrive = async (file, fileName, onProgress) => {
  await signInToDrive();
  const folderId     = await getOrCreateFolder();
  const accessToken  = getAccessToken();

  const metadata = { name: fileName, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink'
    );
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = async () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        await setFilePublic(result.id, accessToken);
        resolve({
          fileId:      result.id,
          fileName:    result.name,
          embedLink:   `https://drive.google.com/file/d/${result.id}/preview`,
          directLink:  `https://drive.google.com/uc?export=download&id=${result.id}`,
          viewLink:    result.webViewLink
        });
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during Drive upload'));
    xhr.send(form);
  });
};

// ─── Upload Blob (for recordings) ─────────────────────────────────────────────
export const uploadBlobToDrive = async (blob, fileName, onProgress) => {
  const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
  return uploadVideoToDrive(file, fileName, onProgress);
};

// ─── Make file readable by anyone with link ────────────────────────────────────
const setFilePublic = async (fileId, accessToken) => {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
};

// ─── Delete file ───────────────────────────────────────────────────────────────
export const deleteFromDrive = async (fileId) => {
  await signInToDrive();
  await window.gapi.client.drive.files.delete({ fileId });
};
