/* Drawing shared by the team view and the editor: line geometry, the court, players and ball, and the board for
   a frame, the full diagram, the end of the play and the animation. Moved here from the original Playbook Board. */
(() => {
"use strict";
const {W, FULL_L, RIM, PR, MG, IDS, MOVES, BALL_ACTS, clone, dist, clamp, courtLen, clampPt, switchPairs} = window.Playbook;

/* ---------- geometry for drawing ---------- */
function smooth(pts){
  if (pts.length < 3) return pts.map(q => q.slice());
  let p = pts;
  for (let it = 0; it < 3; it++){
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++){
      const a = p[i], b = p[i + 1];
      if (i > 0) q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]);
      if (i < p.length - 2) q.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    q.push(p[p.length - 1]); p = q;
  }
  return p;
}
function cumLen(p){ const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + dist(p[i - 1], p[i])); return c; }
function at(p, c, s){
  const T = c[c.length - 1];
  if (s <= 0 || p.length < 2) return p[0].slice();
  if (s >= T) return p[p.length - 1].slice();
  let i = 1; while (c[i] < s) i++;
  const t = (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1);
  return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t];
}
function sub(p, c, a, b){ const out = [at(p, c, a)]; for (let i = 1; i < p.length - 1; i++) if (c[i] > a && c[i] < b) out.push(p[i]); out.push(at(p, c, b)); return out; }
const f2 = v => v.toFixed(2);
function dAttr(p){ return "M" + p.map(q => f2(q[0]) + " " + f2(q[1])).join("L"); }
function arrow(tip, from, cls, len = 1.3, half = .64){
  const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const bx = tip[0] - ux * len, by = tip[1] - uy * len;
  return `<polygon class="${cls}" points="${f2(tip[0])},${f2(tip[1])} ${f2(bx - uy * half)},${f2(by + ux * half)} ${f2(bx + uy * half)},${f2(by - ux * half)}"/>`;
}
function rdp(pts, eps){
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let idx = -1, md = 0;
  for (let i = 1; i < pts.length - 1; i++){
    const p = pts[i], L = dist(a, b);
    const d = L < 1e-6 ? dist(p, a) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
    if (d > md){ md = d; idx = i; }
  }
  if (md > eps){ const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
  return [a, b];
}
/* A move's path. bow > 0 bends it to the left of travel, so two players trading spots don't draw on top of each other. */
function movePoly(a, f, bow = 0){
  const poly = smooth([f.start[a.player], ...a.path.slice(1)]);
  if (!bow || poly.length < 2) return poly;
  const c = cumLen(poly), T = c[c.length - 1] || 1, dense = [];
  for (let s = 0; s < T; s += .5) dense.push(at(poly, c, s));
  dense.push(poly[poly.length - 1].slice());
  const dc = cumLen(dense);
  return dense.map((q, i) => {
    if (i === 0 || i === dense.length - 1) return q;
    const p0 = dense[i - 1], p1 = dense[i + 1], tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty) || 1;
    const off = bow * Math.sin(Math.PI * dc[i] / T);
    return [q[0] + ty / tl * off, q[1] - tx / tl * off];
  });
}
/* how far to pull a line's end back so its arrow isn't hidden under a teammate drawn at that spot */
function endTrim(E, mover, avoid){
  if (!avoid) return 0;
  let t = 0;
  for (const id of IDS){ if (id === mover || !avoid[id]) continue; const d = dist(E, avoid[id]); if (d < PR + .3) t = Math.max(t, PR + .3 - d); }
  return t;
}
/* cuts that trade spots and would overlap get bowed apart */
function bowsFor(st, f){
  const m = new Map();
  for (const [A, B] of switchPairs(st, f)){
    const pa = movePoly(A, f), pb = movePoly(B, f), ca = cumLen(pa), cb = cumLen(pb);
    if (dist(at(pa, ca, ca[ca.length - 1] / 2), at(pb, cb, cb[cb.length - 1] / 2)) < 2.5){ m.set(A, 1.4); m.set(B, 1.4); }
  }
  return m;
}

/* zigzag points for a dribble line, from s0 to zEnd along poly */
function zigzag(poly, c, s0, zEnd){
  const zz = [];
  for (let s = s0; s <= zEnd; s += .22){
    const q = at(poly, c, s), q1 = at(poly, c, s - .12), q2 = at(poly, c, s + .12);
    const tx = q2[0] - q1[0], ty = q2[1] - q1[1], tl = Math.hypot(tx, ty) || 1;
    const off = .5 * Math.sin(2 * Math.PI * (s - s0) / 1.55);
    zz.push([q[0] - ty / tl * off, q[1] + tx / tl * off]);
  }
  zz.push(at(poly, c, zEnd + .25));
  return zz;
}
/* handoff where both players come together: the handler dribbles in, the teammate runs to meet the ball,
   and two bars between them mark the exchange */
function handoffGeom(a, f){
  const s0 = PR + .15;
  const hp = movePoly(a, f), hc = cumLen(hp), hT = hc[hc.length - 1];
  const rp = smooth([f.start[a.to], ...a.meet.slice(1)]), rc = cumLen(rp), rT = rc[rc.length - 1];
  const H = hp[hp.length - 1], R = rp[rp.length - 1];
  let html = "", hit = "";
  if (hT > s0 + .6){
    const zz = zigzag(hp, hc, s0, Math.max(s0, hT - .5)); zz.push(H.slice());
    html += `<path class="a-move" d="${dAttr(zz)}"/>`;
    hit += dAttr(sub(hp, hc, s0, hT));
  }
  if (rT > s0 + 1.4){
    html += `<path class="a-move" d="${dAttr(sub(rp, rc, s0, rT - 1.1))}"/>` + arrow(R, at(rp, rc, rT - 1.3), "a-head");
    hit += dAttr(sub(rp, rc, s0, rT));
  }
  const L = dist(H, R); let dir;
  if (L > .5) dir = [(R[0] - H[0]) / L, (R[1] - H[1]) / L];
  else { const b = at(hp, hc, Math.max(0, hT - .6)), l = dist(H, b) || 1; dir = [(H[0] - b[0]) / l, (H[1] - b[1]) / l]; }
  const M = [(H[0] + R[0]) / 2, (H[1] + R[1]) / 2], nx = -dir[1] * 1.15, ny = dir[0] * 1.15;
  const bar = q => `M${f2(q[0] - nx)} ${f2(q[1] - ny)}L${f2(q[0] + nx)} ${f2(q[1] + ny)}`;
  const b1 = [M[0] - dir[0] * .32, M[1] - dir[1] * .32], b2 = [M[0] + dir[0] * .32, M[1] + dir[1] * .32];
  html += `<path class="a-move" d="M${f2(H[0])} ${f2(H[1])}L${f2(b1[0])} ${f2(b1[1])}${bar(b1)}${bar(b2)}"/>`;
  return {hit, html, mid: M, poly: hp};
}
/* Where a handoff drag ends up. The spot you let go is where they meet; the closest teammate runs there.
   Let go right on a teammate and they stay put while the handler dribbles up to them. */
const HO_GAP = 1.8;
function planHandoff(d, f, court){
  const M = d.pts[d.pts.length - 1];
  let to = null, bd = Infinity;
  for (const id of IDS){ if (id === d.player) continue; const dd = dist(M, f.start[id]); if (dd < bd){ bd = dd; to = id; } }
  if (!to) return null;
  const R0 = f.start[to], full = d.pts.map(q => q.slice());
  if (dist(R0, M) < HO_GAP * 2){
    full.push(R0.slice());
    const c = cumLen(full), T = c[c.length - 1];
    if (T - HO_GAP * 2 < 1.5) return {to, err: true};
    return {to, path: sub(full, c, 0, T - HO_GAP * 2), meet: null};
  }
  const c = cumLen(full), T = c[c.length - 1];
  if (T - HO_GAP < 1.5) return {to, err: true};
  const path = sub(full, c, 0, T - HO_GAP);
  const back = at(full, c, Math.max(0, T - 2.5));
  let ux = M[0] - back[0], uy = M[1] - back[1], L = Math.hypot(ux, uy);
  if (L < .01){ ux = M[0] - full[0][0]; uy = M[1] - full[0][1]; L = Math.hypot(ux, uy) || 1; }
  const Rn = clampPt([M[0] + ux / L * HO_GAP, M[1] + uy / L * HO_GAP], court);
  return {to, path, meet: dist(R0, Rn) >= 1 ? [R0.slice(), Rn] : null};
}

/* returns {hit, html, mid, poly} or null. o.avoid = player spots drawn on the board, o.bow = bend */
function actionGeom(a, f, o = {}){
  if (a.type === "handoff" && a.meet && a.meet.length > 1 && a.path && a.path.length > 1) return handoffGeom(a, f);
  if (MOVES.has(a.type)){
    if (!a.path || a.path.length < 2) return null;
    const poly = movePoly(a, f, o.bow || 0), c = cumLen(poly), T0 = c[c.length - 1];
    const s0 = PR + .15, ho = a.type === "handoff";
    if (T0 < s0 + 1.2) return null;
    const trim = ho ? 0 : endTrim(poly[poly.length - 1], a.player, o.avoid);
    const T = T0 - trim >= s0 + 1.2 ? T0 - trim : T0;
    const mid = at(poly, c, (s0 + T) / 2), hit = dAttr(sub(poly, c, s0, T));
    let html = "";
    if (a.type === "cut"){
      html = `<path class="a-move" d="${dAttr(sub(poly, c, s0, T - 1.1))}"/>` + arrow(at(poly, c, T), at(poly, c, T - 1.3), "a-head");
    } else if (a.type === "dribble" || ho){
      const zz = [], zEnd = Math.max(s0, T - (ho ? .6 : 2.3));
      for (let s = s0; s <= zEnd; s += .22){
        const q = at(poly, c, s), q1 = at(poly, c, s - .12), q2 = at(poly, c, s + .12);
        const tx = q2[0] - q1[0], ty = q2[1] - q1[1], tl = Math.hypot(tx, ty) || 1;
        const off = .5 * Math.sin(2 * Math.PI * (s - s0) / 1.55);
        zz.push([q[0] - ty / tl * off, q[1] + tx / tl * off]);
      }
      zz.push(at(poly, c, zEnd + .25));
      if (ho){
        /* handoff mark: two short bars between the handler and the teammate taking it */
        zz.push(at(poly, c, T));
        const e = at(poly, c, T), R = f.end[a.to];
        let dir, m;
        if (R && dist(e, R) > .8){
          const L = dist(e, R); dir = [(R[0] - e[0]) / L, (R[1] - e[1]) / L];
          const k = Math.max(.6, Math.min(L / 2, L - PR - .7)); m = [e[0] + dir[0] * k, e[1] + dir[1] * k];
        } else { const e0 = at(poly, c, T - .5), L = dist(e, e0) || 1; dir = [(e[0] - e0[0]) / L, (e[1] - e0[1]) / L]; m = e; }
        const nx = -dir[1] * 1.15, ny = dir[0] * 1.15;
        const bar = q => `M${f2(q[0] - nx)} ${f2(q[1] - ny)}L${f2(q[0] + nx)} ${f2(q[1] + ny)}`;
        const b1 = [m[0] - dir[0] * .32, m[1] - dir[1] * .32], b2 = [m[0] + dir[0] * .32, m[1] + dir[1] * .32];
        html = `<path class="a-move" d="${dAttr(zz)}"/><path class="a-move" d="M${f2(e[0])} ${f2(e[1])}L${f2(b1[0])} ${f2(b1[1])}${bar(b1)}${bar(b2)}"/>`;
      } else {
        zz.push(at(poly, c, T - 1.1));
        html = `<path class="a-move" d="${dAttr(zz)}"/>` + arrow(at(poly, c, T), at(poly, c, T - 1.3), "a-head");
      }
    } else {
      const e = at(poly, c, T), e0 = at(poly, c, T - .5);
      const tx = e[0] - e0[0], ty = e[1] - e0[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl * 1.35, ny = tx / tl * 1.35;
      html = `<path class="a-move" d="${dAttr(sub(poly, c, s0, T))}"/><path class="a-move" d="M${f2(e[0] - nx)} ${f2(e[1] - ny)}L${f2(e[0] + nx)} ${f2(e[1] + ny)}"/>`;
    }
    return {hit, html, mid, poly};
  }
  if (a.type === "pass"){
    const A = f.end[a.player], B = f.end[a.to];
    if (!A || !B) return null;
    const L = dist(A, B); if (L < PR * 2 + .4) return null;
    const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
    const s = [A[0] + ux * (PR + .2), A[1] + uy * (PR + .2)], tip = [B[0] - ux * (PR + .25), B[1] - uy * (PR + .25)], bse = [tip[0] - ux * 1.1, tip[1] - uy * 1.1];
    return {hit: dAttr([s, tip]), html: `<path class="a-pass" d="${dAttr([s, bse])}"/>` + arrow(tip, s, "a-phead"), mid: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], poly: [A, B]};
  }
  if (a.type === "shot"){
    const A = f.end[a.player]; if (!A) return null;
    const L = dist(A, RIM); if (L < PR + 1.5) return {hit: "", html: "", mid: A, poly: [A, RIM]};
    const ux = (RIM[0] - A[0]) / L, uy = (RIM[1] - A[1]) / L;
    const s = [A[0] + ux * (PR + .2), A[1] + uy * (PR + .2)], tip = [RIM[0] - ux * .95, RIM[1] - uy * .95], bse = [tip[0] - ux * 1.1, tip[1] - uy * 1.1];
    return {hit: dAttr([s, tip]), html: `<path class="a-shot" d="${dAttr([s, bse])}"/>` + arrow(tip, s, "a-phead"), mid: [(A[0] + RIM[0]) / 2, (A[1] + RIM[1]) / 2], poly: [A, RIM]};
  }
  return null;
}

/* ---------- court drawing ---------- */
const courtCache = {};
function endMarkup(){
  return `<rect class="c-paint" x="19" y="0" width="12" height="19"/>
  <path class="c-line" d="M19 19A6 6 0 0 0 31 19"/><path class="c-dash" d="M19 19A6 6 0 0 1 31 19"/>
  <path class="c-line" d="M5.25 0V5.25A19.75 19.75 0 0 0 44.75 5.25V0"/>
  <rect class="c-fill" x="18.2" y="7" width=".8" height=".9"/><rect class="c-fill" x="31" y="7" width=".8" height=".9"/>
  <path class="c-line" d="M18.3 11h.7M31 11h.7M18.3 14h.7M31 14h.7M18.3 17h.7M31 17h.7"/>
  <path class="c-line" d="M22 4H28M25 4V4.5" style="stroke-width:.32"/><circle class="c-line" cx="25" cy="5.25" r=".75"/>`;
}
function courtMarkup(court){
  if (courtCache[court]) return courtCache[court];
  const L = courtLen(court);
  let h = `<rect class="c-oob" x="${-MG}" y="${-MG - .5}" width="${W + 2 * MG}" height="${MG + .5}"/>`;
  h += `<text class="oob-label" x="25" y="-3.4">BASELINE</text>`;
  h += `<rect class="c-line" x="0" y="0" width="${W}" height="${L}"/>` + endMarkup();
  if (court === "half"){
    h += `<path class="c-line" d="M19 42A6 6 0 0 1 31 42"/>`;
  } else {
    h += `<path class="c-line" d="M0 42H50"/><circle class="c-line" cx="25" cy="42" r="6"/><circle class="c-fill" cx="25" cy="42" r=".25"/>`;
    h += `<g transform="translate(0 ${FULL_L}) scale(1 -1)">${endMarkup()}</g>`;
    h += `<rect class="c-oob" x="${-MG}" y="${FULL_L}" width="${W + 2 * MG}" height="${MG}"/>`;
  }
  return (courtCache[court] = h);
}
function ballMarkup(q){
  const x = f2(q[0]), y = f2(q[1]);
  return `<g><circle class="ball" cx="${x}" cy="${y}" r=".75"/><path class="ball-seam" d="M${f2(q[0] - .75)} ${y}H${f2(q[0] + .75)}M${x} ${f2(q[1] - .75)}V${f2(q[1] + .75)}"/></g>`;
}
function playersMarkup(pos, ballId, ballAt){
  let h = "";
  for (const id of IDS){
    const q = pos[id];
    h += `<g><circle class="pl-c" cx="${f2(q[0])}" cy="${f2(q[1])}" r="${PR}"/><text class="pl-t" x="${f2(q[0])}" y="${f2(q[1] + .08)}">${id}</text></g>`;
  }
  if (ballAt) h += ballMarkup(ballAt);
  else if (ballId && pos[ballId]) h += ballMarkup([pos[ballId][0] + 1.45, pos[ballId][1] - 1.45]);
  return h;
}

/* ---------- what's on the board ---------- */
/* one frame, before it plays. sel = index of the selected line; extra = markup for a line being drawn */
function stepMarkup(p, fr, step, sel = null, extra = ""){
  const f = fr[step], st = p.steps[step], bows = bowsFor(st, f); let h = "<g>";
  st.actions.forEach((a, i) => {
    const g = actionGeom(a, f, {avoid: f.start, bow: bows.get(a) || 0}); if (!g) return;
    h += `<g class="act${sel === i ? " sel" : ""}" data-act="${i}">${g.hit ? `<path class="a-hit" d="${g.hit}"/>` : ""}${g.html}</g>`;
  });
  h += "</g>" + extra;
  return h + playersMarkup(f.start, f.ballStart);
}
function fullMarkup(p, fr){
  let h = "", badges = "";
  p.steps.forEach((st, i) => {
    const bows = bowsFor(st, fr[i]);
    st.actions.forEach(a => {
      const g = actionGeom(a, fr[i], {avoid: fr[0].start, bow: bows.get(a) || 0}); if (!g) return;
      h += `<g>${g.html}</g>`;
      badges += `<g class="badge"><circle cx="${f2(g.mid[0])}" cy="${f2(g.mid[1])}" r=".95"/><text x="${f2(g.mid[0])}" y="${f2(g.mid[1] + .05)}">${i + 1}</text></g>`;
    });
  });
  return h + badges + playersMarkup(fr[0].start, fr[0].ballStart);
}
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function durs(st){
  const hasMove = st.actions.some(a => MOVES.has(a.type));
  const ballAct = st.actions.find(a => BALL_ACTS.has(a.type));
  if (reduceMotion()) return {move: 0, ball: 0, total: 1100};
  const move = hasMove ? 1050 : 0, ball = !ballAct ? 0 : ballAct.type === "handoff" ? 380 : 650;
  return {move, ball, total: move + ball + 520};
}
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
/* frame anim.i, anim.t milliseconds in */
function animMarkup(p, fr, anim){
  const i = anim.i, st = p.steps[i], f = fr[i], d = durs(st), t = anim.t || 0;
  const pos = clone(f.start), bows = bowsFor(st, f);
  const k = d.move ? ease(clamp(t / d.move, 0, 1)) : (t > 0 ? 1 : 0);
  for (const a of st.actions){
    if (!MOVES.has(a.type) || !a.path || a.path.length < 2) continue;
    const poly = movePoly(a, f, bows.get(a) || 0), c = cumLen(poly);
    pos[a.player] = at(poly, c, k * c[c.length - 1]);
    if (a.type === "handoff" && a.meet && a.meet.length > 1){
      const rp = smooth([f.start[a.to], ...a.meet.slice(1)]), rc = cumLen(rp);
      pos[a.to] = at(rp, rc, k * rc[rc.length - 1]);
    }
  }
  let ballId = f.ballStart, ballAt = null;
  const ba = st.actions.find(a => BALL_ACTS.has(a.type));
  if (ba){
    const A = pos[ba.player];
    const B = ba.type === "shot" ? RIM : pos[ba.to];
    const k = d.ball ? clamp((t - d.move) / d.ball, 0, 1) : (t > 0 ? 1 : 0);
    const lift = ba.type === "shot" ? 2.2 : ba.type === "pass" ? .6 : 0;
    if (k <= 0) ballId = ba.player;
    else if (k >= 1){ ballId = ba.type === "shot" ? null : ba.to; if (!ballId) ballAt = RIM; }
    else { ballAt = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k - Math.sin(Math.PI * k) * lift]; ballId = null; }
  }
  let h = "<g class=\"ghost\">";
  st.actions.forEach(a => { const g = actionGeom(a, f, {bow: bows.get(a) || 0}); if (g) h += g.html; });
  return h + "</g>" + playersMarkup(pos, ballId, ballAt);
}
/* where everyone ends up after the last frame */
function finalMarkup(p, fr){
  const f = fr[fr.length - 1];
  const shot = p.steps.some(s => s.actions.some(a => a.type === "shot"));
  return playersMarkup(f.end, f.ballEnd, !f.ballEnd && shot ? RIM : null);
}

Object.assign(window.Playbook, {
  smooth, cumLen, at, sub, dAttr, arrow, rdp, movePoly, bowsFor, planHandoff, actionGeom,
  courtMarkup, ballMarkup, playersMarkup, stepMarkup, fullMarkup, animMarkup, finalMarkup, durs, f2
});
})();
