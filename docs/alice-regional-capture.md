# ALICE regional screenshot checks

The capture runner uses the [ALICE toolbar integration](https://github.com/alice-institute/toolbar/blob/main/docs/integration.md) to request screenshots of the live MHRI application. The current test requests **30 jobs at a priority bid of $0.20 per 1,000 tasks**. The operator described the fleet as randomly assigned among ten US cities; coverage is measured from the locations MHRI actually detects rather than assumed from the job count.

## Credentials and execution

Put `ALICE_API_TOKEN` and `ALICE_API_URL` in the local `.env-secrets` file. The endpoint is `https://toolbar.alice.institute`. The credential file is ignored by Git and excluded from Docker builds. No ALICE credential is needed in Fly, the browser, or the public report.

```bash
node scripts/alice-capture.mjs --run-id us-cities-20261016-1552 --count 30 --cpm 0.20
```

Each submission requests `screenshot: true` and `fullHTML: true`. All jobs are enqueued before polling. The runner checks terminal results in parallel, downloads the JPEGs promptly, and does not automatically enqueue retries. A run can be resumed with the same ID without resubmitting known tasks; an interrupted submission with an uncertain outcome is marked explicitly instead of risking a duplicate. A new run ID creates new jobs.

ALICE has a 60-second queue window and a 100-second end-to-end task deadline. The runner permits 150 seconds before recording an absent terminal result, allowing for polling and network delays. HTTP 200 from the result endpoint can still contain a terminal error; a successful result must also provide a downloadable, valid JPEG.

## What the capture URL changes

`https://mhri.net/?aliceCapture=<run-id>&sample=<number>` enables a small diagnostics panel only for that URL. It uses the node's automatic IP location, disregards previously saved city/view settings, and does not change those saved preferences. It forces automatic local conditions and leaves the original-view and Neuromancer effects off.

The panel exposes approximate city/country, IANA time zone and local time, weather availability, the staged scene's time/season/weather/moon, and viewport dimensions. It emits `MHRI_CAPTURE_JSON:` only once the environment request has settled and the requested landscape, sky and original figure image have decoded. Image failures and loading remain visible rather than being marked ready.

ALICE does not support a readiness selector or region/viewport parameter. Its current extension waits two seconds after navigation, with an additional five seconds for sparse pages, then captures. Therefore **a downloaded screenshot does not establish that the app finished loading**. The report counts downloaded screenshots, ready diagnostics and live weather independently. An early capture with no diagnostics is inconclusive, not a visual pass.

## Results and privacy

- Public gallery and sanitized JSON: `public/uat/alice/<run-id>/index.html` and `report.json`.
- Durable public image copies: `public/uat/alice/<run-id>/captures/`.
- Private provider JSON, rendered HTML and resumable job state: `.alice-runs/<run-id>/`, ignored by Git and Docker.

The gallery supports city/status filters and large frames. Node identities and task IDs become hashed public aliases. The public report uses an allowlist; it excludes raw IP addresses, exact coordinates, signed artifact URLs, provider sidecars and credentials. Public artifacts must be checked before committing and deployed through the normal CI workflow.

ALICE samples can repeat nodes and cities. The approximate location reported by MHRI is not independent proof of the node's physical position. Captures also use ALICE's window sizes rather than a requested mobile breakpoint. Review the screenshots for composition, seams, image loading and weather accuracy; the gallery does not automatically certify those visual properties.
