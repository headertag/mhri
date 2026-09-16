import assert from 'node:assert/strict';
import { get as httpGet } from 'node:http';

const origin = process.argv[2] || 'http://127.0.0.1:8080';
const get = (path, options = {}) => fetch(new URL(path, origin), {
  redirect: 'manual', signal: AbortSignal.timeout(15_000), ...options,
});

const health = await get('/healthz');
assert.equal(health.status, 200);
assert.equal((await health.text()).trim(), 'ok');

const home = await get('/');
assert.equal(home.status, 200);
assert.match(home.headers.get('content-type'), /text\/html/);
assert.equal(home.headers.get('cache-control'), 'no-cache');
const html = await home.text();
assert.match(html, /MHRI/);
const bundlePath = html.match(/src="([^"]+\.js)"/)[1];
const bundle = await get(bundlePath);
assert.equal(bundle.status, 200);
assert.match(bundle.headers.get('cache-control'), /immutable/);
assert.match(bundle.headers.get('content-type'), /javascript/);

const painting = await get('/art/le-bon-pasteur.png', {method: 'HEAD'});
assert.equal(painting.status, 200);
assert.match(painting.headers.get('content-type'), /image\/png/);
assert.equal((await get('/art/not-a-real-file.png')).status, 404);

// fetch normalizes Host, so use the HTTP client to exercise the www virtual host.
const redirect = await new Promise((resolve, reject) => {
  const request = httpGet(new URL('/about?source=check', origin), {
    headers: {host: 'www.mhri.net'},
  }, response => {
    response.resume();
    resolve({status: response.statusCode, location: response.headers.location});
  });
  request.setTimeout(15_000, () => request.destroy(new Error('Redirect check timed out')));
  request.on('error', reject);
});
assert.equal(redirect.status, 308);
assert.equal(redirect.location, 'https://mhri.net/about?source=check');
console.log('Production server passed health, HTML, asset, cache, missing-file and canonical-host checks.');
