import { useState } from 'react';
import { PRESETS } from '../../presets';
import type { PresetConfig } from '../../presets/types';
import { useStore } from '../store';

function Thumb({ preset }: { preset: PresetConfig }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`thumb base-${preset.base}`}>
      {!failed && (
        <img
          src={`/presets/${preset.id}.jpg`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <svg viewBox="0 0 90 160" aria-hidden className="thumb-line">
        <path
          d="M18 130 C 30 110, 22 92, 40 84 S 58 60, 50 44 S 66 26, 74 22"
          fill="none"
          stroke={preset.line.color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={preset.line.dash ? '6 4' : undefined}
        />
      </svg>
    </div>
  );
}

export function StyleStep() {
  const presetId = useStore((s) => s.presetId);
  const setPreset = useStore((s) => s.setPreset);
  const selected = PRESETS.find((p) => p.id === presetId)!;
  return (
    <section className="step style">
      <h2 className="step-title">Pick a style</h2>
      <div className="carousel" role="listbox" aria-label="Animation styles">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            role="option"
            aria-selected={p.id === presetId}
            className={`preset-card ${p.id === presetId ? 'selected' : ''}`}
            onClick={() => setPreset(p.id)}
          >
            <Thumb preset={p} />
            <span className="preset-name">{p.name}</span>
          </button>
        ))}
      </div>
      <div className="card preset-detail">
        <strong>{selected.name}</strong>
        <p>{selected.tagline}</p>
        <ul className="tags">
          <li>
            {selected.base === 'satellite'
              ? 'Satellite + 3D'
              : selected.base === 'topo'
                ? 'Topo map'
                : selected.base === 'night'
                  ? 'Night relief'
                  : 'Monochrome'}
          </li>
          <li>
            {selected.camera.mode === 'topdown'
              ? 'Top-down'
              : selected.camera.mode === 'orbit'
                ? 'Orbiting camera'
                : selected.camera.mode === 'flyin'
                  ? 'Fly-in camera'
                  : 'Follow camera'}
          </li>
          {selected.overlays.profile && <li>Elevation profile</li>}
          {selected.timewarp === 'climb' && <li>Slows on climbs</li>}
          <li>{selected.durationS}s</li>
        </ul>
      </div>
    </section>
  );
}
