#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from './alice-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const runId = option('--run-id', `regional-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`);
const count = Number(option('--count', '30'));
const cpm = Number(option('--cpm', '0.20'));
if (!/^[a-z0-9-]{1,90}$/.test(runId) || !Number.isInteger(count) || count < 1 || count > 30 || cpm !== 0.20) throw Error('Use a safe run ID, 1–30 captures, and CPM 0.20.');

function parseSecrets(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(?:export\s+)?(ALICE_API_TOKEN|ALICE_API_URL)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value.replace(/\\:/g, ':').trim()]];
  }));
}
const secrets = parseSecrets(await readFile(resolve(root, '.env-secrets'), 'utf8'));
const endpoint = new URL(secrets.ALICE_API_URL || 'https://toolbar.alice.institute');
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'toolbar.alice.institute' || endpoint.username || endpoint.password || !secrets.ALICE_API_TOKEN) throw Error('ALICE credentials or endpoint are invalid.');
const privateDir = resolve(root, '.alice-runs', runId);
const outputDir = resolve(root, 'public', 'uat', 'alice', runId);
await mkdir(privateDir, { recursive: true, mode: 0o700 });
await mkdir(resolve(outputDir, 'captures'), { recursive: true });
const privateManifest = resolve(privateDir, 'manifest.json');
let manifest;
try { manifest = JSON.parse(await readFile(privateManifest, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (manifest && (manifest.requested !== count || manifest.cpm !== cpm)) throw Error('Existing run parameters differ. Resume with the same parameters.');
manifest ||= { runId, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), targetUrl: 'https://mhri.net/', cpm, requested: count, status: 'running', expectedCoverage: { country: 'US', cityPool: 10, assignment: 'random' }, results: Array.from({ length: count }, (_, i) => ({ index: i + 1, taskId: null, status: 'pending' })) };
let saveChain = Promise.resolve();
function save() {
  saveChain = saveChain.then(async () => {
    manifest.updatedAt = new Date().toISOString();
    await writeFile(privateManifest + '.tmp', JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await rename(privateManifest + '.tmp', privateManifest);
    await generateReport(manifest, outputDir);
  });
  return saveChain;
}
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
async function api(path, payload) {
  return fetch(new URL(path, endpoint), { method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secrets.ALICE_API_TOKEN}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined, redirect: 'error', signal: AbortSignal.timeout(15_000) });
}
async function artifact(url, maxBytes) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Invalid artifact address');
  // Artifact storage receives no ALICE authorization header.
  const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw Error('Artifact unavailable or oversized');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) { length += chunk.length; if (length > maxBytes) throw Error('Artifact oversized'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function captureMetadata(text, html = '') {
  const decode = value => value.replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const candidates = [text?.match(/MHRI_CAPTURE_JSON:\s*([^\r\n]+)/)?.[1], html.match(/MHRI_CAPTURE_JSON:\s*([^<\r\n]+)/)?.[1], html.match(/<script[^>]*id="mhri-capture-data"[^>]*>(.*?)<\/script>/s)?.[1]];
  for (const candidate of candidates) { if (!candidate) continue; try { return JSON.parse(decode(candidate.trim())); } catch { /* Try the next serialized representation. */ } }
  return null;
}

await save();
console.log(`ALICE run ${runId}: ${count} jobs at CPM ${cpm.toFixed(2)}. No automatic resubmissions.`);
// Mark before posting: an interrupted POST has an uncertain outcome and must
// not silently create a duplicate job when the run is resumed.
for (const row of manifest.results) {
  if (row.status !== 'pending' || row.taskId) continue;
  if (row.submissionAttemptedAt) { row.status = 'error'; row.code = 'SUBMISSION_OUTCOME_UNKNOWN'; row.error = 'Submission was interrupted; no duplicate was enqueued.'; continue; }
  row.submissionAttemptedAt = new Date().toISOString();
  await save();
  try {
    const url = new URL(manifest.targetUrl); url.searchParams.set('aliceCapture', runId); url.searchParams.set('sample', String(row.index));
    const response = await api('/add-task', { url: url.href, cpm, screenshot: true, fullHTML: true });
    if (!response.ok) throw Error(`Submission HTTP ${response.status}`);
    const result = await response.json();
    if (!result.taskId || !Number.isSafeInteger(Number(result.taskId))) throw Error('Submission returned no valid task ID');
    row.taskId = result.taskId; row.submittedAt = row.submissionAttemptedAt;
    console.log(`Submitted ${row.index}/${count}: task ${row.taskId}`);
  } catch (error) { row.status = 'error'; row.code = 'SUBMISSION_FAILED'; row.error = error.message.startsWith('Submission') ? error.message : 'Submission outcome could not be confirmed; no duplicate was enqueued.'; }
  await save();
}

async function collect(row, result) {
  await writeFile(resolve(privateDir, `${String(row.index).padStart(2, '0')}-result.json`), JSON.stringify(result, null, 2), { mode: 0o600 });
  row.completedAt = new Date().toISOString();
  row.identity = typeof result.identity === 'string' ? result.identity : null;
  row.workerVersion = typeof result.version === 'string' ? result.version : null;
  row.httpStatus = result.httpStatus ?? null;
  row.durationMs = result.duration ?? null;
  row.capture = captureMetadata(result.text);
  if (result.fullHTMLUrl) {
    try { const html = await artifact(result.fullHTMLUrl, 8 * 1024 * 1024); await writeFile(resolve(privateDir, `${String(row.index).padStart(2, '0')}-page.html`), html, { mode: 0o600 }); row.capture ||= captureMetadata(result.text, html.toString('utf8')); }
    catch { row.metadataWarning = 'Rendered HTML could not be collected.'; }
  }
  if (result.error || !result.screenshotUrl) {
    row.status = 'error'; row.code = result.code || (result.screenshotUrl ? 'WORKER_ERROR' : 'SCREENSHOT_MISSING');
    row.error = typeof result.error === 'string' ? result.error.slice(0, 400) : 'Worker returned no screenshot.';
  } else {
    try {
      const jpg = await artifact(result.screenshotUrl, 20 * 1024 * 1024);
      if (jpg[0] !== 0xff || jpg[1] !== 0xd8 || jpg.length < 1000) throw Error('Invalid JPEG');
      row.screenshot = `captures/${String(row.index).padStart(2, '0')}.jpg`;
      await writeFile(resolve(outputDir, row.screenshot), jpg);
      row.status = 'success';
    } catch { row.status = 'error'; row.code = 'ARTIFACT_DOWNLOAD_FAILED'; row.error = 'The screenshot could not be downloaded or validated.'; }
  }
  console.log(`Collected ${row.index}/${count}: ${row.status}${row.capture ? ' · page diagnostics present' : ' · no page diagnostics'}`);
}

while (manifest.results.some(row => row.status === 'pending' && row.taskId)) {
  await Promise.all(manifest.results.filter(row => row.status === 'pending' && row.taskId).map(async row => {
    const age = Date.now() - Date.parse(row.submittedAt);
    try {
      const response = await api(`/result/${encodeURIComponent(row.taskId)}`);
      if (response.status === 200) await collect(row, await response.json());
      else if (response.status !== 404) row.lastPollStatus = response.status;
    } catch { row.pollFailures = (row.pollFailures || 0) + 1; }
    if (row.status === 'pending' && age > 150_000) { row.status = 'error'; row.code = 'RESULT_NOT_RECEIVED'; row.error = 'No terminal result was available within 150 seconds; no retry was submitted.'; row.completedAt = new Date().toISOString(); }
  }));
  await save();
  if (manifest.results.some(row => row.status === 'pending' && row.taskId)) await sleep(5_000);
}
manifest.status = 'complete'; manifest.completedAt = new Date().toISOString();
await save();
const good = manifest.results.filter(row => row.status === 'success').length;
console.log(`Finished ${good}/${count} screenshots. Report: public/uat/alice/${runId}/index.html`);
