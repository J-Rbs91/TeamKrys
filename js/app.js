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
   *   1) coller l'URL du script (ou choisir le mode local) ;
   *   2) saisir le nom d'utilisateur ;
   *   3) écran principal.
   */
  function resumeOnboarding() {
    if (!CONFIG.isConfigured() && !localAccepted()) {
      UI.showOnboardingUrl({
        onSaved: function () { resumeOnboarding(); },
        onLocal: function () { setLocalAccepted(); resumeOnboarding(); },
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

  // Enregistre l'URL de l'API saisie par l'utilisateur (uniquement dans le
  // localStorage de l'appareil, jamais dans le dépôt) et relance la
  // synchronisation. Renvoie une promesse permettant de tester la connexion.
  function setApiUrl(url) {
    CONFIG.persistApiUrl(Utils.clean(url));
    Sync.emit();
    if (CONFIG.isConfigured()) return Sync.syncNow();
    return Promise.resolve();
  }

  function clearApiUrl() {
    CONFIG.persistApiUrl("");
    Sync.emit();
    return Promise.resolve();
  }

  function start(isNewProfile) {
    UI.reveal();
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
      if (document.visibilityState === "visible") Sync.syncNow();
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
    applyUpdate: applyUpdate,
    get profile() { return app.profile; },
    get route() { return app.route; },
    actions: app.actions,
  };
})();

document.addEventListener("DOMContentLoaded", App.boot);
