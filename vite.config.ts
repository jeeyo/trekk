import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
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
