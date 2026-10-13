/**
 * Deterministic export: every frame is rendered from the shared timeline, we wait until the map
 * has all tiles for that exact camera, composite the overlay and hand the frame to the encoder.
 * A slow phone simply takes longer; the video is identical.
 */
import { buildTimeline } from '../camera/path';
import { createSink, pickCodec } from '../encode/encoder';
import { Scene } from '../map/scene';
import { attributionFor } from '../map/sources';
import type { PresetConfig } from '../presets/types';
import type { ProcessedTrack } from '../track/pipeline';
import { drawOverlay } from './overlay';

export type ExportPhase = 'prepare' | 'tiles' | 'frames' | 'transcode' | 'done';

export interface ExportOptions {
  track: ProcessedTrack;
  preset: PresetConfig;
  title: string;
  units: 'metric' | 'imperial';
  width: number;
  height: number;
  fps?: number;
  /** override the preset duration (seconds) */
  durationS?: number;
  signal?: AbortSignal;
  onProgress?: (phase: ExportPhase, fraction: number) => void;
}

export interface ExportResult {
  blob: Blob;
  codec: string;
  transcoded: boolean;
  frames: number;
  width: number;
  height: number;
  seconds: number;
  /** sources that failed to load while rendering (e.g. imagery provider down) */
  missingSources: string[];
}

export class ExportUnsupportedError extends Error {}

const DEBUG = typeof location !== 'undefined' && location.search.includes('debugExport');

const aborted = (s?: AbortSignal) => {
  if (s?.aborted) throw new DOMException('Export cancelled', 'AbortError');
};

/** 1080p unless the device looks too small for it. */
export function chooseResolution(): { width: number; height: number } {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  let maxSize = 4096;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl)
      maxSize = Math.min(
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      );
  } catch {
    // ignore
  }
  if ((mem !== undefined && mem < 3) || maxSize < 2048) return { width: 720, height: 1280 };
  return { width: 1080, height: 1920 };
}

export async function exportVideo(o: ExportOptions): Promise<ExportResult> {
  const fps = o.fps ?? 30;
  const preset = o.durationS ? { ...o.preset, durationS: o.durationS } : o.preset;
  const frames = Math.round(preset.durationS * fps);
  const { width: W, height: H } = o;
  const report = o.onProgress ?? (() => {});
  report('prepare', 0);

  const codec = await pickCodec(W, H);
  if (!codec)
    throw new ExportUnsupportedError('This browser cannot encode video (WebCodecs missing).');

  // Off-screen map laid out like the phone preview (360 CSS px wide) and rendered at
  // W/360 pixel ratio, so line weights, markers and framing match what the user previewed.
  const ratio = W / 360;
  const cssW = 360;
  const cssH = Math.round((H / ratio) * preset.mapHeight);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${cssW + 100}px;top:0;width:${cssW}px;height:${cssH}px;pointer-events:none;`;
  document.body.appendChild(host);
  const scene = new Scene({ container: host, preset, track: o.track, pixelRatio: ratio });
  const timeline = buildTimeline(o.track.anim, preset);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const attribution = attributionFor(preset.base);
  const sink = await createSink(canvas, { ...codec, fps });

  const setFrame = (t: number) => {
    scene.setCamera(timeline.cameraAt(t));
    scene.setProgress(timeline.progressAt(t));
  };

  try {
    await scene.ready;
    aborted(o.signal);

    // Warm the tile cache along the whole camera path.
    const step = Math.max(1, Math.round(fps / 2));
    const warm = !(typeof location !== 'undefined' && location.search.includes('nowarm'));
    for (let i = 0; warm && i <= frames; i += step) {
      aborted(o.signal);
      setFrame(i / frames);
      const t0 = performance.now();
      await scene.idle(60000);
      if (DEBUG) {
        const m = scene.map;
        const pending = Object.keys(m.getStyle().sources).filter((id) => !m.isSourceLoaded(id));
        console.log(
          `[export] warm ${i} idle ${Math.round(performance.now() - t0)}ms pending=${pending.join(',')}`,
        );
      }
      report('tiles', i / frames);
    }

    for (let i = 0; i < frames; i++) {
      aborted(o.signal);
      const t = frames > 1 ? i / (frames - 1) : 0;
      setFrame(t);
      const t0 = performance.now();
      await scene.idle(60000);
      if (DEBUG) {
        const m = scene.map;
        const pending = Object.keys(m.getStyle().sources).filter((id) => !m.isSourceLoaded(id));
        console.log(
          `[export] frame ${i} idle ${Math.round(performance.now() - t0)}ms tiles=${m.areTilesLoaded()} pending=${pending.join(',')}`,
        );
      }
      ctx.fillStyle = preset.overlays.theme === 'dark' ? '#0b0f0d' : '#f3f1ea';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(scene.canvas, 0, 0, W, Math.round(H * preset.mapHeight));
      drawOverlay(ctx, W, H, {
        preset,
        track: o.track,
        title: o.title,
        units: o.units,
        t,
        progress: timeline.progressAt(t),
        outroStart: 1 - timeline.outro,
        attribution,
        project: (lon, lat, ele) => scene.project(lon, lat, ele),
      });
      await sink.add(i / fps, 1 / fps, i % (fps * 2) === 0);
      report('frames', (i + 1) / frames);
    }
    let bytes = await sink.finish();
    let transcoded = false;
    if (sink.needsTranscode) {
      report('transcode', 0);
      const { transcodeToH264 } = await import('../encode/ffmpegTranscode');
      bytes = await transcodeToH264(bytes, {
        signal: o.signal,
        onProgress: (f) => report('transcode', f),
      });
      transcoded = true;
    }
    report('done', 1);
    return {
      blob: new Blob([bytes as BlobPart], { type: 'video/mp4' }),
      codec: transcoded ? `h264 (via ${sink.codec})` : sink.codec,
      transcoded,
      frames,
      width: W,
      height: H,
      seconds: preset.durationS,
      missingSources: [...scene.failedSources],
    };
  } catch (e) {
    await sink.cancel().catch(() => {});
    throw e;
  } finally {
    scene.destroy();
    host.remove();
  }
}
