// Service Worker for Train Live PWA
// Features: offline caching, background sync, app shell caching

const CACHE_NAME = 'trainlive-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network first, cache fallback
  if (url.pathname.includes('.netlify/functions/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached response if available
          return caches.match(event.request).then((cached) => {
            if (cached) {
              return cached;
            }
            return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
    );
    return;
  }

  // Static assets: cache first, network fallback
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

// Background sync for pending operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-ops') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SYNC_PENDING' }));
      })
    );
  }
});
