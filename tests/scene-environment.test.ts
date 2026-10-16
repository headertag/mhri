import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolveScene } from '../src/scene-environment.ts';
import { mergeEnvironment, retainLocation, validPlace, type Environment } from '../src/environment.ts';
import { getClimate } from '../server/climate-grid.mjs';

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
  assert.match(snow.landscape,/snow-evergreen.webp/); assert.equal(snow.weather.precipitation,'snow');
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
  for (const time of ['dawn','day','dusk','night']) for (const weather of ['clear','cloudy','overcast','rain','snow','fog','thunderstorm']) for (const season of ['spring','summer','autumn','winter']) for (const ground of ['auto','bare','patchy','covered']) {
    const scene=resolveScene(true,make(),date,{time,weather,season,ground});
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

test('real mapped climates select California green or dry foliage while Toronto keeps autumn colour', () => {
  for (const [lat,lon] of [[34.1,-118.2],[37.8,-122.4]]) {
    const env=make(lat,lon,'America/Los_Angeles'); env.climate=getClimate(lat,lon);
    const scene=resolveScene(true,env,date,auto);
    assert.equal(scene.season,'autumn'); assert.equal(scene.foliage.state,'green');
    assert.doesNotMatch(scene.landscape,/autumn|winter/);
    assert.match(scene.description,/mediterranean green/i);
  }
  const toronto=make();toronto.climate=getClimate(43.7,-79.4);
  assert.equal(resolveScene(true,toronto,date,auto).foliage.state,'autumn');
});

test('equatorial climate remains green and explicit seasonal previews still override local foliage', () => {
  const singapore=make(1.3,103.8,'Asia/Singapore');singapore.climate=getClimate(1.3,103.8);
  const scene=resolveScene(true,singapore,date,auto);
  assert.equal(scene.foliage.state,'green');assert.match(scene.foliage.label,/rainforest/i);
  const selected=resolveScene(true,singapore,date,{time:'day',weather:'clear',season:'autumn'});
  assert.equal(selected.foliage.state,'autumn');assert.equal(selected.foliage.confidence,'preview');
  assert.match(selected.landscape,/autumn/);
});

test('a current rain shower cannot erase sustained dry-climate foliage', () => {
  const env=make(34.1,-118.2,'America/Los_Angeles');env.climate=getClimate(34.1,-118.2);
  env.climateHistory={sampleDays:28,startDate:'2026-09-18',endDate:'2026-10-15',meanTemperatureC:22,meanMinTemperatureC:16,meanMaxTemperatureC:28,precipitationMm:2,freezeDays:0,snowfallCm:0};
  env.weather!.weatherCode=63;env.weather!.cloudCover=95;
  const scene=resolveScene(true,env,date,auto);
  assert.equal(scene.foliage.state,'dry');assert.equal(scene.weather.precipitation,'rain');
  assert.match(scene.landscape,/dry.webp/);assert.ok(existsSync(new URL(`../public${scene.landscape}`,import.meta.url)));
});

test('a history-only outage retains same-location context while accepting new live weather', () => {
  const previous=make();previous.climate=getClimate(43.7,-79.4);previous.elevationM=162;
  previous.climateHistory={sampleDays:28,startDate:'2026-09-18',endDate:'2026-10-15',meanTemperatureC:15,meanMinTemperatureC:9,meanMaxTemperatureC:21,precipitationMm:12,freezeDays:0,snowfallCm:0};
  const incoming=make();incoming.climateHistory=null;incoming.elevationM=null;incoming.weather!.temperatureC=19;
  const merged=mergeEnvironment(previous,incoming);
  assert.equal(merged.climateHistory,previous.climateHistory);assert.equal(merged.elevationM,162);
  assert.equal(merged.status,'live');assert.equal(merged.weather!.temperatureC,19);
  const changed=make(34.1,-118.2,'America/Los_Angeles');changed.climateHistory=null;
  assert.equal(mergeEnvironment(previous,changed).climateHistory,null);
  assert.equal(retainLocation(previous,null).climate,previous.climate);
  assert.equal(retainLocation(previous,{id:1,name:'Los Angeles',latitude:34.1,longitude:-118.2,timeZone:'America/Los_Angeles'}).climateHistory,null);
});

test('settled snow selects ground artwork without inventing flakes or overcast skies', () => {
  const env=make(-77.8,166.7,'Antarctica/McMurdo');env.climate=getClimate(-77.8,166.7);
  env.weather!.snowDepthM=2.99;
  const scene=resolveScene(true,env,date,auto);
  assert.equal(scene.ground.state,'covered');assert.equal(scene.ground.source,'modeled-depth');
  assert.equal(scene.weather.precipitation,'none');assert.equal(scene.weather.cloudCover,0);
  assert.match(scene.landscape,/snow.webp/);assert.doesNotMatch(scene.skyImage,/overcast/);
  const night=resolveScene(true,env,date,{...auto,time:'night'});
  assert.match(night.landscape,/snow.webp/);assert.match(night.skyImage,/night-sky/);
  assert.match(night.landscapeFilter,/brightness/);
});

test('ground snow follows depth independently of leaf state, a warm reading or rainfall', () => {
  const env=make();env.weather!.snowDepthM=.08;env.weather!.temperatureC=6;
  const summer=resolveScene(true,env,date,{...auto,time:'day',season:'summer'});
  assert.equal(summer.foliage.state,'green');assert.match(summer.landscape,/snow-evergreen.webp/);
  const rain=resolveScene(true,env,date,{...auto,time:'day',season:'summer',weather:'rain'});
  assert.match(rain.landscape,/snow-evergreen.webp/);assert.equal(rain.weather.precipitation,'rain');
  env.weather!.snowDepthM=.02;
  assert.match(resolveScene(true,env,date,{...auto,season:'summer'}).landscape,/snow-patchy.webp/);
  assert.match(resolveScene(true,env,date,{...auto,season:'winter'}).landscape,/snow-patchy-dormant.webp/);
  env.weather!.snowDepthM=0;
  assert.doesNotMatch(resolveScene(true,env,date,{...auto,season:'winter'}).landscape,/snow/);
});

test('flakes with zero or unavailable snow depth leave ordinary ground visible', () => {
  const env=make();env.weather!.weatherCode=73;env.weather!.cloudCover=100;
  for (const depth of [0,null,undefined]) {
    env.weather!.snowDepthM=depth;
    const scene=resolveScene(true,env,date,{...auto,time:'day',season:'winter'});
    assert.equal(scene.weather.precipitation,'snow');
    assert.equal(scene.ground.state,depth === 0 ? 'bare' : 'unknown');
    assert.match(scene.landscape,/winter.webp/);
  }
});

test('explicit ground previews override snow weather and reset cleanly to local conditions', () => {
  const env=make();env.weather!.snowDepthM=0;
  const clearPack=resolveScene(true,env,date,{...auto,time:'day',weather:'clear',ground:'covered'});
  assert.equal(clearPack.preview,true);assert.equal(clearPack.ground.source,'preview');
  assert.match(clearPack.landscape,/snow/);assert.equal(clearPack.weather.precipitation,'none');
  const flakesOnly=resolveScene(true,env,date,{...auto,weather:'snow',ground:'bare'});
  assert.equal(flakesOnly.ground.state,'bare');assert.equal(flakesOnly.weather.precipitation,'snow');
  assert.doesNotMatch(flakesOnly.landscape,/snow/);
  assert.equal(resolveScene(true,env,date,auto).ground.source,'modeled-depth');
  assert.equal(resolveScene(true,env,date,auto).preview,false);
});

test('new current observations never inherit old snow depth and stale pack is not reused', () => {
  const previous=make();previous.weather!.snowDepthM=.7;
  const incoming=make();incoming.weather!.snowDepthM=null;
  assert.equal(mergeEnvironment(previous,incoming).weather!.snowDepthM,null);
  assert.equal(resolveScene(true,mergeEnvironment(previous,incoming),date,auto).ground.state,'unknown');
  const stale=resolveScene(true,previous,new Date(date.getTime()+4*3600000),auto);
  assert.equal(stale.ground.state,'unknown');assert.doesNotMatch(stale.landscape,/snow/);
});
