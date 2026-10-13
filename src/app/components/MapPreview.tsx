import { useEffect, useRef, useState } from 'react';
import { fitRoute } from '../../camera/fit';
import type { CameraState } from '../../camera/types';
import { Scene } from '../../map/scene';
import type { PresetConfig } from '../../presets/types';
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
}: {
  track: ProcessedTrack;
  preset: PresetConfig;
  t: number;
  cameraAt?: (t: number) => CameraState;
  progressAt?: (t: number) => number;
  onScene?: (scene: Scene | undefined) => void;
}) {
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
    scene.setProgress(progressAt ? progressAt(t) : t);
  }, [scene, t, cameraAt, progressAt, track, preset]);

  return (
    <div className="map-frame">
      <div ref={el} className="map" data-ready={scene ? 'true' : undefined} />
      {imageryMissing && (
        <div className="badge">Satellite imagery unavailable — showing terrain relief</div>
      )}
    </div>
  );
}
