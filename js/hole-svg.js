// Draws a hole as SVG: real geometry from OpenStreetMap when we have it,
// otherwise a simple schematic (straight / dogleg left / dogleg right).
import { projector } from './util.js';
import { t } from './i18n.js';

const f1 = n => Math.round(n * 10) / 10;

export function holeSvg(courseHole, par, shape) {
  if (courseHole && courseHole.path && courseHole.path.length >= 2) return geoSvg(courseHole);
  return schematicSvg(par, shape || (courseHole && courseHole.shape) || 'straight');
}

function geoSvg(ch) {
  const p = ch.path;
  const lat0 = p.reduce((a, q) => a + q[0], 0) / p.length;
  const lon0 = p.reduce((a, q) => a + q[1], 0) / p.length;
  const pr = projector(lat0, lon0);
  const P = p.map(q => pr(q[0], q[1]));
  const a = P[0], b = P[P.length - 1];
  // Rotate so that tee -> green points straight up.
  const phi = Math.PI / 2 - Math.atan2(b.y - a.y, b.x - a.x);
  const c = Math.cos(phi), s = Math.sin(phi);
  const rot = q => ({ x: q.x * c - q.y * s, y: -(q.x * s + q.y * c) });
  const tr = ll => rot(pr(ll[0], ll[1]));
  const R = P.map(rot);

  const pad = 38;
  const xs = R.map(q => q.x), ys = R.map(q => q.y);
  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  let w = x1 - x0; const h = y1 - y0;
  if (w < h * 0.55) { x0 -= (h * 0.55 - w) / 2; w = h * 0.55; }

  const order = ['fairway', 'tee', 'water', 'bunker', 'green'];
  const feats = (ch.features || []).slice().sort((m, n) => order.indexOf(m.type) - order.indexOf(n.type));
  const polys = feats.map(f => {
    const pts = f.pts.map(tr).map(q => f1(q.x) + ',' + f1(q.y)).join(' ');
    return `<polygon class="hs-${f.type}" points="${pts}"/>`;
  }).join('');
  const line = R.map(q => f1(q.x) + ',' + f1(q.y)).join(' ');
  const tee = R[0], gr = R[R.length - 1];

  return `<svg class="holesvg" viewBox="${f1(x0)} ${f1(y0)} ${f1(w)} ${f1(h)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${t('Hole layout drawing')}">
    <rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" class="hs-rough"/>
    ${polys}
    <polyline points="${line}" class="hs-line" vector-effect="non-scaling-stroke"/>
    <circle cx="${f1(tee.x)}" cy="${f1(tee.y)}" r="3.2" class="hs-teemark"/>
    <circle cx="${f1(gr.x)}" cy="${f1(gr.y)}" r="2.4" class="hs-pin"/>
  </svg>`;
}

function schematicSvg(par, shape) {
  const L = par >= 5 ? 150 : par === 4 ? 120 : 80;
  const Tx = 50, Ty = 188, Gy = Ty - L - 6;
  const dx = shape === 'left' ? -28 : shape === 'right' ? 28 : 0;
  const Gx = 50 + dx;
  const d = dx
    ? `M${Tx} ${Ty} Q${Tx} ${Gy + 14} ${Gx} ${Gy}`
    : `M${Tx} ${Ty} L${Gx} ${Gy}`;
  return `<svg class="holesvg schematic" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${t('Schematic hole layout')}">
    <rect width="100" height="200" class="hs-rough"/>
    <path d="${d}" class="hs-fairway-stroke" fill="none" stroke-width="${par === 3 ? 14 : 26}" stroke-linecap="round"/>
    <rect x="${Tx - 7}" y="${Ty - 4}" width="14" height="7" rx="2" class="hs-tee"/>
    <ellipse cx="${Gx - 19}" cy="${Gy + 9}" rx="6" ry="4" class="hs-bunker"/>
    <ellipse cx="${Gx + 18}" cy="${Gy + 15}" rx="5" ry="4" class="hs-bunker"/>
    <ellipse cx="${Gx}" cy="${Gy}" rx="15" ry="11" class="hs-green"/>
    <circle cx="${Gx}" cy="${Gy}" r="1.8" class="hs-pin"/>
  </svg>`;
}
