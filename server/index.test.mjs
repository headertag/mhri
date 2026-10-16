import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get as httpGet } from 'node:http';
import { createApp } from './index.mjs';

test('production HTTP routes preserve caching, canonical redirect, private API, and missing-file behavior', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mhri-http-'));
  await mkdir(join(root, 'assets'));
  await mkdir(join(root, 'art'));
  await writeFile(join(root, 'index.html'), '<html>MHRI</html>');
  await writeFile(join(root, 'assets', 'main.js'), 'console.log("MHRI");'.repeat(100));
  await writeFile(join(root, 'art', 'painting.png'), 'png');
  const seen = [];
  const server = createApp({ root, onFly: false, environment: {
    get: async (ip, location) => { seen.push({ ip, location }); return { version: 1, status: 'unavailable', location: null, weather: null }; },
    places: async query => ({ places: [{ name: query }] }),
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (path, options) => fetch(origin + path, { redirect: 'manual', ...options });
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  assert.equal(await home.text(), '<html>MHRI</html>');
  assert.equal((await get('/', { headers: { 'if-none-match': home.headers.get('etag') } })).status, 304);
  const js = await get('/assets/main.js');
  assert.match(js.headers.get('cache-control'), /immutable/);
  assert.equal(js.headers.get('content-encoding'), 'gzip');
  assert.match(await js.text(), /console.log/);
  assert.equal((await get('/art/painting.png', { method: 'HEAD' })).headers.get('content-type'), 'image/png');
  for (const path of ['/missing', '/art/missing.png', '/api/nope', '/%2e%2e%2fpackage.json', '/.env', '/art%5c..%5c.env']) assert.equal((await get(path)).status, 404, path);
  assert.equal((await get('/bad%ZZ')).status, 400);
  assert.equal((await get('/', { method: 'POST' })).status, 405);
  const health = await get('/healthz');
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok\n');
  const redirect = await new Promise((resolve, reject) => {
    httpGet(origin + '/test?x=1', { headers: { host: 'www.mhri.net' } }, response => {
      response.resume(); resolve({ status: response.statusCode, headers: response.headers });
    }).on('error', reject);
  });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, 'https://mhri.net/test?x=1');
  assert.equal(redirect.headers['cache-control'], 'no-store');
  const api = await get('/api/environment', { headers: { 'fly-client-ip': '8.8.8.8', 'x-forwarded-for': '8.8.8.8' } });
  assert.equal(api.headers.get('cache-control'), 'no-store');
  assert.equal(api.headers.get('access-control-allow-origin'), null);
  assert.equal((await api.json()).status, 'unavailable');
  assert.equal(seen[0].ip, null);
  assert.equal((await get('/api/environment?latitude=bad')).status, 400);
  const selected = new URLSearchParams({ latitude: '43.65', longitude: '-79.38', city: 'Toronto', timeZone: 'America/Toronto' });
  assert.equal((await get(`/api/environment?${selected}`)).status, 200);
  assert.equal(seen[1].location.source, 'city');
  assert.equal((await get('/api/places?q=x')).status, 400);
  assert.deepEqual(await (await get('/api/places?q=Toronto')).json(), { places: [{ name: 'Toronto' }] });
});
