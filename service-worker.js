/* BrainstO. — service worker.
 *
 * ⚠️ Incrémenter CACHE_VERSION EN MÊME TEMPS que CONFIG.APP_VERSION (js/config.js).
 * Règles :
 *  - la coquille statique est précachée puis servie en cache-first ;
 *  - la navigation vers l'application est servie par la coquille du cache
 *    VERSIONNÉ, comme les scripts (réseau seulement si elle manque) ;
 *  - les appels à l'API (autre origine) ne sont JAMAIS mis en cache ;
 *  - IndexedDB n'est jamais touchée par le service worker.
 */
var CACHE_VERSION = "brainsto-v1.18.1";
/* Synthèse automatique de Pandore : publiée par l'IA dans le dépôt, elle change SANS nouvelle version de
 * l'application. Réseau d'abord ; la dernière copie reçue sert hors ligne, dans un cache à part qui survit aux mises
 * à jour (il ne contient que ce fichier, public). L'ancien cache « brainsto-idees-v1 » est purgé comme les autres. */
var PANDORE_CACHE = "brainsto-pandore-v1";

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
        /* ⚠️ Seulement NOS anciens caches : sur GitHub Pages, les sites d'un même
         * compte partagent l'origine, donc le CacheStorage. */
        return key.indexOf("brainsto-") === 0 && key !== CACHE_VERSION && key !== PANDORE_CACHE ? caches.delete(key) : null;
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

/* La page de l'application : racine de la portée ou index.html, avec ou sans
 * paramètres (un lien partagé en porte parfois, p. ex. ?fbclid=). */
function isPandoreFeed(url) {
  return url.pathname === new URL("pandore/synthese.json", self.location.href).pathname;
}

function isAppPage(url) {
  var root = new URL("./", self.location.href).pathname;
  return url.pathname === root || url.pathname === root + "index.html";
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") { return; }

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  if (!isShellRequest(url)) { return; }

  if (isPandoreFeed(url)) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(PANDORE_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function (error) {
        return caches.open(PANDORE_CACHE).then(function (cache) { return cache.match(request); }).then(function (cached) {
          if (cached) { return cached; }
          throw error;
        });
      })
    );
    return;
  }

  if (request.mode === "navigate" && isAppPage(url)) {
    /* ⚠️ Coquille d'abord, et depuis le cache VERSIONNÉ (SPEC §24) : l'application
     * démarre tout de suite sur un réseau connecté mais muet ou une page d'erreur
     * (503), et son HTML vient toujours du même cache que ses scripts (jamais un
     * index.html neuf avec des scripts anciens). Une nouvelle version arrive par
     * le cycle de mise à jour du service worker (bandeau « Mettre à jour »).
     * Réseau seulement si la coquille manque ; rien n'est mis en cache ici. */
    event.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return cache.match("index.html").then(function (cached) {
          return cached || cache.match("./");
        });
      }).then(function (cached) {
        return cached || fetch(request);
      })
    );
    return;
  }

  /* Autre page de la portée (un document du dépôt) : réseau d'abord, comme avant. */
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

  /* Même cache versionné que la coquille : jamais un script d'une autre version. */
  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) { return cache.match(request); }).then(function (cached) {
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
