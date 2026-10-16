import assert from 'node:assert/strict';
import test from 'node:test';
import { getClimate, CLIMATE_SOURCE } from './climate-grid.mjs';

test('actual publisher grid distinguishes coastal California, mountains, and global climate classes', () => {
  const samples = [
    ['Los Angeles', 34.0522, -118.2437, 'Csa', 'mediterranean'],
    ['San Francisco', 37.7749, -122.4194, 'Csb', 'mediterranean'],
    ['Sierra Nevada', 37.745, -119.533, 'Dsb', 'continental'],
    ['Seattle', 47.6062, -122.3321, 'Csb', 'mediterranean'],
    ['Toronto', 43.6532, -79.3832, 'Dfa', 'continental'],
    ['Singapore', 1.3521, 103.8198, 'Af', 'tropical-rainforest'],
    ['Nairobi', -1.2921, 36.8219, 'Aw', 'tropical-seasonal'],
    ['Quito', -0.1807, -78.4678, 'Csb', 'mediterranean'],
    ['Addis Ababa', 8.9806, 38.7578, 'Cwb', 'oceanic'],
    ['Bogotá', 4.711, -74.0721, 'Cfb', 'oceanic'],
  ];
  for (const [city, latitude, longitude, koppenCode, group] of samples) {
    assert.deepEqual(getClimate(latitude, longitude), { koppenCode, group, source: CLIMATE_SOURCE, confidence: 'mapped' }, city);
  }
});

test('coastal no-data receives bounded nearby provenance, while distant ocean stays unknown', () => {
  assert.deepEqual(getClimate(37.75, -122.65), { koppenCode: 'Csb', group: 'mediterranean', source: CLIMATE_SOURCE, confidence: 'nearby' });
  for (const [latitude, longitude] of [[0, -140], [37.75, -125], [90, 0]]) {
    assert.deepEqual(getClimate(latitude, longitude), { koppenCode: null, group: 'unknown', source: CLIMATE_SOURCE, confidence: 'unknown' });
  }
});

test('antimeridian endpoints agree and polar boundaries do not index outside the grid', () => {
  for (const latitude of [66, -16.5, 0, -90, 90]) {
    assert.deepEqual(getClimate(latitude, 180), getClimate(latitude, -180));
  }
  assert.equal(getClimate(66, 180).koppenCode, 'Dfc');
  assert.equal(getClimate(-90, 0).koppenCode, 'EF');
});

test('invalid coordinates remain unknown without coercion or arbitrary longitude wrapping', () => {
  for (const [latitude, longitude] of [[NaN, 0], [0, Infinity], [90.1, 0], [-90.1, 0], [0, 180.1], [0, -180.1], ['37.7', -122.4], [null, 0], [undefined, undefined]]) {
    assert.equal(getClimate(latitude, longitude).group, 'unknown');
    assert.equal(getClimate(latitude, longitude).confidence, 'unknown');
  }
});
