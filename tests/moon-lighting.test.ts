import assert from 'node:assert/strict';
import test from 'node:test';
import { getMoonPlacement, renderMoonPixels, type MoonRaster } from '../src/moon-lighting.ts';

const raster = (width: number, height: number, color: [number, number, number]): MoonRaster => ({ width, height,
  data: new Uint8ClampedArray(Array.from({ length: width * height }, () => [...color, 255]).flat()) });
const texture = raster(4, 2, [220, 210, 195]);
const options = { size: 40, illumination: .5, waxing: true, rotation: 0, transmission: 1, texture };
const pixel = (pixels: Uint8ClampedArray, x: number, y: number) => [...pixels.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 4)];

test('only illuminated surface has alpha; unlit lunar pixels do not paint a dark disc or sky backdrop', () => {
  const pixels = renderMoonPixels(options);
  assert.equal(pixel(pixels, 12, 20)[3], 0);
  assert.ok(pixel(pixels, 27, 20)[0] > 100);
  assert.equal(pixel(pixels, 27, 20)[3], 255);
  assert.equal(pixel(pixels, 0, 0)[3], 0);
  const attenuated = renderMoonPixels({ ...options, transmission: .15 });
  assert.equal(pixel(attenuated, 12, 20)[3], 0);
  assert.equal(pixel(attenuated, 27, 20)[3], 38);
  assert.deepEqual(pixel(attenuated, 27, 20).slice(0, 3), pixel(pixels, 27, 20).slice(0, 3), 'cloud transmission scales alpha, not lunar albedo');
});

test('waxing, waning and astronomical rotation orient the terminator without rotating the canvas', () => {
  const waning = renderMoonPixels({ ...options, waxing: false });
  assert.equal(pixel(waning, 27, 20)[3], 0);
  assert.equal(pixel(waning, 12, 20)[3], 255);
  const rotated = renderMoonPixels({ ...options, rotation: 90 });
  assert.equal(pixel(rotated, 20, 12)[3], 0);
  assert.equal(pixel(rotated, 20, 27)[3], 255);
});

test('full and new moon preserve calculated phase, with albedo controlling real surface contrast', () => {
  const full = renderMoonPixels({ ...options, illumination: 1 });
  assert.ok(pixel(full, 12, 20)[0] > 100);
  assert.ok(pixel(full, 27, 20)[0] > 100);
  const dark = renderMoonPixels({ ...options, illumination: 0 });
  assert.ok(dark.every((value, index) => index % 4 !== 3 || value === 0));
  const maria = renderMoonPixels({ ...options, illumination: 1, texture: raster(4, 2, [80, 75, 70]) });
  assert.ok(pixel(maria, 20, 20)[0] < pixel(full, 20, 20)[0] / 2);
  const fallback = renderMoonPixels({ ...options, illumination: 1, texture: null });
  assert.ok(pixel(fallback, 20, 20)[0] > 100, 'failed albedo has a smooth lit fallback rather than a black disc');
});

test('placement is shared with the independent star-occlusion mask and retains composition bounds', () => {
  assert.deepEqual(getMoonPlacement({ moonAzimuth: 90, moonAltitude: 50 }), { left: 86, top: 25.5 });
  assert.deepEqual(getMoonPlacement({ moonAzimuth: 270, moonAltitude: -5 }), { left: 70, top: 44 });
  for (let azimuth = 0; azimuth < 360; azimuth += 15) {
    const placement = getMoonPlacement({ moonAzimuth: azimuth, moonAltitude: 90 });
    assert.ok(placement.left >= 70 && placement.left <= 86);
    assert.ok(placement.top >= 9 && placement.top <= 44);
  }
});
