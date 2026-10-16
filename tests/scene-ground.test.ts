import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGround } from '../src/scene-ground.ts';
import type { Environment } from '../src/environment';

const now = new Date('2026-01-16T12:00:00Z');
const make = (depth: number | null | undefined, weather: Partial<NonNullable<Environment['weather']>> = {}): Environment => ({
  version: 1, status: 'live', fetchedAt: now.toISOString(), sun: null,
  location: { latitude: 43.7, longitude: -79.4, timeZone: 'America/Toronto', city: 'Toronto', countryCode: 'CA', approximate: true },
  weather: { observedAt: now.toISOString(), temperatureC: -3, weatherCode: 0, cloudCover: 0,
    precipitationMm: 0, rainMm: 0, snowfallCm: 0, snowDepthM: depth,
    windSpeedKmh: 5, windDirectionDeg: 270, isDay: true, ...weather },
});

test('a fresh zero remains bare during winter and falling snow', () => {
  const environment = make(0, { weatherCode: 73, snowfallCm: 0.8, temperatureC: -8 });
  const ground = resolveGround(now, environment);
  assert.equal(ground.state, 'bare');
  assert.equal(ground.snowDepthM, 0);
  assert.equal(ground.landscape, null);
  assert.equal(ground.source, 'modeled-depth');
});

test('an existing snowpack survives clear skies and a temperature above freezing', () => {
  const environment = make(0.22, { temperatureC: 4, weatherCode: 0, snowfallCm: 0 });
  const ground = resolveGround(now, environment);
  assert.equal(ground.state, 'covered');
  assert.equal(ground.landscape, 'snow');
  assert.equal(ground.snowDepthM, 0.22);
  assert.equal(ground.source, 'modeled-depth');
  // A weather preview changes the sky, but only an explicit snow preview changes ground.
  assert.deepEqual(resolveGround(now, environment, 'clear'), ground);
});

test('trace, shallow and substantial depths choose explicit artistic bands', () => {
  for (const [depth, state, landscape] of [
    [0.001, 'bare', null], [0.0049, 'bare', null],
    [0.005, 'patchy', 'snow-patchy'], [0.0499, 'patchy', 'snow-patchy'],
    [0.05, 'covered', 'snow'], [100, 'covered', 'snow'],
  ] as const) {
    const ground = resolveGround(now, make(depth));
    assert.equal(ground.state, state, `${depth} metres`);
    assert.equal(ground.landscape, landscape);
    assert.equal(ground.snowDepthM, depth);
  }
});

test('falling snow without ground depth remains unknown rather than inventing a blanket', () => {
  for (const depth of [null, undefined]) {
    const ground = resolveGround(now, make(depth, { weatherCode: 75, snowfallCm: 3 }));
    assert.equal(ground.state, 'unknown');
    assert.equal(ground.source, 'unavailable');
    assert.equal(ground.landscape, null);
    assert.equal(ground.snowDepthM, null);
  }
});

test('cold tropical or polar locations and historical snow never manufacture current ground snow', () => {
  for (const [latitude, countryCode, koppenCode] of [[1.3, 'SG', 'Af'], [-78, 'AQ', 'EF']] as const) {
    const environment = make(null, { temperatureC: -10 });
    environment.location = { ...environment.location!, latitude, countryCode };
    environment.climate = { koppenCode, group: koppenCode === 'Af' ? 'tropical-rainforest' : 'polar', confidence: 'mapped', source: 'Test grid' };
    environment.climateHistory = { sampleDays: 28, startDate: '2025-12-19', endDate: '2026-01-15',
      meanTemperatureC: -10, meanMinTemperatureC: -15, meanMaxTemperatureC: -5,
      freezeDays: 28, precipitationMm: 100, snowfallCm: 40 };
    assert.equal(resolveGround(now, environment).state, 'unknown');
    environment.weather!.snowDepthM = 0;
    assert.equal(resolveGround(now, environment).state, 'bare');
  }
});

test('unavailable, malformed, stale and implausibly future observations cannot retain snow cover', () => {
  assert.equal(resolveGround(now, null).state, 'unknown');
  assert.equal(resolveGround(now, { ...make(0.2), weather: null }).state, 'unknown');
  for (const observedAt of ['not a date', '2026-01-16T09:00:00Z', '2026-01-15T12:00:00Z', '2026-01-16T16:00:00Z']) {
    const ground = resolveGround(now, make(0.2, { observedAt }));
    assert.equal(ground.state, 'unknown');
    assert.equal(ground.snowDepthM, null);
  }
  for (const depth of [-1, Number.NaN, Number.POSITIVE_INFINITY, 100.01]) {
    assert.equal(resolveGround(now, make(depth)).state, 'unknown');
  }
  assert.equal(resolveGround(new Date('invalid'), make(0.2)).state, 'unknown');
});

test('the explicit snow preview works offline and cannot be mistaken for a measured depth', () => {
  for (const environment of [null, make(0), make(0.2, { observedAt: '2025-01-01T00:00:00Z' })]) {
    const ground = resolveGround(now, environment, 'snow');
    assert.equal(ground.state, 'covered');
    assert.equal(ground.landscape, 'snow');
    assert.equal(ground.source, 'preview');
    assert.equal(ground.snowDepthM, null);
  }
  assert.equal(resolveGround(now, null, 'winter').state, 'unknown');
});

test('explicit ground previews override clear weather, falling snow and modeled depth independently', () => {
  const covered = resolveGround(now, make(0), 'clear', 'covered');
  assert.equal(covered.state, 'covered');
  assert.equal(covered.landscape, 'snow');
  const bare = resolveGround(now, make(0.2), 'snow', 'bare');
  assert.equal(bare.state, 'bare');
  assert.equal(bare.landscape, null);
  const patchy = resolveGround(now, null, 'snow', 'patchy');
  assert.equal(patchy.state, 'patchy');
  assert.equal(patchy.landscape, 'snow-patchy');
  for (const preview of [covered, bare, patchy]) {
    assert.equal(preview.source, 'preview');
    assert.equal(preview.snowDepthM, null);
    assert.match(preview.label, /preview/i);
    assert.match(preview.reason, /preview/i);
  }
});

test('automatic or invalid ground previews preserve depth and the existing snow-weather preview', () => {
  for (const previewGround of [undefined, 'auto', '', 'winter', 'invalid']) {
    const automatic = resolveGround(now, make(0.02), 'clear', previewGround);
    assert.equal(automatic.state, 'patchy');
    assert.equal(automatic.source, 'modeled-depth');
    assert.equal(automatic.snowDepthM, 0.02);
    const snowPreview = resolveGround(now, make(0), 'snow', previewGround);
    assert.equal(snowPreview.state, 'covered');
    assert.equal(snowPreview.source, 'preview');
  }
});
