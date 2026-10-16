import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp, createEnvironmentService, manualLocation, publicIp } from './environment.mjs';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const LOCATION = { success: true, latitude: 43.6532, longitude: -79.3832, city: 'Toronto', country_code: 'CA', timezone: { id: 'America/Toronto' } };
const WEATHER = {
  elevation: 162,
  current: { time: NOW / 1000, temperature_2m: 10, is_day: 1, precipitation: 0.2, rain: 0.2, snowfall: 0,
    weather_code: 61, cloud_cover: 85, wind_speed_10m: 8, wind_direction_10m: 290 },
  daily: { sunrise: [NOW / 1000 - 3600], sunset: [NOW / 1000 + 36000] },
};
function historyFixture(endDate = '2026-10-15', days = 28) {
  const lastDay = Date.parse(`${endDate}T00:00:00Z`);
  return {
    elevation: 165,
    daily_units: { time: 'iso8601', temperature_2m_mean: '°C', temperature_2m_min: '°C', temperature_2m_max: '°C', precipitation_sum: 'mm', snowfall_sum: 'cm' },
    daily: {
      time: Array.from({ length: days }, (_, i) => new Date(lastDay - (days - i - 1) * 86_400_000).toISOString().slice(0, 10)),
      temperature_2m_mean: Array(days).fill(8), temperature_2m_min: Array(days).fill(2), temperature_2m_max: Array(days).fill(14),
      precipitation_sum: Array(days).fill(1.25), snowfall_sum: Array(days).fill(0),
    },
  };
}
function mockProvider({ location = LOCATION, weather = WEATHER, history = historyFixture() } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json(new URL(url).hostname === 'ipwho.is' ? location : new URL(url).searchParams.has('past_days') ? history : weather);
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

test('heavy thunderstorm WMO code 97 remains a valid live observation', async () => {
  const weather = { ...WEATHER, current: { ...WEATHER.current, weather_code: 97 } };
  const result = await make(mockProvider({ weather })).get('8.8.8.8');
  assert.equal(result.status, 'live');
  assert.equal(result.weather.weatherCode, 97);
});

test('cache deduplicates concurrent lookups and shares coarse weather cells without sharing city labels', async () => {
  const provider = mockProvider();
  const service = make(provider);
  await Promise.all([service.get('8.8.8.8'), service.get('8.8.8.8')]);
  assert.equal(provider.calls.length, 3);
  await service.get('1.1.1.1');
  assert.equal(provider.calls.length, 4);
  assert.equal(provider.calls.filter(call => call.url.searchParams.has('current')).length, 1);
  assert.equal(provider.calls.filter(call => call.url.searchParams.has('past_days')).length, 1);
});

test('budgets and per-client request limits bound third-party usage', async () => {
  const provider = mockProvider();
  const service = createEnvironmentService({ ...provider, now: () => NOW, geoDailyLimit: 1 });
  assert.equal((await service.get('8.8.8.8')).status, 'live');
  assert.equal((await service.get('1.1.1.1')).status, 'unavailable');
  for (let i = 0; i < 29; i++) await service.get('8.8.8.8');
  assert.equal((await service.get('8.8.8.8')).reason, 'rate-limited');
  assert.equal(provider.calls.length, 3);
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
  assert.equal(provider.calls.length, 2);
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
    return Response.json(url.pathname.includes('search') ? {} : url.searchParams.has('past_days') ? historyFixture() : WEATHER);
  } });
  const result = await service.get(null, manual());
  await service.places('Toronto', null);
  assert.equal(calls[0].hostname, 'customer-api.open-meteo.com');
  assert.equal(calls[1].hostname, 'customer-api.open-meteo.com');
  assert.equal(calls[1].searchParams.get('past_days'), '28');
  assert.equal(calls[1].searchParams.get('apikey'), 'test-key');
  assert.equal(calls[2].hostname, 'customer-geocoding-api.open-meteo.com');
  assert.equal(calls[0].searchParams.get('apikey'), 'test-key');
  assert.ok(!JSON.stringify(result).includes('test-key'));
});

test('recent history aggregates complete days independently of the current temperature', async () => {
  const history = historyFixture();
  history.daily.temperature_2m_min[0] = -2;
  history.daily.temperature_2m_min[1] = 0;
  history.daily.snowfall_sum[0] = 1.5;
  const weather = { ...WEATHER, current: { ...WEATHER.current, temperature_2m: -30 } };
  const provider = mockProvider({ history, weather });
  const result = await make(provider).get(null, manual());
  assert.equal(result.status, 'live');
  assert.equal(result.weather.temperatureC, -30);
  assert.equal(result.elevationM, 162);
  assert.deepEqual(result.climateHistory, { sampleDays: 28, startDate: '2026-09-18', endDate: '2026-10-15',
    meanTemperatureC: 8, meanMinTemperatureC: 1.79, meanMaxTemperatureC: 14, precipitationMm: 35, freezeDays: 2, snowfallCm: 1.5 });
  const query = provider.calls[1].url.searchParams;
  assert.equal(query.get('latitude'), '43.7');
  assert.equal(query.get('timezone'), 'America/Toronto');
  assert.equal(query.get('forecast_days'), '0');
  assert.equal(query.get('past_days'), '28');
  assert.equal(query.get('timeformat'), 'iso8601');
  assert.equal(query.get('daily').split(',').length, 5);
});

test('history discards incomplete rows, requires fourteen recent complete days, and validates units and dates', async () => {
  const partial = historyFixture();
  for (let i = 0; i < 14; i++) partial.daily.temperature_2m_mean[i] = null;
  const result = await make(mockProvider({ history: partial })).get(null, manual());
  assert.equal(result.climateHistory.sampleDays, 14);
  assert.equal(result.climateHistory.meanTemperatureC, 8);
  assert.equal(result.climateHistory.precipitationMm, 17.5);
  const tooFew = structuredClone(partial);
  tooFew.daily.temperature_2m_mean[14] = null;
  const inconsistent = historyFixture();
  inconsistent.daily.temperature_2m_max.fill(1);
  const invalidUnits = historyFixture();
  invalidUnits.daily_units.temperature_2m_mean = '°F';
  const duplicate = historyFixture();
  duplicate.daily.time[1] = duplicate.daily.time[0];
  const missingArray = historyFixture();
  missingArray.daily.snowfall_sum.pop();
  const invalidDates = historyFixture();
  invalidDates.daily.time.fill('2026-02-30');
  for (const history of [tooFew, inconsistent, invalidUnits, duplicate, missingArray, invalidDates, historyFixture('2026-10-12'), historyFixture('2026-09-01')]) {
    const response = await make(mockProvider({ history })).get(null, manual());
    assert.equal(response.status, 'live');
    assert.equal(response.climateHistory, null);
    assert.equal(response.weather.temperatureC, 10);
  }
});

test('history uses the selected local date and excludes today, future, and older-than-window rows', async () => {
  // UTC is already October 16, while Toronto is still October 15.
  const clock = Date.parse('2026-10-16T01:00:00Z');
  const history = historyFixture('2026-10-17', 32);
  const weather = { ...WEATHER, current: { ...WEATHER.current, time: clock / 1000 } };
  const response = await createEnvironmentService({ ...mockProvider({ history, weather }), now: () => clock }).get(null, manual());
  assert.equal(response.status, 'live');
  assert.equal(response.climateHistory.startDate, '2026-09-17');
  assert.equal(response.climateHistory.endDate, '2026-10-14');
  assert.equal(response.climateHistory.sampleDays, 28);
});

test('history failure, timeout, oversized response or exhausted budget never invalidates live weather', async () => {
  for (const historyResponse of [
    () => { throw new DOMException('Timeout', 'TimeoutError'); },
    () => new Response('', { status: 503 }),
    () => new Response('x'.repeat(70_000)),
    () => Response.json(null),
  ]) {
    const service = createEnvironmentService({ now: () => NOW, fetchImpl: async url => url.searchParams.has('past_days') ? historyResponse() : Response.json(WEATHER) });
    const response = await service.get(null, manual());
    assert.equal(response.status, 'live');
    assert.equal(response.climateHistory, null);
    assert.equal(response.elevationM, 162);
  }
  const provider = mockProvider();
  const service = createEnvironmentService({ ...provider, now: () => NOW, historyDailyLimit: 1 });
  assert.equal((await service.get(null, manual())).climateHistory.sampleDays, 28);
  const next = await service.get(null, { ...manual(), latitude: 44 });
  assert.equal(next.status, 'live');
  assert.equal(next.climateHistory, null);
  assert.equal(provider.calls.filter(call => call.url.searchParams.has('past_days')).length, 1);
});

test('valid history survives current-weather failure and invalid elevation does not corrupt conditions', async () => {
  const provider = mockProvider({ weather: { ...WEATHER, current: null } });
  const result = await make(provider).get(null, manual());
  assert.equal(result.status, 'location-only');
  assert.equal(result.weather, null);
  assert.equal(result.climateHistory.sampleDays, 28);
  assert.equal(result.elevationM, 165);
  for (const value of [null, '162', Infinity, -1000, 10000]) {
    const weather = { ...WEATHER, elevation: value };
    const history = { ...historyFixture(), elevation: value };
    const response = await make(mockProvider({ weather, history })).get(null, manual());
    assert.equal(response.status, 'live');
    assert.equal(response.elevationM, null);
  }
});

test('current weather and history start concurrently, with separate ten-minute and daily caches', async () => {
  let clock = NOW;
  const started = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const service = createEnvironmentService({ now: () => clock, fetchImpl: async url => {
    const isHistory = url.searchParams.has('past_days');
    started.push(isHistory ? 'history' : 'weather');
    await blocked;
    return Response.json(isHistory ? historyFixture(new Date(clock - 86_400_000).toISOString().slice(0, 10))
      : { ...WEATHER, current: { ...WEATHER.current, time: clock / 1000 } });
  } });
  const pending = service.get(null, manual());
  assert.deepEqual(started, ['weather', 'history']);
  release();
  await pending;
  clock += 11 * 60_000;
  await service.get(null, manual());
  assert.deepEqual(started, ['weather', 'history', 'weather']);
  clock += 24 * 60 * 60_000;
  await service.get(null, manual());
  assert.deepEqual(started, ['weather', 'history', 'weather', 'weather', 'history']);
});

test('repeated history failures are briefly cached and retry independently of current weather', async () => {
  let clock = NOW;
  let historyCalls = 0;
  let weatherCalls = 0;
  const service = createEnvironmentService({ now: () => clock, fetchImpl: async url => {
    if (url.searchParams.has('past_days')) { historyCalls++; throw new Error('History unavailable'); }
    weatherCalls++;
    return Response.json({ ...WEATHER, current: { ...WEATHER.current, time: clock / 1000 } });
  } });
  assert.equal((await service.get(null, manual())).status, 'live');
  clock += 2 * 60_000;
  assert.equal((await service.get(null, manual())).status, 'live');
  assert.equal(historyCalls, 1);
  assert.equal(weatherCalls, 1);
  clock += 9 * 60_000;
  const retry = await service.get(null, manual());
  assert.equal(retry.status, 'live');
  assert.equal(retry.climateHistory, null);
  assert.equal(historyCalls, 2);
  assert.equal(weatherCalls, 2);
});

test('history-only outage retains the last good window after daily expiry while current weather updates', async () => {
  let clock = NOW;
  let historyCalls = 0;
  let weatherCalls = 0;
  const service = createEnvironmentService({ now: () => clock, fetchImpl: async url => {
    if (url.searchParams.has('past_days')) {
      historyCalls++;
      if (historyCalls > 1) throw new Error('History unavailable');
      return Response.json(historyFixture());
    }
    weatherCalls++;
    return Response.json({ ...WEATHER, elevation: null,
      current: { ...WEATHER.current, time: clock / 1000, temperature_2m: weatherCalls === 1 ? 10 : 23 } });
  } });
  const first = await service.get(null, manual());
  clock += 24 * 60 * 60_000 + 1;
  const refreshed = await service.get(null, manual());
  assert.equal(refreshed.status, 'live');
  assert.equal(refreshed.weather.temperatureC, 23);
  assert.equal(refreshed.weather.observedAt, new Date(clock).toISOString());
  assert.deepEqual(refreshed.climateHistory, first.climateHistory);
  assert.equal(refreshed.climateHistory.endDate, '2026-10-15');
  assert.equal(refreshed.elevationM, 165);
  clock += 2 * 60_000;
  assert.deepEqual((await service.get(null, manual())).climateHistory, first.climateHistory);
  assert.equal(historyCalls, 2, 'fallback must not add a provider request or defeat the failure cache');
  assert.equal(weatherCalls, 2);
});

test('last good history is isolated by coarse coordinates and time zone', async () => {
  let historyCalls = 0;
  const service = createEnvironmentService({ now: () => NOW, fetchImpl: async url => {
    if (url.searchParams.has('past_days')) {
      historyCalls++;
      if (historyCalls > 1) throw new Error('History unavailable');
      return Response.json(historyFixture());
    }
    return Response.json(WEATHER);
  } });
  const original = await service.get(null, manual());
  assert.equal(original.climateHistory.sampleDays, 28);
  for (const location of [{ ...manual(), latitude: 44 }, { ...manual(), timeZone: 'UTC' }]) {
    const changed = await service.get(null, location);
    assert.equal(changed.status, 'live');
    assert.equal(changed.climateHistory, null);
  }
  assert.deepEqual((await service.get(null, { ...manual(), city: 'Another label' })).climateHistory, original.climateHistory);
});

test('history fallback expires six days after success and failed refreshes cannot extend its lifetime', async () => {
  let clock = NOW;
  let historyCalls = 0;
  const service = createEnvironmentService({ now: () => clock, fetchImpl: async url => {
    if (url.searchParams.has('past_days')) {
      historyCalls++;
      if (historyCalls > 1) return Response.json({ error: true });
      return Response.json(historyFixture());
    }
    return Response.json({ ...WEATHER, current: { ...WEATHER.current, time: clock / 1000 } });
  } });
  const original = await service.get(null, manual());
  clock = NOW + 5 * 24 * 60 * 60_000;
  assert.deepEqual((await service.get(null, manual())).climateHistory, original.climateHistory);
  clock = NOW + 6 * 24 * 60 * 60_000;
  const expired = await service.get(null, manual());
  assert.equal(expired.status, 'live');
  assert.equal(expired.weather.observedAt, new Date(clock).toISOString());
  assert.equal(expired.climateHistory, null);
  assert.equal(historyCalls, 3);
});
