/**
 * 2D overlay drawn on top of each map frame: title block, live stats, elevation panel, summit
 * callout, end card and attribution. Laid out on a 1080×1920 grid and scaled to the output size,
 * keeping text out of the areas Instagram Reels covers with its own UI.
 */
import type { PresetConfig } from '../presets/types';
import type { ProcessedTrack } from '../track/pipeline';
import { formatDistance, formatDuration, formatElevation } from '../track/stats';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface OverlayState {
  preset: PresetConfig;
  track: ProcessedTrack;
  title: string;
  units: 'metric' | 'imperial';
  /** 0..1 animation time */
  t: number;
  /** 0..1 route progress */
  progress: number;
  /** when the outro (end card) starts, 0..1 */
  outroStart: number;
  attribution: string;
  /** screen position (output px) of a lon/lat/ele on the map, if visible */
  project?: (lon: number, lat: number, ele: number) => [number, number] | undefined;
}

// Instagram Reels covers roughly the top 220 px and bottom 380 px (of 1920) with its UI.
export const SAFE_TOP = 220;
export const SAFE_BOTTOM = 380;
const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans CJK SC", sans-serif';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cumulative gain up to each resampled point, for live counters. */
const gainCache = new WeakMap<ProcessedTrack, Float64Array>();
function cumulativeGain(track: ProcessedTrack): Float64Array {
  let g = gainCache.get(track);
  if (g) return g;
  // Same hysteresis as stats.gainLoss, accumulated point by point.
  const eles = track.anim.map((p) => p.ele ?? 0);
  g = new Float64Array(eles.length);
  let ref = eles[0] ?? 0;
  let gain = 0;
  for (let i = 1; i < eles.length; i++) {
    const d = eles[i] - ref;
    if (d >= 4) {
      gain += d;
      ref = eles[i];
    } else if (d <= -4) ref = eles[i];
    g[i] = gain;
  }
  gainCache.set(track, g);
  return g;
}

function liveValues(s: OverlayState) {
  const anim = s.track.anim;
  const i = Math.min(anim.length - 1, Math.round(s.progress * (anim.length - 1)));
  return {
    dist: s.progress * s.track.stats.distance,
    ele: anim[i]?.ele ?? 0,
    gain: cumulativeGain(s.track)[i] ?? 0,
  };
}

function dateLabel(track: ProcessedTrack): string | undefined {
  const t = track.stats.startTime;
  if (!t) return undefined;
  return new Date(t)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
}

export function drawOverlay(ctx: Ctx, w: number, h: number, s: OverlayState) {
  const k = w / 1080;
  ctx.save();
  ctx.scale(k, k);
  const H = h / k;
  const dark = s.preset.overlays.theme === 'dark';
  const fg = dark ? '#ffffff' : '#111111';
  const sub = dark ? 'rgba(255,255,255,0.78)' : 'rgba(17,17,17,0.66)';
  const accent = s.preset.line.color;
  const outro = ease((s.t - s.outroStart) / Math.max(0.01, (1 - s.outroStart) * 0.5));
  const mapBottom = H * s.preset.mapHeight;

  // --- top scrim + title block -----------------------------------------------------------
  const scrimH = SAFE_TOP + 240;
  const g = ctx.createLinearGradient(0, 0, 0, scrimH);
  g.addColorStop(0, dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)');
  g.addColorStop(1, dark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, scrimH);

  const intro = ease(s.t / 0.06);
  ctx.globalAlpha = intro;
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  ctx.shadowBlur = 14;
  let y = SAFE_TOP + 20;
  const date = dateLabel(s.track);
  if (date) {
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(date.split('').join(String.fromCharCode(8202)), 64, y);
    y += 70;
  } else y += 44;
  if (s.preset.overlays.title && s.title) {
    const size = s.preset.base === 'minimal' ? 84 : 68;
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.fillStyle = fg;
    ctx.fillText(s.title, 64, y, 952);
    y += 62;
  }

  // --- live stats under the title ----------------------------------------------------------
  if (s.preset.overlays.stats === 'live' && !s.preset.overlays.profile) {
    const v = liveValues(s);
    ctx.font = `600 40px ${FONT}`;
    ctx.fillStyle = sub;
    ctx.globalAlpha = intro * (1 - outro);
    ctx.fillText(
      `${formatDistance(v.dist, s.units)}   ▲ ${formatElevation(v.gain, s.units)}   ${formatElevation(v.ele, s.units)}`,
      64,
      y + 16,
    );
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // --- summit callout ----------------------------------------------------------------------
  const st = s.track.stats;
  if (s.preset.overlays.summitCallout && st.maxEleIndex !== undefined && s.project) {
    const pts = s.track.points;
    const top = pts[st.maxEleIndex];
    const reachedAt = st.maxEleIndex / Math.max(1, pts.length - 1);
    // fade in over the last stretch of the climb, fully visible on arrival
    const a = ease((s.progress - (reachedAt - 0.06)) / 0.05);
    const pos = top ? s.project(top.lon, top.lat, top.ele ?? 0) : undefined;
    if (a > 0 && pos && pos[1] > SAFE_TOP + 200 && pos[1] < mapBottom - 40) {
      const [px, py] = [pos[0] / k, pos[1] / k];
      ctx.globalAlpha = a * (1 - outro);
      const label = `▲ ${formatElevation(st.maxEle ?? 0, s.units)}`;
      ctx.font = `800 44px ${FONT}`;
      const tw = ctx.measureText(label).width;
      const bx = Math.max(24, Math.min(1080 - tw - 64, px - tw / 2 - 20));
      const by = py - 150;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py - 14);
      ctx.lineTo(px, by + 72);
      ctx.stroke();
      ctx.fillStyle = accent;
      roundRect(ctx, bx, by, tw + 40, 72, 36);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, bx + 20, by + 52);
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText('HIGH POINT', bx + 20, by - 14);
      ctx.globalAlpha = 1;
    }
  }

  // --- elevation story panel ---------------------------------------------------------------
  if (s.preset.overlays.profile) drawProfilePanel(ctx, s, mapBottom, H, dark);

  // --- end card ----------------------------------------------------------------------------
  if (s.preset.overlays.stats !== 'none' && outro > 0 && !s.preset.overlays.profile) {
    drawEndCard(ctx, s, H, outro, dark);
  }

  // --- attribution (required by data licences) ---------------------------------------------
  ctx.font = `500 19px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)';
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 6;
  ctx.fillText(s.attribution, 1080 - 28, H - SAFE_BOTTOM + 52, 1024);
  ctx.textAlign = 'left';
  ctx.shadowBlur = 0;
  ctx.restore();
}

function stat(
  ctx: Ctx,
  x: number,
  y: number,
  label: string,
  value: string,
  fg: string,
  sub: string,
  size = 56,
) {
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = sub;
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = fg;
  ctx.fillText(value, x, y + size + 6);
}

function drawEndCard(ctx: Ctx, s: OverlayState, H: number, a: number, dark: boolean) {
  const st = s.track.stats;
  const cardH = 300;
  const y0 = H - SAFE_BOTTOM - cardH - 20 + (1 - a) * 60;
  ctx.globalAlpha = a;
  ctx.fillStyle = dark ? 'rgba(10,14,12,0.72)' : 'rgba(255,255,255,0.86)';
  roundRect(ctx, 48, y0, 984, cardH, 36);
  ctx.fill();
  const fg = dark ? '#ffffff' : '#111111';
  const sub = dark ? 'rgba(255,255,255,0.6)' : 'rgba(17,17,17,0.55)';
  const cells: [string, string][] = [
    ['Distance', formatDistance(st.distance, s.units)],
    ['Elevation gain', formatElevation(st.gain ?? 0, s.units)],
    ['High point', formatElevation(st.maxEle ?? 0, s.units)],
    ['Moving time', st.movingTime ? formatDuration(st.movingTime) : '—'],
  ];
  cells.forEach(([l, v], i) =>
    stat(ctx, 96 + (i % 2) * 480, y0 + 64 + Math.floor(i / 2) * 124, l, v, fg, sub),
  );
  ctx.globalAlpha = 1;
}

function drawProfilePanel(ctx: Ctx, s: OverlayState, top: number, H: number, dark: boolean) {
  const bg = dark ? '#0d1310' : '#f4f2ec';
  const fg = dark ? '#ffffff' : '#111111';
  const sub = dark ? 'rgba(255,255,255,0.6)' : 'rgba(17,17,17,0.55)';
  ctx.fillStyle = bg;
  ctx.fillRect(0, top, 1080, H - top);
  // soft edge between map and panel
  const g = ctx.createLinearGradient(0, top - 80, 0, top);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, top - 80, 1080, 80);

  const anim = s.track.anim;
  const total = anim[anim.length - 1].dist || 1;
  const eles = anim.map((p) => p.ele ?? 0);
  const lo = Math.min(...eles);
  const hi = Math.max(...eles);
  const x0 = 64;
  const x1 = 1016;
  const yTop = top + 150;
  const yBot = Math.min(H - SAFE_BOTTOM - 20, top + 380);
  const X = (d: number) => x0 + (d / total) * (x1 - x0);
  const Y = (e: number) => yBot - ((e - lo) / (hi - lo || 1)) * (yBot - yTop);

  const v = liveValues(s);
  stat(ctx, x0, top + 44, 'Distance', formatDistance(v.dist, s.units), fg, sub, 52);
  stat(ctx, x0 + 330, top + 44, 'Altitude', formatElevation(v.ele, s.units), fg, sub, 52);
  stat(ctx, x0 + 660, top + 44, 'Climbed', formatElevation(v.gain, s.units), fg, sub, 52);

  const path = () => {
    ctx.beginPath();
    anim.forEach((p, i) =>
      i ? ctx.lineTo(X(p.dist), Y(p.ele ?? 0)) : ctx.moveTo(X(p.dist), Y(p.ele ?? 0)),
    );
  };
  // full profile, faint
  path();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // progress fill
  const px = X(s.progress * total);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 4, yTop - 20, px - x0 + 4, yBot - yTop + 40);
  ctx.clip();
  const fill = ctx.createLinearGradient(0, yTop, 0, yBot);
  fill.addColorStop(0, s.preset.line.color);
  fill.addColorStop(1, 'rgba(0,0,0,0)');
  path();
  ctx.lineTo(X(total), yBot);
  ctx.lineTo(X(0), yBot);
  ctx.closePath();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
  path();
  ctx.strokeStyle = s.preset.line.color;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  // marker
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, Y(v.ele), 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.preset.line.color;
  ctx.beginPath();
  ctx.arc(px, Y(v.ele), 7, 0, Math.PI * 2);
  ctx.fill();
}
