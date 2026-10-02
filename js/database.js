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
  /* ⚠️ Une ouverture peut ne JAMAIS répondre (iOS 14.6 au premier chargement,
   * certaines vues intégrées) : sans borne, le démarrage l'attendait et l'écran
   * restait blanc. Passé ce délai : repli mémoire, et Sync retente à chaque cycle. */
  var OPEN_TIMEOUT_MS = 5000;

  var DB = {};
  var dbPromise = null;
  var current = null;        // connexion vivante tenue par dbPromise
  var stalled = null;        // ouverture partie hors délai, peut-être encore en cours
  var reopening = null;

  /* Repli mémoire si IndexedDB est indisponible (navigation privée, fenêtre
   * in-app d'une messagerie, protection renforcée contre le pistage…). */
  var memory = { available: true, reason: null, seq: 0, queue: [], meta: {} };

  function hasIndexedDB() {
    try { return !!root.indexedDB; } catch (e) { return false; }
  }

  /* Le système peut fermer la connexion (arrière-plan iOS, stockage effacé), ou
   * une autre version la réclamer : on la ferme et on l'oublie. La prochaine
   * opération en rouvre une au lieu de buter indéfiniment sur une morte. */
  function forget(db) {
    try { db.close(); } catch (e) { /* déjà fermée */ }
    if (current === db) { current = null; dbPromise = null; }
  }

  /* UN essai d'ouverture, borné dans le temps. Ne rejette jamais : rend la
   * connexion, ou null (repli mémoire, raison notée). */
  function attempt() {
    return new Promise(function (resolve, reject) {
      if (!hasIndexedDB()) { reject(new Error("IndexedDB indisponible")); return; }
      var settled = false;
      var request = null;
      var timer = setTimeout(function () {
        settled = true;
        stalled = request;
        reject(new Error("IndexedDB ne répond pas"));
      }, OPEN_TIMEOUT_MS);
      function fail(error) {
        if (stalled === request) { stalled = null; }
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
      try { request = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { fail(e); return; }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "seq", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
        if (stalled === request) { stalled = null; }
        /* ⚠️ Arrivée hors délai : on la referme au lieu de l'adopter en douce. La
         * session tourne sur le repli sans avoir lu la base ; y écrire l'état de
         * la session (mode local) écraserait les données qu'elle contient. Le
         * prochain essai de Sync en ouvrira une neuve, en relisant tout. */
        if (settled) { try { db.close(); } catch (e) { /* déjà fermée */ } return; }
        settled = true;
        clearTimeout(timer);
        db.onclose = function () { forget(db); };
        db.onversionchange = function () { forget(db); };
        resolve(db);
      };
      request.onerror = function () { fail(request.error || new Error("Ouverture IndexedDB refusée")); };
      request.onblocked = function () { fail(new Error("IndexedDB bloquée par un autre onglet")); };
    }).then(function (db) {
      memory.available = true;
      memory.reason = null;
      return db;
    }, function (error) {
      memory.available = false;
      memory.reason = (error && error.message) || "IndexedDB indisponible";
      return null;
    });
  }

  function openDatabase() {
    if (!dbPromise) {
      dbPromise = attempt().then(function (db) { current = db; return db; });
    }
    return dbPromise;
  }

  DB.open = function () { return openDatabase(); };

  /* Nouvel essai après un échec d'ouverture : Sync l'appelle à chaque cycle tant
   * que la base manque. Pendant l'essai, les autres opérations restent sur le
   * repli sans l'attendre, et une ouverture restée muette n'est pas doublée. */
  DB.reopen = function () {
    if (memory.available || !hasIndexedDB()) { return openDatabase(); }
    if (stalled) { return Promise.resolve(null); }
    if (!reopening) {
      reopening = attempt().then(function (db) {
        reopening = null;
        if (db) { current = db; dbPromise = Promise.resolve(db); }
        return db;
      });
    }
    return reopening;
  };

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

  /* ⚠️ Une connexion peut mourir en cours de session : transaction() lève alors
   * InvalidStateError (iOS au retour d'arrière-plan, WebKit 273827). On rouvre
   * UNE fois et on rejoue l'opération ; au second échec, l'appelant le sait (rejet)
   * au lieu de buter jusqu'au rechargement sur une connexion morte. */
  function withStore(storeName, mode, work, replay) {
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
      }).catch(function (error) {
        var name = error && error.name;
        var lost = db !== current || name === "InvalidStateError" || name === "UnknownError";
        if (replay || !lost) { throw error; }
        forget(db);
        return withStore(storeName, mode, work, true);
      });
    });
  }

  /* ⚠️ Le repli mémoire de la FILE est réservé au cas où IndexedDB n'existe pas du
   * tout. Si elle existe mais ne répond pas (panne passagère), des clés mémoire se
   * mêleraient ensuite aux clés de la base : on refuse, et Sync garde l'action en
   * mémoire sous une clé à part jusqu'à ce que la base réponde de nouveau. */
  function queueFallback() {
    if (hasIndexedDB()) { throw new Error(memory.reason || "IndexedDB indisponible"); }
  }

  /* --------------------------------------------------------- File d'actions --- */

  /* Ajoute une action et ne résout QU'APRÈS attribution définitive de la clé. */
  DB.enqueue = function (action) {
    /* Une écriture non répliquée vient d'être créée : c'est le seul moment où il est
     * juste de demander à ne pas être évincé. */
    DB.requestPersistence();
    return withStore(STORE_QUEUE, "readwrite", function (store) {
      if (!store) {
        queueFallback();
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
      if (!store) { queueFallback(); return { value: memory.queue.slice() }; }
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
