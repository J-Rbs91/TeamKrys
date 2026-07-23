/**
 * Contrôleur principal : profil local, créateurs d'actions, routage,
 * service worker et gestion en ligne / hors connexion.
 */
const App = (function () {
  const app = {
    profile: null, // { id, name }
    route: { name: "home", id: null },
    actions: {},
  };

  // --- Démarrage & accueil (onboarding) -------------------------------------

  var LOCAL_ACCEPTED_KEY = "teamkrys.localAccepted";
  var pendingNewProfile = false;

  function localAccepted() {
    try {
      return window.localStorage.getItem(LOCAL_ACCEPTED_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setLocalAccepted() {
    try {
      window.localStorage.setItem(LOCAL_ACCEPTED_KEY, "1");
    } catch (e) { /* stockage indisponible */ }
  }

  function boot() {
    UI.mount(document.getElementById("app"));

    // L'URL de l'API a déjà été chargée depuis le localStorage par config.js.
    DB.metaGet("profile").then(function (profile) {
      if (profile && profile.id) app.profile = profile;
      resumeOnboarding();
    });
  }

  /**
   * Séquence d'accueil demandée :
   *   1) coller l'URL du script + mot de passe éventuel (ou mode local) ;
   *   2) déverrouillage par mot de passe si l'appareil en a un (à chaque ouverture) ;
   *   3) saisir le nom d'utilisateur ;
   *   4) écran principal.
   */
  function resumeOnboarding() {
    if (!CONFIG.isConfigured() && !localAccepted()) {
      UI.showOnboardingUrl({
        onSaved: function () { resumeOnboarding(); },
        onLocal: function () { setLocalAccepted(); resumeOnboarding(); },
      });
      return;
    }
    // Verrou : mot de passe redemandé à chaque ouverture tant que le jeton
    // n'est pas en mémoire (rechargement = nouvelle saisie obligatoire).
    if (CONFIG.isConfigured() && CONFIG.hasPassword() && !Api.hasToken()) {
      UI.showLock({
        onUnlock: function () { resumeOnboarding(); },
        onLogout: function () { logoutTeam(); resumeOnboarding(); },
      });
      return;
    }
    if (!app.profile) {
      UI.showOnboardingName(function (name) {
        app.profile = { id: Utils.uuid(), name: name };
        pendingNewProfile = true;
        DB.metaSet("profile", app.profile).then(function () {
          resumeOnboarding();
        });
      });
      return;
    }
    var isNew = pendingNewProfile;
    pendingNewProfile = false;
    start(isNew);
  }

  // --- Connexion / mot de passe --------------------------------------------

  // Enregistre l'URL et, si un mot de passe est fourni, dérive le jeton serveur
  // (envoyé aux requêtes) et le vérificateur local (validation du verrou).
  // Aucun mot de passe n'est stocké : seul le vérificateur (un hachage) l'est.
  // Renvoie une promesse { ok } ou { ok:false, code, error }.
  function connect(url, password) {
    CONFIG.persistApiUrl(Utils.clean(url));
    var pw = password || "";
    var derive = pw
      ? Promise.all([Utils.sha256Hex(CONFIG.serverTokenInput(pw)), Utils.sha256Hex(CONFIG.verifierInput(pw))])
      : Promise.resolve([null, null]);

    return derive.then(function (res) {
      Api.setAuthToken(res[0]); // null s'il n'y a pas de mot de passe
      if (!CONFIG.isConfigured()) return { ok: false, error: "URL invalide." };
      return Api.getRevision()
        .then(function (info) {
          CONFIG.setVerifier(pw ? res[1] : "");
          Sync.emit();
          return { ok: true, revision: info && info.revision };
        })
        .catch(function (e) {
          var code = e && e.data && e.data.code;
          if (code === "auth") Api.clearAuthToken();
          return { ok: false, code: code, error: (e && e.message) || "Échec de connexion." };
        });
    });
  }

  // Déverrouille l'application avec le mot de passe saisi.
  //  - Si un vérificateur local existe : validation locale (fonctionne hors
  //    connexion), puis mise en mémoire du jeton serveur.
  //  - Sinon (ex. l'équipe a activé le mot de passe après coup) : on établit la
  //    connexion comme à l'accueil (validation en ligne + enregistrement).
  function unlock(password) {
    if (!CONFIG.hasPassword()) {
      return connect(CONFIG.API_URL, password).then(function (res) {
        return { ok: !!res.ok, code: res.code };
      });
    }
    return Utils.sha256Hex(CONFIG.verifierInput(password)).then(function (v) {
      if (v !== CONFIG.getVerifier()) return { ok: false };
      return Utils.sha256Hex(CONFIG.serverTokenInput(password)).then(function (tok) {
        Api.setAuthToken(tok);
        Sync.emit();
        return { ok: true };
      });
    });
  }

  // Reverrouille (inactivité, ou mot de passe exigé par le serveur en cours de
  // session) : efface le jeton et réaffiche l'écran de déverrouillage.
  function relock() {
    if (!CONFIG.isConfigured() || !CONFIG.hasPassword()) return;
    Api.clearAuthToken();
    Sync.stopPolling();
    Sync.emit();
    UI.showLock({
      onUnlock: function () { Sync.startPolling(); Sync.syncNow(); },
      onLogout: function () { logoutTeam(); location.reload(); },
    });
  }

  // Déconnecte l'appareil de l'équipe (efface URL + vérificateur + jeton).
  function logoutTeam() {
    Api.clearAuthToken();
    CONFIG.setVerifier("");
    CONFIG.persistApiUrl("");
    try { window.localStorage.removeItem(LOCAL_ACCEPTED_KEY); } catch (e) { /* ignore */ }
    Sync.emit();
  }

  function setApiUrl(url) {
    CONFIG.persistApiUrl(Utils.clean(url));
    Sync.emit();
    if (CONFIG.isConfigured()) return Sync.syncNow();
    return Promise.resolve();
  }

  function clearApiUrl() {
    logoutTeam();
    return Promise.resolve();
  }

  var startWired = false;
  var hiddenAt = null;

  function start(isNewProfile) {
    UI.reveal();

    // Le serveur exige un mot de passe (ou il a changé) : reverrouiller.
    Api.onAuthError(function () { relock(); });

    Sync.init({
      onChange: function (data) { UI.renderData(data); },
      onStatus: function (status) { UI.renderStatus(status); },
    }).then(function () {
      if (isNewProfile) {
        dispatch("REGISTER_PARTICIPANT", {});
      }
      parseRoute();
      UI.renderData(Sync.getData());
      Sync.startPolling();
      Sync.syncNow();
    });

    // Écouteurs globaux enregistrés une seule fois (start() peut être rappelé
    // après un déverrouillage).
    if (startWired) { registerServiceWorker(); return; }
    startWired = true;

    window.addEventListener("hashchange", function () {
      parseRoute();
      UI.renderData(Sync.getData());
    });

    window.addEventListener("online", function () {
      Sync.emit();
      Sync.syncNow();
    });
    window.addEventListener("offline", function () { Sync.emit(); });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        hiddenAt = new Date().getTime();
        return;
      }
      // Retour au premier plan : reverrouiller après une longue inactivité.
      if (CONFIG.hasPassword() && Api.hasToken() && hiddenAt &&
          (new Date().getTime() - hiddenAt) > CONFIG.LOCK_IDLE_MS) {
        hiddenAt = null;
        relock();
        return;
      }
      hiddenAt = null;
      Sync.syncNow();
    });

    registerServiceWorker();
  }

  // --- Profil ---------------------------------------------------------------

  function updateProfileName(name) {
    app.profile.name = name;
    DB.metaSet("profile", app.profile);
    dispatch("UPDATE_PARTICIPANT", {});
  }

  // --- Routage --------------------------------------------------------------

  function parseRoute() {
    const hash = location.hash || "#/";
    const parts = hash.replace(/^#\/?/, "").split("/");
    if (parts[0] === "topic" && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (parts[2] === "conclusion") app.route = { name: "conclusion", id: id };
      else app.route = { name: "topic", id: id };
    } else if (parts[0] === "meeting") app.route = { name: "meeting", id: null };
    else if (parts[0] === "settings") app.route = { name: "settings", id: null };
    else app.route = { name: "home", id: null };
  }

  function navigate(hash) {
    if (location.hash === hash) {
      parseRoute();
      UI.renderData(Sync.getData());
    } else {
      location.hash = hash;
    }
  }

  // --- Construction et envoi des actions ------------------------------------

  function dispatch(type, payload) {
    const action = {
      actionId: Utils.uuid(),
      type: type,
      createdAt: Utils.nowIso(),
      participant: { id: app.profile.id, name: app.profile.name },
      payload: payload || {},
    };
    return Sync.dispatch(action).then(function (res) {
      if (res && res.ok === false) UI.toast(res.error || "Action refusée.", "error");
      return res;
    });
  }

  app.actions = {
    createTopic: function (title, description, authorName) {
      const id = Utils.uuid();
      dispatch("CREATE_TOPIC", { topicId: id, title: title, description: description, authorName: authorName });
      return id;
    },
    updateTopic: function (topicId, title, description) {
      dispatch("UPDATE_TOPIC", { topicId: topicId, title: title, description: description });
    },
    changeTopicStatus: function (topicId, status) {
      dispatch("CHANGE_TOPIC_STATUS", { topicId: topicId, status: status });
    },
    createMessage: function (topicId, text) {
      dispatch("CREATE_MESSAGE", { topicId: topicId, messageId: Utils.uuid(), text: text });
    },
    updateMessage: function (topicId, messageId, text) {
      dispatch("UPDATE_MESSAGE", { topicId: topicId, messageId: messageId, text: text });
    },
    setReaction: function (topicId, messageId, emoji) {
      dispatch("SET_REACTION", { topicId: topicId, messageId: messageId, emoji: emoji });
    },
    createProposal: function (topicId, title, description) {
      const id = Utils.uuid();
      dispatch("CREATE_PROPOSAL", { topicId: topicId, proposalId: id, title: title, description: description });
      return id;
    },
    updateProposal: function (topicId, proposalId, title, description) {
      dispatch("UPDATE_PROPOSAL", { topicId: topicId, proposalId: proposalId, title: title, description: description });
    },
    changeProposalStatus: function (topicId, proposalId, status) {
      dispatch("CHANGE_PROPOSAL_STATUS", { topicId: topicId, proposalId: proposalId, status: status });
    },
    setVote: function (topicId, proposalId, vote) {
      dispatch("SET_VOTE", { topicId: topicId, proposalId: proposalId, vote: vote });
    },
    removeVote: function (topicId, proposalId) {
      dispatch("REMOVE_VOTE", { topicId: topicId, proposalId: proposalId });
    },
    updateConclusion: function (topicId, conclusion) {
      dispatch("UPDATE_CONCLUSION", { topicId: topicId, conclusion: conclusion });
    },
    addConclusion: function (topicId, text) {
      const id = Utils.uuid();
      dispatch("ADD_CONCLUSION", { topicId: topicId, conclusionId: id, text: text });
      return id;
    },
    updateConclusionItem: function (topicId, conclusionId, text) {
      dispatch("UPDATE_CONCLUSION_ITEM", { topicId: topicId, conclusionId: conclusionId, text: text });
    },
    deleteConclusion: function (topicId, conclusionId) {
      dispatch("DELETE_CONCLUSION", { topicId: topicId, conclusionId: conclusionId });
    },
    setConclusionVote: function (topicId, conclusionId) {
      dispatch("SET_CONCLUSION_VOTE", { topicId: topicId, conclusionId: conclusionId });
    },
    removeConclusionVote: function (topicId) {
      dispatch("REMOVE_CONCLUSION_VOTE", { topicId: topicId });
    },
  };

  // --- Service worker & mises à jour ----------------------------------------

  let waitingWorker = null;

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("service-worker.js")
      .then(function (reg) {
        // Nouveau worker déjà en attente ?
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          UI.setUpdateAvailable(true);
        }
        reg.addEventListener("updatefound", function () {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", function () {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorker = nw;
              UI.setUpdateAvailable(true);
            }
          });
        });
      })
      .catch(function () { /* SW indisponible : l'application reste utilisable */ });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      // On ne recharge QUE si la mise à jour a été demandée par l'utilisateur.
      // Le premier contrôle (clients.claim au tout premier chargement) déclenche
      // aussi controllerchange : il ne doit pas provoquer de rechargement.
      if (!userTriggeredUpdate || reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  var userTriggeredUpdate = false;
  var reloading = false;

  function applyUpdate() {
    // Conserve IndexedDB (données locales + file d'actions) : on ne fait
    // qu'activer le nouveau worker puis recharger.
    userTriggeredUpdate = true;
    if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
    else window.location.reload();
  }

  return {
    boot: boot,
    navigate: navigate,
    updateProfileName: updateProfileName,
    setApiUrl: setApiUrl,
    clearApiUrl: clearApiUrl,
    connect: connect,
    unlock: unlock,
    logoutTeam: logoutTeam,
    applyUpdate: applyUpdate,
    get profile() { return app.profile; },
    get route() { return app.route; },
    actions: app.actions,
  };
})();

document.addEventListener("DOMContentLoaded", App.boot);
