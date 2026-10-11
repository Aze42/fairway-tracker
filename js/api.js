// GolfCourseAPI.com client (optional). The key is entered by the user in Settings and kept only in this
// device's localStorage; it is sent only to api.golfcourseapi.com and never stored in the app's files.
import { t } from './i18n.js';

const BASE = 'https://api.golfcourseapi.com/v1';
const YD = 0.9144;
export const DAILY_LIMIT = 35;

// Rough local counter so the user can see how much of the free daily quota is probably used.
const USAGE_KEY = 'fairway.apiUsage';
const day = () => new Date().toISOString().slice(0, 10);
export function usageToday() {
  try { const u = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}'); return u.day === day() ? u.n : 0; } catch { return 0; }
}
function bump() {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify({ day: day(), n: usageToday() + 1 })); } catch { /* ignore */ }
}

// Small cache so repeating a search or opening the same course doesn't spend more requests.
const CACHE_KEY = 'fairway.apiCache';
function cacheGet(k) { try { return (JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'))[k]; } catch { return undefined; } }
function cacheSet(k, v) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    c[k] = v;
    const keys = Object.keys(c);
    if (keys.length > 40) delete c[keys[0]];
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* ignore */ }
}

async function call(path, key) {
  const hit = cacheGet(path);
  if (hit) return hit;
  bump();
  let res;
  try {
    res = await fetch(BASE + path, { headers: { Accept: 'application/json', Authorization: 'Key ' + key } });
  } catch {
    throw new Error(t('Could not reach GolfCourseAPI. Check your connection. If it keeps failing, the service may block requests from browsers.'));
  }
  if (res.status === 401 || res.status === 403) throw new Error(t('Invalid API key. Check it in Settings.'));
  if (res.status === 429) throw new Error(t('Daily request limit reached (35 per day on the free plan). Try again tomorrow.'));
  if (!res.ok) throw new Error(t('GolfCourseAPI error') + ' (' + res.status + ')');
  const data = await res.json();
  cacheSet(path, data);
  return data;
}

export async function searchApi(q, key) {
  const d = await call('/search?search_query=' + encodeURIComponent(q), key);
  const list = d.courses || d.results || (Array.isArray(d) ? d : []);
  return list.map(normalize);
}

export async function getApiCourse(id, key) {
  const d = await call('/courses/' + encodeURIComponent(id), key);
  return normalize(d.course || d);
}

// Accepts tees as {male:[…], female:[…]} or a plain array; distances may be in yards or metres.
function normalize(c) {
  const loc = c.location || {};
  const tees = [];
  const T = c.tees;
  if (Array.isArray(T)) T.forEach(x => tees.push({ ...x, gender: x.gender || '' }));
  else if (T && typeof T === 'object') for (const [g, arr] of Object.entries(T)) (arr || []).forEach(x => tees.push({ ...x, gender: g }));
  const names = [c.club_name, c.course_name].filter((v, i, a) => v && a.indexOf(v) === i);
  return {
    id: c.id,
    name: names.join(' – ') || c.name || '?',
    display: [loc.city, loc.state, loc.country].filter(Boolean).join(', '),
    tees: tees.map(x => ({
      name: x.tee_name || x.name || '',
      gender: x.gender,
      meters: x.total_meters || (x.total_yards ? Math.round(x.total_yards * YD) : null),
      par: x.par_total,
      holes: (x.holes || []).map(h => ({
        par: h.par,
        dist: h.meters || (h.yardage ? Math.round(h.yardage * YD) : null),
        hcp: h.handicap,
      })),
    })),
  };
}

export function courseFromTee(c, tee) {
  const holes = tee.holes.map((h, i) => ({
    n: i + 1, par: h.par >= 3 && h.par <= 6 ? h.par : 4, dist: h.dist || null,
    hcp: h.hcp >= 1 && h.hcp <= 18 ? h.hcp : null, shape: 'straight', note: '',
  }));
  return { name: c.name, city: c.display, source: 'api', apiId: c.id, holes };
}
