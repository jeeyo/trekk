import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../../src/camera/path';
import { buildWarp } from '../../src/camera/timewarp';
import { zoomForDistance } from '../../src/camera/types';
import { PRESETS, presetById } from '../../src/presets';
import { processTrack } from '../../src/track/pipeline';
import { loadSample } from './helpers';

const track = await processTrack(loadSample('alps-hornli'));

describe('camera timeline', () => {
  it('progress is monotonic, holds at 0 during intro and 1 during outro', () => {
    for (const preset of PRESETS) {
      const tl = buildTimeline(track.anim, preset);
      let last = -1;
      for (let i = 0; i <= 300; i++) {
        const p = tl.progressAt(i / 300);
        expect(p).toBeGreaterThanOrEqual(last - 1e-9);
        last = p;
      }
      expect(tl.progressAt(0)).toBe(0);
      expect(tl.progressAt(1)).toBe(1);
    }
  });

  it('cameras move smoothly frame to frame (30 fps)', () => {
    for (const preset of PRESETS) {
      const tl = buildTimeline(track.anim, preset);
      const frames = preset.durationS * 30;
      let prev = tl.cameraAt(0);
      for (let i = 1; i <= frames; i++) {
        const c = tl.cameraAt(i / frames);
        expect(Math.abs(c.zoom - prev.zoom)).toBeLessThan(0.16);
        const db = Math.abs(((c.bearing - prev.bearing + 540) % 360) - 180);
        expect(db).toBeLessThan(6);
        expect(Math.abs(c.pitch - prev.pitch)).toBeLessThan(4);
        prev = c;
      }
    }
  });

  it('summit push spends more time on climbs than linear', () => {
    const climb = buildWarp('climb', track.anim);
    // first 25 % of distance is the gentle valley walk: it should take less than 25 % of the time
    let u = 0;
    while (climb(u) < 0.25) u += 0.001;
    expect(u).toBeLessThan(0.22);
  });

  it('zoomForDistance halves distance per zoom level', () => {
    expect(zoomForDistance(1000, 46) - zoomForDistance(2000, 46)).toBeCloseTo(1, 6);
    expect(presetById('nope').id).toBe('chase');
  });
});
