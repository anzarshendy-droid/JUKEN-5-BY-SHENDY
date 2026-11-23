import React, { useEffect, useState } from 'react';
import {
  AlertThresholds,
  BleScanMode,
  BluetoothConfig,
  ConnectionMode,
  PacketProtocol,
  RawPacketLog,
} from '../types/telemetry';
import { BLE_PROFILES, NativePairedDevice } from '../utils/jukenProtocol';
import { PWAInstallButton } from './PWAInstallButton';
import { GoogleDrivePanel } from './GoogleDrivePanel';
import {
  Bluetooth,
  BluetoothOff,
  Cable,
  CheckCircle2,
  ExternalLink,
  Gauge,
  MapPin,
  Send,
  ShieldAlert,
  Trash2,
  Usb,
  Wifi,
} from 'lucide-react';

interface ConnectionViewProps {
  connectionMode: ConnectionMode;
  deviceName: string | null;
  bleSupported: boolean;
  serialSupported: boolean;
  nativeApkAvailable: boolean;
  nativePairedDevices: NativePairedDevice[];
  bleError: string | null;
  bleConfig: BluetoothConfig;
  thresholds: AlertThresholds;
  rawLogs: RawPacketLog[];
  parsedFrameCount: number;
  onConnectBluetooth: () => Promise<void>;
  onConnectNativeClassic: (address: string, name: string) => Promise<void>;
  onConnectSerial: () => Promise<void>;
  onConnectWebSocket: () => Promise<void>;
  onSendTestCommand: (input: string, isHex: boolean) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onStartSimulator: () => void;
  onUpdateBleConfig: (cfg: BluetoothConfig) => void;
  onUpdateThresholds: (t: AlertThresholds) => void;
  onClearRawLogs: () => void;
}

type LocPermState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export const ConnectionView: React.FC<ConnectionViewProps> = ({
  connectionMode,
  deviceName,
  bleSupported,
  serialSupported,
  nativeApkAvailable,
  nativePairedDevices,
  bleError,
  bleConfig,
  thresholds,
  rawLogs,
  parsedFrameCount,
  onConnectBluetooth,
  onConnectNativeClassic,
  onConnectSerial,
  onConnectWebSocket,
  onSendTestCommand,
  onDisconnect,
  onStartSimulator,
  onUpdateBleConfig,
  onUpdateThresholds,
  onClearRawLogs,
}) => {
  const [connecting, setConnecting] = useState<'ble' | 'serial' | 'ws' | null>(null);
  const [locPerm, setLocPerm] = useState<LocPermState>('prompt');
  const [locRequesting, setLocRequesting] = useState(false);
  const [locStatusMsg, setLocStatusMsg] = useState<string | null>(null);
  const [testCmd, setTestCmd] = useState('AA 55 01 00 55');
  const [testCmdHex, setTestCmdHex] = useState(true);
  const [testCmdErr, setTestCmdErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocPerm('unsupported');
      return;
    }
    let mounted = true;
    let statusRef: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (mounted && statusRef) {
        setLocPerm(statusRef.state as LocPermState);
      }
    };

    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (!mounted) return;
          statusRef = status;
          setLocPerm(status.state as LocPermState);
          status.addEventListener('change', handlePermChange);
        })
        .catch(() => {
          // ignore if Permissions API doesn't support geolocation
        });
    }

    return () => {
      mounted = false;
      if (statusRef) {
        statusRef.removeEventListener('change', handlePermChange);
      }
    };
  }, []);

  const handleRequestLocationPermission = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocPerm('unsupported');
      setLocStatusMsg('Browser ini tidak mendukung sensor Lokasi (GPS).');
      return;
    }
    setLocRequesting(true);
    setLocStatusMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocPerm('granted');
        setLocRequesting(false);
        setLocStatusMsg(
          `Lokasi (GPS) aktif (±${Math.round(pos.coords.accuracy)} m). Bluetooth siap memindai perangkat.`
        );
      },
      (err) => {
        setLocRequesting(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocPerm('denied');
          setLocStatusMsg(
            'Izin Lokasi ditolak. Ketuk ikon gembok di address bar browser lalu ubah Lokasi -> Izinkan (Allow).'
          );
        } else {
          setLocStatusMsg(
            'Izin Lokasi dibuka, pastikan sakelar GPS/Lokasi HP Android dalam keadaan ON.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const inIframe =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const topTabUrl =
    typeof window !== 'undefined'
      ? window.location.href.replace('https://ais-dev-', 'https://ais-pre-')
      : '';

  const handleConnectClick = async () => {
    setConnecting('ble');
    try {
      await onConnectBluetooth();
    } finally {
      setConnecting(null);
    }
  };

  const handleSerialClick = async () => {
    setConnecting('serial');
    try {
      await onConnectSerial();
    } finally {
      setConnecting(null);
    }
  };

  const handleWebSocketClick = async () => {
    setConnecting('ws');
    try {
      await onConnectWebSocket();
    } finally {
      setConnecting(null);
    }
  };

  const applyProfile = (profileKey: string) => {
    const p = BLE_PROFILES[profileKey];
    if (!p) return;
    onUpdateBleConfig({
      ...bleConfig,
      serviceUuid: p.serviceUuid,
      rxCharacteristicUuid: p.rxUuid,
      txCharacteristicUuid: p.txUuid,
    });
  };

  return (
    <div className="space-y-4">
      {/* Primary Bluetooth & Windows USB/Bluetooth-SPP Connection Panel */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              Koneksi ECU Juken 5+ (Bluetooth &amp; USB Windows)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {connectionMode === 'bluetooth'
                ? `Terhubung langsung via Bluetooth BLE: ${deviceName || 'Juken 5+ BLE'}`
                : connectionMode === 'serial'
                ? `Terhubung via COM Port (Bluetooth Classic / USB): ${deviceName || 'COM Port'}`
                : connectionMode === 'websocket'
                ? `Terhubung via Live Bridge WebSocket: ${deviceName || 'ws://127.0.0.1:8765'}`
                : connectionMode === 'simulator'
                ? 'Saat ini berjalan dalam Mode Simulasi ECU (data uji fisika mesin).'
                : 'Izinkan Lokasi & Bluetooth seperti Juken 5+ Magic, lalu pindai modul Bluetooth ECU atau kabel USB COM.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {connectionMode === 'bluetooth' ||
            connectionMode === 'serial' ||
            connectionMode === 'websocket' ? (
              <button
                type="button"
                onClick={onDisconnect}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <BluetoothOff className="w-4 h-4" />
                <span>Putuskan Koneksi</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleConnectClick}
                  disabled={connecting !== null}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>{connecting === 'ble' ? 'Memindai BLE...' : 'Scan Bluetooth BLE'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSerialClick}
                  disabled={connecting !== null}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-900 dark:text-slate-100 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Usb className="w-4 h-4 text-[#FF6B1A]" />
                  <span>
                    {connecting === 'serial'
                      ? 'Membuka Port...'
                      : 'Bluetooth Classic / USB COM'}
                  </span>
                </button>
              </>
            )}

            {connectionMode !== 'simulator' ? (
              <button
                type="button"
                onClick={onStartSimulator}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Gauge className="w-4 h-4" />
                <span>Mode Simulasi</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onDisconnect}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Cable className="w-4 h-4" />
                <span>Hentikan Simulasi</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </div>

        {/* Native Android APK Bluetooth Classic SPP (0x1101) Paired Devices */}
        {nativeApkAvailable && connectionMode === 'disconnected' && (
          <div className="rounded-xl border border-[#FF6B1A]/45 bg-[#FF6B1A]/10 p-3.5 space-y-2.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Bluetooth Classic APK Native (Dongle PIN / BRT JUKEN)
            </div>
            {nativePairedDevices.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Belum ada perangkat Bluetooth terpasang. Pasangkan <strong>BRT JUKEN</strong> lewat Pengaturan Bluetooth HP lalu muat ulang halaman.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nativePairedDevices.map((dev) => (
                  <button
                    key={dev.address}
                    type="button"
                    onClick={() => onConnectNativeClassic(dev.address, dev.name)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    <span>{dev.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Location & Bluetooth Permission Gate (just like BRT Juken 5+ Magic) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {locPerm === 'granted' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-[#FF6B1A] shrink-0" />
              )}
              <span>
                Izin Lokasi &amp; Bluetooth (Standar Juken 5+ Magic)
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {locPerm === 'granted'
                ? 'Izin Lokasi (GPS) aktif — perangkat Android & browser siap memindai modul Bluetooth ECU.'
                : locPerm === 'denied'
                ? 'Izin Lokasi diblokir browser. Aktifkan izin Lokasi pada pengaturan situs browser agar scan Bluetooth muncul.'
                : 'Aplikasi Juken 5+ membutuhkan izin Lokasi (GPS) agar Android mengizinkan pencarian perangkat Bluetooth terdekat.'}
            </p>
            {locStatusMsg && (
              <p className="text-xs font-medium text-[#E05206] dark:text-[#FF8533]">
                {locStatusMsg}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRequestLocationPermission}
              disabled={locRequesting}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                locPerm === 'granted'
                  ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {locRequesting
                  ? 'Meminta Izin...'
                  : locPerm === 'granted'
                  ? 'Lokasi Diizinkan'
                  : 'Izinkan Lokasi (GPS)'}
              </span>
            </button>
          </div>
        </div>

        {/* BLE Scan Filter Mode to eliminate "Unknown / Perangkat Tidak Dikenal" beacon spam */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Filter Nama Perangkat Saat Scan BLE
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Menyembunyikan perangkat acak tanpa nama (&ldquo;Perangkat tidak dikenal&rdquo;) dari HP/TV/beacon sekitar.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'smart', label: 'Filter ECU / Juken' },
                  { id: 'custom', label: 'Cari Nama' },
                  { id: 'all', label: 'Semua Perangkat' },
                ] as { id: BleScanMode; label: string }[]
              ).map((m) => {
                const active = (bleConfig.scanMode || 'smart') === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onUpdateBleConfig({ ...bleConfig, scanMode: m.id })}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#FF6B1A] text-slate-950 font-semibold'
                        : 'bg-white dark:bg-[#121721] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(bleConfig.scanMode || 'smart') === 'custom' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label
                htmlFor="custom-ble-prefix"
                className="text-xs text-slate-600 dark:text-slate-400 shrink-0"
              >
                Awalan Nama Bluetooth:
              </label>
              <input
                id="custom-ble-prefix"
                type="text"
                value={bleConfig.customNamePrefix || ''}
                onChange={(e) =>
                  onUpdateBleConfig({ ...bleConfig, customNamePrefix: e.target.value })
                }
                placeholder="Contoh: JUKEN, BRT, HC-08"
                className="flex-1 min-h-[38px] px-3 rounded-lg bg-white dark:bg-[#121721] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>
          )}
        </div>

        {/* Live WebSocket Bridge for HC-05 / Android Bridge Apps */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3.5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-[#FF6B1A]" />
                <span>Live Bridge HC-05 (WebSocket Lokal)</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Untuk streaming live real-time dari aplikasi/bridge HC-05 ke dasbor (<code>ws://127.0.0.1:8765</code>).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                type="text"
                aria-label="Alamat WebSocket Bridge"
                value={bleConfig.wsBridgeUrl || 'ws://127.0.0.1:8765'}
                onChange={(e) =>
                  onUpdateBleConfig({ ...bleConfig, wsBridgeUrl: e.target.value })
                }
                placeholder="ws://127.0.0.1:8765"
                className="min-h-[38px] w-48 px-3 rounded-lg bg-white dark:bg-[#121721] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
              {connectionMode === 'websocket' ? (
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Putuskan Bridge
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleWebSocketClick}
                  disabled={connecting !== null}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#121721] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap"
                >
                  {connecting === 'ws' ? 'Menyambung...' : 'Hubungkan Bridge'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Actionable guidance when Bluetooth fails or is inside restricted iframe */}
        {inIframe && (
          <div className="rounded-xl border border-[#FF6B1A]/40 bg-[#FF6B1A]/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-800 dark:text-slate-200">
            <span>
              Aplikasi sedang dibuka di dalam jendela preview. Jika daftar Bluetooth kosong atau diblokir, buka di tab browser penuh agar Web Bluetooth &amp; Lokasi aktif 100%.
            </span>
            {topTabUrl && (
              <a
                href={topTabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Tab Baru</span>
              </a>
            )}
          </div>
        )}

        {!bleSupported && !serialSupported && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            Web Bluetooth &amp; Web Serial tidak terdeteksi pada browser ini. Gunakan Google Chrome atau Microsoft Edge di Windows 10/11 atau Android untuk koneksi langsung ke ECU, atau aktifkan Mode Simulasi.
          </div>
        )}

        {bleError && (
          <div className="rounded-xl border border-red-500/40 bg-red-50 dark:bg-red-950/25 p-3 text-xs text-red-700 dark:text-red-300 leading-relaxed">
            {bleError}
          </div>
        )}

        {/* Troubleshooting checklist for Juken 5+ Bluetooth & PIN Classic SPP */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3.5 text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            Panduan Dongle Bluetooth Pakai PIN (Classic SPP) vs BLE:
          </div>
          <ul className="list-disc list-inside space-y-1 leading-relaxed">
            <li>
              <strong>Dongle Juken 5+ Meminta PIN (1234 / 0000) di Windows 10/11</strong>: Itu adalah <strong>Bluetooth Classic (SPP/HC-05)</strong>. Pasangkan dongle di <strong>Pengaturan Bluetooth Windows</strong> sampai tersambung/paired, lalu di aplikasi ini klik tombol <strong>Bluetooth Classic / USB COM</strong> (bukan Scan BLE) dan pilih nama Bluetooth / Port COM dongle (coba Baud Rate <code>9600</code> atau <code>38400</code>).
            </li>
            <li>
              <strong>Dongle Meminta PIN di HP Android (Browser Chrome)</strong>: Secara aturan keamanan sistem, browser Chrome Android <strong>hanya mengizinkan Web Bluetooth BLE</strong> (tanpa PIN) dan belum menyediakan akses soket Bluetooth Classic SPP/PIN lewat web browser. Untuk dongle PIN, gunakan di <strong>Laptop/PC Windows 10/11</strong> lewat tombol <strong>Bluetooth Classic / USB COM</strong>, atau gunakan dongle versi BLE (Juken 5+ Magic / Smart BLE) di HP.
            </li>
            <li>
              <strong>Banyak &ldquo;Perangkat Tidak Dikenal&rdquo; saat Scan BLE</strong>: Gunakan mode <strong>Filter ECU / Juken</strong> atau <strong>Cari Nama</strong> di atas, dan pastikan <strong>Lokasi (GPS)</strong> + izin <strong>Perangkat di Sekitar</strong> Chrome Android menyala.
            </li>
          </ul>
        </div>
      </div>

      {/* Google Drive Windows + Mobile Installer Export */}
      <GoogleDrivePanel mode="installer" />

      {/* BLE UART & USB Serial Protocol Settings + Alert Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3.5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Profil Modul BLE, USB COM Windows &amp; Protokol Frame
          </h3>

          <div className="space-y-2">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              Preset Modul BLE Adapter
            </label>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(BLE_PROFILES).map(([key, prof]) => {
                const isSelected =
                  bleConfig.serviceUuid.toLowerCase() === prof.serviceUuid.toLowerCase();
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyProfile(key)}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      isSelected
                        ? 'border-[#FF6B1A]/60 bg-[#FF6B1A]/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {prof.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {prof.note}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label htmlFor="ble-protocol" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Format Data Masuk
              </label>
              <select
                id="ble-protocol"
                value={bleConfig.protocol}
                onChange={(e) =>
                  onUpdateBleConfig({
                    ...bleConfig,
                    protocol: e.target.value as PacketProtocol,
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              >
                <option value="auto">Otomatis (Binary / CSV / KV)</option>
                <option value="juken_binary">Biner Juken 5+ (AA 55)</option>
                <option value="csv">ASCII CSV (RPM,AFR,TPS...)</option>
                <option value="key_value">Key-Value (RPM:8500)</option>
              </select>
            </div>

            <div>
              <label htmlFor="serial-baud" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Baud Rate COM / USB
              </label>
              <select
                id="serial-baud"
                value={bleConfig.serialBaudRate || 38400}
                onChange={(e) =>
                  onUpdateBleConfig({
                    ...bleConfig,
                    serialBaudRate: Number(e.target.value),
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              >
                <option value={9600}>9600 bps (HC-05)</option>
                <option value={19200}>19200 bps</option>
                <option value={38400}>38400 bps (Standar)</option>
                <option value={57600}>57600 bps</option>
                <option value={115200}>115200 bps</option>
              </select>
            </div>

            <div>
              <label htmlFor="poll-ms" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Interval Polling (ms)
              </label>
              <input
                id="poll-ms"
                type="number"
                min={0}
                max={2000}
                step={10}
                value={bleConfig.pollIntervalMs}
                onChange={(e) =>
                  onUpdateBleConfig({
                    ...bleConfig,
                    pollIntervalMs: Number(e.target.value),
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="service-uuid" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Service UUID GATT (Bluetooth BLE)
            </label>
            <input
              id="service-uuid"
              type="text"
              value={bleConfig.serviceUuid}
              onChange={(e) =>
                onUpdateBleConfig({ ...bleConfig, serviceUuid: e.target.value })
              }
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#FF6B1A]"
            />
          </div>

          <div>
            <label htmlFor="poll-hex" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Perintah Polling HEX (Opsional, kosongkan jika pasif stream)
            </label>
            <input
              id="poll-hex"
              type="text"
              value={bleConfig.pollCommandHex}
              onChange={(e) =>
                onUpdateBleConfig({ ...bleConfig, pollCommandHex: e.target.value })
              }
              placeholder="AA 55 01 00 55"
              className="w-full min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#FF6B1A]"
            />
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3.5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Batas Peringatan &amp; Shift Light
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Atur ambang batas peringatan visual pada widget dasbor sesuai spesifikasi mesin Anda.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="th-shift" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Shift Light (RPM)
              </label>
              <input
                id="th-shift"
                type="number"
                step={100}
                value={thresholds.shiftRpm}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, shiftRpm: Number(e.target.value) })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>

            <div>
              <label htmlFor="th-lim" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Redline / Limiter (RPM)
              </label>
              <input
                id="th-lim"
                type="number"
                step={100}
                value={thresholds.limiterRpm}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, limiterRpm: Number(e.target.value) })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>

            <div>
              <label htmlFor="th-lean" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Peringatan AFR Kering (&ge;)
              </label>
              <input
                id="th-lean"
                type="number"
                step={0.1}
                value={thresholds.afrLeanWarning}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, afrLeanWarning: Number(e.target.value) })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>

            <div>
              <label htmlFor="th-rich" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Peringatan AFR Basah (&le;)
              </label>
              <input
                id="th-rich"
                type="number"
                step={0.1}
                value={thresholds.afrRichWarning}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, afrRichWarning: Number(e.target.value) })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>

            <div>
              <label htmlFor="th-ect" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Suhu Mesin Maks (°C)
              </label>
              <input
                id="th-ect"
                type="number"
                step={1}
                value={thresholds.ectHighWarning}
                onChange={(e) =>
                  onUpdateThresholds({ ...thresholds, ectHighWarning: Number(e.target.value) })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>

            <div>
              <label htmlFor="th-bat" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Tegangan Aki Min (V)
              </label>
              <input
                id="th-bat"
                type="number"
                step={0.1}
                value={thresholds.batteryLowWarning}
                onChange={(e) =>
                  onUpdateThresholds({
                    ...thresholds,
                    batteryLowWarning: Number(e.target.value),
                  })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Raw Packet Monitor for Field Diagnostics */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Monitor Paket Data Mentah (Bluetooth &amp; USB Serial)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              RX masuk: <strong className="font-mono text-slate-900 dark:text-slate-100">{rawLogs.filter((l) => l.direction === 'rx').length}</strong> paket · Frame ECU terbaca:{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">{parsedFrameCount}</strong>
            </p>
          </div>
          {rawLogs.length > 0 && (
            <button
              type="button"
              onClick={onClearRawLogs}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan</span>
            </button>
          )}
        </div>

        {(connectionMode === 'bluetooth' ||
          connectionMode === 'serial' ||
          connectionMode === 'websocket') && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Perintah Uji TX"
                value={testCmd}
                onChange={(e) => setTestCmd(e.target.value)}
                placeholder={testCmdHex ? 'AA 55 01 00 55' : 'ATZ'}
                className="flex-1 min-w-[160px] min-h-[38px] px-3 rounded-lg bg-white dark:bg-[#121721] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
              <button
                type="button"
                onClick={() => setTestCmdHex((v) => !v)}
                className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#121721] text-xs font-mono text-slate-700 dark:text-slate-300"
              >
                {testCmdHex ? 'HEX' : 'ASCII'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setTestCmdErr(null);
                  try {
                    await onSendTestCommand(testCmd, testCmdHex);
                  } catch (err) {
                    setTestCmdErr(err instanceof Error ? err.message : 'Gagal mengirim perintah TX.');
                  }
                }}
                className="min-h-[38px] px-3.5 rounded-lg bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 text-xs font-semibold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim Uji TX</span>
              </button>
              {bleConfig.pollCommandHex.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => onUpdateBleConfig({ ...bleConfig, pollCommandHex: '' })}
                  className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#121721] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
                >
                  Matikan Poll (Pasif)
                </button>
              )}
            </div>
            {testCmdErr && (
              <p className="text-xs text-red-600 dark:text-red-400">{testCmdErr}</p>
            )}
          </div>
        )}

        <div className="rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1">
          {rawLogs.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">
              Belum ada paket diterima. Hubungkan Bluetooth BLE atau port COM Windows untuk melihat aliran byte mentah.
            </div>
          ) : (
            rawLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-slate-700 dark:text-slate-300 break-all">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-[#FF6B1A] shrink-0 uppercase">{log.direction}</span>
                <span className="text-slate-900 dark:text-slate-200">{log.hex}</span>
                <span className="text-slate-400 dark:text-slate-500">| {log.ascii}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
