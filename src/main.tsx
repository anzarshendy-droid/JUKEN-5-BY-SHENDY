import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Ignore SW registration failure in restricted preview frames
    },
  });
}

class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {hasError: boolean; message: string}
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, message: ''};
  }

  static getDerivedStateFromError(err: Error) {
    return {hasError: true, message: err?.message || 'Terjadi kesalahan aplikasi.'};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0D12] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-red-500/40 bg-[#121720] p-6 space-y-4">
            <h1 className="text-lg font-semibold text-red-300">Terjadi Kendala Tampilan</h1>
            <p className="text-xs text-slate-300 font-mono break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 text-slate-950 font-semibold text-sm"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
