export interface CameraState {
  center: [number, number]; // lon, lat
  /** zoom for a 1920 px tall frame; the scene rescales for other sizes */
  zoom: number;
  bearing: number;
  pitch: number;
}

export const REFERENCE_HEIGHT = 1920;
const FOV = 36.87; // MapLibre default vertical field of view, degrees

/** Zoom at which the camera sits `distance` metres from its target (for a REFERENCE_HEIGHT frame). */
export function zoomForDistance(distance: number, lat: number, height = REFERENCE_HEIGHT): number {
  const camToCenterPx = (0.5 / Math.tan(((FOV / 2) * Math.PI) / 180)) * height;
  const metresPerPxAtZ0 = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 512;
  return Math.log2((camToCenterPx * metresPerPxAtZ0) / distance);
}
