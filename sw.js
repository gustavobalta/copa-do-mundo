const CACHE = 'copa2026-v1';

const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo/logo-copa.png',
  '/logo/logo-pin.png',
  '/logo/logo-troca.png',
  '/images/fifa-world.png',
  '/images/coca.png',
  '/images/contra-cap.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// instala e faz cache dos assets estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// remove caches antigas ao ativar
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// estratégia: cache-first para assets locais, network-first para Supabase
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ignora requests não-GET e extensões do Chrome
  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Supabase e APIs externas: network-first, sem cache
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('espn.com') ||
      url.hostname.includes('viacep.com.br') ||
      url.hostname.includes('nominatim.openstreetmap.org')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // tiles do mapa OpenStreetMap: cache-first com fallback
  if (url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // tudo mais (assets locais, CDNs): cache-first, atualiza em background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
