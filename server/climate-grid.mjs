import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const metadata = JSON.parse(readFileSync(new URL('./data/koppen-geiger-1991-2020-0p1.json', import.meta.url), 'utf8'));
const WIDTH = 3600;
const HEIGHT = 1800;
const STEP = 0.1;
const NEARBY_CELLS = 2;
const NEARBY_KM = 25;
if (metadata.width !== WIDTH || metadata.height !== HEIGHT || metadata.resolutionDegrees !== STEP || metadata.byteLength !== WIDTH * HEIGHT) {
  throw new Error('Unsupported MHRI climate grid dimensions');
}
// Decode and verify once when the server imports this module. No network or GIS
// dependency is involved in requests; the uncompressed grid occupies 6.48 MB.
const grid = gunzipSync(readFileSync(new URL('./data/koppen-geiger-1991-2020-0p1.bin.gz', import.meta.url)), { maxOutputLength: WIDTH * HEIGHT });
if (grid.length !== WIDTH * HEIGHT || createHash('sha256').update(grid).digest('hex') !== metadata.rawSha256) {
  throw new Error('MHRI climate grid integrity check failed');
}

export const CLIMATE_SOURCE = metadata.source;
const UNKNOWN = Object.freeze({ koppenCode: null, group: 'unknown', source: CLIMATE_SOURCE, confidence: 'unknown' });

const GROUPS = Object.freeze({
  Af: 'tropical-rainforest', Am: 'tropical-seasonal', Aw: 'tropical-seasonal',
  BWh: 'arid', BWk: 'arid', BSh: 'arid', BSk: 'arid',
  Csa: 'mediterranean', Csb: 'mediterranean', Csc: 'mediterranean',
  Cwa: 'subtropical', Cfa: 'subtropical',
  // These mild-summer temperate classes include oceanic and subtropical
  // highland climates. Keep the precise Köppen code available to scene logic.
  Cwb: 'oceanic', Cwc: 'oceanic', Cfb: 'oceanic', Cfc: 'oceanic',
  Dsa: 'continental', Dsb: 'continental', Dwa: 'continental', Dwb: 'continental', Dfa: 'continental', Dfb: 'continental',
  Dsc: 'boreal', Dsd: 'boreal', Dwc: 'boreal', Dwd: 'boreal', Dfc: 'boreal', Dfd: 'boreal',
  ET: 'polar', EF: 'polar',
});

function result(value, confidence) {
  const koppenCode = metadata.classes[value];
  return GROUPS[koppenCode] ? { koppenCode, group: GROUPS[koppenCode], source: CLIMATE_SOURCE, confidence } : UNKNOWN;
}

function distanceKm(latitude, longitude, otherLatitude, otherLongitude) {
  const rad = Math.PI / 180;
  const sinLat = Math.sin((otherLatitude - latitude) * rad / 2);
  const sinLon = Math.sin((otherLongitude - longitude) * rad / 2);
  const a = sinLat * sinLat + Math.cos(latitude * rad) * Math.cos(otherLatitude * rad) * sinLon * sinLon;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Look up a long-term climate class from coordinates (not a time zone or city).
 * Confidence describes lookup provenance, not the paper's statistical certainty.
 * Zero-valued coastal cells may use the nearest mapped cell within a 5×5 window
 * AND 25 km of the requested coordinate. Distant ocean remains unknown.
 */
export function getClimate(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return UNKNOWN;
  const lon = longitude === 180 ? -180 : longitude;
  const column = Math.min(WIDTH - 1, Math.max(0, Math.floor((lon + 180) / STEP + 1e-9)));
  const row = Math.min(HEIGHT - 1, Math.max(0, Math.floor((90 - latitude) / STEP + 1e-9)));
  const direct = grid[row * WIDTH + column];
  if (direct !== 0) return result(direct, 'mapped');
  let nearest = null;
  let nearestDistance = NEARBY_KM;
  for (let offsetRow = -NEARBY_CELLS; offsetRow <= NEARBY_CELLS; offsetRow++) {
    const candidateRow = row + offsetRow;
    if (candidateRow < 0 || candidateRow >= HEIGHT) continue;
    for (let offsetColumn = -NEARBY_CELLS; offsetColumn <= NEARBY_CELLS; offsetColumn++) {
      const candidateColumn = (column + offsetColumn + WIDTH) % WIDTH;
      const value = grid[candidateRow * WIDTH + candidateColumn];
      if (value === 0) continue;
      const distance = distanceKm(latitude, lon, 90 - (candidateRow + 0.5) * STEP, -180 + (candidateColumn + 0.5) * STEP);
      if (distance <= nearestDistance) { nearest = value; nearestDistance = distance; }
    }
  }
  return nearest === null ? UNKNOWN : result(nearest, 'nearby');
}
