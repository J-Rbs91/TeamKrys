/* BrainstO. — service worker.
 *
 * ⚠️ Incrémenter CACHE_VERSION EN MÊME TEMPS que CONFIG.APP_VERSION (js/config.js).
 * Règles :
 *  - la coquille statique est précachée puis servie en cache-first ;
 *  - la navigation est servie en network-first (repli sur la coquille) ;
 *  - les appels à l'API (autre origine) ne sont JAMAIS mis en cache ;
 *  - IndexedDB n'est jamais touchée par le service worker.
 */
var CACHE_VERSION = "brainsto-v1.9.0";

/* Deux listes, et la différence n'est pas cosmétique.
 *
 * CRITIQUE : ce sans quoi un démarrage à froid hors ligne échoue. Précaché par un seul
 * `addAll` passé à `waitUntil`, SANS `catch` — donc une ressource manquante fait
 * échouer l'installation. L'ancien service worker reste alors actif avec son cache
 * COMPLET, et l'utilisateur garde une version qui fonctionne.
 *
 * C'est l'inverse de ce que faisait ce fichier : chaque ressource avait son propre
 * `catch`, donc une installation partielle réussissait, puis `activate` purgeait
 * l'ancien cache en entier. Résultat possible : un cache neuf incomplet, plus aucun
 * ancien, et une application blanche au premier démarrage hors ligne — jusqu'au
 * prochain passage en ligne.
 *
 * OPTIONNEL : le manifeste et les icônes. Utiles à l'installation sur l'écran
 * d'accueil, jamais nécessaires au démarrage. Récupérées HORS de `waitUntil`, avec un
 * `catch` par ressource : leur absence ne doit pas priver l'équipe d'une mise à jour.
 *
 * ⚠️ La liste critique doit rester courte et exacte. Une entrée qui renverrait 404 en
 * production bloquerait TOUTES les mises à jour, silencieusement — l'état du worker
 * est donc lisible dans l'écran de diagnostic. */
var SHELL_CRITICAL = [
  "./",
  "index.html",
  "css/app.css",
  "js/config.js",
  "js/utils.js",
  "js/state.js",
  "js/database.js",
  "js/api.js",
  "js/sync.js",
  "js/ui.js",
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
  /* `cache: "reload"` court-circuite le cache HTTP : la coquille précachée est bien la
   * neuve, pas une copie encore fraîche de la précédente. */
  function requests(paths) {
    return paths.map(function (path) { return new Request(path, { cache: "reload" }); });
  }

  /* CRITIQUE — dans waitUntil, sans catch : un échec fait échouer l'installation,
   * l'activation n'a donc pas lieu, et la purge non plus. La complétude du nouveau
   * cache devient STRUCTURELLE au lieu d'être vérifiée après coup. */
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(requests(SHELL_CRITICAL));
    })
  );

  /* OPTIONNEL — hors de waitUntil, donc sans influence sur le sort de
   * l'installation. Un `catch` par ressource : une icône manquante ne doit pas priver
   * l'équipe d'une mise à jour. */
  caches.open(CACHE_VERSION).then(function (cache) {
    return Promise.all(requests(SHELL_OPTIONAL).map(function (request) {
      return cache.add(request).catch(function () { return null; });
    }));
  }).catch(function () { /* rien de critique n'en dépend */ });
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      /* Purge sans condition, et c'est désormais SÛR : `activate` ne se produit que si
       * l'installation a réussi, donc si la coquille critique est complète. */
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
