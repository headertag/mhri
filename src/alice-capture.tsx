import { useEffect, useMemo, useState } from 'react';
import type { Environment } from './environment';
import type { SceneEnvironment } from './scene-environment';
import './alice-capture.css';

export interface CaptureSceneState {
  status: 'loading' | 'ready' | 'error';
  scene: SceneEnvironment | null;
}

/** A capture-only URL switch, deliberately unrelated to saved visitor preferences. */
export function readCaptureId(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('aliceCapture');
  return value === null ? null : value.slice(0, 80) || 'capture';
}

function viewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    visualWidth: Math.round(window.visualViewport?.width ?? window.innerWidth),
    visualHeight: Math.round(window.visualViewport?.height ?? window.innerHeight),
  };
}

function localDateTime(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const value = (name: string) => parts.find(part => part.type === name)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
  } catch { return now.toISOString(); }
}

export function AliceCapture({ runId, appReady, environment, environmentLoading, environmentError, now, requestedScene, stagedScene }: {
  runId: string;
  appReady: boolean;
  environment: Environment | null;
  environmentLoading: boolean;
  environmentError: boolean;
  now: Date;
  requestedScene: SceneEnvironment;
  stagedScene: CaptureSceneState;
}) {
  const [device, setDevice] = useState(viewport);
  useEffect(() => {
    const update = () => setDevice(viewport());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const scene = stagedScene.scene || requestedScene;
  const location = environment?.location;
  const timeZone = location?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const localTime = localDateTime(now, timeZone);
  const settled = appReady && environment !== null && !environmentLoading;
  // Object identity ensures a ready callback from an older request cannot certify a newer scene.
  const captureReady = settled && stagedScene.status === 'ready' && stagedScene.scene === requestedScene;
  const state = stagedScene.status === 'error' ? 'asset-error' : captureReady ? 'ready' : 'loading';
  const moonVisible = scene.moonOpacity > 0;
  const moonVisibility = !scene.sky ? 'location unavailable' : scene.period !== 'night' ? 'daylight'
    : !scene.sky.moonAboveHorizon ? 'below horizon' : scene.weather.obscuresMoon ? 'behind clouds'
    : !moonVisible ? 'unlit or near horizon' : 'visible';
  const metadata = useMemo(() => ({
    schema: 1,
    runId,
    captureReady,
    captureStatus: state,
    capturedAtISO: new Date().toISOString(),
    localTime,
    timeZone,
    environment: {
      status: environment?.status || 'loading',
      error: environmentError,
      reason: environment?.reason || null,
      fetchedAt: environment?.fetchedAt || null,
      location: location ? {
        city: location.city,
        countryCode: location.countryCode,
        timeZone: location.timeZone,
        source: location.source || 'ip',
        approximate: true,
      } : null,
      weather: environment?.weather ? {
        observedAt: environment.weather.observedAt,
        weatherCode: environment.weather.weatherCode,
        cloudCover: environment.weather.cloudCover,
        temperatureC: environment.weather.temperatureC,
        windSpeedKmh: environment.weather.windSpeedKmh,
        windDirectionDeg: environment.weather.windDirectionDeg,
      } : null,
      climate: environment?.climate ? {
        koppenCode: environment.climate.koppenCode, group: environment.climate.group,
        confidence: environment.climate.confidence, source: environment.climate.source,
      } : null,
      climateHistory: environment?.climateHistory || null,
      elevationM: environment?.elevationM ?? null,
    },
    scene: {
      period: scene.period,
      season: scene.season,
      foliage: scene.foliage,
      weather: scene.weather.kind,
      weatherLabel: scene.weather.label,
      cloudCover: scene.weather.cloudCover,
      phase: scene.sky?.phase ?? null,
      phaseName: scene.sky?.phaseName ?? null,
      illumination: scene.sky?.illumination ?? null,
      moonAltitude: scene.sky?.moonAltitude ?? null,
      moonVisible,
      moonVisibility,
      moonOpacity: scene.moonOpacity,
      landscape: scene.landscape,
      skyImage: scene.skyImage,
      preview: scene.preview,
    },
    viewport: device,
  }), [runId, captureReady, state, now, environment, environmentError, location, timeZone, localTime, scene, moonVisible, moonVisibility, device]);

  // The screenshot runner grants an extra settling window to pages with little
  // visible text. Keep the loading/error probe short; full metadata certifies readiness.
  if (!captureReady) return <aside className="alice-capture" aria-label="MHRI regional capture diagnostics" data-capture-status={state} data-capture-ready="false">
    {state === 'asset-error' ? 'MHRI capture: image error; ready=false.' : 'MHRI capture: loading local sky and images…'}
  </aside>;

  return <aside className="alice-capture" aria-label="MHRI regional capture diagnostics" data-capture-status={state} data-capture-ready={captureReady}>
    <header className="alice-capture-heading"><strong>MHRI regional capture</strong><span className={`alice-capture-status alice-capture-status-${state}`}>{state === 'asset-error' ? 'Image failed' : captureReady ? 'Ready' : 'Loading…'}</span></header>
    <p className="alice-capture-run">Run: {runId}</p>
    <dl className="alice-capture-facts">
      <dt>Client</dt><dd>{location?.city || 'City unavailable'}{location?.countryCode ? ` · ${location.countryCode}` : ''} <span>({location?.source || (location ? 'IP' : 'no location')})</span></dd>
      <dt>Local</dt><dd>{localTime}</dd>
      <dt>Zone</dt><dd>{timeZone}{!location && <span> · device fallback</span>}</dd>
      <dt>Data</dt><dd>{environment?.status || 'loading'}{environmentError ? ' · request failed' : ''}</dd>
      <dt>Scene</dt><dd>{scene.period} · {scene.foliage.label.toLowerCase()} · {scene.weather.label.toLowerCase()}</dd>
      <dt>Climate</dt><dd>{environment?.climate?.koppenCode || 'Unmapped'} · {scene.foliage.confidence}</dd>
      <dt>Moon</dt><dd>{scene.sky?.phaseName || 'Not calculated'} · {moonVisibility}</dd>
      <dt>Device</dt><dd>{device.width} × {device.height} · DPR {device.dpr}</dd>
    </dl>
    <pre className="alice-capture-json" data-capture-json="true">{`MHRI_CAPTURE_JSON: ${JSON.stringify(metadata)}`}</pre>
  </aside>;
}
