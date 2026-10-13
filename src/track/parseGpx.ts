import type { ParsedTrack, TrackPoint } from './types';

type XmlParser = { parseFromString(xml: string, type: string): Document };

function children(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', name) as unknown as ArrayLike<Element>);
}

function text(el: Element, name: string): string | undefined {
  const c = children(el, name)[0];
  return c?.textContent?.trim() || undefined;
}

function toPoint(el: Element, seg: number): TrackPoint {
  const lat = Number(el.getAttribute('lat'));
  const lon = Number(el.getAttribute('lon'));
  const eleText = text(el, 'ele');
  const timeText = text(el, 'time');
  const ele = eleText !== undefined ? Number(eleText) : undefined;
  const time = timeText !== undefined ? Date.parse(timeText) : undefined;
  return {
    lat,
    lon,
    ele: ele !== undefined && Number.isFinite(ele) ? ele : undefined,
    time: time !== undefined && Number.isFinite(time) ? time : undefined,
    seg,
  };
}

/**
 * Parse GPX 1.0/1.1. Reads every trk/trkseg/trkpt (each trkseg becomes its own `seg`),
 * falling back to rte/rtept when there are no track points.
 */
export function parseGpx(xml: string, parser: XmlParser = new DOMParser()): ParsedTrack {
  const doc = parser.parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx') throw new Error('Not a GPX file');

  const points: TrackPoint[] = [];
  let seg = 0;
  for (const trkseg of children(doc, 'trkseg')) {
    const pts = children(trkseg, 'trkpt');
    if (pts.length === 0) continue;
    for (const p of pts) points.push(toPoint(p, seg));
    seg++;
  }
  if (points.length === 0) {
    for (const rte of children(doc, 'rte')) {
      for (const p of children(rte, 'rtept')) points.push(toPoint(p, seg));
      seg++;
    }
  }
  if (points.length === 0) throw new Error('GPX has no track or route points');

  const trk = children(doc, 'trk')[0] ?? children(doc, 'rte')[0];
  const metadata = children(doc, 'metadata')[0];
  const name = (trk && text(trk, 'name')) ?? (metadata && text(metadata, 'name'));
  return { name, creator: root.getAttribute('creator') ?? undefined, points };
}
