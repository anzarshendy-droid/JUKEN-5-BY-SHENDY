import buildApkYml from '../../.github/workflows/build-apk.yml?raw';
import rootBuildGradle from '../../android-apk-bridge/build.gradle.kts?raw';
import settingsGradle from '../../android-apk-bridge/settings.gradle.kts?raw';
import gradleProperties from '../../android-apk-bridge/gradle.properties?raw';
import appBuildGradle from '../../android-apk-bridge/app/build.gradle.kts?raw';
import androidManifest from '../../android-apk-bridge/app/src/main/AndroidManifest.xml?raw';
import mainActivityKt from '../../android-apk-bridge/app/src/main/java/com/sag65/juken5/MainActivity.kt?raw';

interface ZipEntryInput {
  path: string;
  content: string;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildStoreZip(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const part of centralParts) {
    centralSize += part.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [...localParts, ...centralParts, eocd].map(
    (u8) => new Uint8Array(u8).buffer
  );
  return new Blob(blobParts, { type: 'application/zip' });
}

export function downloadGithubApkKitZip(appUrl: string): void {
  const normalizedUrl =
    appUrl && appUrl.startsWith('http')
      ? appUrl
      : 'https://ais-pre-ehcgorabdkd7svhl2ahsou-494385704911.asia-northeast1.run.app';

  const patchedMainActivity = mainActivityKt.replace(
    /private const val APP_URL = "[^"]+"/,
    `private const val APP_URL = "${normalizedUrl}"`
  );

  const readme = `# SAG65 Juken 5+ - Build APK Native via GitHub Actions

## Langkah Build APK:
1. Buat repository baru di GitHub (Public atau Private).
2. Ekstrak ZIP ini, lalu upload semua isi folder (termasuk folder \`.github\` dan \`android-apk-bridge\`) ke repository GitHub Anda.
3. Buka tab **Actions** -> pilih **Build SAG65 Android APK** -> klik **Run workflow**.
4. Tunggu ~2-4 menit sampai centang hijau, lalu unduh **SAG65-Juken5-Android-APK** di bagian **Artifacts** paling bawah halaman workflow.
5. Ekstrak file ZIP artifact dan install \`app-debug.apk\` di HP Android Anda.
`;

  const zipBlob = buildStoreZip([
    { path: '.github/workflows/build-apk.yml', content: buildApkYml },
    { path: 'android-apk-bridge/build.gradle.kts', content: rootBuildGradle },
    { path: 'android-apk-bridge/settings.gradle.kts', content: settingsGradle },
    { path: 'android-apk-bridge/gradle.properties', content: gradleProperties },
    { path: 'android-apk-bridge/app/build.gradle.kts', content: appBuildGradle },
    { path: 'android-apk-bridge/app/src/main/AndroidManifest.xml', content: androidManifest },
    { path: 'android-apk-bridge/app/src/main/java/com/sag65/juken5/MainActivity.kt', content: patchedMainActivity },
    { path: 'README_APK_BUILD.md', content: readme },
  ]);

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SAG65_GitHub_APK_Kit.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
