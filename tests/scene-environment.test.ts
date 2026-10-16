import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolveScene } from '../src/scene-environment.ts';
import { retainLocation, validPlace, type Environment } from '../src/environment.ts';

const date = new Date('2026-10-16T04:00:00Z');
const auto = {time:'auto',weather:'auto',season:'auto'};
const make = (lat=43.7, lon=-79.4, timeZone='America/Toronto'): Environment => ({version:1,status:'live',location:{latitude:lat,longitude:lon,timeZone,city:'Test city',countryCode:'CA',approximate:true},weather:{observedAt:date.toISOString(),temperatureC:10,weatherCode:0,cloudCover:0,precipitationMm:0,rainMm:0,snowfallCm:0,windSpeedKmh:0,windDirectionDeg:0,isDay:false},sun:null,fetchedAt:date.toISOString()});

test('overcast nights have neither a visible moon nor a baked star field', () => {
  const scene = resolveScene(true,make(),date,{time:'night',weather:'overcast',season:'summer'});
  assert.match(scene.skyImage,/overcast-sky/);
  assert.doesNotMatch(scene.landscape,/night/);
  assert.equal(scene.moonOpacity,0);
  assert.match(scene.skyFilter,/brightness/);
});
test('winter does not invent snow and precipitation remains independent of season', () => {
  const winter = resolveScene(true,make(),date,{time:'day',weather:'clear',season:'winter'});
  assert.match(winter.landscape,/winter.webp/); assert.equal(winter.weather.precipitation,'none');
  const snow = resolveScene(true,make(),date,{time:'night',weather:'snow',season:'spring'});
  assert.match(snow.landscape,/snow.webp/); assert.equal(snow.weather.precipitation,'snow');
  assert.match(snow.landscapeFilter,/brightness/);
  const winterRain = resolveScene(true,make(),date,{time:'day',weather:'rain',season:'winter'});
  assert.match(winterRain.landscape,/winter.webp/); assert.equal(winterRain.weather.precipitation,'rain');
  const autumnStorm = resolveScene(true,make(),date,{time:'dusk',weather:'thunderstorm',season:'autumn'});
  assert.match(autumnStorm.landscape,/autumn.webp/);
});
test('southern and tropical visitors do not receive northern autumn foliage', () => {
  const south = resolveScene(true,make(-31.9,115.9,'Australia/Perth'),date,auto);
  assert.equal(south.season,'spring');
  const tropical = resolveScene(true,make(1.3,103.8,'Asia/Singapore'),date,auto);
  assert.equal(tropical.season,'tropical');
});
test('saved city survives offline startup and a known location survives failed refresh', () => {
  const place = {id:1,name:'Perth',latitude:-31.9,longitude:115.9,timeZone:'Australia/Perth'};
  assert.ok(validPlace(place));
  const offline = retainLocation(null,place);
  assert.equal(offline.location?.timeZone,'Australia/Perth');
  assert.equal(offline.weather,null);
  assert.equal(resolveScene(true,offline,date,auto).period,'day');
  assert.equal(resolveScene(true,offline,date,auto).season,'spring');
  const remembered = retainLocation(make(),null);
  assert.equal(remembered.location?.timeZone,'America/Toronto');
  assert.equal(remembered.weather,null);
  assert.equal(remembered.status,'location-only');
});
test('calm wind and due-north direction survive mapping; stale weather is not presented as live', () => {
  const live = resolveScene(true,make(),date,auto);
  assert.equal(live.windSpeedKmh,0); assert.equal(live.windDirectionDeg,0);
  const stale = resolveScene(true,make(),new Date(date.getTime()+4*3600000),auto);
  assert.equal(stale.weather.kind,'unknown'); assert.doesNotMatch(stale.description,/10°C/);
});
test('no IP location does not invent a horizon-visible moon; manual preview is labelled', () => {
  assert.equal(resolveScene(true,null,date,auto).moonOpacity,0);
  const preview = resolveScene(true,null,date,{...auto,time:'night',weather:'clear'});
  assert.equal(preview.preview,true); assert.match(preview.description,/^Preview/);
  assert.equal(preview.sky?.moonAltitude,40);
});
test('all supported combinations resolve to available assets and finite visibility', () => {
  for (const time of ['dawn','day','dusk','night']) for (const weather of ['clear','cloudy','overcast','rain','snow','fog','thunderstorm']) for (const season of ['spring','summer','autumn','winter']) {
    const scene=resolveScene(true,make(),date,{time,weather,season});
    assert.ok(existsSync(new URL(`../public${scene.landscape}`,import.meta.url)),scene.landscape);
    assert.ok(existsSync(new URL(`../public${scene.skyImage}`,import.meta.url)),scene.skyImage);
    assert.ok(scene.moonOpacity>=0&&scene.moonOpacity<=1);
    assert.ok(!scene.landscapeFilter.includes('NaN'));
  }
});
test('disabling local conditions restores the established painting environment', () => {
  const scene=resolveScene(false,make(),date,{time:'night',weather:'snow',season:'winter'});
  assert.equal(scene.landscape,'/art/landscape-wide.png');
  assert.equal(scene.skyImage,'/art/cloud-sky.png');
  assert.equal(scene.moonOpacity,0); assert.equal(scene.figureFilter,'none');
});
