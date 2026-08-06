/* BrainstO. — service worker.
 *
 * ⚠️ Incrémenter CACHE_VERSION EN MÊME TEMPS que CONFIG.APP_VERSION (js/config.js).
 * Règles :
 *  - la coquille statique est précachée puis servie en cache-first ;
 *  - la navigation est servie en network-first (repli sur la coquille) ;
 *  - les appels à l'API (autre origine) ne sont JAMAIS mis en cache ;
 *  - IndexedDB n'est jamais touchée par le service worker.
 */
var CACHE_VERSION = "brainsto-v1.6.1";

var SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/config.js",
  "js/utils.js",
  "js/state.js",
  "js/database.js",
  "js/api.js",
  "js/sync.js",
  "js/ui.js",
  "js/app.js",
  "assets/icons/icon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  /* ⚠️ SANS skipWaiting, une version publiée n'atteint JAMAIS un appareil déjà
   * équipé tant que personne ne touche la bannière : le nouveau service worker
   * s'installe puis reste en attente, pendant que l'ancien continue de servir
   * la coquille depuis SON cache. Recharger la page n'y change rien — c'est
   * même le symptôme classique : « j'ai rechargé, le correctif n'est pas là ».
   *
   * On active donc la nouvelle version dès qu'elle est prête. La page ouverte
   * n'est PAS rechargée de force (voir registerServiceWorker dans js/app.js) :
   * elle continue avec le code qu'elle a déjà chargé, et le rechargement
   * suivant exécute la nouvelle version. La bannière garde son rôle : proposer
   * ce rechargement tout de suite. */
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      /* addAll échoue en bloc si une ressource manque : on tolère les absences. */
      return Promise.all(SHELL.map(function (path) {
        return cache.add(new Request(path, { cache: "reload" })).catch(function () { return null; });
      }));
    })
  );
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

  /* Appels API (Google Apps Script) : jamais interceptés, jamais mis en cache. */
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
