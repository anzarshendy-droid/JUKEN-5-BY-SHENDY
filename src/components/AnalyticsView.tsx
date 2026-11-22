import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertThresholds,
  LogSession,
  SENSOR_CATALOG,
  SensorKey,
  TelemetryFrame,
} from '../types/telemetry';
import {
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface AnalyticsViewProps {
  sessions: LogSession[];
  selectedSessionId: string;
  liveBuffer: TelemetryFrame[];
  thresholds: AlertThresholds;
  onSelectSession: (id: string) => void;
}

const TRACE_CHANNELS: SensorKey[] = [
  'rpm',
  'afr',
  'tps',
  'ignTiming',
  'ect',
  'map',
  'injWidth',
  'battery',
  'speed',
];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  sessions,
  selectedSessionId,
  liveBuffer,
  thresholds,
  onSelectSession,
}) => {
  const [activeChannels, setActiveChannels] = useState<SensorKey[]>(['rpm', 'afr', 'tps']);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [zoomSpanRatio, setZoomSpanRatio] = useState<number>(1);
  const [panStartRatio, setPanStartRatio] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedScatterPoint, setSelectedScatterPoint] = useState<TelemetryFrame | null>(
    null
  );

  const svgRef = useRef<SVGSVGElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null,
    [sessions, selectedSessionId]
  );

  const allFrames: TelemetryFrame[] = useMemo(() => {
    if (selectedSessionId === '__live__') {
      return liveBuffer;
    }
    return activeSession?.frames || [];
  }, [selectedSessionId, liveBuffer, activeSession]);

  const { visibleFrames, startIdx } = useMemo(() => {
    if (allFrames.length === 0) return { visibleFrames: [], startIdx: 0 };
    const total = allFrames.length;
    const count = Math.max(8, Math.round(total * zoomSpanRatio));
    const maxStart = Math.max(0, total - count);
    const sIdx = Math.min(maxStart, Math.round(panStartRatio * total));
    return {
      visibleFrames: allFrames.slice(sIdx, sIdx + count),
      startIdx: sIdx,
    };
  }, [allFrames, zoomSpanRatio, panStartRatio]);

  useEffect(() => {
    if (!isPlaying || visibleFrames.length < 2) return;
    const timer = window.setInterval(() => {
      setHoverIdx((prev) => {
        if (prev === null || prev >= visibleFrames.length - 1) {
          return 0;
        }
        return prev + 1;
      });
    }, 90);
    return () => clearInterval(timer);
  }, [isPlaying, visibleFrames.length]);

  const toggleChannel = (key: SensorKey) => {
    setActiveChannels((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      return [...prev, key];
    });
  };

  const handleZoom = (factor: number) => {
    setZoomSpanRatio((prev) => {
      const next = Math.max(0.12, Math.min(1, Number((prev * factor).toFixed(2))));
      setPanStartRatio((p) => Math.min(p, Math.max(0, 1 - next)));
      return next;
    });
    setHoverIdx(null);
  };

  const handlePointerScrub = (clientX: number) => {
    if (!svgRef.current || visibleFrames.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const padLeft = 42;
    const padRight = 18;
    const chartW = rect.width - padLeft - padRight;
    const relX = Math.max(0, Math.min(chartW, clientX - rect.left - padLeft));
    const idx = Math.round((relX / Math.max(1, chartW)) * (visibleFrames.length - 1));
    setHoverIdx(idx);
  };

  const stats = useMemo(() => {
    if (allFrames.length === 0) return null;
    let maxRpm = 0;
    let maxTps = 0;
    let maxEct = 0;
    let minBat = 99;
    let minAfr = 99;
    let maxAfr = 0;
    let sumAfr = 0;
    let leanWotCount = 0;
    let leanWotRpmMin = 99999;
    let leanWotRpmMax = 0;

    for (const f of allFrames) {
      if (f.rpm > maxRpm) maxRpm = f.rpm;
      if (f.tps > maxTps) maxTps = f.tps;
      if (f.ect > maxEct) maxEct = f.ect;
      if (f.battery < minBat) minBat = f.battery;
      if (f.afr < minAfr) minAfr = f.afr;
      if (f.afr > maxAfr) maxAfr = f.afr;
      sumAfr += f.afr;

      if (f.tps >= 70 && f.afr >= 13.5) {
        leanWotCount++;
        if (f.rpm < leanWotRpmMin) leanWotRpmMin = f.rpm;
        if (f.rpm > leanWotRpmMax) leanWotRpmMax = f.rpm;
      }
    }

    const avgAfr = sumAfr / allFrames.length;
    const insights: { level: 'warning' | 'ok'; text: string }[] = [];

    if (leanWotCount > 0) {
      insights.push({
        level: 'warning',
        text: `Terdeteksi ${leanWotCount} titik campuran agak kering (AFR >= 13.5) pada bukaan gas >70% di rentang ${leanWotRpmMin.toLocaleString('id-ID')}–${leanWotRpmMax.toLocaleString('id-ID')} RPM. Pertimbangkan tambah fuel map +3% hingga +6%.`,
      });
    } else {
      insights.push({
        level: 'ok',
        text: 'Rasio AFR pada beban tinggi (TPS >70%) terpantau aman di zona tenaga optimal.',
      });
    }

    if (maxEct >= thresholds.ectHighWarning) {
      insights.push({
        level: 'warning',
        text: `Suhu mesin mencapai ${maxEct}°C (melewati batas ${thresholds.ectHighWarning}°C). Periksa sistem pendingin atau kayakan campuran di RPM atas.`,
      });
    }

    if (minBat <= thresholds.batteryLowWarning) {
      insights.push({
        level: 'warning',
        text: `Tegangan aki sempat turun ke ${minBat.toFixed(1)}V. Periksa kiprok/pengisian agar kinerja koil & injektor tetap stabil.`,
      });
    }

    return {
      maxRpm,
      maxTps,
      maxEct,
      minBat,
      minAfr,
      maxAfr,
      avgAfr,
      insights,
    };
  }, [allFrames, thresholds]);

  const inspectedFrame =
    hoverIdx !== null && visibleFrames[hoverIdx]
      ? visibleFrames[hoverIdx]
      : visibleFrames[visibleFrames.length - 1] || null;

  const W = 860;
  const H = 310;
  const padL = 42;
  const padR = 18;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const formatTimeSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const SW = 860;
  const SH = 260;
  const sPadL = 48;
  const sPadR = 20;
  const sPadT = 18;
  const sPadB = 32;
  const sInnerW = SW - sPadL - sPadR;
  const sInnerH = SH - sPadT - sPadB;

  const scatterFrames = useMemo(() => {
    if (allFrames.length <= 240) return allFrames;
    const step = Math.ceil(allFrames.length / 240);
    return allFrames.filter((_, i) => i % step === 0);
  }, [allFrames]);

  return (
    <div className="space-y-4">
      {/* Top Session Selector Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Analisis Grafik Performa Mesin
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Geser jari atau kursor di atas grafik untuk inspeksi nilai sensor per milidetik.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="session-select" className="sr-only">
            Pilih Sesi Log
          </label>
          <select
            id="session-select"
            value={selectedSessionId}
            onChange={(e) => {
              onSelectSession(e.target.value);
              setHoverIdx(null);
              setZoomSpanRatio(1);
              setPanStartRatio(0);
              setIsPlaying(false);
            }}
            className="min-h-[44px] max-w-xs px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
          >
            {liveBuffer.length > 0 && (
              <option value="__live__">
                Buffer Live Saat Ini ({liveBuffer.length} sampel)
              </option>
            )}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.frames.length} sampel)
              </option>
            ))}
          </select>
        </div>
      </div>

      {allFrames.length < 2 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Belum ada cukup data sampel untuk ditampilkan di grafik.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hubungkan ECU atau aktifkan Mode Simulasi lalu tekan &ldquo;Rekam Log&rdquo; di halaman Dasbor, atau pilih sesi contoh di menu atas.
          </p>
        </div>
      ) : (
        <>
          {/* Peak KPI Strip */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">Puncak RPM</div>
                <div className="mt-1 font-mono font-bold text-xl sm:text-2xl text-[#FF6B1A] tabular-nums">
                  {stats.maxRpm.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Rata-rata / Rentang AFR
                </div>
                <div className="mt-1 font-mono font-bold text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {stats.avgAfr.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    ({stats.minAfr.toFixed(1)}–{stats.maxAfr.toFixed(1)})
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Bukaan Gas Maks (TPS)
                </div>
                <div className="mt-1 font-mono font-bold text-xl sm:text-2xl text-sky-600 dark:text-sky-400 tabular-nums">
                  {stats.maxTps.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Suhu Maks / Aki Min
                </div>
                <div className="mt-1 font-mono font-bold text-xl sm:text-2xl text-slate-900 dark:text-slate-100 tabular-nums">
                  {stats.maxEct}°C{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    · {stats.minBat.toFixed(1)}V
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Main Interactive Multi-Channel Time-Series Chart */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {TRACE_CHANNELS.map((key) => {
                  const meta = SENSOR_CATALOG[key];
                  const active = activeChannels.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleChannel(key)}
                      className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100'
                          : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: active ? meta.color : '#64748B' }}
                      />
                      <span>{meta.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Jeda' : 'Putar Ulang'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(0.65)}
                  title="Perbesar Grafik (Zoom In)"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(1.5)}
                  title="Perkecil Grafik (Zoom Out)"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                {zoomSpanRatio < 0.99 && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoomSpanRatio(1);
                      setPanStartRatio(0);
                    }}
                    title="Reset Zoom"
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {inspectedFrame && (
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  Waktu {formatTimeSec(inspectedFrame.elapsedMs)}
                </span>
                {activeChannels.map((ch) => {
                  const m = SENSOR_CATALOG[ch];
                  return (
                    <span key={ch} className="font-mono tabular-nums flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: m.color }}
                      />
                      <span className="text-slate-500 dark:text-slate-400">{m.shortLabel}:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {inspectedFrame[ch].toFixed(m.decimals)} {m.unit}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="w-full overflow-hidden touch-none">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto max-h-[340px] select-none cursor-crosshair"
                onMouseMove={(e) => handlePointerScrub(e.clientX)}
                onTouchMove={(e) => {
                  if (e.touches[0]) handlePointerScrub(e.touches[0].clientX);
                }}
                onTouchStart={(e) => {
                  if (e.touches[0]) handlePointerScrub(e.touches[0].clientX);
                }}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((g) => {
                  const y = padT + (1 - g) * innerH;
                  return (
                    <g key={g}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={W - padR}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 font-mono"
                        style={{ fontSize: '10px' }}
                      >
                        {Math.round(g * 100)}%
                      </text>
                    </g>
                  );
                })}

                {activeChannels.map((ch) => {
                  const meta = SENSOR_CATALOG[ch];
                  const pts = visibleFrames
                    .map((f, idx) => {
                      const x =
                        padL +
                        (idx / Math.max(1, visibleFrames.length - 1)) * innerW;
                      const norm = Math.max(
                        0,
                        Math.min(
                          1,
                          (f[ch] - meta.min) / Math.max(0.001, meta.max - meta.min)
                        )
                      );
                      const y = padT + (1 - norm) * innerH;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');

                  return (
                    <polyline
                      key={ch}
                      points={pts}
                      fill="none"
                      stroke={meta.color}
                      strokeWidth={ch === 'rpm' ? 2.4 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.95}
                    />
                  );
                })}

                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const idx = Math.min(
                    visibleFrames.length - 1,
                    Math.round(t * (visibleFrames.length - 1))
                  );
                  const x = padL + t * innerW;
                  const f = visibleFrames[idx];
                  return (
                    <text
                      key={t}
                      x={x}
                      y={H - 8}
                      textAnchor="middle"
                      className="fill-slate-400 dark:fill-slate-500 font-mono"
                      style={{ fontSize: '10px' }}
                    >
                      {f ? formatTimeSec(f.elapsedMs) : ''}
                    </text>
                  );
                })}

                {hoverIdx !== null &&
                  visibleFrames[hoverIdx] &&
                  (() => {
                    const cx =
                      padL +
                      (hoverIdx / Math.max(1, visibleFrames.length - 1)) * innerW;
                    const f = visibleFrames[hoverIdx];
                    return (
                      <g>
                        <line
                          x1={cx}
                          y1={padT}
                          x2={cx}
                          y2={padT + innerH}
                          className="stroke-slate-700/60 dark:stroke-slate-200/60"
                          strokeWidth={1.25}
                        />
                        {activeChannels.map((ch) => {
                          const meta = SENSOR_CATALOG[ch];
                          const norm = Math.max(
                            0,
                            Math.min(
                              1,
                              (f[ch] - meta.min) / Math.max(0.001, meta.max - meta.min)
                            )
                          );
                          const cy = padT + (1 - norm) * innerH;
                          return (
                            <circle
                              key={ch}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={meta.color}
                              className="stroke-white dark:stroke-[#090C10]"
                              strokeWidth={1.5}
                            />
                          );
                        })}
                      </g>
                    );
                  })()}
              </svg>
            </div>

            {zoomSpanRatio < 0.99 && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Geser Rentang
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.01, Number((1 - zoomSpanRatio).toFixed(2)))}
                  step={0.01}
                  value={panStartRatio}
                  onChange={(e) => {
                    setPanStartRatio(parseFloat(e.target.value));
                    setHoverIdx(null);
                  }}
                  className="flex-1 accent-[#FF6B1A] h-2 cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                  Sampel {startIdx + 1}–{startIdx + visibleFrames.length}
                </span>
              </div>
            )}
          </div>

          {/* RPM vs AFR Tuning Scatter Plot + Engine Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Peta Korelasi RPM vs AFR (Tuning Fuel Map)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Zona hijau menandakan target tenaga optimal (12.2–13.4). Ketuk titik untuk detail.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B1A]" />
                    Gas &gt;70%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                    Gas 25–70%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                    Gas &lt;25%
                  </span>
                </div>
              </div>

              <svg viewBox={`0 0 ${SW} ${SH}`} className="w-full h-auto max-h-[260px]">
                {(() => {
                  const afrMin = 10;
                  const afrMax = 18;
                  const yTop = sPadT + ((afrMax - 13.4) / (afrMax - afrMin)) * sInnerH;
                  const yBot = sPadT + ((afrMax - 12.2) / (afrMax - afrMin)) * sInnerH;
                  const yStoich = sPadT + ((afrMax - 14.7) / (afrMax - afrMin)) * sInnerH;
                  return (
                    <>
                      <rect
                        x={sPadL}
                        y={yTop}
                        width={sInnerW}
                        height={Math.max(2, yBot - yTop)}
                        fill="rgba(16,185,129,0.12)"
                      />
                      <line
                        x1={sPadL}
                        y1={yStoich}
                        x2={SW - sPadR}
                        y2={yStoich}
                        stroke="rgba(245,158,11,0.55)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={SW - sPadR - 4}
                        y={yStoich - 4}
                        textAnchor="end"
                        className="fill-amber-600 dark:fill-amber-400 font-mono"
                        style={{ fontSize: '10px' }}
                      >
                        Stoich 14.7
                      </text>
                    </>
                  );
                })()}

                {[10, 12, 14, 16, 18].map((afrTick) => {
                  const y = sPadT + ((18 - afrTick) / 8) * sInnerH;
                  return (
                    <g key={afrTick}>
                      <line
                        x1={sPadL}
                        y1={y}
                        x2={SW - sPadR}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                      />
                      <text
                        x={sPadL - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 font-mono"
                        style={{ fontSize: '10px' }}
                      >
                        {afrTick.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {[2000, 4000, 6000, 8000, 10000, 12000, 14000].map((rpmTick) => {
                  const x = sPadL + (rpmTick / 14000) * sInnerW;
                  return (
                    <g key={rpmTick}>
                      <line
                        x1={x}
                        y1={sPadT}
                        x2={x}
                        y2={sPadT + sInnerH}
                        className="stroke-slate-100 dark:stroke-slate-800/80"
                      />
                      <text
                        x={x}
                        y={SH - 10}
                        textAnchor="middle"
                        className="fill-slate-400 dark:fill-slate-500 font-mono"
                        style={{ fontSize: '10px' }}
                      >
                        {rpmTick / 1000}k
                      </text>
                    </g>
                  );
                })}

                {scatterFrames.map((f, idx) => {
                  const cx = sPadL + Math.max(0, Math.min(1, f.rpm / 14000)) * sInnerW;
                  const cy =
                    sPadT + Math.max(0, Math.min(1, (18 - f.afr) / 8)) * sInnerH;
                  const fill =
                    f.tps >= 70 ? '#FF6B1A' : f.tps >= 25 ? '#0EA5E9' : '#94A3B8';
                  const isSel = selectedScatterPoint?.timestamp === f.timestamp;
                  return (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r={isSel ? 6 : 3.6}
                      fill={fill}
                      fillOpacity={isSel ? 1 : 0.8}
                      className={isSel ? 'stroke-slate-900 dark:stroke-white cursor-pointer' : 'cursor-pointer'}
                      strokeWidth={1.5}
                      onClick={() => setSelectedScatterPoint(f)}
                    />
                  );
                })}
              </svg>

              {selectedScatterPoint && (
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 flex flex-wrap gap-x-4 gap-y-1">
                  <span>RPM: {selectedScatterPoint.rpm}</span>
                  <span>AFR: {selectedScatterPoint.afr.toFixed(1)}</span>
                  <span>TPS: {selectedScatterPoint.tps.toFixed(1)}%</span>
                  <span>Timing: {selectedScatterPoint.ignTiming.toFixed(1)}°</span>
                  <span>Injektor: {selectedScatterPoint.injWidth.toFixed(2)} ms</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ringkasan &amp; Catatan Tuning
              </h3>
              {stats && (
                <div className="space-y-2.5">
                  {stats.insights.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3 text-xs leading-relaxed flex items-start gap-2.5 ${
                        item.level === 'warning'
                          ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                          : 'border-emerald-500/35 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                      }`}
                    >
                      {item.level === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      )}
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeSession?.notes && selectedSessionId !== '__live__' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Catatan Sesi:{' '}
                  </span>
                  {activeSession.notes}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
