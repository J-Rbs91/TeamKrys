/* BrainstO. — synchronisation par actions.
 *
 * Principe : l'application n'écrit JAMAIS l'état complet. Elle applique
 * l'action localement (optimiste), la range dans une file persistée
 * (IndexedDB), puis l'envoie une par une. Le serveur applique l'action sur la
 * dernière version, incrémente la révision et renvoie l'état à jour.
 */
(function (root) {
  "use strict";

  var Sync = {};

  var listeners = [];
  var pollTimer = null;
  var busy = false;          // un envoi est en cours
  var pulling = false;
  var lastError = null;      // dernier message d'erreur réseau/serveur
  var lastSyncAt = null;
  var lastFlushAt = null;    // dernier envoi de secours au départ de la page
  var hooks = { onAuthError: null, onMessage: null, onChange: null };

  /* Boucle de synchronisation.
   * « cycleToken » invalide les cycles EN VOL : sans lui, un cycle démarré
   * avant Sync.stop() replanifiait la boucle en se terminant, et l'application
   * continuait d'interroger le serveur après un reverrouillage ou une
   * déconnexion. Deux appels rapprochés à Sync.start() faisaient de même
   * tourner deux boucles concurrentes, donc deux fois le trafic. */
  var cycleToken = 0;
  var looping = false;
  var inFlight = null;       // cycle en cours, partagé au lieu d'être ignoré
  var idleRounds = 0;        // tours consécutifs sans rien de neuf
  var failures = 0;          // échecs réseau consécutifs
  /* Envois consécutifs restés SANS verdict alors que le serveur a répondu (panne
   * de Code.gs, page illisible, refus sans code pas encore cru) : dès 2, « Erreur ». */
  var serverFailures = 0;
  var serverWarned = false;
  var refusals = {};         // id → refus SANS code déjà reçus (backend d'avant)
  var LEGACY_TRIES = 3;      // un refus sans code n'est cru qu'au 3e envoi
  var BEACON_BUDGET = 60000; // octets UTF-8 d'un envoi de secours (refusé au-delà de 64 Kio)
  /* Refus d'AUTHENTIFICATION consécutifs (le serveur exige un code que l'appareil n'a
   * pas, ou n'a plus) : ils font reculer la boucle comme une panne (voir interval), et
   * onAuthError n'est appelé qu'UNE fois par série de refus (BL-024). */
  var authFailures = 0;
  var authNotified = false;
  /* Actions RETENUES (BL-004, D7) : en file depuis plus de CONFIG.STALE_ACTION_MS, elles
   * ne partent plus toutes seules (voir isStale). « released » : celles que l'utilisateur
   * a libérées par Sync.releaseStale(). */
  var released = {};
  var staleWarned = false;
  var activeUntil = 0;       // régime nerveux jusqu'à cet instant
  var storageWarned = false;
  /* File de la base lue au moins une fois ? Tant que non (ouverture ratée au
   * démarrage), elle peut cacher des actions PLUS ANCIENNES que celles de la
   * session : on retente de la lire avant d'envoyer (voir pushSoon). */
  var queueRead = false;
  var localSeq = 0;          // clés « local-n » des actions que la base n'a pas pu écrire
  var forgotten = {};        // ids des actions retirées de la file ici (acquittées ou refusées)
  var saving = Promise.resolve();
  var refreshing = null;

  /* Capacités annoncées par le serveur. Le frontend et le backend se déploient
   * séparément — GitHub Pages d'un côté, Apps Script de l'autre, et des
   * téléphones qui gardent longtemps une version en cache. Plutôt que d'exiger
   * une mise à jour simultanée, chaque réponse du serveur dit ce qu'il sait
   * faire, et le client n'emprunte un raccourci qu'une fois celui-ci annoncé.
   * Un serveur d'avant n'annonce rien : on retombe sur le protocole d'origine,
   * sans rien casser ni de son côté ni du nôtre. */
  var features = [];

  Sync.supports = function (name) { return features.indexOf(name) >= 0; };

  function learn(response) {
    if (response && Array.isArray(response.features)) { features = response.features; }
  }

  Sync.connection = {
    url: "",
    token: "",       // jeton SHA-256 — vit uniquement en mémoire vive
    localMode: false,
    unlocked: false
  };

  /* -------------------------------------------------------------- État --- */

  function notify() {
    var snapshot = Sync.status();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (e) { /* un abonné défaillant ne bloque pas */ }
    });
  }

  Sync.subscribe = function (fn) { listeners.push(fn); return function () {
    listeners = listeners.filter(function (l) { return l !== fn; });
  }; };

  Sync.setHooks = function (next) { Object.assign(hooks, next || {}); };

  Sync.pendingCount = function () { return Store.queue.length; };

  /* Indicateur permanent : jamais « À jour » s'il reste des actions en attente. */
  Sync.status = function () {
    var pending = Sync.pendingCount();
    var code, label;
    if (Sync.connection.localMode || !Sync.connection.url) {
      code = "local"; label = "Local";
    } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
      code = "offline"; label = pending ? "Hors ligne (" + pending + ")" : "Hors ligne";
    } else if (serverFailures >= 2 && pending > 0) {
      /* Le serveur répond, mais mal, et de façon répétée : ce n'est plus une simple
       * attente. Les actions restent en file et repartiront (§12, §22). */
      code = "error"; label = "Erreur (" + pending + ")";
    } else if (busy || pulling) {
      code = "syncing"; label = "Sync…";
    } else if (pending > 0) {
      code = "pending"; label = "En attente (" + pending + ")";
    } else if (lastError) {
      code = "error"; label = "Erreur";
    } else {
      code = "idle"; label = "À jour";
    }
    return {
      code: code,
      label: label,
      pending: pending,
      error: lastError,
      lastSyncAt: lastSyncAt,
      revision: Store.base.revision
    };
  };

  function changed() {
    notify();
    if (hooks.onChange) { hooks.onChange(); }
  }

  function message(text, kind) {
    if (hooks.onMessage) { hooks.onMessage(text, kind || "info"); }
  }

  /* -------------------------------------------------------- Démarrage --- */

  /* Le repli mémoire fonctionne, mais il ne SURVIT PAS à la fermeture de la
   * page : une action écrite hors ligne y serait perdue sans un mot. On le dit
   * une fois, au démarrage. */
  function warnIfVolatile() {
    if (storageWarned || DB.isPersistent()) { return; }
    storageWarned = true;
    message("Stockage de cet appareil indisponible : vos messages partent bien, "
      + "mais ne survivraient pas à une fermeture hors ligne. "
      + "(Fenêtre in-app d'une messagerie ou navigation privée ?)", "error");
  }

  Sync.boot = function () {
    return DB.loadState().then(function (saved) {
      if (saved) { Store.setBase(saved); }
      return DB.queued();
    }).then(function (entries) {
      queueRead = true;
      Store.setQueue(merge(entries) || Store.queue);
      warnIfVolatile();
      changed();
    }).catch(function () {
      /* File de la base illisible pour l'instant : elle sera relue à chaque cycle. */
      Store.setQueue(Store.queue);
      warnIfVolatile();
      changed();
    });
  };

  Sync.setConnection = function (options) {
    Object.assign(Sync.connection, options || {});
    lastError = null;
    recovered();
    changed();
  };

  Sync.isConnected = function () {
    return !!Sync.connection.url && !Sync.connection.localMode && Sync.connection.unlocked;
  };

  /* --------------------------------------------------------- Dispatch --- */

  Sync.makeAction = function (type, payload, actor) {
    return {
      id: Utils.uid(),
      type: type,
      actorId: actor && actor.id ? actor.id : "",
      actorName: actor && actor.name ? actor.name : "",
      ts: Utils.nowISO(),
      payload: payload || {}
    };
  };

  /* Applique une action : optimiste en local, puis file d'envoi.
   * Renvoie {ok:true} ou {ok:false, error} en cas de refus métier immédiat. */
  Sync.dispatch = function (action) {
    var check = Core.validateAction(Store.view, action);
    if (!check.ok) {
      message(check.error, "error");
      return Promise.resolve(check);
    }

    /* Mode local : l'action est fondue directement dans l'état conservé. */
    if (Sync.connection.localMode || !Sync.connection.url) {
      Core.reduce(Store.base, action, action.ts);
      Store.base.revision += 1;
      Store.base.updatedAt = action.ts;
      Store.touchBase();
      Store.rebuild();
      changed();
      return DB.saveState(Store.base).then(function () { return { ok: true, error: null }; });
    }

    /* Mode connecté : affichage immédiat, envoi dès que la clé est attribuée. */
    var entry = { seq: null, action: action };
    Store.addToQueue(entry);
    /* Écrire, c'est de l'activité : on resserre la boucle pour que la réponse
     * des autres arrive vite, au lieu d'attendre le prochain tour au repos. */
    wake();
    changed();

    /* ⚠️ Tant que « seq » n'est pas attribué, l'action n'est PAS envoyée. Écrite
     * en base ou gardée en mémoire sous une clé « local-n », elle l'est ensuite :
     * plus jamais retirée pour un échec du stockage local. */
    return persistPending().then(function () {
      changed();
      schedulePush();
      return { ok: true, error: null };
    });
  };

  /* Écrit en base, DANS L'ORDRE de la file, les entrées qui n'y sont pas encore
   * (seq null : premier essai ; unsaved : essai manqué). Une écriture à la fois :
   * au redémarrage l'ordre de la base fait foi, une action récente ne doit donc
   * jamais y entrer avant une plus ancienne. */
  function persistPending() {
    saving = saving.then(saveNext).catch(keepInMemory).catch(function () { return null; });
    return saving;
  }

  function saveNext() {
    var entry = null;
    for (var i = 0; i < Store.queue.length && !entry; i++) {
      if (Store.queue[i].seq === null || Store.queue[i].unsaved) { entry = Store.queue[i]; }
    }
    if (!entry) { return null; }
    return DB.enqueue(entry.action).then(function (saved) {
      if (!saved || saved.seq === undefined || saved.seq === null) { throw new Error("clé de file non attribuée"); }
      /* Acquittée (ou effacée) pendant l'écriture : elle ne doit pas rester en base. */
      if (Store.queue.indexOf(entry) < 0) {
        return DB.dequeue(saved.seq).catch(function () { return null; }).then(saveNext);
      }
      entry.seq = saved.seq;
      entry.unsaved = false;
      return saveNext();
    });
  }

  /* ⚠️ La base refuse d'écrire (connexion perdue malgré la réouverture, quota) :
   * l'action RESTE dans la file en mémoire, sous une clé qui ne peut pas se
   * confondre avec une clé de la base, et PART au serveur comme les autres. Une
   * nouvelle écriture est tentée à chaque cycle. La retirer, c'était perdre le
   * message réseau sain, composeur déjà vidé (WebKit 273827 : la réouverture
   * elle-même peut échouer). */
  function keepInMemory() {
    Store.queue.forEach(function (entry) {
      if (entry.seq === null) { localSeq += 1; entry.seq = "local-" + localSeq; entry.unsaved = true; }
    });
    if (storageWarned) { return; }
    storageWarned = true;
    message("Enregistrement sur cet appareil impossible : l'envoi continue, "
      + "gardez l'application ouverte.", "error");
  }

  /* ------------------------------------------------------------ Envoi --- */

  var pushTimer = null;

  /* Laisse une rafale se regrouper avant de partir. Contre un serveur qui ne
   * sait pas grouper, on envoie tout de suite : attendre ne servirait à rien. */
  function schedulePush() {
    if (!Sync.supports("batch")) { pushSoon(); return; }
    if (pushTimer) { return; }
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushSoon();
    }, CONFIG.BATCH_COALESCE_MS);
  }

  /* ⚠️ File de la base encore jamais lue (ouverture ratée au démarrage) : elle
   * peut tenir une décision d'hier. On retente de la lire AVANT d'envoyer celle
   * du jour, sinon l'ancienne partirait après et l'écraserait. */
  function pushSoon() {
    if (queueRead) { return Sync.push(); }
    return refresh().then(function () { return Sync.push(); });
  }

  /* Avant chaque envoi : rouvre la base si elle manquait, relit sa file (lecture
   * seule) et y écrit les actions restées en mémoire. Ne rejette jamais. */
  function refresh() {
    if (refreshing) { return refreshing; }
    var wasDown = !DB.isPersistent();
    function done() { refreshing = null; }
    refreshing = DB.reopen().then(function (db) {
      /* La base répond de nouveau alors que rien n'avait pu en être lu : on reprend
       * la dernière version connue, pour la consultation hors ligne (§12). */
      if (!db || !wasDown || Store.base.revision) { return null; }
      return DB.loadState().then(function (saved) {
        if (saved && !Store.base.revision) { Store.setBase(saved); changed(); }
      });
    }).then(function () {
      return DB.queued();
    }).then(function (entries) {
      queueRead = true;
      var queue = merge(entries);
      if (queue) { Store.setQueue(queue); changed(); }
    }, function () { /* base encore illisible : nouvel essai au prochain cycle */ })
      .then(persistPending)
      .then(done, done);
    return refreshing;
  }

  /* ⚠️ Fusionne les entrées lues en base que la file en mémoire n'a pas : laissées
   * par un autre onglet, ou écrites avant une ouverture ratée. Chacune reprend sa
   * place d'origine, sinon une décision ancienne partirait après une plus récente
   * et l'écraserait. Rien n'est retiré de la base avant acquittement : un envoi
   * double est absorbé par la déduplication du serveur. Rend la nouvelle file, ou
   * null si rien ne change. */
  function merge(entries) {
    var queue = Store.queue.slice();
    var known = {};
    var seen = {};
    var added = false;
    queue.forEach(function (e) { known[e.action.id] = true; });
    (entries || []).forEach(function (item) {
      var id = item && item.action && item.action.id;
      if (!id) { return; }
      seen[id] = true;
      /* Déjà retirée ici, mais son retrait de la base avait échoué : on le refait. */
      if (forgotten[id]) { DB.dequeue(item.seq).catch(function () { return null; }); return; }
      if (known[id]) { return; }
      known[id] = true;
      var at = 0;
      while (at < queue.length && !comesAfter(queue[at], item)) { at += 1; }
      queue.splice(at, 0, { seq: item.seq, action: item.action });
      added = true;
    });
    Object.keys(forgotten).forEach(function (id) { if (!seen[id]) { delete forgotten[id]; } });
    return added ? queue : null;
  }

  /* L'entrée déjà en file passe-t-elle APRÈS celle qu'on fusionne ? Par clé de la
   * base quand elle en a une, sinon (pas encore écrite) par date de création. */
  function comesAfter(entry, item) {
    if (typeof entry.seq === "number") { return entry.seq > item.seq; }
    return String(entry.action.ts) > String(item.action.ts);
  }

  /* Classification commune des refus du serveur. Elle ne porte QUE sur la
   * réponse : un échec du stockage local n'est pas un refus du serveur. */
  function classify(error) {
    if (Api.isAuthError(error)) {
      refusedAuth(error);
      return { done: false, halt: true };
    }
    if (Api.isNetworkError(error)) {
      failures += 1;
      serverFailures = 0;    // une coupure n'est pas une panne du serveur : « En attente »
      lastError = error.message;
      return { done: false, halt: true };
    }
    return null;   // réponse reçue : au traitement appelant de décider
  }

  /* ⚠️ Le serveur a répondu, mais sans verdict certain : l'action reste en file
   * (§22) et le recul s'allonge (voir interval). Dès le 2e échec de suite,
   * l'indicateur passe à « Erreur (n) » et un message, un seul, dit quoi faire. */
  function trouble(text) {
    serverFailures += 1;
    lastError = text || "Réponse du serveur inexploitable.";
    if (serverFailures >= 2 && !serverWarned) {
      serverWarned = true;
      message("Le serveur ne répond pas correctement : vos actions sont gardées et repartiront.", "error");
    }
  }

  function recovered() { serverFailures = 0; serverWarned = false; authRecovered(); }

  /* ⚠️ Refus d'AUTHENTIFICATION : le serveur exige un code que cet appareil n'a pas, ou
   * n'a plus (BL-024). Réessayer toutes les 1,8 s n'y change rien : on mesurait 1 140
   * requêtes refusées par heure et un message toutes les 3 s, sans que rien soit
   * reverrouillé. La boucle recule donc (voir interval, plafond de 60 s) et onAuthError
   * n'est appelé qu'UNE fois par série de refus. La série prend fin au premier succès
   * (lecture ou écriture), à Sync.setConnection (nouveau jeton) ou à Sync.start. */
  function refusedAuth(error) {
    authFailures += 1;
    lastError = error.message;
    if (authNotified) { return; }
    authNotified = true;
    if (hooks.onAuthError) { hooks.onAuthError(); }
  }

  function authRecovered() { authFailures = 0; authNotified = false; }

  /* Refus certain ? « invalid » : oui. Sans code (backend d'avant, qui répondait
   * ainsi à une panne comme à un refus) : au LEGACY_TRIES-ième envoi seulement,
   * espacés par le recul. « retry » ou code inconnu : jamais. */
  function refusedForGood(action, code) {
    if (code === "invalid") { return true; }
    if (code) { return false; }
    refusals[action.id] = (refusals[action.id] || 0) + 1;
    return refusals[action.id] >= LEGACY_TRIES;
  }

  /* « Action refusée : <raison>. Texte : « … » » : le texte saisi est rendu à son
   * auteur, sans quoi le refus le ferait disparaître sans trace. */
  function refusalText(action, reason) {
    var why = String(reason || "refus du serveur").replace(/[\s.]+$/, "");
    var payload = (action && action.payload) || {};
    var typed = String(payload.text || payload.title || "");
    if (typed.length > 200) {
      var cut = /[\uD800-\uDBFF]/.test(typed.charAt(198)) ? 198 : 199;   // jamais une demi-paire
      typed = typed.slice(0, cut) + "…";
    }
    return "Action refusée : " + why + "." + (typed ? " Texte : « " + typed + " »" : "");
  }

  /* Taille en octets UTF-8, celle que compte le navigateur. */
  function utf8Length(text) {
    var bytes = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) { bytes += 1; }
      else if (c < 0x800) { bytes += 2; }
      else if (c >= 0xD800 && c <= 0xDBFF) { bytes += 4; i += 1; }
      else { bytes += 3; }
    }
    return bytes;
  }

  /* Retire une liste d'entrées de la file, en mémoire quoi qu'il arrive. */
  function dropEntries(entries) {
    entries.forEach(function (item) { forgotten[item.action.id] = true; delete refusals[item.action.id]; delete released[item.action.id]; });
    return entries.reduce(function (chain, item) {
      return chain
        .then(function () { return DB.dequeue(item.seq).catch(function () { return null; }); })
        .then(function () { Store.removeFromQueue(item.seq); });
    }, Promise.resolve()).then(function () {
      return DB.saveState(Store.base).catch(function () { return null; });
    });
  }

  /* Envoi GROUPÉ. Le serveur applique les actions dans l'ordre, sur une même
   * lecture du fichier, et rend un verdict PAR action : une action refusée
   * n'emporte pas les valides du même envoi. */
  function pushBatch(entries) {
    var actions = entries.map(function (e) { return e.action; });

    return Api.postActions(Sync.connection.url, Sync.connection.token, actions)
      .then(function (response) {
        learn(response);
        failures = 0;
        lastError = null;
        lastSyncAt = Utils.nowISO();
        if (response.state) { Store.setBase(response.state); }
        wake();
        /* ⚠️ Lot accepté SANS « results » : aucun verdict par action, rien ne prouve
         * qu'elles sont toutes passées. On ne retire rien et on repart une par une :
         * chacune obtient un verdict certain (doublon si elle était passée). */
        if (!Array.isArray(response.results)) {
          trouble("Réponse du serveur sans verdict par action.");
          return { done: true, results: null, single: true };
        }
        return { done: true, results: response.results };
      }, function (error) {
        var verdict = classify(error);
        if (verdict) { return verdict; }
        /* Lot refusé EN BLOC (panne de Code.gs, page illisible, lot trop gros) :
         * aucun verdict par action, donc rien n'est retiré. Repartir une par une
         * isole la fautive au lieu de sacrifier tout le lot. */
        trouble(error && error.message);
        return { done: true, results: null, single: true };
      })
      .then(function (outcome) {
        if (!outcome.done) { return outcome; }

        if (outcome.single) {
          /* On ne retire rien : on repasse aussitôt en envoi unitaire, ce qui
           * donne un verdict à chaque action. */
          features = features.filter(function (f) { return f !== "batch"; });
          return outcome;
        }

        var verdicts = {};
        outcome.results.forEach(function (r) { if (r && r.id) { verdicts[r.id] = r; } });

        /* ⚠️ Une action ne quitte la file que sur un verdict CERTAIN : appliquée,
         * doublon reconnu, ou refus définitif. Verdict absent, « retry » ou code
         * inconnu : elle reste et repartira ; la déduplication absorbe un doublon. */
        var settled = [];
        var open = null;
        entries.forEach(function (item) {
          var id = item.action.id;
          var verdict = Object.prototype.hasOwnProperty.call(verdicts, id) ? verdicts[id] : null;
          if (verdict && (verdict.ok === true || verdict.duplicate === true)) { settled.push(item); return; }
          if (verdict && verdict.ok === false && refusedForGood(item.action, verdict.code || null)) {
            message(refusalText(item.action, verdict.error), "error");
            settled.push(item);
            return;
          }
          open = verdict || { error: "Action sans verdict du serveur." };
        });
        if (open) { trouble(open.error); outcome.halt = true; } else { recovered(); }

        return dropEntries(settled).then(function () { return outcome; });
      })
      .then(function (outcome) {
        busy = false;
        changed();
        if (outcome.halt) { return; }
        var more = Store.queue.some(function (e) { return e.seq !== null && e.seq !== undefined; });
        if (more) { return Sync.push(); }
      })
      .catch(function () {
        busy = false;
        changed();
      });
  }

  /* ⚠️ Action RETENUE : en file depuis plus de CONFIG.STALE_ACTION_MS (30 jours). Un
   * appareil resté éteint ou hors ligne ne la rejoue pas en silence : le fil a pu changer,
   * et le serveur a pu oublier son identifiant (journal de déduplication borné à 5 000).
   * Elle RESTE en file (rien n'est perdu ni supprimé), ne part plus toute seule, pas même
   * à la fermeture, et compte dans l'indicateur ; l'utilisateur la libère par
   * Sync.releaseStale(). La date est celle de création de l'action (« ts », posée par
   * makeAction à l'enfilement) : une entrée sans date lisible, ou datée du futur
   * (horloge déréglée), n'est JAMAIS tenue pour ancienne. */
  function isStale(entry) {
    var action = entry && entry.action;
    if (!action || typeof action.ts !== "string" || released[action.id]) { return false; }
    var created = Date.parse(action.ts);
    return isFinite(created) && Date.now() - created > CONFIG.STALE_ACTION_MS;
  }

  Sync.staleCount = function () { return Store.queue.filter(isStale).length; };

  /* « Envoyer quand même » : libère les actions retenues, qui repartent comme les autres,
   * dans l'ordre. Rend le nombre d'actions libérées. */
  Sync.releaseStale = function () {
    var count = 0;
    Store.queue.forEach(function (entry) {
      if (isStale(entry)) { released[entry.action.id] = true; count += 1; }
    });
    if (!count) { return Promise.resolve(0); }
    changed();
    return Sync.now().then(function () { return count; });
  };

  /* Une seule fois par session, au premier tour de la boucle : l'utilisateur apprend
   * que des actions anciennes attendent, et où les envoyer. */
  function announceStale() {
    var count = Sync.staleCount();
    if (!count || staleWarned) { return; }
    staleWarned = true;
    var many = count > 1;
    message(count + " action" + (many ? "s" : "") + " de plus de "
      + Math.round(CONFIG.STALE_ACTION_MS / 86400000) + " jours " + (many ? "attendent" : "attend")
      + " : ouvrez Réglages pour " + (many ? "les envoyer." : "l'envoyer."), "error");
  }

  /* Seules les actions dont la clé de file est attribuée sont envoyables, et
   * l'ORDRE de la file fait foi : on ne saute jamais par-dessus une action pas
   * encore prête, sinon un message partirait avant le sujet qui le porte. */
  function readyEntries() {
    var ready = [];
    for (var i = 0; i < Store.queue.length; i++) {
      var candidate = Store.queue[i];
      if (candidate.seq === null || candidate.seq === undefined) { break; }
      /* ⚠️ Même règle d'ordre pour une action RETENUE : celles qui la suivent attendent
       * aussi, sinon elles partiraient avant ce dont elles peuvent dépendre. */
      if (isStale(candidate)) { break; }
      ready.push(candidate);
      if (!Sync.supports("batch") || ready.length >= CONFIG.MAX_BATCH) { break; }
    }
    return ready;
  }

  /* Dernier recours, appelé quand la PAGE DISPARAÎT (voir Api.beacon).
   *
   * Un envoi ordinaire meurt avec l'onglet. Écrire un message puis revenir à
   * l'écran d'accueil dans la seconde suffisait donc à ce que l'action reste en
   * file — et le seul mécanisme qui la rejouait, la boucle d'interrogation,
   * meurt lui aussi avec la page. Le message attendait la prochaine OUVERTURE
   * de l'application : des heures, ou des jours.
   *
   * On ne retire rien de la file : un beacon n'a pas de réponse, donc aucune
   * confirmation. L'action repartira au prochain démarrage et le serveur
   * absorbera le doublon.
   *
   * Renvoie true si le navigateur a pris la requête en charge. */
  Sync.flush = function () {
    if (!Sync.isConnected() || !Api.beacon) { return false; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { return false; }

    /* ⚠️ Ici, et ICI SEULEMENT, on n'exige pas que la clé de file soit
     * attribuée. Entre l'affichage d'un message et son écriture en base, il
     * s'écoule quelques millisecondes — et une page qui meurt pile là emporte
     * une action qui n'était encore NULLE PART. L'ordre du tableau EST l'ordre
     * voulu, et un beacon ne retire rien de la file : rien ne peut être
     * réordonné. La règle stricte de Sync.push, elle, reste nécessaire — c'est
     * elle qui garantit l'ordre APRÈS un redémarrage. */
    /* ⚠️ Au-delà de 64 Kio le navigateur refuse l'envoi de secours EN ENTIER
     * (sendBeacon comme keepalive) : on expédie le plus long début de file qui tient
     * dans BEACON_BUDGET octets. Une action trop grosse pour tenir seule partira par
     * la voie normale. */
    var batch = Sync.supports("batch");
    var actions = [];
    var bytes = batch ? 2 : 0;
    for (var i = 0; i < Store.queue.length && actions.length < (batch ? CONFIG.MAX_BATCH : 1); i++) {
      if (isStale(Store.queue[i])) { break; }   // retenue : jamais envoyée toute seule, pas même ici
      var size = utf8Length(JSON.stringify(Store.queue[i].action)) + (actions.length ? 1 : 0);
      if (bytes + size > BEACON_BUDGET) { break; }
      bytes += size;
      actions.push(Store.queue[i].action);
    }
    if (!actions.length) { return false; }

    /* Un serveur qui ne sait pas grouper attend UNE action : on lui envoie la
     * tête de file. Les suivantes partiront normalement au retour. */
    var body = batch ? actions : actions[0];

    var handed = Api.beacon(Sync.connection.url, Sync.connection.token, body);
    if (handed) { lastFlushAt = Utils.nowISO(); }
    return handed;
  };

  Sync.push = function () {
    if (busy || !Sync.isConnected()) { return Promise.resolve(); }

    var ready = readyEntries();
    if (!ready.length) { return Promise.resolve(); }

    var entry = ready[0];

    busy = true;
    changed();

    if (ready.length > 1) { return pushBatch(ready); }

    /* ⚠️ La CLASSIFICATION de l'erreur se fait ici, sur la seule réponse du
     * serveur. Auparavant le catch englobait aussi les écritures IndexedDB qui
     * suivent : un échec de stockage local était donc pris pour un « refus
     * métier », l'action était annoncée refusée à tort — et comme le retrait de
     * la file échouait lui aussi, la même action repartait en boucle. */
    return Api.postAction(Sync.connection.url, Sync.connection.token, entry.action)
      .then(function (response) {
        learn(response);
        failures = 0;
        recovered();
        lastError = null;
        lastSyncAt = Utils.nowISO();
        if (response.state) { Store.setBase(response.state); }
        wake();
        return { done: true };
      }, function (error) {
        /* Code d'accès invalidé → reverrouillage. Erreur RÉSEAU → la file reste
         * intacte, on réessaiera plus doucement (voir interval()). */
        var verdict = classify(error);
        if (verdict) { return verdict; }
        /* Refus DÉFINITIF : l'action ne passera jamais, on la retire pour ne pas
         * bloquer les suivantes, et on rend son texte à l'utilisateur. */
        if (error && error.kind === "server" && refusedForGood(entry.action, error.code || null)) {
          recovered();
          message(refusalText(entry.action, error.message), "error");
          return { done: true };
        }
        /* ⚠️ Sans verdict certain (panne de Code.gs, page illisible, refus sans code
         * pas encore cru) : l'action RESTE en file et repartira après un recul. */
        trouble(error && error.message);
        return { done: false, halt: true };
      })
      .then(function (outcome) {
        if (!outcome.done) { return outcome; }
        /* Succès ou refus définitif : l'action quitte la file. Le retrait EN
         * MÉMOIRE a lieu même si IndexedDB refuse, sinon la file ne se vide
         * jamais et la même action est repostée sans fin. Le doublon éventuel
         * au prochain démarrage est neutralisé par la déduplication serveur. */
        return dropEntries([entry]).then(function () { return outcome; });
      })
      .then(function (outcome) {
        busy = false;
        changed();
        if (outcome.halt) { return; }
        /* On enchaîne tant qu'il reste des actions prêtes. */
        var more = Store.queue.some(function (e) { return e.seq !== null && e.seq !== undefined; });
        if (more) { return Sync.push(); }
      })
      .catch(function () {
        busy = false;
        changed();
      });
  };

  /* --------------------------------------------------------- Réception --- */

  Sync.pull = function (force) {
    if (pulling || busy || !Sync.isConnected()) { return Promise.resolve(); }
    pulling = true;
    changed();

    var recovering = !!lastError;
    var known = Store.base.revision;

    /* ⚠️ Une réponse de lecture décrit l'état du serveur AU MOMENT OÙ ELLE A ÉTÉ
     * CALCULÉE. Si un envoi aboutit pendant qu'elle voyage, l'appliquer au
     * retour remet l'état d'AVANT cet envoi : le message qu'on vient d'écrire
     * disparaît de l'écran de son auteur jusqu'au tour suivant — exactement
     * l'allure d'une application qui perd les messages. On note donc l'état
     * courant au départ, et on jette la réponse si un plus frais s'est installé
     * entre-temps. Rien n'est perdu : le tour suivant relit. */
    var epoch = Store.epoch;
    function stale() { return Store.epoch !== epoch; }

    /* Serveur récent : UN seul aller-retour. Il ne renvoie l'état que si la
     * révision annoncée a bougé : sinon la RÉPONSE est minuscule (une centaine
     * d'octets). ⚠️ Le serveur, lui, relit le fichier Drive à chaque lecture : seul
     * le trafic est allégé, pas son travail. « since: -1 » force le téléchargement. */
    if (Sync.supports("since")) {
      var suspectNow = force && (known === 0 || recovering);
      return Api.getStateSince(Sync.connection.url, Sync.connection.token, suspectNow ? -1 : known)
        .then(function (payload) {
          learn(payload);
          failures = 0;
          authRecovered();
          lastError = null;
          lastSyncAt = Utils.nowISO();
          if (payload.unchanged || !payload.state || stale()) { idleRounds += 1; return null; }
          if (Store.setBase(payload.state)) { wake(); } else { idleRounds += 1; }
          return DB.saveState(Store.base).catch(function () { return null; });
        })
        .catch(function (error) {
          if (Api.isAuthError(error)) {
            refusedAuth(error);
            return;
          }
          failures += 1;
          lastError = error.message;
        })
        .then(function () {
          pulling = false;
          changed();
        });
    }

    /* Serveur d'avant : le protocole d'origine, en deux temps. */
    return Api.getRevision(Sync.connection.url, Sync.connection.token)
      .then(function (info) {
        learn(info);
        failures = 0;
        authRecovered();
        lastError = null;
        lastSyncAt = Utils.nowISO();
        /* « force » signifie « n'attends pas le prochain tour », PAS « retélécharge
         * tout ». La révision est incrémentée par le serveur à chaque écriture :
         * même révision = même état, et rapatrier l'état entier à chaque retour
         * d'onglet ne faisait que payer un aller-retour pour rien. On ne force le
         * téléchargement que si l'état local est vide ou sort d'une erreur. */
        var suspect = force && (known === 0 || recovering);
        if (info.revision === known && !suspect) {
          idleRounds += 1;
          return null;
        }
        /* État complet téléchargé UNIQUEMENT si la révision a changé. */
        return Api.getState(Sync.connection.url, Sync.connection.token).then(function (payload) {
          if (stale()) { idleRounds += 1; return null; }
          if (Store.setBase(payload.state)) { wake(); } else { idleRounds += 1; }
          return DB.saveState(Store.base).catch(function () { return null; });
        });
      })
      .catch(function (error) {
        if (Api.isAuthError(error)) {
          refusedAuth(error);
          return;
        }
        failures += 1;
        lastError = error.message;
      })
      .then(function () {
        pulling = false;
        changed();
      });
  };

  /* ------------------------------------------------------------ Boucle --- */

  /* Repasse en régime nerveux : appelé dès qu'il se passe quelque chose, ici ou
   * chez quelqu'un d'autre. */
  function wake() {
    activeUntil = Date.now() + CONFIG.POLL_ACTIVE_WINDOW_MS;
    idleRounds = 0;
  }

  function interval() {
    if (typeof document !== "undefined" && document.hidden) { return CONFIG.POLL_HIDDEN_MS; }

    /* Le réseau ou le serveur ne répond pas (ou mal), ou refuse l'accès : marteler
     * toutes les deux secondes n'y change rien et aggrave la contention côté Apps
     * Script. On recule (jusqu'à POLL_BACKOFF_MAX_MS). */
    var level = Math.max(failures, serverFailures, authFailures);
    if (level > 0) {
      var backoff = CONFIG.POLL_ACTIVE_MS * Math.pow(2, Math.min(level, 6));
      return Math.min(backoff, CONFIG.POLL_BACKOFF_MAX_MS);
    }

    /* Conversation en cours : on colle au fil. */
    if (Date.now() < activeUntil) { return CONFIG.POLL_ACTIVE_MS; }

    /* Fenêtre nerveuse close : rythme de repos. ⚠️ Le « relâchement progressif » n'a PAS
     * lieu à la fin d'une conversation : idleRounds compte aussi les sondages inchangés
     * PENDANT la fenêtre (une trentaine en 90 s), donc il vaut déjà 8 quand elle se ferme,
     * et l'écart passe directement de 1,8 s à 6 s, comme le demande §21. La rampe ne joue
     * qu'après une interruption : les sondages ratés ne comptent pas, idleRounds peut alors
     * être resté bas et le rythme remonte par paliers. */
    var span = CONFIG.POLL_IDLE_MS - CONFIG.POLL_ACTIVE_MS;
    var ramp = Math.min(idleRounds, 8) / 8;
    return Math.round(CONFIG.POLL_ACTIVE_MS + span * ramp);
  }

  /* Un seul cycle à la fois. Un appel concurrent PARTAGE le cycle en vol au lieu
   * d'être avalé par les gardes « busy » / « pulling » : c'est ce qui faisait
   * qu'un « Synchroniser maintenant » lancé pendant un tour de boucle ne
   * synchronisait rien du tout. */
  function cycle(force) {
    if (inFlight) { return inFlight; }
    if (!Sync.isConnected()) { return Promise.resolve(); }
    /* La file de la base est relue à chaque tour (BL-006) : une action laissée
     * par un autre onglet part, et compte « en attente » au lieu de « À jour ». */
    var refusedBefore = authFailures;
    inFlight = refresh()
      .then(function () { announceStale(); return Sync.push(); })
      .catch(function () { /* déjà traité */ })
      .then(function () {
        /* Refusé pour l'authentification à l'instant : la lecture le serait aussi. */
        if (authFailures > refusedBefore) { return null; }
        return Sync.pull(force);
      })
      .catch(function () { /* déjà traité */ })
      .then(function () { inFlight = null; });
    return inFlight;
  }

  function tick(token) {
    pollTimer = null;
    if (token !== cycleToken) { return; }
    cycle(false).then(function () {
      /* La boucle a pu être arrêtée PENDANT le cycle (reverrouillage,
       * déconnexion) : on ne replanifie qu'un jeton encore valide. */
      if (looping && token === cycleToken) { schedule(token); }
    });
  }

  function schedule(token) {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    pollTimer = setTimeout(function () { tick(token); }, interval());
  }

  Sync.start = function () {
    cycleToken += 1;
    looping = true;
    authRecovered();      // nouvelle série de refus, nouvelle notification
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    tick(cycleToken);
  };

  Sync.stop = function () {
    cycleToken += 1;      // invalide aussi le cycle déjà en vol
    looping = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  };

  Sync.now = function () {
    if (!Sync.isConnected()) { return Promise.resolve(); }
    wake();
    var token = cycleToken;
    return cycle(true).then(function () {
      if (looping && token === cycleToken) { schedule(token); }
    });
  };

  Sync.resetError = function () { lastError = null; failures = 0; recovered(); changed(); };

  Sync.diagnostics = function () {
    return {
      status: Sync.status(),
      url: Sync.connection.url,
      localMode: Sync.connection.localMode,
      persistent: DB.isPersistent(),
      durability: DB.durability ? DB.durability() : "inconnue",
      storageReason: DB.unavailableReason ? DB.unavailableReason() : null,
      revision: Store.base.revision,
      updatedAt: Store.base.updatedAt,
      lastSyncAt: lastSyncAt,
      /* Dernier envoi de secours au départ de la page : dit si un message a dû
       * être sauvé par le beacon plutôt que par la voie normale. */
      lastFlushAt: lastFlushAt,
      /* Rythme réel de la boucle : c'est la première chose à regarder quand la
       * synchronisation « traîne ». */
      intervalMs: interval(),
      failures: failures,
      stale: Sync.staleCount(),
      /* Capacités du serveur en face : dit tout de suite si le backend déployé
       * est celui qu'on croit. */
      features: features.slice(),
      pending: Store.queue.map(function (e) { return { seq: e.seq, type: e.action.type }; })
    };
  };

  root.Sync = Sync;
})(typeof globalThis !== "undefined" ? globalThis : this);
