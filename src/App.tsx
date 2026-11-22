import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActiveTab,
  AlertThresholds,
  BluetoothConfig,
  ConnectionMode,
  DashboardPreset,
  LogSession,
  RawPacketLog,
  SENSOR_CATALOG,
  SensorKey,
  SimulatorScenario,
  TelemetryFrame,
  WidgetConfig,
} from './types/telemetry';
import {
  createInitialFrame,
  DEFAULT_BLE_CONFIG,
  EngineSimulator,
  JukenBluetoothClient,
  JukenSerialClient,
} from './utils/jukenProtocol';
import {
  deleteSession,
  loadAllSessions,
  parseImportedLog,
  saveSession,
} from './utils/logStorage';
import { DEFAULT_PRESETS, DEFAULT_THRESHOLDS } from './utils/presets';
import { DashboardView } from './components/DashboardView';
import { DragView } from './components/DragView';
import { AnalyticsView } from './components/AnalyticsView';
import { LogsView } from './components/LogsView';
import { ConnectionView } from './components/ConnectionView';
import { OfflineIndicator } from './components/PWAInstallButton';
import { BarChart3, Bluetooth, Flag, FolderClock, Gauge, Radio } from 'lucide-react';

const LS_PRESETS_KEY = 'juken5_presets_v1';
const LS_ACTIVE_PRESET_KEY = 'juken5_active_preset_v1';
const LS_THRESHOLDS_KEY = 'juken5_thresholds_v1';
const LS_BLE_CONFIG_KEY = 'juken5_ble_config_v1';
const LS_THEME_KEY = 'sag65_theme_v1';

function createZeroPeaks(initial: TelemetryFrame): Record<SensorKey, number> {
  return {
    rpm: initial.rpm,
    afr: initial.afr,
    tps: initial.tps,
    map: initial.map,
    ect: initial.ect,
    iat: initial.iat,
    battery: initial.battery,
    ignTiming: initial.ignTiming,
    injWidth: initial.injWidth,
    speed: initial.speed,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (
        tab === 'dashboard' ||
        tab === 'drag' ||
        tab === 'analytics' ||
        tab === 'logs' ||
        tab === 'connection'
      ) {
        return tab;
      }
    }
    return 'dashboard';
  });
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('disconnected');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS_THEME_KEY);
      if (saved === 'light') return false;
      if (saved === 'dark') return true;
    } catch {
      // ignore
    }
    return true;
  });

  const [simulatorScenario, setSimulatorScenario] = useState<SimulatorScenario>('dyno');
  const [manualThrottle, setManualThrottle] = useState<number>(45);

  const [frame, setFrame] = useState<TelemetryFrame>(() => createInitialFrame());
  const [history, setHistory] = useState<TelemetryFrame[]>([]);
  const [peaks, setPeaks] = useState<Record<SensorKey, number>>(() =>
    createZeroPeaks(createInitialFrame())
  );

  // Dashboard Presets & Custom Widgets
  const [presets, setPresets] = useState<DashboardPreset[]>(() => {
    try {
      const saved = localStorage.getItem(LS_PRESETS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_PRESETS;
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    return localStorage.getItem(LS_ACTIVE_PRESET_KEY) || DEFAULT_PRESETS[0].id;
  });

  const [thresholds, setThresholds] = useState<AlertThresholds>(() => {
    try {
      const saved = localStorage.getItem(LS_THRESHOLDS_KEY);
      if (saved) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_THRESHOLDS;
  });

  const [bleConfig, setBleConfig] = useState<BluetoothConfig>(() => {
    try {
      const saved = localStorage.getItem(LS_BLE_CONFIG_KEY);
      if (saved) return { ...DEFAULT_BLE_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_BLE_CONFIG;
  });

  const [rawLogs, setRawLogs] = useState<RawPacketLog[]>([]);

  // Data Logger state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSamples, setRecordingSamples] = useState(0);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const recordedFramesRef = useRef<TelemetryFrame[]>([]);
  const recordStartTimeRef = useRef<number>(0);

  // Saved sessions
  const [sessions, setSessions] = useState<LogSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('sample-dyno-run-1');

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isLandscapeMode, setIsLandscapeMode] = useState(false);

  const bleClientRef = useRef<JukenBluetoothClient | null>(null);
  if (!bleClientRef.current) {
    bleClientRef.current = new JukenBluetoothClient();
  }
  const serialClientRef = useRef<JukenSerialClient | null>(null);
  if (!serialClientRef.current) {
    serialClientRef.current = new JukenSerialClient();
  }
  const simulatorRef = useRef<EngineSimulator | null>(null);
  if (!simulatorRef.current) {
    simulatorRef.current = new EngineSimulator();
  }

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Sync light/dark theme class on <html> and update mobile browser theme-color
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(LS_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#090C10' : '#F4F6F9');
    }
  }, [isDark]);

  // Load saved log sessions from IndexedDB on mount
  useEffect(() => {
    loadAllSessions().then((loaded) => {
      setSessions(loaded);
      if (loaded.length > 0) {
        setSelectedSessionId(loaded[0].id);
      }
    });
  }, []);

  // Persist presets & settings
  useEffect(() => {
    localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem(LS_ACTIVE_PRESET_KEY, activePresetId);
  }, [activePresetId]);

  useEffect(() => {
    localStorage.setItem(LS_THRESHOLDS_KEY, JSON.stringify(thresholds));
  }, [thresholds]);

  useEffect(() => {
    localStorage.setItem(LS_BLE_CONFIG_KEY, JSON.stringify(bleConfig));
  }, [bleConfig]);

  const activePreset =
    presets.find((p) => p.id === activePresetId) || presets[0] || DEFAULT_PRESETS[0];

  const handleIncomingFrame = useCallback(
    (nextFrame: TelemetryFrame) => {
      setFrame(nextFrame);
      setHistory((prev) => {
        const next = [...prev, nextFrame];
        return next.length > 300 ? next.slice(-300) : next;
      });
      setPeaks((prev) => {
        const updated = { ...prev };
        (Object.keys(SENSOR_CATALOG) as SensorKey[]).forEach((k) => {
          if (nextFrame[k] > updated[k]) {
            updated[k] = nextFrame[k];
          }
        });
        return updated;
      });

      if (isRecording) {
        const elapsed = Date.now() - recordStartTimeRef.current;
        const loggedFrame: TelemetryFrame = {
          ...nextFrame,
          elapsedMs: elapsed,
        };
        recordedFramesRef.current.push(loggedFrame);
        setRecordingSamples(recordedFramesRef.current.length);
        setRecordingDurationMs(elapsed);
      }
    },
    [isRecording]
  );

  // Simulator loop at 10 Hz when connectionMode === 'simulator'
  useEffect(() => {
    if (connectionMode !== 'simulator') return;
    const sim = simulatorRef.current!;
    const timer = window.setInterval(() => {
      const next = sim.step(0.1, simulatorScenario, manualThrottle);
      handleIncomingFrame(next);
    }, 100);
    return () => clearInterval(timer);
  }, [connectionMode, simulatorScenario, manualThrottle, handleIncomingFrame]);

  const handleConnectBluetooth = async () => {
    setBleError(null);
    const client = bleClientRef.current!;
    try {
      const res = await client.connect(bleConfig, {
        onFrame: (f) => handleIncomingFrame(f),
        onRawPacket: (log) =>
          setRawLogs((prev) => [log, ...prev].slice(0, 80)),
        onDisconnect: (reason) => {
          setConnectionMode('disconnected');
          setDeviceName(null);
          if (reason) setBleError(reason);
        },
      });
      setConnectionMode('bluetooth');
      setDeviceName(res.deviceName);
      setActiveTab('dashboard');
      showToast(`Terhubung ke ${res.deviceName}`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menghubungkan ke perangkat Bluetooth.';
      // Ignore silent user cancel from browser chooser
      if (!/cancel|User cancelled/i.test(msg)) {
        setBleError(msg);
      }
    }
  };

  const handleConnectSerial = async () => {
    setBleError(null);
    const client = serialClientRef.current!;
    try {
      const res = await client.connect(bleConfig, {
        onFrame: (f) => handleIncomingFrame(f),
        onRawPacket: (log) =>
          setRawLogs((prev) => [log, ...prev].slice(0, 80)),
        onDisconnect: (reason) => {
          setConnectionMode('disconnected');
          setDeviceName(null);
          if (reason) setBleError(reason);
        },
      });
      setConnectionMode('serial');
      setDeviceName(res.portLabel);
      setActiveTab('dashboard');
      showToast(`Terhubung ke ${res.portLabel}`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menghubungkan ke port USB Serial.';
      if (!/No port selected|cancel/i.test(msg)) {
        setBleError(msg);
      }
    }
  };

  const handleDisconnect = async () => {
    if (isRecording) {
      await handleStopAndSaveRecording();
    }
    if (connectionMode === 'bluetooth') {
      await bleClientRef.current?.disconnect();
    } else if (connectionMode === 'serial') {
      await serialClientRef.current?.disconnect();
    }
    setConnectionMode('disconnected');
    setDeviceName(null);
  };

  const handleStartSimulator = () => {
    setBleError(null);
    simulatorRef.current?.reset();
    setHistory([]);
    setConnectionMode('simulator');
    setActiveTab('dashboard');
    showToast('Mode Simulasi ECU Juken 5+ aktif');
  };

  const handleStopAndSaveRecording = async () => {
    setIsRecording(false);
    const frames = [...recordedFramesRef.current];
    recordedFramesRef.current = [];
    setRecordingSamples(0);
    setRecordingDurationMs(0);

    if (frames.length < 2) {
      showToast('Rekaman terlalu singkat untuk disimpan.');
      return;
    }

    const durationMs = frames[frames.length - 1].elapsedMs;
    const labelTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newSession: LogSession = {
      id: `log-${Date.now()}`,
      name:
        connectionMode === 'bluetooth'
          ? `Log Juken 5+ (${labelTime})`
          : connectionMode === 'serial'
          ? `Log USB Windows (${labelTime})`
          : `Log Simulasi ${simulatorScenario.toUpperCase()} (${labelTime})`,
      createdAt: Date.now(),
      durationMs,
      sampleRateHz: 10,
      source:
        connectionMode === 'bluetooth'
          ? 'bluetooth'
          : connectionMode === 'serial'
          ? 'serial'
          : 'simulator',
      isSample: false,
      frames,
    };

    await saveSession(newSession);
    const updated = await loadAllSessions();
    setSessions(updated);
    setSelectedSessionId(newSession.id);
    showToast(`Log disimpan (${frames.length} sampel)`);
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      await handleStopAndSaveRecording();
    } else {
      recordedFramesRef.current = [];
      recordStartTimeRef.current = Date.now();
      setRecordingSamples(0);
      setRecordingDurationMs(0);
      setIsRecording(true);
      showToast('Perekaman data sensor dimulai');
    }
  };

  const handleUpdateWidgets = (nextWidgets: WidgetConfig[]) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === activePreset.id ? { ...p, widgets: nextWidgets } : p))
    );
  };

  const handleSaveAsPreset = (name: string) => {
    const newPreset: DashboardPreset = {
      id: `preset-${Date.now()}`,
      name,
      widgets: activePreset.widgets.map((w) => ({ ...w, id: `${w.id}-${Date.now()}` })),
    };
    setPresets((prev) => [...prev, newPreset]);
    setActivePresetId(newPreset.id);
    showToast(`Preset "${name}" tersimpan`);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    const updated = await loadAllSessions();
    setSessions(updated);
    if (selectedSessionId === id && updated.length > 0) {
      setSelectedSessionId(updated[0].id);
    }
    showToast('Sesi log dihapus');
  };

  const handleImportRawText = async (filename: string, text: string) => {
    const session = parseImportedLog(filename, text);
    await saveSession(session);
    const updated = await loadAllSessions();
    setSessions(updated);
    setSelectedSessionId(session.id);
    setActiveTab('analytics');
    showToast(`Berhasil mengimpor ${session.frames.length} sampel`);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    await handleImportRawText(file.name, text);
  };

  const handleToggleLandscape = async () => {
    const next = !isLandscapeMode;
    setIsLandscapeMode(next);
    try {
      if (next) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        const orient = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        if (orient && typeof orient.lock === 'function') {
          await orient.lock('landscape');
        }
        showToast('Mode Landscape aktif');
      } else {
        const orient = screen.orientation as ScreenOrientation & { unlock?: () => void };
        if (orient && typeof orient.unlock === 'function') {
          orient.unlock();
        }
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
        showToast('Mode Normal aktif');
      }
    } catch {
      // Fallback: CSS landscape cockpit layout still switches even if browser blocks orientation lock
      showToast(next ? 'Kokpit Landscape aktif (putar HP ke posisi mendatar)' : 'Mode Normal aktif');
    }
  };

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dasbor', shortLabel: 'Dasbor', icon: <Gauge className="w-5 h-5" /> },
    { id: 'drag', label: 'Drag GPS', shortLabel: 'Drag', icon: <Flag className="w-5 h-5" /> },
    { id: 'analytics', label: 'Grafik', shortLabel: 'Grafik', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'logs', label: 'Riwayat Log', shortLabel: 'Log', icon: <FolderClock className="w-5 h-5" /> },
    { id: 'connection', label: 'Koneksi', shortLabel: 'Koneksi', icon: <Radio className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-[#090C10] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Top Bar Contract: 3 clean zones (Brand wordmark — Nav links — 1 Primary Action) */}
      <header className="sticky top-0 z-30 h-14 landscape:h-12 md:h-14 border-b border-slate-200 dark:border-slate-800 bg-[#F4F6F9]/90 dark:bg-[#090C10]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single text element Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 text-left"
          >
            SAG65 Juken 5+
          </button>

          {/* Zone 2: Desktop & Landscape Single-line Navigation Links */}
          <nav className="hidden md:flex landscape:flex items-center gap-4 lg:gap-6 text-xs sm:text-sm font-medium overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  activeTab === item.id
                    ? 'text-[#FF6B1A] border-[#FF6B1A]'
                    : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action CTA */}
          <div className="flex items-center shrink-0">
            {connectionMode === 'bluetooth' || connectionMode === 'serial' ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 hover:bg-emerald-500/25 transition-colors"
              >
                <Bluetooth className="w-4 h-4" />
                <span>{connectionMode === 'serial' ? 'Putuskan USB' : 'Putuskan BLE'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (bleClientRef.current?.isSupported()) {
                    handleConnectBluetooth();
                  } else {
                    setActiveTab('connection');
                  }
                }}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Hubungkan BLE</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Viewport Content */}
      <main
        className={`flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-24 landscape:pb-6 md:pb-8 ${
          isLandscapeMode ? 'max-w-none' : 'max-w-7xl'
        }`}
      >
        {activeTab === 'dashboard' && (
          <DashboardView
            frame={frame}
            history={history}
            peaks={peaks}
            thresholds={thresholds}
            connectionMode={connectionMode}
            deviceName={deviceName}
            simulatorScenario={simulatorScenario}
            manualThrottle={manualThrottle}
            isRecording={isRecording}
            recordingSamples={recordingSamples}
            recordingDurationMs={recordingDurationMs}
            presets={presets}
            activePresetId={activePreset.id}
            widgets={activePreset.widgets}
            isLandscapeMode={isLandscapeMode}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
            onToggleLandscape={handleToggleLandscape}
            onSelectPreset={setActivePresetId}
            onSaveAsPreset={handleSaveAsPreset}
            onUpdateWidgets={handleUpdateWidgets}
            onResetPeaks={() => setPeaks(createZeroPeaks(frame))}
            onToggleRecording={handleToggleRecording}
            onChangeScenario={setSimulatorScenario}
            onChangeManualThrottle={setManualThrottle}
            onOpenConnect={() => setActiveTab('connection')}
            onStartSimulator={handleStartSimulator}
          />
        )}

        {activeTab === 'drag' && (
          <DragView frame={frame} connectionMode={connectionMode} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            liveBuffer={history}
            thresholds={thresholds}
            onSelectSession={setSelectedSessionId}
          />
        )}

        {activeTab === 'logs' && (
          <LogsView
            sessions={sessions}
            onInspectSession={(id) => {
              setSelectedSessionId(id);
              setActiveTab('analytics');
            }}
            onDeleteSession={handleDeleteSession}
            onImportFile={handleImportFile}
            onImportFromDrive={handleImportRawText}
          />
        )}

        {activeTab === 'connection' && (
          <ConnectionView
            connectionMode={connectionMode}
            deviceName={deviceName}
            bleSupported={bleClientRef.current?.isSupported() ?? false}
            serialSupported={serialClientRef.current?.isSupported() ?? false}
            bleError={bleError}
            bleConfig={bleConfig}
            thresholds={thresholds}
            rawLogs={rawLogs}
            onConnectBluetooth={handleConnectBluetooth}
            onConnectSerial={handleConnectSerial}
            onDisconnect={handleDisconnect}
            onStartSimulator={handleStartSimulator}
            onUpdateBleConfig={setBleConfig}
            onUpdateThresholds={setThresholds}
            onClearRawLogs={() => setRawLogs([])}
          />
        )}
      </main>

      {/* Toast notification */}
      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 right-4 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18202D] px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 shadow-xl"
        >
          {toastMsg}
        </div>
      )}

      <OfflineIndicator />

      {/* Mobile Portrait Bottom Thumb-Zone Tab Bar (hidden on desktop and mobile landscape) */}
      <nav
        aria-label="Navigasi Smartphone"
        className="md:hidden landscape:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#F4F6F9]/95 dark:bg-[#090C10]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'text-[#FF6B1A]'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span className="text-[11px] font-medium tracking-tight leading-none whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
