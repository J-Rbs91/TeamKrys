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
  var activeUntil = 0;       // régime nerveux jusqu'à cet instant
  var storageWarned = false;

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
      Store.setQueue(entries || []);
      warnIfVolatile();
      changed();
    }).catch(function () {
      Store.setQueue([]);
      warnIfVolatile();
      changed();
    });
  };

  Sync.setConnection = function (options) {
    Object.assign(Sync.connection, options || {});
    lastError = null;
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

    return DB.enqueue(action).then(function (saved) {
      /* ⚠️ Tant que « seq » n'est pas attribué, l'action n'est PAS envoyée. */
      entry.seq = saved && saved.seq !== undefined && saved.seq !== null ? saved.seq : null;
      if (entry.seq === null) { throw new Error("clé de file non attribuée"); }
      changed();
      Sync.push();
      return { ok: true, error: null };
    }).catch(function () {
      /* L'action est retirée de la file : la garder « pas prête » la rendrait
       * invisible à l'envoi tout en la comptant indéfiniment « en attente ». */
      Store.removeEntry(entry);
      changed();
      message("Impossible d'enregistrer l'action sur cet appareil.", "error");
      return { ok: false, error: "stockage" };
    });
  };

  /* ------------------------------------------------------------ Envoi --- */

  Sync.push = function () {
    if (busy || !Sync.isConnected()) { return Promise.resolve(); }
    var entry = null;
    for (var i = 0; i < Store.queue.length; i++) {
      if (Store.queue[i].seq !== null && Store.queue[i].seq !== undefined) { entry = Store.queue[i]; break; }
    }
    if (!entry) { return Promise.resolve(); }

    busy = true;
    changed();

    /* ⚠️ La CLASSIFICATION de l'erreur se fait ici, sur la seule réponse du
     * serveur. Auparavant le catch englobait aussi les écritures IndexedDB qui
     * suivent : un échec de stockage local était donc pris pour un « refus
     * métier », l'action était annoncée refusée à tort — et comme le retrait de
     * la file échouait lui aussi, la même action repartait en boucle. */
    return Api.postAction(Sync.connection.url, Sync.connection.token, entry.action)
      .then(function (response) {
        failures = 0;
        lastError = null;
        lastSyncAt = Utils.nowISO();
        if (response.state) { Store.setBase(response.state); }
        wake();
        return { done: true };
      }, function (error) {
        if (Api.isAuthError(error)) {
          /* Code d'accès invalidé en cours de session → on reverrouille. */
          lastError = error.message;
          if (hooks.onAuthError) { hooks.onAuthError(); }
          return { done: false, halt: true };
        }
        if (Api.isNetworkError(error)) {
          /* Erreur RÉSEAU : la file reste intacte, on réessaiera — mais plus
           * doucement à chaque échec (voir interval()). */
          failures += 1;
          lastError = error.message;
          return { done: false, halt: true };
        }
        /* Erreur MÉTIER : l'action ne passera jamais, on la retire pour ne pas
         * bloquer les suivantes, et on prévient clairement l'utilisateur. */
        message("Action refusée : " + error.message, "error");
        return { done: true };
      })
      .then(function (outcome) {
        if (!outcome.done) { return outcome; }
        /* Succès ou refus définitif : l'action quitte la file. Le retrait EN
         * MÉMOIRE a lieu même si IndexedDB refuse, sinon la file ne se vide
         * jamais et la même action est repostée sans fin. Le doublon éventuel
         * au prochain démarrage est neutralisé par la déduplication serveur. */
        return DB.dequeue(entry.seq)
          .catch(function () { return null; })
          .then(function () {
            Store.removeFromQueue(entry.seq);
            return DB.saveState(Store.base).catch(function () { return null; });
          })
          .then(function () { return outcome; });
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

    return Api.getRevision(Sync.connection.url, Sync.connection.token)
      .then(function (info) {
        failures = 0;
        lastError = null;
        lastSyncAt = Utils.nowISO();
        var known = Store.base.revision;
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
          if (Store.setBase(payload.state)) { wake(); } else { idleRounds += 1; }
          return DB.saveState(Store.base).catch(function () { return null; });
        });
      })
      .catch(function (error) {
        if (Api.isAuthError(error)) {
          lastError = error.message;
          if (hooks.onAuthError) { hooks.onAuthError(); }
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

    /* Le réseau ou le serveur ne répond pas : marteler toutes les deux secondes
     * n'y change rien et aggrave la contention côté Apps Script. On recule. */
    if (failures > 0) {
      var backoff = CONFIG.POLL_ACTIVE_MS * Math.pow(2, Math.min(failures, 6));
      return Math.min(backoff, CONFIG.POLL_BACKOFF_MAX_MS);
    }

    /* Conversation en cours : on colle au fil. */
    if (Date.now() < activeUntil) { return CONFIG.POLL_ACTIVE_MS; }

    /* Puis relâchement progressif jusqu'au rythme de repos, au lieu d'un saut
     * brutal qui ferait rater le rebond d'une discussion qui repart. */
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
    inFlight = Sync.push()
      .catch(function () { /* déjà traité */ })
      .then(function () { return Sync.pull(force); })
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
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    tick(cycleToken);
  };

  Sync.stop = function () {
    cycleToken += 1;      // invalide aussi le cycle déjà en vol
    looping = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  };

  Sync.now = function () {
    if (!Sync.isConnected()) { return Promise.resolve(); }
    wake();
    var token = cycleToken;
    return cycle(true).then(function () {
      if (looping && token === cycleToken) { schedule(token); }
    });
  };

  Sync.resetError = function () { lastError = null; failures = 0; changed(); };

  Sync.diagnostics = function () {
    return {
      status: Sync.status(),
      url: Sync.connection.url,
      localMode: Sync.connection.localMode,
      persistent: DB.isPersistent(),
      storageReason: DB.unavailableReason ? DB.unavailableReason() : null,
      revision: Store.base.revision,
      updatedAt: Store.base.updatedAt,
      lastSyncAt: lastSyncAt,
      /* Rythme réel de la boucle : c'est la première chose à regarder quand la
       * synchronisation « traîne ». */
      intervalMs: interval(),
      failures: failures,
      pending: Store.queue.map(function (e) { return { seq: e.seq, type: e.action.type }; })
    };
  };

  root.Sync = Sync;
})(typeof globalThis !== "undefined" ? globalThis : this);
