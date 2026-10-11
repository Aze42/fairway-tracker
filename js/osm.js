// Course lookup from OpenStreetMap: Nominatim finds the course, Overpass returns holes/greens/fairways/bunkers.
// Coverage varies by course, so everything imported can be corrected by hand afterwards.
import { haversine, polyLen, projector } from './util.js';
import { t } from './i18n.js';

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export async function searchCourses(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=15&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(t('Search failed') + ' (' + res.status + ')');
  let list = await res.json();
  const courses = list.filter(r => r.category === 'leisure' && r.type === 'golf_course');
  if (courses.length) list = courses;
  else list = list.filter(r => /golf/i.test(r.name || r.display_name || ''));
  return list.map(r => ({
    name: r.name || r.display_name.split(',')[0],
    display: r.display_name,
    osm_type: r.osm_type,
    osm_id: r.osm_id,
    bbox: r.boundingbox.map(Number), // [south, north, west, east]
  }));
}

async function overpass(query) {
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error('Overpass ' + res.status);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(t('Map server unreachable'));
}

export async function fetchCourse(r) {
  let area = '', scope;
  if (r.osm_type === 'way' || r.osm_type === 'relation') {
    const aid = (r.osm_type === 'way' ? 2400000000 : 3600000000) + Number(r.osm_id);
    area = `area(${aid})->.a;`;
    scope = '(area.a)';
  } else {
    const [s, n, w, e] = r.bbox;
    scope = `(${s},${w},${n},${e})`;
  }
  const q = `[out:json][timeout:45];${area}(way["golf"="hole"]${scope};way["golf"~"^(green|fairway|bunker|water_hazard|lateral_water_hazard|tee)$"]${scope};);out tags geom;`;
  const data = await overpass(q);
  return buildCourse(r, data.elements || []);
}

const FEATURE_TYPE = { green: 'green', fairway: 'fairway', bunker: 'bunker', water_hazard: 'water', lateral_water_hazard: 'water', tee: 'tee' };

export function buildCourse(r, elements) {
  const ways = elements.filter(e => e.type === 'way' && e.geometry && e.geometry.length >= 2);
  const holeWays = ways.filter(w => w.tags && w.tags.golf === 'hole');
  if (!holeWays.length) throw new Error(t('OpenStreetMap has no hole data for this course yet. You can enter it manually instead.'));

  const feats = ways
    .filter(w => w.tags && FEATURE_TYPE[w.tags.golf] && w.geometry.length >= 3)
    .map(w => ({ type: FEATURE_TYPE[w.tags.golf], pts: w.geometry.map(p => [round6(p.lat), round6(p.lon)]) }));

  // One entry per hole number; if several variants exist (different tees) keep the longest.
  const byRef = new Map();
  holeWays.forEach((w, i) => {
    const m = String(w.tags.ref || w.tags.name || '').match(/\d+/);
    const n = m ? parseInt(m[0], 10) : 1000 + i;
    const path = w.geometry.map(p => [round6(p.lat), round6(p.lon)]);
    const len = polyLen(path);
    const cur = byRef.get(n);
    if (!cur || len > cur.len) byRef.set(n, { n, path, len, tags: w.tags });
  });
  const sorted = [...byRef.values()].sort((a, b) => a.n - b.n);

  const holes = sorted.map((h, idx) => {
    const lat0 = h.path[0][0], lon0 = h.path[0][1];
    const pr = projector(lat0, lon0);
    const line = h.path.map(p => pr(p[0], p[1]));
    const mine = feats.filter(f => minDistToLine(f.pts.map(p => pr(p[0], p[1])), line) <= 40);

    // Green centre: the green polygon closest to the end of the hole line.
    const end = line[line.length - 1];
    let best = null, bestD = Infinity;
    for (const f of mine.filter(f => f.type === 'green')) {
      const c = centroid(f.pts);
      const cp = pr(c[0], c[1]);
      const d = Math.hypot(cp.x - end.x, cp.y - end.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    const last = h.path[h.path.length - 1];
    const green = best ? { lat: best[0], lon: best[1] } : { lat: last[0], lon: last[1] };
    const dist = Math.round(h.len);
    let par = parseInt(h.tags.par, 10);
    let parGuess = false;
    if (!(par >= 3 && par <= 6)) { par = dist <= 250 ? 3 : dist <= 450 ? 4 : 5; parGuess = true; }
    const hcp = parseInt(h.tags.handicap, 10);
    return {
      n: h.n < 1000 ? h.n : idx + 1,
      par, parGuess, dist,
      hcp: hcp >= 1 && hcp <= 18 ? hcp : null,
      shape: 'straight', note: '',
      tee: { lat: h.path[0][0], lon: h.path[0][1] },
      green, path: h.path, features: mine,
    };
  });
  // Make numbering sequential if refs were missing or duplicated
  holes.forEach((h, i) => { if (holes.filter(x => x.n === h.n).length > 1) h.n = i + 1; });
  holes.sort((a, b) => a.n - b.n);

  return {
    name: r.name, city: (r.display || '').split(',').slice(1, 3).join(',').trim(),
    source: 'osm', osmRef: `${r.osm_type}/${r.osm_id}`, holes,
  };
}

const round6 = n => Math.round(n * 1e6) / 1e6;

function centroid(pts) {
  const n = pts.length;
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
}

function minDistToLine(poly, line) {
  let best = Infinity;
  for (const p of poly) {
    for (let i = 1; i < line.length; i++) {
      const d = segDist(p, line[i - 1], line[i]);
      if (d < best) best = d;
      if (best <= 40) return best;
    }
  }
  return best;
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export { haversine };
