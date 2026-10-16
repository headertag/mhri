import { classifyWeather, getMoonOpacity, getSeason, getSkyState, type Season, type SkyPeriod, type SkyState, type WeatherState } from './scene-astronomy.ts';
import type { Environment } from './environment';
import type { ScenePreview } from './environment-settings';
import { resolveFoliage, type FoliageState } from './scene-foliage.ts';
import { resolveGround, type GroundState } from './scene-ground.ts';
import { resolveAtmosphere, type AtmosphereState } from './scene-atmosphere.ts';

export interface SceneEnvironment {
  enabled: boolean;
  period: SkyPeriod;
  season: Season;
  foliage: FoliageState;
  ground: GroundState;
  weather: WeatherState;
  sky: SkyState | null;
  moonOpacity: number;
  landscape: string;
  landscapeMask: string;
  cloudImage: string;
  atmosphere: AtmosphereState;
  landscapeFilter: string;
  figureFilter: string;
  windSpeedKmh: number;
  windDirectionDeg: number;
  description: string;
  preview: boolean;
}
const art = (name: string) => `/art/environments/${name}.webp`;
const weatherCodes: Record<string, number> = { clear: 0, cloudy: 2, overcast: 3, rain: 63, snow: 73, fog: 45, thunderstorm: 95 };
const times = new Set(['dawn', 'day', 'dusk', 'night']);
const seasons = new Set(['spring', 'summer', 'autumn', 'winter']);

function clockPeriod(now: Date, timeZone?: string): SkyPeriod {
  let hour = now.getHours();
  try { hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now)); } catch { /* Use the device clock. */ }
  return hour >= 7 && hour < 18 ? 'day' : hour >= 5 && hour < 7 ? 'dawn' : hour >= 18 && hour < 20 ? 'dusk' : 'night';
}

/** Time, foliage, ground cover and precipitation stay independent. */
export function resolveScene(enabled: boolean, data: Environment | null, now: Date, preview: ScenePreview): SceneEnvironment {
  const location = data?.location;
  const sky = location ? getSkyState(now, location.latitude, location.longitude) : null;
  const period = (times.has(preview.time) ? preview.time : sky?.period || clockPeriod(now, location?.timeZone)) as SkyPeriod;
  const season = (seasons.has(preview.season) ? preview.season : location ? getSeason(now, location.latitude, location.timeZone) : 'summer') as Season;
  const automaticFoliage = resolveFoliage(now, location || null, season, data?.climate || null, data?.climateHistory || null, data?.elevationM);
  const foliage: FoliageState = seasons.has(preview.season) ? {
    state: season === 'spring' ? 'fresh' : season === 'autumn' ? 'autumn' : season === 'winter' ? 'dormant' : 'green',
    label: `${season[0].toUpperCase() + season.slice(1)} foliage preview`, reason: 'A manual season preview is selected.',
    landscape: season as 'spring' | 'summer' | 'autumn' | 'winter', filter: 'none', confidence: 'preview',
  } : automaticFoliage;
  const fresh = data?.weather && Math.abs(now.getTime() - Date.parse(data.weather.observedAt)) < 3 * 60 * 60_000 ? data.weather : null;
  const weather = preview.weather in weatherCodes ? classifyWeather(weatherCodes[preview.weather]) : fresh ? classifyWeather(fresh.weatherCode, fresh.cloudCover) : classifyWeather(-1, 40);
  const ground = resolveGround(now, data, preview.weather, preview.ground);
  const isPreview = times.has(preview.time) || seasons.has(preview.season) || preview.weather in weatherCodes || ground.source === 'preview';
  // Previewing night preserves today's phase but places it at a demonstration altitude.
  // Live mode never shows a moon that is below the observer's horizon.
  const previewAltitude: Record<string, number> = {day:30,dawn:-2,dusk:-2,night:-24};
  const moonSky = preview.time === 'night'
    ? { ...(sky || getSkyState(now, 0, 0)), period: 'night' as const, sunAltitude: -24, moonAltitude: 40, moonAboveHorizon: true }
    : sky ? { ...sky, period, sunAltitude: times.has(preview.time) ? previewAltitude[preview.time] : sky.sunAltitude } : null;
  let plate: string = foliage.landscape;
  if (ground.state === 'covered') plate = foliage.state === 'autumn' || foliage.state === 'dormant' ? 'snow' : 'snow-evergreen';
  else if (ground.state === 'patchy') plate = foliage.state === 'autumn' || foliage.state === 'dormant' ? 'snow-patchy-dormant' : 'snow-patchy';
  else if (weather.precipitation === 'rain' || weather.precipitation === 'hail') {
    // A single rain shower must not replace dry, autumn or dormant vegetation.
    if (foliage.state === 'green') plate = 'rain';
  }
  const atmosphere = resolveAtmosphere(sky, weather, times.has(preview.time) || !sky ? period : undefined);
  const landscapeFilter = [atmosphere.landscapeFilter, foliage.filter].filter(filter => filter !== 'none').join(' ');
  const figureFilter = atmosphere.figureFilter;
  const cloudImage = art(atmosphere.fullOvercast ? 'clouds-overcast' : 'clouds-isolated');
  const landscapeMask = `/art/environments/masks/${['winter', 'snow', 'snow-patchy-dormant'].includes(plate) ? 'dormant' : 'leafy'}.svg`;
  const temperature = fresh ? ` · ${Math.round(fresh.temperatureC)}°C` : '';
  const phase = period === 'night' && moonSky ? ` · ${moonSky.phaseName.toLowerCase()}${!isPreview && !moonSky.moonAboveHorizon ? ' below the horizon' : atmosphere.fullOvercast ? ' behind clouds' : ''}` : '';
  const description = `${isPreview ? 'Preview · ' : ''}${period[0].toUpperCase() + period.slice(1)} · ${foliage.label.toLowerCase()} · ${weather.label.toLowerCase()}${temperature}${phase}`;
  return { enabled, period, season, foliage, ground, weather, sky: moonSky, moonOpacity: enabled && moonSky && !atmosphere.fullOvercast ? getMoonOpacity(moonSky, weather) : 0, landscape: enabled ? art(plate) : '/art/landscape-wide.png', landscapeMask: enabled ? landscapeMask : '/art/landscape-foreground-mask-v2.svg', cloudImage, atmosphere, landscapeFilter: enabled ? landscapeFilter.trim().replace(/^none /, '') : 'none', figureFilter: enabled ? figureFilter : 'none', windSpeedKmh: fresh?.windSpeedKmh ?? 6, windDirectionDeg: fresh?.windDirectionDeg ?? 250, description, preview: isPreview };
}
