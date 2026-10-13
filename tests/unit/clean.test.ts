import { describe, expect, it } from 'vitest';
import { cleanTrack, collapsePauses, removeSpikes } from '../../src/track/clean';
import { haversine } from '../../src/track/geo';
import { rtsSmooth1D } from '../../src/track/kalman';
import type { TrackPoint } from '../../src/track/types';
import { loadJson, loadSample } from './helpers';

const line = (n: number, stepDeg = 0.00005, dtMs = 5000): TrackPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    lat: 46 + i * stepDeg,
    lon: 7.7,
    time: i * dtMs,
    seg: 0,
  }));

describe('clean', () => {
  it('removes injected single and multi-point spikes', () => {
    const pts = line(100);
    pts[30] = { ...pts[30], lat: pts[30].lat + 0.005 }; // ~550 m spike
    for (let k = 60; k < 63; k++) pts[k] = { ...pts[k], lon: pts[k].lon + 0.004 };
    const out = removeSpikes(pts, 25 / 3.6);
    expect(out).toHaveLength(96);
    for (let i = 1; i < out.length; i++) expect(haversine(out[i - 1], out[i])).toBeLessThan(30);
  });

  it('accepts a genuine relocation after a long rejected run', () => {
    const a = line(20);
    const b = line(40).map((p, i) => ({ ...p, lat: p.lat + 0.05, time: (20 + i) * 5000 }));
    expect(removeSpikes([...a, ...b], 25 / 3.6).length).toBeGreaterThan(40);
  });

  it('collapses stationary jitter', () => {
    const still: TrackPoint[] = Array.from({ length: 60 }, (_, i) => ({
      lat: 46 + Math.sin(i) * 0.00003,
      lon: 7.7 + Math.cos(i * 1.7) * 0.00003,
      time: i * 5000,
      seg: 0,
    }));
    expect(collapsePauses(still, 10, 60)).toHaveLength(2);
  });

  it('Kalman RTS reduces noise on a straight walk', () => {
    const truth = Array.from({ length: 200 }, (_, i) => i * 1.2);
    let s = 1;
    const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 12;
    const z = truth.map((v) => v + noise());
    const out = rtsSmooth1D(
      z,
      z.map((_, i) => (i ? 1 : 0)),
      { measurementSigma: 5, processNoise: 0.05 },
    );
    const rms = (a: number[]) =>
      Math.sqrt(a.reduce((acc, v, i) => acc + (v - truth[i]) ** 2, 0) / a.length);
    expect(rms(out)).toBeLessThan(rms(z) / 2);
  });

  it('cleans the noisy sample: cold start trimmed, spikes gone, no impossible speeds', () => {
    const meta = loadJson<{ coldStart: number; spikes: number }>('tests/fixtures/noisy-meta.json');
    const t = loadSample('noisy-alps');
    const { points, report } = cleanTrack(t.points);
    expect(report.coldStart).toBeGreaterThanOrEqual(meta.coldStart - 1);
    expect(report.spikes).toBeGreaterThanOrEqual(meta.spikes - 1);
    expect(report.pauseCollapsed).toBeGreaterThan(100);
    for (let i = 1; i < points.length; i++) {
      expect(haversine(points[i - 1], points[i])).toBeLessThan(60);
      const dt = (points[i].time! - points[i - 1].time!) / 1000;
      expect(haversine(points[i - 1], points[i]) / Math.max(dt, 1)).toBeLessThan(25 / 3.6);
    }
  });
});
