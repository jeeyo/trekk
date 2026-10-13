import { useMemo } from 'react';
import { buildTimeline } from '../camera/path';
import { presetById } from '../presets';
import { useStore } from './store';

/** The chosen preset with user overrides applied, and its timeline for the current track. */
export function usePresetTimeline() {
  const track = useStore((s) => s.track);
  const presetId = useStore((s) => s.presetId);
  const duration = useStore((s) => s.duration);
  const preset = useMemo(() => {
    const p = presetById(presetId);
    return duration ? { ...p, durationS: duration } : p;
  }, [presetId, duration]);
  const timeline = useMemo(
    () => (track ? buildTimeline(track.anim, preset) : undefined),
    [track, preset],
  );
  return { track, preset, timeline };
}
