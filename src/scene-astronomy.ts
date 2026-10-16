import * as SunCalc from 'suncalc';

export type SkyPeriod = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'tropical';
export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'freezing-rain' | 'thunderstorm' | 'unknown';
export type PrecipitationKind = 'none' | 'rain' | 'snow' | 'hail';

export interface SkyState {
  period: SkyPeriod;
  /** Apparent altitude above the horizon, in degrees. */
  sunAltitude: number;
  moonAltitude: number;
  /** Degrees clockwise from north. */
  moonAzimuth: number;
  /** CSS clockwise rotation for a disc lit on the right while waxing, left while waning. */
  moonRotation: number;
  /** Bright-limb angle anticlockwise from the observer's zenith, in degrees. */
  moonZenithAngle: number;
  /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter; wraps at 1. */
  phase: number;
  illumination: number;
  waxing: boolean;
  phaseName: string;
  moonAboveHorizon: boolean;
}

export interface WeatherState {
  kind: WeatherKind;
  label: string;
  precipitation: PrecipitationKind;
  /** Visual strength from 0 to 1, not a measured precipitation rate. */
  intensity: number;
  /** Cloud cover as a percentage, matching Open-Meteo. */
  cloudCover: number;
  obscuresMoon: boolean;
}

const phaseNames = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const signedAngle = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function validateDate(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new RangeError('A valid date is required for the sky.');
}

function validateLatitude(latitude: number) {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new RangeError('Latitude must be between -90 and 90.');
}

/**
 * Calculates from a UTC instant and geographic coordinates, without a moon API or fixed lunar cycle.
 * SunCalc 2 uses degrees (unlike SunCalc 1). https://github.com/mourner/suncalc
 * Altitude-based periods also work during polar day/night when sunrise or sunset does not exist.
 */
export function getSkyState(date: Date, latitude: number, longitude: number): SkyState {
  validateDate(date);
  validateLatitude(latitude);
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new RangeError('Longitude must be between -180 and 180.');

  const sun = SunCalc.getPosition(date, latitude, longitude);
  const moon = SunCalc.getMoonPosition(date, latitude, longitude);
  const light = SunCalc.getMoonIllumination(date);
  let period: SkyPeriod;
  if (sun.altitude >= 6) period = 'day';
  else if (sun.altitude < -6) period = 'night';
  else {
    // A symmetric altitude derivative avoids assumptions about hemispheres, time zones or DST.
    const before = SunCalc.getPosition(new Date(date.getTime() - 300_000), latitude, longitude);
    const after = SunCalc.getPosition(new Date(date.getTime() + 300_000), latitude, longitude);
    period = after.altitude >= before.altitude ? 'dawn' : 'dusk';
  }

  const moonZenithAngle = signedAngle(light.angle - moon.parallacticAngle);
  return {
    period,
    sunAltitude: sun.altitude,
    moonAltitude: moon.altitude,
    moonAzimuth: moon.azimuth,
    moonZenithAngle,
    moonRotation: signedAngle(-moonZenithAngle - 90 + (light.waxing ? 0 : 180)),
    phase: light.phase,
    illumination: clamp(light.fraction, 0, 1),
    waxing: light.waxing,
    phaseName: phaseNames[Math.round(light.phase * 8) % 8],
    moonAboveHorizon: moon.altitude > 0,
  };
}

/** Meteorological seasons; tropical locations retain green foliage rather than a fictitious winter. */
export function getSeason(date: Date, latitude: number, timeZone = 'UTC'): Season {
  validateDate(date);
  validateLatitude(latitude);
  if (Math.abs(latitude) < 23.44) return 'tropical';
  let month = date.getUTCMonth();
  try {
    month = Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone }).format(date)) - 1;
  } catch {
    // An unavailable or invalid IANA zone should not prevent the artwork from rendering.
  }
  const seasons: Season[] = ['winter', 'spring', 'summer', 'autumn'];
  const index = Math.floor(((month + 1) % 12) / 3);
  return seasons[(index + (latitude < 0 ? 2 : 0)) % 4];
}

type WeatherDefinition = [WeatherKind, string, PrecipitationKind, number, number];

// Open-Meteo WMO interpretation codes: https://open-meteo.com/en/docs#weathervariables
// Keep freezing precipitation as liquid rain; cold temperature alone does not imply snowfall.
const weatherCodes: Record<number, WeatherDefinition> = {
  0: ['clear', 'Clear sky', 'none', 0, 0],
  1: ['clear', 'Mainly clear', 'none', 0, 15],
  2: ['cloudy', 'Partly cloudy', 'none', 0, 50],
  3: ['overcast', 'Overcast', 'none', 0, 100],
  45: ['fog', 'Fog', 'none', 0.7, 100],
  48: ['fog', 'Freezing fog', 'none', 0.85, 100],
  51: ['drizzle', 'Light drizzle', 'rain', 0.15, 75],
  53: ['drizzle', 'Drizzle', 'rain', 0.25, 85],
  55: ['drizzle', 'Dense drizzle', 'rain', 0.4, 95],
  56: ['freezing-rain', 'Light freezing drizzle', 'rain', 0.2, 85],
  57: ['freezing-rain', 'Dense freezing drizzle', 'rain', 0.4, 95],
  61: ['rain', 'Light rain', 'rain', 0.35, 75],
  63: ['rain', 'Rain', 'rain', 0.65, 90],
  65: ['rain', 'Heavy rain', 'rain', 1, 100],
  66: ['freezing-rain', 'Light freezing rain', 'rain', 0.35, 85],
  67: ['freezing-rain', 'Heavy freezing rain', 'rain', 0.9, 100],
  71: ['snow', 'Light snow', 'snow', 0.3, 75],
  73: ['snow', 'Snow', 'snow', 0.6, 90],
  75: ['snow', 'Heavy snow', 'snow', 1, 100],
  77: ['snow', 'Snow grains', 'snow', 0.2, 80],
  80: ['rain', 'Rain showers', 'rain', 0.4, 65],
  81: ['rain', 'Moderate rain showers', 'rain', 0.7, 80],
  82: ['rain', 'Heavy rain showers', 'rain', 1, 100],
  85: ['snow', 'Snow showers', 'snow', 0.35, 70],
  86: ['snow', 'Heavy snow showers', 'snow', 0.9, 100],
  95: ['thunderstorm', 'Thunderstorm', 'rain', 0.8, 100],
  96: ['thunderstorm', 'Thunderstorm with hail', 'hail', 0.75, 100],
  97: ['thunderstorm', 'Heavy thunderstorm', 'rain', 1, 100],
  99: ['thunderstorm', 'Thunderstorm with heavy hail', 'hail', 1, 100],
};

/** Classifies every weather code returned by Open-Meteo, with a benign unknown-code fallback. */
export function classifyWeather(code: number, cloudCover?: number): WeatherState {
  const definition = weatherCodes[code];
  let [kind, label, precipitation, intensity, defaultCloud] = definition ?? ['unknown', 'Weather unavailable', 'none', 0, 40] as WeatherDefinition;
  const cover = Number.isFinite(cloudCover) ? clamp(cloudCover!, 0, 100) : defaultCloud;
  if (kind === 'clear' || kind === 'cloudy') {
    if (cover >= 85) { kind = 'overcast'; label = 'Overcast'; }
    else if (cover >= 35) { kind = 'cloudy'; label = 'Partly cloudy'; }
  }
  return { kind, label, precipitation, intensity, cloudCover: cover, obscuresMoon: kind === 'overcast' || kind === 'fog' || kind === 'thunderstorm' || cover >= 85 };
}

/** Visibility belongs to the atmospheric layer; it does not change the calculated lunar phase. */
export function getMoonOpacity(sky: SkyState, weather: WeatherState): number {
  if (!sky.moonAboveHorizon || weather.obscuresMoon) return 0;
  const horizon = smoothstep(0, 5, sky.moonAltitude);
  const cloudTransmission = 1 - smoothstep(20, 85, weather.cloudCover);
  const newMoonFade = smoothstep(0.001, 0.025, sky.illumination);
  // A daytime moon can be above the horizon. Reduce its contrast continuously as
  // the Sun rises, without a discontinuity at a named day/twilight boundary.
  // This is an artistic display treatment, not measured photometric visibility.
  const solarContrast = 1 - .78 * smoothstep(-6, 15, sky.sunAltitude);
  return horizon * cloudTransmission * newMoonFade * solarContrast;
}
