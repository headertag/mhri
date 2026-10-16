import { createHmac, randomBytes } from 'node:crypto';
import { BlockList, isIP } from 'node:net';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SOURCES = { location: 'https://ipwhois.io/', weather: 'https://open-meteo.com/' };
const WMO_CODES = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99]);
const reserved = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) reserved.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
]) reserved.addSubnet(network, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

/** Only public, unicast addresses go to the fixed geolocation provider. */
export function publicIp(value) {
  if (typeof value !== 'string' || value.length > 45 || value !== value.trim() || value.includes('%')) return null;
  const family = isIP(value);
  if (family === 4) return reserved.check(value, 'ipv4') ? null : value;
  if (family === 6 && globalV6.check(value, 'ipv6') && !reserved.check(value, 'ipv6')) return value.toLowerCase();
  return null;
}

export function clientIp(request, onFly = Boolean(process.env.FLY_APP_NAME)) {
  // Fly overwrites this header at its edge. Never trust arbitrary X-Forwarded-For.
  // Local development deliberately has no IP location rather than locating the server.
  if (!onFly) return null;
  return publicIp(request.headers['fly-client-ip']);
}

class BoundedCache {
  constructor(max, now) { this.max = max; this.now = now; this.entries = new Map(); }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.entries.delete(key); return undefined; }
    return entry.value;
  }
  set(key, value, ttl) {
    this.entries.delete(key);
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, { value, expires: this.now() + ttl });
  }
}

function finite(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid provider value');
  return value;
}
function text(value, max = 100) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}
function iso(seconds) { return new Date(finite(seconds, 0, 4_102_444_800) * 1000).toISOString(); }
function timeZone(value) {
  if (typeof value !== 'string' || value.length > 80) throw new Error('Invalid timezone');
  new Intl.DateTimeFormat('en', { timeZone: value }).format();
  return value;
}
export function manualLocation(params) {
  if (!['latitude', 'longitude', 'timeZone', 'city', 'countryCode'].some(name => params.has(name))) return null;
  const number = name => {
    const value = params.get(name);
    if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid coordinates');
    return Number(value);
  };
  const city = params.get('city');
  if (!city?.trim() || city.length > 100 || /[\u0000-\u001f\u007f]/.test(city)) throw new Error('Invalid city');
  const countryCode = params.get('countryCode');
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Invalid country');
  return {
    latitude: Math.round(finite(number('latitude'), -90, 90) * 10) / 10,
    longitude: Math.round(finite(number('longitude'), -180, 180) * 10) / 10,
    timeZone: timeZone(params.get('timeZone')), city: city.trim(), countryCode: countryCode || null,
    approximate: true, source: 'city',
  };
}

function locationFrom(data) {
  if (data.success !== true) throw new Error('Location unavailable');
  return {
    latitude: Math.round(finite(data.latitude, -90, 90) * 10) / 10,
    longitude: Math.round(finite(data.longitude, -180, 180) * 10) / 10,
    timeZone: timeZone(data.timezone?.id),
    city: text(data.city),
    countryCode: typeof data.country_code === 'string' && /^[A-Z]{2}$/.test(data.country_code) ? data.country_code : null,
    approximate: true, source: 'ip',
  };
}
function weatherFrom(data, now) {
  const c = data.current;
  if (!c || !WMO_CODES.has(c.weather_code) || (c.is_day !== 0 && c.is_day !== 1)) throw new Error('Weather unavailable');
  const observedAt = iso(c.time);
  // Reject a stale or implausibly future provider response rather than presenting it as current.
  if (Math.abs(Date.parse(observedAt) - now) > 3 * HOUR) throw new Error('Weather stale');
  const solar = name => {
    const value = data.daily?.[name]?.[0];
    return typeof value === 'number' && value > 0 ? iso(value) : null;
  };
  return {
    weather: {
      observedAt,
      temperatureC: finite(c.temperature_2m, -100, 70),
      weatherCode: c.weather_code,
      cloudCover: finite(c.cloud_cover, 0, 100),
      precipitationMm: finite(c.precipitation, 0, 1000),
      rainMm: finite(c.rain, 0, 1000),
      snowfallCm: finite(c.snowfall, 0, 1000),
      windSpeedKmh: finite(c.wind_speed_10m, 0, 500),
      windDirectionDeg: finite(c.wind_direction_10m, 0, 360),
      isDay: c.is_day === 1,
    },
    sun: { sunrise: solar('sunrise'), sunset: solar('sunset') },
    fetchedAt: new Date(now).toISOString(),
  };
}

export function createEnvironmentService({ fetchImpl = fetch, now = Date.now, timeoutMs = 3500,
  weatherApiKey = process.env.OPEN_METEO_API_KEY, geoDailyLimit = 900,
  weatherDailyLimit = 9000, maxConcurrent = 16 } = {}) {
  // One process-local salt: cached identities cannot be correlated between restarts.
  // Raw IPs exist only for the outgoing lookup; neither requests nor IPs are logged.
  const salt = randomBytes(32);
  const identify = ip => createHmac('sha256', salt).update(ip).digest('hex');
  const geo = new BoundedCache(2048, now);
  const weather = new BoundedCache(512, now);
  const rates = new BoundedCache(2048, now);
  const places = new BoundedCache(256, now);
  const pendingGeo = new Map();
  const pendingWeather = new Map();
  const pendingPlaces = new Map();
  const budgets = new Map();
  let active = 0;

  function budget(provider, limit) {
    let state = budgets.get(provider);
    if (!state || state.reset <= now()) { state = { count: 0, reset: now() + DAY }; budgets.set(provider, state); }
    if (state.count >= limit) throw new Error('Budget reached');
    state.count += 1;
  }
  async function json(url, provider, limit) {
    if (active >= maxConcurrent) throw new Error('Provider busy');
    budget(provider, limit);
    active += 1;
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (response.status === 429) {
        const retryAfter = Math.min(DAY / 1000, Math.max(60, Number(response.headers.get('retry-after')) || 60));
        budgets.set(provider, { count: limit, reset: now() + retryAfter * 1000 });
      }
      if (!response.ok) throw new Error('Provider unavailable');
      // Both providers return small JSON documents. Bound even a misbehaving response.
      if (Number(response.headers.get('content-length')) > 65_536) throw new Error('Provider response too large');
      const reader = response.body.getReader();
      let length = 0;
      const chunks = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 65_536) { await reader.cancel(); throw new Error('Provider response too large'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { active -= 1; }
  }
  async function memo(cache, pending, key, ttl, loader) {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxConcurrent) return null;
    const promise = (async () => {
      try {
        const value = await loader();
        cache.set(key, value, ttl);
        return value;
      } catch {
        cache.set(key, null, MINUTE);
        return null;
      } finally { pending.delete(key); }
    })();
    pending.set(key, promise);
    return promise;
  }
  const base = () => ({ version: 1, status: 'unavailable', location: null, weather: null, sun: null,
    fetchedAt: new Date(now()).toISOString(), sources: SOURCES });
  function tooFrequent(ip) {
    const key = identify(publicIp(ip) || 'local');
    const recent = rates.get(key) || 0;
    if (recent >= 30) return true;
    rates.set(key, recent + 1, MINUTE);
    return false;
  }

  return {
    async places(query, ip) {
      if (tooFrequent(ip)) return { places: [], reason: 'rate-limited' };
      const queryText = query.trim();
      if (queryText.length < 2 || queryText.length > 80 || /[\u0000-\u001f\u007f]/.test(queryText)) throw new Error('Invalid search');
      const result = await memo(places, pendingPlaces, queryText.toLowerCase(), HOUR, async () => {
        const url = new URL(weatherApiKey ? 'https://customer-geocoding-api.open-meteo.com/v1/search' : 'https://geocoding-api.open-meteo.com/v1/search');
        url.search = new URLSearchParams({ name: queryText, count: '5', language: 'en', format: 'json',
          ...(weatherApiKey ? { apikey: weatherApiKey } : {}) }).toString();
        const data = await json(url, 'places', 1000);
        if (data.error || (data.results !== undefined && !Array.isArray(data.results))) throw new Error('Search unavailable');
        return (data.results || []).slice(0, 5).flatMap(place => {
          try {
            const id = finite(place.id, 0, Number.MAX_SAFE_INTEGER);
            const name = text(place.name);
            if (!name) return [];
            return [{ id, name, region: text(place.admin1), countryCode: /^[A-Z]{2}$/.test(place.country_code) ? place.country_code : null,
              latitude: Math.round(finite(place.latitude, -90, 90) * 10) / 10,
              longitude: Math.round(finite(place.longitude, -180, 180) * 10) / 10,
              timeZone: timeZone(place.timezone) }];
          } catch { return []; }
        });
      });
      return result ? { places: result } : { places: [], unavailable: true };
    },
    async get(ip, selectedLocation = null) {
      if (tooFrequent(ip)) return { ...base(), reason: 'rate-limited' };
      if (!selectedLocation && !publicIp(ip)) return { ...base(), reason: 'location-unavailable' };
      const key = selectedLocation ? null : identify(ip);
      const location = selectedLocation || await memo(geo, pendingGeo, key, HOUR, async () => locationFrom(
        await json(new URL(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,country_code,latitude,longitude,timezone.id`), 'geo', geoDailyLimit),
      ));
      if (!location) return { ...base(), reason: 'location-unavailable' };
      const cell = `${location.latitude},${location.longitude},${location.timeZone}`;
      const conditions = await memo(weather, pendingWeather, cell, 10 * MINUTE, async () => {
        const url = new URL(weatherApiKey ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast');
        url.search = new URLSearchParams({
          latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timeZone,
          current: 'temperature_2m,is_day,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m',
          daily: 'sunrise,sunset', forecast_days: '1', timeformat: 'unixtime',
          temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm',
          ...(weatherApiKey ? { apikey: weatherApiKey } : {}),
        }).toString();
        return weatherFrom(await json(url, 'weather', weatherDailyLimit), now());
      });
      if (!conditions) return { ...base(), status: 'location-only', location, reason: 'weather-unavailable' };
      return { ...base(), ...conditions, status: 'live', location };
    },
  };
}
