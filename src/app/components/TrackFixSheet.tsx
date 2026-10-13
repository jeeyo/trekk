import { useEffect, useState } from 'react';
import type { Datum } from '../../track/datum';
import { useStore } from '../store';
import { NudgeMap } from './NudgeMap';

const DATUMS: { id: Datum | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'wgs84', label: 'WGS-84' },
  { id: 'gcj02', label: 'GCJ-02' },
  { id: 'bd09', label: 'BD-09' },
];
const SPEEDS = [
  { v: 15, label: 'Strict' },
  { v: 25, label: 'Normal' },
  { v: 45, label: 'Loose' },
];

export function TrackFixSheet({ onClose }: { onClose: () => void }) {
  const fix = useStore((s) => s.fix);
  const track = useStore((s) => s.track)!;
  const reprocess = useStore((s) => s.reprocess);
  const busy = useStore((s) => s.busy);
  const [smoothing, setSmoothing] = useState(fix.clean.smoothing ?? 0.5);

  // debounce the slider
  useEffect(() => {
    if (smoothing === (fix.clean.smoothing ?? 0.5)) return;
    const id = setTimeout(() => reprocess({ clean: { smoothing } }), 250);
    return () => clearTimeout(id);
  }, [smoothing, fix.clean.smoothing, reprocess]);

  const datum = fix.datum ?? 'auto';
  // Nudge applies after cleaning; show the cleaned track without the current nudge as the base.
  const beforeNudge = track.points;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-label="Adjust track"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grabber" />
        <h3>Adjust track {busy && <small>updating…</small>}</h3>

        <label className="field">
          <span>
            Smoothing <b>{Math.round(smoothing * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={smoothing}
            onChange={(e) => setSmoothing(Number(e.target.value))}
          />
        </label>

        <div className="field">
          <span>Spike filter</span>
          <div className="segmented">
            {SPEEDS.map((s) => (
              <button
                key={s.v}
                role="radio"
                aria-checked={(fix.clean.maxSpeedKmh ?? 25) === s.v}
                onClick={() => reprocess({ clean: { maxSpeedKmh: s.v } })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Coordinate system</span>
          <div className="segmented">
            {DATUMS.map((d) => (
              <button
                key={d.id}
                role="radio"
                aria-checked={datum === d.id}
                onClick={() => reprocess({ datum: d.id === 'auto' ? undefined : d.id })}
              >
                {d.label}
              </button>
            ))}
          </div>
          <small className="hint">
            Tracks from Chinese apps are often GCJ-02 (shifted 100–700 m). Auto detects it.
          </small>
        </div>

        <div className="field">
          <span>Line up with the trail</span>
          <small className="hint">
            Drag the orange line with one finger if it's still off the path in the imagery.
          </small>
          <NudgeMap
            points={beforeNudge}
            offset={{ east: 0, north: 0 }}
            onChange={(o) =>
              reprocess({
                nudge: { east: fix.nudge.east + o.east, north: fix.nudge.north + o.north },
              })
            }
          />
          {(fix.nudge.east !== 0 || fix.nudge.north !== 0) && (
            <button
              className="secondary"
              onClick={() => reprocess({ nudge: { east: 0, north: 0 } })}
            >
              Reset offset ({fix.nudge.east} m E, {fix.nudge.north} m N)
            </button>
          )}
        </div>

        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
