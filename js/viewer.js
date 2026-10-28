/* The board controller shared by the team view and the editor: the court, frame tabs, Back, Next, Play all,
   Full diagram, the readout and the arrow keys. Moved here from the original Playbook Board.
   Play all runs every frame in order. Next plays only the frame you're on, then stops on the next one.
   After the last frame the board shows where everyone ends up (S.atEnd). */
(() => {
"use strict";
const P = window.Playbook;
const {W, MG, courtLen, readoutLines, derive} = P;
const $ = s => document.querySelector(s);

let toastT = null;
function toast(msg){
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* S is the page's state object; the viewer reads and writes step, full, atEnd, anim, frames, sel, drawing and drag on it.
   getPlay returns the open play. Hooks let the editor add its own parts:
     tempMarkup(f, p)  markup for a line being drawn
     renderTools()     redraws the tools and the hint
     onGoStep(i)       tapped a frame tab or readout line
     onLand()          moved to another frame with Back, Next or Play all
     renderStepExtra() frame buttons only the editor has */
function createViewer(S, getPlay, hooks = {}){
  const H = Object.assign({tempMarkup: null, renderTools(){}, onGoStep(){}, onLand(){}, renderStepExtra(){}}, hooks);
  const el = {
    wrap: $("#board-wrap"), svg: $("#board"), tabs: $("#step-tabs"), full: $("#full-view"),
    playBtn: $("#play-btn"), prev: $("#prev-frame"), next: $("#next-frame"), readout: $("#readout")
  };
  Object.assign(S, {step: 0, full: false, atEnd: false, anim: null, frames: [], sel: null, drawing: null, drag: null});

  function renderBoard(){
    const p = getPlay(); if (!p) return;
    const fr = derive(p); S.frames = fr;
    const L = courtLen(p.court);
    const vb = [-MG, -MG - .5, W + 2 * MG, L + MG + .5 + (p.court === "full" ? MG : 3)];
    el.svg.setAttribute("viewBox", vb.join(" "));
    el.wrap.style.setProperty("--ar", (vb[2] / vb[3]).toFixed(4));
    el.wrap.dataset.court = p.court;
    let h = P.courtMarkup(p.court);
    if (S.anim) h += P.animMarkup(p, fr, S.anim);
    else if (S.full) h += P.fullMarkup(p, fr);
    else if (S.atEnd) h += P.finalMarkup(p, fr);
    else h += P.stepMarkup(p, fr, S.step, S.sel, S.drawing && H.tempMarkup ? H.tempMarkup(fr[S.step], p) : "");
    el.svg.innerHTML = h;
  }
  function renderStepUI(){
    const p = getPlay(); if (!p) return;
    el.tabs.textContent = "";
    p.steps.forEach((st, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "step-tab"; b.textContent = i + 1;
      b.setAttribute("aria-label", `Frame ${i + 1}`);
      if (i === S.step && !S.full && !S.atEnd) b.setAttribute("aria-current", "step");
      b.addEventListener("click", () => goStep(i));
      el.tabs.append(b);
    });
    if (S.atEnd){ const e = document.createElement("span"); e.className = "step-tab end"; e.setAttribute("aria-current", "step"); e.textContent = "End"; el.tabs.append(e); }
    el.prev.disabled = !S.anim && !S.atEnd && S.step === 0;
    el.next.disabled = !S.anim && S.atEnd;
    el.full.setAttribute("aria-pressed", String(S.full));
    el.playBtn.innerHTML = S.anim && S.anim.mode === "all" ? "&#9632; Stop" : "&#9654; Play all";
    H.renderStepExtra();
  }
  function renderReadout(){
    const p = getPlay(); if (!p) return;
    const lines = readoutLines(p);
    el.readout.textContent = "";
    lines.forEach((ln, i) => {
      const li = document.createElement("li");
      const b = document.createElement("b"); b.textContent = ln.label;
      const s = document.createElement("span"); s.textContent = ln.text;
      li.append(b, s);
      if (ln.note){ const n = document.createElement("span"); n.className = "note"; n.textContent = ln.note; li.append(n); }
      if (i > 0){
        li.tabIndex = 0;
        if (i - 1 === S.step && !S.full && !S.atEnd) li.classList.add("on");
        li.addEventListener("click", () => goStep(i - 1));
        li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); goStep(i - 1); } });
      }
      el.readout.append(li);
    });
  }
  function renderView(){ H.renderTools(); renderBoard(); renderStepUI(); renderReadout(); }

  /* show a play from its first frame */
  function reset(){
    stopAnim(false);
    S.step = 0; S.sel = null; S.full = false; S.atEnd = false; S.drawing = null; S.drag = null;
  }
  function goStep(i){
    stopAnim();
    S.step = i; S.full = false; S.sel = null; S.atEnd = false;
    H.onGoStep(i);
    renderView();
  }
  function playAll(){
    if (S.anim && S.anim.mode === "all"){ stopAnim(); return; }
    stopAnim(false);
    const p = getPlay();
    if (!p.steps.some(s => s.actions.length)){ toast("Draw at least one frame, then hit Play."); return; }
    S.full = false; S.sel = null; S.drawing = null; S.drag = null; S.atEnd = false;
    S.anim = {mode: "all", i: 0, t0: performance.now(), t: 0, raf: 0};
    S.step = 0; H.renderTools(); renderStepUI(); renderReadout();
    tick();
  }
  function nextFrame(){
    if (S.anim){ const i = S.anim.i; cancelAnimationFrame(S.anim.raf); S.anim = null; landAfter(i); return; }
    if (S.atEnd){ toast("That's the end of the play. Hit Back or Play all."); return; }
    S.full = false; S.sel = null; S.drawing = null; S.drag = null;
    const i = S.step;
    if (!getPlay().steps[i].actions.length){ landAfter(i); return; }
    S.anim = {mode: "one", i, t0: performance.now(), t: 0, raf: 0};
    H.renderTools(); renderStepUI(); renderReadout();
    tick();
  }
  function prevFrame(){
    stopAnim(false);
    if (S.atEnd) S.atEnd = false;
    else if (S.step > 0) S.step--;
    S.full = false; S.sel = null;
    H.onLand();
    renderView();
  }
  function landAfter(i){
    const n = getPlay().steps.length;
    if (i < n - 1){ S.step = i + 1; S.atEnd = false; } else { S.step = n - 1; S.atEnd = true; }
    H.onLand();
    renderView();
  }
  function tick(){
    if (!S.anim) return;
    const p = getPlay(), a = S.anim, d = P.durs(p.steps[a.i]);
    a.t = performance.now() - a.t0;
    const total = a.mode === "one" ? d.move + d.ball + 250 : d.total;
    if (a.t > total){
      if (a.mode === "all" && a.i < p.steps.length - 1){ a.i++; a.t0 = performance.now(); a.t = 0; S.step = a.i; renderStepUI(); renderReadout(); }
      else { const i = a.i; S.anim = null; landAfter(i); return; }
    }
    renderBoard();
    a.raf = requestAnimationFrame(tick);
  }
  function stopAnim(render = true){
    if (!S.anim) return;
    cancelAnimationFrame(S.anim.raf); S.step = S.anim.i; S.anim = null;
    if (render) renderView();
  }
  function toggleFull(){ stopAnim(); S.full = !S.full; S.sel = null; S.atEnd = false; renderView(); }

  el.full.addEventListener("click", toggleFull);
  el.playBtn.addEventListener("click", playAll);
  el.next.addEventListener("click", nextFrame);
  el.prev.addEventListener("click", prevFrame);
  document.addEventListener("keydown", e => {
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    if (typing || !getPlay() || el.svg.closest("[hidden]")) return;
    if (e.key === "ArrowRight" && !e.altKey && !e.metaKey && !e.ctrlKey){ e.preventDefault(); if (!el.next.disabled) nextFrame(); return; }
    if (e.key === "ArrowLeft" && !e.altKey && !e.metaKey && !e.ctrlKey){ e.preventDefault(); if (!el.prev.disabled) prevFrame(); return; }
  });

  return {el, renderBoard, renderStepUI, renderReadout, renderView, reset, goStep, playAll, nextFrame, prevFrame, stopAnim};
}

/* Works offline after the first visit (see sw.js). Not on file:// or very old browsers, and that's fine. */
function registerServiceWorker(){
  if ("serviceWorker" in navigator && location.protocol !== "file:"){
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
}

/* copy text, with a fallback for browsers without the clipboard API */
async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; } catch (e){}
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e){}
  ta.remove(); return ok;
}

Object.assign(P, {createViewer, toast, registerServiceWorker, copyText});
})();
