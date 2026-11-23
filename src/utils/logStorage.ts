import { LogSession, TelemetryFrame } from '../types/telemetry';
import { createInitialFrame, hexToBytes, parseJukenPacket } from './jukenProtocol';

const DB_NAME = 'juken5_telemetry_db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const LS_FALLBACK_KEY = 'juken5_sessions_fallback';
const SEEDED_FLAG_KEY = 'juken5_sample_seeded_v1';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateSampleDynoSession(): LogSession {
  const start = Date.now() - 1000 * 60 * 42; // 42 minutes ago
  const frames: TelemetryFrame[] = [];
  const totalSamples = 140; // 14 seconds at 10Hz

  for (let i = 0; i < totalSamples; i++) {
    const t = i / 10; // seconds
    let tps = 4;
    let rpm = 1500;
    let afr = 13.8;
    let ect = 82;

    if (t < 1.5) {
      tps = 3 + t * 2;
      rpm = 1500 + t * 300;
      afr = 13.7;
    } else if (t < 9.0) {
      const p = (t - 1.5) / 7.5;
      tps = Math.min(100, 20 + p * 120);
      rpm = Math.round(2800 + Math.pow(p, 0.85) * 9100);
      // Slight lean pocket around 7800 RPM for tuning visualization
      const leanBump = rpm > 7400 && rpm < 8400 ? 0.85 : 0;
      afr = Number((12.85 - p * 0.45 + leanBump + Math.sin(i * 0.9) * 0.12).toFixed(1));
      ect = Math.round(83 + p * 8);
    } else {
      const d = (t - 9.0) / 5.0;
      tps = 1.0;
      rpm = Math.round(Math.max(1550, 11900 - d * 10200));
      afr = Number(Math.min(16.4, 14.5 + d * 1.9).toFixed(1));
      ect = Math.round(91 - d * 2);
    }

    frames.push({
      timestamp: start + i * 100,
      elapsedMs: i * 100,
      rpm,
      afr,
      tps: Number(tps.toFixed(1)),
      map: Math.round(34 + (tps / 100) * 66),
      ect,
      iat: 35,
      battery: Number((13.6 + Math.min(0.6, rpm / 10000)).toFixed(1)),
      ignTiming: Number((14 + (rpm / 12000) * 20 - (tps / 100) * 3).toFixed(1)),
      injWidth: Number((1.9 + (tps / 100) * 8.1 + (rpm / 12000) * 2.1).toFixed(2)),
      speed: Math.round(Math.max(0, (rpm - 1400) * 0.013)),
    });
  }

  return {
    id: 'sample-dyno-run-1',
    name: 'Contoh Run Dyno — Map Racing Pertamax Turbo',
    createdAt: start,
    durationMs: 14000,
    sampleRateHz: 10,
    source: 'simulator',
    isSample: true,
    notes: 'Sesi contoh penarikan dyno WOT 2.800–11.900 RPM dengan indikasi sedikit lean di area 7.800 RPM.',
    frames,
  };
}

function generateSampleStreetSession(): LogSession {
  const start = Date.now() - 1000 * 60 * 180; // 3 hours ago
  const frames: TelemetryFrame[] = [];
  const totalSamples = 180; // 18 seconds at 10Hz

  for (let i = 0; i < totalSamples; i++) {
    const t = i / 10;
    const tps = Number(Math.max(2, Math.min(88, 35 + Math.sin(t * 0.8) * 32 + Math.cos(t * 1.9) * 18)).toFixed(1));
    const rpm = Math.round(2400 + (tps / 100) * 7200 + Math.sin(t * 2.2) * 450);
    const afr = Number((13.9 - (tps / 100) * 1.2 + Math.sin(i * 0.7) * 0.2).toFixed(1));
    const ect = Math.round(86 + Math.sin(t * 0.3) * 4);

    frames.push({
      timestamp: start + i * 100,
      elapsedMs: i * 100,
      rpm,
      afr,
      tps,
      map: Math.round(38 + (tps / 100) * 58),
      ect,
      iat: 37,
      battery: 14.1,
      ignTiming: Number((16 + (rpm / 10000) * 16).toFixed(1)),
      injWidth: Number((2.2 + (tps / 100) * 6.4).toFixed(2)),
      speed: Math.round(Math.max(15, (rpm - 1200) * 0.0105)),
    });
  }

  return {
    id: 'sample-street-ride-2',
    name: 'Contoh Road Test — Touring Harian',
    createdAt: start,
    durationMs: 18000,
    sampleRateHz: 10,
    source: 'simulator',
    isSample: true,
    notes: 'Sesi contoh berkendara harian variasi bukaan gas 10–88% TPS.',
    frames,
  };
}

export async function loadAllSessions(): Promise<LogSession[]> {
  try {
    const db = await openDB();
    const sessions = await new Promise<LogSession[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as LogSession[]) || []);
      req.onerror = () => reject(req.error);
    });

    if (sessions.length === 0 && !localStorage.getItem(SEEDED_FLAG_KEY)) {
      const seeds = [generateSampleDynoSession(), generateSampleStreetSession()];
      for (const s of seeds) {
        await saveSession(s);
      }
      localStorage.setItem(SEEDED_FLAG_KEY, '1');
      return seeds.sort((a, b) => b.createdAt - a.createdAt);
    }

    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LogSession[];
        return parsed.sort((a, b) => b.createdAt - a.createdAt);
      }
      if (!localStorage.getItem(SEEDED_FLAG_KEY)) {
        const seeds = [generateSampleDynoSession(), generateSampleStreetSession()];
        localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(seeds));
        localStorage.setItem(SEEDED_FLAG_KEY, '1');
        return seeds;
      }
    } catch {
      // ignore
    }
    return [];
  }
}

export async function saveSession(session: LogSession): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const existing = await loadAllSessions();
    const filtered = existing.filter((s) => s.id !== session.id);
    const next = [session, ...filtered].slice(0, 15);
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(next));
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const existing = await loadAllSessions();
    localStorage.setItem(
      LS_FALLBACK_KEY,
      JSON.stringify(existing.filter((s) => s.id !== id))
    );
  }
}

export function exportSessionToCSV(session: LogSession): string {
  const header = [
    'Elapsed_ms',
    'Timestamp_ISO',
    'RPM',
    'AFR',
    'TPS_pct',
    'MAP_kPa',
    'ECT_C',
    'IAT_C',
    'Battery_V',
    'Ignition_BTDC',
    'Injector_ms',
    'Speed_kmh',
  ].join(',');

  const rows = session.frames.map((f) =>
    [
      f.elapsedMs,
      new Date(f.timestamp).toISOString(),
      f.rpm,
      f.afr,
      f.tps,
      f.map,
      f.ect,
      f.iat,
      f.battery,
      f.ignTiming,
      f.injWidth,
      f.speed,
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseImportedLog(filename: string, text: string): LogSession {
  const trimmed = text.trim();
  const baseName = filename.replace(/\.(csv|json|txt|log)$/i, '');

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed.frames)) {
      return {
        ...parsed,
        id: `import-${Date.now()}`,
        name: parsed.name || baseName,
        source: 'imported',
        isSample: false,
      };
    }
  }

  const lines = trimmed.split(/[\r\n]+/).filter((l) => l.trim().length > 0);
  const frames: TelemetryFrame[] = [];
  const baseTs = Date.now();
  let prevFrame = createInitialFrame();

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    // Strip common Android Serial Bluetooth Terminal prefixes like "12:04:15.230 " or "[RX] "
    const cleanedLine = rawLine
      .replace(/^\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\s*/i, '')
      .replace(/^\[?(?:RX|TX|IN|OUT)\]?[:>\s-]*/i, '')
      .trim();

    if (!cleanedLine) continue;

    // 1. Detect HEX packet string from HC-05 terminal (e.g. "AA 55 21 34 ...")
    const hexCandidate = cleanedLine.replace(/\s+/g, '');
    if (/^(?:[0-9a-fA-F]{2}){12,}$/.test(hexCandidate)) {
      const hexBytes = hexToBytes(hexCandidate);
      const parsedHex = parseJukenPacket(hexBytes, 'juken_binary', baseTs, prevFrame);
      if (parsedHex) {
        const elapsedMs = frames.length * 100;
        const f = { ...parsedHex, elapsedMs, timestamp: baseTs + elapsedMs };
        prevFrame = f;
        frames.push(f);
        continue;
      }
    }

    // 2. Try Key-Value ASCII (e.g. "RPM:8500 AFR:12.8 TPS:85")
    if (/RPM[:=]/i.test(cleanedLine)) {
      const asciiBytes = new TextEncoder().encode(cleanedLine);
      const parsedKv = parseJukenPacket(asciiBytes, 'key_value', baseTs, prevFrame);
      if (parsedKv) {
        const elapsedMs = frames.length * 100;
        const f = { ...parsedKv, elapsedMs, timestamp: baseTs + elapsedMs };
        prevFrame = f;
        frames.push(f);
        continue;
      }
    }

    const cols = cleanedLine.split(',').map((c) => c.trim());
    // Skip CSV header row
    if (idx === 0 && Number.isNaN(parseFloat(cols[0])) && Number.isNaN(parseFloat(cols[2] || ''))) {
      continue;
    }

    // Detect if col[0] is Elapsed_ms and col[2] is RPM, or col[0] is RPM directly
    const isFullFormat = cols.length >= 10 && Number.isNaN(Date.parse(cols[1])) === false;
    if (isFullFormat) {
      const elapsedMs = parseFloat(cols[0]) || frames.length * 100;
      const f: TelemetryFrame = {
        elapsedMs,
        timestamp: Date.parse(cols[1]) || baseTs + elapsedMs,
        rpm: parseFloat(cols[2]) || 0,
        afr: parseFloat(cols[3]) || 14.0,
        tps: parseFloat(cols[4]) || 0,
        map: parseFloat(cols[5]) || 35,
        ect: parseFloat(cols[6]) || 80,
        iat: parseFloat(cols[7]) || 32,
        battery: parseFloat(cols[8]) || 13.8,
        ignTiming: parseFloat(cols[9]) || 15,
        injWidth: parseFloat(cols[10]) || 2.0,
        speed: parseFloat(cols[11]) || 0,
      };
      prevFrame = f;
      frames.push(f);
    } else {
      const nums = cols.map((c) => parseFloat(c));
      if (!Number.isNaN(nums[0]) && !Number.isNaN(nums[1])) {
        const elapsedMs = frames.length * 100;
        const f: TelemetryFrame = {
          elapsedMs,
          timestamp: baseTs + elapsedMs,
          rpm: nums[0],
          afr: nums[1],
          tps: nums[2] ?? 0,
          map: nums[3] ?? 40,
          ect: nums[4] ?? 80,
          iat: nums[5] ?? 32,
          battery: nums[6] ?? 13.8,
          ignTiming: nums[7] ?? 15,
          injWidth: nums[8] ?? 2.2,
          speed: nums[9] ?? 0,
        };
        prevFrame = f;
        frames.push(f);
      }
    }
  }

  if (frames.length === 0) {
    throw new Error(
      'Format log tidak dikenali atau data kosong. Gunakan file/teks CSV, JSON, Key-Value (RPM:8500 AFR:12.8), atau HEX frame (AA 55 ...).'
    );
  }

  const durationMs = frames[frames.length - 1].elapsedMs - frames[0].elapsedMs;
  return {
    id: `import-${Date.now()}`,
    name: baseName,
    createdAt: Date.now(),
    durationMs: Math.max(durationMs, frames.length * 100),
    sampleRateHz: 10,
    source: 'imported',
    isSample: false,
    frames,
  };
}
