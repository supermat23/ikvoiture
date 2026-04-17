/**
 * Service Worker pour IKtracker Pro
 * Compatible GitHub Pages - Gestion des chemins relatifs
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `iktracker-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `iktracker-dynamic-${CACHE_VERSION}`;

// Assets à précacher (chemins relatifs pour GitHub Pages)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './js/ik-calculator.js',
  './js/pdf-generator.js',
  './js/app.js',
];

// Installation: précacher les assets critiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('📦 Précaching des assets...');
        return cache.addAll(PRECACHE_ASSETS.map(url => {
          // Gérer les erreurs 404 pour les assets optionnels
          return fetch(url).catch(() => {});
        }));
      })
      .then(() => self.skipWaiting())
  );
});

// Activation: nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('iktracker-') && !name.includes(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: stratégies de cache intelligentes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Navigation: Network First avec fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  
  // Assets statiques (JS, CSS, images): Cache First
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Cloner pour mettre en cache
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }
  
  // API externes: Network First avec timeout
  if (url.hostname.includes('api') || url.hostname.includes('maps')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Fallback: retourner réponse vide ou message d'erreur
          return new Response(JSON.stringify({ offline: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // Par défaut: Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => cached);
      
      return cached || fetchPromise;
    })
  );
});

// Gestion des messages depuis le client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      })
    );
  }
});

// Fallback hors-ligne global
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('./offline.html');
      })
    );
  }
});