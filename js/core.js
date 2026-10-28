/* Play logic shared by the team view and the editor: constants, play data, positions, spot names and the readout.
   Moved here unchanged from the original Playbook Board. */
(() => {
"use strict";
const W = 50, HALF_L = 42, FULL_L = 84, RIM = [25, 5.25], PR = 1.7, MG = 4.5;
const IDS = ["1", "2", "3", "4", "5"];
const MOVES = new Set(["cut", "dribble", "screen", "handoff"]);   /* actions with a drawn path */
const BALL_ACTS = new Set(["pass", "shot", "handoff"]);          /* actions that move the ball; one per step */
const KINDS = ["Man offense", "Zone offense", "Baseline inbound", "Sideline inbound", "Press break", "Quick hitter", "End of game"];
const PRESETS = {
  "5 out":       {1:[25,28], 2:[43,17], 3:[7,17], 4:[46,3], 5:[4,3]},
  "4 out 1 in":  {1:[31,26], 2:[44,12], 3:[6,12], 4:[19,26], 5:[32,7]},
  "Horns":       {1:[25,29], 2:[46,3], 3:[4,3], 4:[31,20], 5:[19,20]},
  "1-4 high":    {1:[25,30], 2:[44,20], 3:[6,20], 4:[31,20], 5:[19,20]},
  "Box inbound": {1:[30,-2.5], 2:[32,8], 3:[18,8], 4:[31,19], 5:[19,19]}
};
const PRESETS_FULL = {"Press break": {1:[20,73], 2:[44,62], 3:[6,58], 4:[31,86.5], 5:[25,47]}};

const r1 = v => Math.round(v * 10) / 10;
const clone = o => JSON.parse(JSON.stringify(o));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const courtLen = c => c === "full" ? FULL_L : HALF_L;
function bounds(court){ return {x0: -MG + 1.8, x1: W + MG - 1.8, y0: -MG + 1.3, y1: courtLen(court) + (court === "full" ? MG - 1.8 : 1.2)}; }
function clampPt(p, court){ const b = bounds(court); return [clamp(p[0], b.x0, b.x1), clamp(p[1], b.y0, b.y1)]; }

function newPlayData(){
  const now = new Date().toISOString();
  return {name: "", kind: KINDS[0], note: "", court: "half",
    setup: {players: clone(PRESETS["5 out"]), ball: "1", preset: "5 out"},
    steps: [{note: "", actions: []}], createdAt: now, updatedAt: now};
}
function normalize(d){
  const p = d && typeof d === "object" ? clone(d) : {};
  const out = newPlayData();
  out.name = typeof p.name === "string" ? p.name : "";
  out.kind = KINDS.includes(p.kind) ? p.kind : (typeof p.kind === "string" && p.kind ? p.kind : KINDS[0]);
  out.note = typeof p.note === "string" ? p.note : "";
  out.court = p.court === "full" ? "full" : "half";
  if (p.setup && p.setup.players){
    for (const id of IDS){ const q = p.setup.players[id]; if (Array.isArray(q) && q.length === 2) out.setup.players[id] = [+q[0], +q[1]]; }
    out.setup.ball = IDS.includes(p.setup.ball) ? p.setup.ball : null;
    out.setup.preset = typeof p.setup.preset === "string" ? p.setup.preset : null;
  }
  if (Array.isArray(p.steps) && p.steps.length){
    out.steps = p.steps.map(s => ({note: typeof s.note === "string" ? s.note : "", actions: Array.isArray(s.actions) ? s.actions.filter(a => a && a.type && IDS.includes(a.player)) : []}));
  }
  if (p.createdAt) out.createdAt = p.createdAt;
  if (p.updatedAt) out.updatedAt = p.updatedAt;
  if (p.example) out.example = true;
  return out;
}

/* Positions and ball at the start/end of every step, built from the setup plus the lines drawn. */
function derive(play){
  const frames = [];
  let pos = clone(play.setup.players), ball = play.setup.ball || null;
  for (const st of play.steps){
    const start = clone(pos), end = clone(pos);
    for (const a of st.actions){
      if (MOVES.has(a.type) && a.path && a.path.length) end[a.player] = a.path[a.path.length - 1].slice();
      /* handoff where the teammate runs to meet the ball */
      if (a.type === "handoff" && a.meet && a.meet.length > 1) end[a.to] = a.meet[a.meet.length - 1].slice();
    }
    let ballEnd = ball;
    for (const a of st.actions){ if (a.type === "pass" || a.type === "handoff") ballEnd = a.to; if (a.type === "shot") ballEnd = null; }
    frames.push({start, end, ballStart: ball, ballEnd});
    pos = end; ball = ballEnd;
  }
  return frames;
}

/* Court spot names, as a coach would call them. Basket at the top, viewer's left = left. */
function spot(p){
  const [x, y] = p;
  if (y > FULL_L + 0.4) return "out of bounds on the far baseline";
  if (y < -0.4) return "out of bounds on the baseline";
  if (x < -0.4) return "out of bounds on the left sideline";
  if (x > W + 0.4) return "out of bounds on the right sideline";
  if (y > HALF_L + 0.4) return "the backcourt";
  const side = x < 25 ? "left" : "right";
  const dx = x - RIM[0], dy = y - RIM[1], d = Math.hypot(dx, dy);
  if (Math.hypot(x - 19, y - 19) <= 3.2) return "the left elbow";
  if (Math.hypot(x - 31, y - 19) <= 3.2) return "the right elbow";
  if (y <= 10.5 && x >= 17 && x <= 33) return Math.abs(dx) <= 3.2 ? "under the basket" : `the ${side} block`;
  if (y > 10.5 && y <= 17 && x >= 17 && x <= 33) return Math.abs(dx) > 4.5 ? `the ${side} mid-post` : "the middle of the lane";
  if (x >= 19 && x <= 31 && y > 17 && y <= 25.5) return "the high post";
  const beyond = y <= RIM[1] ? Math.abs(dx) > 19.5 : d > 19.5;
  if (!beyond) return y < 10 ? `the ${side} short corner` : `the ${side} mid-range`;
  if (y > 35) return "near half court";
  if (y < 11) return `the ${side} corner`;
  const ang = Math.atan2(Math.abs(dx), Math.max(dy, 0.01)) * 180 / Math.PI;
  if (ang < 15) return "the top of the key";
  if (ang < 40) return `the ${side} slot`;
  return `the ${side} wing`;
}

function describeAction(a, f){
  const p = a.player;
  if (a.type === "handoff"){
    if (a.meet && a.meet.length > 1){
      const H = f.end[p], R = f.end[a.to], M = [(H[0] + R[0]) / 2, (H[1] + R[1]) / 2];
      return `${p} dribbles from ${spot(f.start[p])} and ${a.to} comes from ${spot(f.start[a.to])} to meet ${p}. ${p} hands off to ${a.to} at ${spot(M)}.`;
    }
    return `${p} dribbles from ${spot(f.start[p])} and hands off to ${a.to} (${spot(f.end[a.to])}).`;
  }
  if (MOVES.has(a.type)){
    const s = spot(f.start[p]), e = spot(a.path[a.path.length - 1]);
    if (a.type === "cut"){
      if (s !== e) return `${p} cuts from ${s} to ${e}.`;
      const dy = a.path[a.path.length - 1][1] - f.start[p][1];
      return dy > 1.5 ? `${p} lifts up in ${e}.` : dy < -1.5 ? `${p} drops down in ${e}.` : `${p} slides over in ${e}.`;
    }
    if (a.type === "dribble") return s === e ? `${p} dribbles around ${e}.` : `${p} dribbles from ${s} to ${e}.`;
    return dist(f.start[p], a.path[a.path.length - 1]) < 3 || s === e ? `${p} sets a screen at ${e}.` : `${p} goes from ${s} to set a screen at ${e}.`;
  }
  if (a.type === "pass") return `${p} passes to ${a.to} (${spot(f.end[a.to])}).`;
  if (a.type === "shot") return `${p} shoots from ${spot(f.end[p])}.`;
  return "";
}
/* two cuts in the same step where each player ends at the other's spot = a switch */
function switchPairs(st, f){
  const cuts = st.actions.filter(a => a.type === "cut" && a.path && a.path.length > 1), used = new Set(), pairs = [];
  for (let x = 0; x < cuts.length; x++) for (let y = x + 1; y < cuts.length; y++){
    const A = cuts[x], B = cuts[y];
    if (used.has(A) || used.has(B)) continue;
    if (dist(A.path[A.path.length - 1], f.start[B.player]) < 4.5 && dist(B.path[B.path.length - 1], f.start[A.player]) < 4.5){ used.add(A); used.add(B); pairs.push([A, B]); }
  }
  return pairs;
}
function readoutLines(play){
  const fr = derive(play), lines = [];
  const pre = play.setup.preset ? `${play.setup.preset} set. ` : "";
  lines.push({label: "Setup", text: pre + IDS.map(id => `${id} at ${spot(play.setup.players[id])}${play.setup.ball === id ? " with the ball" : ""}`).join(", ") + "."});
  play.steps.forEach((st, i) => {
    const f = fr[i];
    const paired = new Set(), switches = [];
    for (const [A, B] of switchPairs(st, f)){
      paired.add(A); paired.add(B);
      switches.push(`${A.player} and ${B.player} switch spots (${spot(f.start[A.player])} and ${spot(f.start[B.player])}).`);
    }
    const rank = a => a.type === "handoff" ? 0 : MOVES.has(a.type) ? 2 : 3;
    const rest = st.actions.filter(a => !paired.has(a)).sort((a, b) => rank(a) - rank(b));
    const parts = rest.map(a => describeAction(a, f));
    parts.splice(rest.filter(a => rank(a) === 0).length, 0, ...switches);
    for (let k = parts.length - 1; k >= 0; k--) if (!parts[k]) parts.splice(k, 1);
    lines.push({label: `Frame ${i + 1}`, text: parts.length ? parts.join(" ") : "Nothing drawn yet.", note: st.note || ""});
  });
  return lines;
}

/* The play as it's saved and exported: the play data plus its readout written out as text. */
function bodyFor(p){
  const lines = readoutLines(p);
  const body = clone(p);
  body.readout = lines.map(l => `${l.label}: ${l.text}${l.note ? " Note: " + l.note : ""}`);
  return body;
}
/* plays.json: {format, version, exportedAt, plays}. Each play has its id first, then its fields in sorted order. */
const FORMAT = "playbook-board", VERSION = 1;
function sortKeys(v){
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}
function exportText(entries){
  const plays = entries.map(([id, p]) => { const b = sortKeys(bodyFor(p)); delete b.id; return Object.assign({id}, b); });
  return JSON.stringify({format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), plays}, null, 1);
}
/* Reads a plays.json file. Returns [[id, play], ...] in file order, or throws if it isn't one. */
function parsePlaysFile(data){
  if (!data || typeof data !== "object" || !Array.isArray(data.plays)) throw new Error("not a playbook file");
  const out = [], seen = new Set();
  data.plays.forEach((p, i) => {
    if (!p || typeof p !== "object") return;
    let id = typeof p.id === "string" && p.id ? p.id : "p-import-" + i;
    while (seen.has(id)) id += "x";
    seen.add(id); out.push([id, p]);
  });
  return out;
}
const byCreated = (a, b) => String(a[1].createdAt).localeCompare(String(b[1].createdAt)) || a[0].localeCompare(b[0]);

window.Playbook = Object.assign(window.Playbook || {}, {
  W, HALF_L, FULL_L, RIM, PR, MG, IDS, MOVES, BALL_ACTS, KINDS, PRESETS, PRESETS_FULL,
  r1, clone, dist, clamp, courtLen, bounds, clampPt, newPlayData, normalize, derive, spot, describeAction, switchPairs, readoutLines,
  bodyFor, exportText, parsePlaysFile, byCreated, FORMAT, VERSION
});
})();
