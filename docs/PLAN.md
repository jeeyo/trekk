# Trekk — GPX → Instagram portrait trek animation

## Context
The repo (`jeeyo/trekk`, branch `claude/gpx-trek-animation-plan-xak4fg`) is empty. We're building a website from scratch: the user uploads a GPX file from a trek and gets a 9:16 animation (1080×1920, 30 fps) of the route over 3D terrain and satellite imagery. They pick one of 8 presets, preview it, and download an MP4. It should use only open data, fix GPS problems (noise and drift, plus the China GCJ‑02/BD‑09 datum offset), and be cheap to host.

Decisions made: **render in the browser**, **Vite + React + TypeScript**, and **handle both** datum offset and noise. The GPX never leaves the user's device. Hosting is static files plus an optional tile-cache worker.

## Open data sources
| Layer | Primary (open) | Notes / fallback |
|---|---|---|
| Terrain (DEM) | **AWS Terrain Tiles** (Mapzen "terrarium" PNG, Registry of Open Data), `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Built from SRTM, GMTED, ETOPO1 and NED. Free, attribution required | **Mapterhorn** (open global terrain from Copernicus GLO‑30 and others, served as PMTiles) as a better-quality option. MapLibre reads terrarium natively as `raster-dem` with `encoding: "terrarium"` |
| Satellite | **EOX Sentinel‑2 cloudless 2016** WMTS (`tiles.maps.eox.at`, layer `s2cloudless_3857`). **CC BY 4.0**, about 10 m, global | The 2018–2024 EOX mosaics are **CC BY‑NC‑SA**, so they're fine for non-commercial use only. For full control: Sentinel‑2 L2A COGs from AWS Earth Search / Copernicus Data Space served by self-hosted **TiTiler**. **USGS NAIP** (1 m, public domain, US only) as a regional high-res layer |
| Vector basemap / trails / labels | **OpenFreeMap** or **Protomaps** PMTiles (OpenStreetMap data, ODbL) | Used for the "Topo" and "Night" presets and for auto-detecting the datum offset (matching the track to OSM paths) |
| Hillshade | Computed client-side by MapLibre `hillshade` layer from the same DEM | — |

Attribution text is generated per preset from the layers it uses and burned into the corner of the video, as the licences require.

## Architecture (all client-side)
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
- **Optional `tile-proxy`:** a Cloudflare Worker that caches EOX and terrain tiles at the edge, which spares the upstream servers and adds CORS headers where needed.

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
workers/tile-proxy/  # optional Cloudflare Worker
tests/            # vitest unit tests + Playwright e2e
```
Key dependencies: `maplibre-gl`, `pmtiles`, `@tmcw/togeojson` (GPX parsing), `@turf/*` (length, along, bearing, simplify), `mediabunny`, `@ffmpeg/ffmpeg` (lazy-loaded), `zustand` (state), `vitest`, `@playwright/test`.

## Milestones
1. **Scaffold:** Vite, React, TS, lint and format, vitest, Playwright, CI workflow.
2. **Track core:** parse, clean, datum, stats, with unit tests on the sample GPX files.
3. **Map scene:** MapLibre with terrarium terrain, EOX satellite and route line, plus a live preview with a scrub bar.
4. **Camera and presets:** camera path generator and the first 3 presets (Chase, Orbit, Topo).
5. **Export:** prefetch, deterministic frame loop, WebCodecs and Mediabunny MP4 download, progress and cancel.
6. **Remaining presets and overlays:** elevation chart, stats cards, safe areas, attribution.
7. **UX polish:** the track-fix panel (smoothing slider, datum override, nudge), ffmpeg.wasm fallback, mobile layout, tile-proxy worker, deploy to Cloudflare Pages.

## Verification
- `npm run test` (vitest):
  - GCJ‑02 round-trip error under 0.5 m against known reference pairs.
  - The spike filter removes injected outliers.
  - Elevation gain on a synthetic profile matches the expected value.
  - Datum auto-detect picks GCJ‑02 for the shifted China sample.
- `npm run e2e` (Playwright on the preinstalled Chromium, with `--use-gl=angle`/swiftshader): load the sample GPX, choose each preset, export a 5 s clip, and save the MP4. Then run `ffprobe` and check that it is 1080×1920 H.264, has the expected frame count and duration, and isn't blank (frame luminance variance is non-zero).
- Manual: `npm run dev`, upload real GPX files (including a Chinese app export), check alignment with the satellite imagery, then play the downloaded MP4 on a phone and upload it to Instagram as a test.
