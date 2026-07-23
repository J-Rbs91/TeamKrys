/**
 * Moteur de synchronisation.
 *
 * Concepts :
 *  - baseState : dernière version connue du serveur (fait autorité).
 *  - pending   : file locale d'actions non encore confirmées par le serveur.
 *  - viewState : baseState + pending appliquées (ce que l'interface affiche).
 *
 * Écriture par actions : on n'envoie jamais tout le JSON, seulement des
 * actions précises. Le serveur les applique sur la dernière version, ce qui
 * évite d'écraser le travail d'un autre collaborateur.
 */
const Sync = (function () {
  let baseState = State.emptyData();
  let viewState = State.emptyData();
  let pending = []; // [{seq, actionId, action}]
  let syncing = false;
  let lastSyncAt = null;
  let lastError = null; // { message, at }
  let onChange = function () {};
  let onStatus = function () {};
  let pollTimer = null;

  // --- Initialisation -------------------------------------------------------

  function init(callbacks) {
    onChange = (callbacks && callbacks.onChange) || onChange;
    onStatus = (callbacks && callbacks.onStatus) || onStatus;
    return Promise.all([DB.loadState(), DB.listActions(), DB.metaGet("lastSyncAt")]).then(function (
      res
    ) {
      if (res[0]) baseState = res[0];
      pending = res[1] || [];
      lastSyncAt = res[2] || null;
      rebuildView();
      emit();
    });
  }

  function rebuildView() {
    const clone = JSON.parse(JSON.stringify(baseState));
    pending.forEach(function (row) {
      const check = State.validateAction(row.action, clone);
      if (check.ok) State.applyAction(clone, row.action);
    });
    viewState = clone;
  }

  function getData() {
    return viewState;
  }

  // --- Dispatch d'une action locale ----------------------------------------

  /**
   * Valide, enregistre et applique une action de manière optimiste.
   * L'application optimiste est synchrone (l'interface reflète le changement
   * immédiatement) ; la persistance et l'envoi réseau suivent.
   * Renvoie une promesse { ok } ou { ok:false, error }.
   */
  function dispatch(action) {
    const check = State.validateAction(action, viewState);
    if (!check.ok) return Promise.resolve({ ok: false, error: check.error });

    // Application optimiste immédiate (seq réel renseigné après persistance).
    const row = { seq: null, actionId: action.actionId, action: action };
    pending.push(row);
    rebuildView();
    emit();

    return DB.enqueueAction(action).then(function (seq) {
      row.seq = seq;
      pushQueue();
      return { ok: true };
    });
  }

  // --- Envoi de la file -----------------------------------------------------

  function pushQueue() {
    if (syncing) return Promise.resolve();
    if (!Api.isConfigured()) {
      emit();
      return Promise.resolve();
    }
    if (!navigator.onLine) {
      emit();
      return Promise.resolve();
    }
    if (pending.length === 0) return Promise.resolve();

    syncing = true;
    emit();

    return sendNext().then(function () {
      syncing = false;
      touchSync();
      emit();
    });
  }

  function sendNext() {
    if (pending.length === 0) return Promise.resolve();
    const row = pending[0];
    // seq pas encore attribué (persistance en cours) : on attendra le prochain
    // cycle pour ne pas laisser d'action orpheline dans IndexedDB.
    if (row.seq === null || row.seq === undefined) return Promise.resolve();
    return Api.postAction(row.action)
      .then(function (resp) {
        // Succès (y compris doublon déjà appliqué côté serveur).
        if (resp && resp.state) {
          baseState = resp.state;
          DB.saveState(baseState);
        }
        return DB.removeAction(row.seq).then(function () {
          pending.shift();
          rebuildView();
          lastError = null;
          return sendNext();
        });
      })
      .catch(function (e) {
        if (e.kind === "network") {
          // Réseau indisponible : on garde la file intacte, on réessaiera.
          return;
        }
        if (e.kind === "server") {
          // Action refusée par le serveur : on la retire pour ne pas bloquer
          // la file, et on conserve un message clair.
          recordError("Une action n'a pas pu être enregistrée : " + e.message);
          return DB.removeAction(row.seq).then(function () {
            pending.shift();
            rebuildView();
            return sendNext();
          });
        }
        recordError(e.message || "Erreur de synchronisation.");
      });
  }

  // --- Réception (pull) -----------------------------------------------------

  function pull() {
    if (!Api.isConfigured() || !navigator.onLine) {
      emit();
      return Promise.resolve();
    }
    return Api.getRevision()
      .then(function (info) {
        const remote = info && typeof info.revision === "number" ? info.revision : 0;
        if (remote > (baseState.revision || 0)) {
          return Api.getState().then(function (state) {
            if (state && typeof state.revision === "number") {
              baseState = state;
              DB.saveState(baseState);
              rebuildView();
              lastError = null;
            }
          });
        }
        lastError = null;
      })
      .catch(function (e) {
        if (e.kind !== "network") recordError(e.message || "Erreur de synchronisation.");
      })
      .then(function () {
        touchSync();
        emit();
      });
  }

  /** Cycle complet : envoyer d'abord la file, puis récupérer les nouveautés. */
  function syncNow() {
    return pushQueue().then(pull);
  }

  // --- Poll adaptatif -------------------------------------------------------

  function startPolling() {
    stopPolling();
    schedule();
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedule() {
    const hidden = document.visibilityState === "hidden";
    const delay = hidden ? CONFIG.POLL_INTERVAL_HIDDEN_MS : CONFIG.POLL_INTERVAL_VISIBLE_MS;
    pollTimer = setTimeout(function () {
      const run = document.visibilityState === "hidden" ? Promise.resolve() : syncNow();
      run.then(schedule);
    }, delay);
  }

  // --- Statut ---------------------------------------------------------------

  function recordError(message) {
    lastError = { message: message, at: Utils.nowIso() };
    DB.metaSet("lastError", lastError);
  }

  function touchSync() {
    lastSyncAt = Utils.nowIso();
    DB.metaSet("lastSyncAt", lastSyncAt);
  }

  function getStatus() {
    let key, label;
    if (!Api.isConfigured()) {
      key = "local";
      label = "Mode local (API non configurée)";
    } else if (!navigator.onLine) {
      key = "offline";
      label = "Hors connexion";
    } else if (syncing) {
      key = "syncing";
      label = "Synchronisation…";
    } else if (pending.length > 0) {
      key = "pending";
      label = "Modifications en attente";
    } else if (lastError) {
      key = "error";
      label = "Erreur de synchronisation";
    } else {
      key = "up-to-date";
      label = "À jour";
    }
    return {
      key: key,
      label: label,
      pendingCount: pending.length,
      localRevision: baseState.revision || 0,
      remoteRevision: baseState.revision || 0,
      lastSyncAt: lastSyncAt,
      lastError: lastError,
      online: navigator.onLine,
      configured: Api.isConfigured(),
    };
  }

  function emit() {
    onChange(viewState);
    onStatus(getStatus());
  }

  return {
    init: init,
    getData: getData,
    dispatch: dispatch,
    pushQueue: pushQueue,
    pull: pull,
    syncNow: syncNow,
    startPolling: startPolling,
    stopPolling: stopPolling,
    getStatus: getStatus,
    emit: emit,
  };
})();
