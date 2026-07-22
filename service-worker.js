/**
 * Service worker de TeamKrys.
 *
 * - Précache la "coquille" de l'application (HTML, CSS, JS, icônes).
 * - Sert les fichiers statiques hors connexion (cache d'abord).
 * - Ne met JAMAIS en cache les appels à l'API Apps Script (autre origine).
 * - Ne touche JAMAIS à IndexedDB : les données locales et la file d'actions
 *   sont conservées lors des mises à jour.
 *
 * IMPORTANT : à chaque publication d'une nouvelle version des fichiers,
 * incrémentez CACHE_VERSION (idéalement en accord avec APP_VERSION du
 * frontend) afin que la mise à jour soit détectée.
 */
const CACHE_VERSION = "1.0.0";
const CACHE_NAME = "teamkrys-" + CACHE_VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/config.js",
  "./js/utils.js",
  "./js/state.js",
  "./js/database.js",
  "./js/api.js",
  "./js/sync.js",
  "./js/ui.js",
  "./js/app.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Permet au frontend d'activer immédiatement la nouvelle version.
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (event) {
  const req = event.request;

  // On ne gère que les GET de même origine. Les appels API (script.google.com)
  // passent directement au réseau et ne sont pas mis en cache.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, repli sur l'index en cache (hors connexion).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }

  // Fichiers statiques : cache d'abord, puis réseau (et mise en cache).
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req)
        .then(function (res) {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });
    })
  );
});
