import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp, createEnvironmentService, manualLocation, publicIp } from './environment.mjs';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const LOCATION = { success: true, latitude: 43.6532, longitude: -79.3832, city: 'Toronto', country_code: 'CA', timezone: { id: 'America/Toronto' } };
const WEATHER = {
  current: { time: NOW / 1000, temperature_2m: 10, is_day: 1, precipitation: 0.2, rain: 0.2, snowfall: 0,
    weather_code: 61, cloud_cover: 85, wind_speed_10m: 8, wind_direction_10m: 290 },
  daily: { sunrise: [NOW / 1000 - 3600], sunset: [NOW / 1000 + 36000] },
};
function mockProvider({ location = LOCATION, weather = WEATHER } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json(new URL(url).hostname === 'ipwho.is' ? location : weather);
  } };
}
const make = provider => createEnvironmentService({ ...provider, now: () => NOW });
const manual = () => manualLocation(new URLSearchParams({ latitude: '43.6532', longitude: '-79.3832', timeZone: 'America/Toronto', city: 'Toronto', countryCode: 'CA' }));

test('only valid public addresses are eligible and local/forwarded headers are not trusted', () => {
  for (const value of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.31.0.1', '169.254.1.1', '100.64.1.1', '198.19.0.1', '192.0.2.1', '203.0.113.2', '224.0.0.1', '255.255.255.255', '::1', 'fd00::1', 'fe80::1', '2001:db8::1', '::ffff:8.8.8.8', '8.8.8.8, 1.1.1.1', '8.8.8.8 ', 'https://localhost', '2001:4860::1%lo']) assert.equal(publicIp(value), null, value);
  assert.equal(publicIp('8.8.8.8'), '8.8.8.8');
  assert.equal(publicIp('2001:4860:4860::8888'), '2001:4860:4860::8888');
  assert.equal(clientIp({ headers: { 'fly-client-ip': '8.8.8.8' } }, false), null);
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '8.8.8.8' } }, true), null);
  assert.equal(clientIp({ headers: { 'fly-client-ip': '8.8.8.8' } }, true), '8.8.8.8');
});

test('valid response is city level, rounded before weather lookup, with no visitor IP or precise coordinate', async () => {
  const provider = mockProvider();
  const result = await make(provider).get('8.8.8.8');
  assert.equal(result.status, 'live');
  assert.deepEqual(result.location, { latitude: 43.7, longitude: -79.4, timeZone: 'America/Toronto', city: 'Toronto', countryCode: 'CA', approximate: true, source: 'ip' });
  assert.equal(result.weather.cloudCover, 85);
  assert.equal(result.weather.observedAt, '2026-10-16T12:00:00.000Z');
  assert.equal(result.weather.precipitationMm, 0.2);
  assert.equal(result.sun.sunrise, '2026-10-16T11:00:00.000Z');
  assert.equal(provider.calls[1].url.searchParams.get('latitude'), '43.7');
  assert.equal(provider.calls[1].url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(provider.calls[0].options.redirect, 'error');
  assert.ok(provider.calls[0].options.signal instanceof AbortSignal);
  for (const secret of ['8.8.8.8', '43.6532', '-79.3832']) assert.ok(!JSON.stringify(result).includes(secret));
});

test('missing IP does not locate the server; upstream failures keep location-only and explicit status', async () => {
  const provider = mockProvider();
  assert.equal((await make(provider).get(null)).reason, 'location-unavailable');
  assert.equal(provider.calls.length, 0);
  const unavailable = createEnvironmentService({ now: () => NOW, fetchImpl: async url => {
    if (url.hostname === 'ipwho.is') return Response.json(LOCATION);
    throw new DOMException('Timeout', 'TimeoutError');
  } });
  const result = await unavailable.get('8.8.8.8');
  assert.equal(result.status, 'location-only');
  assert.equal(result.weather, null);
  assert.equal(result.location.city, 'Toronto');
  assert.equal(result.reason, 'weather-unavailable');
});

test('invalid provider values, timezone, and stale observations fail closed', async () => {
  for (const location of [{ ...LOCATION, success: false }, { ...LOCATION, latitude: null }, { ...LOCATION, longitude: 999 }, { ...LOCATION, timezone: { id: 'invalid' } }]) {
    const result = await make(mockProvider({ location })).get('8.8.8.8');
    assert.equal(result.status, 'unavailable');
  }
  for (const current of [{ ...WEATHER.current, cloud_cover: 101 }, { ...WEATHER.current, weather_code: 1000 }, { ...WEATHER.current, time: NOW / 1000 - 20000 }, { ...WEATHER.current, is_day: null }]) {
    assert.equal((await make(mockProvider({ weather: { ...WEATHER, current } })).get('8.8.8.8')).status, 'location-only');
  }
});

test('cache deduplicates concurrent lookups and shares coarse weather cells without sharing city labels', async () => {
  const provider = mockProvider();
  const service = make(provider);
  await Promise.all([service.get('8.8.8.8'), service.get('8.8.8.8')]);
  assert.equal(provider.calls.length, 2);
  await service.get('1.1.1.1');
  assert.equal(provider.calls.length, 3);
  assert.equal(provider.calls.filter(call => call.url.hostname === 'api.open-meteo.com').length, 1);
});

test('budgets and per-client request limits bound third-party usage', async () => {
  const provider = mockProvider();
  const service = createEnvironmentService({ ...provider, now: () => NOW, geoDailyLimit: 1 });
  assert.equal((await service.get('8.8.8.8')).status, 'live');
  assert.equal((await service.get('1.1.1.1')).status, 'unavailable');
  for (let i = 0; i < 29; i++) await service.get('8.8.8.8');
  assert.equal((await service.get('8.8.8.8')).reason, 'rate-limited');
  assert.equal(provider.calls.length, 2);
});

test('provider 429 creates a cooldown and oversized responses are not processed', async () => {
  let calls = 0;
  const service = createEnvironmentService({ now: () => NOW, fetchImpl: async () => {
    calls += 1;
    return new Response('', { status: 429, headers: { 'retry-after': '120' } });
  } });
  await service.get('8.8.8.8');
  await service.get('1.1.1.1');
  assert.equal(calls, 1);
  const large = createEnvironmentService({ now: () => NOW, fetchImpl: async () => new Response('x'.repeat(70_000)) });
  assert.equal((await large.get('8.8.8.8')).status, 'unavailable');
});

test('manual city bypasses IP lookup while retaining rounded coordinates and validated time zone', async () => {
  const provider = mockProvider();
  const result = await make(provider).get(null, manual());
  assert.equal(result.status, 'live');
  assert.equal(result.location.source, 'city');
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].url.hostname, 'api.open-meteo.com');
  assert.equal(manualLocation(new URLSearchParams()), null);
  for (const change of [{ latitude: 'Infinity' }, { longitude: '181' }, { timeZone: 'not/a-zone' }, { city: 'x'.repeat(101) }, { latitude: '' }]) {
    assert.throws(() => manualLocation(new URLSearchParams({ latitude: '43', longitude: '-79', city: 'Toronto', timeZone: 'America/Toronto', ...change })));
  }
});

test('city search handles empty results, validates records, coarsens coordinates, and caches names', async () => {
  const calls = [];
  const service = createEnvironmentService({ now: () => NOW, fetchImpl: async url => {
    calls.push(url);
    return Response.json({ results: [
      { id: 6167865, name: 'Toronto', admin1: 'Ontario', country_code: 'CA', latitude: 43.6532, longitude: -79.3832, timezone: 'America/Toronto' },
      { id: 1, name: 'Invalid', latitude: 999, longitude: 1, timezone: 'UTC' },
    ] });
  } });
  const result = await service.places('Toronto', null);
  assert.deepEqual(result.places, [{ id: 6167865, name: 'Toronto', region: 'Ontario', countryCode: 'CA', latitude: 43.7, longitude: -79.4, timeZone: 'America/Toronto' }]);
  await service.places('toronto', null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hostname, 'geocoding-api.open-meteo.com');
  assert.equal(calls[0].searchParams.get('count'), '5');
  await assert.rejects(service.places('x', null));
  const empty = createEnvironmentService({ fetchImpl: async () => Response.json({}) });
  assert.deepEqual(await empty.places('Nowhere', null), { places: [] });
});

test('commercial key uses reserved weather and geocoding endpoints but never appears in JSON', async () => {
  const calls = [];
  const service = createEnvironmentService({ now: () => NOW, weatherApiKey: 'test-key', fetchImpl: async url => {
    calls.push(url);
    return Response.json(url.pathname.includes('search') ? {} : WEATHER);
  } });
  const result = await service.get(null, manual());
  await service.places('Toronto', null);
  assert.equal(calls[0].hostname, 'customer-api.open-meteo.com');
  assert.equal(calls[1].hostname, 'customer-geocoding-api.open-meteo.com');
  assert.equal(calls[0].searchParams.get('apikey'), 'test-key');
  assert.ok(!JSON.stringify(result).includes('test-key'));
});
