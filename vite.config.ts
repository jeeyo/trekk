import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev mirrors the container: /tiles/<source>/... is proxied to the upstream provider.
// Same env names as the container, so a dev setup can point at a mirror or cache.
const env = process.env;
const upstreams: Record<string, string> = {
  terrain: env.UPSTREAM_TERRAIN_URL ?? 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
  satellite:
    env.UPSTREAM_SATELLITE_URL ?? 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g',
  vector: env.UPSTREAM_VECTOR_URL ?? 'https://tiles.openfreemap.org',
};

const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Trekk — trek animations',
        short_name: 'Trekk',
        description: "Turn your trek's GPX into an Instagram-ready animation.",
        theme_color: '#0f1512',
        background_color: '#0f1512',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell, samples and preset thumbnails work offline; map tiles never go in the SW
        // cache (the server caches them) and the ~30 MB ffmpeg cores load on demand.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,gpx,json,webmanifest}'],
        globIgnores: ['**/ffmpeg-core*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/tiles\//, /^\/healthz/],
      },
    }),
  ],
  server: {
    headers: crossOriginIsolation,
    proxy: Object.fromEntries(
      Object.entries(upstreams).map(([name, target]) => [
        `/tiles/${name}`,
        {
          target,
          changeOrigin: true,
          rewrite: (p: string) => {
            const rest = p.replace(`/tiles/${name}`, '');
            // EOX WMTS uses {z}/{y}/{x}
            if (name === 'satellite') {
              const m = rest.match(/^\/(\d+)\/(\d+)\/(\d+)/);
              if (m) return `/${m[1]}/${m[3]}/${m[2]}.jpg`;
            }
            return rest;
          },
        },
      ]),
    ),
  },
  preview: { headers: crossOriginIsolation },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
