import { describe, expect, it } from 'vitest';
import {
  bd09ToGcj02,
  detectDatum,
  gcj02ToBd09,
  gcj02ToWgs84,
  isInMainlandChina,
  wgs84ToGcj02,
} from '../../src/track/datum';
import { haversine } from '../../src/track/geo';
import { loadJson, loadSample } from './helpers';

describe('datum', () => {
  it('matches a known WGS-84 → GCJ-02 reference (Tiananmen)', () => {
    // Published reference pair (to ~1 m); the offset itself is ~570 m here.
    const [lat, lon] = wgs84ToGcj02(39.90734, 116.391305);
    expect(haversine({ lat, lon }, { lat: 39.908746, lon: 116.397552 })).toBeLessThan(1.5);
    expect(haversine({ lat, lon }, { lat: 39.90734, lon: 116.391305 })).toBeGreaterThan(400);
  });

  it('round-trips GCJ-02 under 0.5 m across China', () => {
    for (const [lat, lon] of [
      [39.9, 116.4],
      [31.23, 121.47],
      [30.13, 118.17],
      [29.65, 91.13],
      [22.54, 114.05],
      [43.8, 87.6],
    ]) {
      const [g1, g2] = wgs84ToGcj02(lat, lon);
      const [w1, w2] = gcj02ToWgs84(g1, g2);
      expect(haversine({ lat, lon }, { lat: w1, lon: w2 })).toBeLessThan(0.5);
    }
  });

  it('round-trips BD-09', () => {
    const [b1, b2] = gcj02ToBd09(30.13, 118.17);
    const [g1, g2] = bd09ToGcj02(b1, b2);
    expect(haversine({ lat: 30.13, lon: 118.17 }, { lat: g1, lon: g2 })).toBeLessThan(1);
  });

  it('knows where mainland China is', () => {
    expect(isInMainlandChina(30.13, 118.17)).toBe(true);
    expect(isInMainlandChina(25.03, 121.56)).toBe(false); // Taipei
    expect(isInMainlandChina(22.3, 114.17)).toBe(false); // Hong Kong
    expect(isInMainlandChina(46.0, 7.7)).toBe(false);
    expect(wgs84ToGcj02(46, 7.7)).toEqual([46, 7.7]);
  });

  it('auto-detects GCJ-02 on the Huangshan sample by matching trails', () => {
    const t = loadSample('china-huangshan-gcj02');
    const trail = loadJson<{ lat: number; lon: number }[]>('public/samples/huangshan-trail.json');
    const d = detectDatum(t.points, { paths: [trail] });
    expect(d.datum).toBe('gcj02');
    expect(d.reason).toBe('path-match');
    expect(d.scores!.gcj02).toBeLessThan(15);
    expect(d.scores!.wgs84).toBeGreaterThan(100);
  });

  it('falls back to the creator hint without paths, and to WGS-84 outside China', () => {
    const t = loadSample('china-huangshan-gcj02');
    expect(detectDatum(t.points, { creator: t.creator }).reason).toBe('creator-hint');
    expect(detectDatum(loadSample('alps-hornli').points).reason).toBe('not-in-china');
  });
});
