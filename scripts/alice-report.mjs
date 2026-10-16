import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';

/** Public reports deliberately copy an allowlist, never the provider response. */
function text(value, limit = 240) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return String(value)
    .replace(/https?:\/\/[^\s<>"']+/gi, '[URL removed]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=:-]+/gi, '[credential removed]')
    .replace(/\b(?:api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|secret|password|signature|sig)\s*[:=]\s*[^\s,;]+/gi, '[credential removed]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP removed]')
    .replace(/(?<![\w])(?:[a-f\d]{0,4}:){2,}[a-f\d:.%]+/gi, candidate => isIP(candidate) === 6 ? '[IP removed]' : candidate)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[credential removed]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, limit);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function number(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function date(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function shortId(value, prefix) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const record = object(value);
    value = record.nodeId ?? record.node_id ?? record.id ?? record.publicKey ?? record.identity;
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 10)}`;
}

function screenshot(value) {
  return typeof value === 'string' && /^captures\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(value) ? value : null;
}

function target(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['mhri.net', 'www.mhri.net', 'mhri.fly.dev'].includes(url.hostname)) return null;
    return `https://${url.hostname}/`;
  } catch { return null; }
}

function timeZone(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return value; } catch { return null; }
}

function summarizeCapture(input) {
  const capture = object(input);
  const environment = object(capture.environment ?? capture.env);
  const location = object(capture.location ?? environment.location);
  const weather = object(capture.weather ?? environment.weather);
  const scene = object(capture.scene);
  const foliage = object(scene.foliage);
  const climate = object(environment.climate);
  const viewport = object(capture.viewport);
  const zone = timeZone(location.timeZone ?? location.timezone ?? capture.timeZone ?? capture.timezone);
  const city = text(location.city ?? location.name ?? capture.city, 100);
  const country = text(location.countryCode ?? location.country ?? capture.countryCode ?? capture.country, 80);
  const region = text(location.region ?? capture.region, 100) || country || (zone?.includes('/') ? zone.split('/')[0] : null);
  const localTime = text(capture.localTime ?? capture.local_time, 80);
  const description = text(capture.description ?? scene.description, 240);
  const period = text(capture.period ?? scene.period, 30);
  const season = text(capture.season ?? scene.season, 30);
  const label = text(weather.label ?? weather.kind ?? scene.weatherLabel ?? scene.weather ?? capture.weatherLabel ?? (typeof capture.weather === 'string' ? capture.weather : null), 100);
  return {
    city, country, region, timeZone: zone, localTime, description, period, season,
    captureReady: capture.captureReady === true && capture.captureStatus === 'ready',
    captureStatus: text(capture.captureStatus, 40),
    capturedAt: date(capture.capturedAtISO ?? capture.capturedAt),
    environmentStatus: text(environment.status ?? capture.environmentStatus, 40),
    environmentReason: text(environment.reason, 100),
    foliage: { state: text(foliage.state, 30), label: text(foliage.label, 100), confidence: text(foliage.confidence, 40), reason: text(foliage.reason, 400) },
    climate: { koppenCode: text(climate.koppenCode, 8), group: text(climate.group, 40), confidence: text(climate.confidence, 20) },
    locationSource: ['ip', 'city'].includes(location.source) ? location.source : null,
    weather: {
      label,
      temperatureC: number(weather.temperatureC ?? capture.temperatureC),
      weatherCode: number(weather.weatherCode ?? capture.weatherCode),
      cloudCover: number(weather.cloudCover ?? capture.cloudCover),
      observedAt: date(weather.observedAt),
      windSpeedKmh: number(weather.windSpeedKmh),
    },
    moon: { phaseName: text(scene.phaseName, 40), illumination: number(scene.illumination), visible: typeof scene.moonVisible === 'boolean' ? scene.moonVisible : null },
    viewport: { width: number(viewport.width), height: number(viewport.height) },
    title: text(capture.title, 150),
    imageCount: number(capture.imageCount),
    loadedImageCount: number(capture.loadedImageCount),
    failedImageCount: number(capture.failedImageCount),
    consoleErrorCount: number(capture.consoleErrorCount),
  };
}

function sanitize(manifest) {
  const input = object(manifest);
  const rows = Array.isArray(input.results) ? input.results : [];
  const results = rows.map((raw, offset) => {
    const result = object(raw);
    const status = ['pending', 'success', 'error'].includes(result.status) ? result.status : 'pending';
    return {
      index: Math.max(1, Math.floor(number(result.index, offset + 1))),
      taskId: shortId(result.taskId, 'task'),
      status,
      code: text(result.code, 60),
      error: text(result.error, 600),
      identity: shortId(result.identity ?? result.nodeLabel, 'node'),
      workerVersion: text(result.workerVersion, 100),
      submittedAt: date(result.submittedAt),
      completedAt: date(result.completedAt),
      durationMs: number(result.durationMs),
      httpStatus: number(result.httpStatus),
      screenshot: screenshot(result.screenshot),
      capture: summarizeCapture(result.capture),
      // The sidecar may contain signed image URLs, endpoints or credentials.
      // Nothing from that provider-owned object is copied to a public report.
    };
  }).sort((a, b) => a.index - b.index);
  const requested = Math.max(results.length, Math.floor(number(input.requested, 30)), 1);
  const success = results.filter(result => result.status === 'success').length;
  const failure = results.filter(result => result.status === 'error').length;
  const completed = success + failure;
  const nodeCounts = new Map();
  for (const result of results) if (result.identity) nodeCounts.set(result.identity, (nodeCounts.get(result.identity) || 0) + 1);
  const regions = [...new Set(results.map(result => result.capture.region).filter(Boolean))].sort();
  const cities = [...new Set(results.map(result => result.capture.city ? [result.capture.city, result.capture.country].filter(Boolean).join(', ') : null).filter(Boolean))].sort();
  const timeZones = [...new Set(results.map(result => result.capture.timeZone).filter(Boolean))].sort();
  const widths = results.map(result => result.capture.viewport.width).filter(width => width > 0 && width <= 32768);
  const observations = (Array.isArray(input.observations) ? input.observations : []).slice(0, 20)
    .map(object)
    .filter(item => ['coverage', 'review', 'failure'].includes(item.kind) && typeof item.text === 'string')
    .map(item => ({
      kind: item.kind,
      text: text(item.text, 1200),
      indices: [...new Set((Array.isArray(item.indices) ? item.indices : []).filter(index => Number.isInteger(index) && index >= 1 && index <= requested))].sort((a, b) => a - b),
    }));
  const coverage = object(input.expectedCoverage);
  const expectedCoverage = {
    country: typeof coverage.country === 'string' && /^[A-Z]{2}$/.test(coverage.country) ? coverage.country : null,
    cityPool: number(coverage.cityPool),
    assignment: ['random', 'fixed'].includes(coverage.assignment) ? coverage.assignment : null,
  };
  const outsideExpectedCountry = results.filter(result => expectedCoverage.country && result.capture.country && result.capture.country.toUpperCase() !== expectedCoverage.country).length;
  const status = text(input.status, 40) || 'running';
  const finished = ['done', 'complete', 'completed', 'finished', 'error', 'failed', 'cancelled', 'canceled'].includes(status.toLowerCase()) || completed >= requested;
  return {
    schemaVersion: 1,
    runId: text(input.runId, 100) || 'ALICE run',
    startedAt: date(input.startedAt),
    updatedAt: date(input.updatedAt) || new Date().toISOString(),
    targetUrl: target(input.targetUrl),
    cpm: number(input.cpm),
    requested,
    status,
    finished,
    expectedCoverage,
    observations,
    summary: {
      completed, success, failure, pending: Math.max(0, requested - completed),
      uniqueNodes: nodeCounts.size,
      repeatedNodes: [...nodeCounts.values()].filter(count => count > 1).length,
      repeatedCaptures: [...nodeCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      diagnosedReady: results.filter(result => result.capture.captureReady).length,
      liveEnvironments: results.filter(result => result.capture.environmentStatus === 'live').length,
      uniqueCities: cities.length,
      cities,
      timeZones,
      uniqueTimeZones: timeZones.length,
      viewportWidthMin: widths.length ? Math.min(...widths) : null,
      viewportWidthMax: widths.length ? Math.max(...widths) : null,
      outsideExpectedCountry,
      regions,
    },
    results: results.map(result => ({ ...result, nodeCaptureCount: nodeCounts.get(result.identity) || 0, outsideExpectedCountry: Boolean(expectedCoverage.country && result.capture.country && result.capture.country.toUpperCase() !== expectedCoverage.country) })),
  };
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function when(value) {
  return value ? new Date(value).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : 'Not yet recorded';
}

function weatherLabel(capture) {
  if (capture.weather.label) return capture.weather.label;
  const code = capture.weather.weatherCode;
  if (code === 0) return 'Clear';
  if (code === 1 || code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 67) return 'Rain / drizzle';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Not reported';
}

function card(result) {
  const capture = result.capture;
  const location = [capture.city, capture.country].filter(Boolean).join(', ') || 'Location not reported';
  const temperature = capture.weather.temperatureC == null ? '' : ` · ${Math.round(capture.weather.temperatureC)}°C`;
  const duration = result.durationMs == null ? '—' : `${(result.durationMs / 1000).toFixed(1)} s`;
  const phase = [capture.period, capture.foliage.label || capture.season].filter(Boolean).join(' · ');
  const image = result.screenshot
    ? `<a class="capture-link" href="${escape(result.screenshot)}" target="_blank" rel="noopener" aria-label="Open full-size capture ${result.index}: ${escape(location)}"><img src="${escape(result.screenshot)}" alt="MHRI painting captured from ${escape(location)}, ${escape(weatherLabel(capture))}" loading="lazy" decoding="async"><span class="image-action">Open full size ↗</span></a>`
    : `<div class="capture-placeholder"><span class="placeholder-symbol" aria-hidden="true">${result.status === 'error' ? '×' : '◌'}</span><span>${result.status === 'error' ? 'Capture unavailable' : result.status === 'success' ? 'No screenshot returned' : 'Awaiting capture'}</span></div>`;
  return `<article class="capture-card" id="capture-${result.index}" data-status="${result.status}" data-region="${escape(capture.region || 'Unreported')}" data-city="${escape(capture.city ? location : 'Unreported')}">
    <div class="card-heading"><span class="capture-number">${String(result.index).padStart(2, '0')}</span><h2>${escape(location)}</h2><span class="status status-${result.status}">${result.status === 'error' ? 'Failed' : result.status === 'success' ? 'Downloaded' : 'Pending'}</span></div>
    ${image}
    <div class="card-body">
      <p class="scene-description">${escape(capture.description || phase || 'Live local environment')}</p>
      <p class="diagnostic-note">${capture.captureReady ? 'Ready diagnostics received' : 'Readiness unverified'} · ${capture.environmentStatus === 'live' ? 'Live environment' : 'Environment: ' + escape(capture.environmentStatus || 'unreported')}${result.outsideExpectedCountry ? ' · <strong>Outside requested country</strong>' : ''}</p>
      <dl class="capture-facts"><div><dt>Local time zone</dt><dd>${escape(capture.timeZone || 'Not reported')}${capture.localTime ? `<span class="detail">${escape(capture.localTime)}</span>` : ''}</dd></div><div><dt>Weather</dt><dd>${escape(weatherLabel(capture) + temperature)}</dd></div><div><dt>Node</dt><dd><code>${escape(result.identity || 'Not reported')}</code>${result.nodeCaptureCount > 1 ? `<span class="detail">Used for ${result.nodeCaptureCount} captures</span>` : ''}</dd></div><div><dt>Extraction / HTTP</dt><dd>${escape(duration)} · ${escape(result.httpStatus ?? '—')}</dd></div></dl>
      ${result.error ? `<p class="error-message"><strong>${escape(result.code || 'Capture error')}</strong><span>${escape(result.error)}</span></p>` : ''}
      <p class="capture-timestamp">${escape(when(result.completedAt || result.submittedAt))}</p>
    </div>
  </article>`;
}

function render(report) {
  const s = report.summary;
  const percent = Math.round(s.completed / report.requested * 100);
  const statistics = [['Requested', report.requested], ['Completed', s.completed], ['Downloaded', s.success], ['Failed', s.failure], ['Unique nodes', s.uniqueNodes], ['Location regions', s.regions.length]];
  const coverage = report.expectedCoverage;
  const coverageNote = coverage.country && coverage.cityPool
    ? ` Requested coverage: ${coverage.cityPool} ${escape(coverage.country)} cities with ${escape(coverage.assignment || 'unspecified')} assignment. Random assignment does not guarantee a capture from every city.` : '';
  const diagnosticStats = `<dl class="diagnostic-stats"><div><dt>Ready diagnostics</dt><dd>${s.diagnosedReady}</dd></div><div><dt>Live environments</dt><dd>${s.liveEnvironments}</dd></div><div><dt>Actual distinct cities</dt><dd>${s.uniqueCities}${coverage.cityPool ? ' / ' + coverage.cityPool + ' in pool' : ''}</dd></div><div><dt>Outside requested country</dt><dd>${s.outsideExpectedCountry}</dd></div></dl>`;
  const dimensions = `<p class="coverage-details">${s.uniqueTimeZones} detected time zone${s.uniqueTimeZones === 1 ? '' : 's'}${s.timeZones.length ? ': ' + s.timeZones.map(escape).join(' · ') : ''}${s.viewportWidthMin != null ? ` · Viewport widths: ${s.viewportWidthMin}${s.viewportWidthMax !== s.viewportWidthMin ? '–' + s.viewportWidthMax : ''} CSS px` : ''}</p>`;
  const observations = report.observations.length ? `<section class="run-observations" aria-labelledby="observations-title"><h2 id="observations-title">Run observations</h2><ul>${report.observations.map(item => `<li><span class="observation-kind">${{ coverage: 'Coverage', review: 'Visual review', failure: 'Failure' }[item.kind]}</span><p>${escape(item.text)}</p>${item.indices.length ? `<div class="observation-captures">Captures ${item.indices.map(index => `<a href="#capture-${index}">${String(index).padStart(2, '0')}</a>`).join(', ')}</div>` : ''}</li>`).join('')}</ul></section>` : '';
  const cards = [...report.results];
  const usedIndices = new Set(cards.map(result => result.index));
  for (let index = 1; index <= report.requested; index++) if (!usedIndices.has(index)) {
    cards.push({ index, status: 'pending', capture: summarizeCapture(null), nodeCaptureCount: 0 });
  }
  cards.sort((a, b) => a.index - b.index);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'"><title>MHRI · ALICE capture report</title>
<style>
:root{color-scheme:light dark;--paper:#f4f3ef;--surface:#fff;--ink:#222d29;--muted:#65716a;--line:#d9ded7;--accent:#526b57;--subtle:#e9eee6;--danger:#9b3333;--danger-bg:#fff0ef;--success:#366a48;--success-bg:#eaf4eb;--pending:#846831;--pending-bg:#f6efd9}
@media(prefers-color-scheme:dark){:root{--paper:#141a17;--surface:#1d2620;--ink:#e6ede5;--muted:#abb9aa;--line:#344136;--accent:#c0cbb0;--subtle:#2c382b;--danger:#ffada6;--danger-bg:#442a29;--success:#a6d4ab;--success-bg:#263d2b;--pending:#e5cc8c;--pending-bg:#3b3625}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}button,select{font:inherit}a:focus-visible,select:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.container{max-width:1600px;margin:0 auto;padding:clamp(18px,3vw,48px)}.skip-link{position:absolute;left:16px;top:-80px;padding:12px;background:var(--surface);z-index:10}.skip-link:focus{top:12px}.eyebrow{font-size:12px;letter-spacing:.16em;font-weight:650;text-transform:uppercase;color:var(--muted)}.top-line{display:flex;justify-content:space-between;gap:20px;align-items:center}.top-line a{text-underline-offset:4px}.run-state{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:30px;padding:6px 12px;font-size:12px}.state-dot{width:7px;height:7px;border-radius:50%;background:var(--success)}h1{font:400 clamp(34px,5vw,64px)/1.05 Georgia,"Times New Roman",serif;letter-spacing:-.035em;margin:28px 0 16px}.intro{max-width:730px;color:var(--muted);font-size:16px;margin:0}.run-meta{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:12px;color:var(--muted);margin:22px 0 28px}.run-meta code{font-size:12px;overflow-wrap:anywhere}.stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}.stat{padding:18px 20px;border-right:1px solid var(--line)}.stat:last-child{border:0}.stat dt{color:var(--muted);font-size:12px}.stat dd{margin:5px 0 0;font-variant-numeric:tabular-nums;font-size:30px;line-height:1.2}.progress-meta{display:flex;justify-content:space-between;gap:16px;margin:14px 0 6px;font-size:12px;color:var(--muted)}progress{width:100%;height:5px;border:0;border-radius:10px;accent-color:var(--accent);display:block}progress::-webkit-progress-bar{background:var(--line);border-radius:10px}progress::-webkit-progress-value{background:var(--accent);border-radius:10px}.scope-note{padding:16px 18px;border-left:3px solid var(--accent);background:var(--subtle);font-size:13px;max-width:100%;color:var(--muted);margin:24px 0 32px}.scope-note p{margin:0}.scope-note p+p{margin-top:6px}.filters{display:flex;align-items:end;gap:14px;flex-wrap:wrap;margin-bottom:22px}.filters label{display:grid;gap:5px;color:var(--muted);font-size:12px}.filters select{min-height:40px;padding:7px 32px 7px 11px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);font-size:14px}.filter-count{font-size:13px;color:var(--muted);margin:0 0 10px auto}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.gallery.large{grid-template-columns:1fr;max-width:1200px;margin:0 auto}.capture-card{border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden;min-width:0}.capture-card[hidden]{display:none}.card-heading{display:flex;align-items:center;gap:12px;padding:14px 18px}.capture-number{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px}.card-heading h2{font-size:15px;margin:0;font-weight:600;flex:1;line-height:1.35;overflow-wrap:anywhere}.status{font-size:11px;font-weight:600;border-radius:24px;padding:4px 8px;white-space:nowrap}.status-success{color:var(--success);background:var(--success-bg)}.status-error{color:var(--danger);background:var(--danger-bg)}.status-pending{color:var(--pending);background:var(--pending-bg)}.capture-link{display:block;position:relative;background:#0b100c;line-height:0}.capture-link img{display:block;width:100%;height:auto;min-height:160px;aspect-ratio:16/10;object-fit:contain}.image-action{position:absolute;bottom:12px;right:12px;background:#141a17d9;color:#f5f7f1;border:1px solid #ffffff33;border-radius:5px;padding:8px 10px;font:12px/1.2 system-ui,sans-serif}.capture-placeholder{aspect-ratio:16/10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--subtle);color:var(--muted);font-size:14px}.placeholder-symbol{font-size:40px;font-weight:200}.card-body{padding:18px}.scene-description{margin:0 0 16px;font-size:14px;min-height:22px}.capture-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:0}.capture-facts dt{font-size:11px;color:var(--muted);margin-bottom:4px}.capture-facts dd{margin:0;font-size:13px;overflow-wrap:anywhere}.capture-facts code{font-size:12px}.detail{display:block;color:var(--muted);font-size:11px;margin-top:3px}.capture-timestamp{font-size:11px;color:var(--muted);margin:18px 0 0;padding-top:12px;border-top:1px solid var(--line)}.error-message{font-size:12px;background:var(--danger-bg);color:var(--danger);padding:12px;border-radius:6px;overflow-wrap:anywhere;margin:16px 0 0}.error-message strong,.error-message span{display:block}.error-message span{margin-top:5px;white-space:pre-wrap}.empty{padding:32px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px}.empty[hidden]{display:none}footer{border-top:1px solid var(--line);margin-top:40px;padding-top:20px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--muted)}footer a{text-underline-offset:3px}
@media(min-width:1800px){.container{max-width:1800px}}@media(max-width:850px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.stat:nth-child(3){border-right:0}.stat:nth-child(-n+3){border-bottom:1px solid var(--line)}.gallery{grid-template-columns:1fr;gap:22px}.filter-count{margin-left:0}.filters{gap:12px}.top-line{align-items:start}}@media(max-width:440px){.stat{padding:14px 12px}.stat dt{font-size:11px}.stat dd{font-size:26px}.card-heading{padding:12px;gap:8px}.card-body{padding:14px}.capture-facts{gap:12px}.filters select{max-width:200px}.run-state{font-size:10px;padding:5px 8px}.progress-meta{flex-direction:column;gap:3px}}
.diagnostic-stats{display:flex;flex-wrap:wrap;gap:12px 28px;margin:18px 0 0}.diagnostic-stats>div{display:flex;gap:8px;align-items:baseline}.diagnostic-stats dt{font-size:12px;color:var(--muted)}.diagnostic-stats dd{margin:0;font-size:14px;font-weight:600}.diagnostic-note{font-size:12px;color:var(--muted);margin:-8px 0 18px}.diagnostic-note strong{color:var(--danger)}
.coverage-details{font-size:12px;color:var(--muted);overflow-wrap:anywhere;margin:12px 0 0}.run-observations{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:20px;margin:0 0 28px}.run-observations h2{font-size:18px;margin:0 0 16px}.run-observations ul{list-style:none;margin:0;padding:0;display:grid;gap:16px}.run-observations li+li{padding-top:16px;border-top:1px solid var(--line)}.observation-kind{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600}.run-observations p{font-size:14px;margin:5px 0;overflow-wrap:anywhere;white-space:pre-line}.observation-captures{font-size:12px;color:var(--muted)}.observation-captures a{text-underline-offset:3px}.capture-card{scroll-margin-top:20px}
</style></head><body><a class="skip-link" href="#captures">Skip to captures</a><main class="container"><header><div class="top-line"><a class="eyebrow" href="${escape(report.targetUrl || 'https://mhri.net/')}">MHRI / ALICE</a><span class="run-state"><span class="state-dot" aria-hidden="true"></span>${report.finished ? 'Run finished' : 'Captures in progress'}</span></div><h1>One painting.<br>Many points of view.</h1><p class="intro">A visual record of MHRI loading across ALICE browser captures. Inspect the painting, local atmosphere and runtime result in each frame.</p><div class="run-meta"><span>Run <code>${escape(report.runId)}</code></span><span>Started ${escape(when(report.startedAt))}</span><span>Updated ${escape(when(report.updatedAt))}</span>${report.cpm != null ? `<span>Priority bid: $${escape(report.cpm.toFixed(2))} per 1,000 tasks</span>` : ''}</div></header><dl class="stats">${statistics.map(([label, value]) => `<div class="stat"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>${diagnosticStats}${dimensions}<div class="progress-meta"><span>${s.completed} of ${report.requested} captures completed · ${percent}%</span><span>${report.finished ? 'Final snapshot · automatic refresh stopped' : 'This report refreshes every 20 seconds while the run is active'}</span></div><progress value="${s.completed}" max="${report.requested}" aria-label="Completed captures"></progress><aside class="scope-note"><p>Location labels come from the page’s approximate IP-based city lookup or selected city. They describe the scene’s location, and do not prove where an ALICE node is physically located or guarantee geographic distribution.</p><p>${s.repeatedNodes} node${s.repeatedNodes === 1 ? '' : 's'} appeared more than once, accounting for ${s.repeatedCaptures} repeat capture${s.repeatedCaptures === 1 ? '' : 's'}. Node identifiers are shortened public aliases. Missing location data stays unreported.${coverageNote}</p><p>A downloaded screenshot is not a visual pass. Ready diagnostics and a live environment are reported separately; inspect the images for composition and rendering quality.</p></aside>${observations}<section id="captures" aria-label="Screenshot captures"><div class="filters"><label>Status<select id="status-filter"><option value="all">All statuses</option><option value="success">Successful</option><option value="error">Failed</option><option value="pending">Pending</option></select></label><label>Location region<select id="region-filter"><option value="all">All locations</option>${s.regions.map(region => `<option value="${escape(region)}">${escape(region)}</option>`).join('')}<option value="Unreported">Unreported</option></select></label><label>Captured city<select id="city-filter"><option value="all">All cities</option>${s.cities.map(city => `<option value="${escape(city)}">${escape(city)}</option>`).join('')}<option value="Unreported">Unreported</option></select></label><label>Image size<select id="size-filter"><option value="grid">Gallery</option><option value="large">Large frames</option></select></label><p class="filter-count" id="filter-count" aria-live="polite">Showing ${cards.length} captures</p></div><div class="gallery" id="gallery">${cards.map(card).join('\n')}</div><p class="empty" id="empty-state" hidden>No captures match these filters.</p></section><footer><span>MHRI · Magnifica Humanitas Redemptoris Iesu</span><span><a href="report.json">Download public report JSON</a> · Screenshots open at full size in a new tab.</span></footer></main>
<script>
(() => {
  const status = document.querySelector('#status-filter');
  const region = document.querySelector('#region-filter');
  const city = document.querySelector('#city-filter');
  const size = document.querySelector('#size-filter');
  const cards = [...document.querySelectorAll('.capture-card')];
  const params = new URLSearchParams(location.search);
  for (const [key, control] of [['status', status], ['region', region], ['city', city], ['size', size]]) {
    const value = params.get(key);
    if ([...control.options].some(option => option.value === value)) control.value = value;
  }
  function filter() {
    let visible = 0;
    for (const card of cards) {
      card.hidden = (status.value !== 'all' && card.dataset.status !== status.value) || (region.value !== 'all' && card.dataset.region !== region.value) || (city.value !== 'all' && card.dataset.city !== city.value);
      if (!card.hidden) visible++;
    }
    document.querySelector('#gallery').classList.toggle('large', size.value === 'large');
    document.querySelector('#filter-count').textContent = 'Showing ' + visible + ' of ' + cards.length + ' captures';
    document.querySelector('#empty-state').hidden = visible > 0;
    const next = new URL(location.href);
    for (const [key, control] of [['status', status], ['region', region], ['city', city], ['size', size]]) {
      if (control.value === 'all' || control.value === 'grid') next.searchParams.delete(key);
      else next.searchParams.set(key, control.value);
    }
    history.replaceState(null, '', next.pathname + next.search + next.hash);
  }
  for (const control of [status, region, city, size]) control.addEventListener('change', filter);
  filter();
  ${report.finished ? '' : 'setTimeout(() => location.reload(), 20000);'}
})();
</script></body></html>\n`;
}

/** Write a public, self-contained gallery and sanitized JSON snapshot. */
export async function generateReport(manifest, outputDir) {
  if (typeof outputDir !== 'string' || !outputDir) throw new TypeError('outputDir must be a directory path');
  const report = sanitize(manifest);
  await mkdir(outputDir, { recursive: true });
  const files = [['report.json', JSON.stringify(report, null, 2) + '\n'], ['index.html', render(report)]];
  // Each file is replaced atomically so a live reader never receives half a report.
  for (const [name, contents] of files) {
    const destination = path.join(outputDir, name);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o644 });
    await rename(temporary, destination);
  }
  return report;
}
