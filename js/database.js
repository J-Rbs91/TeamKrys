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

  /* Repli mémoire si IndexedDB est indisponible (navigation privée, fenêtre
   * in-app d'une messagerie, protection renforcée contre le pistage…). */
  var memory = { available: true, reason: null, seq: 0, queue: [], meta: {} };

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
      memory.reason = (error && error.message) || "IndexedDB indisponible";
      return null;
    });
    return dbPromise;
  }

  DB.open = function () { return openDatabase(); };

  DB.isPersistent = function () { return memory.available; };

  /* ------------------------------------------------- Durabilité du stockage --- */

  /* « Disponible » et « durable » sont deux choses différentes, et `isPersistent`
   * ci-dessus ne mesure que la première — d'où un diagnostic qui affichait
   * « IndexedDB » là où l'utilisateur lisait une promesse qui n'était pas faite.
   *
   * Le mode par défaut est « au mieux » : sous pression de stockage, une origine est
   * évincée EN ENTIER, d'un coup, et sans le dire. La file d'actions en attente part
   * avec. La persistance, quand elle est accordée, exempte de cette éviction.
   *
   * ⚠️ Elle se DEMANDE, et le refus est le cas normal : les moteurs décident seuls,
   * souvent sur l'historique de fréquentation du site. Rien ne doit donc promettre
   * « enregistré » : ce garde-fou réduit un risque, il ne le supprime pas. */
  var durability = "inconnue";
  var askedPersistence = false;

  DB.durability = function () { return durability; };

  function hasStorageManager() {
    return typeof navigator !== "undefined" && !!navigator.storage;
  }

  function readDurability() {
    if (!hasStorageManager() || !navigator.storage.persisted) { return; }
    navigator.storage.persisted().then(function (granted) {
      durability = granted ? "durable" : "évinçable";
    }, function () { /* refus de répondre : on n'en sait pas plus qu'avant */ });
  }

  /* ⚠️ Appelée au moment où une action non synchronisée vient d'entrer dans la file,
   * donc depuis le geste qui l'a créée — et NON au démarrage. Une demande faite au
   * chargement est refusée sans que personne ne le sache, ou présentée hors contexte
   * à qui devrait y consentir : un mauvais moment brûle la demande. Une seule fois
   * par chargement. */
  DB.requestPersistence = function () {
    if (askedPersistence) { return; }
    askedPersistence = true;
    if (!hasStorageManager() || !navigator.storage.persist) { return; }
    try {
      navigator.storage.persist().then(function (granted) {
        durability = granted ? "durable" : "évinçable";
      }, function () { /* refusé ou impossible : l'état reste ce qu'il était */ });
    } catch (error) { /* contexte non sécurisé, ou hors d'un document */ }
  };

  readDurability();

  DB.unavailableReason = function () { return memory.reason; };

  /* Les deux branches (IndexedDB et repli mémoire) doivent rendre EXACTEMENT la
   * même forme. Chaque `work` renvoie une boîte { value: … } — parce qu'en
   * IndexedDB la valeur n'est connue qu'à la fin de la transaction — et c'est
   * ce déballage commun qui la sort de sa boîte. */
  function unwrap(result) {
    return result && result.value !== undefined ? result.value : result;
  }

  function withStore(storeName, mode, work) {
    return openDatabase().then(function (db) {
      /* ⚠️ Le déballage vaut AUSSI pour le repli mémoire. Sans lui, DB.enqueue
       * rendait { value: { seq, action } } au lieu de { seq, action } : « saved.seq »
       * valait undefined, l'entrée restait marquée « pas encore prête » et
       * l'action n'était JAMAIS envoyée au serveur — le message s'affichait chez
       * son auteur et n'arrivait chez personne. Même piège pour DB.queued (file
       * perdue au démarrage) et DB.loadState (état local lu comme vide). */
      if (!db) { return unwrap(work(null)); }
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        var result;
        try { result = work(store); } catch (e) { reject(e); return; }
        /* On attend la FIN de la transaction : une clé auto-incrémentée n'est
         * réellement acquise qu'à ce moment (sinon action orpheline). */
        tx.oncomplete = function () { resolve(unwrap(result)); };
        tx.onerror = function () { reject(tx.error || new Error("Transaction IndexedDB échouée")); };
        tx.onabort = function () { reject(tx.error || new Error("Transaction IndexedDB annulée")); };
      });
    });
  }

  /* --------------------------------------------------------- File d'actions --- */

  /* Ajoute une action et ne résout QU'APRÈS attribution définitive de la clé. */
  DB.enqueue = function (action) {
    /* Une écriture non répliquée vient d'être créée : c'est le seul moment où il est
     * juste de demander à ne pas être évincé. */
    DB.requestPersistence();
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
