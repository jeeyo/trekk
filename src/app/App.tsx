import { TrackDebug } from './debug/TrackDebug';

export function App() {
  const debug = new URLSearchParams(location.search).get('debug');
  if (debug === 'track') return <TrackDebug />;
  return (
    <main className="hello">
      <h1>Trekk</h1>
      <p>Turn your trek's GPX into an Instagram-ready animation.</p>
      <p className="muted">Scaffold is up. Upload flow arrives in the next milestones.</p>
    </main>
  );
}
