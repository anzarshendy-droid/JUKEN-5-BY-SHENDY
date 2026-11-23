import React, { useEffect, useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';
import { buildWindowsLauncherBat } from '../utils/googleDrive';
import { downloadGithubApkKitZip } from '../utils/githubApkKit';
import { Check, Copy, Download, ExternalLink, GitBranch, Monitor, Smartphone, WifiOff } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isWindows, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [platformTab, setPlatformTab] = useState<'windows' | 'mobile'>('mobile');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isWindows) {
      setPlatformTab('windows');
    }
  }, [isWindows]);

  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const appUrl = rawOrigin.replace('https://ais-dev-', 'https://ais-pre-');
  const pwaBuilderUrl = appUrl
    ? `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(appUrl)}`
    : 'https://www.pwabuilder.com';

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadWindowsBat = () => {
    const targetUrl = appUrl || 'http://localhost:3000';
    const content = buildWindowsLauncherBat(targetUrl);
    const blob = new Blob([content], { type: 'application/x-msdos-program' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SAG65_Windows_App.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {isInstallable && !isInstalled && (
        <button
          type="button"
          onClick={install}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-[#FF6B1A]" />
          <span>{isWindows ? 'Pasang Aplikasi Windows' : 'Download ke HP'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
      >
        {isWindows ? (
          <Monitor className="w-4 h-4 text-[#FF6B1A]" />
        ) : (
          <Smartphone className="w-4 h-4 text-[#FF6B1A]" />
        )}
        <span>Buat .APK / Windows</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121721] p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Pasang SAG65 Juken 5+ (Windows &amp; HP)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Jalankan sebagai aplikasi desktop Windows 10/11 (dengan kabel USB COM &amp; Bluetooth) atau pasang di HP Android/iOS.
              </p>
            </div>

            {/* Platform Tab Switcher */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 dark:bg-[#0B0E14] p-1 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPlatformTab('windows')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  platformTab === 'windows'
                    ? 'bg-[#FF6B1A] text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Windows PC / Laptop</span>
              </button>
              <button
                type="button"
                onClick={() => setPlatformTab('mobile')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  platformTab === 'mobile'
                    ? 'bg-[#FF6B1A] text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android / iOS</span>
              </button>
            </div>

            {appUrl && (
              <div className="rounded-xl bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 p-2.5 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  {appUrl}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('url', appUrl)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0"
                >
                  {copiedKey === 'url' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'url' ? 'Disalin' : 'Salin URL'}</span>
                </button>
              </div>
            )}

            {platformTab === 'windows' ? (
              <div className="space-y-3">
                <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-decimal list-inside leading-relaxed">
                  <li>
                    Buka aplikasi di <strong>Microsoft Edge</strong> atau <strong>Google Chrome</strong> pada Windows 10/11.
                  </li>
                  <li>
                    Klik ikon <strong>Install App</strong> di kanan address bar (atau menu <strong>⋮ → Apps → Install this site as an app</strong>) untuk menaruh ikon di Desktop &amp; Start Menu.
                  </li>
                  <li>
                    Atau unduh peluncur instan di bawah ini, lalu klik 2x file <strong>SAG65_Windows_App.bat</strong> di laptop Windows Anda.
                  </li>
                </ol>

                <button
                  type="button"
                  onClick={handleDownloadWindowsBat}
                  className="w-full min-h-[42px] px-4 rounded-xl border border-[#FF6B1A]/45 bg-[#FF6B1A]/10 hover:bg-[#FF6B1A]/20 text-[#E05206] dark:text-[#FF8533] font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Peluncur Windows (.bat)</span>
                </button>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Paket Windows Store / .MSIX (PWABuilder)
                  </div>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Package ID:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('winpkg', 'SAG65.Juken5Telemetry')}
                        className="text-[#FF6B1A] hover:underline inline-flex items-center gap-1"
                      >
                        <span>SAG65.Juken5Telemetry</span>
                        {copiedKey === 'winpkg' ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Koneksi PC:</span>
                      <span className="text-slate-900 dark:text-slate-100">USB Serial &amp; BLE</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {isIOS ? (
                  <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-decimal list-inside leading-relaxed">
                    <li>
                      Buka tautan aplikasi di browser <strong>Safari</strong> pada iPhone/iPad.
                    </li>
                    <li>
                      Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.
                    </li>
                    <li>
                      Pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong> lalu ketuk{' '}
                      <strong>Tambah</strong>.
                    </li>
                  </ol>
                ) : (
                  <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-decimal list-inside leading-relaxed">
                    <li>
                      Buka tautan aplikasi di <strong>Google Chrome</strong> pada HP Android.
                    </li>
                    <li>
                      Ketuk menu titik tiga (⋮) di pojok kanan atas lalu pilih{' '}
                      <strong>Install app / Tambahkan ke layar utama</strong>.
                    </li>
                  </ol>
                )}

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-3 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Buat File .APK Android (PWABuilder / GitHub APK)
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">App Name:</span>
                      <span className="text-slate-900 dark:text-slate-100">SAG65 Juken 5+</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">Package ID:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('pkg', 'com.sag65.juken5')}
                        className="text-[#FF6B1A] hover:underline inline-flex items-center gap-1"
                      >
                        <span>com.sag65.juken5</span>
                        {copiedKey === 'pkg' ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  <ol className="text-[11px] text-slate-600 dark:text-slate-400 list-decimal list-inside space-y-1 leading-relaxed">
                    <li>
                      Ketuk tombol <strong>Buka PWABuilder</strong> di bawah (URL sudah terisi otomatis).
                    </li>
                    <li>
                      Tunggu scan selesai → ketuk <strong>Package for Stores</strong> → pilih <strong>Android → Generate Package</strong> → pilih Signing Key <strong>New</strong> → <strong>Download Package</strong>.
                    </li>
                    <li>
                      Ekstrak file <code>.zip</code> hasil unduhan → pasang file <code>.apk</code> di HP Anda.
                    </li>
                  </ol>
                  <a
                    href={pwaBuilderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[40px] px-3.5 rounded-xl border border-[#FF6B1A]/45 bg-[#FF6B1A]/10 hover:bg-[#FF6B1A]/20 text-[#E05206] dark:text-[#FF8533] font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka PWABuilder (Langsung Generate .APK)</span>
                  </a>
                </div>

                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-3 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <GitBranch className="w-3.5 h-3.5 shrink-0" />
                    <span>Build .APK Native via GitHub Actions (Bluetooth Classic PIN)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Khusus dongle PIN seperti <strong>BRT JUKEN</strong> agar bisa langsung tersambung tanpa Chrome/WebSocket.
                  </p>
                  <ol className="text-[11px] text-slate-600 dark:text-slate-400 list-decimal list-inside space-y-1 leading-relaxed">
                    <li>
                      Ekspor proyek ini ke <strong>GitHub</strong>, atau unduh paket <code>.zip</code> di bawah lalu ekstrak dan unggah ke repositori GitHub Anda.
                    </li>
                    <li>
                      Di GitHub buka tab <strong>Actions</strong> → pilih <strong>Build SAG65 Android APK</strong> → tekan <strong>Run workflow</strong>.
                    </li>
                    <li>
                      Unduh hasil <strong>SAG65-Juken5-Android-APK</strong> di bagian <strong>Artifacts</strong> lalu instal <code>app-debug.apk</code>.
                    </li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => downloadGithubApkKitZip(appUrl)}
                    className="w-full min-h-[40px] px-3.5 rounded-xl border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Paket GitHub APK (.zip)</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#FF6B1A] hover:bg-[#F97316] text-slate-950 font-semibold text-sm transition-colors"
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
      className="fixed bottom-20 md:bottom-6 left-4 z-40 rounded-xl border border-amber-500/40 bg-white dark:bg-[#18202D] px-3.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Mode Offline · Koneksi Lokal &amp; Log Tetap Aktif</span>
    </div>
  );
};
