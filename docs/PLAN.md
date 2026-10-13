# Trekk — GPX → Instagram portrait trek animation

## Context
The repo (`jeeyo/trekk`, branch `claude/gpx-trek-animation-plan-xak4fg`) is empty. We're building a website from scratch: the user uploads a GPX file from a trek and gets a 9:16 animation (1080×1920, 30 fps) of the route over 3D terrain and satellite imagery. They pick one of 8 presets, preview it, and download an MP4. It should use only open data, fix GPS problems (noise and drift, plus the China GCJ‑02/BD‑09 datum offset), and be cheap to host. It ships as a single Docker container.

Decisions made: **render in the browser**, **Vite + React + TypeScript**, **handle both** datum offset and noise, a **mobile-first UI**, and **one Docker container** that serves the app and runs a caching tile proxy. The GPX never leaves the user's device. The server only serves static files and map tiles.

## Open data sources
| Layer | Primary (open) | Notes / fallback |
|---|---|---|
| Terrain (DEM) | **AWS Terrain Tiles** (Mapzen "terrarium" PNG, Registry of Open Data), `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Built from SRTM, GMTED, ETOPO1 and NED. Free, attribution required | **Mapterhorn** (open global terrain from Copernicus GLO‑30 and others, served as PMTiles) as a better-quality option. MapLibre reads terrarium natively as `raster-dem` with `encoding: "terrarium"` |
| Satellite | **EOX Sentinel‑2 cloudless 2016** WMTS (`tiles.maps.eox.at`, layer `s2cloudless_3857`). **CC BY 4.0**, about 10 m, global | The 2018–2024 EOX mosaics are **CC BY‑NC‑SA**, so they're fine for non-commercial use only. For full control: Sentinel‑2 L2A COGs from AWS Earth Search / Copernicus Data Space served by self-hosted **TiTiler**. **USGS NAIP** (1 m, public domain, US only) as a regional high-res layer |
| Vector basemap / trails / labels | **OpenFreeMap** or **Protomaps** PMTiles (OpenStreetMap data, ODbL) | Used for the "Topo" and "Night" presets and for auto-detecting the datum offset (matching the track to OSM paths) |
| Hillshade | Computed client-side by MapLibre `hillshade` layer from the same DEM | — |

Attribution text is generated per preset from the layers it uses and burned into the corner of the video, as the licences require.

## Architecture (rendering in the browser, tiles served by our container)
```
GPX file ─► parse ─► clean (noise + datum) ─► derive (dist, gain, pace, time scaling)
        ─► preset config ─► MapLibre scene @1080×1920 ─► frame stepper
        ─► WebCodecs VideoEncoder (H.264) ─► Mediabunny MP4 mux ─► download
```
- **Map engine:** MapLibre GL JS v5 with `terrain`, a `sky`/fog layer and `preserveDrawingBuffer: true`. It renders into an offscreen container sized exactly 1080×1920, with devicePixelRatio forced to 1. The visible preview is a scaled-down copy.
- **Deterministic frame rendering** (not real-time screen capture): for frame *i*, compute camera and route progress for time *t = i/fps*, then `map.jumpTo(camera)`, update the route line source, `await map.once('idle')` so tiles and terrain are loaded, draw the map canvas plus the 2D overlay canvas (stats, elevation chart, title, attribution) onto a compositor canvas, then `new VideoFrame(compositor, {timestamp})` → `encoder.encode`. Quality doesn't depend on device speed. A slow device just takes longer.
- **Tile prefetch:** before rendering, walk the camera path, list the tiles each frame needs, and fetch them all up front with a progress bar. This avoids `idle` stalls mid-render.
- **Encoding:** WebCodecs `VideoEncoder` (`avc1.640028`, about 12 Mbps, keyframe every 2 s), muxed with **Mediabunny** (the successor to mp4-muxer) into a fast-start MP4. If WebCodecs or H.264 isn't available, fall back to **ffmpeg.wasm** fed with PNG frames (slower, with a warning).
- **Heavy work in Web Workers:** GPX parsing, cleaning, and computing the camera path.
- **Tiles come from our own server:** the app requests every tile from `/tiles/<source>/{z}/{x}/{y}` on its own origin, and the container's caching proxy fetches it from the upstream provider once. See the next section.

## Mobile-first UI
Most users will come straight from their phone after the hike, so we design for a 360–430 px wide portrait screen first and scale up for desktop.
- **One-column, step-by-step flow:** Upload → Fix track → Pick preset → Preview → Export. A sticky bottom action bar keeps the primary button within thumb reach.
- **Upload:** a large tap target that opens the file picker (`accept=".gpx,application/gpx+xml"`) and also handles iOS Files and Android "Share to" sources. Drag and drop is added on desktop only.
- **Preset picker:** a horizontally swipeable carousel of 9:16 cards. Each card shows a short looping preview bundled with the site, so nothing renders before the user picks.
- **Preview:** a 9:16 player at full width, with a large scrub bar and play/pause. Preview runs at reduced resolution and frame rate to save battery.
- **Track-fix panel:** a bottom sheet holding the smoothing slider, the datum override chips and a nudge mode where the user drags the track with one finger.
- **Export on phones:**
  - Pick the output size from device capability: 1080×1920 where WebGL max texture size and memory allow, and 720×1280 otherwise. Show the chosen size.
  - Keep the screen awake with the Screen Wake Lock API, and warn that switching apps pauses rendering.
  - When the video is ready, share it straight to Instagram or other apps with `navigator.share({ files })` (Web Share API Level 2), and keep a normal download as the fallback.
- **Browser support targets:** iOS Safari 16.4+ and Chrome for Android, which both have WebCodecs `VideoEncoder`. Older browsers get the ffmpeg.wasm path or a clear "please update your browser" message.
- **Accessibility and touch:** tap targets at least 44 px, respect `prefers-reduced-motion` in the UI chrome, support dark mode, and handle safe-area insets (`env(safe-area-inset-*)`).
- **Installable PWA:** add a manifest and service worker (`vite-plugin-pwa`) so the app shell and preset previews load offline on the trail. Map tiles still need a connection at render time.

## Server and tile cache (Docker)
One container, built and run the same way everywhere (laptop, VPS or any container host).
- **Image:** a multi-stage `Dockerfile`. Stage 1 (`node:22-alpine`) runs `npm ci && npm run build`. Stage 2 (`nginx:1.27-alpine`) copies `dist/` and the nginx config templates. It runs as a non-root user, with a `HEALTHCHECK` on `/healthz`.
- **nginx serves:**
  - `/`: the built SPA, with hashed assets cached for a year (`immutable`) and `index.html` set to `no-cache`. Unknown paths fall back to `index.html`.
  - `/tiles/<source>/{z}/{x}/{y}`: a reverse proxy to an **allow-list** of upstreams: `terrain` (AWS terrarium), `satellite` (EOX s2cloudless), `vector` (OpenFreeMap). It is never a general open proxy.
- **Tile cache:**
  - `proxy_cache` on a mounted volume (`/var/cache/trekk`), with a configurable maximum size (default 20 GB) and LRU eviction. Tiles are kept for 30 days.
  - `proxy_cache_lock` so many clients asking for the same tile cause only one upstream request.
  - `proxy_cache_use_stale` (`error timeout updating`) with background update, so a slow or down provider doesn't break rendering.
  - An `X-Cache-Status` response header for debugging.
  - If we later add PMTiles sources such as Mapterhorn, use the `slice` module so HTTP range requests are cached properly.
- **Abuse limits and upstream etiquette:**
  - Per-IP rate limits (`limit_req`) on `/tiles`, and z/x/y values are checked with a regex. Requests outside the allow-list or zoom range get a 404.
  - Requests to the providers carry an identifying `User-Agent` with a contact address.
- **Headers:**
  - Because tiles are now same-origin, we can send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. That turns on `SharedArrayBuffer`, so the ffmpeg.wasm fallback can use the faster multi-threaded core.
  - Also send a Content-Security-Policy, gzip/brotli compression for app assets, and the correct `Content-Type` for `.wasm`.
- **Configuration:** environment variables are applied through nginx's built-in `/etc/nginx/templates` envsubst: `TILE_CACHE_MAX_SIZE`, `TILE_CACHE_TTL`, `UPSTREAM_TERRAIN_URL`, `UPSTREAM_SATELLITE_URL`, `UPSTREAM_VECTOR_URL`, `RATE_LIMIT`. That lets us swap in TiTiler or Mapterhorn later without rebuilding. Only the tile *source names* are compiled into the app, never upstream URLs.
- **`docker-compose.yml`:** the `trekk` service, plus a named volume for the tile cache and a port mapping (`8080:8080`). It's ready to sit behind an existing TLS reverse proxy. The plan doesn't choose a TLS solution: the host's proxy or a Caddy sidecar can terminate HTTPS. HTTPS is required for WebCodecs, Web Share and the service worker.
- **CI:** GitHub Actions runs lint, unit tests and `docker build` on every PR. On `main` (and version tags), it builds and pushes the image to GHCR (`ghcr.io/jeeyo/trekk`).
- **Local development:** `npm run dev` uses Vite's `server.proxy` to map `/tiles/*` straight to the upstreams, so the frontend code doesn't change between development and the container.

## GPS cleanup pipeline (`src/track/`)
1. **Parse** (`parseGpx.ts`): read `trk/trkseg/trkpt` (and fall back to `rte/rtept`) with `ele` and `time`. Multiple segments are kept and gaps between them marked. FIT/KML can come later.
2. **Noise / AGPS drift** (`clean.ts`):
   - Drop invalid points (0,0; NaN; duplicate timestamps; timestamps that go backwards).
   - **Cold-start trim:** remove the first and last N points while they're still converging (big spread, then a sudden settle).
   - **Speed outlier filter:** drop a point if the implied speed to its neighbours is above a threshold (default 25 km/h for trekking) and the point bounces back afterwards (spike detection).
   - **Pause clustering:** jitter while stationary (breaks, camp) collapses to one point, so the line doesn't scribble.
   - **Smoothing:** a constant-velocity Kalman filter (forward-backward RTS smoother) on local ENU metres, with a user-adjustable strength.
   - **Elevation:** replace or blend GPS altitude with DEM-sampled elevation (decode the terrarium tiles), then apply a median filter. Elevation gain uses a 3–5 m hysteresis.
   - **Resample** at uniform distance (for example 5 m) for animation, then Douglas–Peucker for drawing the line.
3. **Datum shift** (`datum.ts`):
   - Implement `gcj02ToWgs84` (iterative inverse), `bd09ToGcj02` and the forward versions, with a "point inside mainland China" polygon test. Hong Kong, Macau and Taiwan are excluded.
   - **Auto-detect:** if the track is inside China, make WGS‑84, GCJ‑02→WGS and BD‑09→WGS candidates. For each one, score how well it fits nearby OSM `highway=path|track|footway` lines from the vector tiles (median distance from points to paths) and pick the best. Show "We detected a GCJ‑02 offset and corrected it" so the user can change it.
   - **Manual nudge:** the user can drag to apply a metre-level offset over the satellite layer, as a last resort for any area.

## Animation presets (`src/presets/*.ts`)
Each preset is a declarative `PresetConfig`: base style, terrain exaggeration, camera mode with its parameters, line style, overlays, default duration (15/30/60 s) and an easing/time-warp function. The renderer is generic. Planned set (8):
1. **Chase Cam:** satellite plus 3D terrain, camera behind the hiker at pitch 60°, bearing smoothed along the direction of travel.
2. **Drone Orbit:** the camera slowly orbits the moving head of the line while the route draws.
3. **Fly‑in Reveal:** starts at a high zoom-out of the region, dives onto the trailhead, follows the route, then pulls back to show the whole route.
4. **Elevation Story:** map in the top 65%, animated elevation profile below with a moving marker and live altitude, distance and gain counters.
5. **Topo Classic:** top-down 2D OSM topo with hillshade and contours, a dashed line drawing in, and a clean stats card at the end.
6. **Night Glow:** dark vector style with dimmed hillshade and a glowing neon line with a fading trail.
7. **Summit Push:** time-warp that speeds through flat sections and slows on climbs, with a summit callout (highest point and name from OSM `natural=peak` if one is nearby).
8. **Minimal Line Art:** no imagery, just a monochrome hillshade, a thin line, a title and the date. Typography-first.

Shared overlays: trip title (editable), date, distance, duration, elevation gain, max altitude, units toggle (metric/imperial), a safe-area-aware layout for the Instagram Reels UI (keep text out of the top 220 px and bottom 380 px), and attribution.

## Project layout
```
package.json  vite.config.ts  tsconfig.json  index.html
src/
  app/            # React UI: Upload, PresetPicker, Preview, ExportDialog, TrackFixPanel
  track/          # parseGpx.ts, clean.ts, kalman.ts, datum.ts, elevation.ts, stats.ts, resample.ts
  map/            # sources.ts (tile URLs + attributions), styles/*.json, scene.ts (MapLibre setup)
  camera/         # path.ts (camera keyframes per mode), easing.ts, timewarp.ts
  render/         # frameLoop.ts, prefetch.ts, compositor.ts, overlays/*.ts (canvas 2D)
  encode/         # webcodecs.ts (VideoEncoder + Mediabunny), ffmpegFallback.ts
  presets/        # index.ts + one file per preset
  workers/        # track.worker.ts
public/samples/   # sample GPX files (Alps, Himalaya, a China route in GCJ-02, a noisy one)
docker/
  nginx/templates/default.conf.template  # SPA, /tiles proxy + cache, headers, rate limits
Dockerfile  docker-compose.yml  .dockerignore
.github/workflows/  # ci.yml (lint, test, docker build), release.yml (push image to GHCR)
tests/            # vitest unit tests + Playwright e2e
```
Key dependencies: `maplibre-gl`, `pmtiles`, `@tmcw/togeojson` (GPX parsing), `@turf/*` (length, along, bearing, simplify), `mediabunny`, `@ffmpeg/ffmpeg` (lazy-loaded), `zustand` (state), `vitest`, `@playwright/test`.

## Milestones
1. **Scaffold:** Vite, React, TS, lint and format, vitest, Playwright, Dockerfile and nginx config with the `/tiles` cache, compose file and CI. `docker compose up` serves a "hello" page plus cached tiles from day one.
2. **Track core:** parse, clean, datum, stats, with unit tests on the sample GPX files.
3. **Map scene and mobile shell:** MapLibre with terrarium terrain, EOX satellite and route line, loaded through `/tiles`. The mobile step flow and a live preview with a scrub bar.
4. **Camera and presets:** camera path generator and the first 3 presets (Chase, Orbit, Topo).
5. **Export:** prefetch, deterministic frame loop, WebCodecs and Mediabunny MP4 download, progress and cancel.
6. **Remaining presets and overlays:** elevation chart, stats cards, safe areas, attribution.
7. **UX polish and hardening:** the track-fix bottom sheet (smoothing slider, datum override, nudge), Web Share export, wake lock, the 720p fallback, multi-threaded ffmpeg.wasm fallback, PWA, desktop layout, and tuning of rate limits and cache sizes.

## Verification
- `npm run test` (vitest):
  - GCJ‑02 round-trip error under 0.5 m against known reference pairs.
  - The spike filter removes injected outliers.
  - Elevation gain on a synthetic profile matches the expected value.
  - Datum auto-detect picks GCJ‑02 for the shifted China sample.
- `npm run e2e` (Playwright on the preinstalled Chromium, with `--use-gl=angle`/swiftshader): load the sample GPX, choose each preset, export a 5 s clip, and save the MP4. Then run `ffprobe` and check that it is 1080×1920 H.264, has the expected frame count and duration, and isn't blank (frame luminance variance is non-zero).
- Playwright mobile projects (iPhone 14 and Pixel 7 device emulation): run the full upload → preset → export flow at 390 px width, with no horizontal scroll and the primary actions visible without scrolling.
- Container checks:
  - `docker build` succeeds and `docker compose up` passes the health check.
  - Requesting the same tile twice with `curl -I /tiles/terrain/10/545/361` returns `X-Cache-Status: MISS`, then `HIT`.
  - A source not on the allow-list returns 404, and a burst of requests gets 429.
  - Responses carry the COOP/COEP headers.
  - The Playwright e2e suite passes when run against the container (`BASE_URL=http://localhost:8080`).
- Manual: `npm run dev`, upload real GPX files (including a Chinese app export), check alignment with the satellite imagery, then on a real iPhone (Safari) and Android phone (Chrome) export from the container behind HTTPS, share the MP4 to Instagram, and post it as a test.
