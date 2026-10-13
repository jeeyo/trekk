import { useEffect, useRef, useState } from 'react';
import { fitRoute } from '../../camera/fit';
import type { CameraState } from '../../camera/types';
import { Scene } from '../../map/scene';
import type { PresetConfig } from '../../presets/types';
import { attributionFor } from '../../map/sources';
import { drawOverlay } from '../../render/overlay';
import type { ProcessedTrack } from '../../track/pipeline';

export interface PreviewHandle {
  scene: Scene;
}

/**
 * 9:16 live preview. `cameraAt` maps animation time (0..1) to a camera; `progressAt` maps it
 * to route progress. Playback is real-time and best-effort; export renders frames exactly.
 */
export function MapPreview({
  track,
  preset,
  t,
  cameraAt,
  progressAt,
  onScene,
  overlay,
}: {
  track: ProcessedTrack;
  preset: PresetConfig;
  t: number;
  cameraAt?: (t: number) => CameraState;
  progressAt?: (t: number) => number;
  onScene?: (scene: Scene | undefined) => void;
  /** draw the video overlay on top (title, stats…) */
  overlay?: { title: string; units: 'metric' | 'imperial'; outroStart: number };
}) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene>();
  const [imageryMissing, setImageryMissing] = useState(false);

  useEffect(() => {
    const s = new Scene({ container: el.current!, preset, track });
    let alive = true;
    s.ready.then(() => alive && setScene(s));
    const check = setInterval(() => setImageryMissing(s.failedSources.has('satellite')), 1000);
    return () => {
      alive = false;
      clearInterval(check);
      setScene(undefined);
      s.destroy();
    };
  }, [track, preset]);

  useEffect(() => {
    onScene?.(scene);
    // Test hook: lets automation wait for tiles before capturing.
    (window as unknown as { __trekk?: { scene?: Scene } }).__trekk = { scene };
  }, [scene, onScene]);

  useEffect(() => {
    if (!scene) return;
    const cam = cameraAt
      ? cameraAt(t)
      : fitRoute(track.anim, { pitch: preset.camera.pitch, bearing: -20 });
    scene.setCamera(cam);
    const progress = progressAt ? progressAt(t) : t;
    scene.setProgress(progress);
    const c = overlayRef.current;
    if (c && overlay) {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);
      drawOverlay(ctx, w, h, {
        preset,
        track,
        title: overlay.title,
        units: overlay.units,
        t,
        progress,
        outroStart: overlay.outroStart,
        attribution: attributionFor(preset.base),
        project: (lon, lat, ele) => scene.project(lon, lat, ele),
      });
    }
  }, [scene, t, cameraAt, progressAt, track, preset, overlay]);

  return (
    <div className={`map-frame theme-${preset.overlays.theme}`}>
      <div
        ref={el}
        className="map"
        style={{ height: `${preset.mapHeight * 100}%` }}
        data-ready={scene ? 'true' : undefined}
      />
      {overlay && <canvas ref={overlayRef} className="overlay" />}
      {imageryMissing && (
        <div className="badge">Satellite imagery unavailable — showing terrain relief</div>
      )}
    </div>
  );
}
