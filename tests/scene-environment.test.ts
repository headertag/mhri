import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolveScene } from '../src/scene-environment.ts';
import { mergeEnvironment, retainLocation, validPlace, type Environment } from '../src/environment.ts';
import { getClimate } from '../server/climate-grid.mjs';

const date = new Date('2026-10-16T04:00:00Z');
const auto = {time:'auto',weather:'auto',season:'auto'};
const make = (lat=43.7, lon=-79.4, timeZone='America/Toronto'): Environment => ({version:1,status:'live',location:{latitude:lat,longitude:lon,timeZone,city:'Test city',countryCode:'CA',approximate:true},weather:{observedAt:date.toISOString(),temperatureC:10,weatherCode:0,cloudCover:0,precipitationMm:0,rainMm:0,snowfallCm:0,windSpeedKmh:0,windDirectionDeg:0,isDay:false},sun:null,fetchedAt:date.toISOString()});

test('overcast nights hide the moon and stars without recoloring the underlying sky', () => {
  const scene = resolveScene(true,make(),date,{time:'night',weather:'overcast',season:'summer'});
  const clear = resolveScene(true,make(),date,{time:'night',weather:'clear',season:'summer'});
  assert.match(scene.cloudImage,/clouds-overcast.webp/);
  assert.equal(scene.atmosphere.fullOvercast,true);
  assert.equal(scene.atmosphere.starOpacity,0);
  assert.equal(scene.atmosphere.skyGradient,clear.atmosphere.skyGradient);
  assert.doesNotMatch(scene.landscape,/night/);
  assert.equal(scene.moonOpacity,0);
  assert.match(scene.atmosphere.cloudFilter,/brightness/);
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
    assert.ok(existsSync(new URL(`../public${scene.cloudImage}`,import.meta.url)),scene.cloudImage);
    assert.ok(existsSync(new URL(`../public${scene.landscapeMask}`,import.meta.url)),scene.landscapeMask);
    assert.ok(Number.isFinite(scene.atmosphere.cloudOpacity)&&scene.atmosphere.cloudOpacity>=0&&scene.atmosphere.cloudOpacity<=1);
    assert.ok(Number.isFinite(scene.atmosphere.starOpacity)&&scene.atmosphere.starOpacity>=0&&scene.atmosphere.starOpacity<=1);
    assert.doesNotMatch(scene.atmosphere.skyGradient+scene.atmosphere.cloudFilter,/NaN|Infinity|undefined/);
    assert.ok(scene.moonOpacity>=0&&scene.moonOpacity<=1);
    assert.ok(!scene.landscapeFilter.includes('NaN'));
  }
});
test('disabling local conditions restores the established painting environment', () => {
  const scene=resolveScene(false,make(),date,{time:'night',weather:'snow',season:'winter'});
  assert.equal(scene.landscape,'/art/landscape-wide.png');
  assert.equal(scene.enabled,false);
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
  assert.match(scene.landscape,/snow.webp/);assert.match(scene.cloudImage,/clouds-isolated.webp/);
  assert.equal(scene.atmosphere.fullOvercast,false);
  const night=resolveScene(true,env,date,{...auto,time:'night'});
  assert.match(night.landscape,/snow.webp/);assert.match(night.cloudImage,/clouds-isolated.webp/);
  assert.equal(night.atmosphere.starOpacity,1);
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

test('time controls sky color while independent clouds control star visibility and cloud shape', () => {
  const environment=make();
  const clear=resolveScene(true,environment,date,{...auto,time:'night'});
  assert.equal(clear.cloudImage,'/art/environments/clouds-isolated.webp');
  assert.equal(clear.atmosphere.cloudOpacity,0);
  assert.equal(clear.atmosphere.starOpacity,1);
  environment.weather!.cloudCover=60;
  const cloudy=resolveScene(true,environment,date,{...auto,time:'night'});
  assert.equal(cloudy.atmosphere.skyGradient,clear.atmosphere.skyGradient);
  assert.equal(cloudy.cloudImage,clear.cloudImage);
  assert.ok(cloudy.atmosphere.cloudOpacity>clear.atmosphere.cloudOpacity&&cloudy.atmosphere.cloudOpacity<=1);
  assert.ok(cloudy.atmosphere.starOpacity>0&&cloudy.atmosphere.starOpacity<clear.atmosphere.starOpacity);
  for (const time of ['dawn','day','dusk']) {
    const daytime=resolveScene(true,environment,date,{...auto,time});
    assert.equal(daytime.atmosphere.starOpacity,0);
    assert.notEqual(daytime.atmosphere.skyGradient,clear.atmosphere.skyGradient);
    assert.equal(daytime.cloudImage,clear.cloudImage);
  }
  for (const weather of ['overcast','rain','snow','fog','thunderstorm']) {
    const obscured=resolveScene(true,environment,date,{...auto,time:'night',weather});
    assert.equal(obscured.atmosphere.fullOvercast,true);
    assert.equal(obscured.atmosphere.starOpacity,0);
    assert.equal(obscured.atmosphere.skyGradient,clear.atmosphere.skyGradient);
    assert.equal(obscured.cloudImage,'/art/environments/clouds-overcast.webp');
  }
});

test('Salvador has a visible real moon during a clear October evening without a night preview', () => {
  const evening=new Date('2026-10-16T21:45:00Z');
  const environment=make(-13,-38.5,'America/Bahia');
  environment.location!.city='Salvador';environment.location!.countryCode='BR';
  environment.fetchedAt=evening.toISOString();
  environment.weather={...environment.weather!,observedAt:evening.toISOString(),cloudCover:4,temperatureC:26.8};
  const scene=resolveScene(true,environment,evening,auto);
  assert.equal(scene.preview,false);
  assert.equal(scene.period,'night');
  assert.equal(scene.weather.kind,'clear');
  assert.equal(scene.moonOpacity,1);
  assert.equal(scene.sky?.moonAboveHorizon,true);
  assert.ok(scene.sky!.moonAltitude>45&&scene.sky!.moonAltitude<55);
  assert.ok(scene.sky!.illumination>.32&&scene.sky!.illumination<.35);
  assert.ok(scene.sky!.phase>.18&&scene.sky!.phase<.21);
  assert.equal(scene.sky!.waxing,true);
  assert.equal(scene.cloudImage,'/art/environments/clouds-isolated.webp');
  assert.ok(scene.atmosphere.starOpacity>.99&&scene.atmosphere.starOpacity<=1);
});

test('automatic daylight changes illuminate one foliage plate instead of swapping prelit landscapes', () => {
  const environment=make();environment.climate=getClimate(43.7,-79.4);
  const scenes=[8,10,11,12,13,16,21,22,23].map(hour => {
    const now=new Date(`2026-10-16T${String(hour).padStart(2,'0')}:00:00Z`);
    // Hold the observed conditions fixed while advancing only the astronomical clock.
    const observation={...environment,weather:{...environment.weather!,observedAt:now.toISOString()}};
    return resolveScene(true,observation,now,auto);
  });
  assert.deepEqual(new Set(scenes.map(scene=>scene.period)),new Set(['night','dawn','day','dusk']));
  assert.equal(new Set(scenes.map(scene=>scene.landscape)).size,1);
  assert.equal(scenes[0].landscape,'/art/environments/autumn.webp');
  assert.ok(scenes.every(scene=>!scene.preview&&scene.foliage.state==='autumn'&&scene.weather.kind==='clear'));
  const brightness=(filter:string)=>Number(filter.match(/brightness\(([^)]+)\)/)![1]);
  // Several distinct values within morning twilight catch period-based step lighting.
  for(let i=1;i<=4;i++) {
    assert.ok(brightness(scenes[i].landscapeFilter)>brightness(scenes[i-1].landscapeFilter));
    assert.ok(brightness(scenes[i].figureFilter)>brightness(scenes[i-1].figureFilter));
    assert.ok(scenes[i].atmosphere.shadowStrength>scenes[i-1].atmosphere.shadowStrength);
  }
  assert.equal(brightness(scenes[0].landscapeFilter),.39);
  assert.equal(brightness(scenes[0].figureFilter),.62);
  assert.equal(brightness(scenes[4].landscapeFilter),1);
  assert.equal(brightness(scenes[4].figureFilter),1);
});

test('automatic sunrise and sunset period boundaries do not produce lighting or terrain jumps', () => {
  const environment=make();environment.climate=getClimate(43.7,-79.4);
  const sceneAt=(milliseconds:number)=> {
    const now=new Date(milliseconds);
    return resolveScene(true,{...environment,weather:{...environment.weather!,observedAt:now.toISOString()}},now,auto);
  };
  const origin=Date.parse('2026-10-16T00:00:00Z');
  for(const [startHour,endHour,beforePeriod,afterPeriod] of [
    [11,12,'night','dawn'],[12,13,'dawn','day'],[21,22,'day','dusk'],[23,24,'dusk','night'],
  ] as const) {
    let low=origin+startHour*3600000,high=origin+endHour*3600000;
    assert.equal(sceneAt(low).period,beforePeriod);assert.equal(sceneAt(high).period,afterPeriod);
    // Locate the actual solar transition, avoiding a brittle precomputed sunrise time.
    while(high-low>1) {
      const midpoint=Math.floor((low+high)/2);
      if(sceneAt(midpoint).period===beforePeriod) low=midpoint;
      else high=midpoint;
    }
    const before=sceneAt(low-1000),after=sceneAt(high+1000);
    assert.equal(before.period,beforePeriod);assert.equal(after.period,afterPeriod);
    assert.equal(before.landscape,after.landscape);
    assert.deepEqual(before.foliage,after.foliage);
    assert.deepEqual(before.weather,after.weather);
    for(const field of ['landscapeFilter','figureFilter'] as const) {
      const values=(value:string)=>Array.from(value.matchAll(/\((-?[\d.]+)\)/g),match=>Number(match[1]));
      const a=values(before[field]),b=values(after[field]);
      assert.equal(a.length,b.length);
      assert.ok(a.every((value,index)=>Math.abs(value-b[index])<=.002),`${beforePeriod} to ${afterPeriod}: ${field}`);
    }
    assert.ok(Math.abs(before.atmosphere.shadowStrength-after.atmosphere.shadowStrength)<.001);
  }
});


test('a continuous heavy shower cloud deck also marks the moon as obscured', () => {
  const env=make();env.weather!.weatherCode=82;env.weather!.cloudCover=50;
  const scene=resolveScene(true,env,date,{...auto,time:'night'});
  assert.equal(scene.atmosphere.fullOvercast,true);
  assert.equal(scene.moonOpacity,0);
  assert.match(scene.description,/behind clouds/);
});
