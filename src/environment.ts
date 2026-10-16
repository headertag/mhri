import { useCallback, useEffect, useState } from 'react';

export interface Place {
  id: number;
  name: string;
  region?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}
export interface Environment {
  version: 1;
  status: 'live' | 'location-only' | 'unavailable';
  location: { latitude: number; longitude: number; timeZone: string; city: string | null; countryCode: string | null; approximate: true; source?: 'ip' | 'city' } | null;
  weather: { observedAt: string; temperatureC: number; weatherCode: number; cloudCover: number; precipitationMm: number; rainMm: number; snowfallCm: number; windSpeedKmh: number; windDirectionDeg: number; isDay: boolean } | null;
  sun: { sunrise: string | null; sunset: string | null } | null;
  fetchedAt: string;
  reason?: string;
}

export function validPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false;
  const p = value as Place;
  if (typeof p.name !== 'string' || p.name.length > 100 || !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 || !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180 || typeof p.timeZone !== 'string') return false;
  try { new Intl.DateTimeFormat('en', { timeZone: p.timeZone }).format(); return true; } catch { return false; }
}

function savedPlace(): Place | null {
  try { const p: unknown = JSON.parse(localStorage.getItem('mhri-place') || 'null'); return validPlace(p) ? p : null; } catch { return null; }
}

export function retainLocation(previous: Environment | null, place: Place | null): Environment {
  return { version: 1, status: place || previous?.location ? 'location-only' : 'unavailable',
    location: place ? {latitude:place.latitude,longitude:place.longitude,timeZone:place.timeZone,city:place.name,countryCode:place.countryCode || null,approximate:true,source:'city'} : previous?.location || null,
    weather: null, sun: null, fetchedAt: new Date().toISOString(), reason: 'weather-unavailable' };
}

export function useEnvironment(enabled: boolean, { captureMode = false }: {captureMode?: boolean} = {}) {
  const [place, setPlace] = useState<Place | null>(() => captureMode ? null : savedPlace());
  const [data, setData] = useState<Environment | null>(() => place ? retainLocation(null, place) : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const choosePlace = useCallback((next: Place | null) => {
    if (captureMode) return;
    setPlace(next); setData(next ? retainLocation(null, next) : null); setError(false);
    if (!captureMode) try { if (next) localStorage.setItem('mhri-place', JSON.stringify(next)); else localStorage.removeItem('mhri-place'); } catch { /* Private browsing can disable storage. */ }
  }, [captureMode]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = window.setInterval(tick, 60_000);
    const wake = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', wake); };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let lastFetch = 0;
    let controller: AbortController | null = null;
    const keepLocation = (previous: Environment | null) => retainLocation(previous, place);
    async function load() {
      if (document.hidden || controller) return;
      controller = new AbortController();
      const timer = window.setTimeout(() => controller?.abort(), 18_000);
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (place) {
          params.set('latitude', String(place.latitude)); params.set('longitude', String(place.longitude));
          params.set('timeZone', place.timeZone); params.set('city', place.name);
          if (place.countryCode) params.set('countryCode', place.countryCode);
        }
        const response = await fetch(`/api/environment${params.size ? `?${params}` : ''}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Environment unavailable');
        const result = await response.json() as Environment;
        if (result.version !== 1 || !['live', 'location-only', 'unavailable'].includes(result.status)) throw new Error('Invalid environment');
        if (result.location && !validPlace({ ...result.location, name: result.location.city || 'Approximate area' })) throw new Error('Invalid location');
        if (result.weather && (!Number.isFinite(result.weather.weatherCode) || !Number.isFinite(result.weather.cloudCover) || !Number.isFinite(result.weather.temperatureC) || !Number.isFinite(Date.parse(result.weather.observedAt)))) throw new Error('Invalid weather');
        if (active) { setData(previous => result.location ? result : keepLocation(previous)); setError(false); }
      } catch { if (active) { setData(keepLocation); setError(true); } }
      finally { clearTimeout(timer); controller = null; lastFetch = Date.now(); if (active) setLoading(false); }
    }
    void load();
    const interval = window.setInterval(() => { void load(); }, 30 * 60_000);
    const wake = () => { if (!document.hidden && Date.now() - lastFetch > 30 * 60_000) void load(); };
    document.addEventListener('visibilitychange', wake);
    return () => { active = false; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', wake); };
  }, [enabled, place, refresh]);
  return { data, loading, error, place, choosePlace, now, retry: () => setRefresh(v => v + 1) };
}
