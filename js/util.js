export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Distances are always stored in metres; the unit setting only affects display and input.
const M2YD = 1.09361;
export const toDisp = (m, unit) => (m == null ? null : Math.round(unit === 'yd' ? m * M2YD : m));
export function fromDisp(v, unit) {
  const n = parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n)) return null;
  return Math.round(unit === 'yd' ? n / M2YD : n);
}

export function haversine(a, b) {
  const R = 6371000, t = x => (x * Math.PI) / 180;
  const dLa = t(b.lat - a.lat), dLo = t(b.lon - a.lon);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// pts are [lat, lon] pairs
export function polyLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += haversine({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
  }
  return s;
}

// Local flat projection in metres around (lat0, lon0)
export function projector(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  return (lat, lon) => ({ x: (lon - lon0) * kx, y: (lat - lat0) * ky });
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function fmtDate(iso) {
  try { return new Date(iso + 'T12:00:00').toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export const signed = n => (n > 0 ? '+' + n : n === 0 ? 'E' : String(n));
export const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
export const avg = (arr, d = 1) => (arr.length ? (arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(d) : '–');
