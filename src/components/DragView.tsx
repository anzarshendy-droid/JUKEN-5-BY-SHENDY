import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConnectionMode,
  DragRunRecord,
  DragTargetDistance,
  TelemetryFrame,
} from '../types/telemetry';
import {
  clearAllDragRuns,
  deleteDragRun,
  DIST_201M,
  DIST_402M,
  DIST_60FT_M,
  exportDragRunsToCsv,
  formatDragSeconds,
  haversineMeters,
  interpolateCrossing,
  loadDragRuns,
  saveDragRun,
} from '../utils/dragTimer';
import {
  Download,
  Flag,
  Gauge,
  Navigation,
  Play,
  RotateCcw,
  Square,
  Trash2,
  Trophy,
} from 'lucide-react';

interface DragViewProps {
  frame: TelemetryFrame;
  connectionMode: ConnectionMode;
}

type DragPhase = 'idle' | 'staging' | 'countdown' | 'armed' | 'running' | 'finished';
type DragSource = 'gps' | 'simulator';

interface LiveSplits {
  elapsedMs: number;
  distanceM: number;
  speedKmh: number;
  accuracyM: number | null;
  reactionTimeMs: number | null;
  time60ftMs: number | null;
  time0to60Ms: number | null;
  time0to100Ms: number | null;
  time201mMs: number | null;
  trap201Kmh: number | null;
  time402mMs: number | null;
  trap402Kmh: number | null;
  peakSpeedKmh: number;
  peakRpm: number;
}

const INITIAL_SPLITS: LiveSplits = {
  elapsedMs: 0,
  distanceM: 0,
  speedKmh: 0,
  accuracyM: null,
  reactionTimeMs: null,
  time60ftMs: null,
  time0to60Ms: null,
  time0to100Ms: null,
  time201mMs: null,
  trap201Kmh: null,
  time402mMs: null,
  trap402Kmh: null,
  peakSpeedKmh: 0,
  peakRpm: 0,
};

export const DragView: React.FC<DragViewProps> = ({ frame, connectionMode }) => {
  const [targetDistance, setTargetDistance] = useState<DragTargetDistance>(201);
  const [sourceMode, setSourceMode] = useState<DragSource>('gps');
  const [launchMode, setLaunchMode] = useState<'auto_move' | 'tree'>('auto_move');
  const [phase, setPhase] = useState<DragPhase>('idle');
  const [countdownStep, setCountdownStep] = useState<number>(3);
  const [splits, setSplits] = useState<LiveSplits>(INITIAL_SPLITS);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Siap kunci sinyal GPS');
  const [runs, setRuns] = useState<DragRunRecord[]>(() => loadDragRuns());

  // Mutable refs for accurate 20Hz / GPS watch updates without stale closures
  const phaseRef = useRef<DragPhase>('idle');
  const splitsRef = useRef<LiveSplits>(INITIAL_SPLITS);
  const startTimeRef = useRef<number>(0);
  const greenLightTimeRef = useRef<number>(0);
  const prevSampleRef = useRef<{
    timeMs: number;
    distanceM: number;
    speedKmh: number;
    lat: number;
    lon: number;
  } | null>(null);
  const latestRpmRef = useRef<number>(frame.rpm);
  const watchIdRef = useRef<number | null>(null);
  const simTimerRef = useRef<number | null>(null);
  const rafTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestRpmRef.current = frame.rpm;
  }, [frame.rpm]);

  const stopAllTimers = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simTimerRef.current !== null) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    if (rafTimerRef.current !== null) {
      clearInterval(rafTimerRef.current);
      rafTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopAllTimers();
  }, [stopAllTimers]);

  const finalizeRun = useCallback(
    (finalSplits: LiveSplits, src: DragSource, target: DragTargetDistance) => {
      stopAllTimers();
      phaseRef.current = 'finished';
      setPhase('finished');
      setSplits(finalSplits);

      const record: DragRunRecord = {
        id: `drag-${Date.now()}`,
        createdAt: Date.now(),
        source: src,
        targetDistance: target,
        reactionTimeMs: finalSplits.reactionTimeMs,
        time60ftMs: finalSplits.time60ftMs,
        time0to60Ms: finalSplits.time0to60Ms,
        time0to100Ms: finalSplits.time0to100Ms,
        time201mMs: finalSplits.time201mMs,
        trap201Kmh: finalSplits.trap201Kmh,
        time402mMs: finalSplits.time402mMs,
        trap402Kmh: finalSplits.trap402Kmh,
        peakSpeedKmh: Number(finalSplits.peakSpeedKmh.toFixed(1)),
        peakRpm: Math.round(finalSplits.peakRpm),
        gpsAccuracyM: finalSplits.accuracyM,
      };
      const updated = saveDragRun(record);
      setRuns(updated);
      setGpsStatus(`Finish ${target} m selesai!`);
    },
    [stopAllTimers]
  );

  const processMotionSample = useCallback(
    (
      nextDistM: number,
      nextSpeedKmh: number,
      accuracyM: number | null,
      sampleEpochMs: number,
      src: DragSource,
      target: DragTargetDistance
    ) => {
      if (phaseRef.current === 'armed') {
        // Trigger start once vehicle accelerates >= 2.8 km/h or moves >= 1.2m
        if (nextSpeedKmh >= 2.8 || nextDistM >= 1.2) {
          phaseRef.current = 'running';
          setPhase('running');
          startTimeRef.current = sampleEpochMs;
          const rt =
            greenLightTimeRef.current > 0
              ? Math.max(0, sampleEpochMs - greenLightTimeRef.current)
              : null;
          splitsRef.current = {
            ...INITIAL_SPLITS,
            accuracyM,
            reactionTimeMs: rt,
            speedKmh: nextSpeedKmh,
            distanceM: 0,
            peakSpeedKmh: nextSpeedKmh,
            peakRpm: latestRpmRef.current,
          };
          setSplits(splitsRef.current);
          prevSampleRef.current = {
            timeMs: 0,
            distanceM: 0,
            speedKmh: nextSpeedKmh,
            lat: prevSampleRef.current?.lat || 0,
            lon: prevSampleRef.current?.lon || 0,
          };
        }
        return;
      }

      if (phaseRef.current !== 'running') return;

      const elapsedMs = Math.max(0, sampleEpochMs - startTimeRef.current);
      const prev = prevSampleRef.current || {
        timeMs: 0,
        distanceM: 0,
        speedKmh: 0,
        lat: 0,
        lon: 0,
      };

      const cur = { ...splitsRef.current };
      cur.elapsedMs = elapsedMs;
      cur.distanceM = nextDistM;
      cur.speedKmh = nextSpeedKmh;
      cur.accuracyM = accuracyM;
      cur.peakSpeedKmh = Math.max(cur.peakSpeedKmh, nextSpeedKmh);
      cur.peakRpm = Math.max(cur.peakRpm, latestRpmRef.current);

      // 0 - 60 km/h
      if (cur.time0to60Ms === null && nextSpeedKmh >= 60) {
        const hit = interpolateCrossing(
          prev.speedKmh,
          nextSpeedKmh,
          60,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time0to60Ms = hit.timeMs;
      }

      // 0 - 100 km/h
      if (cur.time0to100Ms === null && nextSpeedKmh >= 100) {
        const hit = interpolateCrossing(
          prev.speedKmh,
          nextSpeedKmh,
          100,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time0to100Ms = hit.timeMs;
      }

      // 60 ft (18.288 m)
      if (cur.time60ftMs === null && nextDistM >= DIST_60FT_M) {
        const hit = interpolateCrossing(
          prev.distanceM,
          nextDistM,
          DIST_60FT_M,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time60ftMs = hit.timeMs;
      }

      // 201 m (1/8 mile)
      if (cur.time201mMs === null && nextDistM >= DIST_201M) {
        const hit = interpolateCrossing(
          prev.distanceM,
          nextDistM,
          DIST_201M,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time201mMs = hit.timeMs;
        cur.trap201Kmh = hit.speedKmh;
      }

      // 402 m (1/4 mile)
      if (cur.time402mMs === null && nextDistM >= DIST_402M) {
        const hit = interpolateCrossing(
          prev.distanceM,
          nextDistM,
          DIST_402M,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time402mMs = hit.timeMs;
        cur.trap402Kmh = hit.speedKmh;
      }

      prevSampleRef.current = {
        timeMs: elapsedMs,
        distanceM: nextDistM,
        speedKmh: nextSpeedKmh,
        lat: prev.lat,
        lon: prev.lon,
      };
      splitsRef.current = cur;
      setSplits(cur);

      if (nextDistM >= target) {
        finalizeRun(cur, src, target);
      }
    },
    [finalizeRun]
  );

  const beginTrackingSession = useCallback(
    (src: DragSource, target: DragTargetDistance, withReactionLight: boolean) => {
      stopAllTimers();
      setGpsError(null);
      splitsRef.current = INITIAL_SPLITS;
      setSplits(INITIAL_SPLITS);
      prevSampleRef.current = null;
      greenLightTimeRef.current = withReactionLight ? Date.now() : 0;

      if (src === 'gps') {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setGpsError('Browser/perangkat ini tidak mendukung GPS Geolocation.');
          phaseRef.current = 'idle';
          setPhase('idle');
          return;
        }

        phaseRef.current = 'armed';
        setPhase('armed');
        setGpsStatus('GPS Aktif · Silakan gas / jalan dari posisi diam (0 m)');

        let cumulativeDist = 0;
        let lastCoord: { lat: number; lon: number; time: number } | null = null;

        // 50ms smooth visual stopwatch while running
        rafTimerRef.current = window.setInterval(() => {
          if (phaseRef.current === 'running') {
            setSplits((s) => ({
              ...s,
              elapsedMs: Math.max(0, Date.now() - startTimeRef.current),
            }));
          }
        }, 50);

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, speed, accuracy } = pos.coords;
            const now = pos.timestamp || Date.now();
            const acc = Number.isFinite(accuracy) ? Math.round(accuracy) : null;

            let speedKmh = speed !== null && Number.isFinite(speed) ? speed * 3.6 : 0;

            if (lastCoord) {
              const dtSec = Math.max(0.05, (now - lastCoord.time) / 1000);
              const stepM = haversineMeters(lastCoord.lat, lastCoord.lon, latitude, longitude);

              // Filter GPS stationary jitter (< 0.8m when accuracy is wide)
              const jitterFloor = acc && acc > 15 ? 1.5 : 0.7;
              if (phaseRef.current === 'running') {
                if (stepM >= jitterFloor) {
                  cumulativeDist += stepM;
                }
                if (speed === null || !Number.isFinite(speed)) {
                  speedKmh = (stepM / dtSec) * 3.6;
                }
              } else if (phaseRef.current === 'armed') {
                // Only arm-trigger on genuine movement (> 2.5m from stage point or GPS speed >= 3 km/h)
                const launchDelta = haversineMeters(
                  lastCoord.lat,
                  lastCoord.lon,
                  latitude,
                  longitude
                );
                if (speedKmh >= 3.0 || launchDelta >= 3.0) {
                  cumulativeDist = launchDelta;
                } else {
                  setSplits((s) => ({ ...s, accuracyM: acc }));
                  return;
                }
              }
            } else {
              lastCoord = { lat: latitude, lon: longitude, time: now };
              setSplits((s) => ({ ...s, accuracyM: acc }));
              setGpsStatus(
                `GPS Terkunci (±${acc ?? '-'} m) · Siap Launch!`
              );
              return;
            }

            lastCoord = { lat: latitude, lon: longitude, time: now };
            processMotionSample(cumulativeDist, speedKmh, acc, now, 'gps', target);
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setGpsError('Izin lokasi GPS ditolak. Aktifkan izin Lokasi pada browser Anda.');
            } else if (err.code === err.POSITION_UNAVAILABLE) {
              setGpsError('Sinyal GPS tidak tersedia. Coba di area terbuka atau gunakan Mode Simulasi Drag.');
            } else {
              setGpsError('Timeout mencari sinyal GPS. Gunakan area terbuka atau Mode Simulasi Drag.');
            }
            stopAllTimers();
            phaseRef.current = 'idle';
            setPhase('idle');
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000,
          }
        );
      } else {
        // Realistic Drag Motorcycle Physics Simulator (20Hz) for indoor testing / demo
        phaseRef.current = 'running';
        setPhase('running');
        startTimeRef.current = Date.now();
        const reactionMs = withReactionLight ? Math.round(140 + Math.random() * 180) : null;
        splitsRef.current = {
          ...INITIAL_SPLITS,
          accuracyM: 2.5,
          reactionTimeMs: reactionMs,
        };
        setGpsStatus('Simulasi Drag GPS 20 Hz berjalan...');

        let simDistM = 0;
        let simSpeedMs = 0;
        const dt = 0.05; // 50ms tick
        const peakAccel = 7.4 + (Math.random() - 0.5) * 0.4; // ~0.75G launch

        simTimerRef.current = window.setInterval(() => {
          const now = Date.now();
          const elapsedSec = (now - startTimeRef.current) / 1000;
          // Progressive motorcycle drag acceleration curve (torque tapers cleanly at high speed)
          const dragDecay = Math.max(1.8, peakAccel - simSpeedMs * 0.13);
          simSpeedMs = Math.min(43.5, simSpeedMs + dragDecay * dt); // up to ~156 km/h
          simDistM += simSpeedMs * dt;
          const speedKmh = simSpeedMs * 3.6;
          // Synthetic realistic RPM correlated if ECU disconnected
          if (connectionMode === 'disconnected') {
            const syntheticRpm = Math.min(12600, 4800 + ((simSpeedMs * 240) % 7600));
            latestRpmRef.current = syntheticRpm;
          }

          processMotionSample(simDistM, speedKmh, 2.5, now, 'simulator', target);
          if (elapsedSec > 25) {
            stopAllTimers();
          }
        }, 50);
      }
    },
    [connectionMode, processMotionSample, stopAllTimers]
  );

  const handleStartDrag = () => {
    setGpsError(null);
    if (launchMode === 'tree') {
      stopAllTimers();
      phaseRef.current = 'countdown';
      setPhase('countdown');
      setCountdownStep(3);
      let step = 3;
      countdownTimerRef.current = window.setInterval(() => {
        step -= 1;
        if (step > 0) {
          setCountdownStep(step);
        } else {
          if (countdownTimerRef.current !== null) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCountdownStep(0);
          beginTrackingSession(sourceMode, targetDistance, true);
        }
      }, 850);
    } else {
      beginTrackingSession(sourceMode, targetDistance, false);
    }
  };

  const handleStopOrReset = () => {
    stopAllTimers();
    phaseRef.current = 'idle';
    setPhase('idle');
    setSplits(INITIAL_SPLITS);
    setGpsError(null);
    setGpsStatus('Siap kunci sinyal GPS');
  };

  const handleExportCsv = () => {
    if (runs.length === 0) return;
    const csv = exportDragRunsToCsv(runs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sag65-drag-timeslip-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const best201 = useMemo(() => {
    const valid = runs.filter((r) => r.time201mMs !== null);
    if (valid.length === 0) return null;
    return valid.reduce((best, r) =>
      (r.time201mMs ?? Infinity) < (best.time201mMs ?? Infinity) ? r : best
    );
  }, [runs]);

  const best402 = useMemo(() => {
    const valid = runs.filter((r) => r.time402mMs !== null);
    if (valid.length === 0) return null;
    return valid.reduce((best, r) =>
      (r.time402mMs ?? Infinity) < (best.time402mMs ?? Infinity) ? r : best
    );
  }, [runs]);

  const progressPct = Math.min(100, (splits.distanceM / targetDistance) * 100);

  return (
    <div className="space-y-4">
      {/* Control & Target Distance Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Flag className="w-5 h-5 text-[#FF6B1A]" />
              <span>Mode Drag Timer GPS (201 m &amp; 402 m)</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Catat waktu tempuh 60ft, 0–60 km/h, 0–100 km/h, 201 meter, dan 402 meter lengkap dengan kecepatan akhir (Trap Speed) dan Peak RPM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Target Distance Switcher */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#0B0E14] p-1 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={phase === 'running' || phase === 'armed' || phase === 'countdown'}
                onClick={() => setTargetDistance(201)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                  targetDistance === 201
                    ? 'bg-[#FF6B1A] text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                201 m (1/8 Mile)
              </button>
              <button
                type="button"
                disabled={phase === 'running' || phase === 'armed' || phase === 'countdown'}
                onClick={() => setTargetDistance(402)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                  targetDistance === 402
                    ? 'bg-[#FF6B1A] text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                402 m (1/4 Mile)
              </button>
            </div>

            {/* Source Mode Switcher */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#0B0E14] p-1 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={phase === 'running' || phase === 'armed' || phase === 'countdown'}
                onClick={() => setSourceMode('gps')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                  sourceMode === 'gps'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-[#FF6B1A]" />
                <span>GPS Live</span>
              </button>
              <button
                type="button"
                disabled={phase === 'running' || phase === 'armed' || phase === 'countdown'}
                onClick={() => setSourceMode('simulator')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                  sourceMode === 'simulator'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Gauge className="w-3.5 h-3.5 text-[#FF6B1A]" />
                <span>Simulasi Uji</span>
              </button>
            </div>
          </div>
        </div>

        {/* Launch Mode + Primary Start/Stop Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Pemicu Start:</span>
            <button
              type="button"
              disabled={phase !== 'idle' && phase !== 'finished'}
              onClick={() => setLaunchMode('auto_move')}
              className={`min-h-[36px] px-3 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60 ${
                launchMode === 'auto_move'
                  ? 'border-[#FF6B1A]/60 bg-[#FF6B1A]/10 text-[#E05206] dark:text-[#FF8533]'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-600 dark:text-slate-400'
              }`}
            >
              Otomatis Saat Bergerak
            </button>
            <button
              type="button"
              disabled={phase !== 'idle' && phase !== 'finished'}
              onClick={() => setLaunchMode('tree')}
              className={`min-h-[36px] px-3 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60 ${
                launchMode === 'tree'
                  ? 'border-[#FF6B1A]/60 bg-[#FF6B1A]/10 text-[#E05206] dark:text-[#FF8533]'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-600 dark:text-slate-400'
              }`}
            >
              Lampu Start (3-2-1-GO)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {phase === 'idle' || phase === 'finished' ? (
              <button
                type="button"
                onClick={handleStartDrag}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{phase === 'finished' ? `Ulangi Drag ${targetDistance} m` : `Mulai Drag ${targetDistance} m`}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopOrReset}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Hentikan / Reset</span>
              </button>
            )}

            {phase === 'finished' && (
              <button
                type="button"
                onClick={handleStopOrReset}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {gpsError && (
          <div className="rounded-xl border border-red-500/40 bg-red-50 dark:bg-red-950/25 p-3 text-xs text-red-700 dark:text-red-300">
            {gpsError}
          </div>
        )}
      </div>

      {/* Christmas Tree Countdown Overlay Banner */}
      {phase === 'countdown' && (
        <div className="rounded-2xl border border-[#FF6B1A]/50 bg-white dark:bg-[#121721] p-6 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-4">
            {[3, 2, 1].map((num) => (
              <div
                key={num}
                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-display font-bold text-lg transition-all ${
                  countdownStep === num
                    ? 'bg-amber-400 border-amber-300 text-slate-950 scale-110 shadow-lg shadow-amber-500/30'
                    : countdownStep < num
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-500'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                }`}
              >
                {num}
              </div>
            ))}
          </div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Bersiap di Garis Start (Stage)...
          </div>
        </div>
      )}

      {/* Primary Live Chronometer & Distance Cockpit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {phase === 'armed'
                ? 'SIAP START (GO!) · Menunggu Gerakan'
                : phase === 'running'
                ? `SEDANG BERLARI · Target ${targetDistance} m`
                : phase === 'finished'
                ? `FINISH ${targetDistance} m`
                : gpsStatus}
            </span>
            <span className="font-mono tabular-nums">
              {sourceMode === 'gps'
                ? `GPS ${splits.accuracyM !== null ? `±${splits.accuracyM} m` : 'Menunggu'}`
                : 'Simulasi 20 Hz'}
              {' · '}
              {connectionMode !== 'disconnected'
                ? `ECU ${Math.round(frame.rpm).toLocaleString('id-ID')} RPM`
                : 'ECU Standby'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-end">
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Waktu Berjalan (ET)
              </div>
              <div className="font-mono tabular-nums text-4xl sm:text-5xl font-bold text-[#FF6B1A] leading-none mt-1">
                {(splits.elapsedMs / 1000).toFixed(2)}
                <span className="text-lg font-medium text-slate-500 dark:text-slate-400 ml-1">s</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Kecepatan GPS
              </div>
              <div className="font-mono tabular-nums text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 leading-none mt-1">
                {splits.speedKmh.toFixed(1)}
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 ml-1">km/h</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Jarak Tempuh
              </div>
              <div className="font-mono tabular-nums text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 leading-none mt-1">
                {Math.min(targetDistance, splits.distanceM).toFixed(1)}
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 ml-1">
                  / {targetDistance} m
                </span>
              </div>
            </div>
          </div>

          {/* Track Progress Bar with 201m & 402m Marker */}
          <div className="space-y-1.5 pt-1">
            <div className="relative h-3.5 w-full rounded-full bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#FF6B1A] transition-all duration-75"
                style={{ width: `${progressPct}%` }}
              />
              {targetDistance === 402 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400"
                  style={{ left: '50%' }}
                  title="Garis 201 m"
                />
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <span>0 m (Start)</span>
              {targetDistance === 402 && <span className="text-emerald-600 dark:text-emerald-400">201 m</span>}
              <span>{targetDistance} m (Finish)</span>
            </div>
          </div>
        </div>

        {/* Live Split Timeslip Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Catatan Waktu Split (Timeslip)
            </h3>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Peak {Math.round(splits.peakRpm).toLocaleString('id-ID')} RPM
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Reaction Time (RT)</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.reactionTimeMs)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">60 ft (18.3 m)</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time60ftMs)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">0 – 60 km/h</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time0to60Ms)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">0 – 100 km/h</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time0to100Ms)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#FF6B1A] font-semibold">201 m (1/8 Mile)</span>
              <span className="font-bold text-[#FF6B1A]">
                {formatDragSeconds(splits.time201mMs)}
                {splits.trap201Kmh !== null ? ` · ${splits.trap201Kmh.toFixed(1)} km/h` : ''}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">402 m (1/4 Mile)</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatDragSeconds(splits.time402mMs)}
                {splits.trap402Kmh !== null ? ` · ${splits.trap402Kmh.toFixed(1)} km/h` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Best Records (201m & 402m) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-[#FF6B1A]" />
              <span>Rekor Terbaik 201 m</span>
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
              {best201 ? formatDragSeconds(best201.time201mMs) : '--.-- s'}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {best201
                ? `Trap ${best201.trap201Kmh?.toFixed(1) ?? '-'} km/h · ${best201.source === 'gps' ? 'GPS' : 'Simulasi'}`
                : 'Belum ada catatan 201 m'}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-emerald-500" />
              <span>Rekor Terbaik 402 m</span>
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
              {best402 ? formatDragSeconds(best402.time402mMs) : '--.-- s'}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {best402
                ? `Trap ${best402.trap402Kmh?.toFixed(1) ?? '-'} km/h · ${best402.source === 'gps' ? 'GPS' : 'Simulasi'}`
                : 'Belum ada catatan 402 m'}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Drag Run History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Riwayat Catatan Waktu Drag ({runs.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Semua hasil waktu GPS 201 m &amp; 402 m tersimpan otomatis di perangkat Anda.
            </p>
          </div>
          {runs.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor CSV</span>
              </button>
              <button
                type="button"
                onClick={() => setRuns(clearAllDragRuns())}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Semua</span>
              </button>
            </div>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-8 text-center text-xs text-slate-500">
            Belum ada catatan drag. Pilih target 201 m atau 402 m lalu tekan tombol Mulai Drag untuk merekam waktu pertama Anda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 px-2 font-medium">Mode</th>
                  <th className="py-2 px-2 font-medium">60 ft</th>
                  <th className="py-2 px-2 font-medium">0–60</th>
                  <th className="py-2 px-2 font-medium text-[#FF6B1A]">201 m</th>
                  <th className="py-2 px-2 font-medium text-emerald-600 dark:text-emerald-400">402 m</th>
                  <th className="py-2 px-2 font-medium">Top km/h</th>
                  <th className="py-2 pl-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {runs.map((r) => (
                  <tr key={r.id} className="text-slate-800 dark:text-slate-200">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {new Date(r.createdAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {r.source === 'gps' ? 'GPS' : 'Simulasi'} · {r.targetDistance}m
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDragSeconds(r.time60ftMs)}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDragSeconds(r.time0to60Ms)}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap font-semibold text-[#FF6B1A]">
                      {formatDragSeconds(r.time201mMs)}
                      {r.trap201Kmh !== null ? ` (${r.trap201Kmh.toFixed(0)})` : ''}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatDragSeconds(r.time402mMs)}
                      {r.trap402Kmh !== null ? ` (${r.trap402Kmh.toFixed(0)})` : ''}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{r.peakSpeedKmh.toFixed(1)}</td>
                    <td className="py-2.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => setRuns(deleteDragRun(r.id))}
                        title="Hapus catatan"
                        className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
