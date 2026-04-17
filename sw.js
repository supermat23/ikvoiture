/**
 * Service Worker pour IKtracker
 * Stratégies de cache optimisées + gestion hors-ligne
 * Basé sur Workbox v7+
 */

// === CONFIGURATION ===
const CACHE_VERSION = 'v2.1.0';
const STATIC_CACHE = `iktracker-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `iktracker-dynamic-${CACHE_VERSION}`;
const API_CACHE = 'iktracker-api';

// Ressources à précacher immédiatement
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon-192-maskable.png',
  '/pwa-icon-512-maskable.png',
  '/offline.html', // Page de secours hors-ligne
  '/styles/main.css', // Si vous avez des CSS séparés
];

// Import de Workbox (via CDN ou build local)
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// === PRÉCACHING ===
workbox.precaching.precacheAndRoute(PRECACHE_ASSETS, {
  cleanupOutdatedCaches: true,
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
});

// === STRATÉGIES DE CACHE ===

// 1. Navigation (pages HTML) - Network First avec fallback cache
workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: STATIC_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// 2. Google Fonts - Cache First
workbox.routing.registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new workbox.strategies.CacheFirst({
    cacheName: 'google-fonts-stylesheets',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 an
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

workbox.routing.registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new workbox.strategies.CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      }),
    ],
  })
);

// 3. Google Maps API - Network First avec timeout
workbox.routing.registerRoute(
  /^https:\/\/maps\.googleapis\.com\/.*/i,
  new workbox.strategies.NetworkFirst({
    cacheName: 'google-maps-api',
    networkTimeoutSeconds: 10,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

// 4. Tiles Google Maps - Cache First (très lourd)
workbox.routing.registerRoute(
  /^https:\/\/.*\.googleapis\.com\/.*maps.*/i,
  new workbox.strategies.CacheFirst({
    cacheName: 'google-maps-tiles',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 jours
      }),
    ],
  })
);

// 5. API Supabase - Network First avec fallback
workbox.routing.registerRoute(
  /^https:\/\/.*\.supabase\.co\/.*/i,
  new workbox.strategies.NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 10,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 24h max pour les données API
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// 6. Images - Cache First
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 90 * 24 * 60 * 60, // 90 jours
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// 7. Assets statiques (JS, CSS, fonts) - Cache First longue durée
workbox.routing.registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font',
  new workbox.strategies.CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// === GESTION HORS-LIGNE ===

// Page de secours quand aucune ressource n'est disponible
workbox.routing.setCatchHandler(({ event }) => {
  switch (event.request.destination) {
    case 'document':
      return caches.match('/offline.html');
    case 'image':
      return caches.match('/pwa-icon-192.png');
    default:
      return Response.error();
  }
});

// === MESSAGES DU CLIENT VERS LE SW ===
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => {
        if (name !== STATIC_CACHE) {
          caches.delete(name);
        }
      });
    });
    event.ports[0].postMessage({ success: true });
  }
});

// === NETTOYAGE DES ANCIENS CACHES ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => 
            name.startsWith('iktracker-') && 
            !name.includes(CACHE_VERSION)
          )
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// === LOGGING EN MODE DEV ===
if (typeof __WB_DISABLE_DEV_LOGS === 'undefined') {
  console.log('🔧 IKtracker Service Worker actif - Version:', CACHE_VERSION);
}