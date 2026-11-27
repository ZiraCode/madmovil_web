/* madmovil service worker — offline parcial
   API del backend (hardcodeada, actualizar si cambia el dominio): siempre red
   CSP: _headers sirve la CSP sobre este script y esa política gobierna los fetch()
   del propio SW — todo origen cruzado que se fetchee aquí debe estar en connect-src
   de _headers y middleware (las fuentes son self-hosted desde 2026-09-06: ya no
   quedan fetches cross-origin en este SW) */
const API_ORIGIN = 'https://api.madmovil.es';
const VERSION = 'v6';
const STATIC_CACHE = `madmovil-static-${VERSION}`;
const RUNTIME_CACHE = `madmovil-runtime-${VERSION}`;
// Con barra final, como las reglas de _headers: Workers Assets sirve /offline/ y responde
// 307 a /offline — la respuesta redirigida rompe respondWith() en navegaciones (redirect: manual)
const PRECACHE = [
  '/offline/',
  '/en/offline/',
  '/favicon.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Fallback offline locale-aware: /en/* cae en la página EN, el resto en la ES
function offlineFallback(pathname) {
  return pathname === '/en' || pathname.startsWith('/en/') ? '/en/offline/' : '/offline/';
}

// Tope de entradas de la runtime cache: al guardar una nueva se borran las más antiguas
// (cache.keys() llega en orden de inserción) para que no crezca sin límite
const RUNTIME_MAX_ENTRIES = 60;

function trimRuntimeCache(cache) {
  return cache.keys().then((keys) => {
    const excess = keys.length - RUNTIME_MAX_ENTRIES;
    if (excess <= 0) return;
    return Promise.all(keys.slice(0, excess).map((request) => cache.delete(request)));
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Tiempo real: nunca cachear
  if (url.origin === API_ORIGIN) return;

  // Navegación: red primero, fallback a copia cacheada o página offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Solo 200: un 404/429/502 cacheado se serviría luego offline como si fuera contenido
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(request, copy).then(() => trimRuntimeCache(cache)));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(offlineFallback(url.pathname)))
        )
    );
    return;
  }

  // Assets del build (con hash) y fuentes self-hosted (/fonts/*, inmutables vía ?v=): cache-first
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/fonts/'))
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Todo lo demás (tiles OSM, etc.): red
});
