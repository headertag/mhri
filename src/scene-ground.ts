import type { Environment } from './environment';

export interface GroundState {
  state: 'bare' | 'patchy' | 'covered' | 'unknown';
  snowDepthM: number | null;
  source: 'modeled-depth' | 'preview' | 'unavailable';
  label: string;
  reason: string;
  landscape: 'snow' | 'snow-patchy' | null;
}

const FRESH_FOR_MS = 3 * 60 * 60_000;
// Art-direction bands, not a measurement of fractional snow cover. A coarse model
// depth cannot describe each clearing, tree canopy or patch of the painted scene.
const PATCHY_DEPTH_M = 0.005;
const COVERED_DEPTH_M = 0.05;

/**
 * Snow lying on the ground is independent of snowfall, temperature and foliage.
 * Open-Meteo defines snow_depth as instantaneous ground depth in metres, whereas
 * snowfall describes new precipitation: https://open-meteo.com/en/docs
 * No permanent land-ice mask is available here; climate zone or country must not
 * manufacture one. A fresh model zero means no modeled snow, not no glacial ice.
 */
export function resolveGround(now: Date, environment: Environment | null, previewWeather?: string, previewGround?: string): GroundState {
  if (previewGround === 'bare' || previewGround === 'patchy' || previewGround === 'covered') {
    const landscape = previewGround === 'covered' ? 'snow' : previewGround === 'patchy' ? 'snow-patchy' : null;
    const label = previewGround === 'covered' ? 'Snow cover preview' : previewGround === 'patchy' ? 'Patchy snow preview' : 'Bare ground preview';
    return { state: previewGround, snowDepthM: null, source: 'preview', landscape, label,
      reason: 'The explicit ground preview overrides modeled depth and the weather preview; no measured depth is implied.' };
  }
  if (previewWeather === 'snow') {
    return { state: 'covered', snowDepthM: null, source: 'preview', landscape: 'snow',
      label: 'Snow cover preview', reason: 'The manual snow preview shows covered ground; no measured depth is implied.' };
  }

  const weather = environment?.weather;
  const observedAt = weather ? Date.parse(weather.observedAt) : Number.NaN;
  const age = Math.abs(now.getTime() - observedAt);
  const depth = weather?.snowDepthM;
  if (!Number.isFinite(age) || age >= FRESH_FOR_MS) {
    return { state: 'unknown', snowDepthM: null, source: 'unavailable', landscape: null,
      label: 'Ground snow unknown', reason: 'No fresh ground-depth observation is available; normal foliage remains visible.' };
  }
  if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0 || depth > 100) {
    return { state: 'unknown', snowDepthM: null, source: 'unavailable', landscape: null,
      label: 'Ground snow unknown', reason: 'Modeled snow depth is unavailable or invalid; falling snow alone does not establish ground cover.' };
  }

  if (depth < PATCHY_DEPTH_M) {
    return { state: 'bare', snowDepthM: depth, source: 'modeled-depth', landscape: null,
      label: depth === 0 ? 'No modeled ground snow' : 'Trace ground snow',
      reason: depth === 0 ? 'The fresh model reports zero ground snow, independently of current flakes or air temperature.'
        : 'Modeled ground snow is under 0.5 cm, below the artistic threshold for a visible snow plate.' };
  }
  if (depth < COVERED_DEPTH_M) {
    return { state: 'patchy', snowDepthM: depth, source: 'modeled-depth', landscape: 'snow-patchy',
      label: 'Patchy ground snow', reason: 'A modeled depth from 0.5 to under 5 cm selects a patchy artistic interpretation, not a measured coverage fraction.' };
  }
  return { state: 'covered', snowDepthM: depth, source: 'modeled-depth', landscape: 'snow',
    label: 'Snow-covered ground', reason: 'A modeled depth of at least 5 cm selects the snow-covered artwork; current precipitation and air temperature do not erase an existing pack.' };
}
