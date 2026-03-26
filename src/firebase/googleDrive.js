// Google Drive integration for video storage
// Uses the teacher's Google account (hackthetech0000@gmail.com)

const FOLDER_NAME = 'EduLive-Videos';

let gapiLoaded = false;
let driveFolderId = null;

// Load Google API
export const loadGoogleAPI = () => {
  return new Promise((resolve, reject) => {
    if (gapiLoaded) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
            clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            scope: 'https://www.googleapis.com/auth/drive.file'
          });
          gapiLoaded = true;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Get or create EduLive folder in Drive
export const getOrCreateDriveFolder = async () => {
  if (driveFolderId) return driveFolderId;

  // Search for existing folder
  const res = await window.gapi.client.drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)'
  });

  if (res.result.files.length > 0) {
    driveFolderId = res.result.files[0].id;
    return driveFolderId;
  }

  // Create folder
  const folder = await window.gapi.client.drive.files.create({
    resource: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });
  driveFolderId = folder.result.id;
  return driveFolderId;
};

// Upload video file to Google Drive
export const uploadVideoToDrive = async (file, fileName, onProgress) => {
  const folderId = await getOrCreateDriveFolder();

  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink');
    xhr.setRequestHeader('Authorization', `Bearer ${window.gapi.auth.getToken().access_token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        // Make file accessible with link
        makeFilePublic(result.id).then(() => {
          resolve({
            fileId: result.id,
            fileName: result.name,
            viewLink: result.webViewLink,
            directLink: `https://drive.google.com/uc?export=download&id=${result.id}`,
            embedLink: `https://drive.google.com/file/d/${result.id}/preview`
          });
        });
      } else {
        reject(new Error(`Upload failed: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
};

// Make Drive file accessible via link (enrolled students only via Firebase rules)
export const makeFilePublic = async (fileId) => {
  await window.gapi.client.drive.permissions.create({
    fileId,
    resource: {
      role: 'reader',
      type: 'anyone'
    }
  });
};

// Upload blob (for live recordings) to Drive
export const uploadBlobToDrive = async (blob, fileName, onProgress) => {
  const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
  return uploadVideoToDrive(file, fileName, onProgress);
};

// Delete file from Drive
export const deleteFromDrive = async (fileId) => {
  await window.gapi.client.drive.files.delete({ fileId });
};

// Check if user is signed into Google Drive
export const isDriveAuthenticated = () => {
  if (!gapiLoaded) return false;
  return window.gapi.auth2.getAuthInstance().isSignedIn.get();
};

// Sign in to Google Drive
export const signInToDrive = async () => {
  await loadGoogleAPI();
  if (!isDriveAuthenticated()) {
    await window.gapi.auth2.getAuthInstance().signIn({
      hint: 'hackthetech0000@gmail.com'
    });
  }
};
