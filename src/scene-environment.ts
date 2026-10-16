import { classifyWeather, getMoonOpacity, getSeason, getSkyState, type Season, type SkyPeriod, type SkyState, type WeatherState } from './scene-astronomy.ts';
import type { Environment } from './environment';
import type { ScenePreview } from './environment-settings';

export interface SceneEnvironment {
  enabled: boolean;
  period: SkyPeriod;
  season: Season;
  weather: WeatherState;
  sky: SkyState | null;
  moonOpacity: number;
  landscape: string;
  skyImage: string;
  skyFilter: string;
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

/** Time, season and weather stay independent; winter alone never implies falling snow. */
export function resolveScene(enabled: boolean, data: Environment | null, now: Date, preview: ScenePreview): SceneEnvironment {
  const location = data?.location;
  const sky = location ? getSkyState(now, location.latitude, location.longitude) : null;
  const period = (times.has(preview.time) ? preview.time : sky?.period || clockPeriod(now, location?.timeZone)) as SkyPeriod;
  const season = (seasons.has(preview.season) ? preview.season : location ? getSeason(now, location.latitude, location.timeZone) : 'summer') as Season;
  const fresh = data?.weather && Math.abs(now.getTime() - Date.parse(data.weather.observedAt)) < 3 * 60 * 60_000 ? data.weather : null;
  const weather = preview.weather in weatherCodes ? classifyWeather(weatherCodes[preview.weather]) : fresh ? classifyWeather(fresh.weatherCode, fresh.cloudCover) : classifyWeather(-1, 40);
  const isPreview = times.has(preview.time) || seasons.has(preview.season) || preview.weather in weatherCodes;
  // Previewing night preserves today's phase but places it at a demonstration altitude.
  // Live mode never shows a moon that is below the observer's horizon.
  const moonSky = preview.time === 'night'
    ? { ...(sky || getSkyState(now, 0, 0)), period: 'night' as const, moonAltitude: 40, moonAboveHorizon: true }
    : sky ? { ...sky, period } : null;
  let plate: string = season === 'tropical' ? 'summer' : season;
  if (weather.precipitation === 'snow') plate = 'snow';
  else if (weather.precipitation === 'rain' || weather.precipitation === 'hail') {
    // Keep autumn leaves and dormant winter trees when it rains. The painted
    // wet-weather plate has summer foliage; particles and light work in every season.
    if (season === 'summer' || season === 'tropical') plate = 'rain';
  }
  else if (season === 'summer' || season === 'tropical') plate = period === 'day' ? 'summer' : period;
  if (weather.obscuresMoon && plate === 'night') plate = 'summer';
  const timeAlreadyPainted = plate === period;
  let landscapeFilter = period === 'night' ? (timeAlreadyPainted ? 'brightness(.94) saturate(.88)' : 'brightness(.39) saturate(.38)')
    : period === 'dusk' ? (timeAlreadyPainted ? 'none' : 'brightness(.76) sepia(.18) saturate(.88)')
    : period === 'dawn' ? (timeAlreadyPainted ? 'none' : 'brightness(.91) sepia(.12) saturate(.88)') : 'none';
  if (weather.kind === 'fog') landscapeFilter += ' saturate(.72) contrast(.88)';
  else if (weather.precipitation === 'rain' || weather.precipitation === 'hail') landscapeFilter += ' brightness(.88) saturate(.84)';
  const figureFilter = period === 'night' ? 'brightness(.62) saturate(.72)' : period === 'dusk' ? 'brightness(.86) sepia(.1) saturate(.92)' : period === 'dawn' ? 'brightness(.96) sepia(.07)' : weather.obscuresMoon ? 'brightness(.90) saturate(.92)' : 'none';
  const heavyCloud = weather.obscuresMoon || weather.precipitation !== 'none';
  const skyImage = heavyCloud ? art('overcast-sky') : period === 'night' ? art('night-sky') : period === 'dawn' || period === 'dusk' ? art(`${period}-sky`) : weather.cloudCover < 35 ? art('clear-sky') : '/art/cloud-sky.png';
  const skyFilter = heavyCloud ? period === 'night' ? 'brightness(.16) saturate(.4)' : period === 'dusk' ? 'brightness(.55) sepia(.12)' : period === 'dawn' ? 'brightness(.78) sepia(.10)' : 'none' : 'none';
  const temperature = fresh ? ` · ${Math.round(fresh.temperatureC)}°C` : '';
  const phase = period === 'night' && moonSky ? ` · ${moonSky.phaseName.toLowerCase()}${!isPreview && !moonSky.moonAboveHorizon ? ' below the horizon' : weather.obscuresMoon ? ' behind clouds' : ''}` : '';
  const description = `${isPreview ? 'Preview · ' : ''}${period[0].toUpperCase() + period.slice(1)} · ${season === 'tropical' ? 'tropical foliage' : season} · ${weather.label.toLowerCase()}${temperature}${phase}`;
  return { enabled, period, season, weather, sky: moonSky, moonOpacity: enabled && moonSky ? getMoonOpacity(moonSky, weather) : 0, landscape: enabled ? art(plate) : '/art/landscape-wide.png', skyImage: enabled ? skyImage : '/art/cloud-sky.png', skyFilter:enabled?skyFilter:'none', landscapeFilter: enabled ? landscapeFilter.trim().replace(/^none /, '') : 'none', figureFilter: enabled ? figureFilter : 'none', windSpeedKmh: fresh?.windSpeedKmh ?? 6, windDirectionDeg: fresh?.windDirectionDeg ?? 250, description, preview: isPreview };
}
