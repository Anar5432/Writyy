// Service Worker for 100% Offline PWA, Studio Audio & Over-the-Air Auto-Updates
const CACHE_NAME = 'writyy-v13-awl-sublist-review-repetition';
const AUDIO_CACHE = 'writyy-audio-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Pre-cache core assets and discover production bundled scripts/styles
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Add core shell files
      await cache.addAll(CORE_ASSETS);

      // 2. Discover and pre-cache compiled JS and CSS bundles
      try {
        const response = await fetch('/index.html', { cache: 'no-cache' });
        if (response.ok) {
          const html = await response.text();
          const bundleUrls = [];
          
          // Match /assets/...js and /assets/...css
          const jsMatches = html.matchAll(/src=["'](\/assets\/[^"']+\.js)["']/g);
          for (const m of jsMatches) bundleUrls.push(m[1]);

          const cssMatches = html.matchAll(/href=["'](\/assets\/[^"']+\.css)["']/g);
          for (const m of cssMatches) bundleUrls.push(m[1]);

          if (bundleUrls.length > 0) {
            console.log('[SW] Pre-caching production bundles:', bundleUrls);
            await cache.addAll(bundleUrls);
          }
        }
      } catch (err) {
        console.warn('[SW] Bundle pre-cache notice:', err);
      }
    })
  );
});

// Listen for manual update trigger (user taps "Update Now" in the app banner)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received, activating new version immediately...');
    self.skipWaiting();
  }
});

// Take control of all pages immediately and purge older caches (preserves AUDIO_CACHE)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== AUDIO_CACHE) {
            console.log('[SW] Purging old cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 100% Offline Fetch Handling with Background Auto-Sync
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Audio Requests (Youdao dictionary voice, Google TTS, gstatic)
  // Cache-First strategy: Plays in 0ms offline directly from Cache Storage!
  if (
    url.hostname.includes('youdao.com') || 
    url.hostname.includes('translate.google.com') || 
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (audioCache) => {
        const cached = (await audioCache.match(event.request.url)) ||
                       (await audioCache.match(event.request, { ignoreVary: true })) ||
                       (await audioCache.match(event.request));
        if (cached) return cached;

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            audioCache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cached;
        }
      })
    );
    return;
  }

  // 2. App Navigation Requests (e.g. user opens the app or taps home screen icon)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      }).catch(() => {
        // 100% OFFLINE: Return cached index.html or root
        return caches.match('/index.html').then((cached) => {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }

  // 3. Static Assets (JS, CSS, Images, Icons, Fonts)
  // Cache-First with Network Revalidation (instant 0ms loading + background update)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline: silently ignore network error, cachedResponse is used
      });

      return cachedResponse || fetchPromise;
    })
  );
});
