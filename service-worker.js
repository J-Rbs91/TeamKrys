/* BrainstO. — service worker.
 *
 * ⚠️ Incrémenter CACHE_VERSION EN MÊME TEMPS que CONFIG.APP_VERSION (js/config.js).
 * Règles :
 *  - la coquille statique est précachée puis servie en cache-first ;
 *  - la navigation est servie en network-first (repli sur la coquille) ;
 *  - les appels à l'API (autre origine) ne sont JAMAIS mis en cache ;
 *  - IndexedDB n'est jamais touchée par le service worker.
 */
var CACHE_VERSION = "brainsto-v1.11.0";

var SHELL_CRITICAL = [
  "./",
  "index.html",
  "css/app.css",
  "css/product.css",
  "css/uxer.css",
  "js/config.js",
  "js/utils.js",
  "js/state.js",
  "js/database.js",
  "js/api.js",
  "js/sync.js",
  "js/product-view.js",
  "js/ui.js",
  "js/product-ui.js",
  "js/uxer-ui.js",
  "js/app.js"
];

var SHELL_OPTIONAL = [
  "manifest.webmanifest",
  "assets/icons/icon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png"
];

var SHELL = SHELL_CRITICAL.concat(SHELL_OPTIONAL);

self.addEventListener("install", function (event) {
  function requests(paths) {
    return paths.map(function (path) { return new Request(path, { cache: "reload" }); });
  }

  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(requests(SHELL_CRITICAL));
    })
  );

  caches.open(CACHE_VERSION).then(function (cache) {
    return Promise.all(requests(SHELL_OPTIONAL).map(function (request) {
      return cache.add(request).catch(function () { return null; });
    }));
  }).catch(function () { /* rien de critique n'en dépend */ });
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_VERSION ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") { self.skipWaiting(); }
});

function isShellRequest(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") { return; }

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  if (!isShellRequest(url)) { return; }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match("index.html").then(function (cached) {
          return cached || caches.match("./");
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) { return cached; }
      return fetch(request).then(function (response) {
        if (response && response.status === 200 && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
