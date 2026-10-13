import { useRef, useState } from 'react';
import { useStore } from '../store';

export const SAMPLES = [
  { file: 'alps-hornli', label: 'Zermatt → Hörnlihütte', meta: 'Alps · 8 km' },
  { file: 'himalaya-ebc', label: 'Lobuche → Everest BC', meta: 'Himalaya · 9 km' },
  { file: 'china-huangshan-gcj02', label: '黄山 Huangshan', meta: 'China · GCJ-02' },
  { file: 'noisy-alps', label: 'Noisy recording', meta: 'Spikes & drift' },
];

export function UploadStep() {
  const loadFile = useStore((s) => s.loadFile);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const open = async (f: File) => loadFile(f.name, await f.text());
  const sample = async (name: string) => {
    const xml = await (await fetch(`/samples/${name}.gpx`)).text();
    await loadFile(`${name}.gpx`, xml);
  };

  return (
    <section className="step upload">
      <h1 className="hero">
        Your trek,
        <br />
        <span>ready for Reels.</span>
      </h1>
      <p className="lead">
        Drop in the GPX from your hike. We clean up the GPS, put it on real 3D terrain and render a
        9:16 video — right here on your phone. Your file never leaves your device.
      </p>
      <button
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) open(f);
        }}
        disabled={busy}
        aria-label="Choose a GPX file"
      >
        <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden>
          <path
            d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <strong>{busy ? 'Reading your track…' : 'Choose GPX file'}</strong>
        <small>From Files, Strava, Garmin, AllTrails, 两步路…</small>
      </button>
      <input
        ref={input}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        hidden
        onChange={(e) => e.target.files?.[0] && open(e.target.files[0])}
      />
      {error && <p className="error">Couldn't read that file: {error}</p>}
      <h2 className="section-label">No GPX handy? Try a sample</h2>
      <div className="samples">
        {SAMPLES.map((s) => (
          <button key={s.file} className="chip" onClick={() => sample(s.file)} disabled={busy}>
            <strong>{s.label}</strong>
            <small>{s.meta}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
