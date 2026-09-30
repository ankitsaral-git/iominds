/* IOMinds.ai service worker — offline caching
   Bump CACHE_VERSION whenever the precached shell changes to force an update. */
const CACHE_VERSION = 'iominds-v5';
const PRECACHE = `${CACHE_VERSION}-precache`;
const RUNTIME = `${CACHE_VERSION}-runtime`;

/* Base path this SW controls (e.g. '/iominds/' or '/'), derived from its own URL
   so the site works at a domain root or a subpath without edits. */
const BASE = new URL('./', self.location).pathname;

/* App shell: the files needed to render the page offline (relative to BASE). */
const PRECACHE_URLS = [
  './',
  'index.html',
  'site.webmanifest',
  'favicon.ico',
  'assets/icons/favicon-16x16.png',
  'assets/icons/favicon-32x32.png',
  'assets/icons/favicon-48x48.png',
  'assets/icons/favicon-180x180.png',
  'assets/logo-mark.png',
  'assets/logo-light.png',
  'assets/logo-dark.png',
  'assets/og-card.jpg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
];

/* Install: precache the shell. Individual failures don't abort the install. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

/* Activate: drop caches from older versions. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* Allow the page to trigger an immediate update. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  /* Only handle GET; let the browser deal with everything else. */
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isGoogleFonts =
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com';

  /* Skip cross-origin requests except Google Fonts (used for the site's type). */
  if (url.origin !== self.location.origin && !isGoogleFonts) return;

  /* Navigations: network-first, fall back to cached index.html when offline. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(BASE + 'index.html'))
        )
    );
    return;
  }

  /* Static assets + fonts: cache-first, then network, caching the result. */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          /* Cache successful basic/CORS responses (opaque font responses too). */
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
