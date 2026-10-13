import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseGpx } from '../../src/track/parseGpx';

export const xmlParser = new DOMParser() as unknown as {
  parseFromString(x: string, t: string): Document;
};
export const loadSample = (name: string) =>
  parseGpx(readFileSync(`public/samples/${name}.gpx`, 'utf8'), xmlParser);
export const loadJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
