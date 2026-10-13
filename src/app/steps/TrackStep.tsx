import { useState } from 'react';
import { formatDistance, formatDuration, formatElevation } from '../../track/stats';
import { Profile } from '../components/Profile';
import { RouteThumb } from '../components/RouteThumb';
import { TrackFixSheet } from '../components/TrackFixSheet';
import { useStore } from '../store';

const DATUM_LABEL = { wgs84: 'WGS-84', gcj02: 'GCJ-02', bd09: 'BD-09' } as const;

export function TrackStep() {
  const track = useStore((s) => s.track)!;
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const [sheet, setSheet] = useState(false);
  const { stats, report, datum } = track;
  const fixed = report.coldStart + report.spikes + report.invalid;

  return (
    <section className="step">
      <label className="title-input">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={48} />
      </label>
      <div className="card map-card">
        <RouteThumb
          layers={[
            { points: track.raw, color: 'rgba(248,81,73,0.55)', width: 1 },
            { points: track.points, color: '#ff7a3d', width: 2.2 },
          ]}
        />
        <Profile points={track.anim} />
      </div>
      <dl className="stats">
        <div>
          <dt>Distance</dt>
          <dd>{formatDistance(stats.distance, units)}</dd>
        </div>
        <div>
          <dt>Gain</dt>
          <dd>{formatElevation(stats.gain ?? 0, units)}</dd>
        </div>
        <div>
          <dt>High point</dt>
          <dd>{formatElevation(stats.maxEle ?? 0, units)}</dd>
        </div>
        <div>
          <dt>Moving</dt>
          <dd>{stats.movingTime ? formatDuration(stats.movingTime) : '—'}</dd>
        </div>
      </dl>
      <ul className="fixes">
        <li className={fixed ? 'ok' : 'none'}>
          {fixed
            ? `Removed ${fixed} bad GPS fixes (${report.coldStart} cold-start, ${report.spikes} spikes)`
            : 'No GPS spikes found'}
        </li>
        {report.pauseCollapsed > 0 && (
          <li className="ok">Tidied {report.pauseCollapsed} points of jitter during breaks</li>
        )}
        <li className={datum.applied !== 'wgs84' ? 'ok' : 'none'}>
          {datum.applied !== 'wgs84'
            ? `Detected ${DATUM_LABEL[datum.applied]} coordinates (${datum.reason === 'path-match' ? 'matched to trails' : 'from the recording app'}) and corrected the offset`
            : datum.reason === 'not-in-china'
              ? 'Coordinates are standard WGS-84'
              : 'Kept WGS-84 coordinates'}
        </li>
        <li className="ok">Smoothed the line and corrected elevation against terrain data</li>
      </ul>
      <div className="row">
        <button className="secondary" onClick={() => setSheet(true)}>
          Adjust track…
        </button>
        <div className="segmented units" role="radiogroup" aria-label="Units">
          <button role="radio" aria-checked={units === 'metric'} onClick={() => setUnits('metric')}>
            km · m
          </button>
          <button
            role="radio"
            aria-checked={units === 'imperial'}
            onClick={() => setUnits('imperial')}
          >
            mi · ft
          </button>
        </div>
      </div>
      {sheet && <TrackFixSheet onClose={() => setSheet(false)} />}
    </section>
  );
}
