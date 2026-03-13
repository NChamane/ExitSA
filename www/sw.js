// ExitSA Service Worker — offline-first caching
// Covers: app shell, placehold.co images, graceful API fallbacks

const CACHE_NAME = 'exitsa-v1';

// App shell — cached immediately on install
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg'
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// ─── FETCH ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', function(e) {
  var req = e.request;
  var url;
  try { url = new URL(req.url); } catch(err) { return; }

  // ── App shell (index.html) ─────────────────────────────────────────────────
  // Strategy: cache-first, refresh in background (stale-while-revalidate)
  if (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(req).then(function(cached) {
          var networkReq = fetch(req).then(function(res) {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(function() { return null; });
          return cached || networkReq;
        });
      })
    );
    return;
  }

  // ── Manifest + icon ───────────────────────────────────────────────────────
  if (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('/icon.svg')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(req).then(function(cached) {
          if (cached) return cached;
          return fetch(req).then(function(res) {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // ── placehold.co images ───────────────────────────────────────────────────
  // Strategy: cache-first. On miss, fetch and cache.
  // On network failure, return an inline SVG placeholder in the same colours.
  if (url.hostname === 'placehold.co') {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(req).then(function(cached) {
          if (cached) return cached;
          return fetch(req).then(function(res) {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(function() {
            return makeSVGPlaceholder(url);
          });
        });
      })
    );
    return;
  }

  // ── Nominatim geocoding ───────────────────────────────────────────────────
  // Network-only. On failure return a structured offline error so the app
  // can show a helpful message instead of crashing.
  if (url.hostname === 'nominatim.openstreetmap.org') {
    e.respondWith(
      fetch(req).catch(function() {
        return new Response(
          JSON.stringify([]),   // empty array = "place not found" in app logic
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // ── OSRM routing ─────────────────────────────────────────────────────────
  // Network-only. On failure return a 503 so the app's .catch() handler fires.
  if (url.hostname === 'router.project-osrm.org') {
    e.respondWith(
      fetch(req).catch(function() {
        return new Response(
          JSON.stringify({ code: 'Error', message: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // ── Everything else ───────────────────────────────────────────────────────
  // Network-first, cache as backup.
  e.respondWith(
    fetch(req).then(function(res) {
      if (res && res.ok) {
        caches.open(CACHE_NAME).then(function(cache) { cache.put(req, res.clone()); });
      }
      return res;
    }).catch(function() {
      return caches.match(req);
    })
  );
});

// ─── SVG PLACEHOLDER GENERATOR ───────────────────────────────────────────────
// Reproduces the same warm-palette placeholder that placehold.co would serve,
// without any network request.

function makeSVGPlaceholder(url) {
  var m    = url.pathname.match(/\/(\d+)x(\d+)\/([0-9A-Fa-f]{6})\/([0-9A-Fa-f]{6})/);
  var w    = m ? parseInt(m[1]) : 800;
  var h    = m ? parseInt(m[2]) : 360;
  var bg   = m ? m[3] : 'FAE8D3';
  var fg   = m ? m[4] : 'C1440E';
  var raw  = url.searchParams.get('text') || 'ExitSA';
  var txt  = decodeURIComponent(raw).replace(/\+/g, ' ').substring(0, 50);
  var fs   = Math.min(Math.floor(w / 16), 32);

  var svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">',
    '  <rect width="' + w + '" height="' + h + '" fill="#' + bg + '"/>',
    '  <text x="' + (w / 2) + '" y="' + (h / 2) + '"',
    '    font-family="system-ui,sans-serif" font-size="' + fs + '" font-weight="600"',
    '    fill="#' + fg + '" text-anchor="middle" dominant-baseline="middle">',
    '    ' + txt.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    '  </text>',
    '</svg>'
  ].join('\n');

  return new Response(svg, {
    status:  200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
  });
}
