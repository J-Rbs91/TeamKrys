/* BrainstO. — persistance locale (IndexedDB).
 *
 * Deux magasins :
 *  - « queue » : file d'actions en attente d'envoi, clé « seq » AUTO-INCRÉMENTÉE
 *    (l'ordre d'envoi est donc garanti même après un redémarrage).
 *  - « meta »  : dernier état serveur connu, pour un démarrage hors ligne.
 *
 * Le service worker ne touche JAMAIS à ces données.
 */
(function (root) {
  "use strict";

  var DB_NAME = "brainsto";
  var DB_VERSION = 1;
  var STORE_QUEUE = "queue";
  var STORE_META = "meta";

  var DB = {};
  var dbPromise = null;

  /* Repli mémoire si IndexedDB est indisponible (navigation privée, etc.). */
  var memory = { available: true, seq: 0, queue: [], meta: {} };

  function openDatabase() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error("IndexedDB indisponible")); return; }
      var request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "seq", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Ouverture IndexedDB refusée")); };
      request.onblocked = function () { reject(new Error("IndexedDB bloquée par un autre onglet")); };
    }).catch(function (error) {
      memory.available = false;
      return null;
    });
    return dbPromise;
  }

  DB.open = function () { return openDatabase(); };

  DB.isPersistent = function () { return memory.available; };

  function withStore(storeName, mode, work) {
    return openDatabase().then(function (db) {
      if (!db) { return work(null); }
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        var result;
        try { result = work(store); } catch (e) { reject(e); return; }
        /* On attend la FIN de la transaction : une clé auto-incrémentée n'est
         * réellement acquise qu'à ce moment (sinon action orpheline). */
        tx.oncomplete = function () { resolve(result && result.value !== undefined ? result.value : result); };
        tx.onerror = function () { reject(tx.error || new Error("Transaction IndexedDB échouée")); };
        tx.onabort = function () { reject(tx.error || new Error("Transaction IndexedDB annulée")); };
      });
    });
  }

  /* --------------------------------------------------------- File d'actions --- */

  /* Ajoute une action et ne résout QU'APRÈS attribution définitive de la clé. */
  DB.enqueue = function (action) {
    return withStore(STORE_QUEUE, "readwrite", function (store) {
      if (!store) {
        memory.seq += 1;
        var entry = { seq: memory.seq, action: action };
        memory.queue.push(entry);
        return { value: entry };
      }
      var box = { value: null };
      var request = store.add({ action: action });
      request.onsuccess = function () { box.value = { seq: request.result, action: action }; };
      return box;
    });
  };

  DB.queued = function () {
    return withStore(STORE_QUEUE, "readonly", function (store) {
      if (!store) { return { value: memory.queue.slice() }; }
      var box = { value: [] };
      var request = store.openCursor();
      request.onsuccess = function () {
        var cursor = request.result;
        if (!cursor) { return; }
        box.value.push({ seq: cursor.key, action: cursor.value.action });
        cursor.continue();
      };
      return box;
    });
  };

  DB.dequeue = function (seq) {
    return withStore(STORE_QUEUE, "readwrite", function (store) {
      if (!store) {
        memory.queue = memory.queue.filter(function (e) { return e.seq !== seq; });
        return { value: true };
      }
      store.delete(seq);
      return { value: true };
    });
  };

  DB.clearQueue = function () {
    return withStore(STORE_QUEUE, "readwrite", function (store) {
      if (!store) { memory.queue = []; return { value: true }; }
      store.clear();
      return { value: true };
    });
  };

  /* -------------------------------------------------------------- État --- */

  DB.saveState = function (state) {
    return withStore(STORE_META, "readwrite", function (store) {
      if (!store) { memory.meta.state = state; return { value: true }; }
      store.put({ key: "state", value: state });
      return { value: true };
    });
  };

  DB.loadState = function () {
    return withStore(STORE_META, "readonly", function (store) {
      if (!store) { return { value: memory.meta.state || null }; }
      var box = { value: null };
      var request = store.get("state");
      request.onsuccess = function () { box.value = request.result ? request.result.value : null; };
      return box;
    });
  };

  DB.clearState = function () {
    return withStore(STORE_META, "readwrite", function (store) {
      if (!store) { memory.meta = {}; return { value: true }; }
      store.delete("state");
      return { value: true };
    });
  };

  root.DB = DB;
})(typeof globalThis !== "undefined" ? globalThis : this);
