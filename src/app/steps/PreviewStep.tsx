import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PRESET } from '../../presets';
import { MapPreview } from '../components/MapPreview';
import { Profile } from '../components/Profile';
import { useStore } from '../store';

export function PreviewStep() {
  const track = useStore((s) => s.track)!;
  const preset = DEFAULT_PRESET;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const n = v + dt / preset.durationS;
        return n >= 1 ? 0 : n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, preset.durationS]);

  return (
    <section className="step preview">
      <MapPreview track={track} preset={preset} t={t} />
      <div className="transport">
        <button
          className="round"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value) / 1000);
          }}
          aria-label="Scrub"
        />
        <span className="time">{(t * preset.durationS).toFixed(1)}s</span>
      </div>
      <Profile points={track.anim} progress={t} height={64} />
    </section>
  );
}
