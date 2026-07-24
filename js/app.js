/* BrainstO. — démarrage, navigation, verrou et actions utilisateur. */
(function (root) {
  "use strict";

  var App = {};

  App.user = { id: "", name: "" };
  App.route = { raw: "#/", name: "topics", topicId: null };
  App.editingConnection = false;

  var lockVerifier = null;     // hachage conservé sur l'appareil (jamais le code)
  var unlocked = false;
  var hiddenSince = null;
  var ownItems = [];           // identifiants créés sur CET appareil (jamais partagé)
  var updateRequested = false;

  /* ------------------------------------------------------------ Identité --- */

  function loadUser() {
    var saved = Utils.storage.get(CONFIG.KEYS.user, null);
    if (saved && saved.id) {
      App.user = { id: String(saved.id), name: Utils.limit(saved.name, Core.LIMITS.name) };
    } else {
      App.user = { id: Utils.uid(), name: "" };
      Utils.storage.set(CONFIG.KEYS.user, App.user);
    }
  }

  function loadOwnItems() {
    var saved = Utils.storage.get(CONFIG.KEYS.ownItems, []);
    ownItems = Array.isArray(saved) ? saved.filter(function (id) { return typeof id === "string"; }) : [];
  }

  function remember(id) {
    if (!id || ownItems.indexOf(id) >= 0) { return; }
    ownItems.push(id);
    if (ownItems.length > 2000) { ownItems = ownItems.slice(-2000); }
    Utils.storage.set(CONFIG.KEYS.ownItems, ownItems);
  }

  /* Un message anonyme n'a plus d'authorId : ce suivi LOCAL permet à son auteur
   * de continuer à le modifier et à re-signer. Il n'est jamais envoyé. */
  App.ownsMessage = function (message) {
    if (!message) { return false; }
    if (message.authorId && message.authorId === App.user.id) { return true; }
    return ownItems.indexOf(message.id) >= 0;
  };

  App.ownsItem = function (id, authorId) {
    if (authorId && authorId === App.user.id) { return true; }
    return ownItems.indexOf(id) >= 0;
  };

  /* ---------------------------------------------------------- Connexion --- */

  App.connectionConfigured = function () {
    return !!Sync.connection.url || Sync.connection.localMode;
  };

  function loadConnection() {
    var url = Utils.storage.get(CONFIG.KEYS.apiUrl, "");
    var localMode = Utils.storage.get(CONFIG.KEYS.localMode, false) === true;
    lockVerifier = Utils.storage.get(CONFIG.KEYS.lockVerifier, null);
    /* Le jeton ne vit qu'en mémoire : rouvrir l'application reverrouille. */
    unlocked = localMode || !lockVerifier;
    Sync.setConnection({ url: url || "", token: "", localMode: localMode, unlocked: unlocked });
  }

  App.saveConnection = function (url, code) {
    var clean = Utils.trim(url);
    if (!clean) { UI.toast("Collez l'adresse du script de l'équipe.", "error"); return; }
    /* https obligatoire, sauf pour un serveur local de test. */
    var isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(clean);
    if (clean.indexOf("https://") !== 0 && !isLocal) {
      UI.toast("L'adresse doit commencer par https://", "error");
      return;
    }

    var trimmedCode = String(code == null ? "" : code);
    var tokenPromise = trimmedCode
      ? Utils.sha256Hex(CONFIG.serverTokenInput(trimmedCode))
      : Promise.resolve("");
    var verifierPromise = trimmedCode
      ? Utils.sha256Hex(CONFIG.verifierInput(trimmedCode))
      : Promise.resolve(null);

    Promise.all([tokenPromise, verifierPromise]).then(function (result) {
      var token = result[0];
      var verifier = result[1];
      /* On vérifie tout de suite auprès du serveur : un code faux doit se voir
       * maintenant, pas au premier message. */
      return Api.getRevision(clean, token).then(function () {
        return { token: token, verifier: verifier, reachable: true };
      }, function (error) {
        if (Api.isAuthError(error)) { throw error; }
        return { token: token, verifier: verifier, reachable: false };
      });
    }).then(function (result) {
      Utils.storage.set(CONFIG.KEYS.apiUrl, clean);
      Utils.storage.set(CONFIG.KEYS.localMode, false);
      if (result.verifier) { Utils.storage.set(CONFIG.KEYS.lockVerifier, result.verifier); }
      else { Utils.storage.remove(CONFIG.KEYS.lockVerifier); }
      lockVerifier = result.verifier;
      unlocked = true;
      App.editingConnection = false;
      Sync.setConnection({ url: clean, token: result.token, localMode: false, unlocked: true });
      if (!result.reachable) {
        UI.toast("Adresse enregistrée, mais le serveur n'a pas répondu. Réessai automatique.", "error");
      } else {
        UI.toast("Connexion établie.");
      }
      Sync.start();
      Sync.now();
      UI.force();
    }).catch(function (error) {
      if (Api.isAuthError(error)) {
        UI.toast("Code d'accès refusé par le serveur.", "error");
      } else {
        UI.toast(error && error.message ? error.message : "Connexion impossible.", "error");
      }
    });
  };

  App.editConnection = function () {
    App.editingConnection = true;
    UI.force();
  };

  App.useLocalMode = function () {
    Utils.storage.set(CONFIG.KEYS.localMode, true);
    Utils.storage.remove(CONFIG.KEYS.apiUrl);
    Utils.storage.remove(CONFIG.KEYS.lockVerifier);
    lockVerifier = null;
    unlocked = true;
    App.editingConnection = false;
    Sync.setConnection({ url: "", token: "", localMode: true, unlocked: true });
    UI.toast("Mode local activé : les données restent sur cet appareil.");
    UI.force();
  };

  App.logout = function () {
    Utils.storage.remove(CONFIG.KEYS.apiUrl);
    Utils.storage.remove(CONFIG.KEYS.lockVerifier);
    Utils.storage.remove(CONFIG.KEYS.localMode);
    lockVerifier = null;
    unlocked = false;
    App.editingConnection = false;
    Sync.stop();
    Sync.setConnection({ url: "", token: "", localMode: false, unlocked: false });
    Promise.all([DB.clearQueue(), DB.clearState()]).then(function () {
      Store.setBase(Core.emptyState());
      Store.setQueue([]);
      UI.set({ sheet: null, modal: null });
      App.go("#/");
      UI.force();
      UI.toast("Déconnecté de l'équipe.");
    });
  };

  /* ------------------------------------------------------------- Verrou --- */

  App.needsUnlock = function () {
    return !!lockVerifier && !unlocked;
  };

  App.unlock = function (code) {
    var value = String(code == null ? "" : code);
    if (!value) { UI.toast("Saisissez le code d'accès.", "error"); return; }
    Utils.sha256Hex(CONFIG.verifierInput(value)).then(function (verifier) {
      if (verifier !== lockVerifier) {
        UI.toast("Code d'accès incorrect.", "error");
        return null;
      }
      return Utils.sha256Hex(CONFIG.serverTokenInput(value)).then(function (token) {
        unlocked = true;
        Sync.setConnection({ token: token, unlocked: true });
        Sync.start();
        Sync.now();
        UI.force();
      });
    });
  };

  App.relock = function () {
    if (!lockVerifier) { return; }
    unlocked = false;
    Sync.setConnection({ token: "", unlocked: false });
    Sync.stop();
    UI.set({ sheet: null, modal: null });
    UI.force();
  };

  App.gate = function () {
    if (!App.connectionConfigured() || App.editingConnection) { return "connection"; }
    if (App.needsUnlock()) { return "lock"; }
    if (!App.user.name) { return "name"; }
    return null;
  };

  /* ---------------------------------------------------------------- Nom --- */

  App.saveName = function (name, silent) {
    var clean = Utils.limit(name, Core.LIMITS.name);
    if (!clean) { UI.toast("Le nom est obligatoire.", "error"); return; }
    App.user.name = clean;
    Utils.storage.set(CONFIG.KEYS.user, App.user);
    Sync.dispatch(Sync.makeAction("REGISTER_PARTICIPANT", {
      participantId: App.user.id, name: clean
    }, App.user));
    if (silent) { UI.toast("Nom enregistré."); }
    UI.force();
  };

  /* ------------------------------------------------------------ Routeur --- */

  function parseRoute(hash) {
    var raw = hash || "#/";
    var path = raw.replace(/^#\/?/, "");
    var parts = path.split("/").filter(Boolean);
    if (!parts.length) { return { raw: "#/", name: "topics", topicId: null }; }
    if (parts[0] === "settings") { return { raw: raw, name: "settings", topicId: null }; }
    if (parts[0] === "meeting") { return { raw: raw, name: "meeting", topicId: null }; }
    if (parts[0] === "topic" && parts[1]) {
      if (parts[2] === "proposals") { return { raw: raw, name: "proposals", topicId: parts[1] }; }
      if (parts[2] === "conclusion") { return { raw: raw, name: "conclusion", topicId: parts[1] }; }
      return { raw: raw, name: "topic", topicId: parts[1] };
    }
    return { raw: "#/", name: "topics", topicId: null };
  }

  App.go = function (hash) {
    if (window.location.hash === hash) {
      App.route = parseRoute(hash);
      UI.force();
      return;
    }
    window.location.hash = hash;
  };

  function onHashChange() {
    App.route = parseRoute(window.location.hash);
    UI.set({ sheet: null, modal: null, quote: null });
  }

  /* ------------------------------------------------------------ Actions --- */

  function dispatch(type, payload, actorOverride) {
    return Sync.dispatch(Sync.makeAction(type, payload, actorOverride || App.user));
  }

  App.actions = {
    createTopic: function (title, description, authorName) {
      var topicId = Utils.uid();
      var anon = !Utils.trim(authorName);
      var actor = anon ? { id: "", name: Core.ANON_NAME } : { id: App.user.id, name: Utils.limit(authorName, Core.LIMITS.name) };
      dispatch("CREATE_TOPIC", {
        topicId: topicId, title: title, description: description, anon: anon
      }, actor).then(function (result) {
        if (!result || result.ok === false) { return; }
        remember(topicId);
        UI.set({ modal: null });
        App.go("#/topic/" + topicId);
      });
    },

    updateTopic: function (topicId, title, description) {
      dispatch("UPDATE_TOPIC", { topicId: topicId, title: title, description: description })
        .then(function () { UI.set({ modal: null }); });
    },

    changeTopicStatus: function (topicId, status) {
      dispatch("CHANGE_TOPIC_STATUS", { topicId: topicId, status: status });
    },

    createMessage: function (topicId, text, quoteId, anon) {
      var messageId = Utils.uid();
      var actor = anon ? { id: "", name: Core.ANON_NAME } : App.user;
      remember(messageId);
      dispatch("CREATE_MESSAGE", {
        topicId: topicId, messageId: messageId, text: text, quoteId: quoteId || null, anon: !!anon
      }, actor);
      UI.set({ quote: null });
    },

    updateMessage: function (topicId, messageId, text) {
      dispatch("UPDATE_MESSAGE", { topicId: topicId, messageId: messageId, text: text })
        .then(function () { UI.set({ modal: null }); });
    },

    setMessageSignature: function (topicId, messageId, anon) {
      dispatch("SET_MESSAGE_SIGNATURE", { topicId: topicId, messageId: messageId, anon: !!anon });
    },

    setReaction: function (topicId, messageId, emoji) {
      dispatch("SET_REACTION", { topicId: topicId, messageId: messageId, emoji: emoji });
    },

    createProposal: function (topicId, title, description) {
      var proposalId = Utils.uid();
      remember(proposalId);
      dispatch("CREATE_PROPOSAL", {
        topicId: topicId, proposalId: proposalId, title: title, description: description
      }).then(function (result) {
        if (!result || result.ok === false) { return; }
        UI.set({ modal: null });
        App.go("#/topic/" + topicId + "/proposals");
      });
    },

    updateProposal: function (topicId, proposalId, title, description) {
      dispatch("UPDATE_PROPOSAL", { topicId: topicId, proposalId: proposalId, title: title, description: description })
        .then(function () { UI.set({ modal: null }); });
    },

    changeProposalStatus: function (topicId, proposalId, status) {
      dispatch("CHANGE_PROPOSAL_STATUS", { topicId: topicId, proposalId: proposalId, status: status });
    },

    setVote: function (topicId, proposalId, value) {
      dispatch("SET_VOTE", { topicId: topicId, proposalId: proposalId, value: value });
    },

    removeVote: function (topicId, proposalId) {
      dispatch("REMOVE_VOTE", { topicId: topicId, proposalId: proposalId });
    },

    addConclusion: function (topicId, text) {
      var conclusionId = Utils.uid();
      remember(conclusionId);
      dispatch("ADD_CONCLUSION", { topicId: topicId, conclusionId: conclusionId, text: text });
    },

    updateConclusion: function (topicId, conclusionId, text) {
      dispatch("UPDATE_CONCLUSION_ITEM", { topicId: topicId, conclusionId: conclusionId, text: text })
        .then(function () { UI.set({ modal: null }); });
    },

    deleteConclusion: function (topicId, conclusionId) {
      dispatch("DELETE_CONCLUSION", { topicId: topicId, conclusionId: conclusionId })
        .then(function () { UI.set({ modal: null }); });
    },

    setConclusionVote: function (topicId, conclusionId) {
      dispatch("SET_CONCLUSION_VOTE", { topicId: topicId, conclusionId: conclusionId });
    }
  };

  /* ---------------------------------------------------- Service worker --- */

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) { return; }
    navigator.serviceWorker.register("service-worker.js").then(function (registration) {
      function watch(worker) {
        if (!worker) { return; }
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            UI.showUpdateBanner(function () {
              updateRequested = true;
              worker.postMessage({ type: "SKIP_WAITING" });
            });
          }
        });
      }
      if (registration.waiting && navigator.serviceWorker.controller) {
        UI.showUpdateBanner(function () {
          updateRequested = true;
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        });
      }
      registration.addEventListener("updatefound", function () { watch(registration.installing); });
    }).catch(function () { /* hors ligne ou contexte non sécurisé */ });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      /* ⚠️ On ne recharge QUE si l'utilisateur a demandé la mise à jour :
       * sinon le tout premier chargement partirait en boucle. */
      if (updateRequested) { window.location.reload(); }
    });
  }

  /* --------------------------------------------------------- Démarrage --- */

  function bindGlobalEvents() {
    window.addEventListener("hashchange", onHashChange);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }
      var away = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = null;
      if (away > CONFIG.LOCK_BACKGROUND_MS) {
        App.relock();
        return;
      }
      Sync.now();
      Sync.start();
    });

    window.addEventListener("online", function () { UI.refreshStatus(); Sync.now(); });
    window.addEventListener("offline", function () { UI.refreshStatus(); });

    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { UI.set({ sheet: null, modal: null }); }
    });
  }

  App.start = function () {
    UI.init();
    loadUser();
    loadOwnItems();
    loadConnection();
    UI.local.showArchived = Utils.storage.get(CONFIG.KEYS.showArchived, false) === true;
    App.route = parseRoute(window.location.hash);

    Sync.setHooks({
      onChange: function () { UI.render(); UI.refreshStatus(); },
      onMessage: function (text, kind) { UI.toast(text, kind); },
      onAuthError: function () {
        UI.toast("Code d'accès refusé : espace reverrouillé.", "error");
        App.relock();
      }
    });
    Sync.subscribe(function () { UI.refreshStatus(); });

    bindGlobalEvents();

    Sync.boot().then(function () {
      UI.force();
      if (Sync.isConnected()) { Sync.start(); Sync.now(); }
    });

    registerServiceWorker();
  };

  root.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.start);
  } else {
    App.start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
