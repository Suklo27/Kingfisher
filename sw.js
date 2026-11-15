// Lets the installed app open without internet.
// When you publish a new version, change VERSION so phones replace their saved copy.
// Guest data is never stored here: it stays in the app's own storage on the phone.
const VERSION = 'kingfisher-2026-11-15';
const CORE = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon.svg'];

// Saves the app and the code files its page loads, so it opens offline from the first install.
async function saveApp() {
  const cache = await caches.open(VERSION);
  await Promise.all(CORE.map((url) => cache.add(url).catch(() => undefined)));
  try {
    const page = await cache.match('./');
    if (!page) return;
    const html = await page.text();
    const files = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]).filter((url) => !/^https?:/.test(url));
    await Promise.all(files.map((url) => cache.add(url).catch(() => undefined)));
  } catch {
    // The app still works online.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(saveApp().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  if (request.mode === 'navigate') {
    // The newest app when online, the saved copy when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put('./', copy));
          }
          return response;
        })
        .catch(() => caches.match('./').then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (response.ok || response.type === 'opaque') {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          // Offline and not saved yet, such as the web fonts: the app uses its backup fonts.
          .catch(() => new Response('', { status: 504, statusText: 'Offline' })),
    ),
  );
});
