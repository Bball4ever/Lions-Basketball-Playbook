/* Team view: loads plays.json, lists the plays by type and shows one at a time, view only.
   The open play is in the address as #play=<id>, so the phone's back button returns to the list. */
(() => {
"use strict";
const P = window.Playbook;
const $ = s => document.querySelector(s);
const el = {
  side: $("#side"), main: $("#main"), groups: $("#groups"), count: $("#count"), msg: $("#list-msg"),
  back: $("#back-to-list"), title: $("#play-title"), sub: $("#play-sub"), note: $("#play-note"), hint: $("#hint"),
  shareBtn: $("#share-btn"), share: $("#share"), qr: $("#qr"), link: $("#share-link"), copy: $("#copy-link")
};
const wide = window.matchMedia("(min-width: 900px)");
const plays = new Map();   /* id -> play, in list order */
let curId = null;

const S = {};
const viewer = P.createViewer(S, () => plays.get(curId), {renderTools});

function renderTools(){
  el.hint.textContent = S.atEnd ? "That's where everyone ends up. Hit Back to go through it again, or Play all."
    : S.full ? "Full diagram shows every frame at once, numbered. Tap a frame to go through it."
    : "Use Back and Next to go frame by frame, or hit Play all to watch the whole thing.";
}

/* ---------- list ---------- */
function frames(p){ const n = p.steps.length; return `${n} frame${n === 1 ? "" : "s"}`; }
function renderList(){
  const groups = new Map();
  for (const k of P.KINDS) groups.set(k, []);
  for (const [id, p] of plays){ if (!groups.has(p.kind)) groups.set(p.kind, []); groups.get(p.kind).push(id); }
  el.groups.textContent = "";
  for (const [kind, ids] of groups){
    if (!ids.length) continue;
    const sec = document.createElement("section"); sec.className = "group";
    const h = document.createElement("h3"); h.textContent = kind;
    const c = document.createElement("span"); c.className = "count"; c.textContent = `(${ids.length})`; h.append(c);
    const ul = document.createElement("ul"); ul.className = "play-list";
    for (const id of ids){
      const p = plays.get(id);
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "play-item" + (id === curId ? " on" : ""); a.href = "#play=" + encodeURIComponent(id);
      if (id === curId) a.setAttribute("aria-current", "true");
      const n = document.createElement("span"); n.className = "pi-name"; n.textContent = p.name.trim() || "Untitled play";
      const m = document.createElement("span"); m.className = "pi-meta"; m.textContent = frames(p);
      a.append(n, m); li.append(a); ul.append(li);
    }
    sec.append(h, ul); el.groups.append(sec);
  }
  el.count.textContent = plays.size ? `(${plays.size})` : "";
}

/* ---------- the open play ---------- */
function renderPlay(){
  const p = plays.get(curId);
  el.title.textContent = p.name.trim() || "Untitled play";
  el.sub.textContent = `${p.kind} · ${p.court === "full" ? "Full" : "Half"} court · ${frames(p)}`;
  el.note.textContent = p.note.trim(); el.note.hidden = !p.note.trim();
  document.title = `${el.title.textContent} · Lions Playbook`;
  viewer.renderView();
}

/* ---------- routing ---------- */
function hashId(){
  const m = /^#play=(.+)$/.exec(location.hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e){ return null; }
}
function route(){
  if (!plays.size) return;
  let id = hashId();
  if (id !== null && !plays.has(id)) id = null;
  const showList = id === null && !wide.matches;
  if (id === null && wide.matches) id = plays.keys().next().value;
  el.side.hidden = !wide.matches && !showList;
  el.main.hidden = showList;
  if (showList){ viewer.stopAnim(false); curId = null; document.title = "Lions Playbook"; renderList(); return; }
  if (id !== curId){
    const fromList = curId === null;
    curId = id; viewer.reset(); renderList(); renderPlay();
    if (!wide.matches && fromList) window.scrollTo(0, 0);
  } else renderList();
}
window.addEventListener("hashchange", route);
wide.addEventListener("change", route);
el.back.addEventListener("click", () => {
  if (history.state && history.state.fromList) history.back();
  else location.hash = "";
});
el.groups.addEventListener("click", e => {
  const a = e.target.closest("a.play-item"); if (!a) return;
  /* remember the list is one step back, so the All plays button can go back instead of piling up history */
  e.preventDefault();
  if (a.getAttribute("href") === location.hash) return;
  history.pushState({fromList: !wide.matches && hashId() === null}, "", a.getAttribute("href"));
  route();
});
el.main.addEventListener("pointerdown", e => { if (S.anim && e.target.closest("#board")) viewer.stopAnim(); });

/* ---------- share ---------- */
function siteLink(){ return new URL("./", location.href).href; }
el.shareBtn.addEventListener("click", () => {
  const url = siteLink();
  el.link.value = url;
  if (!el.qr.firstChild){
    try {
      const q = window.qrcode(0, "M"); q.addData(url); q.make();
      el.qr.innerHTML = q.createSvgTag({cellSize: 4, margin: 8, scalable: true, alt: "QR code for " + url});
    } catch (e){ el.qr.hidden = true; }
  }
  if (typeof el.share.showModal === "function") el.share.showModal(); else el.share.setAttribute("open", "");
});
el.copy.addEventListener("click", async () => {
  const ok = await P.copyText(el.link.value);
  el.copy.textContent = ok ? "Copied" : "Copy failed";
  setTimeout(() => { el.copy.textContent = "Copy"; }, 1800);
  if (!ok){ el.link.focus(); el.link.select(); }
});
el.link.addEventListener("focus", () => el.link.select());
el.share.addEventListener("click", e => { if (e.target === el.share) el.share.close(); });

/* ---------- start, and new plays while the page is open ---------- */
/* Checks for a new plays.json every minute and whenever the page comes back into view, so plays the coach
   publishes show up without anyone reloading. The play someone is watching only changes if it was edited. */
const CHECK_EVERY = 60000;
const sameFile = (a, b) => (a || "").replace(/"exportedAt":\s*"[^"]*"/, "") === (b || "").replace(/"exportedAt":\s*"[^"]*"/, "");
let lastText = null, checking = false;
function applyPlays(text){
  const entries = P.parsePlaysFile(JSON.parse(text)).map(([id, d]) => [id, P.normalize(d)]).sort(P.byCreated);
  const first = lastText === null;
  const before = curId !== null && plays.has(curId) ? JSON.stringify(plays.get(curId)) : null;
  plays.clear();
  for (const [id, p] of entries) plays.set(id, p);
  lastText = text;
  el.msg.hidden = plays.size > 0;
  if (!plays.size){ el.msg.textContent = "No plays yet."; el.groups.textContent = ""; el.count.textContent = ""; el.main.hidden = true; el.side.hidden = false; curId = null; return; }
  if (first){ route(); return; }
  if (curId === null){ route(); P.toast("The playbook was just updated."); return; }
  if (!plays.has(curId)){ curId = null; route(); P.toast("That play was taken out of the playbook."); return; }
  if (JSON.stringify(plays.get(curId)) !== before){
    viewer.stopAnim(false);
    S.step = Math.min(S.step, plays.get(curId).steps.length - 1); S.full = false; S.atEnd = false; S.sel = null;
    renderList(); renderPlay(); P.toast("This play was just updated.");
  } else { renderList(); P.toast("The playbook was just updated."); }
}
async function check(always = false){
  if (checking || (document.hidden && !always)) return;
  checking = true;
  try {
    const res = await fetch("plays.json", {cache: "no-cache"});
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (lastText === null || !sameFile(text, lastText)) applyPlays(text);
  } catch (e){
    if (lastText === null) el.msg.textContent = "Couldn't load the plays. Check your connection and reload the page.";
  } finally { checking = false; }
}
check(true);
setInterval(check, CHECK_EVERY);
document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
window.addEventListener("focus", () => check());
window.addEventListener("pageshow", e => { if (e.persisted) check(); });
P.registerServiceWorker();
})();
