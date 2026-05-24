self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open('kd-static-v1'));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || fetch(event.request))
  );
});
