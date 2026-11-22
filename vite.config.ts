import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'screenshot-mobile.png',
          'screenshot-wide.png',
        ],
        manifest: {
          id: '/',
          name: 'SAG65 Juken 5+',
          short_name: 'SAG65',
          description: 'SAG65 — Dasbor telemetri real-time dan data logger ECU BRT Juken 5+ via Bluetooth.',
          lang: 'id',
          dir: 'ltr',
          theme_color: '#090C10',
          background_color: '#090C10',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          launch_handler: {
            client_mode: 'focus-existing',
          },
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['utilities', 'productivity'],
          prefer_related_applications: false,
          shortcuts: [
            {
              name: 'Dasbor Live ECU',
              short_name: 'Dasbor',
              description: 'Buka dasbor instrumen telemetri real-time',
              url: '/?tab=dashboard',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Drag Timer GPS 201/402m',
              short_name: 'Drag GPS',
              description: 'Catat waktu drag 201m dan 402m berbasis GPS',
              url: '/?tab=drag',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Grafik Analisis',
              short_name: 'Grafik',
              description: 'Analisis grafik RPM vs AFR dan sensor ECU',
              url: '/?tab=analytics',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Koneksi BLE & USB',
              short_name: 'Koneksi',
              description: 'Hubungkan Bluetooth BLE atau kabel USB COM Windows',
              url: '/?tab=connection',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: '/screenshot-mobile.png',
              sizes: '540x960',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Dasbor Telemetri Smartphone SAG65 Juken 5+',
            },
            {
              src: '/screenshot-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Tampilan Kokpit Windows & Grafik SAG65 Juken 5+',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
