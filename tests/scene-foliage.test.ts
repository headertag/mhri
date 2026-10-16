import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFoliage, type ClimateHistory, type ClimateProfile, type FoliageLocation } from '../src/scene-foliage.ts';

const oct = new Date('2026-10-16T16:00:00Z');
const place = (latitude:number,longitude:number,timeZone='UTC'): FoliageLocation => ({latitude,longitude,timeZone});
const climate = (koppenCode:string,group:ClimateProfile['group']='unknown'): ClimateProfile => ({koppenCode,group,confidence:'mapped',source:'test raster'});
const history = (now=oct, values:Partial<ClimateHistory>={}): ClimateHistory => ({
  sampleDays:28,startDate:new Date(now.getTime()-28*86400000).toISOString().slice(0,10),endDate:new Date(now.getTime()-86400000).toISOString().slice(0,10),
  meanTemperatureC:15,meanMinTemperatureC:9,meanMaxTemperatureC:21,precipitationMm:60,freezeDays:0,snowfallCm:0,...values,
});
const toronto = place(43.7,-79.4,'America/Toronto');

test('Los Angeles and San Francisco keep Mediterranean foliage instead of calendar autumn', () => {
  for (const [location,code] of [[place(34.1,-118.2,'America/Los_Angeles'),'Csa'],[place(37.8,-122.4,'America/Los_Angeles'),'Csb']] as const) {
    const dry=resolveFoliage(oct,location,'autumn',climate(code),history(oct,{precipitationMm:0}),40);
    assert.equal(dry.state,'dry'); assert.equal(dry.landscape,'dry');
    const noHistory=resolveFoliage(oct,location,'autumn',climate(code),null);
    assert.equal(noHistory.state,'green'); assert.equal(noHistory.confidence,'climate');
  }
});

test('Toronto autumn does not revert to summer during a warm multi-week spell', () => {
  const result=resolveFoliage(oct,toronto,'autumn',climate('Dfb'),history(oct,{meanTemperatureC:22,meanMinTemperatureC:17,meanMaxTemperatureC:27}));
  assert.equal(result.state,'autumn'); assert.equal(result.confidence,'climate-and-history');
  const september=new Date('2026-09-03T16:00:00Z');
  assert.equal(resolveFoliage(september,toronto,'autumn',climate('Dfb'),history(september,{meanTemperatureC:22,meanMinTemperatureC:17,meanMaxTemperatureC:27})).state,'green');
});

test('continental winter and spring use sustained seasonal conditions', () => {
  const winter=new Date('2026-01-20T17:00:00Z');
  assert.equal(resolveFoliage(winter,toronto,'winter',climate('Dfb'),history(winter,{meanTemperatureC:8,meanMinTemperatureC:3,meanMaxTemperatureC:13})).state,'dormant');
  const spring=new Date('2026-04-20T16:00:00Z');
  assert.equal(resolveFoliage(spring,toronto,'spring',climate('Dfb'),history(spring,{meanTemperatureC:11,meanMinTemperatureC:4,meanMaxTemperatureC:18,freezeDays:1})).state,'fresh');
  assert.equal(resolveFoliage(spring,toronto,'spring',climate('Dfb'),history(spring,{meanTemperatureC:3,meanMinTemperatureC:-2,meanMaxTemperatureC:8,freezeDays:15})).state,'dormant');
});

test('Singapore rainforest stays green while seasonal tropical foliage follows multi-week rainfall', () => {
  const singapore=place(1.35,103.8,'Asia/Singapore');
  const dry=history(oct,{meanTemperatureC:28,meanMinTemperatureC:24,meanMaxTemperatureC:32,precipitationMm:3});
  assert.equal(resolveFoliage(oct,singapore,'autumn',climate('Af'),dry).state,'green');
  const savanna=place(12.6,-8,'Africa/Bamako');
  assert.equal(resolveFoliage(oct,savanna,'autumn',climate('Aw'),dry).state,'dry');
  assert.equal(resolveFoliage(oct,savanna,'autumn',climate('Aw'),{...dry,precipitationMm:140}).state,'green');
});

test('Nairobi and Quito cool highlands never inherit a temperate four-season cycle', () => {
  const cool=history(oct,{meanTemperatureC:10,meanMinTemperatureC:4,meanMaxTemperatureC:16,precipitationMm:90,freezeDays:1});
  for (const [location,code,elevation] of [[place(-1.3,36.8,'Africa/Nairobi'),'Cwb',1795],[place(-0.2,-78.5,'America/Guayaquil'),'Cfb',2850]] as const) {
    for (const season of ['autumn','winter','spring','summer'] as const) {
      assert.equal(resolveFoliage(oct,location,season,climate(code),cool,elevation).state,'green');
    }
    assert.equal(resolveFoliage(oct,location,'winter',climate(code),cool,null).state,'green');
  }
});

test('Sydney Southern Hemisphere autumn remains subtropical green and continental phases reverse', () => {
  const april=new Date('2026-04-16T02:00:00Z');
  const sydney=place(-33.9,151.2,'Australia/Sydney');
  assert.equal(resolveFoliage(april,sydney,'autumn',climate('Cfa'),history(april,{meanTemperatureC:19,meanMinTemperatureC:14,meanMaxTemperatureC:24,precipitationMm:70})).state,'green');
  // A synthetic southern continental point verifies hemisphere handling independently of species.
  assert.equal(resolveFoliage(april,place(-43.7,170,'Pacific/Auckland'),'autumn',climate('Dfb'),history(april)).state,'autumn');
});

test('oceanic and boreal evergreen proxies do not lose leaves because the calendar says winter', () => {
  const winter=new Date('2026-01-20T12:00:00Z');
  const frozen=history(winter,{meanTemperatureC:-8,meanMinTemperatureC:-13,meanMaxTemperatureC:-3,freezeDays:28});
  assert.equal(resolveFoliage(winter,place(49.3,-123.1),'winter',climate('Cfb'),frozen).state,'green');
  assert.equal(resolveFoliage(winter,place(64.8,-147.7),'winter',climate('Dfc'),frozen).state,'green');
  assert.equal(resolveFoliage(oct,place(75,-40),'autumn',climate('ET'),history()).state,'dormant');
});

test('one cold day, stale history and cold summer intervals cannot trigger instantaneous leaf loss', () => {
  const summer=new Date('2026-07-15T16:00:00Z');
  const coldDay=history(summer,{sampleDays:1,startDate:'2026-07-14',endDate:'2026-07-14',meanTemperatureC:-1,meanMinTemperatureC:-4,meanMaxTemperatureC:2,freezeDays:1});
  const short=resolveFoliage(summer,toronto,'summer',climate('Dfb'),coldDay);
  assert.equal(short.state,'green'); assert.equal(short.confidence,'climate');
  const coldMonth=history(summer,{meanTemperatureC:3,meanMinTemperatureC:-2,meanMaxTemperatureC:8,freezeDays:20});
  assert.equal(resolveFoliage(summer,toronto,'summer',climate('Dfb'),coldMonth).state,'green');
  const stale=resolveFoliage(oct,toronto,'autumn',climate('Dfb'),history(new Date('2026-09-01T00:00:00Z')));
  assert.equal(stale.confidence,'climate');
});

test('arid climates use a dry plate without pretending the desert is orange autumn', () => {
  const phoenix=place(33.4,-112.1,'America/Phoenix');
  const result=resolveFoliage(oct,phoenix,'autumn',climate('BWh'),null);
  assert.equal(result.state,'dry'); assert.equal(result.filter,'none');
  assert.equal(resolveFoliage(oct,phoenix,'autumn',climate('BWh'),history(oct,{precipitationMm:100})).state,'green');
});

test('missing climate stays neutral, real codes outrank broad groups, and invalid history is ignored', () => {
  assert.equal(resolveFoliage(oct,toronto,'autumn',null,history()).state,'green');
  assert.equal(resolveFoliage(oct,toronto,'autumn',null,history()).confidence,'fallback');
  assert.equal(resolveFoliage(oct,place(34,-118),'autumn',climate('Csa','continental'),history()).state,'green');
  assert.equal(resolveFoliage(oct,null,'autumn',climate('Dfb'),history()).confidence,'fallback');
  assert.equal(resolveFoliage(oct,toronto,'autumn',climate('Dfb'),history(oct,{freezeDays:29})).confidence,'climate');
  assert.equal(resolveFoliage(oct,toronto,'autumn',climate('Dfb'),history(oct,{meanTemperatureC:Number.NaN})).confidence,'climate');
});
