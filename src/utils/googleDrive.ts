import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((s) => provider.addScope(s));

let isSigningIn = false;
// Access token is kept strictly in memory (never localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function initDriveAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleDrive(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses Google Drive.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

const FOLDER_NAME = 'SAG65 Juken 5+';

export async function ensureSag65Folder(accessToken: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    throw new Error(`Gagal mengakses Google Drive (${searchRes.status}).`);
  }
  const searchData = await searchRes.json();
  if (Array.isArray(searchData.files) && searchData.files.length > 0) {
    return searchData.files[0].id as string;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error('Gagal membuat folder SAG65 Juken 5+ di Google Drive.');
  }
  const created = await createRes.json();
  return created.id as string;
}

export async function uploadFileToDrive(
  accessToken: string,
  filename: string,
  content: string,
  mimeType: string,
  folderId?: string
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = `sag65_boundary_${Date.now()}`;
  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload ke Google Drive gagal (${res.status}): ${errText}`);
  }

  return (await res.json()) as DriveFileItem;
}

export async function listSag65DriveFiles(accessToken: string): Promise<DriveFileItem[]> {
  const folderId = await ensureSag65Folder(accessToken);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Gagal memuat daftar file Google Drive (${res.status}).`);
  }
  const data = await res.json();
  return (data.files as DriveFileItem[]) || [];
}

export async function downloadDriveFileText(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Gagal mengunduh file dari Google Drive (${res.status}).`);
  }
  return await res.text();
}

export async function deleteDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gagal menghapus file di Google Drive (${res.status}).`);
  }
}

export function buildMobileLauncherHtml(appUrl: string): string {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAG65 Juken 5+ — Peluncur Aplikasi HP</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0A0D12; color: #F1F5F9; margin: 0; padding: 24px; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
    .card { max-width: 440px; width: 100%; background: #121720; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 14px; color: #94A3B8; line-height: 1.5; }
    a.btn { display: block; text-align: center; background: #F97316; color: #0A0D12; font-weight: 700; text-decoration: none; padding: 14px 18px; border-radius: 12px; margin-top: 16px; }
    ol { font-size: 13px; color: #CBD5E1; padding-left: 18px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>SAG65 Juken 5+ Telemetry</h1>
    <p>Buka tautan di bawah ini menggunakan browser <strong>Google Chrome</strong> di HP Android Anda untuk memasang aplikasi ke layar utama dan mengaktifkan Bluetooth BLE + Mode Landscape.</p>
    <a class="btn" href="${appUrl}">Buka &amp; Pasang SAG65 Juken 5+</a>
    <ol>
      <li>Ketuk tombol oranye di atas (pilih buka di <strong>Chrome</strong> jika diminta).</li>
      <li>Setelah terbuka, ketuk <strong>Download ke HP</strong> atau menu <strong>⋮ → Install app</strong>.</li>
      <li>Aplikasi SAG65 siap dipakai dalam mode layar penuh &amp; landscape.</li>
    </ol>
  </div>
</body>
</html>`;
}

export function buildAndroidBuildConfigJson(appUrl: string): string {
  const host = appUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return JSON.stringify(
    {
      appName: 'SAG65 Juken 5+',
      appId: 'com.sag65.juken5telemetry',
      webDir: 'dist',
      serverUrl: appUrl,
      twaManifest: {
        packageId: 'com.sag65.juken5telemetry',
        host,
        name: 'SAG65 Juken 5+',
        launcherName: 'SAG65',
        display: 'standalone',
        orientation: 'any',
        themeColor: '#090C10',
        backgroundColor: '#090C10',
        startUrl: '/',
      },
      androidPermissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_ADMIN',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
      ],
      buildApkSteps: [
        '1. Untuk compile menjadi file .apk Android secara gratis tanpa install Android Studio di PC, buka https://www.pwabuilder.com dan masukkan URL: ' +
          appUrl,
        '2. Pilih Package for Stores -> Android -> Generate Package untuk mengunduh file .apk siap instal di HP.',
        '3. Atau gunakan Capacitor CLI di komputer dengan Android Studio: npx cap init "SAG65 Juken 5+" com.sag65.juken5telemetry && npx cap add android && npx cap open android.',
      ],
    },
    null,
    2
  );
}

export function buildWindowsLauncherBat(appUrl: string): string {
  return [
    '@echo off',
    'title SAG65 Juken 5+ Telemetry (Windows Desktop)',
    'set "APP_URL=' + appUrl + '"',
    '',
    ':: Cari Microsoft Edge (Chromium) terlebih dahulu untuk App Mode Windows 10/11',
    'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
    '  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%" --window-size=1280,800',
    '  exit /b',
    ')',
    'if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (',
    '  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%" --window-size=1280,800',
    '  exit /b',
    ')',
    '',
    ':: Fallback ke Google Chrome App Mode',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
    '  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%" --window-size=1280,800',
    '  exit /b',
    ')',
    'if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (',
    '  start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%" --window-size=1280,800',
    '  exit /b',
    ')',
    '',
    ':: Fallback ke browser default Windows',
    'start "" "%APP_URL%"',
  ].join('\r\n');
}

export function buildWindowsBuildConfigJson(appUrl: string): string {
  const host = appUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return JSON.stringify(
    {
      appName: 'SAG65 Juken 5+',
      packageName: 'SAG65.Juken5Telemetry',
      publisherDisplayName: 'SAG65 Motorsport',
      version: '1.0.0.0',
      startUrl: appUrl,
      host,
      features: {
        webBluetoothWindows: true,
        webSerialUsbComPort: true,
        offlineServiceWorker: true,
        desktopShortcuts: true,
      },
      buildWindowsMsixSteps: [
        '1. Buka https://www.pwabuilder.com di browser dan masukkan URL: ' + appUrl,
        '2. Pilih Package for Stores -> Windows -> Generate Package untuk mengunduh paket .msix (Windows 10/11).',
        '3. Atau langsung pasang dari Microsoft Edge / Google Chrome di Windows via ikon Install (+) di address bar, atau jalankan file SAG65_Windows_App.bat.',
      ],
    },
    null,
    2
  );
}

