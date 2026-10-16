import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWeather, getMoonOpacity, getSeason, getSkyState } from '../src/scene-astronomy.ts';

// Independent reference: US Naval Observatory, primary phases for October 2026.
// https://aa.usno.navy.mil/calculated/moon/phases?date=2026-09-01&nump=8
test('new and full moon agree with USNO reference dates', () => {
  const newMoon = getSkyState(new Date('2026-10-10T15:50:00Z'), 43.65, -79.38);
  const fullMoon = getSkyState(new Date('2026-10-26T04:12:00Z'), 43.65, -79.38);
  assert.ok(Math.min(newMoon.phase, 1 - newMoon.phase) < 0.01);
  assert.ok(newMoon.illumination < 0.01);
  assert.equal(newMoon.phaseName, 'New moon');
  assert.ok(Math.abs(fullMoon.phase - 0.5) < 0.01);
  assert.ok(fullMoon.illumination > 0.99);
  assert.equal(fullMoon.phaseName, 'Full moon');
});

test('quarter phases distinguish waxing from waning and preserve the illuminated fraction', () => {
  const waxing = getSkyState(new Date('2026-10-18T16:12:00Z'), 51.5, 0);
  const waning = getSkyState(new Date('2026-10-03T13:25:00Z'), 51.5, 0);
  assert.equal(waxing.waxing, true);
  assert.equal(waning.waxing, false);
  assert.equal(waxing.phaseName, 'First quarter');
  assert.equal(waning.phaseName, 'Last quarter');
  assert.ok(Math.abs(waxing.illumination - 0.5) < 0.02);
  assert.ok(Math.abs(waning.illumination - 0.5) < 0.02);
});

test('equatorial equinox follows dawn, day, dusk and night at the actual longitude', () => {
  const date = (hour: string) => new Date(`2026-03-20T${hour}:00Z`);
  assert.equal(getSkyState(date('06:00'), 0, 0).period, 'dawn');
  assert.equal(getSkyState(date('12:00'), 0, 0).period, 'day');
  assert.equal(getSkyState(date('18:00'), 0, 0).period, 'dusk');
  assert.equal(getSkyState(date('00:00'), 0, 0).period, 'night');
  assert.equal(getSkyState(date('00:00'), 0, 180).period, 'day');
});

test('polar day and night do not depend on nonexistent sunrise events', () => {
  const summer = new Date('2026-06-21T00:00:00Z');
  const winter = new Date('2026-12-21T12:00:00Z');
  assert.equal(getSkyState(summer, 89, 0).period, 'day');
  assert.equal(getSkyState(winter, 89, 0).period, 'night');
  assert.equal(getSkyState(summer, -89, 0).period, 'night');
  assert.equal(getSkyState(winter, -89, 0).period, 'day');
});

test('moon position changes by observer while phase remains global', () => {
  const instant = new Date('2026-10-18T22:00:00Z');
  const north = getSkyState(instant, 43.65, -79.38);
  const south = getSkyState(instant, -43.65, -79.38);
  assert.equal(north.phase, south.phase);
  assert.equal(north.illumination, south.illumination);
  assert.ok(Math.abs(north.moonRotation - south.moonRotation) > 90);
  for (const sky of [north, south]) {
    assert.ok(sky.moonAltitude >= -90 && sky.moonAltitude <= 90);
    assert.ok(sky.moonAzimuth >= 0 && sky.moonAzimuth < 360);
    assert.ok(sky.moonRotation >= -180 && sky.moonRotation <= 180);
    assert.equal(sky.moonAboveHorizon, sky.moonAltitude > 0);
  }
});

test('season uses local month, southern reversal and tropical foliage', () => {
  for (const [month, northern, southern] of [[1, 'winter', 'summer'], [4, 'spring', 'autumn'], [7, 'summer', 'winter'], [10, 'autumn', 'spring']] as const) {
    const date = new Date(Date.UTC(2026, month - 1, 15));
    assert.equal(getSeason(date, 43.65), northern);
    assert.equal(getSeason(date, -33.87), southern);
  }
  assert.equal(getSeason(new Date('2026-01-15T00:00:00Z'), 1.35), 'tropical');
  const boundary = new Date('2026-03-01T00:30:00Z');
  assert.equal(getSeason(boundary, 43.65, 'America/Toronto'), 'winter');
  assert.equal(getSeason(boundary, 43.65, 'Europe/Paris'), 'spring');
  assert.equal(getSeason(boundary, 43.65, 'not-a-zone'), 'spring');
});

test('all documented WMO codes map to a known state', () => {
  for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99]) {
    const weather = classifyWeather(code);
    assert.notEqual(weather.kind, 'unknown', `WMO ${code}`);
    assert.ok(weather.intensity >= 0 && weather.intensity <= 1);
    assert.ok(weather.cloudCover >= 0 && weather.cloudCover <= 100);
  }
  assert.equal(classifyWeather(67).precipitation, 'rain', 'freezing rain must not become snow');
  assert.equal(classifyWeather(77).precipitation, 'snow');
  assert.equal(classifyWeather(96).precipitation, 'hail');
  assert.ok(classifyWeather(65).intensity > classifyWeather(61).intensity);
  assert.ok(classifyWeather(75).intensity > classifyWeather(71).intensity);
  assert.equal(classifyWeather(0, 95).kind, 'overcast');
  assert.equal(classifyWeather(999).kind, 'unknown');
  assert.equal(classifyWeather(0, Number.NaN).cloudCover, 0);
  assert.equal(classifyWeather(2, 200).cloudCover, 100);
});

test('moon is hidden by overcast/fog, daylight and the horizon with gradual cloud attenuation', () => {
  const sky = getSkyState(new Date('2026-10-26T04:12:00Z'), 43.65, -79.38);
  assert.equal(sky.period, 'night');
  assert.ok(sky.moonAltitude > 5);
  assert.equal(getMoonOpacity(sky, classifyWeather(0)), 1);
  assert.equal(getMoonOpacity(sky, classifyWeather(3)), 0);
  assert.equal(getMoonOpacity(sky, classifyWeather(45, 0)), 0);
  assert.equal(getMoonOpacity(sky, classifyWeather(95, 20)), 0);
  const partiallyVisible = getMoonOpacity(sky, classifyWeather(2, 60));
  assert.ok(partiallyVisible > 0 && partiallyVisible < 1);
  assert.equal(getMoonOpacity({ ...sky, period: 'day' }, classifyWeather(0)), 0);
  assert.equal(getMoonOpacity({ ...sky, moonAltitude: -5, moonAboveHorizon: false }, classifyWeather(0)), 0);
  assert.equal(getMoonOpacity({ ...sky, illumination: 0 }, classifyWeather(0)), 0);
  const onHorizon = getMoonOpacity({ ...sky, moonAltitude: 1 }, classifyWeather(0));
  assert.ok(onHorizon > 0 && onHorizon < 0.2);
});

test('bad astronomy inputs fail explicitly rather than producing a broken scene', () => {
  assert.throws(() => getSkyState(new Date('invalid'), 0, 0), RangeError);
  assert.throws(() => getSkyState(new Date(), Number.NaN, 0), RangeError);
  assert.throws(() => getSkyState(new Date(), 91, 0), RangeError);
  assert.throws(() => getSkyState(new Date(), 0, 181), RangeError);
});
