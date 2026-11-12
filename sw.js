/* Service worker: lets the site open and play saved recitations without internet. */
const APP = "qtm-app-v2", AUD = "qtm-audio-v1";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => Promise.all(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./img/portrait.webp", "./img/door-ramadan.jpg", "./img/door-fard.jpg"].map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== AUD).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function page(req) {
  const c = await caches.open(APP);
  try { const res = await fetch(req); if (res && res.ok && req.mode === "navigate" && /\/(index\.html)?$/.test(new URL(req.url).pathname)) c.put("./index.html", res.clone());   /* only the app page itself is the offline fallback, never stats.html */ return res; }
  catch { return (await c.match("./index.html")) || (await c.match("./")) || Response.error(); }
}
async function audio(req) {
  const c = await caches.open(AUD), hit = await c.match(req.url);
  if (!hit) return fetch(req);
  const blob = await hit.blob(), size = blob.size, type = hit.headers.get("content-type") || "audio/mpeg", range = req.headers.get("range");
  if (!range) return new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  const m = /bytes=(\d*)-(\d*)/.exec(range); let s = m && m[1] ? +m[1] : 0, e = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { s = Math.max(0, size - +m[2]); e = size - 1; }
  e = Math.min(e, size - 1);
  if (s > e) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  return new Response(blob.slice(s, e + 1), { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${s}-${e}/${size}`, "Content-Length": String(e - s + 1), "Accept-Ranges": "bytes" } });
}
/* Only files saved for offline go through here. Anything else streams straight from its host:
   passing a streamed video through the worker breaks it when the file's index sits at its end. */
let SAVED = null;
function loadSaved() { return caches.open(AUD).then(c => c.keys()).then(ks => { SAVED = new Set(ks.map(k => k.url)); }).catch(() => {}); }
loadSaved();
self.addEventListener("message", e => { if (e.data === "saved-changed") loadSaved(); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") { e.respondWith(page(req)); return; }
  if (!/\.(mp3|mp4|m4a)$/i.test(url.pathname)) return;
  if (!SAVED || SAVED.has(req.url) || !self.navigator.onLine) e.respondWith(audio(req));
  else e.waitUntil(loadSaved());
});
