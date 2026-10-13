import { TrackDebug } from './debug/TrackDebug';
import { PreviewStep } from './steps/PreviewStep';
import { TrackStep } from './steps/TrackStep';
import { UploadStep } from './steps/UploadStep';
import { STEPS, useStore, type Step } from './store';

const NEXT: Partial<Record<Step, { to: Step; label: string }>> = {
  track: { to: 'preview', label: 'Looks good — preview' },
  preview: { to: 'export', label: 'Export video' },
};

const BACK: Partial<Record<Step, Step>> = {
  track: 'upload',
  preview: 'track',
  style: 'track',
  export: 'preview',
};

export function App() {
  const debug = new URLSearchParams(location.search).get('debug');
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const busy = useStore((s) => s.busy);
  if (debug === 'track') return <TrackDebug />;

  const idx = STEPS.findIndex((s) => s.id === step);
  const next = NEXT[step];
  const back = BACK[step];

  return (
    <div className="shell">
      <header className="topbar">
        {back ? (
          <button className="icon" onClick={() => setStep(back)} aria-label="Back">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : (
          <span className="icon" />
        )}
        <div className="brand">
          <img src="/icon.svg" alt="" width="22" height="22" /> Trekk
        </div>
        <span className="icon" />
      </header>
      <ol className="progress" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i < idx ? 'done' : i === idx ? 'current' : ''}>
            {s.label}
          </li>
        ))}
      </ol>
      <main className="content">
        {step === 'upload' && <UploadStep />}
        {step === 'track' && <TrackStep />}
        {step === 'preview' && <PreviewStep />}
      </main>
      {next && (
        <footer className="actionbar">
          <button className="primary" disabled={busy} onClick={() => setStep(next.to)}>
            {busy ? 'Working…' : next.label}
          </button>
        </footer>
      )}
    </div>
  );
}
