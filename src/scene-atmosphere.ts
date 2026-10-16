import type { SkyPeriod, SkyState, WeatherState } from './scene-astronomy';

export interface AtmosphereState {
  /** Solar lighting only: clouds must be composited separately over this gradient. */
  skyGradient: string;
  starOpacity: number;
  cloudOpacity: number;
  cloudFilter: string;
  fullOvercast: boolean;
  /** Lighting for normally lit artwork; foliage grading is appended by the caller. */
  landscapeFilter: string;
  figureFilter: string;
  shadowStrength: number;
}

type SkyPosition = Pick<SkyState, 'sunAltitude' | 'period'>;
type RGB = readonly [number, number, number];
type Palette = { altitude: number; zenith: RGB; middle: RGB; horizon: RGB; cloudBrightness: number };

const previewAltitude: Record<SkyPeriod, number> = { day: 30, dawn: -2, dusk: -2, night: -24 };
// Painted atmospheric colors, not a radiative-transfer model. Interpolation follows
// solar altitude continuously, including long twilight and polar day/night.
const palettes: readonly Palette[] = [
  { altitude: -18, zenith: [5, 9, 20], middle: [12, 20, 36], horizon: [26, 37, 54], cloudBrightness: .24 },
  { altitude: -12, zenith: [8, 15, 32], middle: [22, 33, 57], horizon: [60, 63, 86], cloudBrightness: .31 },
  { altitude: -6, zenith: [21, 32, 57], middle: [62, 69, 101], horizon: [161, 105, 98], cloudBrightness: .44 },
  { altitude: 0, zenith: [51, 67, 106], middle: [153, 119, 131], horizon: [241, 164, 103], cloudBrightness: .68 },
  { altitude: 6, zenith: [60, 97, 139], middle: [141, 169, 185], horizon: [236, 199, 149], cloudBrightness: .91 },
  { altitude: 30, zenith: [61, 102, 148], middle: [126, 170, 201], horizon: [216, 220, 203], cloudBrightness: 1 },
];
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
function smoothstep(low: number, high: number, value: number) {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}
function paletteAt(altitude: number) {
  if (altitude <= palettes[0].altitude) return palettes[0];
  const upper = palettes.findIndex(palette => palette.altitude >= altitude);
  if (upper < 0) return palettes[palettes.length - 1];
  const a = palettes[upper - 1], b = palettes[upper];
  const amount = smoothstep(a.altitude, b.altitude, altitude);
  const color = (name: 'zenith' | 'middle' | 'horizon'): RGB => [
    mix(a[name][0], b[name][0], amount), mix(a[name][1], b[name][1], amount), mix(a[name][2], b[name][2], amount),
  ];
  return { altitude, zenith: color('zenith'), middle: color('middle'), horizon: color('horizon'), cloudBrightness: mix(a.cloudBrightness, b.cloudBrightness, amount) };
}
const rgb = (color: RGB) => `rgb(${color.map(Math.round).join(', ')})`;

/**
 * Sky color follows the calculated sun. Weather controls the separate cloud plane,
 * star visibility and reflected light on the artwork. When location is unavailable, pass the device-clock period
 * as periodOverride. Manual previews use representative solar altitudes, without
 * modifying the actual lunar phase or position.
 */
export function resolveAtmosphere(sky: SkyPosition | null, weather: WeatherState, periodOverride?: SkyPeriod): AtmosphereState {
  const period = periodOverride ?? sky?.period ?? 'day';
  const representativeAltitude = previewAltitude[period] ?? previewAltitude.day;
  const altitude = periodOverride !== undefined || !sky || !Number.isFinite(sky.sunAltitude)
    ? representativeAltitude : clamp(sky.sunAltitude, -90, 90);
  const palette = paletteAt(altitude);
  const cover = Number.isFinite(weather.cloudCover) ? clamp(weather.cloudCover, 0, 100) : 40;
  const heavyPrecipitation = weather.precipitation !== 'none' && weather.intensity >= .65;
  const fullOvercast = weather.obscuresMoon || cover >= 85 || heavyPrecipitation;
  // Civil twilight suppresses stars; full darkness starts at astronomical night.
  const darkness = 1 - smoothstep(-18, -6, altitude);
  const starOpacity = fullOvercast ? 0 : darkness * (1 - smoothstep(20, 85, cover));
  const cloudOpacity = fullOvercast ? 1 : clamp(cover / 85, 0, .95);
  const warmth = (1 - smoothstep(0, 12, Math.abs(altitude))) * .24;
  const saturation = mix(.55, .95, smoothstep(-18, 6, altitude));
  const solarLight = smoothstep(-18, 12, altitude);
  const cloudShade = fullOvercast ? 1 : smoothstep(10, 90, cover);
  // Clouds soften direct sunlight; at night this adjustment stays restrained so
  // the subject remains readable. No vegetation or season is inferred here.
  const reflectedLight = 1 - cloudShade * mix(.025, .1, solarLight);
  const wet = weather.precipitation === 'rain' || weather.precipitation === 'hail';
  const fog = weather.kind === 'fog';
  const landscapeBrightness = mix(.39, 1, solarLight) * reflectedLight * (wet ? .95 : 1);
  const figureBrightness = mix(.62, 1, solarLight) * reflectedLight;
  const landscapeSaturation = mix(.38, 1, solarLight) * (fog ? .72 : wet ? .92 : 1);
  const figureSaturation = mix(.72, 1, solarLight) * (fog ? .94 : 1);
  const shadowStrength = mix(.3, 1 - .45 * cloudShade, solarLight);
  return {
    skyGradient: `linear-gradient(180deg, ${rgb(palette.zenith)} 0%, ${rgb(palette.middle)} 55%, ${rgb(palette.horizon)} 100%)`,
    starOpacity, cloudOpacity, fullOvercast,
    cloudFilter: `brightness(${palette.cloudBrightness.toFixed(3)}) saturate(${saturation.toFixed(3)}) sepia(${warmth.toFixed(3)})`,
    landscapeFilter: `brightness(${landscapeBrightness.toFixed(3)}) saturate(${landscapeSaturation.toFixed(3)}) sepia(${(warmth * .75).toFixed(3)}) contrast(${fog ? '.88' : '1'})`,
    figureFilter: `brightness(${figureBrightness.toFixed(3)}) saturate(${figureSaturation.toFixed(3)}) sepia(${(warmth * .42).toFixed(3)})`,
    shadowStrength,
  };
}
