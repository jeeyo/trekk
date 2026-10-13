# Trekk

Turn a GPX from a trek into an Instagram-ready 9:16 animation (1080×1920 MP4) on real 3D terrain.
Everything is rendered in the browser; the GPX never leaves the device. The server is a single
Docker container that serves the app and caches map tiles.

See [`docs/PLAN.md`](docs/PLAN.md) for the full design and [`docs/progress/`](docs/progress) for
milestone screenshots.

## Features

- **GPS cleanup**: invalid fixes, cold-start convergence, out-and-back excursions (multipath/AGPS
  jumps), speed spikes, stationary jitter, Kalman RTS smoothing, DEM-corrected elevation.
- **China datums**: detects GCJ-02 / BD-09 tracks (by matching OpenStreetMap paths, or from the
  recording app) and converts them to WGS-84; manual nudge as a last resort.
- **8 presets**: Chase Cam, Drone Orbit, Fly-in Reveal, Elevation Story, Topo Classic, Night Glow,
  Summit Push, Minimal Line Art.
- **Deterministic export**: each frame waits for its tiles, then is encoded with WebCodecs
  (H.264 where the device supports it; otherwise VP9 → H.264 via ffmpeg.wasm).
- **Mobile-first** step flow: Upload → Track → Style → Preview → Export.

## Open data

| Layer | Source | Licence |
|---|---|---|
| Terrain | AWS Terrain Tiles (Mapzen terrarium) | Attribution |
| Satellite | EOX Sentinel-2 cloudless 2016 | CC BY 4.0 |
| Basemap | OpenFreeMap (OpenStreetMap) | ODbL |

Attribution is burned into every video.

## Run it

```sh
docker compose up --build        # http://localhost:8080
```

Put it behind your own TLS reverse proxy (HTTPS is required for WebCodecs, Web Share and the
service worker) and set `TRUSTED_PROXY_CIDR` to the proxy's address range so rate limits see real
client IPs.

### Container configuration

| Variable | Default | |
|---|---|---|
| `TILE_CACHE_MAX_SIZE` | `20g` | tile cache size on the `/var/cache/trekk` volume |
| `TILE_CACHE_TTL` | `30d` | how long unused tiles are kept |
| `RATE_LIMIT` / `RATE_BURST` | `60r/s` / `400` | per-client tile rate limit |
| `TRUSTED_PROXY_CIDR` | `127.0.0.1/32` | where `X-Forwarded-For` is trusted from |
| `UPSTREAM_TERRAIN_URL` | AWS terrarium | swap for a mirror or Mapterhorn |
| `UPSTREAM_SATELLITE_URL` | EOX s2cloudless 2016 | e.g. a self-hosted TiTiler |
| `UPSTREAM_VECTOR_URL` | `https://tiles.openfreemap.org` | |
| `CONTACT` | repo URL | sent in the upstream `User-Agent` |

Building behind a TLS-inspecting proxy: `docker build --secret id=extra_ca,src=ca.crt .`

## Develop

```sh
npm ci
npm run dev          # Vite; /tiles/* is proxied to the same upstreams (UPSTREAM_* env vars apply)
npm test             # unit tests (vitest)
npm run lint && npm run typecheck
npm run samples      # regenerate public/samples/*.gpx from the real DEM (needs network)
```

`scripts/progress-m*.ts` drive the app in headless Chromium (Playwright) and capture the progress
screenshots; `?debug=track` shows the GPS cleanup debug view and `?clip=5` exports a 5 s test clip.

## Verification

- `npm test` — 24 unit tests (GPX parsing, GCJ-02/BD-09 transforms and auto-detection, spike /
  cold-start / jitter cleanup, Kalman smoothing, elevation gain, camera timelines).
- `npm run e2e` — Playwright on iPhone 14 and Pixel 7 profiles (upload → track → style → preview,
  track-fix sheet). `E2E_EXPORT=1` adds a full MP4 export (slow on machines without a GPU).
- Exports were verified end to end in headless Chromium: 1080×1920 H.264 High, 30 fps, correct
  frame count (`ffprobe`), see `docs/progress/m5-*`.

Headless/CI notes: software WebGL is ~100× slower than a phone GPU, and open-source Chromium has no
H.264 encoder, so exports there use the VP9 → ffmpeg.wasm path. `?res=540`, `?noaa` and `?nowarm`
make test exports finish quickly.
