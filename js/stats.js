// Scoring and statistics. A shot's "lie" is where the ball was when it was struck.

export function played(h) {
  return (h.shots && h.shots.length > 0) || h.done;
}

export function holeStats(h) {
  const shots = h.shots || [];
  const pen = h.pen || 0;
  const score = shots.length + pen;
  const putts = shots.filter(s => s.lie === 'green').length;
  // Fairway hit: par 4/5 where the second shot is played from the fairway (or the green was reached off the tee).
  let fw = null;
  if (h.par >= 4 && shots.length > 1) fw = shots[1].lie === 'fairway' || shots[1].lie === 'green';
  // Green in regulation: first stroke on the green came in par-2 strokes or fewer.
  const gi = shots.findIndex(s => s.lie === 'green');
  const gir = gi >= 0 && gi + pen <= h.par - 2;
  return { score, putts, fw, gir, pen };
}

export function roundStats(r) {
  const out = { holes: 0, score: 0, par: 0, putts: 0, fwHit: 0, fwChances: 0, gir: 0, pen: 0 };
  for (const h of r.holes) {
    if (!played(h)) continue;
    const s = holeStats(h);
    out.holes++;
    out.score += s.score;
    out.par += h.par;
    out.putts += s.putts;
    out.pen += s.pen;
    if (s.fw !== null) { out.fwChances++; if (s.fw) out.fwHit++; }
    if (s.gir) out.gir++;
  }
  out.diff = out.score - out.par;
  return out;
}

export function aggregate(rounds) {
  const A = { rounds: rounds.length, holes: 0, score: 0, par: 0, putts: 0, fwHit: 0, fwChances: 0, gir: 0, pen: 0, lies: {}, clubs: {}, scores: [] };
  for (const r of rounds) {
    const s = roundStats(r);
    A.holes += s.holes; A.score += s.score; A.par += s.par; A.putts += s.putts;
    A.fwHit += s.fwHit; A.fwChances += s.fwChances; A.gir += s.gir; A.pen += s.pen;
    if (s.holes >= 9) A.scores.push({ date: r.date, score: s.score, diff: s.diff, holes: s.holes });
    for (const h of r.holes) {
      for (const sh of h.shots || []) {
        A.lies[sh.lie] = (A.lies[sh.lie] || 0) + 1;
        if (sh.club && sh.dist > 0 && sh.lie !== 'green') {
          const c = A.clubs[sh.club] || (A.clubs[sh.club] = { n: 0, sum: 0, max: 0 });
          c.n++; c.sum += sh.dist; c.max = Math.max(c.max, sh.dist);
        }
      }
    }
  }
  return A;
}
