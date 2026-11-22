import React from 'react';
import {
  AlertThresholds,
  SENSOR_CATALOG,
  TelemetryFrame,
  WidgetConfig,
  WidgetStyle,
} from '../types/telemetry';
import { evaluateSensorStatus } from '../utils/presets';
import { RadialGauge } from './RadialGauge';
import { ArrowDown, ArrowUp, Maximize2, Minimize2, Trash2 } from 'lucide-react';

interface WidgetCardProps {
  widget: WidgetConfig;
  frame: TelemetryFrame;
  history: TelemetryFrame[];
  peakValue: number;
  thresholds: AlertThresholds;
  editMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onChangeStyle: (id: string, style: WidgetStyle) => void;
  onToggleSize: (id: string) => void;
  onRemove: (id: string) => void;
}

const STYLE_LABELS: { value: WidgetStyle; label: string }[] = [
  { value: 'gauge', label: 'Gauge' },
  { value: 'numeric', label: 'Angka' },
  { value: 'bar', label: 'Bar' },
  { value: 'sparkline', label: 'Tren' },
];

export const WidgetCard: React.FC<WidgetCardProps> = ({
  widget,
  frame,
  history,
  peakValue,
  thresholds,
  editMode,
  isFirst,
  isLast,
  onMove,
  onChangeStyle,
  onToggleSize,
  onRemove,
}) => {
  const meta = SENSOR_CATALOG[widget.sensor];
  const rawVal = frame[widget.sensor];
  const formatted = rawVal.toFixed(meta.decimals);
  const formattedPeak = peakValue.toFixed(meta.decimals);
  const status = evaluateSensorStatus(widget.sensor, rawVal, frame, thresholds);

  const pct = Math.max(
    0,
    Math.min(100, ((rawVal - meta.min) / Math.max(0.001, meta.max - meta.min)) * 100)
  );

  const surfaceClass =
    status.level === 'critical'
      ? 'border-red-500/60 bg-red-50 dark:bg-red-950/20'
      : status.level === 'warning'
      ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/15'
      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721]';

  const statusTextColor =
    status.level === 'critical'
      ? 'text-red-600 dark:text-red-400'
      : status.level === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-slate-500 dark:text-slate-400';

  const sparkSlice = history.slice(-45);
  const renderSparkline = () => {
    const w = 260;
    const h = 68;
    if (sparkSlice.length < 2) {
      return (
        <div className="h-[68px] flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
          Menunggu aliran data...
        </div>
      );
    }
    const pts = sparkSlice
      .map((f, idx) => {
        const x = (idx / Math.max(1, sparkSlice.length - 1)) * w;
        const norm = Math.max(
          0,
          Math.min(1, (f[widget.sensor] - meta.min) / Math.max(0.001, meta.max - meta.min))
        );
        const y = h - 6 - norm * (h - 14);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const areaPts = `0,${h} ${pts} ${w},${h}`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[68px] overflow-visible">
        <polygon points={areaPts} fill={meta.color} fillOpacity={0.14} />
        <polyline
          points={pts}
          fill="none"
          stroke={status.level === 'critical' ? '#EF4444' : meta.color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div
      className={`rounded-2xl border p-3.5 sm:p-4 transition-colors duration-150 flex flex-col justify-between ${surfaceClass} ${
        widget.size === 'wide' ? 'col-span-2' : 'col-span-1'
      }`}
    >
      {/* Header metadata line (unboxed text + middle-dot separator) */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {meta.shortLabel}
          </h3>
          <div className={`flex items-center gap-1.5 text-xs ${statusTextColor} truncate`}>
            <span>{status.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Puncak {formattedPeak} {meta.unit}
            </span>
          </div>
        </div>

        {editMode && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onMove(widget.id, -1)}
              disabled={isFirst}
              title="Geser Naik"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(widget.id, 1)}
              disabled={isLast}
              title="Geser Turun"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleSize(widget.id)}
              title={widget.size === 'wide' ? 'Kecilkan (1 Kolom)' : 'Lebarkan (2 Kolom)'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {widget.size === 'wide' ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onRemove(widget.id)}
              title="Hapus Widget"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Sensor Visualization */}
      <div className="my-1">
        {widget.style === 'gauge' && (
          <div className="flex justify-center py-1">
            <RadialGauge
              value={rawVal}
              min={meta.min}
              max={meta.max}
              peakValue={peakValue}
              warningThreshold={
                widget.sensor === 'rpm'
                  ? thresholds.shiftRpm
                  : widget.sensor === 'ect'
                  ? thresholds.ectHighWarning - 8
                  : undefined
              }
              criticalThreshold={
                widget.sensor === 'rpm'
                  ? thresholds.limiterRpm
                  : widget.sensor === 'ect'
                  ? thresholds.ectHighWarning
                  : undefined
              }
              label={meta.shortLabel}
              unit={meta.unit}
              decimals={meta.decimals}
              accentColor={meta.color}
              compact={widget.size === 'half'}
            />
          </div>
        )}

        {widget.style === 'numeric' && (
          <div className="py-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono font-bold tabular-nums tracking-tight text-3xl sm:text-4xl ${
                  status.level === 'critical'
                    ? 'text-red-600 dark:text-red-400'
                    : status.level === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {formatted}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {meta.unit}
              </span>
            </div>
            {widget.sensor === 'afr' && (
              <div className="text-right text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Target 12.6–13.4
              </div>
            )}
          </div>
        )}

        {widget.style === 'bar' && (
          <div className="py-2 space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-bold tabular-nums text-2xl sm:text-3xl text-slate-900 dark:text-slate-100">
                {formatted}{' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  {meta.unit}
                </span>
              </span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${pct}%`,
                  backgroundColor:
                    status.level === 'critical'
                      ? '#EF4444'
                      : status.level === 'warning'
                      ? '#F59E0B'
                      : meta.color,
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{meta.min}</span>
              <span>{Math.round((meta.min + meta.max) / 2)}</span>
              <span>{meta.max}</span>
            </div>
          </div>
        )}

        {widget.style === 'sparkline' && (
          <div className="space-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-bold tabular-nums text-2xl sm:text-3xl text-slate-900 dark:text-slate-100">
                {formatted}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{meta.unit}</span>
            </div>
            {renderSparkline()}
          </div>
        )}
      </div>

      {/* Edit Mode Style Selector */}
      {editMode && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1 overflow-x-auto">
          {STYLE_LABELS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChangeStyle(widget.id, opt.value)}
              className={`flex-1 min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                widget.style === opt.value
                  ? 'bg-[#FF6B1A] text-slate-950 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
