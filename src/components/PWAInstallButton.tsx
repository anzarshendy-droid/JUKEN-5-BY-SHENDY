import React, { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';
import { Copy, Check, Download, Smartphone, WifiOff } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (isInstalled) {
    return null;
  }

  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const appUrl = rawOrigin.replace('https://ais-dev-', 'https://ais-pre-');

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Download ke HP</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <Smartphone className="w-4 h-4 text-orange-400" />
          <span>Download ke HP / APK</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#121720] p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-100">
                Download &amp; Pasang SAG65 Juken 5+
              </h3>
              <p className="text-xs text-slate-400">
                Pasang langsung sebagai aplikasi HP (PWA) atau gunakan data identitas di bawah untuk membuat file .apk lewat PWABuilder.
              </p>
            </div>

            {appUrl && (
              <div className="rounded-xl bg-black/40 border border-white/[0.08] p-2.5 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-300 truncate">{appUrl}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('url', appUrl)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-slate-100 flex items-center gap-1 shrink-0"
                >
                  {copiedKey === 'url' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'url' ? 'Disalin' : 'Salin URL'}</span>
                </button>
              </div>
            )}

            {isIOS ? (
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>Buka tautan aplikasi di browser <strong>Safari</strong> pada iPhone/iPad.</li>
                <li>Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.</li>
                <li>Pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong> lalu ketuk <strong>Tambah</strong>.</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>Buka tautan aplikasi di <strong>Google Chrome</strong> pada HP Android.</li>
                <li>Ketuk menu titik tiga (⋮) di pojok kanan atas lalu pilih <strong>Install app / Tambahkan ke layar utama</strong>.</li>
              </ol>
            )}

            {/* PWABuilder APK Package Identity */}
            <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-200">
                Data Identitas untuk Build .APK (PWABuilder)
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">App Name:</span>
                  <span className="text-slate-100">SAG65 Juken 5+</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Short Name:</span>
                  <span className="text-slate-100">SAG65</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Package ID:</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('pkg', 'com.sag65.juken5')}
                    className="text-orange-400 hover:text-orange-300 inline-flex items-center gap-1"
                  >
                    <span>com.sag65.juken5</span>
                    {copiedKey === 'pkg' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-6 left-4 z-40 rounded-xl border border-amber-500/40 bg-[#181F2B] px-3.5 py-2 text-xs font-medium text-amber-300 flex items-center gap-2 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Mode Offline · Bluetooth &amp; Log Lokal Tetap Aktif</span>
    </div>
  );
};
