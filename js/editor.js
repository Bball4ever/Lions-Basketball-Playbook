/* Editor: the full drawing board. Plays save in this browser (localStorage). The first time it opens with nothing
   saved it loads the site's plays.json. With auto-publish on, changes go to the repo's plays.json a few seconds
   after the last edit (see publish.js); otherwise export plays.json and upload it to update the team view. */
(() => {
"use strict";
const P = window.Playbook;
const {IDS, MOVES, BALL_ACTS, KINDS, PRESETS, PRESETS_FULL, PR, r1, clone, dist, bounds, clampPt, newPlayData, normalize,
  cumLen, rdp, dAttr, f2, actionGeom, planHandoff, bodyFor, toast} = P;

/* ---------- app state ---------- */
const $ = s => document.querySelector(s);
const el = {
  status: $("#status"), statusText: $("#status-text"), notice: $("#notice"),
  list: $("#play-list"), count: $("#count"), empty: $("#list-empty"), newBtn: $("#new-play"),
  name: $("#play-name"), kind: $("#play-kind"), note: $("#play-note"), dup: $("#dup"), del: $("#del"),
  tools: $("#tools"), hint: $("#hint"), presets: $("#presets"), svg: $("#board"),
  addStep: $("#add-step"), undo: $("#undo"), delLine: $("#del-line"), clear: $("#clear-step"), delStep: $("#del-step"),
  stepNote: $("#step-note"), stepNoteLabel: $("#step-note-label"),
  exportBtn: $("#export"), copyJson: $("#copy-json"), reload: $("#reload-site"),
  confirm: $("#reload-confirm"), confirmText: $("#reload-text"), reloadYes: $("#reload-yes"), reloadNo: $("#reload-no"),
  pubStatus: $("#pub-status"), pubStatusText: $("#pub-status-text"), pubSettings: $("#pub-settings"), pubPanel: $("#pub-panel"),
  pubSetup: $("#pub-setup"), pubManage: $("#pub-manage"), pubKey: $("#pub-key"), pubOn: $("#pub-on"), pubSetupMsg: $("#pub-setup-msg"),
  pubDetail: $("#pub-detail"), pubNow: $("#pub-now"), pubForce: $("#pub-force"), pubReload: $("#pub-reload"), pubOff: $("#pub-off"),
  pubClose: $("#pub-close"), fileTip: $("#file-tip")
};
const pub = P.publisher;
const HINTS = {
  move: "Drag players into their starting spots. That works in frame 1; after that, players move by the lines you draw.",
  cut: "Drag from a player along the path they cut.",
  dribble: "Drag from the player with the ball along their dribble path.",
  pass: "Drag from the player with the ball and let go on the player catching it.",
  handoff: "Drag from the player with the ball and let go where the handoff happens. The closest teammate runs there to meet the ball.",
  screen: "Drag from a player to the spot where they set the screen.",
  shot: "Tap the player with the ball to have them shoot.",
  ball: "Tap the player who brings the ball up or inbounds it."
};
const S = {work: {}, known: new Set(), dirty: new Set(), drafts: new Set(), curId: null, tool: "move", loaded: false};
const cur = () => S.work[S.curId];
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sortedIds = () => Object.keys(S.work).sort((a, b) => String(S.work[a].createdAt).localeCompare(String(S.work[b].createdAt)) || a.localeCompare(b));

const viewer = P.createViewer(S, cur, {
  tempMarkup, renderTools, renderStepExtra,
  onGoStep(i){
    if (i > 0 && (S.tool === "move" || S.tool === "ball")) S.tool = "cut";
    if (i === 0 && S.tool === "ball") S.tool = "move";
  },
  onLand: fixToolForFrame
});
const {renderBoard, renderStepUI, renderReadout, stopAnim} = viewer;

/* ---------- storage: this browser ---------- */
/* {id: play} under one key, the same shape the original board used. No key yet means this browser has never saved. */
const LS_KEY = "playbook-board-plays";
function lsHas(){ try { return localStorage.getItem(LS_KEY) !== null; } catch (e){ return false; } }
function lsRead(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e){ return {}; } }
function lsWrite(o){ try { localStorage.setItem(LS_KEY, JSON.stringify(o)); return true; } catch (e){ return false; } }

let saveT = null;
function scheduleSave(){
  setStatus("saving");
  clearTimeout(saveT); saveT = setTimeout(flushSave, 400);
}
function flushSave(){
  clearTimeout(saveT); saveT = null;
  if (!S.dirty.size){ setIdle(); return; }
  const all = lsRead();
  for (const id of S.dirty) if (S.work[id]) all[id] = bodyFor(S.work[id]);
  if (!lsWrite(all)){
    setStatus("error", "Not saved");
    toast("This browser wouldn't save that change. Export plays.json so you don't lose your work.");
    return;
  }
  for (const id of S.dirty){ S.known.add(id); S.drafts.delete(id); }
  S.dirty.clear();
  setIdle(); renderList();
  schedulePublish();
}
function removeSaved(id){ const all = lsRead(); delete all[id]; const ok = lsWrite(all); if (ok) schedulePublish(); return ok; }
/* save right away if the page is closing in the middle of the short wait */
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveT) flushSave(); });
window.addEventListener("pagehide", () => { if (saveT) flushSave(); });

function setStatus(kind, text){
  el.status.dataset.kind = kind;
  el.statusText.textContent = text || ({pending: "Loading plays", saving: "Saving", saved: "Saved in this browser", error: "Not saved"})[kind];
}
function setIdle(){ setStatus(S.dirty.size ? "saving" : "saved"); }

/* replace everything in the editor with these plays: [[id, data], ...] */
function loadPlays(entries){
  stopAnim(false);
  S.work = {}; S.known = new Set(); S.dirty = new Set(); S.drafts = new Set();
  for (const [id, data] of entries){ S.work[id] = normalize(data); S.known.add(id); }
  S.loaded = true;
  openFirstOrDraft();
}
function openFirstOrDraft(render = true){
  const ids = sortedIds();
  if (ids.length) S.curId = ids[0];
  else { const id = newId(); S.work[id] = newPlayData(); S.drafts.add(id); S.curId = id; }
  viewer.reset();
  if (render) renderAll();
}

/* the team's plays: {entries, fp}. With a key, read the repo itself, since the site can be a minute or two behind. */
async function fetchSitePlays(){
  let text = null;
  const key = pub.getKey();
  if (key){ try { text = (await pub.readRemote(key)).text; } catch (e){ text = null; } }
  if (text === null){
    const res = await fetch("plays.json", {cache: "no-store"});
    if (!res.ok) throw new Error("HTTP " + res.status);
    text = await res.text();
  }
  return {entries: P.parsePlaysFile(JSON.parse(text)), fp: pub.fingerprint(text)};
}

/* ---------- rendering ---------- */
function renderAll(){ renderList(); renderMeta(); viewer.renderView(); }

function renderList(){
  el.list.textContent = "";
  for (const id of sortedIds()){
    const p = S.work[id];
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.className = "play-item" + (id === S.curId ? " on" : "");
    if (id === S.curId) b.setAttribute("aria-current", "true");
    const n = document.createElement("span"); n.className = "pi-name"; n.textContent = p.name.trim() || "Untitled play";
    if (p.example){ const t = document.createElement("span"); t.className = "tag"; t.textContent = "Example"; n.append(t); }
    const m = document.createElement("span"); m.className = "pi-meta";
    const nSteps = p.steps.length;
    m.textContent = `${p.kind} · ${p.court === "full" ? "Full" : "Half"} court · ${nSteps} frame${nSteps === 1 ? "" : "s"}` + (S.drafts.has(id) ? " · not saved yet" : "");
    b.append(n, m);
    b.addEventListener("click", () => openPlay(id));
    li.append(b); el.list.append(li);
  }
  const saved = [...S.known].filter(id => S.work[id]).length;
  el.count.textContent = saved ? `(${saved})` : "";
  el.empty.hidden = !(S.loaded && saved === 0);
}
function renderMeta(){
  const p = cur();
  const setVal = (inp, v) => { if (document.activeElement !== inp && inp.value !== v) inp.value = v; };
  setVal(el.name, p.name); setVal(el.note, p.note);
  if (![...el.kind.options].some(o => o.value === p.kind)){ const o = document.createElement("option"); o.value = o.textContent = p.kind; el.kind.append(o); }
  el.kind.value = p.kind;
  document.querySelectorAll("[data-court]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.court === p.court)));
}
function renderTools(){
  el.tools.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === S.tool)));
  el.hint.textContent = S.atEnd ? "That's where everyone ends up. Hit Back to go through it again, or tap a frame to draw on it."
    : S.full ? "Full diagram shows every frame at once, numbered. Tap a frame to draw on it."
    : HINTS[S.tool];
  const showPresets = S.step === 0 && !S.full && !S.atEnd && !S.anim;
  el.presets.hidden = !showPresets;
  if (showPresets){
    const p = cur();
    const list = Object.assign({}, PRESETS, p.court === "full" ? PRESETS_FULL : {});
    el.presets.textContent = "";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = "Start from";
    el.presets.append(lbl);
    for (const name of Object.keys(list)){
      const c = document.createElement("button"); c.type = "button"; c.className = "chip"; c.textContent = name;
      c.setAttribute("aria-pressed", String(p.setup.preset === name));
      c.addEventListener("click", () => { const q = cur(); q.setup.players = clone(list[name]); q.setup.preset = name; changed(); renderTools(); });
      el.presets.append(c);
    }
  }
}
/* the frame buttons only the editor has */
function renderStepExtra(){
  const p = cur();
  const busy = S.full || S.atEnd;
  const acts = p.steps[S.step].actions;
  el.addStep.disabled = p.steps.length >= 12;
  el.undo.disabled = !acts.length || busy;
  el.clear.disabled = !acts.length || busy;
  el.delStep.disabled = p.steps.length < 2 || busy;
  el.delLine.hidden = S.sel === null || busy;
  el.stepNoteLabel.textContent = `Frame ${S.step + 1} note`;
  if (document.activeElement !== el.stepNote) el.stepNote.value = p.steps[S.step].note || "";
  el.stepNote.disabled = busy;
}
function tempMarkup(f, p){
  const d = S.drawing;
  if (d.type === "pass"){
    const A = f.end[d.player], B = d.cursor;
    const rec = nearestPlayer(B, f.end, 4.2, d.player);
    let h = `<g class="temp"><path class="a-pass" d="${dAttr([A, rec ? f.end[rec] : B])}"/></g>`;
    if (rec) h += `<circle class="pl-ring" cx="${f2(f.end[rec][0])}" cy="${f2(f.end[rec][1])}" r="${PR + .8}"/>`;
    return h;
  }
  if (d.type === "handoff"){
    /* preview exactly what letting go here would draw, and ring the teammate who'd take it */
    const pl = planHandoff(d, f, p.court);
    const g = pl && !pl.err ? actionGeom({type: "handoff", player: d.player, to: pl.to, path: pl.path, meet: pl.meet}, f)
                            : actionGeom({type: "dribble", player: d.player, path: d.pts}, f);
    let h = g ? `<g class="temp">${g.html}</g>` : "";
    if (pl){ const q = f.start[pl.to]; h += `<circle class="pl-ring" cx="${f2(q[0])}" cy="${f2(q[1])}" r="${PR + .8}"/>`; }
    return h;
  }
  const g = actionGeom({type: d.type, player: d.player, path: d.pts}, f, {avoid: f.start});
  return g ? `<g class="temp">${g.html}</g>` : "";
}

/* ---------- edits ---------- */
function changed(){
  const p = cur(); p.updatedAt = new Date().toISOString();
  S.drafts.delete(S.curId); S.dirty.add(S.curId);
  scheduleSave();
  renderBoard(); renderStepUI(); renderReadout(); renderList();
}
function changedText(){
  const p = cur(); p.updatedAt = new Date().toISOString();
  S.drafts.delete(S.curId); S.dirty.add(S.curId);
  scheduleSave(); renderList(); renderReadout();
}
function openPlay(id){
  stopAnim();
  if (id !== S.curId && S.drafts.has(S.curId)){ delete S.work[S.curId]; S.drafts.delete(S.curId); }
  S.curId = id; viewer.reset();
  if (S.tool !== "move" && S.tool !== "ball") S.tool = "move";
  renderAll();
}
function setBallAction(a){
  const acts = cur().steps[S.step].actions;
  const NAMES = {pass: "pass", shot: "shot", handoff: "handoff"};
  let replaced = null;
  for (let i = acts.length - 1; i >= 0; i--) if (BALL_ACTS.has(acts[i].type)){ if (acts[i].type !== a.type) replaced = acts[i].type; acts.splice(i, 1); }
  /* a handoff is also the handler's movement for this frame, and the teammate's run to meet it */
  let recvReplaced = null;
  if (a.type === "handoff") for (let i = acts.length - 1; i >= 0; i--){
    if (!MOVES.has(acts[i].type)) continue;
    if (acts[i].player === a.player) acts.splice(i, 1);
    else if (a.meet && acts[i].player === a.to){ recvReplaced = acts[i].type; acts.splice(i, 1); }
  }
  acts.push(a); S.sel = null; changed();
  if (recvReplaced) toast(`${a.to} now runs to the handoff, so it replaced ${a.to}'s ${recvReplaced} in this frame.`);
  else if (replaced) toast(`One ball move per frame, so the ${NAMES[a.type]} replaced the ${NAMES[replaced]}.`);
}
function nearestPlayer(pt, pos, max, except){
  let best = null, bd = max;
  for (const id of IDS){ if (id === except || !pos[id]) continue; const d = dist(pt, pos[id]); if (d <= bd){ bd = d; best = id; } }
  return best;
}
function armed(btn, label, fn){
  if (btn.dataset.armed){ clearTimeout(btn._t); delete btn.dataset.armed; btn.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = "1"; btn.textContent = label;
  btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = btn.dataset.label; }, 3200);
}
function fixToolForFrame(){
  if (S.step > 0 && (S.tool === "move" || S.tool === "ball")) S.tool = "cut";
}

/* ---------- pointer drawing ---------- */
function toCourt(e){
  const m = el.svg.getScreenCTM(); if (!m) return [0, 0];
  const pt = el.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(m.inverse()); return [q.x, q.y];
}
el.svg.addEventListener("pointerdown", e => {
  if (e.button > 0 || !cur()) return;
  if (S.anim){ stopAnim(); return; }
  if (S.full){ toast("Full diagram is for looking. Tap a frame number to draw on it."); return; }
  if (S.atEnd){ toast("That's the end of the play. Tap a frame number to draw on it."); return; }
  const p = cur(), f = S.frames[S.step], pt = toCourt(e);
  const hit = nearestPlayer(pt, f.start, PR + 1.0, null);
  const actEl = e.target.closest ? e.target.closest("[data-act]") : null;
  if (!hit){
    if (actEl){ S.sel = +actEl.dataset.act; }
    else if (S.sel !== null){ S.sel = null; }
    else if (S.tool !== "move") toast("Start on a player.");
    renderBoard(); renderStepUI(); return;
  }
  S.sel = null;
  const holder = f.ballStart, tool = S.tool;
  if (tool === "move"){
    if (S.step > 0){ toast(`Players only drag in frame 1. Here, use Cut to move ${hit}.`); renderBoard(); renderStepUI(); return; }
    S.drag = {id: hit, off: [f.start[hit][0] - pt[0], f.start[hit][1] - pt[1]], moved: false};
  } else if (tool === "ball"){
    if (S.step > 0){ toast("The ball starts with whoever you pick in frame 1. Use Pass to move it."); return; }
    if (p.setup.ball !== hit){ p.setup.ball = hit; changed(); }
    return;
  } else {
    if ((tool === "dribble" || tool === "pass" || tool === "shot" || tool === "handoff") && holder !== hit){
      toast(holder ? `${holder} has the ball in this frame. Start from ${holder}.` : "Nobody has the ball in this frame.");
      return;
    }
    if (tool === "shot"){ setBallAction({type: "shot", player: hit}); return; }
    if ((tool === "cut" || tool === "screen") && p.steps[S.step].actions.some(a => a.type === "handoff" && a.meet && a.to === hit)){
      toast(`${hit} is running to the handoff in this frame. Draw this in the next frame, or delete the handoff first.`); return;
    }
    S.drawing = tool === "pass" ? {type: "pass", player: hit, cursor: pt} : {type: tool, player: hit, pts: [f.start[hit].slice()]};
  }
  try { el.svg.setPointerCapture(e.pointerId); } catch (_){}
  e.preventDefault();
  renderBoard();
});
el.svg.addEventListener("pointermove", e => {
  if (!S.drag && !S.drawing) return;
  const p = cur(), pt = toCourt(e);
  if (S.drag){
    p.setup.players[S.drag.id] = clampPt([pt[0] + S.drag.off[0], pt[1] + S.drag.off[1]], p.court);
    S.drag.moved = true; renderBoard(); return;
  }
  const d = S.drawing;
  if (d.type === "pass") d.cursor = pt;
  else { const q = clampPt(pt, p.court); if (dist(d.pts[d.pts.length - 1], q) > .35) d.pts.push(q); }
  renderBoard();
});
function endPointer(cancel){
  const p = cur();
  if (S.drag){
    const d = S.drag; S.drag = null;
    if (d.moved && !cancel){ p.setup.players[d.id] = p.setup.players[d.id].map(r1); p.setup.preset = null; changed(); renderTools(); }
    else renderBoard();
    return;
  }
  if (!S.drawing) return;
  const d = S.drawing; S.drawing = null;
  if (cancel){ renderBoard(); return; }
  const f = S.frames[S.step];
  if (d.type === "pass"){
    const rec = nearestPlayer(d.cursor, f.end, 4.2, d.player);
    if (!rec){ toast("Let go on the player catching the pass."); renderBoard(); return; }
    setBallAction({type: "pass", player: d.player, to: rec}); return;
  }
  if (d.type === "handoff"){
    const pl = planHandoff(d, f, p.court);
    if (!pl || pl.err){ toast(`Drag ${d.player}'s dribble farther, then let go where the handoff happens.`); renderBoard(); return; }
    const round = q => [r1(q[0]), r1(q[1])];
    const a = {type: "handoff", player: d.player, to: pl.to, path: rdp(pl.path, .45).map(round)};
    if (pl.meet) a.meet = pl.meet.map(round);
    setBallAction(a); return;
  }
  const acts = p.steps[S.step].actions;
  if (acts.some(a => a.type === "handoff" && a.meet && a.to === d.player)){
    toast(`${d.player} is running to the handoff in this frame. Draw this in the next frame, or delete the handoff first.`);
    renderBoard(); return;
  }
  const len = cumLen(d.pts).pop();
  if (len < 3.5){ toast(`Drag farther from ${d.player} to draw the path.`); renderBoard(); return; }
  const pts = rdp(d.pts, .45).map(q => [r1(q[0]), r1(q[1])]);
  const k = acts.findIndex(a => MOVES.has(a.type) && a.player === d.player);
  if (k >= 0) acts.splice(k, 1);
  acts.push({type: d.type, player: d.player, path: pts});
  changed();
}
el.svg.addEventListener("pointerup", () => endPointer(false));
el.svg.addEventListener("pointercancel", () => endPointer(true));

/* ---------- controls ---------- */
KINDS.forEach(k => { const o = document.createElement("option"); o.value = o.textContent = k; el.kind.append(o); });
el.tools.addEventListener("click", e => {
  const b = e.target.closest("[data-tool]"); if (!b) return;
  stopAnim(); S.tool = b.dataset.tool; S.full = false; S.sel = null; S.atEnd = false;
  if ((S.tool === "move" || S.tool === "ball") && S.step > 0){ S.step = 0; toast(S.tool === "move" ? "Back to frame 1 to place players." : "Back to frame 1 to hand out the ball."); }
  viewer.renderView();
});
el.name.addEventListener("input", () => { cur().name = el.name.value; changedText(); });
el.note.addEventListener("input", () => { cur().note = el.note.value; changedText(); });
el.stepNote.addEventListener("input", () => { cur().steps[S.step].note = el.stepNote.value; changedText(); });
el.kind.addEventListener("change", () => { cur().kind = el.kind.value; changedText(); });
document.querySelectorAll("[data-court]").forEach(b => b.addEventListener("click", () => {
  const p = cur(), c = b.dataset.court; if (p.court === c) return;
  stopAnim();
  let moved = false;
  if (c === "half"){
    const bd = bounds("half");
    for (const id of IDS){ const q = p.setup.players[id]; if (q[1] > bd.y1){ p.setup.players[id] = clampPt(q, "half"); moved = true; } }
    for (const st of p.steps) for (const a of st.actions) for (const key of ["path", "meet"]) if (a[key]) a[key] = a[key].map(q => { if (q[1] > bd.y1) moved = true; return clampPt(q, "half"); });
    if (p.setup.preset && !PRESETS[p.setup.preset]) p.setup.preset = null;
  }
  p.court = c; changed(); renderMeta(); renderTools();
  if (moved) toast("Moved anything in the backcourt up to half court.");
}));
el.newBtn.addEventListener("click", () => {
  if (S.drafts.has(S.curId)){ el.name.focus(); return; }
  const id = newId(); S.work[id] = newPlayData(); S.drafts.add(id);
  openPlay(id); el.name.focus();
});
el.dup.addEventListener("click", () => {
  if (S.drafts.has(S.curId)){ toast("Draw something first, then you can copy it."); return; }
  const id = newId(), data = clone(cur()), now = new Date().toISOString();
  data.name = (data.name.trim() || "Untitled play") + " copy"; delete data.example; data.createdAt = now; data.updatedAt = now;
  S.work[id] = data; S.dirty.add(id); openPlay(id); scheduleSave(); renderList(); toast("Copied. You're editing the copy now.");
});
el.del.addEventListener("click", () => armed(el.del, "Tap again to delete", () => {
  const id = S.curId, wasKnown = S.known.has(id);
  delete S.work[id]; S.known.delete(id); S.dirty.delete(id); S.drafts.delete(id);
  openFirstOrDraft();
  if (wasKnown){ if (removeSaved(id)) toast("Play deleted."); else toast("Couldn't delete that play. Try again."); }
}));
/* a new frame goes right after the one you're on (at the end from Full diagram). It starts empty, so nobody moves
   in it and every frame after it plays out exactly as before. */
el.addStep.addEventListener("click", () => {
  const p = cur(); if (p.steps.length >= 12) return;
  stopAnim();
  const at = S.full ? p.steps.length : S.step + 1;
  p.steps.splice(at, 0, {note: "", actions: []}); S.step = at; S.full = false; S.sel = null; S.atEnd = false;
  if (S.tool === "move" || S.tool === "ball") S.tool = "cut";
  renderTools(); changed();
  if (at < p.steps.length - 1) toast(`Added frame ${at + 1} after frame ${at}. The frames after it moved back one.`);
});
el.undo.addEventListener("click", () => { const a = cur().steps[S.step].actions; if (!a.length) return; a.pop(); S.sel = null; changed(); });
el.delLine.addEventListener("click", () => { if (S.sel === null) return; cur().steps[S.step].actions.splice(S.sel, 1); S.sel = null; changed(); });
el.clear.addEventListener("click", () => armed(el.clear, "Tap again to clear", () => { cur().steps[S.step].actions = []; S.sel = null; changed(); }));
el.delStep.addEventListener("click", () => armed(el.delStep, "Tap again to delete", () => {
  const p = cur(); if (p.steps.length < 2) return;
  p.steps.splice(S.step, 1); S.step = Math.max(0, S.step - 1); S.sel = null; S.atEnd = false;
  if (S.step === 0 && S.tool === "ball") S.tool = "move";
  renderTools(); changed();
}));
document.addEventListener("keydown", e => {
  const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  if (typing || !cur()) return;
  if ((e.key === "Delete" || e.key === "Backspace") && S.sel !== null){ e.preventDefault(); el.delLine.click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){ e.preventDefault(); el.undo.click(); }
  else if (e.key === "Escape" && S.sel !== null){ S.sel = null; renderBoard(); renderStepUI(); }
});

/* ---------- plays.json: export, copy, reload from the site ---------- */
/* saved plays only, oldest first, in the same format as the site's plays.json */
function exportText(){
  if (saveT) flushSave();
  return P.exportText(sortedIds().filter(id => !S.drafts.has(id)).map(id => [id, S.work[id]]));
}
const playCount = n => `${n} play${n === 1 ? "" : "s"}`;
el.exportBtn.addEventListener("click", () => {
  const text = exportText();
  const url = URL.createObjectURL(new Blob([text], {type: "application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = "plays.json";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Downloaded plays.json with ${playCount(JSON.parse(text).plays.length)}.`);
});
el.copyJson.addEventListener("click", async () => {
  const text = exportText();
  if (await P.copyText(text)) toast(`Copied plays.json with ${playCount(JSON.parse(text).plays.length)}.`);
  else toast("This browser wouldn't copy. Use Export plays.json instead.");
});
let pending = null;   /* the site's plays {entries, fp}, waiting for the person to confirm */
el.reload.addEventListener("click", async () => {
  el.reload.disabled = true; el.reload.textContent = "Checking the site…";
  try { pending = await fetchSitePlays(); }
  catch (e){ pending = null; toast("Couldn't reach the site's plays.json. Nothing changed."); }
  el.reload.disabled = false; el.reload.textContent = "Reload from site";
  if (!pending) return;
  const mine = sortedIds().filter(id => !S.drafts.has(id)).length;
  el.confirmText.textContent = `Replace the ${playCount(mine)} saved in this browser with the ${playCount(pending.entries.length)} on the site? Any changes you haven't exported${pub.getKey() ? " or published" : ""} will be lost.`;
  el.confirm.hidden = false; el.reloadNo.focus();
});
el.reloadNo.addEventListener("click", () => { pending = null; el.confirm.hidden = true; el.reload.focus(); });
el.reloadYes.addEventListener("click", () => {
  if (!pending) return;
  const {entries, fp} = pending; pending = null; el.confirm.hidden = true;
  clearTimeout(saveT); saveT = null;
  const all = {}; for (const [id, d] of entries) all[id] = bodyFor(normalize(d));
  if (!lsWrite(all)){ toast("This browser wouldn't save. Nothing changed."); return; }
  loadPlays(entries); setIdle(); el.notice.hidden = true;
  cancelPublish(); pub.setBase(fp); if (pub.getKey()) setPub("published", "in step");
  toast(`Loaded ${playCount(entries.length)} from the site.`);
});

/* ---------- auto-publish to the team site ---------- */
const PUBLISH_DELAY = 6000;   /* after the last change */
let pubT = null, pubBusy = false, pubAgain = false, pubKind = "off", pubError = null, pubAt = null;
function setPub(kind, detail){
  pubKind = kind; pubError = kind === "failed" ? detail : null;
  if (kind === "published" && detail !== "in step") pubAt = new Date();
  const at = pubAt ? ` ${pubAt.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}` : "";
  el.pubStatus.dataset.kind = kind;
  el.pubStatusText.textContent = ({
    off: "Team site: auto-publish off", waiting: "Team site: publishing in a few seconds", publishing: "Team site: publishing",
    published: pubAt ? `Team site: published${at}` : "Team site: up to date", conflict: "Team site: has newer plays", failed: "Team site: not published"
  })[kind];
  renderPubPanel();
}
function renderPubPanel(){
  const on = !!pub.getKey();
  el.pubSetup.hidden = on; el.pubManage.hidden = !on;
  el.pubForce.hidden = el.pubReload.hidden = pubKind !== "conflict";
  el.pubNow.hidden = pubKind === "conflict";
  el.pubDetail.textContent = ({
    waiting: "Your latest changes go to the team site a few seconds after you stop editing.",
    publishing: "Sending your plays to the team site now.",
    published: `Auto-publish is on. ${pubAt ? `Your plays went to the team site at${" " + pubAt.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}. Teammates see them about a minute or two after that.` : "The team site has the same plays as this editor."}`,
    conflict: "The team site has plays that this editor doesn't, from another device or an uploaded plays.json, so nothing was published to keep them safe. Reload from site to get the team's plays (changes here that aren't on the site will be lost), or replace the team's plays with the ones in this editor.",
    failed: pubError || "Your plays didn't publish.",
    off: ""
  })[pubKind];
  el.pubSettings.textContent = on ? "Auto-publish on" : "Auto-publish…";
  el.fileTip.textContent = on ? "Your plays save in this browser and go to the team site a few seconds after you stop editing."
    : "Your plays save in this browser. To update the team view, turn on auto-publish, or export plays.json and upload it to the repo.";
}
function openPubPanel(){ el.pubPanel.hidden = false; el.pubStatus.setAttribute("aria-expanded", "true"); renderPubPanel(); (pub.getKey() ? el.pubClose : el.pubKey).focus(); }
function closePubPanel(){ el.pubPanel.hidden = true; el.pubStatus.setAttribute("aria-expanded", "false"); }
function cancelPublish(){ clearTimeout(pubT); pubT = null; pubAgain = false; }
function schedulePublish(delay = PUBLISH_DELAY){
  if (!pub.getKey() || pubKind === "conflict") return;
  clearTimeout(pubT); pubT = setTimeout(() => publishNow(false), delay);
  if (!pubBusy) setPub("waiting");
}
/* force = replace the team's plays even if they changed somewhere else */
async function publishNow(force){
  clearTimeout(pubT); pubT = null;
  const key = pub.getKey(); if (!key){ setPub("off"); return; }
  if (pubBusy){ pubAgain = true; return; }
  pubBusy = true; setPub("publishing");
  try {
    for (let attempt = 0; ; attempt++){
      const text = exportText(), mine = pub.fingerprint(text);
      const remote = await pub.readRemote(key), theirs = pub.fingerprint(remote.text);
      if (theirs === mine){ pub.setBase(mine); setPub("published", pub.getBase() === mine && !force ? "in step" : undefined); break; }
      if (!force && theirs !== pub.getBase()){ pubAgain = false; setPub("conflict"); break; }
      try {
        await pub.writeRemote(key, text, remote.sha, "Update plays from the editor");
        pub.setBase(mine); setPub("published"); break;
      } catch (e){ if (e.kind === "moved" && attempt < 2) continue; throw e; }
    }
  } catch (e){
    setPub("failed", e.message || "Your plays didn't publish.");
  } finally {
    pubBusy = false;
    if (pubAgain){ pubAgain = false; schedulePublish(1000); }
  }
}
function unpublishedChanges(){ return pub.fingerprint(exportText()) !== pub.getBase(); }
function startPublishing(){
  if (!pub.getKey()){ setPub("off"); return; }
  /* finish publishing changes from last time, if the page closed before they went out */
  if (unpublishedChanges()) schedulePublish(1500); else setPub("published", "in step");
}
el.pubStatus.addEventListener("click", () => el.pubPanel.hidden ? openPubPanel() : closePubPanel());
el.pubSettings.addEventListener("click", () => el.pubPanel.hidden ? openPubPanel() : closePubPanel());
el.pubClose.addEventListener("click", closePubPanel);
el.pubOn.addEventListener("click", async () => {
  const key = el.pubKey.value.trim();
  const say = msg => { el.pubSetupMsg.textContent = msg; el.pubSetupMsg.hidden = !msg; };
  if (!key){ say("Paste the key from GitHub first."); el.pubKey.focus(); return; }
  el.pubOn.disabled = true; el.pubOn.textContent = "Checking…"; say("");
  try { await pub.readRemote(key); }
  catch (e){ say(e.message); el.pubOn.disabled = false; el.pubOn.textContent = "Turn on"; return; }
  el.pubOn.disabled = false; el.pubOn.textContent = "Turn on";
  if (!pub.setKey(key)){ say("This browser wouldn't save the key."); return; }
  el.pubKey.value = "";
  toast("Auto-publish is on. Publishing your plays now.");
  await publishNow(true);
});
el.pubKey.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); el.pubOn.click(); } });
el.pubNow.addEventListener("click", () => publishNow(false));
el.pubForce.addEventListener("click", () => armed(el.pubForce, "Tap again to replace the team's plays", () => publishNow(true)));
el.pubReload.addEventListener("click", () => { closePubPanel(); el.reload.click(); });
el.pubOff.addEventListener("click", () => {
  cancelPublish(); pub.setKey(null); setPub("off");
  toast("Auto-publish is off. The key is removed from this browser.");
});
window.addEventListener("online", () => { if (pub.getKey() && pubKind === "failed") schedulePublish(1000); });
/* warn before closing with changes that haven't gone out yet */
window.addEventListener("beforeunload", e => { if (pubT || pubBusy){ e.preventDefault(); e.returnValue = ""; } });

/* ---------- start ---------- */
(async () => {
  setStatus("pending");
  if (lsHas()){ loadPlays(Object.entries(lsRead())); setIdle(); }
  else {
    /* first time in this browser: start from the site's plays */
    try {
      const {entries, fp} = await fetchSitePlays();
      const all = {}; for (const [id, d] of entries) all[id] = bodyFor(normalize(d));
      loadPlays(entries); pub.setBase(fp);
      if (lsWrite(all)) setIdle();
      else { setStatus("error", "Not saving"); el.notice.textContent = "This browser isn't letting the page save, so changes are lost when you close it. Export plays.json before you leave."; el.notice.hidden = false; }
    } catch (e){
      loadPlays([]); setIdle();
      el.notice.textContent = "Couldn't load the site's plays.json, so you're starting with an empty playbook. Use Reload from site to try again.";
      el.notice.hidden = false;
    }
  }
  startPublishing();
})();
P.registerServiceWorker();
})();
