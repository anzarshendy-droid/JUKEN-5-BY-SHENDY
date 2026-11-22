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
  Bluetooth,
  Check,
  CircleDot,
  Gauge,
  Moon,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Smartphone,
  Square,
  Sun,
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
  isDark: boolean;
  onToggleTheme: () => void;
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
  isDark,
  onToggleTheme,
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

  return (
    <div className="space-y-4">
      {/* Disconnected Banner */}
      {connectionMode === 'disconnected' && (
        <div className="rounded-2xl border border-[#FF6B1A]/35 bg-white dark:bg-[#121721] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Siap Menghubungkan ke ECU Juken 5+
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Pasangkan smartphone via Bluetooth ke modul BLE Juken 5+ Anda atau aktifkan Mode Uji Simulasi untuk mencoba dasbor dan grafik.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenConnect}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Bluetooth className="w-4 h-4" />
              <span>Hubungkan Bluetooth</span>
            </button>
            <button
              type="button"
              onClick={onStartSimulator}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Gauge className="w-4 h-4" />
              <span>Uji Mode Simulasi</span>
            </button>
            <PWAInstallButton />
          </div>
        </div>
      )}

      {/* Shift-Light LED Bar + Recording & Telemetry Controls */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-3.5 sm:p-4 space-y-3">
        {/* 12-Segment Shift Light */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
            <span
              className={`font-semibold truncate ${
                isLimiter
                  ? 'text-red-600 dark:text-red-400'
                  : isShiftZone
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {isLimiter
                ? 'PERINGATAN: LIMITER RPM'
                : isShiftZone
                ? 'WAKTUNYA PINDAH GIGI (SHIFT)'
                : 'Shift Light RPM'}
            </span>
            <span className="font-mono tabular-nums shrink-0">
              {connectionMode === 'bluetooth'
                ? `BLE: ${deviceName || 'Juken 5+'}`
                : connectionMode === 'serial'
                ? 'USB Serial'
                : connectionMode === 'simulator'
                ? 'Simulasi ECU'
                : 'Terputus'}
              {' · '}
              Shift {thresholds.shiftRpm.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="grid grid-cols-12 gap-1.5" aria-hidden="true">
            {Array.from({ length: 12 }, (_, idx) => {
              const lit = idx < activeLeds;
              let bg = 'bg-slate-200 dark:bg-slate-800';
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

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onToggleRecording}
              disabled={connectionMode === 'disconnected'}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-40 ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Rekam</span>
                </>
              ) : (
                <>
                  <CircleDot className="w-4 h-4 text-red-500" />
                  <span>Rekam Log</span>
                </>
              )}
            </button>

            {isRecording && (
              <div className="text-xs font-mono tabular-nums text-red-600 dark:text-red-400 px-1">
                {formatDuration(recordingDurationMs)} · {recordingSamples} sampel
              </div>
            )}

            <button
              type="button"
              onClick={onResetPeaks}
              title="Reset Nilai Puncak (Peak Hold)"
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Puncak</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDark ? 'Ganti ke Mode Siang (Terang)' : 'Ganti ke Mode Malam (Gelap)'}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="hidden sm:inline">{isDark ? 'Siang' : 'Malam'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleLandscape}
              title="Putar / Mode Kokpit Landscape"
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                isLandscapeMode
                  ? 'bg-[#FF6B1A] text-slate-950 font-semibold'
                  : 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
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
                  ? 'bg-[#FF6B1A] text-slate-950'
                  : 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              {editMode ? <Check className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
              <span>{editMode ? 'Selesai Atur' : 'Atur Dasbor'}</span>
            </button>
          </div>
        </div>

        {/* Preset Segmented Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPreset(p.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activePresetId === p.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FF6B1A]/15 border border-[#FF6B1A]/40 text-[#C2410C] dark:text-[#FF8C4A] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap hover:bg-[#FF6B1A]/25 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Sensor</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSavePreset((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
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
            className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
          >
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Nama preset baru (mis. Sirkuit Sentul)"
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#FF6B1A]"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-[#FF6B1A] text-slate-950 font-semibold text-sm hover:bg-[#F97316] transition-colors whitespace-nowrap"
            >
              Simpan Layout
            </button>
          </form>
        )}

        {/* Add Sensor Widget Drawer */}
        {editMode && showAddWidget && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Pilih Parameter Sensor Juken 5+ untuk Ditambahkan:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(Object.keys(SENSOR_CATALOG) as SensorKey[]).map((key) => {
                const s = SENSOR_CATALOG[key];
                const exists = activeSensors.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAddSensorWidget(key)}
                    className="min-h-[44px] p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {s.shortLabel}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {exists ? 'Tambah Lagi' : s.unit}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Simulator Interactive Throttle Control */}
      {connectionMode === 'simulator' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
              Skenario Uji:
            </span>
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
                    ? 'bg-[#FF6B1A] text-slate-950 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>

          {simulatorScenario === 'manual' && (
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <label
                htmlFor="manual-tps"
                className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
              >
                Bukaan Gas
              </label>
              <input
                id="manual-tps"
                type="range"
                min={0}
                max={100}
                value={manualThrottle}
                onChange={(e) => onChangeManualThrottle(Number(e.target.value))}
                className="flex-1 accent-[#FF6B1A] h-2 cursor-pointer"
              />
              <span className="font-mono text-xs font-semibold text-[#FF6B1A] tabular-nums w-12 text-right">
                {manualThrottle}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Customizable Telemetry Widget Grid */}
      {widgets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-8 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Belum ada widget sensor di dasbor.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditMode(true);
              setShowAddWidget(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FF6B1A] text-slate-950 font-semibold text-sm inline-flex items-center gap-2"
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
