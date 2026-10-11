import * as DB from './db.js';
import { esc, uid, haversine, toDisp, fromDisp, todayISO, fmtDate, signed, pct, avg } from './util.js';
import { holeSvg } from './hole-svg.js';
import { searchCourses, fetchCourse } from './osm.js';
import { searchApi, getApiCourse, courseFromTee, usageToday, lastApiDebug, DAILY_LIMIT } from './api.js';

const APP_VERSION = 5;
import { played, holeStats, roundStats, aggregate } from './stats.js';
import { t, setLang, detectLang, plural, DEFAULT_CLUBS } from './i18n.js';

/* ---------- constants ---------- */
const LIES = ['tee', 'fairway', 'rough', 'bunker', 'green', 'other'];
const lieLabel = k => t({ tee: 'Tee', fairway: 'Fairway', rough: 'Rough', bunker: 'Bunker', green: 'Green', other: 'Other' }[k]);
const ICONS = {
  round: '<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>',
  courses: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
};
const TABS = ['round', 'courses', 'history', 'stats', 'settings'];
const tabLabel = k => t({ round: 'Round', courses: 'Courses', history: 'History', stats: 'Stats', settings: 'Settings' }[k]);

/* ---------- state ---------- */
function loadSettings() {
  const base = { unit: 'm', clubs: null, lang: detectLang() };
  try { return { ...base, ...JSON.parse(localStorage.getItem('fairway.settings') || '{}') }; } catch { return base; }
}
function saveSettings() { try { localStorage.setItem('fairway.settings', JSON.stringify(S.set)); } catch { /* ignore */ } }

const S = {
  tab: 'round', sub: null,
  courses: [], rounds: [], set: loadSettings(),
  hi: 0, draft: { lie: 'tee', club: '', dist: '', pos: null }, showMap: false, toGreen: '',
  start: { courseId: '', date: todayISO(), part: 'all' },
  edit: null, search: { q: '', results: null, busy: '', err: '', src: 'osm', rsrc: 'osm', tees: null, apiCourse: null },
  detailId: null, statsCourse: '', dbError: '', apiDebug: '',
};

const $main = document.getElementById('main');
const $nav = document.getElementById('nav');
const activeRound = () => S.rounds.find(r => !r.finished);
const courseOf = r => S.courses.find(c => c.id === r.courseId);
const unit = () => S.set.unit;
const clubs = () => S.set.clubs || DEFAULT_CLUBS[S.set.lang] || DEFAULT_CLUBS.en;
const fmtD = m => (m ? toDisp(m, unit()) + ' ' + unit() : '–');

/* ---------- rendering ---------- */
function render(top = false) {
  const y = window.scrollY;
  let html = '';
  if (S.dbError) html += `<div class="banner">${esc(S.dbError)}</div>`;
  switch (S.tab) {
    case 'round': html += S.sub === 'summary' && activeRound() ? viewSummary() : activeRound() ? viewHole() : viewStart(); break;
    case 'courses': html += S.sub === 'edit' ? viewCourseEdit() : S.sub === 'search' ? viewSearch() : viewCourses(); break;
    case 'history': html += S.sub === 'detail' ? viewDetail() : viewHistory(); break;
    case 'stats': html += viewStats(); break;
    case 'settings': html += viewSettings(); break;
  }
  $main.innerHTML = html;
  $nav.innerHTML = '<div class="inner">' + TABS.map(k =>
    `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-tab="${k}" aria-label="${tabLabel(k)}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${tabLabel(k)}</button>`).join('') + '</div>';
  window.scrollTo(0, top ? 0 : y);
}

function go(tab, sub = null) { S.tab = tab; S.sub = sub; render(true); }

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

/* ---------- persistence helpers ---------- */
async function saveRound(r) {
  try { await DB.put('rounds', r); } catch (e) { toast(t('Could not save') + ': ' + e.message); }
}
async function reload() {
  S.courses = (await DB.all('courses')).sort((a, b) => a.name.localeCompare(b.name));
  S.rounds = (await DB.all('rounds')).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  if (!S.courses.find(c => c.id === S.start.courseId)) S.start.courseId = S.courses[0] ? S.courses[0].id : '';
}

function getPos() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error(t('GPS is not available on this device')));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      e => rej(new Error(e.code === 1 ? t('Location permission denied') : t('Could not get a GPS position'))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 });
  });
}

/* ---------- ROUND tab ---------- */
function viewStart() {
  if (!S.courses.length) {
    return `<h1>${t('New round')}</h1><div class="card stack"><p>${t('Add a course first. You can search for it online or type it in.')}</p>
      <button class="btn-primary btn-block" data-a="tab" data-tab="courses">${t('Go to courses')}</button></div>`;
  }
  const c = S.courses.find(x => x.id === S.start.courseId);
  const opts = S.courses.map(x => `<option value="${x.id}" ${x.id === S.start.courseId ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const parts = c && c.holes.length > 9
    ? `<label class="f">${t('Holes')}</label><div class="chips">${[['all', t('All {n}', { n: c.holes.length })], ['front', t('Front 9')], ['back', t('Back 9')]]
      .map(([k, l]) => `<button class="chip ${S.start.part === k ? 'on' : ''}" data-a="setPart" data-v="${k}">${l}</button>`).join('')}</div>` : '';
  return `<h1>${t('New round')}</h1><div class="card">
    <label class="f" style="margin-top:0">${t('Course')}</label><select data-i="startCourse">${opts}</select>
    <label class="f">${t('Date')}</label><input type="date" value="${S.start.date}" data-i="startDate">
    ${parts}
    <button class="btn-primary btn-block" style="margin-top:18px" data-a="startRound">${t('Start round')}</button></div>`;
}

function resetDraft(h) {
  const last = h.shots[h.shots.length - 1];
  S.draft = { lie: !last ? 'tee' : last.lie === 'tee' ? 'fairway' : last.lie, club: '', dist: '', pos: null };
  if (S.draft.lie === 'green') S.draft.club = 'Putter';
  S.toGreen = '';
}

function viewHole() {
  const r = activeRound(), h = r.holes[S.hi];
  const c = courseOf(r), ch = c && c.holes.find(x => x.n === h.n);
  const u = unit(), st = roundStats(r), D = S.draft;
  const pills = r.holes.map((x, i) =>
    `<button class="pill ${i === S.hi ? 'cur' : played(x) ? 'done' : ''}" data-a="gotoHole" data-idx="${i}" aria-label="${t('Hole')} ${x.n}">${x.n}</button>`).join('');
  const shots = h.shots.length ? h.shots.map((s, i) => `
    <div class="shot"><span class="no">${i + 1}</span>
      <div class="grow"><span class="lie">${lieLabel(s.lie)}</span>${s.club ? ' · ' + esc(s.club) : ''}</div>
      ${s.pos ? '<span class="tag">GPS</span>' : ''}
      ${s.dist ? `<b>${toDisp(s.dist, u)} ${u}</b>` : ''}
      <button class="x" data-a="delShot" data-idx="${i}" aria-label="${t('Delete shot')} ${i + 1}">✕</button></div>`).join('')
    : `<p class="muted">${t('No shots yet. Add the first one below. Every stroke counts, including the putt that drops.')}</p>`;
  const hs = holeStats(h);
  const scoreLine = h.shots.length ? `<b>${hs.score}</b> ${plural(hs.score, 'stroke', 'strokes')}${h.pen ? ` (${h.pen} ${t('penalty')})` : ''} · ${hs.putts} ${plural(hs.putts, 'putt', 'putts')}` : '';
  const last = S.hi === r.holes.length - 1;

  return `
  <div class="row spread small"><span class="muted">${esc(r.courseName)}</span>
    <span><b>${st.holes ? signed(st.diff) : 'E'}</b> · ${st.score} ${plural(st.score, 'stroke', 'strokes')} · <button class="btn-sm btn-ghost" style="min-height:30px;padding:0 8px" data-a="summary">${t('Card')}</button></span></div>
  <div class="strip">${pills}</div>
  <div class="card">
    <div class="holehead"><span class="num">${h.n}</span><span class="meta">${t('Par')} ${h.par}</span><span class="meta muted">${fmtD(h.dist)}</span></div>
    <div class="kv">${h.hcp ? `<span>${t('Hcp')} ${h.hcp}</span>` : ''}${ch && ch.note ? `<span>${esc(ch.note)}</span>` : ''}<span>${scoreLine}</span></div>
    <div class="row wrap" style="margin-top:10px">
      <button class="btn-sm" data-a="toggleMap">${S.showMap ? t('Hide layout') : t('Hole layout')}</button>
      ${ch && ch.green ? `<button class="btn-sm" data-a="toGreen">${t('Distance to green')}</button>` : ''}
      ${S.toGreen ? `<span class="small"><b>${esc(S.toGreen)}</b></span>` : ''}
    </div>
    ${S.showMap ? `<div style="margin-top:12px">${holeSvg(ch, h.par, ch && ch.shape)}</div>` : ''}
  </div>

  <h2>${t('Shots')}</h2>
  <div class="card">${shots}</div>

  <div class="card row spread">
    <div><b>${t('Penalty strokes')}</b><div class="muted small">${t('Water, out of bounds, drop…')}</div></div>
    <div class="stepper"><button data-a="pen" data-d="-1" aria-label="${t('Remove penalty')}">−</button><span class="val">${h.pen || 0}</span><button data-a="pen" data-d="1" aria-label="${t('Add penalty')}">+</button></div>
  </div>

  <h2>${t('Shot')} ${h.shots.length + 1}</h2>
  <div class="card">
    <label class="f" style="margin-top:0">${t('Played from')}</label>
    <div class="chips">${LIES.map(k => `<button class="chip ${D.lie === k ? 'on' : ''}" data-a="setLie" data-v="${k}">${lieLabel(k)}</button>`).join('')}</div>
    <label class="f">${t('Club (optional)')}</label>
    <div class="chips">${clubs().map(cl => `<button class="chip ${D.club === cl ? 'on' : ''}" data-a="setClub" data-v="${esc(cl)}">${esc(cl)}</button>`).join('')}</div>
    <label class="f">${t('Distance of this shot (optional)')}, ${u}</label>
    <div class="row"><input inputmode="decimal" placeholder="${t('e.g.')} ${u === 'yd' ? 160 : 150}" value="${esc(D.dist)}" data-i="draftDist" aria-label="${t('Shot distance')}">
      <button data-a="markGps" style="flex:none">${D.pos ? t('GPS marked') + ' ✓' : t('Mark GPS')}</button></div>
    <p class="muted small">${t('Tip: tap “Mark GPS” where you stand to hit. The previous shot\'s distance is then filled in for you.')}</p>
    <button class="btn-primary btn-block" style="margin-top:6px" data-a="addShot">${t('Add shot')}</button>
  </div>

  <div class="nav2">
    <button data-a="prevHole" ${S.hi === 0 ? 'disabled' : ''}>${t('← Previous')}</button>
    <button class="btn-primary" data-a="nextHole">${last ? t('Finish round →') : t('Next hole →')}</button>
  </div>`;
}

function scoreCell(score, par) {
  const d = score - par;
  const cls = score === 1 || d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'dbl' : '';
  return `<span class="s ${cls}">${score}</span>`;
}

function scorecard(r) {
  const rows = r.holes.map(h => {
    if (!played(h)) return `<tr><td>${h.n}</td><td>${h.par}</td><td class="muted">–</td><td class="muted">–</td><td class="muted">–</td><td class="muted">–</td></tr>`;
    const s = holeStats(h);
    const fw = h.par < 4 ? '·' : s.fw === null ? '–' : s.fw ? '<span class="yes">✓</span>' : '✗';
    return `<tr><td>${h.n}</td><td>${h.par}</td><td>${scoreCell(s.score, h.par)}</td><td>${s.putts}</td><td>${fw}</td><td>${s.gir ? '<span class="yes">✓</span>' : '✗'}</td></tr>`;
  }).join('');
  const rs = roundStats(r);
  return `<table class="sc"><thead><tr><th>${t('Hole')}</th><th>${t('Par')}</th><th>${t('Score')}</th><th>${t('Putts')}</th><th>${t('FW')}</th><th>${t('GIR')}</th></tr></thead><tbody>${rows}
    <tr class="tot"><td>${t('Total')}</td><td>${rs.par}</td><td>${rs.score}</td><td>${rs.putts}</td><td>${rs.fwChances ? rs.fwHit + '/' + rs.fwChances : '–'}</td><td>${rs.gir}/${rs.holes}</td></tr></tbody></table>`;
}

function summaryHead(r) {
  const rs = roundStats(r);
  return `<div class="row spread"><div><div class="bigscore">${rs.score}</div><div class="muted">${rs.holes ? signed(rs.diff) + ' ' + t('vs par') : t('No holes played')} · ${rs.holes} ${t('holes')}</div></div>
    <div class="small muted" style="text-align:right">${esc(r.courseName)}<br>${fmtDate(r.date)}</div></div>`;
}

function viewSummary() {
  const r = activeRound();
  return `<h1>${t('Scorecard')}</h1><div class="card">${summaryHead(r)}</div>
    <div class="card">${scorecard(r)}</div>
    <label class="f">${t('Notes')}</label><textarea data-i="roundNotes" placeholder="${t('Conditions, how it felt…')}">${esc(r.notes || '')}</textarea>
    <div class="stack" style="margin-top:16px">
      <button class="btn-primary btn-block" data-a="finishRound">${t('Finish and save round')}</button>
      <button class="btn-block" data-a="backToHole">${t('Back to the round')}</button>
      <button class="btn-block btn-danger" data-a="discardRound">${t('Discard this round')}</button>
    </div>`;
}

/* ---------- COURSES tab ---------- */
const blankHoles = n => Array.from({ length: n }, (_, i) => ({ n: i + 1, par: 4, dist: null, hcp: null, shape: 'straight', note: '' }));

function viewCourses() {
  const list = S.courses.map(c => {
    const par = c.holes.reduce((a, h) => a + h.par, 0), d = c.holes.reduce((a, h) => a + (h.dist || 0), 0);
    return `<div class="card"><div class="row"><div class="grow"><div class="t" style="font-weight:700">${esc(c.name)}</div>
      <div class="muted small">${c.holes.length} ${t('holes')} · ${t('par')} ${par}${d ? ' · ' + toDisp(d, unit()).toLocaleString() + ' ' + unit() : ''}${c.source === 'osm' ? ' · ' + t('map data') : ''}</div></div></div>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn-sm btn-primary" data-a="playCourse" data-id="${c.id}">${t('Play')}</button>
        <button class="btn-sm" data-a="editCourse" data-id="${c.id}">${t('Edit')}</button>
        <button class="btn-sm btn-danger" data-a="delCourse" data-id="${c.id}">${t('Delete')}</button></div></div>`;
  }).join('');
  return `<h1>${t('Courses')}</h1>
    <div class="row"><button class="btn-primary grow" data-a="searchCourse">${t('Search online')}</button><button class="grow" data-a="newCourse">${t('Enter manually')}</button></div>
    <div style="margin-top:14px">${list || `<div class="card muted">${t('No courses yet. Search for yours, or enter par and distances by hand.')}</div>`}</div>`;
}

function viewCourseEdit() {
  const c = S.edit, u = unit();
  const counts = [...new Set([9, 18, c.holes.length])].sort((a, b) => a - b);
  const rows = c.holes.map((h, i) => `
    <div class="hedit">
      <span class="n">${h.n}</span>
      <select data-i="hPar" data-h="${i}" aria-label="${t('Par')} ${h.n}" ${h.parGuess ? 'style="border-color:var(--gold)"' : ''}>${[3, 4, 5, 6].map(p => `<option ${p === h.par ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <input inputmode="numeric" data-i="hDist" data-h="${i}" value="${h.dist ? toDisp(h.dist, u) : ''}" placeholder="${u}" aria-label="${t('Distance')} ${h.n}">
      <input inputmode="numeric" data-i="hHcp" data-h="${i}" value="${h.hcp ?? ''}" placeholder="–" aria-label="${t('Hcp')} ${h.n}">
      <div class="full">
        ${h.path ? `<span class="muted small" style="align-self:center">${t('Map layout')}</span>` : `<select data-i="hShape" data-h="${i}" aria-label="${t('Layout')} ${h.n}">${[['straight', t('Straight')], ['left', t('Dogleg left')], ['right', t('Dogleg right')]].map(([k, l]) => `<option value="${k}" ${h.shape === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
        <input data-i="hNote" data-h="${i}" value="${esc(h.note || '')}" placeholder="${t('Note (e.g. water right)')}" aria-label="${t('Note')} ${h.n}">
      </div>
    </div>`).join('');
  const thumbs = `<details style="margin-top:14px"><summary>${t('Hole layouts')}</summary><div class="thumbs" style="margin-top:8px">${c.holes.map(h =>
    `<figure>${holeSvg(h, h.par, h.shape)}<figcaption>${h.n} · ${t('par')} ${h.par}</figcaption></figure>`).join('')}</div></details>`;
  return `<h1>${c.isNew ? t('New course') : t('Edit course')}</h1>
    ${c.banner ? `<div class="banner">${esc(c.banner)}</div>` : ''}
    <div class="card">
      <label class="f" style="margin-top:0">${t('Name')}</label><input value="${esc(c.name)}" data-i="cName" placeholder="${t('Course name')}">
      <label class="f">${t('Town (optional)')}</label><input value="${esc(c.city || '')}" data-i="cCity">
      <label class="f">${t('Number of holes')}</label><select data-i="cCount">${counts.map(n => `<option ${n === c.holes.length ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <h2>${t('Holes')}</h2>
    <div class="card"><div class="hhead"><span>#</span><span>${t('Par')}</span><span>${t('Dist')} (${u})</span><span>${t('Hcp')}</span></div>${rows}${thumbs}</div>
    <div class="nav2"><button data-a="cancelCourse">${t('Cancel')}</button><button class="btn-primary" data-a="saveCourse">${t('Save course')}</button></div>`;
}

function genderLabel(g) { return g === 'male' ? t('Men') : g === 'female' ? t('Women') : g || ''; }

function viewSearch() {
  const s = S.search, hasKey = !!S.set.apiKey;
  const src = hasKey ? s.src : 'osm';
  if (s.tees) {
    const items = s.tees.map((tee, i) => `<button class="item" data-a="pickTee" data-idx="${i}"><div class="grow">
      <div class="t">${esc(tee.name || t('Tees'))}${tee.gender ? ' · ' + esc(genderLabel(tee.gender)) : ''}</div>
      <div class="muted small">${tee.meters ? toDisp(tee.meters, unit()) + ' ' + unit() + ' · ' : ''}${t('par')} ${tee.par ?? tee.holes.reduce((a, h) => a + (h.par || 0), 0)} · ${tee.holes.length} ${t('holes')}</div></div><span>›</span></button>`).join('');
    return `<h1>${esc(s.apiCourse.name)}</h1><h2>${t('Choose the tees')}</h2>${items}
      <div class="nav2"><button data-a="backToResults">${t('Back')}</button></div>`;
  }
  const chips = hasKey ? `<div class="chips" style="margin-bottom:10px">${[['api', 'GolfCourseAPI'], ['osm', 'OpenStreetMap']]
    .map(([k, l]) => `<button class="chip ${src === k ? 'on' : ''}" data-a="setSrc" data-v="${k}">${l}</button>`).join('')}</div>` : '';
  const results = s.results ? (s.results.length ? s.results.map((r, i) =>
    `<button class="item" data-a="pickCourse" data-idx="${i}"><div class="grow"><div class="t">${esc(r.name)}</div><div class="muted small">${esc(r.display)}</div></div><span>›</span></button>`).join('')
    : `<div class="card muted">${t('No golf course found. Try the town name, or enter it manually.')}</div>`) : '';
  const hint = src === 'api'
    ? t('Uses GolfCourseAPI: one search or course opening counts as 1 of your 35 free requests per day. Hole-by-hole pars and distances per tee, but no hole drawings.')
    : t('Uses OpenStreetMap (needs internet). Holes, pars and layouts are only available where contributors mapped them, so always check the result before saving.');
  return `<h1>${t('Find a course')}</h1>${chips}
    <div class="row"><input type="search" enterkeyhint="search" placeholder="${t('Course name or town')}" value="${esc(s.q)}" data-i="sQ" aria-label="${t('Search')}"><button class="btn-primary" style="flex:none" data-a="doSearch">${t('Search')}</button></div>
    <p class="muted small">${hint}</p>
    ${!hasKey ? `<p class="small"><button class="btn-sm" data-a="tab" data-tab="settings">${t('Add a GolfCourseAPI key')}</button></p>` : ''}
    ${s.busy ? `<p><b>${esc(s.busy)}</b></p>` : ''}${s.err ? `<p class="err">${esc(s.err)}</p>` : ''}
    <div>${results}</div>
    <div class="nav2"><button data-a="tab" data-tab="courses">${t('Back')}</button><button data-a="newCourse">${t('Enter manually')}</button></div>`;
}

/* ---------- HISTORY tab ---------- */
function viewHistory() {
  const act = activeRound();
  const fin = S.rounds.filter(r => r.finished);
  const items = fin.map(r => {
    const rs = roundStats(r);
    return `<button class="item" data-a="openRound" data-id="${r.id}"><div class="grow"><div class="t">${esc(r.courseName)}</div>
      <div class="muted small">${fmtDate(r.date)} · ${rs.holes} ${t('holes')} · ${rs.putts} ${t('putts')}</div></div>
      <div style="text-align:right"><div class="badge">${rs.score}</div><div class="muted small">${rs.holes ? signed(rs.diff) : ''}</div></div></button>`;
  }).join('');
  return `<h1>${t('History')}</h1>
    ${act ? `<button class="item" data-a="tab" data-tab="round" style="border-color:var(--accent)"><div class="grow"><div class="t">${t('Round in progress')}</div><div class="muted small">${esc(act.courseName)} · ${fmtDate(act.date)}</div></div><span>›</span></button><div style="height:10px"></div>` : ''}
    ${items || `<div class="card muted">${t('No finished rounds yet. They will appear here once you finish a round.')}</div>`}`;
}

function viewDetail() {
  const r = S.rounds.find(x => x.id === S.detailId);
  if (!r) return viewHistory();
  const u = unit();
  const holes = r.holes.filter(played).map(h => {
    const s = holeStats(h);
    return `<details><summary>${t('Hole')} ${h.n} · ${t('Par')} ${h.par} · ${s.score} ${plural(s.score, 'stroke', 'strokes')}</summary>
      ${h.shots.map((x, i) => `<div class="shot"><span class="no">${i + 1}</span><div class="grow">${lieLabel(x.lie)}${x.club ? ' · ' + esc(x.club) : ''}</div>${x.dist ? `<b>${toDisp(x.dist, u)} ${u}</b>` : ''}</div>`).join('')}
      ${h.pen ? `<p class="muted small">${h.pen} ${plural(h.pen, 'penalty stroke', 'penalty strokes')}</p>` : ''}</details>`;
  }).join('');
  return `<button class="btn-sm btn-ghost" data-a="backHistory">← ${t('History')}</button>
    <h1 style="margin-top:10px">${esc(r.courseName)}</h1>
    <div class="card">${summaryHead(r)}</div><div class="card">${scorecard(r)}</div>
    ${r.notes ? `<h2>${t('Notes')}</h2><div class="card">${esc(r.notes)}</div>` : ''}
    <h2>${t('Shots')}</h2><div class="card">${holes || `<span class="muted">${t('No shots recorded.')}</span>`}</div>
    <div class="nav2"><button data-a="reopenRound" data-id="${r.id}" ${activeRound() ? 'disabled' : ''}>${t('Reopen')}</button><button class="btn-danger" data-a="delRound" data-id="${r.id}">${t('Delete')}</button></div>`;
}

/* ---------- STATS tab ---------- */
function viewStats() {
  const fin = S.rounds.filter(r => r.finished && (!S.statsCourse || r.courseId === S.statsCourse));
  const picker = `<select data-i="statsCourse" aria-label="${t('Course')}"><option value="">${t('All courses')}</option>${S.courses.map(c => `<option value="${c.id}" ${c.id === S.statsCourse ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  if (!fin.length) return `<h1>${t('Stats')}</h1>${picker}<div class="card muted" style="margin-top:12px">${t('Finish a round to see your stats.')}</div>`;
  const A = aggregate(fin), u = unit();
  const per18 = A.holes ? ((A.score - A.par) / A.holes * 18) : 0;
  const best = A.scores.length ? A.scores.reduce((m, x) => (x.diff < m.diff ? x : m)) : null;
  const tile = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const totalShots = Object.values(A.lies).reduce((a, b) => a + b, 0) || 1;
  const lieBars = LIES.filter(k => A.lies[k]).map(k =>
    `<div style="margin:10px 0"><div class="row spread small"><span>${lieLabel(k)}</span><span class="muted">${A.lies[k]} · ${Math.round(A.lies[k] / totalShots * 100)}%</span></div><div class="bar"><i style="width:${A.lies[k] / totalShots * 100}%"></i></div></div>`).join('');
  const clubs = Object.entries(A.clubs).sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n);
  const clubRows = clubs.map(([n, c]) => `<tr><td>${esc(n)}</td><td>${toDisp(c.sum / c.n, u)} ${u}</td><td>${toDisp(c.max, u)} ${u}</td><td>${c.n}</td></tr>`).join('');
  return `<h1>${t('Stats')}</h1>${picker}
    <div class="stats" style="margin-top:12px">
      ${tile(A.rounds, t('Rounds'))}${tile(A.holes, t('Holes played'))}
      ${tile(signed(Math.round(per18 * 10) / 10), t('Avg vs par / 18'))}${tile(best ? best.score + ' (' + signed(best.diff) + ')' : '–', t('Best round'))}
      ${tile(avg([A.putts / (A.holes || 1)], 2), t('Putts / hole'))}${tile(pct(A.fwHit, A.fwChances), t('Fairways hit'))}
      ${tile(pct(A.gir, A.holes), t('Greens in reg.'))}${tile(avg([A.pen / A.rounds], 1), t('Penalties / round'))}
    </div>
    <h2>${t('Shots played from')}</h2><div class="card">${lieBars || `<span class="muted">${t('No shots.')}</span>`}</div>
    <h2>${t('Club distances')}</h2><div class="card">${clubRows ? `<table class="sc"><thead><tr><th>${t('Club')}</th><th>${t('Avg')}</th><th>${t('Longest')}</th><th>${t('Shots')}</th></tr></thead><tbody>${clubRows}</tbody></table>` : `<span class="muted">${t('Enter a club and a distance on shots to build this table.')}</span>`}</div>`;
}

/* ---------- SETTINGS tab ---------- */
function viewSettings() {
  return `<h1>${t('Settings')}</h1>
    <h2>${t('Language')}</h2><div class="card"><div class="chips">${[['en', 'English'], ['fr', 'Français']].map(([k, l]) => `<button class="chip ${S.set.lang === k ? 'on' : ''}" data-a="setLang" data-v="${k}">${l}</button>`).join('')}</div></div>
    <h2>${t('Course database')}</h2><div class="card"><p class="muted small" style="margin-top:0">${t('Optional. A free key from golfcourseapi.com lets you search a larger course database. The key stays on this device only and is not included in backups.')}</p>
      <input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-i="apiKey" value="${esc(S.set.apiKey || '')}" placeholder="${t('API key')}" aria-label="${t('API key')}">
      ${S.set.apiKey ? `<p class="muted small" style="margin-bottom:0">${t('Requests used today (approximate, this device)')}: ${usageToday()} / ${DAILY_LIMIT}</p>
        <button class="btn-sm" style="margin-top:10px" data-a="copyApiDebug">${t('Copy last API response')}</button>
        ${S.apiDebug ? `<textarea readonly style="margin-top:10px;font:12px ui-monospace,monospace;min-height:140px" aria-label="${t('Copy last API response')}">${esc(S.apiDebug)}</textarea>` : ''}` : ''}</div>
    <h2>${t('Units')}</h2><div class="card"><div class="chips">${[['m', t('Metres')], ['yd', t('Yards')]].map(([k, l]) => `<button class="chip ${unit() === k ? 'on' : ''}" data-a="setUnit" data-v="${k}">${l}</button>`).join('')}</div></div>
    <h2>${t('Clubs in my bag')}</h2><div class="card"><textarea data-i="clubs" aria-label="${t('Clubs')}">${esc(clubs().join(', '))}</textarea><p class="muted small">${t('Separate with commas. They appear as quick buttons when you add a shot.')}</p></div>
    <h2>${t('Backup')}</h2><div class="card stack">
      <p class="muted small" style="margin-top:0">${t('Everything is stored on this phone only. Export a backup now and then, especially before changing phone or clearing Safari data.')}</p>
      <button class="btn-block" data-a="exportJson">${t('Export backup (JSON)')}</button>
      <button class="btn-block" data-a="exportHolesCsv">${t('Export holes (CSV)')}</button>
      <button class="btn-block" data-a="exportShotsCsv">${t('Export shots (CSV)')}</button>
      <label class="btn btn-block" style="display:grid;place-items:center">${t('Import backup')}<input type="file" accept=".json,application/json" data-i="importFile" hidden></label>
    </div>
    <h2>${t('Install on iPhone')}</h2><div class="card small">${t('Open this page in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>. It then opens full screen and works offline on the course.')}</div>
    <h2>${t('Data')}</h2><div class="card"><p class="muted small" style="margin-top:0">${S.courses.length} ${t('courses')} · ${S.rounds.length} ${t('rounds saved')}</p><button class="btn-block btn-danger" data-a="wipe">${t('Delete all data')}</button></div>
    <p class="muted small" style="text-align:center;margin-top:18px">Fairway v${APP_VERSION}</p>`;
}

/* ---------- export / import ---------- */
async function saveFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n');

function holesCsv() {
  const rows = [['date', 'course', 'hole', 'par', 'distance_m', 'strokes', 'putts', 'penalties', 'fairway_hit', 'gir']];
  for (const r of S.rounds) for (const h of r.holes) {
    if (!played(h)) continue;
    const s = holeStats(h);
    rows.push([r.date, r.courseName, h.n, h.par, h.dist ?? '', s.score, s.putts, s.pen, s.fw === null ? '' : s.fw ? 1 : 0, s.gir ? 1 : 0]);
  }
  return csv(rows);
}
function shotsCsv() {
  const rows = [['date', 'course', 'hole', 'par', 'shot', 'played_from', 'club', 'distance_m']];
  for (const r of S.rounds) for (const h of r.holes) h.shots.forEach((s, i) => rows.push([r.date, r.courseName, h.n, h.par, i + 1, s.lie, s.club || '', s.dist ?? '']));
  return csv(rows);
}

/* ---------- actions (click) ---------- */
const A = {
  tab: d => go(d.tab),
  setPart: d => { S.start.part = d.v; render(); },
  async startRound() {
    const c = S.courses.find(x => x.id === S.start.courseId);
    if (!c) return toast(t('Pick a course'));
    let hs = c.holes;
    if (S.start.part === 'front') hs = hs.slice(0, 9);
    if (S.start.part === 'back') hs = hs.slice(9);
    const r = { id: uid(), courseId: c.id, courseName: c.name, date: S.start.date || todayISO(), finished: false, notes: '',
      holes: hs.map(h => ({ n: h.n, par: h.par, dist: h.dist ?? null, hcp: h.hcp ?? null, shots: [], pen: 0, done: false })) };
    S.rounds.unshift(r); await saveRound(r);
    S.hi = 0; S.sub = null; S.showMap = false; resetDraft(r.holes[0]); render(true);
  },
  gotoHole: d => { const r = activeRound(); S.hi = +d.idx; resetDraft(r.holes[S.hi]); render(true); },
  toggleMap: () => { S.showMap = !S.showMap; render(); },
  async toGreen() {
    const r = activeRound(), h = r.holes[S.hi], c = courseOf(r), ch = c && c.holes.find(x => x.n === h.n);
    if (!ch || !ch.green) return;
    try {
      const p = await getPos();
      S.toGreen = t('{d} {u} to the green (±{acc} m)', { d: toDisp(haversine(p, ch.green), unit()), u: unit(), acc: Math.round(p.acc) });
      render();
    } catch (e) { toast(e.message); }
  },
  setLie: d => {
    S.draft.lie = d.v;
    if (d.v === 'green' && !S.draft.club) S.draft.club = 'Putter';
    if (d.v !== 'green' && S.draft.club === 'Putter') S.draft.club = '';
    render();
  },
  setClub: d => { S.draft.club = S.draft.club === d.v ? '' : d.v; render(); },
  async markGps() {
    try { const p = await getPos(); S.draft.pos = { lat: p.lat, lon: p.lon }; render(); toast(t('Position marked (±{acc} m)', { acc: Math.round(p.acc) })); }
    catch (e) { toast(e.message); }
  },
  async addShot() {
    const r = activeRound(), h = r.holes[S.hi], D = S.draft;
    const prev = h.shots[h.shots.length - 1];
    if (prev && prev.pos && D.pos && !prev.dist) {
      const d = Math.round(haversine(prev.pos, D.pos));
      if (d >= 2) prev.dist = d;
    }
    h.shots.push({ lie: D.lie, club: D.club, dist: fromDisp(D.dist, unit()), pos: D.pos });
    h.done = true;
    resetDraft(h); render(); await saveRound(r);
  },
  async delShot(d) {
    const r = activeRound(), h = r.holes[S.hi];
    h.shots.splice(+d.idx, 1); h.done = h.shots.length > 0;
    resetDraft(h); render(); await saveRound(r);
  },
  async pen(d) {
    const r = activeRound(), h = r.holes[S.hi];
    h.pen = Math.max(0, (h.pen || 0) + +d.d); render(); await saveRound(r);
  },
  prevHole: () => { const r = activeRound(); if (S.hi > 0) { S.hi--; resetDraft(r.holes[S.hi]); render(true); } },
  async nextHole() {
    const r = activeRound(), h = r.holes[S.hi];
    h.done = h.shots.length > 0;
    await saveRound(r);
    if (S.hi < r.holes.length - 1) { S.hi++; resetDraft(r.holes[S.hi]); render(true); }
    else { S.sub = 'summary'; render(true); }
  },
  summary: () => { S.sub = 'summary'; render(true); },
  backToHole: () => { S.sub = null; render(true); },
  async finishRound() {
    const r = activeRound();
    if (!r.holes.some(played) && !confirm(t('No shots were recorded. Save an empty round?'))) return;
    r.finished = true; await saveRound(r);
    S.detailId = r.id; S.tab = 'history'; S.sub = 'detail'; render(true); toast(t('Round saved'));
  },
  async discardRound() {
    if (!confirm(t('Discard this round and all its shots?'))) return;
    const r = activeRound(); await DB.del('rounds', r.id); await reload(); S.sub = null; render(true);
  },

  /* courses */
  searchCourse: () => { const src = S.set.apiKey ? 'api' : 'osm'; S.search = { q: '', results: null, busy: '', err: '', src, rsrc: src, tees: null, apiCourse: null }; S.sub = 'search'; render(true); },
  setSrc: d => { S.search.src = d.v; S.search.results = null; S.search.err = ''; render(); },
  backToResults: () => { S.search.tees = null; render(true); },
  newCourse: () => { S.edit = { id: uid(), name: '', city: '', source: 'manual', isNew: true, holes: blankHoles(18) }; S.tab = 'courses'; S.sub = 'edit'; render(true); },
  editCourse: d => { S.edit = JSON.parse(JSON.stringify(S.courses.find(c => c.id === d.id))); S.sub = 'edit'; render(true); },
  cancelCourse: () => { S.edit = null; S.sub = null; render(true); },
  async saveCourse() {
    const c = S.edit;
    if (!c.name.trim()) return toast(t('Give the course a name'));
    c.name = c.name.trim();
    const out = { ...c }; delete out.isNew; delete out.banner;
    out.holes = c.holes.map(h => { const x = { ...h }; delete x.parGuess; return x; });
    await DB.put('courses', out); await reload();
    S.edit = null; S.sub = null; render(true); toast(t('Course saved'));
  },
  async delCourse(d) {
    const c = S.courses.find(x => x.id === d.id);
    if (!confirm(t('Delete “{name}”? Rounds already played on it are kept.', { name: c.name }))) return;
    await DB.del('courses', d.id); await reload(); render();
  },
  playCourse: d => { S.start.courseId = d.id; S.start.part = 'all'; go('round'); },
  async doSearch() {
    const s = S.search;
    if (!s.q.trim()) return;
    const src = S.set.apiKey ? s.src : 'osm';
    s.busy = t('Searching…'); s.err = ''; s.results = null; s.tees = null; render();
    try {
      s.results = src === 'api' ? await searchApi(s.q.trim(), S.set.apiKey) : await searchCourses(s.q.trim());
      s.rsrc = src;
    } catch (e) {
      s.err = src === 'api' ? e.message : t('Search failed') + ': ' + e.message + '. ' + t('Check your connection.');
    }
    s.busy = ''; render();
  },
  async pickCourse(d) {
    const s = S.search, r = s.results[+d.idx];
    if (s.rsrc === 'api') {
      s.busy = t('Loading course…'); s.err = ''; render();
      try {
        let c = r;
        if (!c.tees.some(x => x.holes.length)) c = await getApiCourse(r.id, S.set.apiKey);
        const tees = c.tees.filter(x => x.holes.length);
        if (!tees.length) throw new Error(t('This course has no hole-by-hole data in GolfCourseAPI. You can enter it manually instead.'));
        s.apiCourse = c; s.tees = tees; s.busy = ''; render(true);
      } catch (e) { s.busy = ''; s.err = e.message; render(); }
      return;
    }
    s.busy = t('Loading holes, greens and bunkers…'); s.err = ''; render();
    try {
      const c = await fetchCourse(r);
      c.id = uid(); c.isNew = true;
      c.banner = t('Imported {n} holes from OpenStreetMap. Check par and distances (highlighted pars were guessed from the length), then save.', { n: c.holes.length });
      S.edit = c; s.busy = ''; S.sub = 'edit'; render(true);
    } catch (e) { s.busy = ''; s.err = e.message; render(); }
  },
  pickTee(d) {
    const s = S.search, tee = s.tees[+d.idx];
    const c = courseFromTee(s.apiCourse, tee);
    c.id = uid(); c.isNew = true;
    c.banner = t('Imported {n} holes from GolfCourseAPI ({tee} tees). Check par and distances, then save. Hole drawings are not included: pick a shape per hole if you like.', { n: c.holes.length, tee: tee.name || '–' });
    S.edit = c; s.tees = null; S.sub = 'edit'; render(true);
  },

  /* history */
  openRound: d => { S.detailId = d.id; S.sub = 'detail'; render(true); },
  backHistory: () => { S.sub = null; render(true); },
  async reopenRound(d) {
    const r = S.rounds.find(x => x.id === d.id);
    r.finished = false; await saveRound(r);
    S.hi = Math.max(0, r.holes.map(played).lastIndexOf(true)); resetDraft(r.holes[S.hi]);
    S.tab = 'round'; S.sub = null; render(true);
  },
  async delRound(d) {
    if (!confirm(t('Delete this round?'))) return;
    await DB.del('rounds', d.id); await reload(); S.sub = null; render(true);
  },

  /* settings */
  async copyApiDebug() {
    S.apiDebug = lastApiDebug() || t('No API request made yet.');
    try { await navigator.clipboard.writeText(S.apiDebug); toast(t('Copied. Paste it in the chat.')); }
    catch { toast(t('Select the text below and copy it.')); }
    render();
  },
  setUnit: d => { S.set.unit = d.v; saveSettings(); render(); },
  setLang: d => { S.set.lang = d.v; setLang(d.v); saveSettings(); render(); },
  exportJson: () => saveFile(`fairway-backup-${todayISO()}.json`,
    JSON.stringify({ app: 'fairway', version: 1, exported: new Date().toISOString(), settings: { ...S.set, apiKey: undefined }, courses: S.courses, rounds: S.rounds }, null, 1), 'application/json'),
  exportHolesCsv: () => saveFile(`fairway-holes-${todayISO()}.csv`, holesCsv(), 'text/csv'),
  exportShotsCsv: () => saveFile(`fairway-shots-${todayISO()}.csv`, shotsCsv(), 'text/csv'),
  async wipe() {
    if (!confirm(t('Delete ALL courses and rounds from this phone? This cannot be undone.'))) return;
    await DB.clear('courses'); await DB.clear('rounds'); await reload(); S.sub = null; render(true); toast(t('All data deleted'));
  },
};

/* ---------- inputs ---------- */
const hole = el => S.edit.holes[+el.dataset.h];
const I = {
  startCourse: v => { S.start.courseId = v; S.start.part = 'all'; render(); },
  startDate: v => { S.start.date = v; },
  draftDist: v => { S.draft.dist = v; },
  cName: v => { S.edit.name = v; },
  cCity: v => { S.edit.city = v; },
  cCount: v => {
    const n = +v, hs = S.edit.holes;
    if (n > hs.length) hs.push(...blankHoles(n).slice(hs.length)); else hs.length = n;
    render();
  },
  hPar: (v, el) => { const h = hole(el); h.par = +v; h.parGuess = false; el.style.borderColor = ''; },
  hDist: (v, el) => { hole(el).dist = fromDisp(v, unit()); },
  hHcp: (v, el) => { const n = parseInt(v, 10); hole(el).hcp = n >= 1 && n <= 18 ? n : null; },
  hShape: (v, el) => { hole(el).shape = v; },
  hNote: (v, el) => { hole(el).note = v; },
  sQ: v => { S.search.q = v; },
  statsCourse: v => { S.statsCourse = v; render(); },
  apiKey: v => { S.set.apiKey = v.trim(); saveSettings(); },
  clubs: v => {
    const list = v.split(',').map(x => x.trim()).filter(Boolean);
    if (list.length) { S.set.clubs = list; saveSettings(); }
  },
  async roundNotes(v, el, e) {
    const r = S.sub === 'detail' ? S.rounds.find(x => x.id === S.detailId) : activeRound();
    if (!r) return;
    r.notes = v;
    if (e.type === 'change') await saveRound(r);
  },
  async importFile(v, el) {
    const f = el.files && el.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'fairway') throw new Error(t('Not a Fairway backup file'));
      for (const c of data.courses || []) await DB.put('courses', c);
      for (const r of data.rounds || []) await DB.put('rounds', r);
      if (data.settings) { const { apiKey, ...rest } = data.settings; S.set = { ...S.set, ...rest }; saveSettings(); }
      await reload(); render(); toast(t('Imported {c} courses, {r} rounds', { c: (data.courses || []).length, r: (data.rounds || []).length }));
    } catch (err) { toast(t('Import failed') + ': ' + err.message); }
    el.value = '';
  },
};

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || !A[el.dataset.a]) return;
  A[el.dataset.a](el.dataset, e);
});
function onInput(e) {
  const el = e.target;
  if (!el.matches || !el.matches('input,select,textarea') || !el.dataset.i || !I[el.dataset.i]) return;
  if (el.dataset.i === 'importFile' && e.type !== 'change') return;
  I[el.dataset.i](el.value, el, e);
}
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.i === 'sQ') A.doSearch();
});

/* ---------- boot ---------- */
setLang(S.set.lang);
(async function init() {
  try {
    await reload();
    const r = activeRound();
    if (r) {
      const firstOpen = r.holes.findIndex(h => !played(h));
      S.hi = firstOpen === -1 ? r.holes.length - 1 : firstOpen;
      resetDraft(r.holes[S.hi]);
    }
    DB.persist();
  } catch (e) {
    S.dbError = t('Storage is unavailable (private browsing?). Rounds cannot be saved.') + ' ' + e.message;
  }
  render(true);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
