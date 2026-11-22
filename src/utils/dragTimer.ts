import { DragRunRecord } from '../types/telemetry';

const LS_DRAG_RUNS_KEY = 'sag65_drag_runs_v1';

export const DIST_30FT_M = 9.144;
export const DIST_60FT_M = 18.288;
export const DIST_330FT_M = 100.584;
export const DIST_201M = 201;
export const DIST_1000FT_M = 304.8;
export const DIST_402M = 402;

/**
 * Computes great-circle distance in meters between two WGS84 coordinates (Haversine).
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Linearly interpolates exact crossing timestamp/value between two samples.
 */
export function interpolateCrossing(
  prevVal: number,
  currVal: number,
  targetVal: number,
  prevTimeMs: number,
  currTimeMs: number,
  prevSpeed: number,
  currSpeed: number
): { timeMs: number; speedKmh: number } {
  const delta = currVal - prevVal;
  if (delta <= 0) {
    return { timeMs: currTimeMs, speedKmh: currSpeed };
  }
  const ratio = Math.min(1, Math.max(0, (targetVal - prevVal) / delta));
  return {
    timeMs: Math.round(prevTimeMs + (currTimeMs - prevTimeMs) * ratio),
    speedKmh: Number((prevSpeed + (currSpeed - prevSpeed) * ratio).toFixed(1)),
  };
}

export function formatDragSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '--.-- s';
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDragSecondsPlain(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '-';
  return (ms / 1000).toFixed(3);
}

export function loadDragRuns(): DragRunRecord[] {
  try {
    const raw = localStorage.getItem(LS_DRAG_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDragRun(run: DragRunRecord): DragRunRecord[] {
  const current = loadDragRuns();
  const next = [run, ...current].slice(0, 100);
  try {
    localStorage.setItem(LS_DRAG_RUNS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function deleteDragRun(id: string): DragRunRecord[] {
  const next = loadDragRuns().filter((r) => r.id !== id);
  try {
    localStorage.setItem(LS_DRAG_RUNS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearAllDragRuns(): DragRunRecord[] {
  try {
    localStorage.removeItem(LS_DRAG_RUNS_KEY);
  } catch {
    // ignore
  }
  return [];
}

export function exportDragRunsToCsv(runs: DragRunRecord[]): string {
  const headers = [
    'ID',
    'Waktu',
    'Sumber',
    'Target_m',
    'Status_Start',
    'RT_s',
    '30ft_s',
    '60ft_s',
    '330ft_s',
    '0_60kmh_s',
    '0_100kmh_s',
    '201m_s',
    'Trap_201_kmh',
    '1000ft_s',
    '402m_s',
    'Trap_402_kmh',
    'Peak_Speed_kmh',
    'Peak_RPM',
    'GPS_Accuracy_m',
  ];
  const rows = runs.map((r) => [
    r.id,
    new Date(r.createdAt).toISOString(),
    r.source,
    r.targetDistance,
    r.isJumpStart ? 'FOUL' : 'VALID',
    formatDragSecondsPlain(r.reactionTimeMs),
    formatDragSecondsPlain(r.time30ftMs),
    formatDragSecondsPlain(r.time60ftMs),
    formatDragSecondsPlain(r.time330ftMs),
    formatDragSecondsPlain(r.time0to60Ms),
    formatDragSecondsPlain(r.time0to100Ms),
    formatDragSecondsPlain(r.time201mMs),
    r.trap201Kmh !== null ? r.trap201Kmh.toFixed(1) : '-',
    formatDragSecondsPlain(r.time1000ftMs),
    formatDragSecondsPlain(r.time402mMs),
    r.trap402Kmh !== null ? r.trap402Kmh.toFixed(1) : '-',
    r.peakSpeedKmh.toFixed(1),
    r.peakRpm,
    r.gpsAccuracyM !== null ? r.gpsAccuracyM.toFixed(1) : '-',
  ]);
  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
