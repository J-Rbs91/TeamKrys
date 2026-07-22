/**
 * Stockage local avec IndexedDB.
 *
 * Trois usages :
 *  - "meta"    : paires clé/valeur (profil local, dernière erreur, horodatage…)
 *  - "state"   : dernière version connue des données partagées (cache)
 *  - "actions" : file locale des actions en attente d'envoi au serveur
 *
 * IndexedDB n'est jamais supprimée lors d'une mise à jour de l'application :
 * les données locales et les actions en attente sont conservées.
 */
const DB = (function () {
  const DB_NAME = "teamkrys";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta"); // clé explicite
        }
        if (!db.objectStoreNames.contains("state")) {
          db.createObjectStore("state"); // clé explicite ("current")
        }
        if (!db.objectStoreNames.contains("actions")) {
          // seq auto-incrémenté => ordre de création préservé
          db.createObjectStore("actions", { keyPath: "seq", autoIncrement: true });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return open().then(function (db) {
      return db.transaction(store, mode).objectStore(store);
    });
  }

  function asPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  // --- meta (clé/valeur) ----------------------------------------------------

  function metaGet(key) {
    return tx("meta", "readonly").then(function (s) {
      return asPromise(s.get(key));
    });
  }

  function metaSet(key, value) {
    return tx("meta", "readwrite").then(function (s) {
      return asPromise(s.put(value, key));
    });
  }

  // --- state (cache des données partagées) ---------------------------------

  function loadState() {
    return tx("state", "readonly").then(function (s) {
      return asPromise(s.get("current"));
    });
  }

  function saveState(state) {
    return tx("state", "readwrite").then(function (s) {
      return asPromise(s.put(state, "current"));
    });
  }

  // --- actions (file d'attente) --------------------------------------------

  function enqueueAction(action) {
    return tx("actions", "readwrite").then(function (s) {
      return asPromise(s.add({ actionId: action.actionId, action: action }));
    });
  }

  /** Renvoie les actions en attente, triées par ordre de création (seq). */
  function listActions() {
    return tx("actions", "readonly").then(function (s) {
      return asPromise(s.getAll()).then(function (rows) {
        rows.sort(function (a, b) {
          return a.seq - b.seq;
        });
        return rows;
      });
    });
  }

  function countActions() {
    return tx("actions", "readonly").then(function (s) {
      return asPromise(s.count());
    });
  }

  function removeAction(seq) {
    return tx("actions", "readwrite").then(function (s) {
      return asPromise(s.delete(seq));
    });
  }

  return {
    metaGet: metaGet,
    metaSet: metaSet,
    loadState: loadState,
    saveState: saveState,
    enqueueAction: enqueueAction,
    listActions: listActions,
    countActions: countActions,
    removeAction: removeAction,
  };
})();
