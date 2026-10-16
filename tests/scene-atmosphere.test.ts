import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAtmosphere } from '../src/scene-atmosphere.ts';
import { classifyWeather, type SkyPeriod } from '../src/scene-astronomy.ts';

const position = (sunAltitude: number, period: SkyPeriod = 'night') => ({ sunAltitude, period });
const clear = classifyWeather(0, 0);
const colors = (gradient: string) => [...gradient.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map(match => match.slice(1).map(Number));
const filterValue = (filter: string, name: string) => Number(filter.match(new RegExp(`${name}\\(([-.\\d]+)\\)`))?.[1]);

test('weather changes cloud coverage without changing the clock-driven sky colors or cloud lighting', () => {
  for (const altitude of [-24, -12, -2, 6, 30]) {
    const sunlight = resolveAtmosphere(position(altitude), clear);
    for (const code of [0, 2, 3, 45, 51, 63, 73, 95, 99]) {
      const weather = resolveAtmosphere(position(altitude), classifyWeather(code));
      assert.equal(weather.skyGradient, sunlight.skyGradient);
      assert.equal(weather.cloudFilter, sunlight.cloudFilter);
    }
  }
});

test('stars fade through astronomical twilight and never appear in civil twilight or daylight', () => {
  assert.equal(resolveAtmosphere(position(-24), clear).starOpacity, 1);
  assert.equal(resolveAtmosphere(position(-18), clear).starOpacity, 1);
  const twilight = [-16, -14, -12, -10, -8].map(altitude => resolveAtmosphere(position(altitude), clear).starOpacity);
  assert.ok(twilight.every(value => value > 0 && value < 1));
  assert.ok(twilight.every((value, index) => index === 0 || value < twilight[index - 1]));
  for (const altitude of [-6, -2, 0, 6, 30, 90]) assert.equal(resolveAtmosphere(position(altitude), clear).starOpacity, 0);
});

test('cloud cover attenuates stars while overcast, fog and heavy precipitation fully obscure them', () => {
  const open = resolveAtmosphere(position(-24), clear);
  const partial = resolveAtmosphere(position(-24), classifyWeather(2, 60));
  assert.equal(open.cloudOpacity, 0);
  assert.equal(open.fullOvercast, false);
  assert.ok(partial.starOpacity > 0 && partial.starOpacity < open.starOpacity);
  assert.ok(partial.cloudOpacity > 0 && partial.cloudOpacity < 1);
  assert.equal(partial.fullOvercast, false);
  for (const weather of [classifyWeather(0, 85), classifyWeather(45, 40), classifyWeather(63, 60), classifyWeather(95, 20), classifyWeather(99, 60)]) {
    const obscured = resolveAtmosphere(position(-24), weather);
    assert.equal(obscured.fullOvercast, true);
    assert.equal(obscured.cloudOpacity, 1);
    assert.equal(obscured.starOpacity, 0);
    assert.equal(obscured.skyGradient, open.skyGradient);
  }
});

test('manual periods override an actual solar altitude and supply a deterministic offline preview', () => {
  const actualDay = position(30, 'day');
  const night = resolveAtmosphere(actualDay, clear, 'night');
  assert.deepEqual(night, resolveAtmosphere(position(-24), clear));
  assert.deepEqual(resolveAtmosphere(null, clear, 'night'), night);
  for (const period of ['dawn', 'dusk'] as const) {
    const twilight = resolveAtmosphere(position(-24), clear, period);
    assert.deepEqual(twilight, resolveAtmosphere(position(-2, period), clear));
    assert.equal(twilight.starOpacity, 0);
    const horizon = colors(twilight.skyGradient).at(-1)!;
    assert.ok(horizon[0] > horizon[2], 'the twilight horizon should be warmer than its blue component');
  }
  assert.equal(resolveAtmosphere(position(-24), clear, 'day').starOpacity, 0);
});

test('solar altitude drives a continuous palette across named-period boundaries', () => {
  assert.deepEqual(resolveAtmosphere(position(-2, 'dawn'), clear), resolveAtmosphere(position(-2, 'dusk'), clear));
  const daytime = colors(resolveAtmosphere(position(30, 'day'), clear).skyGradient);
  const nighttime = colors(resolveAtmosphere(position(-24), clear).skyGradient);
  assert.ok(daytime.every((color, index) => color.reduce((a, b) => a + b) > nighttime[index].reduce((a, b) => a + b)));
  for (const boundary of [-18, -12, -6, 0, 6, 30]) {
    const before = colors(resolveAtmosphere(position(boundary - .001), clear).skyGradient).flat();
    const after = colors(resolveAtmosphere(position(boundary + .001), clear).skyGradient).flat();
    assert.ok(before.every((value, index) => Math.abs(value - after[index]) <= 1));
  }
});

test('polar extremes and unavailable solar positions produce finite bounded presentation values', () => {
  for (const sky of [null, position(Number.NaN, 'dusk'), position(-90), position(90, 'day')]) {
    const result = resolveAtmosphere(sky, clear);
    assert.ok(Number.isFinite(result.starOpacity) && result.starOpacity >= 0 && result.starOpacity <= 1);
    assert.ok(Number.isFinite(result.cloudOpacity) && result.cloudOpacity >= 0 && result.cloudOpacity <= 1);
    assert.doesNotMatch(result.skyGradient + result.cloudFilter + result.landscapeFilter + result.figureFilter, /NaN|Infinity|undefined/);
    assert.ok(Number.isFinite(result.shadowStrength) && result.shadowStrength >= 0 && result.shadowStrength <= 1);
    assert.equal(colors(result.skyGradient).length, 3);
  }
});

test('terrain and figure lighting rise smoothly with the sun rather than named periods', () => {
  const samples = [-24, -18, -12, -6, -2, 0, 6, 12, 30].map(altitude => resolveAtmosphere(position(altitude), clear));
  assert.equal(filterValue(samples[0].landscapeFilter, 'brightness'), .39);
  assert.equal(filterValue(samples[0].figureFilter, 'brightness'), .62);
  assert.equal(samples[0].shadowStrength, .3);
  assert.equal(filterValue(samples.at(-1)!.landscapeFilter, 'brightness'), 1);
  assert.equal(filterValue(samples.at(-1)!.figureFilter, 'brightness'), 1);
  assert.equal(samples.at(-1)!.shadowStrength, 1);
  for (const field of ['landscapeFilter', 'figureFilter'] as const) {
    const brightness = samples.map(sample => filterValue(sample[field], 'brightness'));
    assert.ok(brightness.every((value, index) => value > 0 && value <= 1 && (index === 0 || value >= brightness[index - 1])));
  }
  for (const boundary of [-18, -12, -6, 0, 6, 12, 30]) {
    const before = resolveAtmosphere(position(boundary - .001), clear);
    const after = resolveAtmosphere(position(boundary + .001), clear);
    for (const field of ['landscapeFilter', 'figureFilter'] as const) {
      for (const effect of ['brightness', 'saturate', 'sepia']) {
        assert.ok(Math.abs(filterValue(before[field], effect) - filterValue(after[field], effect)) <= .002);
      }
    }
    assert.ok(Math.abs(before.shadowStrength - after.shadowStrength) < .001);
  }
});

test('clouds soften scene light and ground shadows without recoloring the sky gradient', () => {
  const day = position(30, 'day');
  const sunny = resolveAtmosphere(day, clear);
  const overcast = resolveAtmosphere(day, classifyWeather(3, 100));
  assert.equal(filterValue(overcast.figureFilter, 'brightness'), .9);
  assert.equal(filterValue(overcast.landscapeFilter, 'brightness'), .9);
  assert.equal(overcast.shadowStrength, .55);
  assert.equal(overcast.skyGradient, sunny.skyGradient);
  const rainy = resolveAtmosphere(day, classifyWeather(63, 100));
  const foggy = resolveAtmosphere(day, classifyWeather(45, 100));
  assert.ok(filterValue(rainy.landscapeFilter, 'brightness') < filterValue(overcast.landscapeFilter, 'brightness'));
  assert.ok(filterValue(foggy.landscapeFilter, 'contrast') < 1);
  for (const atmosphere of [overcast, rainy, foggy]) assert.equal(atmosphere.skyGradient, sunny.skyGradient);
  const dark = resolveAtmosphere(position(-24), classifyWeather(3, 100));
  assert.ok(filterValue(dark.figureFilter, 'brightness') > .6);
  assert.equal(dark.shadowStrength, .3, 'night keeps a restrained persistent contact shadow');
});
