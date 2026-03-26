/**
 * Google Drive Storage
 * Primary storage for all videos & recordings
 * Uses hackthetech0000@gmail.com Google account
 */

const FOLDER_NAME = 'EduLive-Videos';
const SCOPE       = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY   = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let gapiReady     = false;
let folderId      = null;
let initPromise   = null;

// ─── Load Google API script ───────────────────────────────────────────────────
export const initGoogleDrive = () => {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve, reject) => {
    if (typeof window.gapi !== 'undefined' && gapiReady) { resolve(); return; }

    const script = document.createElement('script');
    script.src   = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey:        process.env.REACT_APP_GOOGLE_API_KEY,
            clientId:      process.env.REACT_APP_GOOGLE_CLIENT_ID,
            discoveryDocs: [DISCOVERY],
            scope:         SCOPE
          });
          gapiReady = true;
          resolve();
        } catch (err) {
          reject(new Error('Google Drive init failed: ' + (err.details || err.message)));
        }
      });
    };
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(script);
  });
  return initPromise;
};

// ─── Sign in to Google Drive ──────────────────────────────────────────────────
export const signInToDrive = async () => {
  await initGoogleDrive();
  const auth = window.gapi.auth2.getAuthInstance();
  if (!auth.isSignedIn.get()) {
    await auth.signIn({ login_hint: 'hackthetech0000@gmail.com' });
  }
  return window.gapi.auth.getToken()?.access_token;
};

export const isDriveReady = () => gapiReady && window.gapi?.auth2?.getAuthInstance()?.isSignedIn.get();

// ─── Get or create EduLive folder in Drive ────────────────────────────────────
const getFolder = async () => {
  if (folderId) return folderId;
  const res = await window.gapi.client.drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)'
  });
  if (res.result.files.length > 0) {
    folderId = res.result.files[0].id;
    return folderId;
  }
  const folder = await window.gapi.client.drive.files.create({
    resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  folderId = folder.result.id;
  return folderId;
};

// ─── Make file publicly readable ─────────────────────────────────────────────
const makePublic = async (fileId) => {
  const token = window.gapi.auth.getToken()?.access_token;
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
};

// ─── Upload any File to Drive ─────────────────────────────────────────────────
export const uploadVideoToDrive = async (file, fileName, onProgress) => {
  await signInToDrive();
  const folder = await getFolder();
  const token  = window.gapi.auth.getToken()?.access_token;

  const metadata = { name: fileName, parents: [folder] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
      };
    }

    xhr.onload = async () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        await makePublic(res.id);
        resolve({
          fileId:     res.id,
          fileName:   res.name,
          embedLink:  `https://drive.google.com/file/d/${res.id}/preview`,
          directLink: `https://drive.google.com/uc?export=download&id=${res.id}`,
          viewLink:   res.webViewLink
        });
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during Drive upload'));
    xhr.send(form);
  });
};

// ─── Upload Blob (for live recordings) ───────────────────────────────────────
export const uploadBlobToDrive = async (blob, fileName, onProgress) => {
  const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
  return uploadVideoToDrive(file, fileName, onProgress);
};

// ─── Delete a file from Drive ─────────────────────────────────────────────────
export const deleteFromDrive = async (fileId) => {
  await signInToDrive();
  await window.gapi.client.drive.files.delete({ fileId });
};
