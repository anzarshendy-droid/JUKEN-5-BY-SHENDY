import React, { useState } from 'react';
import {
  AlertThresholds,
  BluetoothConfig,
  ConnectionMode,
  PacketProtocol,
  RawPacketLog,
} from '../types/telemetry';
import { BLE_PROFILES } from '../utils/jukenProtocol';
import { PWAInstallButton } from './PWAInstallButton';
import { GoogleDrivePanel } from './GoogleDrivePanel';
import { Bluetooth, BluetoothOff, Cable, Gauge, Trash2 } from 'lucide-react';

interface ConnectionViewProps {
  connectionMode: ConnectionMode;
  deviceName: string | null;
  bleSupported: boolean;
  bleError: string | null;
  bleConfig: BluetoothConfig;
  thresholds: AlertThresholds;
  rawLogs: RawPacketLog[];
  onConnectBluetooth: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onStartSimulator: () => void;
  onUpdateBleConfig: (cfg: BluetoothConfig) => void;
  onUpdateThresholds: (t: AlertThresholds) => void;
  onClearRawLogs: () => void;
}

export const ConnectionView: React.FC<ConnectionViewProps> = ({
  connectionMode,
  deviceName,
  bleSupported,
  bleError,
  bleConfig,
  thresholds,
  rawLogs,
  onConnectBluetooth,
  onDisconnect,
  onStartSimulator,
  onUpdateBleConfig,
  onUpdateThresholds,
  onClearRawLogs,
}) => {
  const [connecting, setConnecting] = useState(false);

  const handleConnectClick = async () => {
    setConnecting(true);
    try {
      await onConnectBluetooth();
    } finally {
      setConnecting(false);
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
      {/* Primary Bluetooth Connection Panel */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-slate-100">
              Koneksi Bluetooth ECU Juken 5+
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              {connectionMode === 'bluetooth'
                ? `Terhubung langsung ke perangkat: ${deviceName || 'Juken 5+ BLE'}`
                : connectionMode === 'simulator'
                ? 'Saat ini berjalan dalam Mode Simulasi ECU (data uji fisika mesin).'
                : 'Sambungkan smartphone ke modul Bluetooth BLE pada port komunikasi Juken 5+.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {connectionMode === 'bluetooth' ? (
              <button
                type="button"
                onClick={onDisconnect}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <BluetoothOff className="w-4 h-4" />
                <span>Putuskan Bluetooth</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectClick}
                disabled={connecting}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Bluetooth className="w-4 h-4" />
                <span>{connecting ? 'Memindai BLE...' : 'Pindai & Hubungkan BLE'}</span>
              </button>
            )}

            {connectionMode !== 'simulator' ? (
              <button
                type="button"
                onClick={onStartSimulator}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Gauge className="w-4 h-4" />
                <span>Aktifkan Mode Simulasi</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onDisconnect}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Cable className="w-4 h-4" />
                <span>Hentikan Simulasi</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </div>

        {!bleSupported && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-950/15 p-3 text-xs text-amber-200 leading-relaxed">
            Web Bluetooth tidak terdeteksi pada browser ini (contoh: Safari iOS atau mode non-HTTPS). Untuk koneksi langsung ke hardware BLE dari smartphone, gunakan Google Chrome / Edge di Android, atau gunakan Mode Simulasi untuk menguji seluruh fitur dasbor &amp; grafik.
          </div>
        )}

        {bleError && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-xs text-red-300">
            {bleError}
          </div>
        )}
      </div>

      {/* Google Drive Mobile Installer & Android Config Export */}
      <GoogleDrivePanel mode="installer" />

      {/* BLE UART Profile & Protocol Settings + Alert Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-4 space-y-3.5">
          <h3 className="text-sm font-semibold text-slate-100">
            Profil Modul Bluetooth &amp; Protokol Frame
          </h3>

          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
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
                        ? 'border-orange-500/50 bg-orange-500/10'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-100">{prof.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{prof.note}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="ble-protocol" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[42px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-slate-100 focus:outline-none focus:border-orange-500"
              >
                <option value="auto">Deteksi Otomatis (Binary / CSV / KV)</option>
                <option value="juken_binary">Frame Biner Juken 5+ (AA 55)</option>
                <option value="csv">Stream ASCII CSV (RPM,AFR,TPS...)</option>
                <option value="key_value">Key-Value (RPM:8500 AFR:12.8)</option>
              </select>
            </div>

            <div>
              <label htmlFor="poll-ms" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[42px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="service-uuid" className="block text-xs text-slate-400 mb-1">
              Service UUID GATT
            </label>
            <input
              id="service-uuid"
              type="text"
              value={bleConfig.serviceUuid}
              onChange={(e) =>
                onUpdateBleConfig({ ...bleConfig, serviceUuid: e.target.value })
              }
              className="w-full min-h-[40px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label htmlFor="poll-hex" className="block text-xs text-slate-400 mb-1">
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
              className="w-full min-h-[40px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-4 space-y-3.5">
          <h3 className="text-sm font-semibold text-slate-100">
            Batas Peringatan &amp; Shift Light
          </h3>
          <p className="text-xs text-slate-400">
            Atur ambang batas peringatan visual pada widget dasbor sesuai spesifikasi mesin Anda.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="th-shift" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor="th-lim" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor="th-lean" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor="th-rich" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor="th-ect" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor="th-bat" className="block text-xs text-slate-400 mb-1">
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
                className="w-full min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Raw Packet Monitor for Field Diagnostics */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Monitor Paket Bluetooth Mentah (HEX / ASCII)
            </h3>
            <p className="text-xs text-slate-400">
              Menampilkan data paket langsung yang diterima dari modul Bluetooth Juken 5+.
            </p>
          </div>
          {rawLogs.length > 0 && (
            <button
              type="button"
              onClick={onClearRawLogs}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-300 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan</span>
            </button>
          )}
        </div>

        <div className="rounded-xl bg-black/50 border border-white/[0.06] p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1">
          {rawLogs.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">
              Belum ada paket Bluetooth diterima. Hubungkan modul BLE untuk melihat aliran byte mentah.
            </div>
          ) : (
            rawLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-slate-300 break-all">
                <span className="text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-orange-400 shrink-0 uppercase">{log.direction}</span>
                <span className="text-slate-200">{log.hex}</span>
                <span className="text-slate-500">| {log.ascii}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
