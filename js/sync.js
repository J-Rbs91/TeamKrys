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

  Sync.boot = function () {
    return DB.loadState().then(function (saved) {
      if (saved) { Store.setBase(saved); }
      return DB.queued();
    }).then(function (entries) {
      Store.setQueue(entries || []);
      changed();
    }).catch(function () {
      Store.setQueue([]);
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
      Store.rebuild();
      changed();
      return DB.saveState(Store.base).then(function () { return { ok: true, error: null }; });
    }

    /* Mode connecté : affichage immédiat, envoi dès que la clé est attribuée. */
    var entry = { seq: null, action: action };
    Store.addToQueue(entry);
    changed();

    return DB.enqueue(action).then(function (saved) {
      /* ⚠️ Tant que « seq » n'est pas attribué, l'action n'est PAS envoyée. */
      entry.seq = saved.seq;
      changed();
      Sync.push();
      return { ok: true, error: null };
    }).catch(function () {
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

    return Api.postAction(Sync.connection.url, Sync.connection.token, entry.action)
      .then(function (response) {
        lastError = null;
        lastSyncAt = Utils.nowISO();
        if (response.state) { Store.setBase(response.state); }
        return DB.dequeue(entry.seq).then(function () {
          Store.removeFromQueue(entry.seq);
          return DB.saveState(Store.base);
        });
      })
      .catch(function (error) {
        if (Api.isAuthError(error)) {
          /* Code d'accès invalidé en cours de session → on reverrouille. */
          lastError = error.message;
          if (hooks.onAuthError) { hooks.onAuthError(); }
          throw error;
        }
        if (Api.isNetworkError(error)) {
          /* Erreur RÉSEAU : la file reste intacte, on réessaiera. */
          lastError = error.message;
          throw error;
        }
        /* Erreur MÉTIER : l'action ne passera jamais, on la retire pour ne pas
         * bloquer les suivantes, et on prévient clairement l'utilisateur. */
        message("Action refusée : " + error.message, "error");
        return DB.dequeue(entry.seq).then(function () { Store.removeFromQueue(entry.seq); });
      })
      .then(function () {
        busy = false;
        changed();
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

    return Api.getRevision(Sync.connection.url, Sync.connection.token)
      .then(function (info) {
        lastError = null;
        lastSyncAt = Utils.nowISO();
        var known = Store.base.revision;
        if (!force && info.revision === known) { return null; }
        /* État complet téléchargé UNIQUEMENT si la révision a changé. */
        return Api.getState(Sync.connection.url, Sync.connection.token).then(function (payload) {
          Store.setBase(payload.state);
          return DB.saveState(Store.base);
        });
      })
      .catch(function (error) {
        if (Api.isAuthError(error)) {
          lastError = error.message;
          if (hooks.onAuthError) { hooks.onAuthError(); }
          return;
        }
        lastError = error.message;
      })
      .then(function () {
        pulling = false;
        changed();
      });
  };

  /* ------------------------------------------------------------ Boucle --- */

  function interval() {
    var hidden = typeof document !== "undefined" && document.hidden;
    return hidden ? CONFIG.POLL_HIDDEN_MS : CONFIG.POLL_VISIBLE_MS;
  }

  function tick() {
    pollTimer = null;
    var run = Sync.isConnected() ? Sync.push().then(function () { return Sync.pull(); }) : Promise.resolve();
    run.catch(function () { /* déjà traité */ }).then(schedule);
  }

  function schedule() {
    if (pollTimer) { clearTimeout(pollTimer); }
    pollTimer = setTimeout(tick, interval());
  }

  Sync.start = function () {
    Sync.stop();
    tick();
  };

  Sync.stop = function () {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  };

  Sync.now = function () {
    if (!Sync.isConnected()) { return Promise.resolve(); }
    return Sync.push().then(function () { return Sync.pull(true); });
  };

  Sync.resetError = function () { lastError = null; changed(); };

  Sync.diagnostics = function () {
    return {
      status: Sync.status(),
      url: Sync.connection.url,
      localMode: Sync.connection.localMode,
      persistent: DB.isPersistent(),
      revision: Store.base.revision,
      updatedAt: Store.base.updatedAt,
      pending: Store.queue.map(function (e) { return { seq: e.seq, type: e.action.type }; })
    };
  };

  root.Sync = Sync;
})(typeof globalThis !== "undefined" ? globalThis : this);
