// Oberfläche offline verfügbar (die Verbindung zur Box braucht nur Bluetooth, kein Internet)
const CACHE = 'mpa-v1';
const DATEIEN = ['./', 'index.html', 'mpa.css?v=1', 'protokoll.js?v=1', 'mpa.js?v=1', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k.startsWith('mpa-') && k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
// Netz zuerst (Updates kommen sofort an), ohne Netz aus dem Speicher
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const kopie = res.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
