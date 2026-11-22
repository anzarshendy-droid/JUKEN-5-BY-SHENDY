import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { LogSession } from '../types/telemetry';
import { exportSessionToCSV } from '../utils/logStorage';
import {
  buildAndroidBuildConfigJson,
  buildMobileLauncherHtml,
  deleteDriveFile,
  downloadDriveFileText,
  DriveFileItem,
  ensureSag65Folder,
  getCachedDriveToken,
  initDriveAuth,
  listSag65DriveFiles,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  uploadFileToDrive,
} from '../utils/googleDrive';
import { GoogleSignInButton } from './GoogleSignInButton';
import { CloudUpload, ExternalLink, FolderOpen, LogOut, RefreshCw, Smartphone, Trash2 } from 'lucide-react';

interface GoogleDrivePanelProps {
  mode: 'installer' | 'logs';
  sessions?: LogSession[];
  onImportFromDrive?: (filename: string, text: string) => Promise<void>;
}

export const GoogleDrivePanel: React.FC<GoogleDrivePanelProps> = ({
  mode,
  sessions = [],
  onImportFromDrive,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getCachedDriveToken());
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string>(sessions[0]?.id || '');
  const [deleteTarget, setDeleteTarget] = useState<DriveFileItem | null>(null);

  const refreshFiles = useCallback(async (accessToken: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await listSag65DriveFiles(accessToken);
      setFiles(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat file Google Drive.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = initDriveAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
        refreshFiles(t);
      },
      () => {
        setUser(null);
        setToken(null);
        setFiles([]);
      }
    );
    return () => unsub();
  }, [refreshFiles]);

  useEffect(() => {
    if (!selectedLogId && sessions.length > 0) {
      setSelectedLogId(sessions[0].id);
    }
  }, [sessions, selectedLogId]);

  const handleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await signInWithGoogleDrive();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        await refreshFiles(res.accessToken);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        setErrorMsg('Pop-up login diblokir browser. Izinkan pop-up atau buka aplikasi di tab browser baru.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg('Domain preview belum terdaftar untuk login pop-up. Buka melalui tab baru pada URL aplikasi Anda.');
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Login Google dibatalkan.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke akun Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogleDrive();
    setUser(null);
    setToken(null);
    setFiles([]);
    setSuccessMsg(null);
  };

  const handleUploadInstallerToDrive = async () => {
    if (!token) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyMsg('Mengirim peluncur HP & konfigurasi Android ke Google Drive...');
    try {
      const folderId = await ensureSag65Folder(token);
      const rawOrigin =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://ais-pre-ehcgorabdkd7svhl2ahsou-494385704911.asia-northeast1.run.app';
      const appUrl = rawOrigin.replace('https://ais-dev-', 'https://ais-pre-');

      await uploadFileToDrive(
        token,
        'SAG65_Buka_Di_HP.html',
        buildMobileLauncherHtml(appUrl),
        'text/html',
        folderId
      );

      await uploadFileToDrive(
        token,
        'sag65-android-apk-config.json',
        buildAndroidBuildConfigJson(appUrl),
        'application/json',
        folderId
      );

      await refreshFiles(token);
      setSuccessMsg(
        'Berhasil! Buka folder "SAG65 Juken 5+" di Google Drive pada HP Anda, lalu buka SAG65_Buka_Di_HP.html di Chrome untuk instal langsung.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah ke Google Drive.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleUploadLogToDrive = async () => {
    if (!token) return;
    const session = sessions.find((s) => s.id === selectedLogId) || sessions[0];
    if (!session) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyMsg(`Mengunggah "${session.name}" ke Google Drive...`);
    try {
      const folderId = await ensureSag65Folder(token);
      const csv = exportSessionToCSV(session);
      const safeName = session.name.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
      await uploadFileToDrive(
        token,
        `${safeName}.csv`,
        csv,
        'text/csv',
        folderId
      );
      await refreshFiles(token);
      setSuccessMsg(`Log "${safeName}.csv" berhasil dicadangkan ke Google Drive.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencadangkan log ke Drive.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleImportDriveFile = async (file: DriveFileItem) => {
    if (!token || !onImportFromDrive) return;
    setErrorMsg(null);
    setBusyMsg(`Mengunduh ${file.name} dari Google Drive...`);
    try {
      const text = await downloadDriveFileText(token, file.id);
      await onImportFromDrive(file.name, text);
      setSuccessMsg(`Berhasil memuat "${file.name}" ke Analisis Grafik.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengimpor file dari Drive.');
    } finally {
      setBusyMsg(null);
    }
  };

  const handleConfirmDeleteDriveFile = async () => {
    if (!token || !deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusyMsg(`Menghapus ${target.name} dari Google Drive...`);
    setErrorMsg(null);
    try {
      await deleteDriveFile(token, target.id);
      await refreshFiles(token);
      setSuccessMsg(`File "${target.name}" telah dihapus dari Google Drive.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus file di Drive.');
    } finally {
      setBusyMsg(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-semibold text-slate-100">
            {mode === 'installer'
              ? 'Kirim ke Google Drive & Persiapan APK Android'
              : 'Cadangkan & Sinkronkan Log ke Google Drive'}
          </h3>
          <p className="text-xs text-slate-400">
            {mode === 'installer'
              ? 'Simpan tautan instalasi HP dan konfigurasi build APK Android (TWA/Capacitor) ke folder "SAG65 Juken 5+" di Google Drive Anda.'
              : 'Simpan hasil logging dyno/perjalanan langsung ke Google Drive Anda agar mudah dibuka di perangkat lain.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!token ? (
            <GoogleSignInButton onClick={handleSignIn} disabled={loading} />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 truncate max-w-[160px]">
                {user?.email || 'Google Drive Terhubung'}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                title="Keluar dari Google Drive"
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-3 text-xs text-emerald-300">
          {successMsg}
        </div>
      )}

      {busyMsg && (
        <div className="rounded-xl border border-sky-500/35 bg-sky-950/20 p-3 text-xs text-sky-300">
          {busyMsg}
        </div>
      )}

      {token && (
        <div className="space-y-3 pt-1">
          {mode === 'installer' ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUploadInstallerToDrive}
                disabled={!!busyMsg}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <CloudUpload className="w-4 h-4" />
                <span>Simpan Peluncur HP &amp; Config APK ke Drive</span>
              </button>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Buka Google Drive</span>
              </a>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedLogId}
                onChange={(e) => setSelectedLogId(e.target.value)}
                className="flex-1 min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-orange-500"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.frames.length} sampel)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleUploadLogToDrive}
                disabled={!!busyMsg || sessions.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <CloudUpload className="w-4 h-4" />
                <span>Upload Log CSV ke Drive</span>
              </button>
            </div>
          )}

          {/* Drive Folder File List */}
          <div className="rounded-xl border border-white/[0.07] bg-black/25 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-orange-400" />
                <span>Isi Folder Google Drive: SAG65 Juken 5+</span>
              </span>
              <button
                type="button"
                onClick={() => refreshFiles(token)}
                disabled={loading}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Muat Ulang</span>
              </button>
            </div>

            {files.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Belum ada file di folder SAG65 Juken 5+ pada Google Drive Anda.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {files.map((f) => {
                  const isLogFile = /\.(csv|json)$/i.test(f.name) && !f.name.includes('apk-config');
                  return (
                    <div
                      key={f.id}
                      className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {f.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {f.modifiedTime
                            ? new Date(f.modifiedTime).toLocaleString('id-ID')
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isLogFile && onImportFromDrive && (
                          <button
                            type="button"
                            onClick={() => handleImportDriveFile(f)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-200 whitespace-nowrap"
                          >
                            Buka di Grafik
                          </button>
                        )}
                        {f.webViewLink && (
                          <a
                            href={f.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Lihat</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          title="Hapus dari Google Drive"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal for Destructive Drive Operations */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-[#121720] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-100">
              Hapus File dari Google Drive?
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Anda akan menghapus file <strong>{deleteTarget.name}</strong> dari folder <em>SAG65 Juken 5+</em> di Google Drive Anda. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[42px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDriveFile}
                className="min-h-[42px] px-4 rounded-xl bg-red-500 hover:bg-red-400 text-xs font-semibold text-white"
              >
                Ya, Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
