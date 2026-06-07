// Service worker Emama Group — stratégie:
//   - Pages HTML : network-first (toujours frais, fallback cache puis offline)
//   - Assets static (_next, images, fonts) : stale-while-revalidate
//   - API : network-only (jamais en cache pour éviter les données obsolètes)

const VERSION = 'v1';
const STATIC_CACHE = `emama-static-${VERSION}`;
const RUNTIME_CACHE = `emama-runtime-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/offline.html',
  '/emama-favorie.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isNavigationRequest(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API : network-only, jamais en cache.
  if (url.pathname.startsWith('/api/')) return;

  // Pages HTML : network-first.
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Assets (next, images, fonts) : stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
