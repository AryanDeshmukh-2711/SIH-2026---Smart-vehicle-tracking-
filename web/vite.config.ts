import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const root = process.cwd();
const shared = (file: string) => path.resolve(root, '../packages/shared/src', file);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            // Basemap tiles are cached so downloaded offline packs have something to draw on.
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'himgati-basemap',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The GTFS-static-style bundle is the app's offline backbone: routes,
            // stops and timetables. Serve it from cache first, refresh in the
            // background, so a cold start with no signal still has a network map.
            urlPattern: /\/api\/v1\/bundle$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'himgati-static-bundle',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'HimGati — Smart Transit for Himachal',
        short_name: 'HimGati',
        description:
          'Real-time bus tracking, journey planning and tourism discovery for Himachal Pradesh.',
        theme_color: '#0F6B62',
        background_color: '#F6F7F9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    // Array form so the longer shared subpaths are matched before the bare
    // package name and before the '@' app alias.
    alias: [
      { find: '@himgati/shared/data', replacement: shared('data/index.ts') },
      { find: '@himgati/shared/types', replacement: shared('types.ts') },
      { find: '@himgati/shared/eta', replacement: shared('eta.ts') },
      { find: '@himgati/shared/green', replacement: shared('green.ts') },
      { find: '@himgati/shared/geo', replacement: shared('geo.ts') },
      { find: '@himgati/shared', replacement: shared('index.ts') },
      { find: '@', replacement: path.resolve(root, 'src') },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Map and animation libraries are the two heavy dependencies; splitting
        // them keeps the first paint on a weak hill connection reasonable.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          map: ['leaflet', 'react-leaflet'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Same-origin in development, so cookies and the service worker behave the
      // way they will in production behind Nginx.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
