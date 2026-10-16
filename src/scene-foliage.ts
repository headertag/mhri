import type { Season } from './scene-astronomy';

export type ClimateGroup = 'tropical-rainforest' | 'tropical-seasonal' | 'arid' | 'mediterranean' | 'subtropical' | 'oceanic' | 'continental' | 'boreal' | 'polar' | 'unknown';
export interface ClimateProfile {
  koppenCode: string | null;
  group: ClimateGroup;
  confidence: 'mapped' | 'nearby' | 'unknown';
  source: string;
}
export interface ClimateHistory {
  sampleDays: number;
  startDate: string;
  endDate: string;
  meanTemperatureC: number;
  meanMinTemperatureC: number;
  meanMaxTemperatureC: number;
  precipitationMm: number;
  freezeDays: number;
  snowfallCm: number | null;
}
export interface FoliageState {
  state: 'green' | 'fresh' | 'autumn' | 'dormant' | 'dry';
  label: string;
  reason: string;
  landscape: 'summer' | 'spring' | 'autumn' | 'winter' | 'dry';
  filter: string;
  confidence: 'climate-and-history' | 'climate' | 'fallback' | 'preview';
}
export interface FoliageLocation { latitude: number; longitude: number; timeZone: string }

const DAY = 86_400_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const landscapeFor: Record<FoliageState['state'], FoliageState['landscape']> = {green:'summer',fresh:'spring',autumn:'autumn',dormant:'winter',dry:'dry'};
const climateGroups = new Set<ClimateGroup>(['tropical-rainforest','tropical-seasonal','arid','mediterranean','subtropical','oceanic','continental','boreal','polar','unknown']);
const normalizedCode = (climate: ClimateProfile | null) => typeof climate?.koppenCode === 'string' ? climate.koppenCode.trim().toLowerCase() : '';

function climateGroup(climate: ClimateProfile | null): ClimateGroup {
  if (!climate || !['mapped','nearby'].includes(climate.confidence)) return 'unknown';
  const code = normalizedCode(climate);
  if (code === 'af') return 'tropical-rainforest';
  if (code === 'am' || code === 'aw' || code === 'as') return 'tropical-seasonal';
  if (/^b[ws][hk]$/.test(code || '')) return 'arid';
  if (/^cs[abc]$/.test(code || '')) return 'mediterranean';
  if (/^c[fw]a$/.test(code || '')) return 'subtropical';
  if (/^c[fw][bc]$/.test(code || '')) return 'oceanic';
  if (/^d[fsw][ab]$/.test(code || '')) return 'continental';
  if (/^d[fsw][cd]$/.test(code || '')) return 'boreal';
  if (code === 'et' || code === 'ef') return 'polar';
  return climateGroups.has(climate.group) ? climate.group : 'unknown';
}

function dateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value ? timestamp : Number.NaN;
}

/** Do not let a one-day cold snap, incomplete interval or stale history change leaf state. */
function usableHistory(history: ClimateHistory | null, now: Date): ClimateHistory | null {
  if (!history || !Number.isInteger(history.sampleDays) || history.sampleDays < 21 || history.sampleDays > 35) return null;
  const start = dateOnly(history.startDate), end = dateOnly(history.endDate);
  const span = (end - start) / DAY + 1;
  const age = Math.floor(now.getTime() / DAY) - end / DAY;
  if (!Number.isFinite(span) || span < history.sampleDays || span > 35 || history.sampleDays / span < .75 || age < -1 || age > 7) return null;
  if (![history.meanTemperatureC,history.meanMinTemperatureC,history.meanMaxTemperatureC].every(value => Number.isFinite(value) && value >= -95 && value <= 70)) return null;
  if (history.meanMinTemperatureC > history.meanTemperatureC || history.meanTemperatureC > history.meanMaxTemperatureC) return null;
  if (!Number.isFinite(history.precipitationMm) || history.precipitationMm < 0 || history.precipitationMm > 5000) return null;
  if (!Number.isInteger(history.freezeDays) || history.freezeDays < 0 || history.freezeDays > history.sampleDays) return null;
  return history;
}

function localMonth(now: Date, timeZone: string): number {
  try { return Number(new Intl.DateTimeFormat('en-US',{month:'numeric',timeZone}).format(now)) - 1; }
  catch { return now.getUTCMonth(); }
}

/** Approximate geometric day length is sufficient for broad seasonal gates, not a sunrise display. */
function daylightHours(now: Date, latitude: number): number {
  const dayOfYear = (Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()) - Date.UTC(now.getUTCFullYear(),0,1)) / DAY + 1;
  const radians = Math.PI / 180;
  const declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365.2422) * radians;
  const hourAngle = -Math.tan(clamp(latitude,-89.999,89.999) * radians) * Math.tan(declination);
  return 24 / Math.PI * Math.acos(clamp(hourAngle,-1,1));
}

/**
 * An artistic foliage proxy, not observed vegetation or a species-specific phenology forecast.
 * Köppen describes regional climate, not which trees occur in the preserved painting. Evergreen
 * climates therefore keep foliage by default; only a continental deciduous proxy uses autumn
 * colour and leafless winter. Day length prevents a warm October week from restarting summer.
 * Recent multi-week means/rainfall refine the treatment; today's weather is deliberately absent.
 * Background: https://weather.metoffice.gov.uk/climate/climate-explained/climate-zones
 * Phenology: https://prod.usanpn.org/news/article/new-look-national-patterns-leaf-out-and-leaf-color-change
 * Numerical thresholds below are conservative art-direction gates, not calibrated biological models.
 */
export function resolveFoliage(now: Date, location: FoliageLocation | null, calendarSeason: Season,
  climate: ClimateProfile | null, history: ClimateHistory | null, elevationM?: number | null): FoliageState {
  const validLocation = location && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
  const group = climateGroup(climate);
  const usable = Number.isFinite(now.getTime()) ? usableHistory(history,now) : null;
  const confidence: FoliageState['confidence'] = group === 'unknown' || !validLocation ? 'fallback' : usable ? 'climate-and-history' : 'climate';
  const result = (state: FoliageState['state'],label: string,reason: string,filter='none'): FoliageState => ({state,label,reason,landscape:landscapeFor[state],filter,confidence});
  if (!validLocation || !Number.isFinite(now.getTime()) || group === 'unknown') {
    return {...result('green','Neutral foliage','Climate information is unavailable; retain neutral green foliage rather than infer leaf behaviour from a month or latitude.'),confidence:'fallback'};
  }
  const code = normalizedCode(climate);
  const rain = usable ? usable.precipitationMm * 28 / usable.sampleDays : null;
  const dryWarm = usable && rain !== null && rain < 25 && usable.meanTemperatureC >= 14;
  const dayLength = daylightHours(now,location.latitude);
  const hemisphereMonth = (localMonth(now,location.timeZone) + (location.latitude < 0 ? 6 : 0)) % 12;
  const winterWindow = hemisphereMonth === 11 || hemisphereMonth <= 1;
  const autumnWindow = hemisphereMonth >= 8 && hemisphereMonth <= 10;
  const springWindow = hemisphereMonth >= 2 && hemisphereMonth <= 4;

  if (group === 'tropical-rainforest') {
    return result('green','Rainforest green','A tropical rainforest climate keeps green foliage; a temperate calendar season does not prescribe leaf fall.');
  }
  if (group === 'tropical-seasonal') {
    return dryWarm
      ? result('dry','Dry-season foliage','Low rainfall across a recent multi-week interval supports a muted tropical dry-season treatment, without temperate autumn colour.')
      : result('green','Tropical green',usable ? 'Recent rainfall supports tropical green foliage; wet and dry conditions matter more here than temperate seasons.' : 'Keep tropical foliage green until a reliable multi-week rainfall history supports a dry-season treatment.');
  }
  if (group === 'arid') {
    return usable && rain !== null && rain >= 60 && usable.meanTemperatureC >= 8
      ? result('green','Rain-softened dryland','Substantial recent rainfall allows a restrained greener treatment within the dry-climate painting.','saturate(.86)')
      : result('dry','Dry-climate foliage','A mapped arid climate uses muted olive foliage and dry earth, not orange autumn leaves or a bare temperate winter.');
  }
  if (group === 'mediterranean') {
    return dryWarm
      ? result('dry','Dry Mediterranean foliage','Sustained low rainfall supports dry ground and muted evergreen foliage; calendar autumn does not imply orange leaves.')
      : result('green','Mediterranean green','Mediterranean foliage stays evergreen in this artistic proxy; recent moisture and dry summers are more relevant than a four-season leaf cycle.');
  }
  // Warm and cool tropical highlands can share C codes with temperate lowlands. Elevation
  // helps identify them, but latitude+climate still protect a highland when elevation is missing.
  const lowLatitudeHighland = Math.abs(location.latitude) < 25 && /^c[fw][bc]$/.test(code);
  const elevatedSubtropical = Math.abs(location.latitude) < 30 && Number.isFinite(elevationM) && elevationM! >= 1200 && /^c[fw]/.test(code);
  if (lowLatitudeHighland || elevatedSubtropical) {
    const seasonalDry = /^cw/.test(code) && usable && rain !== null && rain < 20 && usable.meanTemperatureC >= 8;
    return seasonalDry
      ? result('dry','Highland dry-season foliage','Recent low rainfall supports a dry highland treatment; cool equatorial temperatures do not imply a temperate winter.')
      : result('green','Highland green','This low-latitude highland climate keeps green foliage; elevation and cool nights are not evidence for a temperate four-season leaf cycle.');
  }
  if (group === 'subtropical') {
    const seasonalDry = usable && rain !== null && rain < 15 && (usable.meanTemperatureC >= 22 || (code === 'cwa' && usable.meanTemperatureC >= 12));
    return seasonalDry
      ? result('dry','Dry subtropical foliage','Sustained dry conditions support muted foliage, without assuming temperate autumn leaf colour.')
      : result('green','Subtropical green','A warm subtropical climate retains green foliage in this species-neutral interpretation, including Southern Hemisphere autumn.');
  }
  if (group === 'oceanic') {
    return result('green','Maritime green','Oceanic climate alone cannot distinguish evergreen from deciduous trees; retain green foliage instead of prescribing orange or bare branches from the calendar.');
  }
  if (group === 'boreal') {
    return result('green','Evergreen woodland','A boreal evergreen interpretation preserves foliage through cold and short days; snowfall is handled separately from leaf state.','saturate(.82)');
  }
  if (group === 'polar') {
    return result('dormant','Cold-climate terrain','Persistent polar cold uses subdued dormant terrain, never a temperate orange autumn. The historic woodland composition remains an artistic interpretation.','saturate(.72)');
  }

  // Only a continental climate reaches this deciduous proxy. All gates combine
  // the hemisphere-local calendar and photoperiod; cold summer weather cannot strip leaves.
  if (calendarSeason === 'winter' && winterWindow && dayLength < 11.5) {
    return result('dormant','Dormant woodland','The continental cold-season and short daylight support dormant deciduous foliage; a brief warm spell does not regrow leaves.');
  }
  if (calendarSeason === 'autumn' && autumnWindow) {
    const sustainedCold = usable && (usable.meanTemperatureC <= 5 || usable.freezeDays / usable.sampleDays >= .25);
    if (hemisphereMonth === 10 && dayLength < 10.8 && sustainedCold) {
      return result('dormant','Late-autumn dormancy','Late autumn, short daylight and sustained recent cold support a dormant woodland treatment.');
    }
    const establishedAutumn = hemisphereMonth >= 9 && dayLength < 12;
    const earlyCooling = usable && dayLength < 12.6 && usable.meanTemperatureC <= 16 && usable.meanMinTemperatureC <= 11;
    if (establishedAutumn || earlyCooling) {
      return result('autumn','Autumn foliage',establishedAutumn ? 'Established continental autumn and shortening daylight support leaf colour even during a warm recent spell.' : 'Shortening days and several weeks of cooler temperatures support the continental autumn foliage treatment.');
    }
  }
  if (calendarSeason === 'spring' && springWindow) {
    if (usable && usable.meanTemperatureC <= 4 && usable.freezeDays / usable.sampleDays >= .25) {
      return result('dormant','Lingering spring dormancy','A sustained cold recent interval delays the spring foliage treatment despite the calendar change.');
    }
    if (usable && usable.meanTemperatureC >= 9 && usable.meanMinTemperatureC >= 1 && usable.freezeDays / usable.sampleDays <= .11 && dayLength >= 11.5) {
      return result('fresh','Fresh spring foliage','Longer days, recent warmth and few freezing nights support fresh spring foliage.');
    }
  }
  return result('green','Green woodland','Keep green continental foliage until the season, daylight and sustained conditions support a different treatment.');
}
