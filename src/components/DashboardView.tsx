import React, { useState } from 'react';
import {
  AlertThresholds,
  ConnectionMode,
  DashboardPreset,
  SENSOR_CATALOG,
  SensorKey,
  SimulatorScenario,
  TelemetryFrame,
  WidgetConfig,
  WidgetStyle,
} from '../types/telemetry';
import { WidgetCard } from './WidgetCard';
import { PWAInstallButton } from './PWAInstallButton';
import {
  CircleDot,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Square,
  Check,
  Bluetooth,
  Gauge,
  Smartphone,
} from 'lucide-react';

interface DashboardViewProps {
  frame: TelemetryFrame;
  history: TelemetryFrame[];
  peaks: Record<SensorKey, number>;
  thresholds: AlertThresholds;
  connectionMode: ConnectionMode;
  deviceName: string | null;
  simulatorScenario: SimulatorScenario;
  manualThrottle: number;
  isRecording: boolean;
  recordingSamples: number;
  recordingDurationMs: number;
  presets: DashboardPreset[];
  activePresetId: string;
  widgets: WidgetConfig[];
  isLandscapeMode: boolean;
  onToggleLandscape: () => void;
  onSelectPreset: (presetId: string) => void;
  onSaveAsPreset: (name: string) => void;
  onUpdateWidgets: (widgets: WidgetConfig[]) => void;
  onResetPeaks: () => void;
  onToggleRecording: () => void;
  onChangeScenario: (s: SimulatorScenario) => void;
  onChangeManualThrottle: (val: number) => void;
  onOpenConnect: () => void;
  onStartSimulator: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  frame,
  history,
  peaks,
  thresholds,
  connectionMode,
  deviceName,
  simulatorScenario,
  manualThrottle,
  isRecording,
  recordingSamples,
  recordingDurationMs,
  presets,
  activePresetId,
  widgets,
  isLandscapeMode,
  onToggleLandscape,
  onSelectPreset,
  onSaveAsPreset,
  onUpdateWidgets,
  onResetPeaks,
  onToggleRecording,
  onChangeScenario,
  onChangeManualThrottle,
  onOpenConnect,
  onStartSimulator,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Shift-light bar calculation (12 LEDs starting from 55% of shiftRpm up to limiterRpm)
  const shiftStart = thresholds.shiftRpm * 0.55;
  const shiftRange = Math.max(500, thresholds.limiterRpm - shiftStart);
  const shiftProgress = Math.max(0, Math.min(1, (frame.rpm - shiftStart) / shiftRange));
  const activeLeds = Math.round(shiftProgress * 12);
  const isShiftZone = frame.rpm >= thresholds.shiftRpm;
  const isLimiter = frame.rpm >= thresholds.limiterRpm;

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const sec = (totalSec % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  const handleMoveWidget = (id: string, dir: -1 | 1) => {
    const idx = widgets.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    onUpdateWidgets(next);
  };

  const handleChangeStyle = (id: string, style: WidgetStyle) => {
    onUpdateWidgets(widgets.map((w) => (w.id === id ? { ...w, style } : w)));
  };

  const handleToggleSize = (id: string) => {
    onUpdateWidgets(
      widgets.map((w) =>
        w.id === id ? { ...w, size: w.size === 'wide' ? 'half' : 'wide' } : w
      )
    );
  };

  const handleRemoveWidget = (id: string) => {
    onUpdateWidgets(widgets.filter((w) => w.id !== id));
  };

  const handleAddSensorWidget = (sensor: SensorKey) => {
    const newWidget: WidgetConfig = {
      id: `w-${sensor}-${Date.now()}`,
      sensor,
      style: sensor === 'rpm' || sensor === 'afr' ? 'gauge' : 'numeric',
      size: sensor === 'rpm' ? 'wide' : 'half',
    };
    onUpdateWidgets([...widgets, newWidget]);
    setShowAddWidget(false);
  };

  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onSaveAsPreset(trimmed);
    setNewPresetName('');
    setShowSavePreset(false);
  };

  const activeSensors = new Set(widgets.map((w) => w.sensor));
  const availableSensors = (Object.keys(SENSOR_CATALOG) as SensorKey[]).filter(
    (k) => !activeSensors.has(k)
  );

  return (
    <div className="space-y-4">
      {/* Disconnected Banner (clean non-blocking prompt) */}
      {connectionMode === 'disconnected' && (
        <div className="rounded-2xl border border-orange-500/30 bg-[#121720] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100">
              Siap Menghubungkan ke ECU Juken 5+
            </h2>
            <p className="text-sm text-slate-400">
              Pasangkan smartphone via Bluetooth ke modul BLE Juken 5+ Anda atau aktifkan Mode Uji Simulasi untuk mencoba dasbor dan grafik.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenConnect}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Bluetooth className="w-4 h-4" />
              <span>Hubungkan Bluetooth</span>
            </button>
            <button
              type="button"
              onClick={onStartSimulator}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Gauge className="w-4 h-4" />
              <span>Uji Mode Simulasi</span>
            </button>
            <PWAInstallButton />
          </div>
        </div>
      )}

      {/* Shift-Light LED Bar + Recording & Telemetry Controls */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-3.5 sm:p-4 space-y-3">
        {/* 12-Segment Shift Light */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">
              {isLimiter
                ? 'PERINGATAN: LIMITER RPM'
                : isShiftZone
                ? 'WAKTUNYA PINDAH GIGI (SHIFT)'
                : 'Shift Light RPM'}
            </span>
            <span className="font-mono tabular-nums">
              {connectionMode === 'bluetooth'
                ? `BLE: ${deviceName || 'Juken 5+'}`
                : connectionMode === 'serial'
                ? 'USB Serial Aktif'
                : connectionMode === 'simulator'
                ? 'Mode Simulasi ECU'
                : 'Terputus'}
              {' · '}
              Shift {thresholds.shiftRpm.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="grid grid-cols-12 gap-1.5" aria-hidden="true">
            {Array.from({ length: 12 }, (_, idx) => {
              const lit = idx < activeLeds;
              let bg = 'bg-white/[0.06]';
              if (lit) {
                if (idx < 5) bg = 'bg-emerald-500';
                else if (idx < 9) bg = 'bg-amber-400';
                else bg = 'bg-red-500';
              }
              return (
                <div
                  key={idx}
                  className={`h-2.5 rounded-sm transition-colors duration-75 ${bg}`}
                />
              );
            })}
          </div>
        </div>

        {/* Action Toolbar: Record Log, Reset Peak, Presets, Customize */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleRecording}
              disabled={connectionMode === 'disconnected'}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-40 ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-400 text-white'
                  : 'bg-white/[0.07] hover:bg-white/[0.12] text-slate-100'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Rekam</span>
                </>
              ) : (
                <>
                  <CircleDot className="w-4 h-4 text-red-400" />
                  <span>Rekam Log</span>
                </>
              )}
            </button>

            {isRecording && (
              <div className="text-xs font-mono tabular-nums text-red-300 px-1">
                {formatDuration(recordingDurationMs)} · {recordingSamples} sampel
              </div>
            )}

            <button
              type="button"
              onClick={onResetPeaks}
              title="Reset Nilai Puncak (Peak Hold)"
              className="min-h-[44px] px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Puncak</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleLandscape}
              title="Putar / Mode Kokpit Landscape"
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                isLandscapeMode
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.09] text-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4 rotate-90" />
              <span>{isLandscapeMode ? 'Keluar Landscape' : 'Landscape'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditMode((v) => !v);
                setShowAddWidget(false);
              }}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                editMode
                  ? 'bg-orange-500 text-slate-950'
                  : 'border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.09] text-slate-200'
              }`}
            >
              {editMode ? <Check className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
              <span>{editMode ? 'Selesai Atur' : 'Atur Dasbor'}</span>
            </button>
          </div>
        </div>

        {/* Preset Segmented Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/30 border border-white/[0.06]">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPreset(p.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activePresetId === p.id
                    ? 'bg-white/[0.12] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {editMode && (
            <>
              <button
                type="button"
                onClick={() => setShowAddWidget((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap hover:bg-orange-500/25 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Sensor</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSavePreset((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.06] text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap hover:bg-white/[0.1] transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Preset</span>
              </button>
            </>
          )}
        </div>

        {/* Save Preset Inline Form */}
        {editMode && showSavePreset && (
          <form
            onSubmit={handleCreatePreset}
            className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/[0.06]"
          >
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Nama preset baru (mis. Sirkuit Sentul)"
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-black/40 border border-white/[0.12] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-orange-500 text-slate-950 font-semibold text-sm hover:bg-orange-400 transition-colors whitespace-nowrap"
            >
              Simpan Layout
            </button>
          </form>
        )}

        {/* Add Sensor Widget Drawer */}
        {editMode && showAddWidget && (
          <div className="pt-3 border-t border-white/[0.06] space-y-2">
            <div className="text-xs font-medium text-slate-300">
              Pilih Parameter Sensor Juken 5+ untuk Ditambahkan:
            </div>
            {availableSensors.length === 0 ? (
              <p className="text-xs text-slate-400">
                Semua 10 sensor utama sudah ditampilkan di dasbor Anda. Anda tetap dapat menambah duplikat sensor dengan gaya tampilan berbeda.
              </p>
            ) : null}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(Object.keys(SENSOR_CATALOG) as SensorKey[]).map((key) => {
                const s = SENSOR_CATALOG[key];
                const exists = activeSensors.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAddSensorWidget(key)}
                    className="min-h-[44px] p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-left transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-100 truncate">
                      {s.shortLabel}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {exists ? 'Tambah Lagi' : s.unit}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Simulator Interactive Throttle Control (when Simulator mode active) */}
      {connectionMode === 'simulator' && (
        <div className="rounded-2xl border border-sky-500/25 bg-[#121720] p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400 mr-1">Skenario Uji:</span>
            {(
              [
                { id: 'dyno', label: 'Dyno Pull' },
                { id: 'touring', label: 'Jalan Raya' },
                { id: 'idle', label: 'Langsam' },
                { id: 'manual', label: 'Gas Manual' },
              ] as { id: SimulatorScenario; label: string }[]
            ).map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => onChangeScenario(sc.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  simulatorScenario === sc.id
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>

          {simulatorScenario === 'manual' && (
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <label htmlFor="manual-tps" className="text-xs font-medium text-slate-300 whitespace-nowrap">
                Bukaan Gas
              </label>
              <input
                id="manual-tps"
                type="range"
                min={0}
                max={100}
                value={manualThrottle}
                onChange={(e) => onChangeManualThrottle(Number(e.target.value))}
                className="flex-1 accent-orange-500 h-2 cursor-pointer"
              />
              <span className="font-mono text-xs font-semibold text-orange-400 tabular-nums w-12 text-right">
                {manualThrottle}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Customizable Telemetry Widget Grid */}
      {widgets.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-8 text-center space-y-3">
          <p className="text-sm text-slate-300">Belum ada widget sensor di dasbor.</p>
          <button
            type="button"
            onClick={() => {
              setEditMode(true);
              setShowAddWidget(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 text-slate-950 font-semibold text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Sensor Pertama</span>
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-3 sm:gap-4 ${
            isLandscapeMode
              ? 'grid-cols-3 sm:grid-cols-4'
              : 'grid-cols-2 landscape:grid-cols-4 lg:grid-cols-4'
          }`}
        >
          {widgets.map((widget, idx) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              frame={frame}
              history={history}
              peakValue={peaks[widget.sensor]}
              thresholds={thresholds}
              editMode={editMode}
              isFirst={idx === 0}
              isLast={idx === widgets.length - 1}
              onMove={handleMoveWidget}
              onChangeStyle={handleChangeStyle}
              onToggleSize={handleToggleSize}
              onRemove={handleRemoveWidget}
            />
          ))}
        </div>
      )}
    </div>
  );
};
