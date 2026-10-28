/* Auto-publish for the editor: saves plays.json straight to the GitHub repo, which redeploys the team site.
   It uses a GitHub key that can only change this repo. The key is saved in this browser only, never on the site.
   "base" is a fingerprint of the team's plays the last time this browser was in step with them. If the repo's
   plays.json no longer matches it, someone published from another device (or uploaded the file), and the editor
   stops instead of overwriting their plays. */
(() => {
"use strict";
const REPO = {owner: "Bball4ever", repo: "Lions-Basketball-Playbook", branch: "main", path: "plays.json"};
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${REPO.path}`;
const KEY_KEY = "playbook-github-key", BASE_KEY = "playbook-published-base";

function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }
function lsSet(k, v){ try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e){ return false; } }

/* a short fingerprint of the plays in a plays.json file, ignoring when it was exported */
function fingerprint(text){
  let o; try { o = JSON.parse(text); } catch (e){ return "unreadable"; }
  if (o && typeof o === "object") delete o.exportedAt;
  const s = JSON.stringify(o);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
function toBase64(text){
  const b = new TextEncoder().encode(text); let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromBase64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));

/* kind: offline | key | access | moved | github */
class PublishError extends Error { constructor(kind, message){ super(message); this.kind = kind; } }

async function gh(key, method, body){
  let res;
  try {
    res = await fetch(method === "GET" ? `${API}?ref=${REPO.branch}` : API, {
      method, cache: "no-store",
      headers: Object.assign({Accept: "application/vnd.github+json", Authorization: `Bearer ${key}`, "X-GitHub-Api-Version": "2022-11-28"},
        body ? {"Content-Type": "application/json"} : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e){ throw new PublishError("offline", "Couldn't reach GitHub. It will try again when you're back online."); }
  if (res.ok) return res.json();
  if (res.status === 401) throw new PublishError("key", "GitHub didn't accept the key. It may have expired. Turn auto-publish off and on again with a new key.");
  if (res.status === 403 || res.status === 404) throw new PublishError("access", "The key can't change this repo. Make a key for Lions-Basketball-Playbook with Contents set to Read and write.");
  if (res.status === 409) throw new PublishError("moved", "The team's plays changed while publishing.");
  throw new PublishError("github", `GitHub had a problem (error ${res.status}). It will try again with your next change.`);
}
/* the repo's plays.json right now: {sha, text} */
async function readRemote(key){
  const r = await gh(key, "GET");
  return {sha: r.sha, text: fromBase64(r.content || "")};
}
async function writeRemote(key, text, sha, message){
  return gh(key, "PUT", {message, content: toBase64(text), sha, branch: REPO.branch});
}

window.Playbook.publisher = {
  REPO, fingerprint, readRemote, writeRemote, PublishError,
  getKey: () => lsGet(KEY_KEY), setKey: k => lsSet(KEY_KEY, k),
  getBase: () => lsGet(BASE_KEY), setBase: fp => lsSet(BASE_KEY, fp)
};
})();
