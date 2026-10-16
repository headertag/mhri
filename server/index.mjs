import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { clientIp, createEnvironmentService, manualLocation } from './environment.mjs';
import { getClimate } from './climate-grid.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

export function createApp({ root = fileURLToPath(new URL('../dist', import.meta.url)),
  environment = createEnvironmentService(), onFly = Boolean(process.env.FLY_APP_NAME) } = {}) {
  const staticRoot = resolve(root);
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    try {
      const rawPath = request.url || '/';
      if (!rawPath.startsWith('/') || rawPath.startsWith('//')) return send(400, 'Bad request\n');
      const url = new URL(rawPath, 'http://localhost');
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        return send(405, 'Method not allowed\n');
      }
      if (url.pathname === '/healthz') return send(200, 'ok\n');
      const host = (request.headers.host || '').toLowerCase().split(':')[0];
      if (host === 'www.mhri.net') {
        // Keep this fresh while browsers retire permanent redirects from the old host.
        response.writeHead(308, { Location: `https://mhri.net${rawPath}`, 'Cache-Control': 'no-store' });
        return response.end();
      }
      if (url.pathname === '/api/environment') {
        if (request.method === 'HEAD') return send(200, '', 'application/json; charset=utf-8');
        let location;
        try { location = manualLocation(url.searchParams); } catch { return send(400, JSON.stringify({ error: 'Invalid location' }), 'application/json; charset=utf-8'); }
        const result = await environment.get(clientIp(request, onFly), location);
        if (result.reason === 'rate-limited') response.setHeader('Retry-After', '60');
        const climate = result.location ? getClimate(result.location.latitude, result.location.longitude) : null;
        return send(result.reason === 'rate-limited' ? 429 : 200, JSON.stringify({ ...result, climate }), 'application/json; charset=utf-8');
      }
      if (url.pathname === '/api/places') {
        const query = (url.searchParams.get('q') || '').trim();
        if (query.length < 2 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) return send(400, JSON.stringify({ error: 'Use a city name of 2 to 80 characters' }), 'application/json; charset=utf-8');
        if (request.method === 'HEAD') return send(200, '', 'application/json; charset=utf-8');
        const result = await environment.places(query, clientIp(request, onFly));
        if (result.reason === 'rate-limited') response.setHeader('Retry-After', '60');
        return send(result.reason === 'rate-limited' ? 429 : 200, JSON.stringify(result), 'application/json; charset=utf-8');
      }
      if (url.pathname.startsWith('/api/')) return send(404, 'Not found\n');
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { return send(400, 'Bad request\n'); }
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.'))) return send(404, 'Not found\n');
      const path = resolve(staticRoot, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!path.startsWith(staticRoot + sep)) return send(404, 'Not found\n');
      let file;
      try { file = await stat(path); } catch { return send(404, 'Not found\n'); }
      if (!file.isFile()) return send(404, 'Not found\n');
      const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
      const cache = decoded.startsWith('/assets/') ? 'public, max-age=31536000, immutable'
        : /^\/(art|fonts)\//.test(decoded) ? 'public, max-age=3600' : 'no-cache';
      const etag = `W/"${file.size.toString(16)}-${Math.trunc(file.mtimeMs).toString(16)}"`;
      response.setHeader('Content-Type', type);
      response.setHeader('Cache-Control', cache);
      response.setHeader('ETag', etag);
      response.setHeader('Last-Modified', file.mtime.toUTCString());
      if (request.headers['if-none-match'] === etag) { response.writeHead(304); return response.end(); }
      const compressible = /^(text\/|application\/(javascript|json)|image\/svg)/.test(type);
      const gzip = compressible && /(?:^|,)\s*gzip\s*(?:,|$)/.test(request.headers['accept-encoding'] || '') && file.size > 1024;
      if (compressible) response.setHeader('Vary', 'Accept-Encoding');
      if (gzip) response.setHeader('Content-Encoding', 'gzip');
      else response.setHeader('Content-Length', file.size);
      response.writeHead(200);
      if (request.method === 'HEAD') return response.end();
      await pipeline(createReadStream(path), ...(gzip ? [createGzip()] : []), response);
    } catch {
      // Never log a URL or request headers: the API handles visitor IPs transiently.
      if (!response.headersSent) send(500, 'Temporarily unavailable\n');
      else response.destroy();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8080);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`MHRI listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
