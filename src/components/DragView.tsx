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
  DIST_1000FT_M,
  DIST_201M,
  DIST_30FT_M,
  DIST_330FT_M,
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
  Compass,
  Crosshair,
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

type DragPhase = 'idle' | 'countdown' | 'armed' | 'running' | 'finished';
type DragSource = 'gps' | 'simulator';

interface GyroTelemetry {
  ozDeg: number; // Yaw / Oz relative heading (-180..+180)
  pitchDeg: number; // Front lift / dive (-90..+90)
  rollDeg: number; // Lean left / right (-90..+90)
  launchG: number; // Longitudinal G-force
  peakG: number;
  maxPitchDeg: number;
  maxOzDriftDeg: number;
  hasLiveSensor: boolean;
}

interface LiveSplits {
  elapsedMs: number;
  distanceM: number;
  speedKmh: number;
  accuracyM: number | null;
  isJumpStart: boolean;
  reactionTimeMs: number | null;
  time30ftMs: number | null;
  time60ftMs: number | null;
  time330ftMs: number | null;
  time0to60Ms: number | null;
  time0to100Ms: number | null;
  time201mMs: number | null;
  trap201Kmh: number | null;
  time1000ftMs: number | null;
  time402mMs: number | null;
  trap402Kmh: number | null;
  peakSpeedKmh: number;
  peakRpm: number;
  peakLaunchG: number;
  maxPitchDeg: number;
  maxOzDriftDeg: number;
}

const INITIAL_SPLITS: LiveSplits = {
  elapsedMs: 0,
  distanceM: 0,
  speedKmh: 0,
  accuracyM: null,
  isJumpStart: false,
  reactionTimeMs: null,
  time30ftMs: null,
  time60ftMs: null,
  time330ftMs: null,
  time0to60Ms: null,
  time0to100Ms: null,
  time201mMs: null,
  trap201Kmh: null,
  time1000ftMs: null,
  time402mMs: null,
  trap402Kmh: null,
  peakSpeedKmh: 0,
  peakRpm: 0,
  peakLaunchG: 0,
  maxPitchDeg: 0,
  maxOzDriftDeg: 0,
};

const INITIAL_GYRO: GyroTelemetry = {
  ozDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  launchG: 0,
  peakG: 0,
  maxPitchDeg: 0,
  maxOzDriftDeg: 0,
  hasLiveSensor: false,
};

function normalizeAngle180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

export const DragView: React.FC<DragViewProps> = ({ frame, connectionMode }) => {
  const [targetDistance, setTargetDistance] = useState<DragTargetDistance>(201);
  const [sourceMode, setSourceMode] = useState<DragSource>('gps');
  const [launchMode, setLaunchMode] = useState<'auto_move' | 'tree'>('tree');
  const [phase, setPhase] = useState<DragPhase>('idle');
  const [litRedLights, setLitRedLights] = useState<number>(0); // 0..5
  const [treeStatusLight, setTreeStatusLight] = useState<'off' | 'red' | 'green' | 'foul'>('off');
  const [splits, setSplits] = useState<LiveSplits>(INITIAL_SPLITS);
  const [gyro, setGyro] = useState<GyroTelemetry>(INITIAL_GYRO);
  const [gyroNeedsPermission, setGyroNeedsPermission] = useState<boolean>(false);
  const [gyroPermissionMsg, setGyroPermissionMsg] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Siap kunci sinyal GPS');
  const [runs, setRuns] = useState<DragRunRecord[]>(() => loadDragRuns());

  const phaseRef = useRef<DragPhase>('idle');
  const splitsRef = useRef<LiveSplits>(INITIAL_SPLITS);
  const gyroRef = useRef<GyroTelemetry>(INITIAL_GYRO);
  const rawOrientRef = useRef<{ alpha: number; beta: number; gamma: number }>({
    alpha: 0,
    beta: 0,
    gamma: 0,
  });
  const orientOffsetRef = useRef<{ alpha: number; beta: number; gamma: number }>({
    alpha: 0,
    beta: 0,
    gamma: 0,
  });
  const startTimeRef = useRef<number>(0);
  const greenLightTimeRef = useRef<number>(0);
  const jumpStartRef = useRef<boolean>(false);
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
  const greenDelayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestRpmRef.current = frame.rpm;
  }, [frame.rpm]);

  // Attach hardware Gyroscope / Orientation + Accelerometer (Gyro Oz)
  const attachGyroListeners = useCallback(() => {
    if (typeof window === 'undefined') return () => {};

    const onOrientation = (ev: DeviceOrientationEvent) => {
      if (ev.alpha === null && ev.beta === null && ev.gamma === null) return;
      const rawA = ev.alpha ?? 0;
      const rawB = ev.beta ?? 0;
      const rawG = ev.gamma ?? 0;
      rawOrientRef.current = { alpha: rawA, beta: rawB, gamma: rawG };

      const ozDeg = Number(normalizeAngle180(rawA - orientOffsetRef.current.alpha).toFixed(1));
      const pitchDeg = Number(Math.max(-90, Math.min(90, rawB - orientOffsetRef.current.beta)).toFixed(1));
      const rollDeg = Number(Math.max(-90, Math.min(90, rawG - orientOffsetRef.current.gamma)).toFixed(1));

      const isActiveRun = phaseRef.current === 'running';
      const nextPeakPitch = isActiveRun
        ? Math.max(gyroRef.current.maxPitchDeg, Math.abs(pitchDeg))
        : gyroRef.current.maxPitchDeg;
      const nextPeakOz = isActiveRun
        ? Math.max(gyroRef.current.maxOzDriftDeg, Math.abs(ozDeg))
        : gyroRef.current.maxOzDriftDeg;

      const next: GyroTelemetry = {
        ...gyroRef.current,
        ozDeg,
        pitchDeg,
        rollDeg,
        maxPitchDeg: Number(nextPeakPitch.toFixed(1)),
        maxOzDriftDeg: Number(nextPeakOz.toFixed(1)),
        hasLiveSensor: true,
      };
      gyroRef.current = next;
      setGyro(next);
    };

    const onMotion = (ev: DeviceMotionEvent) => {
      const acc = ev.acceleration || ev.accelerationIncludingGravity;
      if (!acc) return;
      const ax = acc.x ?? 0;
      const ay = acc.y ?? 0;
      const az = acc.z ?? 0;
      // Subtract ~9.81 if fallback to accelerationIncludingGravity
      const netMag = ev.acceleration
        ? Math.hypot(ax, ay, az)
        : Math.max(0, Math.hypot(ax, ay, az) - 9.81);
      const launchG = Number((netMag / 9.81).toFixed(2));

      const isActiveRun = phaseRef.current === 'running';
      const nextPeakG = isActiveRun
        ? Math.max(gyroRef.current.peakG, launchG)
        : gyroRef.current.peakG;

      const next: GyroTelemetry = {
        ...gyroRef.current,
        launchG,
        peakG: Number(nextPeakG.toFixed(2)),
        hasLiveSensor: true,
      };
      gyroRef.current = next;
      setGyro(next);
    };

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, []);

  useEffect(() => {
    const devOrient = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof devOrient?.requestPermission === 'function') {
      setGyroNeedsPermission(true);
      return;
    }
    return attachGyroListeners();
  }, [attachGyroListeners]);

  const handleRequestGyroPermission = async () => {
    setGyroPermissionMsg(null);
    try {
      const devOrient = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      const devMotion = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      let granted = true;
      if (typeof devOrient?.requestPermission === 'function') {
        const res = await devOrient.requestPermission();
        if (res !== 'granted') granted = false;
      }
      if (typeof devMotion?.requestPermission === 'function') {
        const res = await devMotion.requestPermission();
        if (res !== 'granted') granted = false;
      }
      if (granted) {
        setGyroNeedsPermission(false);
        attachGyroListeners();
        setGyroPermissionMsg('Sensor Gyro Oz aktif.');
      } else {
        setGyroPermissionMsg('Izin sensor gerak ditolak di browser.');
      }
    } catch {
      setGyroPermissionMsg('Gagal mengaktifkan sensor gerak pada perangkat ini.');
    }
  };

  const handleCalibrateGyro = () => {
    orientOffsetRef.current = { ...rawOrientRef.current };
    const reset: GyroTelemetry = {
      ...gyroRef.current,
      ozDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      peakG: 0,
      maxPitchDeg: 0,
      maxOzDriftDeg: 0,
    };
    gyroRef.current = reset;
    setGyro(reset);
  };

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
    if (greenDelayTimerRef.current !== null) {
      clearTimeout(greenDelayTimerRef.current);
      greenDelayTimerRef.current = null;
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

      const mergedSplits: LiveSplits = {
        ...finalSplits,
        peakLaunchG: Number(Math.max(finalSplits.peakLaunchG, gyroRef.current.peakG).toFixed(2)),
        maxPitchDeg: Number(Math.max(finalSplits.maxPitchDeg, gyroRef.current.maxPitchDeg).toFixed(1)),
        maxOzDriftDeg: Number(Math.max(finalSplits.maxOzDriftDeg, gyroRef.current.maxOzDriftDeg).toFixed(1)),
      };
      setSplits(mergedSplits);

      const record: DragRunRecord = {
        id: `drag-${Date.now()}`,
        createdAt: Date.now(),
        source: src,
        targetDistance: target,
        isJumpStart: mergedSplits.isJumpStart,
        reactionTimeMs: mergedSplits.reactionTimeMs,
        time30ftMs: mergedSplits.time30ftMs,
        time60ftMs: mergedSplits.time60ftMs,
        time330ftMs: mergedSplits.time330ftMs,
        time0to60Ms: mergedSplits.time0to60Ms,
        time0to100Ms: mergedSplits.time0to100Ms,
        time201mMs: mergedSplits.time201mMs,
        trap201Kmh: mergedSplits.trap201Kmh,
        time1000ftMs: mergedSplits.time1000ftMs,
        time402mMs: mergedSplits.time402mMs,
        trap402Kmh: mergedSplits.trap402Kmh,
        peakSpeedKmh: Number(mergedSplits.peakSpeedKmh.toFixed(1)),
        peakRpm: Math.round(mergedSplits.peakRpm),
        gpsAccuracyM: mergedSplits.accuracyM,
        peakLaunchG: mergedSplits.peakLaunchG,
        maxPitchDeg: mergedSplits.maxPitchDeg,
        maxOzDriftDeg: mergedSplits.maxOzDriftDeg,
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
        if (nextSpeedKmh >= 2.8 || nextDistM >= 1.2) {
          phaseRef.current = 'running';
          setPhase('running');
          startTimeRef.current = sampleEpochMs;
          // Zero Oz heading at start line for clean run drift tracking
          orientOffsetRef.current.alpha = rawOrientRef.current.alpha;
          gyroRef.current = {
            ...gyroRef.current,
            ozDeg: 0,
            peakG: gyroRef.current.launchG,
            maxPitchDeg: Math.abs(gyroRef.current.pitchDeg),
            maxOzDriftDeg: 0,
          };
          setGyro(gyroRef.current);

          const rt =
            greenLightTimeRef.current > 0
              ? Math.max(0, sampleEpochMs - greenLightTimeRef.current)
              : null;
          splitsRef.current = {
            ...INITIAL_SPLITS,
            accuracyM,
            isJumpStart: jumpStartRef.current,
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
      cur.peakLaunchG = Math.max(cur.peakLaunchG, gyroRef.current.peakG);
      cur.maxPitchDeg = Math.max(cur.maxPitchDeg, gyroRef.current.maxPitchDeg);
      cur.maxOzDriftDeg = Math.max(cur.maxOzDriftDeg, gyroRef.current.maxOzDriftDeg);

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

      if (cur.time30ftMs === null && nextDistM >= DIST_30FT_M) {
        const hit = interpolateCrossing(
          prev.distanceM,
          nextDistM,
          DIST_30FT_M,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time30ftMs = hit.timeMs;
      }

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

      if (cur.time330ftMs === null && nextDistM >= DIST_330FT_M) {
        const hit = interpolateCrossing(
          prev.distanceM,
          nextDistM,
          DIST_330FT_M,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time330ftMs = hit.timeMs;
      }

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

      if (cur.time1000ftMs === null && nextDistM >= DIST_1000FT_M) {
        const hit = interpolateCrossing(
          prev.distanceM,
          nextDistM,
          DIST_1000FT_M,
          prev.timeMs,
          elapsedMs,
          prev.speedKmh,
          nextSpeedKmh
        );
        cur.time1000ftMs = hit.timeMs;
      }

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
      splitsRef.current = {
        ...INITIAL_SPLITS,
        isJumpStart: jumpStartRef.current,
      };
      setSplits(splitsRef.current);
      prevSampleRef.current = null;
      greenLightTimeRef.current = withReactionLight ? Date.now() : 0;

      // Reset run peaks for Gyro Oz
      gyroRef.current = {
        ...gyroRef.current,
        peakG: 0,
        maxPitchDeg: 0,
        maxOzDriftDeg: 0,
      };
      setGyro(gyroRef.current);

      if (src === 'gps') {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setGpsError('Browser/perangkat ini tidak mendukung GPS Geolocation.');
          phaseRef.current = 'idle';
          setPhase('idle');
          return;
        }

        phaseRef.current = 'armed';
        setPhase('armed');
        setGpsStatus('HIJAU (GO!) · Silakan gas dari posisi diam (0 m)');

        let cumulativeDist = 0;
        let lastCoord: { lat: number; lon: number; time: number } | null = null;

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
              const jitterFloor = acc && acc > 15 ? 1.5 : 0.7;

              if (phaseRef.current === 'running') {
                if (stepM >= jitterFloor) {
                  cumulativeDist += stepM;
                }
                if (speed === null || !Number.isFinite(speed)) {
                  speedKmh = (stepM / dtSec) * 3.6;
                }
              } else if (phaseRef.current === 'armed') {
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
              setGpsStatus(`GPS Terkunci (±${acc ?? '-'} m) · HIJAU GO!`);
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
        // Realistic 20Hz Drag Motorcycle Physics Simulator + Simulated Gyro Oz
        phaseRef.current = 'running';
        setPhase('running');
        startTimeRef.current = Date.now();
        const reactionMs = withReactionLight ? Math.round(130 + Math.random() * 170) : null;
        splitsRef.current = {
          ...INITIAL_SPLITS,
          accuracyM: 2.5,
          isJumpStart: false,
          reactionTimeMs: reactionMs,
        };
        setGpsStatus('Simulasi Drag GPS & Gyro Oz 20 Hz berjalan...');

        let simDistM = 0;
        let simSpeedMs = 0;
        const dt = 0.05;
        const peakAccel = 7.5 + (Math.random() - 0.5) * 0.4;

        simTimerRef.current = window.setInterval(() => {
          const now = Date.now();
          const elapsedSec = (now - startTimeRef.current) / 1000;
          const dragDecay = Math.max(1.8, peakAccel - simSpeedMs * 0.13);
          const nextSpeedMs = Math.min(44.5, simSpeedMs + dragDecay * dt);
          const actualAccel = (nextSpeedMs - simSpeedMs) / dt;
          simSpeedMs = nextSpeedMs;
          simDistM += simSpeedMs * dt;
          const speedKmh = simSpeedMs * 3.6;

          if (connectionMode === 'disconnected') {
            latestRpmRef.current = Math.min(12600, 4800 + ((simSpeedMs * 240) % 7600));
          }

          // Update synthetic Gyro Oz readings during simulation
          const simG = Number(Math.max(0.05, actualAccel / 9.81).toFixed(2));
          const simPitch = Number((simG * 8.2 + Math.sin(elapsedSec * 5) * 0.6).toFixed(1));
          const simRoll = Number((Math.sin(elapsedSec * 2.4) * 1.4).toFixed(1));
          const simOz = Number((Math.sin(elapsedSec * 1.7) * 1.1).toFixed(1));
          const simGyro: GyroTelemetry = {
            ozDeg: simOz,
            pitchDeg: simPitch,
            rollDeg: simRoll,
            launchG: simG,
            peakG: Number(Math.max(gyroRef.current.peakG, simG).toFixed(2)),
            maxPitchDeg: Number(Math.max(gyroRef.current.maxPitchDeg, Math.abs(simPitch)).toFixed(1)),
            maxOzDriftDeg: Number(Math.max(gyroRef.current.maxOzDriftDeg, Math.abs(simOz)).toFixed(1)),
            hasLiveSensor: true,
          };
          gyroRef.current = simGyro;
          setGyro(simGyro);

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
    jumpStartRef.current = false;

    if (launchMode === 'tree') {
      stopAllTimers();
      phaseRef.current = 'countdown';
      setPhase('countdown');
      setLitRedLights(1);
      setTreeStatusLight('red');
      setSplits(INITIAL_SPLITS);

      if (sourceMode === 'gps' && typeof navigator !== 'undefined' && navigator.geolocation) {
        let stageCoord: { lat: number; lon: number } | null = null;
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (phaseRef.current !== 'countdown') return;
            const { latitude, longitude, speed } = pos.coords;
            if (!stageCoord) {
              stageCoord = { lat: latitude, lon: longitude };
              return;
            }
            const moved = haversineMeters(stageCoord.lat, stageCoord.lon, latitude, longitude);
            const kmh = speed && Number.isFinite(speed) ? speed * 3.6 : 0;
            if (kmh >= 3.2 || moved >= 3.0) {
              jumpStartRef.current = true;
              setTreeStatusLight('foul');
            }
          },
          () => {
            // ignore pre-stage GPS errors here
          },
          { enableHighAccuracy: true, maximumAge: 0 }
        );
      }

      let count = 1;
      countdownTimerRef.current = window.setInterval(() => {
        count += 1;
        if (count <= 5) {
          setLitRedLights(count);
        }
        if (count >= 5) {
          if (countdownTimerRef.current !== null) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          const holdDelay = 650 + Math.round(Math.random() * 250);
          greenDelayTimerRef.current = window.setTimeout(() => {
            setLitRedLights(0);
            setTreeStatusLight(jumpStartRef.current ? 'foul' : 'green');
            beginTrackingSession(sourceMode, targetDistance, true);
          }, holdDelay);
        }
      }, 700);
    } else {
      setLitRedLights(0);
      setTreeStatusLight('green');
      beginTrackingSession(sourceMode, targetDistance, false);
    }
  };

  const handleStopOrReset = () => {
    stopAllTimers();
    phaseRef.current = 'idle';
    jumpStartRef.current = false;
    setPhase('idle');
    setLitRedLights(0);
    setTreeStatusLight('off');
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
    const valid = runs.filter((r) => r.time201mMs !== null && !r.isJumpStart);
    if (valid.length === 0) return null;
    return valid.reduce((best, r) =>
      (r.time201mMs ?? Infinity) < (best.time201mMs ?? Infinity) ? r : best
    );
  }, [runs]);

  const best402 = useMemo(() => {
    const valid = runs.filter((r) => r.time402mMs !== null && !r.isJumpStart);
    if (valid.length === 0) return null;
    return valid.reduce((best, r) =>
      (r.time402mMs ?? Infinity) < (best.time402mMs ?? Infinity) ? r : best
    );
  }, [runs]);

  const progressPct = Math.min(100, (splits.distanceM / targetDistance) * 100);

  // Map Roll/Pitch onto the circular Gyro Oz crosshair (radius 40 inside 120x120 viewBox)
  const dotX = 60 + Math.max(-36, Math.min(36, gyro.rollDeg * 1.2));
  const dotY = 60 - Math.max(-36, Math.min(36, gyro.pitchDeg * 1.6));

  return (
    <div className="space-y-4">
      {/* Control & Target Distance Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Flag className="w-5 h-5 text-[#FF6B1A]" />
              <span>Mode Drag Timer GPS &amp; Gyro Oz (201 m &amp; 402 m)</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Lampu start 5 titik Merah &amp; Hijau, jarak 30 ft – 402 m, dan sensor Gyro Oz (Yaw, Pitch, Roll, Launch G).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

        {/* Launch Mode + Start/Stop */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Pemicu Start:</span>
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
              Lampu Start (5 Lampu Merah → Hijau)
            </button>
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

      {/* 5-Light Drag Christmas Tree + Red/Green Status Gantry */}
      {(launchMode === 'tree' || phase === 'countdown' || treeStatusLight !== 'off') && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {[1, 2, 3, 4, 5].map((idx) => {
              const isLit = phase === 'countdown' && idx <= litRedLights;
              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center font-mono text-xs font-bold transition-all duration-150 ${
                      isLit
                        ? 'bg-red-500 border-red-300 text-white shadow-[0_0_20px_rgba(239,68,68,0.75)] scale-105'
                        : 'bg-slate-100 dark:bg-[#0B0E14] border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {idx}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                  treeStatusLight === 'red' || treeStatusLight === 'foul'
                    ? 'bg-red-600 border-red-300 text-white shadow-[0_0_20px_rgba(220,38,38,0.8)]'
                    : 'bg-slate-100 dark:bg-[#0B0E14] border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600'
                }`}
              >
                {treeStatusLight === 'foul' ? 'FOUL' : 'RED'}
              </div>
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                  treeStatusLight === 'green'
                    ? 'bg-emerald-500 border-emerald-200 text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.85)] scale-105'
                    : 'bg-slate-100 dark:bg-[#0B0E14] border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600'
                }`}
              >
                GO!
              </div>
            </div>

            <div className="text-xs font-semibold text-right min-w-[120px]">
              {treeStatusLight === 'red' ? (
                <span className="text-red-500">TAHAN / STAGE ({litRedLights}/5)</span>
              ) : treeStatusLight === 'foul' ? (
                <span className="text-red-500">MERAH FOUL (CURI START)</span>
              ) : treeStatusLight === 'green' ? (
                <span className="text-emerald-500">LAMPU HIJAU — GAS!</span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">Lampu Siap</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary Live Chronometer, Gyro Oz & Distance Cockpit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
              <span className="font-medium truncate">
                {phase === 'countdown'
                  ? `HITUNG MUNDUR LAMPU MERAH (${litRedLights}/5)`
                  : phase === 'armed'
                  ? 'HIJAU (GO!) · Menunggu Gerakan'
                  : phase === 'running'
                  ? `SEDANG BERLARI · Target ${targetDistance} m`
                  : phase === 'finished'
                  ? `FINISH ${targetDistance} m${splits.isJumpStart ? ' (FOUL)' : ''}`
                  : gpsStatus}
              </span>
              <span className="font-mono tabular-nums shrink-0">
                {sourceMode === 'gps'
                  ? `GPS ${splits.accuracyM !== null ? `±${splits.accuracyM} m` : 'Siap'}`
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

            {/* Track Progress Bar with Sequential Markers */}
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
                <span>0 m</span>
                <span>30 ft</span>
                <span>60 ft</span>
                <span>330 ft</span>
                {targetDistance === 402 ? (
                  <>
                    <span className="text-emerald-600 dark:text-emerald-400">201 m</span>
                    <span>1000 ft</span>
                    <span>402 m</span>
                  </>
                ) : (
                  <span className="text-[#FF6B1A] font-semibold">201 m</span>
                )}
              </div>
            </div>
          </div>

          {/* Gyro Oz Attitude, Pitch, Roll & Launch G Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#FF6B1A]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sensor Gyro Oz (Yaw / Pitch / Roll / Launch G)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {gyroNeedsPermission && (
                  <button
                    type="button"
                    onClick={handleRequestGyroPermission}
                    className="min-h-[34px] px-3 rounded-lg bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 text-xs font-semibold"
                  >
                    Aktifkan Gyro Oz
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCalibrateGyro}
                  className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#FF6B1A]" />
                  <span>Kalibrasi 0°</span>
                </button>
              </div>
            </div>

            {gyroPermissionMsg && (
              <div className="text-xs text-amber-600 dark:text-amber-300">{gyroPermissionMsg}</div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Circular Gyro Oz & G-Force Crosshair */}
              <div className="shrink-0">
                <svg
                  viewBox="0 0 120 120"
                  className="w-28 h-28"
                  aria-label="Indikator Gyro Oz"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="fill-slate-50 dark:fill-[#0B0E14] stroke-slate-200 dark:stroke-slate-700"
                    strokeWidth="2"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="30"
                    fill="none"
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1="12"
                    y1="60"
                    x2="108"
                    y2="60"
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth="1"
                  />
                  <line
                    x1="60"
                    y1="12"
                    x2="60"
                    y2="108"
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth="1"
                  />
                  {/* Oz Yaw Direction Needle */}
                  <g transform={`rotate(${gyro.ozDeg} 60 60)`}>
                    <polygon points="60,8 56,16 64,16" fill="#10B981" />
                  </g>
                  {/* Pitch/Roll Attitude Dot */}
                  <circle cx={dotX} cy={dotY} r="6.5" fill="#FF6B1A" />
                </svg>
              </div>

              <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Oz (Yaw)</div>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {gyro.ozDeg > 0 ? `+${gyro.ozDeg.toFixed(1)}` : gyro.ozDeg.toFixed(1)}°
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Pitch (Angkat)</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {gyro.pitchDeg > 0 ? `+${gyro.pitchDeg.toFixed(1)}` : gyro.pitchDeg.toFixed(1)}°
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Roll (Miring)</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {gyro.rollDeg > 0 ? `+${gyro.rollDeg.toFixed(1)}` : gyro.rollDeg.toFixed(1)}°
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Launch G</div>
                  <div className="text-base font-bold text-[#FF6B1A] mt-0.5">
                    {gyro.launchG.toFixed(2)} G
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Peak G</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {gyro.peakG.toFixed(2)} G
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Max Pitch</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {gyro.maxPitchDeg.toFixed(1)}°
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Split Timeslip Card (30ft, 60ft, 330ft, 201m, 1000ft, 402m) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Data Jarak &amp; Waktu (Timeslip)
            </h3>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Peak {Math.round(splits.peakRpm).toLocaleString('id-ID')} RPM
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Reaction Time (RT)</span>
              <span
                className={`font-semibold ${
                  splits.isJumpStart ? 'text-red-500' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {splits.isJumpStart ? 'FOUL · ' : ''}
                {formatDragSeconds(splits.reactionTimeMs)}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">30 ft (9.1 m)</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time30ftMs)}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">60 ft (18.3 m)</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time60ftMs)}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">330 ft (100.6 m)</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time330ftMs)}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-[#FF6B1A] font-semibold">201 m (660 ft)</span>
              <span className="font-bold text-[#FF6B1A]">
                {formatDragSeconds(splits.time201mMs)}
                {splits.trap201Kmh !== null ? ` · ${splits.trap201Kmh.toFixed(1)} km/h` : ''}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">1000 ft (304.8 m)</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time1000ftMs)}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">402 m (1320 ft)</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatDragSeconds(splits.time402mMs)}
                {splits.trap402Kmh !== null ? ` · ${splits.trap402Kmh.toFixed(1)} km/h` : ''}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">0–60 / 0–100 km/h</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDragSeconds(splits.time0to60Ms)} / {formatDragSeconds(splits.time0to100Ms)}
              </span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Peak G / Max Pitch</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {gyro.peakG.toFixed(2)} G · {gyro.maxPitchDeg.toFixed(1)}°
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
                ? `30ft ${formatDragSeconds(best201.time30ftMs)} · 60ft ${formatDragSeconds(best201.time60ftMs)} · Trap ${best201.trap201Kmh?.toFixed(1) ?? '-'} km/h`
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
                ? `330ft ${formatDragSeconds(best402.time330ftMs)} · 1000ft ${formatDragSeconds(best402.time1000ftMs)} · Trap ${best402.trap402Kmh?.toFixed(1) ?? '-'} km/h`
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
              Data jarak 30 ft – 402 m beserta puncak G-Force &amp; sudut Gyro Oz tersimpan otomatis.
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
            Belum ada catatan drag. Pilih target 201 m atau 402 m lalu tekan tombol Mulai Drag untuk melihat hitung mundur 5 lampu merah → hijau.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 px-2 font-medium">Mode</th>
                  <th className="py-2 px-2 font-medium">30 ft</th>
                  <th className="py-2 px-2 font-medium">60 ft</th>
                  <th className="py-2 px-2 font-medium">330 ft</th>
                  <th className="py-2 px-2 font-medium text-[#FF6B1A]">201 m</th>
                  <th className="py-2 px-2 font-medium">1000 ft</th>
                  <th className="py-2 px-2 font-medium text-emerald-600 dark:text-emerald-400">402 m</th>
                  <th className="py-2 px-2 font-medium">Peak G</th>
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
                      {r.isJumpStart && <span className="text-red-500 font-bold mr-1">FOUL</span>}
                      {r.source === 'gps' ? 'GPS' : 'Sim'} · {r.targetDistance}m
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDragSeconds(r.time30ftMs)}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDragSeconds(r.time60ftMs)}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDragSeconds(r.time330ftMs)}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap font-semibold text-[#FF6B1A]">
                      {formatDragSeconds(r.time201mMs)}
                      {r.trap201Kmh !== null ? ` (${r.trap201Kmh.toFixed(0)})` : ''}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">{formatDragSeconds(r.time1000ftMs)}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatDragSeconds(r.time402mMs)}
                      {r.trap402Kmh !== null ? ` (${r.trap402Kmh.toFixed(0)})` : ''}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {r.peakLaunchG !== undefined && r.peakLaunchG !== null
                        ? `${r.peakLaunchG.toFixed(2)} G`
                        : `${r.peakSpeedKmh.toFixed(0)} km/h`}
                    </td>
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
