import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateReport } from '../scripts/alice-report.mjs';

test('public ALICE report excludes private artifact URLs and credentials, and escapes page text', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mhri-alice-report-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const report = await generateReport({ runId:'test', requested:1, status:'complete', cpm:.20, targetUrl:'https://mhri.net/?secret=private-query', results:[{
    index:1, taskId:123, identity:'2001:db8::1234', status:'error',
    screenshot:'https://storage.invalid/private.jpg?signature=never-public',
    screenshotUrl:'https://storage.invalid/private.jpg?signature=never-public',
    error:'Bearer test-credential-redacted URL https://storage.invalid/?signature=never-public IP 192.0.2.1 2001:db8::abcd',
    sidecar:{token:'sidecar-secret'},
    capture:{environment:{location:{city:'<img src=x onerror=alert(1)>',countryCode:'US',timeZone:'America/New_York',ip:'192.0.2.2'},weather:{snowDepthM:0}},scene:{ground:{state:'bare',snowDepthM:0,source:'modeled-depth',label:'No modeled ground snow',token:'ground-secret'}},localTime:'2026-10-16 02:30:01'}
  }] },dir);
  const html = await readFile(join(dir,'index.html'),'utf8');
  const json = await readFile(join(dir,'report.json'),'utf8');
  for (const value of ['test-credential-redacted','never-public','sidecar-secret','ground-secret','192.0.2.1','192.0.2.2','2001:db8::1234','2001:db8::abcd','private-query']) { assert.ok(!html.includes(value),value);assert.ok(!json.includes(value),value); }
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.equal(report.results[0].screenshot,null);
  assert.equal(report.results[0].capture.localTime,'2026-10-16 02:30:01');
  assert.equal(report.results[0].capture.ground.snowDepthM,0);
  assert.equal(report.results[0].capture.weather.snowDepthM,0);
  assert.equal(report.results[0].capture.ground.source,'modeled-depth');
  assert.match(html,/\$0\.20/);assert.doesNotMatch(html,/captures\/min/);
});

test('screenshot download success is distinct from a ready live regional scene', async t => {
  const dir = await mkdtemp(join(tmpdir(),'mhri-alice-coverage-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const report = await generateReport({runId:'coverage',requested:3,status:'complete',expectedCoverage:{country:'US',cityPool:10,assignment:'random'},results:[
    {index:1,identity:'same-worker',status:'success',screenshot:'captures/01.jpg',capture:{captureReady:true,captureStatus:'ready',environment:{status:'live',location:{city:'New York',countryCode:'US',timeZone:'America/New_York'}}}},
    {index:2,identity:'same-worker',status:'success',screenshot:'captures/02.jpg',capture:null},
    {index:3,identity:'other-worker',status:'success',screenshot:'captures/03.jpg',capture:{captureReady:true,captureStatus:'ready',environment:{status:'location-only',location:{city:'Toronto',countryCode:'CA',timeZone:'America/Toronto'}}}},
  ]},dir);
  assert.equal(report.summary.success,3);assert.equal(report.summary.diagnosedReady,2);assert.equal(report.summary.liveEnvironments,1);
  assert.equal(report.summary.uniqueNodes,2);assert.equal(report.summary.repeatedCaptures,1);assert.equal(report.summary.uniqueCities,2);assert.equal(report.summary.outsideExpectedCountry,1);
  const html=await readFile(join(dir,'index.html'),'utf8');
  assert.ok(!html.includes('setTimeout(() => location.reload()'));
});
