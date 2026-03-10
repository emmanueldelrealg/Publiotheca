// ─── Bibliotheca Service Worker ───────────────────
const CACHE_NAME = 'bibliotheca-v1';

// Recursos externos que cacheamos al instalar
const PRECACHE = [
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600&family=JetBrains+Mono:wght@300;400&display=swap'
];

// ── Install: pre-cachear recursos críticos ─────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear recursos locales (deben funcionar siempre)
      return cache.addAll(['./index.html']).then(() => {
        // Cachear recursos externos (ignorar fallos individuales)
        return Promise.allSettled(
          PRECACHE.filter(u => u.startsWith('http')).map(url =>
            fetch(url, { mode: 'cors' })
              .then(res => res.ok ? cache.put(url, res) : null)
              .catch(() => null)
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: limpiar cachés antiguos ─────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first con fallback a caché ──────
self.addEventListener('fetch', event => {
  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Para navegación (la app en sí): Cache-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached =>
        cached || fetch(event.request)
      )
    );
    return;
  }

  // Para fuentes de Google Fonts: Stale-while-revalidate
  if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.googleapis')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Para CDN (JSZip, PDF.js): Cache-first, luego red
  if (url.hostname.includes('cdnjs') || url.hostname.includes('unpkg')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Todo lo demás: Network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
