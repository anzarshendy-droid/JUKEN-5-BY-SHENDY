import React, { useMemo, useRef, useState } from 'react';
import { LogSession } from '../types/telemetry';
import { exportSessionToCSV, triggerFileDownload } from '../utils/logStorage';
import { GoogleDrivePanel } from './GoogleDrivePanel';
import { BarChart3, ClipboardPaste, Download, FileUp, Search, Trash2 } from 'lucide-react';

interface LogsViewProps {
  sessions: LogSession[];
  onInspectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onImportFile: (file: File) => Promise<void>;
  onImportFromDrive: (filename: string, text: string) => Promise<void>;
}

export const LogsView: React.FC<LogsViewProps> = ({
  sessions,
  onInspectSession,
  onDeleteSession,
  onImportFile,
  onImportFromDrive,
}) => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'bluetooth' | 'simulator' | 'imported'
  >('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('Log Bluetooth HC-05');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return s.name.toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [sessions, search, sourceFilter]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      await onImportFile(file);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Gagal membaca file log.');
    } finally {
      e.target.value = '';
    }
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.max(1, Math.round(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}m ${s}d` : `${s} detik`;
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const sourceLabel = (src: LogSession['source']) => {
    switch (src) {
      case 'bluetooth':
        return 'Bluetooth BLE';
      case 'serial':
        return 'USB Serial';
      case 'imported':
        return 'Impor File';
      default:
        return 'Simulasi ECU';
    }
  };

  const handleImportPasted = async () => {
    if (!pasteText.trim()) {
      setImportError('Tempel terlebih dahulu teks atau HEX log dari aplikasi Bluetooth HC-05.');
      return;
    }
    setImportError(null);
    try {
      await onImportFromDrive(pasteName.trim() || 'Log Bluetooth HC-05', pasteText);
      setPasteText('');
      setShowPasteBox(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Gagal memproses log HC-05.');
    }
  };

  return (
    <div className="space-y-4">
      <GoogleDrivePanel
        mode="logs"
        sessions={sessions}
        onImportFromDrive={onImportFromDrive}
      />

      {/* Header & Import Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              Riwayat Data Logging ECU
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mendukung impor file (.txt, .log, .csv, .json) atau tempel teks/HEX langsung dari aplikasi Bluetooth HC-05 di HP.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt,.log"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className={`min-h-[44px] px-4 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                showPasteBox
                  ? 'border-[#FF6B1A] bg-[#FF6B1A]/15 text-[#E05206] dark:text-[#FF8533]'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
              }`}
            >
              <ClipboardPaste className="w-4 h-4 text-[#FF6B1A]" />
              <span>Tempel Log HC-05</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <FileUp className="w-4 h-4 text-[#FF6B1A]" />
              <span>Impor File</span>
            </button>
          </div>
        </div>

        {showPasteBox && (
          <div className="rounded-xl border border-[#FF6B1A]/35 bg-slate-50 dark:bg-[#0B0E14] p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Tempel Log dari Aplikasi Bluetooth HC-05 HP Android
              </div>
              <input
                type="text"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
                placeholder="Nama sesi log..."
                className="min-h-[36px] px-3 rounded-lg bg-white dark:bg-[#121721] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
              />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Salin log dari aplikasi HC-05 (format HEX <code>AA 55 ...</code>, Key-Value <code>RPM:8500 AFR:12.8 TPS:85</code>, atau CSV) lalu tempel di sini untuk dianalisis grafiknya.
            </p>
            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'AA 55 21 34 80 B2 62 78 4A 8D 3A 02 E8 6E\natau:\nRPM:8500 AFR:12.8 TPS:88.5 MAP:98 ECT:84'}
              className="w-full p-3 rounded-xl bg-white dark:bg-[#121721] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#FF6B1A]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteBox(false)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleImportPasted}
                className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 text-xs font-semibold"
              >
                Proses &amp; Buka Grafik
              </button>
            </div>
          </div>
        )}

        {importError && (
          <div className="rounded-xl border border-red-500/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {importError}
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama sesi log atau catatan..."
              className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#FF6B1A]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'bluetooth', label: 'Bluetooth' },
                { id: 'simulator', label: 'Simulasi' },
                { id: 'imported', label: 'Impor' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSourceFilter(f.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  sourceFilter === f.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Session List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Tidak ada sesi log yang cocok.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mulai rekam data di halaman Dasbor atau ubah kata kunci pencarian Anda.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const peakRpm = s.frames.reduce((m, f) => Math.max(m, f.rpm), 0);
            const avgAfr =
              s.frames.length > 0
                ? s.frames.reduce((acc, f) => acc + f.afr, 0) / s.frames.length
                : 0;
            const maxTps = s.frames.reduce((m, f) => Math.max(m, f.tps), 0);

            return (
              <div
                key={s.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {s.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatDate(s.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sourceLabel(s.source)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatDuration(s.durationMs)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{s.frames.length} sampel</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    <span>Puncak RPM: {peakRpm.toLocaleString('id-ID')}</span>
                    <span>Rata AFR: {avgAfr.toFixed(1)}</span>
                    <span>Maks TPS: {maxTps.toFixed(0)}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInspectSession(s.id)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Analisis Grafik</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportSessionToCSV(s);
                      const safeName = s.name.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
                      triggerFileDownload(`${safeName}.csv`, csv, 'text/csv;charset=utf-8;');
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>CSV</span>
                  </button>

                  {confirmDeleteId === s.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteSession(s.id);
                          setConfirmDeleteId(null);
                        }}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
                      >
                        Ya, Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium whitespace-nowrap"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(s.id)}
                      title="Hapus Log"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 text-slate-500 dark:text-slate-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
