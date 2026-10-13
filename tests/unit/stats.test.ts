import { describe, expect, it } from 'vitest';
import { blendElevation, decodeTerrarium, medianFilter } from '../../src/track/elevation';
import { resampleByDistance, simplifyIndices } from '../../src/track/resample';
import { computeStats, formatDistance, formatDuration, gainLoss } from '../../src/track/stats';
import { processTrack } from '../../src/track/pipeline';
import { loadSample } from './helpers';

describe('stats & elevation', () => {
  it('gain/loss on a synthetic profile with noise matches the true climb', () => {
    // climb 500 m, descend 200 m, with ±1.5 m sawtooth noise that must not count
    const prof: number[] = [];
    for (let i = 0; i <= 500; i++) prof.push(1000 + i + (i % 2 ? 1.5 : -1.5));
    for (let i = 1; i <= 200; i++) prof.push(1500 - i + (i % 2 ? 1.5 : -1.5));
    const { gain, loss } = gainLoss(prof, 4);
    expect(gain).toBeGreaterThan(490);
    expect(gain).toBeLessThan(510);
    expect(loss).toBeGreaterThan(190);
    expect(loss).toBeLessThan(210);
  });

  it('decodes terrarium pixels', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(140, 26, 128)).toBeCloseTo(3098.5, 1);
  });

  it('median filter removes single-sample blips', () => {
    expect(medianFilter([1, 1, 50, 1, 1], 3)).toEqual([1, 1, 1, 1, 1]);
  });

  it('blends GPS altitude with DEM after removing bias', () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ lat: 0, lon: i, ele: 120 + i * 10, seg: 0 }));
    const dem = [100, 110, 120, 130, 140];
    const out = blendElevation(pts, dem);
    expect(out.map((p) => Math.round(p.ele!))).toEqual(dem);
  });

  it('resamples evenly and simplifies', () => {
    const t = loadSample('alps-hornli');
    const r = resampleByDistance(t.points, 25);
    for (let i = 1; i < r.length - 1; i++) expect(r[i].dist - r[i - 1].dist).toBeCloseTo(25, 5);
    expect(simplifyIndices(t.points, 5).length).toBeLessThan(t.points.length / 3);
  });

  it('computes trek stats for the Hörnli sample', async () => {
    const p = await processTrack(loadSample('alps-hornli'));
    const s = p.stats;
    expect(s.distance).toBeGreaterThan(7000);
    expect(s.distance).toBeLessThan(12000);
    expect(s.gain!).toBeGreaterThan(1200);
    expect(s.maxEle!).toBeGreaterThan(3000);
    expect(s.movingTime!).toBeLessThan(s.duration!);
    expect(formatDistance(s.distance)).toMatch(/km$/);
    expect(formatDuration(5_400_000)).toBe('1h 30m');
    expect(computeStats([]).distance).toBe(0);
  });
});
