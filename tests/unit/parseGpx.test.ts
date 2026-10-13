import { describe, expect, it } from 'vitest';
import { parseGpx } from '../../src/track/parseGpx';
import { loadSample, xmlParser } from './helpers';

describe('parseGpx', () => {
  it('reads track points with ele and time', () => {
    const t = loadSample('alps-hornli');
    expect(t.name).toBe('Zermatt → Hörnlihütte');
    expect(t.points.length).toBeGreaterThan(1000);
    expect(t.points[0].ele).toBeTypeOf('number');
    expect(t.points[0].time).toBeTypeOf('number');
  });

  it('keeps segments separate and falls back to routes', () => {
    const xml = `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
      <trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2.1"/></trkseg><trkseg><trkpt lat="1.2" lon="2.2"/></trkseg></trk></gpx>`;
    expect(parseGpx(xml, xmlParser).points.map((p) => p.seg)).toEqual([0, 0, 1]);
    const rte = `<gpx><rte><name>R</name><rtept lat="5" lon="6"/><rtept lat="5.1" lon="6.1"/></rte></gpx>`;
    const r = parseGpx(rte, xmlParser);
    expect(r.points).toHaveLength(2);
    expect(r.name).toBe('R');
  });

  it('rejects non-GPX input', () => {
    expect(() => parseGpx('<kml></kml>', xmlParser)).toThrow(/GPX/);
  });
});
