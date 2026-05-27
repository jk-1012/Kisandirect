/* Service Worker (Workbox) — offline support + asset caching tuned for 2G */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// Pre-cache app shell
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// Strategy 1: API responses — NetworkFirst (fresh data > offline cache)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/listings/search'),
  new NetworkFirst({
    cacheName: 'api-listings',
    networkTimeoutSeconds: 10,  // 10s timeout for 2G
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 60 }), // 30 min
    ],
  })
);

// Strategy 2: Mandi price data — StaleWhileRevalidate
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/prices/mandi'),
  new StaleWhileRevalidate({
    cacheName: 'mandi-prices',
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 4 * 60 * 60 }), // 4 hours
    ],
  })
);

// Strategy 3: CDN images — CacheFirst (thumbnails don't change)
registerRoute(
  ({ url }) => url.hostname === 'cdn.kisandirect.in',
  new CacheFirst({
    cacheName: 'cdn-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Background sync for offline offer submission
const bgSync = new BackgroundSyncPlugin('offline-offers', { maxRetentionTime: 24 * 60 });
registerRoute(
  ({ url }) => url.pathname.includes('/offers'),
  new NetworkFirst({ plugins: [bgSync] }),
  'POST'
);

// Offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
  }
});
