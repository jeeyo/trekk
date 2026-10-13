import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chooseResolution,
  exportVideo,
  ExportUnsupportedError,
  type ExportPhase,
  type ExportResult,
} from '../../render/exporter';
import { useStore } from '../store';
import { usePresetTimeline } from '../usePreset';

const PHASE_LABEL: Record<ExportPhase, string> = {
  prepare: 'Getting ready…',
  tiles: 'Loading terrain & imagery',
  frames: 'Rendering frames',
  transcode: 'Converting to H.264 for Instagram',
  done: 'Done',
};

function slug(s: string) {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'trek'
  );
}

export function ExportStep() {
  const { track, preset } = usePresetTimeline();
  const title = useStore((s) => s.title);
  const units = useStore((s) => s.units);
  const res = useMemo(() => {
    // Debug: ?res=540 forces a smaller size (used by automated checks on GPU-less machines).
    const forced = Number(new URLSearchParams(location.search).get('res'));
    return forced ? { width: forced, height: Math.round((forced * 16) / 9) } : chooseResolution();
  }, []);
  const [phase, setPhase] = useState<ExportPhase>();
  const [frac, setFrac] = useState(0);
  const [result, setResult] = useState<ExportResult>();
  const [error, setError] = useState<string>();
  const [url, setUrl] = useState<string>();
  const abort = useRef<AbortController>(undefined);
  // Debug: ?clip=5 renders a short clip (used by automated checks).
  const clip = Number(new URLSearchParams(location.search).get('clip')) || undefined;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  if (!track) return null;
  const running = phase !== undefined && phase !== 'done' && !error;
  const seconds = clip ?? preset.durationS;

  const start = async () => {
    setError(undefined);
    setResult(undefined);
    setPhase('prepare');
    abort.current = new AbortController();
    // Keep the screen on while rendering (a locked phone pauses the page).
    let lock: WakeLockSentinel | undefined;
    try {
      lock = await navigator.wakeLock?.request('screen');
    } catch {
      // not supported / denied — rendering still works while the screen stays on
    }
    try {
      const r = await exportVideo({
        track,
        preset,
        title,
        units,
        ...res,
        durationS: clip ?? preset.durationS,
        signal: abort.current.signal,
        onProgress: (p, f) => {
          setPhase(p);
          setFrac(f);
        },
      });
      setResult(r);
      setUrl(URL.createObjectURL(r.blob));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase(undefined);
        return;
      }
      setError(
        e instanceof ExportUnsupportedError
          ? 'This browser can’t encode video. Please update to iOS 16.4+ Safari or a recent Chrome.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      lock?.release().catch(() => {});
    }
  };

  const fileName = `${slug(title)}-${preset.id}.mp4`;
  const canShare =
    result !== undefined &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([result.blob], fileName, { type: 'video/mp4' })] });
  const share = async () => {
    if (!result) return;
    try {
      await navigator.share({
        files: [new File([result.blob], fileName, { type: 'video/mp4' })],
        title,
      });
    } catch {
      // user cancelled
    }
  };

  const overall =
    phase === 'tiles'
      ? frac * 0.2
      : phase === 'frames'
        ? 0.2 + frac * 0.7
        : phase === 'transcode'
          ? 0.9 + frac * 0.1
          : phase === 'done'
            ? 1
            : 0;

  return (
    <section className="step export">
      <h2 className="step-title">Export</h2>
      <div className="card summary">
        <div>
          <span>Style</span>
          <strong>{preset.name}</strong>
        </div>
        <div>
          <span>Length</span>
          <strong>{seconds}s · 30 fps</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>
            {res.width}×{res.height}
          </strong>
        </div>
        <div>
          <span>Format</span>
          <strong>MP4 (H.264)</strong>
        </div>
      </div>

      {!result && !running && (
        <button className="primary big" onClick={start}>
          Render video
        </button>
      )}

      {running && (
        <div className="card progress-card" aria-live="polite">
          <div className="bar">
            <i style={{ width: `${Math.round(overall * 100)}%` }} />
          </div>
          <div className="progress-row">
            <span>{PHASE_LABEL[phase!]}</span>
            <strong>{Math.round(overall * 100)}%</strong>
          </div>
          <p className="hint">Keep this screen open — switching apps pauses rendering.</p>
          <button className="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      )}

      {error && <p className="error">Export failed: {error}</p>}

      {result && url && (
        <div className="result">
          <video src={url} controls playsInline loop muted className="result-video" />
          <p className="hint">
            {result.width}×{result.height} · {result.frames} frames ·{' '}
            {(result.blob.size / 1e6).toFixed(1)} MB · {result.codec}
          </p>
          {canShare && (
            <button className="primary big" onClick={share}>
              Share to Instagram…
            </button>
          )}
          <a
            className={`${canShare ? 'secondary' : 'primary big'} as-link`}
            href={url}
            download={fileName}
            data-testid="download"
          >
            Download MP4
          </a>
          <button className="secondary" onClick={start}>
            Render again
          </button>
        </div>
      )}
    </section>
  );
}
