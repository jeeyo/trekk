import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { buildStyle } from '../../map/styles';
import { rewriteUpstream } from '../../map/sources';
import { nudgePoints } from '../../track/datum';
import { bounds } from '../../track/geo';
import type { TrackPoint } from '../../track/types';

/**
 * Top-down satellite map where the user drags the track with one finger to line it up with the
 * trail in the imagery. Reports the offset in metres (east, north) on release.
 */
export function NudgeMap({
  points,
  offset,
  onChange,
}: {
  points: TrackPoint[];
  offset: { east: number; north: number };
  onChange: (o: { east: number; north: number }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap>(undefined);
  const [live, setLive] = useState(offset);
  const base = useRef(points);
  base.current = points;

  const draw = (o: { east: number; north: number }) => {
    const shifted = nudgePoints(base.current, o.east, o.north);
    (map.current?.getSource('track') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: shifted.map((p) => [p.lon, p.lat]) },
    });
  };

  useEffect(() => {
    const [w, s, e, n] = bounds(points);
    const m = new maplibregl.Map({
      container: el.current!,
      style: { ...buildStyle({ base: 'satellite', exaggeration: 1 }), terrain: undefined },
      bounds: [w, s, e, n],
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      dragPan: false,
      dragRotate: false,
      touchZoomRotate: true,
      transformRequest: (url) => ({ url: rewriteUpstream(url) }),
    });
    map.current = m;
    // style.load (not load): 'load' waits for every tile, which may never settle if imagery fails
    m.once('style.load', () => {
      m.addSource('track', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'track-casing',
        type: 'line',
        source: 'track',
        paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.4 },
      });
      m.addLayer({
        id: 'track',
        type: 'line',
        source: 'track',
        paint: { 'line-color': '#ff7a3d', 'line-width': 3 },
      });
      draw(offset);
    });
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw(offset);
    setLive(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, offset.east, offset.north]);

  // One-finger drag moves the track (not the map).
  const start = useRef<{ x: number; y: number; o: { east: number; north: number } }>(undefined);
  const metresPerPixel = () => {
    const m = map.current!;
    const lat = m.getCenter().lat;
    return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom());
  };

  return (
    <div className="nudge">
      <div ref={el} className="nudge-map" />
      <div
        className="nudge-pad"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, y: e.clientY, o: live };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const k = metresPerPixel();
          const o = {
            east: start.current.o.east + (e.clientX - start.current.x) * k,
            north: start.current.o.north - (e.clientY - start.current.y) * k,
          };
          setLive(o);
          draw(o);
        }}
        onPointerUp={() => {
          if (start.current)
            onChange({ east: Math.round(live.east), north: Math.round(live.north) });
          start.current = undefined;
        }}
      />
      <div className="nudge-readout">
        Offset {Math.round(live.east)} m E · {Math.round(live.north)} m N
      </div>
    </div>
  );
}
