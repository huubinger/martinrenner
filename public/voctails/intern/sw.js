'use strict';
// Voctails Intern – Service Worker
// App-Shell: network-first (Updates kommen sofort an), Fallback auf Cache.
// Übe-Tracks, Noten und Wellenformen: aus dem Offline-Speicher (inkl. Range-Requests zum Spulen), sonst Netzwerk.
const SHELL = 'vt-shell-v2';
const MEDIA = 'vt-media-v1';
const BASE = '/voctails/intern/';
const ASSETS = [BASE, BASE + 'app.js', BASE + 'noten.js', BASE + 'app.css', BASE + 'manifest.webmanifest', BASE + 'icon-192.png', BASE + 'apple-touch-icon.png', '/voctails/img/logo-weiss.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vt-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function mediaResponse(req) {
  const cached = await (await caches.open(MEDIA)).match(req.url, { ignoreSearch: true });
  if (!cached) return fetch(req);
  const type = cached.headers.get('Content-Type') || 'audio/mpeg';
  if (!type.startsWith('audio/')) return cached; // PDF, Wellenform
  const range = req.headers.get('range');
  const blob = await cached.blob();
  const size = blob.size;
  if (!range) {
    return new Response(blob, { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start, end;
  if (!m || (m[1] === '' && m[2] === '')) { start = 0; end = size - 1; }
  else if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok && req.method === 'GET') cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match(BASE) : null);
    return hit || new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith(BASE + 'file/') || url.pathname.startsWith(BASE + 'peaks/')) {
    e.respondWith(mediaResponse(req));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // Bibliothek speichert die App selbst
  // App, Chorleiter-Notizen (zuletzt geladener Stand bleibt offline verfügbar) und PDF.js für die Noten
  if (url.pathname.startsWith(BASE) || url.pathname.startsWith('/vendor/pdfjs/') || url.pathname === '/voctails/img/logo-weiss.png') e.respondWith(networkFirst(req));
});
