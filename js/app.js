/* BrainstO. — démarrage, navigation, verrou et actions utilisateur. */
(function (root) {
  "use strict";

  var App = {};

  App.user = { id: "", name: "" };
  App.route = { raw: "#/", name: "topics", topicId: null };
  App.editingConnection = false;

  var lockVerifier = null;     // hachage conservé sur l'appareil (jamais le code)
  var unlocked = false;
  var lastActivity = 0;        // dernière manipulation réelle, en mémoire
  var savedActivity = 0;       // dernière valeur écrite sur l'appareil
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

  /* ------------------------------------------------------------ Session --- */

  /* Ce que l'application accepte de garder sur l'appareil entre deux ouvertures :
   * le jeton serveur et l'heure de la dernière manipulation. JAMAIS le code —
   * il reste inconnu de l'appareil, comme avant.
   *
   * Le jeton, lui, ne vivait qu'en mémoire vive : c'est ce qui obligeait à
   * ressaisir le code à chaque ouverture. On le pose donc sur le disque, mais
   * sous conditions strictes : il disparaît au reverrouillage, à la
   * déconnexion, au refus du serveur, et il expire seul après LOCK_IDLE_MS.
   * Le compromis est explicite — un accès physique à l'appareil déverrouillé
   * dans l'heure donne le jeton, exactement comme il donnait déjà l'accès à
   * l'application ouverte. */

  function writeSession(at) {
    if (!lockVerifier || !unlocked) { return; }
    savedActivity = at;
    Utils.storage.set(CONFIG.KEYS.session, {
      v: lockVerifier, t: Sync.connection.token || "", at: at
    });
  }

  function clearSession() {
    savedActivity = 0;
    Utils.storage.remove(CONFIG.KEYS.session);
  }

  function startSession() {
    lastActivity = Date.now();
    writeSession(lastActivity);
  }

  /* Toute manipulation repousse l'échéance. L'écriture, elle, est espacée. */
  function touch() {
    var now = Date.now();
    lastActivity = now;
    if (now - savedActivity >= CONFIG.SESSION_TOUCH_MS) { writeSession(now); }
  }

  function sessionExpired() {
    if (!lockVerifier || !unlocked) { return false; }
    return Date.now() - lastActivity > CONFIG.LOCK_IDLE_MS;
  }

  /* ---------------------------------------------------------- Connexion --- */

  App.connectionConfigured = function () {
    return !!Sync.connection.url || Sync.connection.localMode;
  };

  function loadConnection() {
    var url = Utils.storage.get(CONFIG.KEYS.apiUrl, "");
    var localMode = Utils.storage.get(CONFIG.KEYS.localMode, false) === true;
    lockVerifier = Utils.storage.get(CONFIG.KEYS.lockVerifier, null);

    /* Rouvrir l'application ne reverrouille plus : on reprend la session tant
     * que la dernière manipulation date de moins d'une heure. */
    var token = "";
    if (localMode || !lockVerifier) {
      unlocked = true;
    } else {
      var session = CONFIG.sessionUsable(
        Utils.storage.get(CONFIG.KEYS.session, null), lockVerifier, Date.now()
      );
      unlocked = !!session;
      if (session) { token = session.token; }
      else { clearSession(); }
    }

    Sync.setConnection({ url: url || "", token: token, localMode: localMode, unlocked: unlocked });
    /* Ouvrir l'application EST une manipulation : l'heure repart d'ici. */
    if (unlocked) { startSession(); }
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
      if (result.verifier) { startSession(); } else { clearSession(); }
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
    clearSession();
    lockVerifier = null;
    unlocked = true;
    App.editingConnection = false;
    Sync.setConnection({ url: "", token: "", localMode: true, unlocked: true });
    UI.toast("Mode local activé : les données restent sur cet appareil.");
    UI.force();
  };

  /* ⚠️ La déconnexion efface l'identité locale ET la liste des éléments propres.
   *
   * `ownItems` n'est pas une préférence de confort : c'est la SEULE pièce qui prouve la
   * paternité d'un message anonyme, puisqu'un tel message n'a plus d'authorId. C'est
   * donc un porteur de droit, au même titre qu'un jeton de session — et le garder
   * transmettait à la personne suivante sur ce téléphone le droit de modifier les
   * messages anonymes de la précédente. L'anonymat restait vrai côté serveur et
   * devenait faux côté appareil : l'appareil était le maillon conservé.
   *
   * Corollaire assumé, et annoncé dans la confirmation : après une déconnexion, on ne
   * peut plus modifier ses propres messages anonymes depuis cet appareil. Ce n'est pas
   * une régression, c'est ce que « anonyme » veut dire.
   *
   * ⚠️ ORDRE : la file d'actions est vidée par cette même fonction. La confirmation
   * doit donc annoncer ce qui est en attente AVANT d'arriver ici — effacer les
   * porteurs de droit sans le dire détruirait du travail non synchronisé. */
  App.logout = function () {
    Utils.storage.remove(CONFIG.KEYS.apiUrl);
    Utils.storage.remove(CONFIG.KEYS.lockVerifier);
    Utils.storage.remove(CONFIG.KEYS.localMode);
    Utils.storage.remove(CONFIG.KEYS.user);
    Utils.storage.remove(CONFIG.KEYS.ownItems);
    ownItems = [];
    clearSession();
    lockVerifier = null;
    unlocked = false;
    App.editingConnection = false;
    Sync.stop();
    Sync.setConnection({ url: "", token: "", localMode: false, unlocked: false });
    Promise.all([DB.clearQueue(), DB.clearState()]).then(function () {
      Store.setBase(Core.emptyState());
      Store.setQueue([]);
      /* Identité neuve : la personne suivante repasse par l'écran du nom. */
      loadUser();
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
        startSession();
        Sync.start();
        Sync.now();
        UI.force();
      });
    });
  };

  App.relock = function () {
    if (!lockVerifier) { return; }
    unlocked = false;
    clearSession();
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

  /* ------------------------------------------ Présentation initiale --- */

  /* La règle qui décide est pure et vit dans js/config.js, testée par
   * tests/onboarding.test.js. Ici, uniquement le câblage : lire, écrire, et dire à
   * l'interface ce qu'elle doit jouer. */

  var onboardingWanted = false;   // la règle a dit oui, la séquence n'est pas encore jouée
  var onboardingStep = 0;
  var onboardingShown = false;    // déjà affichée dans CE chargement

  function onboardingContext() {
    return {
      hasConnection: !!Sync.connection.url,
      localMode: Sync.connection.localMode === true,
      hasName: !!App.user.name,
      hasTopics: !!(Store.view && Store.view.topics && Store.view.topics.length)
    };
  }

  function onboardingDecide() {
    /* Chargement mixte : la navigation est servie en network-first et les
     * sous-ressources en cache-first, donc un `index.html` neuf peut cohabiter avec
     * un `js/config.js` de cache ancien. Sans cette garde, l'appel lèverait une
     * exception ICI — c'est-à-dire AVANT `Sync.boot()`, donc avant que la file
     * d'actions ne soit relue et rejouée. Un onboarding raté ne doit jamais coûter
     * une file d'actions. */
    if (typeof CONFIG.onboardingDue !== "function") { return null; }
    return CONFIG.onboardingDue(
      Utils.storage.get(CONFIG.KEYS.onboarding, null),
      onboardingContext(),
      CONFIG.ONBOARDING_REV,
      Date.now()
    );
  }

  /* Une seule écriture, en un seul objet : une écriture partielle est ainsi
   * impossible si le stockage refuse en cours de route. On conserve l'horodatage du
   * premier lancement quand il est sain — c'est la seule valeur historique du
   * dossier. */
  function writeOnboarding(patch) {
    var saved = Utils.storage.get(CONFIG.KEYS.onboarding, null);
    var now = Date.now();
    var at = (saved && typeof saved.at === "number" && isFinite(saved.at) && saved.at <= now)
      ? saved.at : now;
    var record = {
      s: CONFIG.ONBOARDING_SCHEMA, rev: CONFIG.ONBOARDING_REV, at: at,
      step: 0, done: false, skipped: false, migrated: false
    };
    Object.keys(patch || {}).forEach(function (key) { record[key] = patch[key]; });
    /* ⚠️ Le retour est volontairement lu : `Utils.storage.set` échoue en SILENCE
     * (navigation privée, quota). Sans ce test, la présentation reviendrait à
     * chaque ouverture chez les appareils au stockage refusé. Le garde-fou est
     * alors le drapeau en mémoire `onboardingShown`, qui vaut pour ce chargement. */
    return Utils.storage.set(CONFIG.KEYS.onboarding, record) === true;
  }

  function loadOnboarding() {
    var plan = onboardingDecide();
    if (!plan) { return; }
    if (plan.reason === "migrate") {
      /* Appareil qui a DÉJÀ servi : on pose la marque et on n'affiche rien. C'est
       * la branche la plus importante du chantier — sans elle, la mise à jour
       * ferait revoir la présentation à toute l'équipe le même jour. */
      writeOnboarding({ done: true, migrated: true });
      return;
    }
    onboardingWanted = true;
    onboardingStep = plan.step;

    /* ⚠️ On POSE l'enregistrement tout de suite, avant même d'avoir affiché quoi que
     * ce soit. Sans cela, l'appareil traverse les gates — adresse, puis prénom — et
     * se présente ensuite à la règle avec les signes d'un appareil déjà utilisé,
     * mais sans enregistrement : elle répond « migrate », et la séquence ne
     * s'affiche JAMAIS à la première connexion. C'est le défaut que la revue a
     * trouvé, et il ne se voit pas si l'on préremplit le stockage pour tester. */
    writeOnboarding({ done: false, step: plan.step });
  }

  App.onboardingWanted = function () { return onboardingWanted && !onboardingShown; };

  /* Le segment ne se connaît qu'au moment d'afficher : au démarrage, l'état de
   * l'équipe n'est pas encore rapatrié, donc on ne sait pas si l'espace est vide.
   * La règle étant pure, la rappeler ici ne coûte rien et donne la bonne réponse. */
  /* Ce qu'il reste à jouer. La DÉCISION a été prise au démarrage et vit en mémoire :
   * on ne la rejoue pas ici. Seul le SEGMENT se calcule maintenant, parce qu'il
   * dépend de l'état de l'équipe, qui n'était pas encore rapatrié au démarrage.
   *
   * ⚠️ Ne pas rappeler `onboardingDue` ici : à cet instant l'appareil porte une
   * adresse et un prénom, et la règle le prendrait pour un appareil déjà utilisé. */
  App.onboardingPlan = function () {
    if (!onboardingWanted) { return null; }
    var segment = CONFIG.onboardingSegment(onboardingContext());
    var panels = CONFIG.ONBOARDING_PANELS[segment] || CONFIG.ONBOARDING_PANELS.full;
    return {
      panels: panels.slice(),
      step: Math.max(0, Math.min(onboardingStep, panels.length - 1)),
      segment: segment
    };
  };

  App.markOnboardingShown = function () { onboardingShown = true; };

  App.noteOnboardingStep = function (step) {
    onboardingStep = step;
    writeOnboarding({ step: step });
  };

  App.finishOnboarding = function (skipped) {
    onboardingWanted = false;
    writeOnboarding({ done: true, skipped: skipped === true, step: 0 });
  };

  /* État lisible dans les réglages. Volontairement sans date exacte : « vue » suffit,
   * et afficher un horodatage inviterait à en tirer des conclusions que cet
   * enregistrement ne porte pas. */
  App.onboardingState = function () {
    var saved = Utils.storage.get(CONFIG.KEYS.onboarding, null);
    /* ⚠️ Avant de dire « pas encore vue », vérifier que cet appareil peut retenir
     * quoi que ce soit. Sans cette branche, la phrase s'affiche juste après que la
     * séquence a été vue et terminée — parce que l'écriture a échoué en silence. */
    if (!saved && !Utils.storage.available()) { return "sans-mémoire"; }
    if (!saved || typeof saved !== "object") { return "inconnue"; }
    if (saved.migrated === true) { return "migrée"; }
    if (saved.done === true) { return saved.skipped === true ? "passée" : "vue"; }
    return "en cours";
  };

  App.replayOnboarding = function () {
    var stored = writeOnboarding({ done: false, step: 0 });
    onboardingWanted = true;
    onboardingStep = 0;
    onboardingShown = false;
    /* ⚠️ On ne navigue PAS. C'était le cas prévu au cadrage, et c'était une erreur :
     * quitter les réglages détruit le champ « Votre nom », donc un prénom en cours de
     * saisie — le relais de brouillons ne franchit un changement d'écran que pour les
     * clés `composer:`. Et la navigation n'apporte rien : les panneaux ne décrivent
     * aucun écran précis, la séquence est valable où que l'on soit. Une exception de
     * moins à la règle « la séquence ne navigue jamais à la place de l'utilisateur ». */
    UI.replayOnboarding();
    /* Dit APRÈS la séquence, jamais avant : sous le calque supérieur, un toast est
     * recouvert pendant toute sa durée de vie, et l'arrière-plan étant inerte il n'est
     * probablement pas annoncé non plus. Un message d'erreur qu'on ne peut ni voir ni
     * entendre n'existe pas. */
    if (!stored) {
      /* `UI.toast` met lui-même de côté les messages levés pendant la séquence, et les
       * dit au démontage : sous le calque supérieur, un toast est recouvert et retiré
       * de l'arbre d'accessibilité avec l'arrière-plan inerte. */
      UI.toast("Cet appareil n'enregistre rien : la présentation ne sera pas mémorisée.", "error");
    }
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
      /* Un worker peut être DÉJÀ en cours d'installation quand `register()` résout :
       * `updatefound` est alors parti avant que nous n'écoutions, et `waiting` est
       * encore nul — sans cette ligne, cette mise à jour n'a aucun bandeau, et il faut
       * attendre le chargement suivant pour en proposer un. */
      watch(registration.installing);
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

    /* Ce qui compte comme manipulation : un doigt, un clic, une touche. La
     * boucle de synchronisation, qui tourne toute seule y compris onglet
     * masqué, ne repousse RIEN — sinon l'application ne se verrouillerait
     * jamais. */
    ["pointerdown", "touchstart", "keydown"].forEach(function (name) {
      window.addEventListener(name, touch, { passive: true, capture: true });
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        /* On fige l'heure exacte AVANT de partir : le système peut tuer
         * l'application sans prévenir, et c'est cette valeur qui décidera au
         * retour s'il faut redemander le code. */
        writeSession(lastActivity);
        return;
      }
      if (sessionExpired()) { App.relock(); return; }
      touch();
      Sync.now();
      Sync.start();
    });

    /* iOS ne garantit pas visibilitychange à la fermeture ; pagehide, si. */
    window.addEventListener("pagehide", function () { writeSession(lastActivity); });

    /* Une heure sans rien toucher doit reverrouiller MÊME application ouverte
     * à l'écran. Un contrôle par minute suffit et ne coûte rien. */
    setInterval(function () {
      if (sessionExpired()) { App.relock(); }
    }, CONFIG.IDLE_CHECK_MS);

    window.addEventListener("online", function () { UI.refreshStatus(); Sync.now(); });
    window.addEventListener("offline", function () { UI.refreshStatus(); });

    window.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") { return; }
      /* La présentation passe d'abord : en modal, le dialogue sert Échap
       * nativement, mais sans cette branche on déclencherait EN PLUS un rendu
       * complet de l'écran de fond à chaque appui — et sur le chemin de repli, où
       * il n'y a pas de <dialog>, Échap ne fermerait rien. */
      if (UI.onboardingActive()) { UI.closeOnboarding(true); return; }
      UI.set({ sheet: null, modal: null });
    });
  }

  App.start = function () {
    UI.init();
    loadUser();
    loadOwnItems();
    loadConnection();
    /* Après loadConnection : la décision a besoin de savoir si cet appareil porte
     * déjà une adresse ou un mode local, sans quoi elle prendrait une installation
     * existante pour un appareil neuf. */
    loadOnboarding();
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
