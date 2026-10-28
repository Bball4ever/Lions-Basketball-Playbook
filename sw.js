/* Keeps the playbook working in a gym with bad wifi. Everything is fetched from the network first, so changes
   show up right away. If the network fails or takes more than a few seconds, the copy saved from the last visit
   is used instead. Fonts never change, so those come straight from the saved copy. */
const CACHE = "lions-playbook";
const TIMEOUT_MS = 3500;
const FILES = [
  "./", "index.html", "edit.html", "plays.json", "favicon.svg",
  "css/board.css", "css/team.css", "css/edit.css",
  "js/core.js", "js/draw.js", "js/viewer.js", "js/team.js", "js/editor.js", "vendor/qrcode.js",
  "fonts/barlow-400.woff2", "fonts/barlow-500.woff2", "fonts/barlow-600.woff2", "fonts/barlow-700.woff2",
  "fonts/big-shoulders-display.woff2", "fonts/permanent-marker.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function fromNetwork(req){
  const res = await fetch(req);
  if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
}
async function networkFirst(req){
  const net = fromNetwork(req);
  net.catch(() => {});   /* a late failure after the saved copy was used is fine */
  const slow = new Promise(r => setTimeout(r, TIMEOUT_MS, "slow"));
  try {
    const res = await Promise.race([net, slow]);
    if (res !== "slow") return res;
    const saved = await caches.match(req, {ignoreSearch: true});
    return saved || net;
  } catch (err){
    const saved = await caches.match(req, {ignoreSearch: true});
    if (saved) return saved;
    throw err;
  }
}
async function savedFirst(req){
  return (await caches.match(req)) || fromNetwork(req);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  /* the editor's Reload from site asks for the live file only */
  if (req.cache === "no-store") return;
  e.respondWith(url.pathname.includes("/fonts/") ? savedFirst(req) : networkFirst(req));
});
