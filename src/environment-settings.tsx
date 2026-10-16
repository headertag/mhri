import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { validPlace, type Place, type useEnvironment } from './environment';

export type ScenePreview = { time: string; weather: string; season: string };
export const LIVE_PREVIEW: ScenePreview = { time: 'auto', weather: 'auto', season: 'auto' };

export function EnvironmentSettings({ enabled, onEnabled, environment, preview, onPreview, description }: {
  enabled: boolean; onEnabled: (value: boolean) => void;
  environment: ReturnType<typeof useEnvironment>;
  preview: ScenePreview; onPreview: (value: ScenePreview) => void; description: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearchMessage(''); setSearching(false); return; }
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true); setSearchMessage('');
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search unavailable');
        const payload = await response.json();
        if (payload.unavailable || payload.reason === 'rate-limited') throw new Error('Search unavailable');
        const places = (Array.isArray(payload) ? payload : payload.places || payload.results || []).filter(validPlace);
        if (active) { setResults(places); if (!places.length) setSearchMessage('No matching cities. Try a nearby larger city.'); }
      } catch { if (active) { setResults([]); setSearchMessage('City search is temporarily unavailable. Please try again.'); } }
      finally { if (active) setSearching(false); }
    }, 400);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query]);
  const { data, loading, error, place } = environment;
  let localTime = '';
  try { localTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: data?.location?.timeZone || undefined }).format(environment.now); } catch { /* Device clock remains the fallback. */ }
  return <section className="environment-settings" aria-label="Living landscape settings">
    <div className="setting-row"><label htmlFor="environment-switch">Local time & weather</label><Switch id="environment-switch" checked={enabled} onCheckedChange={onEnabled}/></div>
    {enabled && <>
      <div className="environment-summary" aria-live="polite">
        <strong>{loading && !data ? 'Finding your local sky…' : data?.location?.city || place?.name || 'Your device’s local time'}</strong>
        <span>{localTime}{data?.location ? ` · ${data.location.timeZone.replaceAll('_', ' ')}` : ''}</span>
        <span>{description}</span>
        {(error || data?.status !== 'live') && !loading && <p>Live weather is unavailable. {data?.location ? 'Local daylight and moon calculations remain active.' : 'The scene follows your device clock until a location is available.'} <button type="button" onClick={environment.retry}>Retry</button></p>}
      </div>
      <details className="scene-options">
        <summary>{place ? 'Change selected city' : 'Not your area? Choose a city'}</summary>
        <label className="scene-input-label" htmlFor="city-search">City or town</label>
        <input id="city-search" type="search" maxLength={80} autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Toronto, Perth, São Paulo"/>
        <div className="place-results" aria-live="polite">
          {searching && <p>Searching…</p>}
          {searchMessage && <p>{searchMessage}</p>}
          {results.map(p => <button type="button" key={`${p.id}-${p.latitude}-${p.longitude}`} onClick={() => { environment.choosePlace(p); setQuery(''); setResults([]); }}><strong>{p.name}</strong><span>{[p.region, p.countryCode, p.timeZone.replaceAll('_', ' ')].filter(Boolean).join(' · ')}</span></button>)}
        </div>
        {place && <button className="text-button" type="button" onClick={() => environment.choosePlace(null)}>Use my approximate IP location</button>}
        <p className="environment-note">IP location is approximate and can reflect a VPN or your provider’s network. A selected city is saved only in this browser.</p>
      </details>
      <details className="scene-options">
        <summary>Explore the other skies</summary>
        <p className="environment-note">Preview a different atmosphere. Choose Automatic to return to local conditions.</p>
        <label className="preview-control">Time of day<select aria-label="Preview time of day" value={preview.time} onChange={e => onPreview({ ...preview, time: e.target.value })}><option value="auto">Automatic</option><option value="dawn">Dawn</option><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option></select></label>
        <label className="preview-control">Weather<select aria-label="Preview weather" value={preview.weather} onChange={e => onPreview({ ...preview, weather: e.target.value })}><option value="auto">Automatic</option><option value="clear">Clear</option><option value="cloudy">Partly cloudy</option><option value="overcast">Overcast</option><option value="rain">Rain</option><option value="snow">Snow</option><option value="fog">Mist & fog</option><option value="thunderstorm">Storm</option></select></label>
        <label className="preview-control">Season<select aria-label="Preview season" value={preview.season} onChange={e => onPreview({ ...preview, season: e.target.value })}><option value="auto">Automatic</option><option value="spring">Spring</option><option value="summer">Summer</option><option value="autumn">Autumn</option><option value="winter">Winter</option></select></label>
        {(preview.time !== 'auto' || preview.weather !== 'auto' || preview.season !== 'auto') && <button type="button" className="text-button" onClick={() => onPreview(LIVE_PREVIEW)}>Return to local conditions</button>}
      </details>
      <p className="environment-note">Approximate IP location: <a href="https://ipwhois.io/" target="_blank" rel="noreferrer">IPWhois</a>. Modeled weather: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0). Cities: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>. Your IP is used for the lookup, never shown or saved by this application. No GPS access.</p>
    </>}
  </section>;
}
