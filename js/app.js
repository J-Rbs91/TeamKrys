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

  /* ⚠️ Brouillons (BL-059) : écrits sur l'appareil juste avant tout ce qui peut détruire la page (arrière-plan,
   * fermeture, rechargement d'une mise à jour) et effacés à la déconnexion. Les deux appels sont gardés : un
   * ancien js/ui.js en cache n'a pas ces fonctions, et un stockage refusé ne doit jamais faire échouer ce qui suit. */
  function saveDrafts() {
    try { if (typeof UI.flushDrafts === "function") { UI.flushDrafts(); } } catch (e) { /* stockage refusé */ }
  }

  function discardDrafts() {
    try { if (typeof UI.clearDrafts === "function") { UI.clearDrafts(); } } catch (e) { /* stockage refusé */ }
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

  /* ⚠️ Stockage de l'appareil refusé (WebView, cookies et données de site bloqués) :
   * `Utils.storage.set` échoue en SILENCE. Connecté quand même, l'appareil oubliait tout au
   * rechargement : retour muet à l'écran de connexion et identité NEUVE (un participant de
   * plus pour l'équipe) à chaque ouverture. On sonde donc au démarrage (App.start), UN message
   * honnête, et on n'enregistre pas la connexion plutôt que de dupliquer les identités. Le mode
   * local, qui n'envoie rien à l'équipe, reste possible. */
  var STORAGE_REFUSED = "Ce navigateur refuse d'enregistrer des données sur l'appareil : ouvrez BrainstO. dans votre navigateur habituel.";
  var storageRefused = false;

  /* Texte du refus de stockage pour l'écran de connexion (js/ui.js) : une ligne fixe, là où le
   * toast du démarrage disparaît. Vide quand le stockage fonctionne. Le texte n'est écrit qu'ici. */
  App.storageMessage = function () { return storageRefused ? STORAGE_REFUSED : ""; };

  /* Saisie refusée : le message est aussi relié au champ (aria-invalid, aria-describedby : A11-017),
   * pas seulement annoncé par un toast qui disparaît. Gardé pour un js/ui.js plus ancien en cache. */
  function refuse(key, message) {
    if (typeof UI.fieldError === "function") { UI.fieldError(key, message); }
    UI.toast(message, "error");
  }

  App.saveConnection = function (url, code) {
    if (storageRefused) { UI.toast(STORAGE_REFUSED, "error"); return; }
    var clean = Utils.trim(url);
    /* Le lien d'invitation entier (ou le message qui le contient) vaut l'adresse qu'il porte. */
    var invited = typeof Utils.inviteTokenIn === "function" ? Utils.inviteTokenIn(clean) : "";
    if (invited) { clean = Utils.inviteUrl(invited); }
    if (!clean) { refuse("setup:url", "Collez l'adresse de l'équipe."); return; }
    /* https obligatoire, sauf pour un serveur local de test. */
    var isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(clean);
    if (clean.indexOf("https://") !== 0 && !isLocal) {
      refuse("setup:url", "L'adresse doit commencer par https://");
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
      /* Nouveau serveur : ce qu'on savait de l'ancien ne vaut plus (voir App.branchesAvailable). */
      Utils.storage.remove(CONFIG.KEYS.branchesCapability);
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
      /* Arrivé par une invitation : l'équipe est rejointe, le lien n'a plus d'objet. */
      if (App.route && App.route.name === "invitation") { App.go("#/"); } else { UI.force(); }
    }).catch(function (error) {
      if (Api.isAuthError(error)) {
        refuse("setup:code", "Code d'accès refusé par le serveur.");
      } else {
        UI.toast(error && error.message ? error.message : "Connexion impossible.", "error");
      }
    });
  };

  /* ------------------------------------------------------- Invitation ---
   * Ouvrir un lien d'invitation montre l'écran « Rejoindre l'équipe » : l'adresse vient du lien, la personne ne
   * saisit que le code. Rien n'est enregistré avant qu'elle valide, et un appareil déjà réglé sur une AUTRE équipe
   * ne change d'équipe que si elle le confirme sur cet écran. Le lien reste dans l'adresse jusque-là : un
   * rechargement ne le perd pas. */
  App.invitation = function () {
    if (!App.route || App.route.name !== "invitation" || typeof Utils.inviteUrl !== "function") { return null; }
    var url = Utils.inviteUrl(App.route.invite);
    return { url: url, token: App.route.invite, sameTeam: !!url && url === Sync.connection.url };
  };

  /* Un appareil déjà dans l'équipe, ou un lien abîmé sur un appareil réglé : rien à rejoindre, on rentre à
   * l'accueil en le disant. Rend le message à afficher, ou "". `fromLaunch` : le jeton vient de l'adresse que
   * l'icône installée ouvre à CHAQUE lancement (Utils.installUrl) — retrouver son équipe n'est alors pas une
   * nouvelle, on se tait. */
  function settleInvitation(fromLaunch) {
    var invitation = App.invitation();
    if (!invitation || !App.connectionConfigured()) { return ""; }
    /* Lien touché vers une AUTRE équipe : l'écran d'invitation le dit, et la personne choisit. Mais l'invitation
     * gravée dans l'icône d'un appareil passé depuis à une autre équipe est périmée : la rejouer à chaque ouverture
     * serait une question sans fin. On l'ignore ; une nouvelle équipe se rejoint par un nouveau lien. */
    if (invitation.url && !invitation.sameTeam && !fromLaunch) { return ""; }
    App.route = parseRoute("#/");
    remplacer("#/");
    if (fromLaunch) { return ""; }
    return invitation.url ? "Cet appareil fait déjà partie de cette équipe." : "Ce lien d'invitation est incomplet : demandez-en un nouveau.";
  }

  /* Jeton d'invitation porté par les paramètres de l'adresse d'ouverture (…/?invitation=<jeton>) : c'est ainsi
   * que l'icône installée sur iPhone connaît l'équipe. "" si l'adresse n'en porte pas. */
  function launchInvitation() {
    if (typeof Utils.inviteTokenInQuery !== "function") { return ""; }
    try { return Utils.inviteTokenInQuery(window.location.search); } catch (e) { return ""; }
  }

  /* iPhone dans un navigateur : préparer ce que l'icône ouvrira. Deux gestes, tous deux sans effet ailleurs :
   *  - l'adresse de la page reçoit le jeton de l'équipe — celui du lien ouvert, ou celui de l'équipe déjà réglée
   *    dans ce navigateur — dans ses paramètres et son fragment (Utils.installUrl) ;
   *  - le manifeste devient celui SANS `start_url` (manifest-ios.webmanifest). Cause : avec un `start_url`, iOS
   *    ouvre l'icône sur cette adresse-là, fixe, et l'invitation est perdue ; sans, il ouvre l'adresse de la page
   *    telle qu'elle est au moment d'« Ajouter ». Chrome, lui, garde le manifeste complet : il en exige le
   *    `start_url` pour proposer l'installation, et son application installée partage la mémoire du navigateur. */
  function preparerInstallation() {
    if (typeof Utils.installRequired !== "function" || !Utils.installRequired()) { return; }
    var invitation = App.invitation();
    var token = invitation && invitation.url ? invitation.token
      : (Sync.connection.url && !Sync.connection.localMode && typeof Utils.inviteToken === "function"
        ? Utils.inviteToken(Sync.connection.url) : "");
    var url = token && typeof Utils.installUrl === "function" ? Utils.installUrl(token) : "";
    if (url) {
      App.route = parseRoute("#/invitation/" + token);
      try { window.history.replaceState({ tkIndex: entreesSousNous() }, "", url); }
      catch (e) { /* historique refusé : le fragment courant reste la seule trace */ }
    }
    try {
      var link = document.querySelector ? document.querySelector('link[rel="manifest"]') : null;
      if (link) { link.setAttribute("href", "manifest-ios.webmanifest"); }
    } catch (e) { /* document sans manifeste : rien à changer */ }
  }

  /* Lien à envoyer aux collaborateurs : l'adresse de CETTE application, réglée sur l'équipe de cet appareil. */
  App.inviteLink = function () {
    if (!Sync.connection.url || Sync.connection.localMode || typeof Utils.inviteLink !== "function") { return ""; }
    return Utils.inviteLink(window.location.href, Sync.connection.url);
  };

  /* L'équipe demande-t-elle un code ? Connu par le vérificateur posé à la connexion ; le code, lui, n'est jamais gardé. */
  App.teamHasCode = function () { return !!lockVerifier; };

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
    UI.toast("Mode local activé.");
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
    /* Un brouillon est un texte de la personne : il ne reste pas sur un appareil qu'elle quitte (BL-059). */
    discardDrafts();
    Utils.storage.remove(CONFIG.KEYS.apiUrl);
    Utils.storage.remove(CONFIG.KEYS.lockVerifier);
    Utils.storage.remove(CONFIG.KEYS.localMode);
    Utils.storage.remove(CONFIG.KEYS.user);
    Utils.storage.remove(CONFIG.KEYS.ownItems);
    Utils.storage.remove(CONFIG.KEYS.branchesCapability);
    /* §5 et §11 : le marqueur des nouveautés (js/product-ui.js, SEEN_KEY) porte un condensat de mon identifiant (`by`) et des
     * comptes « sans moi » (`o`) : de quoi désigner l'auteur d'un message anonyme. Preuve locale DÉRIVÉE, effacée avec l'autre.
     * ⚠️ Même chaîne que SEEN_KEY (tests/ui-review.test.js le vérifie) ; à passer dans CONFIG.KEYS avec js/config.js. Le
     * reverrouillage d'inactivité (App.relock), lui, le garde : même personne après le code. */
    Utils.storage.remove("brainsto.seenTopics.v1");
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
      /* Pas de fermeture séparée avant la navigation : `App.go` compte les
       * couches ouvertes dans la profondeur courante et les dépile avec
       * l'écran, en une seule traversée. Fermer d'abord lancerait une
       * traversée que l'écriture suivante prendrait de vitesse. */
      App.go("#/");
      UI.force();
      UI.toast("Déconnecté de l'équipe.");
    });
  };

  /* ------------------------------------------------------------- Verrou --- */

  /* Sans vérificateur (appareil connecté sans code), seul App.relock verrouille : le
   * serveur exige désormais un code. */
  App.needsUnlock = function () {
    return !unlocked && (!!lockVerifier || !!Sync.connection.url);
  };

  /* ⚠️ Le code de l'équipe a pu CHANGER (§18 : c'est la seule révocation possible).
   * Le vérificateur local reste alors celui de l'ancien code : le nouveau était refusé
   * ici, l'ancien par le serveur, et la seule issue, « Se déconnecter », effaçait les
   * actions en attente (§22). Un code qui ne correspond pas au vérificateur local est
   * donc soumis au serveur, UNE fois par tentative, sous la forme de son jeton : le code
   * en clair ne part pas et ne se stocke pas. Seule une réponse positive déverrouille,
   * par les mêmes chemins que la connexion initiale ; la file n'est jamais touchée.
   *
   * ⚠️ Un serveur SANS code d'accès (ACCESS_CODE vide) accepte n'importe quel jeton : sa
   * réponse positive ne prouve alors rien, et le verrou local deviendrait contournable
   * en tapant n'importe quoi. On commence donc par lui présenter un jeton FABRIQUÉ : s'il
   * l'accepte, l'accès est libre, le nouveau code ne peut pas être vérifié et le verrou
   * local (ancien code) reste seul juge. */
  function serverEnforcesCode(url) {
    return Utils.sha256Hex("probe|" + Utils.uid()).then(function (probe) {
      return Api.getRevision(url, probe).then(function (data) {
        return data && data.ok === true ? "open" : "unknown";
      }, function (error) {
        return Api.isAuthError(error) ? "enforced" : "unknown";
      });
    });
  }

  function unlockWithNewCode(value, verifier) {
    var url = Sync.connection.url;
    if (!url || Sync.connection.localMode) {
      refuse("lock:code", "Code d'accès incorrect.");
      return null;
    }
    return Utils.sha256Hex(CONFIG.serverTokenInput(value)).then(function (token) {
      return serverEnforcesCode(url).then(function (mode) {
        if (mode !== "enforced") { return mode === "open" ? false : null; }
        return Api.getRevision(url, token).then(function (data) {
          return data && data.ok === true ? true : null;
        }, function (error) {
          return Api.isAuthError(error) ? false : null;
        });
      }).then(function (accepted) {
        /* Réponse tardive : déconnexion, autre adresse ou déjà déverrouillé entre-temps. */
        if (!App.needsUnlock() || Sync.connection.url !== url) { return; }
        if (accepted !== true) {
          refuse("lock:code", accepted === false ? "Code d'accès incorrect."
            : "Code d'accès incorrect, ou nouveau code impossible à vérifier sans connexion.");
          return;
        }
        Utils.storage.set(CONFIG.KEYS.lockVerifier, verifier);
        lockVerifier = verifier;
        unlocked = true;
        Sync.setConnection({ token: token, unlocked: true });
        startSession();
        UI.toast("Nouveau code accepté.");
        Sync.start();
        Sync.now();
        UI.force();
      });
    });
  }

  App.unlock = function (code) {
    var value = String(code == null ? "" : code);
    if (!value) { refuse("lock:code", "Saisissez le code d'accès."); return; }
    Utils.sha256Hex(CONFIG.verifierInput(value)).then(function (verifier) {
      if (verifier !== lockVerifier) { return unlockWithNewCode(value, verifier); }
      return Utils.sha256Hex(CONFIG.serverTokenInput(value)).then(function (token) {
        unlocked = true;
        Sync.setConnection({ token: token, unlocked: true });
        startSession();
        Sync.start();
        Sync.now();
        UI.force();
      });
    }).catch(function (error) {
      /* ⚠️ Sans crypto.subtle (contexte non sécurisé, WebView), Utils.sha256Hex rejette avec une
       * erreur typée : on le dit au lieu de laisser le bouton muet. L'appareil reste verrouillé. */
      UI.toast(Utils.isCryptoUnavailable(error) ? error.message : "Déverrouillage impossible.", "error");
    });
  };

  /* ⚠️ Appareil connecté SANS code (aucun vérificateur) : s'il est refusé, c'est que le
   * serveur exige désormais un code. Sortir sans rien faire laissait la synchronisation
   * essuyer un refus toutes les trois secondes, avec un message à chaque fois, sans aucun
   * endroit où saisir le code. On verrouille donc aussi : l'écran demande le code, que le
   * serveur valide (unlockWithNewCode, dont la sonde écarte un serveur ouvert). La file
   * d'actions n'est pas touchée. Mode local : rien à verrouiller. */
  App.relock = function () {
    if (!lockVerifier && (!Sync.connection.url || Sync.connection.localMode)) { return; }
    unlocked = false;
    clearSession();
    Sync.setConnection({ token: "", unlocked: false });
    Sync.stop();
    UI.set({ sheet: null, modal: null });
    UI.force();
  };

  App.gate = function () {
    /* iPhone dans Safari (ou une fenêtre intégrée) : rien d'autre que les gestes d'installation. L'icône
     * installée reprendra l'invitation elle-même (préparerInstallation). */
    if (typeof Utils.installRequired === "function" && Utils.installRequired()) { return "install"; }
    var invitation = App.invitation();
    if (invitation && invitation.url && !invitation.sameTeam) { return "connection"; }
    if (!App.connectionConfigured() || App.editingConnection) { return "connection"; }
    if (App.needsUnlock()) { return "lock"; }
    if (!App.user.name) { return "name"; }
    return null;
  };

  /* ---------------------------------------------------------------- Nom --- */

  App.saveName = function (name, silent) {
    var clean = Utils.limit(name, Core.LIMITS.name);
    if (!clean) { refuse(silent ? "settings:name" : "setup:name", "Le nom est obligatoire."); return; }
    App.user.name = clean;
    Utils.storage.set(CONFIG.KEYS.user, App.user);
    Sync.dispatch(Sync.makeAction("REGISTER_PARTICIPANT", {
      participantId: App.user.id, name: clean
    }, App.user));
    if (silent) { UI.toast("Nom enregistré."); }
    UI.force();
  };

  /* Membre de l'équipe : un appareil nommé qui ne figure pas (ou plus) dans la liste des participants s'y réinscrit,
   * une fois par session, après un échange réussi avec le serveur. C'est le cas après une remise à zéro de l'espace
   * (resetSpace, apps-script/Code.gs) : sans cela, la liste resterait vide jusqu'à ce que chacun réenregistre son nom,
   * et le consensus (« toute l'équipe a voté pareil ») se calculerait sur une équipe incomplète. */
  var registerAsked = false;
  function ensureRegistered() {
    if (registerAsked || !App.user || !App.user.name || App.gate()) { return; }
    var diagnostics = typeof Sync.diagnostics === "function" ? Sync.diagnostics() : null;
    if (!diagnostics || !diagnostics.lastSyncAt) { return; }
    var participants = (Store.view && Store.view.participants) || [];
    var known = participants.some(function (p) { return p && p.id === App.user.id; });
    registerAsked = true;
    if (known) { return; }
    Sync.dispatch(Sync.makeAction("REGISTER_PARTICIPANT", { participantId: App.user.id, name: App.user.name }, App.user));
  }

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
    /* Chargement mixte : un appareil encore servi par un ancien service worker (réseau
     * d'abord, jusqu'à la 1.12.0) peut charger une dernière fois un `index.html` neuf avec
     * un `js/config.js` de cache ancien ; depuis, la page et les scripts viennent du même
     * cache versionné. Sans cette garde, l'appel lèverait une exception ICI, c'est-à-dire
     * AVANT `Sync.boot()`, donc avant que la file d'actions ne soit relue et rejouée. Un
     * onboarding raté ne doit jamais coûter une file d'actions. */
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
    /* Niveau 2 des Réglages : connexion et synchronisation, chaque action confirmée. */
    if (parts[0] === "settings" && parts[1] === "system") { return { raw: raw, name: "system", topicId: null }; }
    if (parts[0] === "settings") { return { raw: raw, name: "settings", topicId: null }; }
    if (parts[0] === "meeting") { return { raw: raw, name: "meeting", topicId: null }; }
    /* Niveau 2 de Pandore : la synthèse, sur son propre écran, pour garder celui du dépôt nu. */
    if (parts[0] === "pandore" && parts[1] === "synthese") { return { raw: raw, name: "pandoreSynthesis", topicId: null }; }
    if (parts[0] === "pandore") { return { raw: raw, name: "pandore", topicId: null }; }
    /* Lien d'invitation (Utils.inviteLink) : le jeton porte l'adresse du script de l'équipe. */
    if (parts[0] === "invitation") { return { raw: raw, name: "invitation", topicId: null, invite: parts[1] || "" }; }
    if (parts[0] === "topic" && parts[1]) {
      if (parts[2] === "proposals") { return { raw: raw, name: "proposals", topicId: parts[1] }; }
      if (parts[2] === "conclusion") { return { raw: raw, name: "conclusion", topicId: parts[1] }; }
      /* Exploration d'un message : un sous-fil du sujet, jamais un objet. Ouvrir l'adresse n'écrit rien. */
      if (parts[2] === "branch" && parts[3]) { return { raw: raw, name: "branch", topicId: parts[1], messageId: parts[3] }; }
      return { raw: raw, name: "topic", topicId: parts[1] };
    }
    return { raw: "#/", name: "topics", topicId: null };
  }

  /* ---------------------------------------------- Contrat du geste retour ---
   * Le bouton retour d'Android rejoue la PILE D'HISTORIQUE : la chronologie des
   * écrans visités, à l'envers. Personne ne se représente une application comme
   * une chronologie — on se la représente comme un arbre, et « retour » veut
   * dire remonter d'un niveau.
   *
   * Les deux coïncident tant qu'on ne fait que descendre, et divergent au
   * premier pas de côté. C'est le défaut qui coûtait le plus cher ici : ouvrir
   * six sujets à la file depuis la liste demandait sept appuis pour sortir, et
   * le bouton retour de l'en-tête EMPILAIT une entrée au lieu d'en consommer
   * une — remonter à la liste rendait donc la sortie plus lointaine, pas plus
   * proche. Installée sur l'écran d'accueil, l'application n'a aucune barre de
   * navigateur : ce geste est le seul moyen de circuler.
   *
   * Un seul invariant, et tout en découle :
   *
   *     la pile d'historique est toujours le chemin de la racine à l'écran
   *     courant.
   *
   * Sous cet invariant le geste retour remonte l'arbre de lui-même, SANS
   * interception. Ne jamais intercepter : sur iOS le retour est un glissement
   * continu et réversible qu'une interception transforme en saut sec, sur
   * Android il entre en concurrence avec les gestes du système, et partout il
   * casse le retour du navigateur.
   *
   * Trois gestes seulement, et l'intention se DÉDUIT de la position des deux
   * écrans dans l'arbre — elle ne se déclare jamais à la main :
   *
   *     descendre  → empiler        (cible plus profonde)
   *     frère      → remplacer      (même profondeur : un onglet, un sujet
   *                                  voisin, un filtre ne consomment aucune
   *                                  profondeur)
   *     remonter   → dépiler        (cible moins profonde)
   *
   * Les couches — feuille du bas, modale — ne sont pas des feuilles de l'arbre
   * mais des calques posés dessus. Elles comptent chacune pour un niveau de
   * plus, ce qui fait qu'en sortir est TOUJOURS une remontée : une couche
   * fermée quitte la pile et ne peut plus être ressuscitée par un appui sur
   * retour. La séquence de présentation fait exception : c'est un <dialog>
   * modal, servi nativement par le navigateur (CloseWatcher), et lui ajouter un
   * second mécanisme les ferait diverger.
   *
   * La séquence de vérification est dans docs/NAVIGATION.md. Elle se fait sur un
   * téléphone : un geste retour ne se lit pas dans du code. */

  /* Parent déclaré de chaque écran, en UN SEUL endroit. Ajouter un écran, c'est
   * ajouter une ligne ici ; les liens qui y mènent se comportent alors
   * correctement sans que personne ait à y penser. `null` marque la racine. */
  /* Discussion, Pandore et Réglages sont les trois onglets de la barre du bas (js/ui.js, tabBar) ; Discussion montre
   * Sujets ou Réunion. Sujets est la racine ; Réunion, Pandore et Réglages en sont les enfants directs, donc frères. */
  var PARENT = {
    topics: null,
    settings: "topics",
    meeting: "topics",
    pandore: "topics",
    pandoreSynthesis: "pandore",
    invitation: "topics",
    system: "settings",
    topic: "topics",
    proposals: "topic",
    conclusion: "topic",
    branch: "topic"
  };

  function profondeurEcran(name) {
    var niveaux = 0;
    var courant = name;
    while (PARENT[courant]) { niveaux += 1; courant = PARENT[courant]; }
    return niveaux;
  }

  /* Parent de REPLI, distinct du parent réellement parcouru : il sert quand la
   * pile ne contient rien sous l'écran courant — arrivée par une adresse
   * partagée, rechargement, reprise d'une application mise en veille. */
  function hashParent(route) {
    var parent = PARENT[route.name];
    if (!parent) { return "#/"; }
    if (parent === "topic") { return "#/topic/" + route.topicId; }
    if (parent === "settings") { return "#/settings"; }
    if (parent === "pandore") { return "#/pandore"; }
    return "#/";
  }

  function couchesOuvertes() {
    return (UI.local.sheet ? 1 : 0) + (UI.local.modal ? 1 : 0);
  }

  /* Profondeur effective : l'écran plus les calques posés dessus. */
  function profondeurCourante() {
    return profondeurEcran(App.route.name) + couchesOuvertes();
  }

  /* Nombre d'entrées que NOUS avons empilées sous l'entrée courante. Une
   * traversée ne peut pas descendre plus bas sans sortir de l'application, et
   * retenir la personne sur le premier écran serait un défaut, pas une
   * protection. */
  function entreesSousNous() {
    try {
      var etat = window.history.state;
      return (etat && typeof etat.tkIndex === "number") ? etat.tkIndex : 0;
    } catch (e) { return 0; }   // historique refusé : voir empiler
  }

  var traverseesAIgnorer = 0;   // provoquées par nous, donc déjà appliquées
  var cibleAttendue = null;     // adresse visée par la traversée en cours
  var resynchronisation = false;

  /* ⚠️ WebView en bac à sable, document d'origine opaque : l'historique est refusé et
   * `pushState` / `replaceState` LÈVENT (SecurityError). Sans garde, l'exception sortait de
   * `UI.set` (la feuille ne s'ouvrait pas) ou d'`App.start` (écran vide). L'écran suit
   * `App.route`, jamais l'adresse : la navigation interne continue donc SANS historique.
   * Seule dégradation : le geste retour du système sort alors de l'application. */
  function empiler(hash) {
    try { window.history.pushState({ tkIndex: entreesSousNous() + 1 }, "", hash); }
    catch (e) { /* historique refusé : navigation sans historique */ }
  }

  function remplacer(hash) {
    try { window.history.replaceState({ tkIndex: entreesSousNous() }, "", hash); }
    catch (e) { /* historique refusé : navigation sans historique */ }
  }

  /* Remontée. On dépile ce que la pile contient réellement ; s'il en manque —
   * la trace est incomplète parce qu'on est arrivé directement en profondeur —
   * on REMPLACE l'entrée courante par la cible. La pile ne grandit pas, ce qui
   * est le point important, et le retour suivant sort proprement. */
  function remonter(niveaux, hash) {
    var disponibles = Math.min(niveaux, entreesSousNous());
    if (disponibles > 0) {
      traverseesAIgnorer += 1;
      cibleAttendue = hash;
      window.history.go(-disponibles);
      return;
    }
    remplacer(hash);
  }

  /* Point de passage unique. Tout ce qui change d'écran ou de couche passe par
   * ici : c'est lui qui compare les profondeurs et choisit le geste. Un appel
   * qui le contournerait est le seul endroit où le défaut peut réapparaître, et
   * il se cherche en une recherche textuelle sur `location.hash =`. */
  function poser(hash, profondeurVisee) {
    var ecart = profondeurVisee - profondeurCourante();
    if (ecart > 0) { empiler(hash); return; }
    if (ecart === 0) { remplacer(hash); return; }
    remonter(-ecart, hash);
  }

  /* Rendu sans écriture d'historique : l'entrée courante décrit déjà l'état
   * qu'on applique. */
  function appliquer(route) {
    App.route = route;
    var notice = settleInvitation();
    resynchronisation = true;
    UI.set({ sheet: null, modal: null, quote: null });
    resynchronisation = false;
    if (notice) { UI.toast(notice); }
  }

  App.go = function (hash) {
    var cible = parseRoute(hash);
    /* Même écran, aucune couche ouverte : rien à écrire, on redessine. */
    if (cible.raw === App.route.raw && !couchesOuvertes()) {
      App.route = cible;
      UI.force();
      return;
    }
    poser(cible.raw, profondeurEcran(cible.name));
    appliquer(cible);
  };

  /* Remontée d'un niveau, telle que la demande un bouton retour de l'interface.
   * Il fait exactement ce que fait le bouton du système : c'est la seule façon
   * que les deux aboutissent au même écran depuis le même point. */
  App.remonter = function () {
    if (couchesOuvertes()) { UI.set({ sheet: null, modal: null }); return; }
    var parent = hashParent(App.route);
    App.go(parent);
  };

  /* Appelé par UI.set quand le nombre de couches ouvertes change. Une couche
   * ouverte empile, une couche fermée dépile — et la fermeture par le bouton
   * « Fermer », par Échap, par le clic sur le fond ou par le geste du système
   * suit donc exactement le même chemin. */
  App.ajusterCouches = function (avant, apres) {
    if (resynchronisation || avant === apres) { return; }
    /* L'écart se calcule sur les seules couches : l'écran ne change pas ici, et
     * `UI.local` porte déjà le nouvel état au moment de l'appel — le relire
     * donnerait un écart nul et n'empilerait jamais rien. */
    var ecart = apres - avant;
    var hash = window.location.hash || "#/";
    if (ecart > 0) { empiler(hash); return; }
    remonter(-ecart, hash);
  };

  /* Traversée d'historique : geste retour du système, bouton du navigateur,
   * glissement latéral d'iOS. On ne l'intercepte pas — on constate où elle nous
   * a menés et on s'y accorde. */
  function surTraversee() {
    if (traverseesAIgnorer > 0) {
      traverseesAIgnorer -= 1;
      /* La pile a divergé de l'arbre — cela ne devrait pas arriver sous
       * l'invariant, mais une entrée étrangère au milieu suffirait. On se
       * recale sans ajouter d'entrée plutôt que d'afficher autre chose que ce
       * que l'adresse annonce. */
      if (cibleAttendue && window.location.hash !== cibleAttendue) {
        remplacer(cibleAttendue);
      }
      cibleAttendue = null;
      return;
    }
    appliquer(parseRoute(window.location.hash));
  }

  function onHashChange() {
    /* Adresse modifiée hors de l'application — saisie à la main, lien externe.
     * Les navigations internes passent par pushState et ne lèvent pas cet
     * événement. */
    var route = parseRoute(window.location.hash);
    if (route.raw === App.route.raw) { return; }
    appliquer(route);
  }

  /* ------------------------------------------------------------ Actions --- */

  function dispatch(type, payload, actorOverride) {
    return Sync.dispatch(Sync.makeAction(type, payload, actorOverride || App.user));
  }

  /* ⚠️ §4, §7, §9, §19, §22 : sans marqueur, SET_VOTE, SET_REACTION et SET_CONCLUSION_VOTE
   * sont des BASCULES. Rejouées (réponse perdue, file rejouée sur un état qui les contient
   * déjà, identifiant sorti du journal de 5 000), elles retirent ce que la personne voulait
   * fixer. Quand le serveur annonce le marqueur (FEATURES "idempotent"), l'appui décide
   * donc d'après ce qui est AFFICHÉ (Store.view, la vue optimiste) : bouton non enfoncé,
   * on AFFECTE (`set:true`) ; bouton enfoncé, on RETIRE explicitement. Sinon (ancien
   * serveur, ou aucune réponse reçue : liste vide), l'envoi reste exactement l'ancien. */
  function idempotent() { return Sync.supports("idempotent"); }

  /* Explorer un message (un message de branche, rattaché par `branchRootId`) n'est possible que si le serveur de
   * l'équipe sait le ranger : FEATURES "branches". ⚠️ Un serveur antérieur ACCEPTERAIT le message et perdrait le
   * rattachement en silence — il atterrirait dans le fil principal. Trois cas :
   *   - mode local : le noyau de l'appareil range lui-même ;
   *   - le serveur a répondu (« since » annoncé, même témoin que l'épingle) : sa réponse fait foi, et elle est
   *     retenue sur l'appareil ;
   *   - aucune réponse encore (ouverture hors ligne) : la dernière réponse retenue, sinon non.
   * Ce que voit la personne quand c'est non (la raison, jamais un masquage) : js/ui.js, branchesUnavailableReason. */
  App.branchesAvailable = function () {
    if (Sync.connection && Sync.connection.localMode) { return true; }
    var supports = typeof Sync.supports === "function" ? Sync.supports : function () { return false; };
    if (supports("since")) {
      var announced = supports("branches") === true;
      if (Utils.storage.get(CONFIG.KEYS.branchesCapability, null) !== announced) {
        Utils.storage.set(CONFIG.KEYS.branchesCapability, announced);
      }
      return announced;
    }
    return Utils.storage.get(CONFIG.KEYS.branchesCapability, false) === true;
  };

  /* Vrai quand la réponse vient d'un serveur qui a répondu SANS la capacité (il faut le mettre à jour), faux quand on
   * ne sait pas encore (ouverture hors ligne) : les deux ne demandent pas la même chose à la personne. */
  App.branchesOutdatedServer = function () {
    if (Sync.connection && Sync.connection.localMode) { return false; }
    var supports = typeof Sync.supports === "function" ? Sync.supports : function () { return false; };
    return supports("since") === true && supports("branches") !== true;
  };

  /* Annonce à la couche de mouvement l'élément qu'une action va faire apparaître (voir js/motion.js, Motion.expect).
   * Facultative : absente, ou en échec, l'action se déroule exactement pareil. */
  function expectMotion(key) {
    try { if (root.Motion && typeof root.Motion.expect === "function") { root.Motion.expect(key); } } catch (e) { /* sans effet */ }
  }

  function shownTopic(topicId) {
    return Store.view ? Core.findTopic(Store.view, topicId) : null;
  }

  /* ⚠️ Une fenêtre d'édition ne se ferme QUE si l'action est acceptée (REC-RUI-005) : sur un refus local (message verrouillé par
   * une réaction, sujet supprimé), Sync.dispatch affiche déjà le message d'erreur et rend {ok:false} ; la fenêtre reste ouverte
   * avec le texte rédigé (à corriger ou à copier) et le focus dedans. Résultat inconnu : comportement d'avant, elle se ferme. */
  function closeIfAccepted(result) {
    if (!result || result.ok !== false) { UI.set({ modal: null }); }
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
        /* La modale de création est une couche posée sur la liste, le sujet
         * créé est au même niveau que la liste : la navigation REMPLACE donc
         * l'entrée de la couche. Un appui sur retour ramène à la liste, pas au
         * formulaire qu'on vient de valider. */
        App.go("#/topic/" + topicId);
      });
    },

    updateTopic: function (topicId, title, description) {
      dispatch("UPDATE_TOPIC", { topicId: topicId, title: title, description: description })
        .then(closeIfAccepted);
    },

    changeTopicStatus: function (topicId, status) {
      dispatch("CHANGE_TOPIC_STATUS", { topicId: topicId, status: status });
    },

    /* Dépôt dans Pandore (SUBMIT_IDEA est son nom technique, d'avant Pandore).
     * ⚠️ Il part TOUJOURS sans auteur : l'acteur est forcé à l'anonyme ici, et le serveur refuse tout dépôt qui en
     * porte un. Il n'entre pas dans l'état partagé (voir Core.applyAction) : rien ne s'affiche, rien ne se relit. */
    submitIdea: function (text) {
      return dispatch("SUBMIT_IDEA", { ideaId: Utils.uid(), text: text }, { id: "", name: Core.ANON_NAME });
    },

    /* Épingler vaut pour toute l'équipe (donnée partagée). Affectation, jamais bascule : rejouée, elle ne change rien. */
    setTopicPin: function (topicId, pinned) {
      dispatch("SET_TOPIC_PIN", { topicId: topicId, pinned: pinned === true });
    },

    /* `branchRootId` (facultatif) : le message part dans l'exploration de ce message source au lieu du fil principal.
     * Absent, la charge utile est EXACTEMENT celle d'avant : un serveur antérieur ne voit aucune différence. */
    createMessage: function (topicId, text, quoteId, anon, branchRootId) {
      var root = Core.trim(branchRootId);
      /* Garde en double de l'interface : un message d'exploration n'entre JAMAIS dans la file si le serveur n'est pas
       * réputé savoir le ranger (voir App.branchesAvailable). Le texte reste dans le champ. */
      if (root && !App.branchesAvailable()) {
        UI.toast("Message non envoyé : explorer une idée demande la mise à jour du serveur de l'équipe.", "error");
        return Promise.resolve({ ok: false, error: "branches" });
      }
      var messageId = Utils.uid();
      var actor = anon ? { id: "", name: Core.ANON_NAME } : App.user;
      remember(messageId);
      var payload = { topicId: topicId, messageId: messageId, text: text, quoteId: quoteId || null, anon: !!anon };
      if (root) { payload.branchRootId = root; }
      /* ⚠️ Le résultat est rendu à l'appelant (BL-059) : un refus local de validation ne doit pas vider le composeur. */
      var sent = dispatch("CREATE_MESSAGE", payload, actor);
      UI.set({ quote: null });
      return sent;
    },

    updateMessage: function (topicId, messageId, text) {
      dispatch("UPDATE_MESSAGE", { topicId: topicId, messageId: messageId, text: text })
        .then(closeIfAccepted);
    },

    setMessageSignature: function (topicId, messageId, anon) {
      /* ⚠️ §5 : une fois anonyme, le message n'a plus d'authorId ; seule la preuve locale
       * permet encore de le modifier ou de le signer. Un message signé absent de cette
       * liste (plafond de 2000, par exemple) n'était reconnu que par son authorId : on
       * l'inscrit AVANT l'envoi, sinon l'appareil en perd la maîtrise. */
      if (anon) { remember(messageId); }
      dispatch("SET_MESSAGE_SIGNATURE", { topicId: topicId, messageId: messageId, anon: !!anon });
    },

    setReaction: function (topicId, messageId, emoji) {
      /* ⚠️ §5 : réagir à son PROPRE message anonyme écrirait son identifiant comme clé de
       * `reactions`, dans les données partagées. Retirer une réaction déjà posée (données
       * antérieures) reste permis : cela ôte l'identifiant au lieu de l'ajouter. */
      var message = Core.findMessage(Store.view ? Core.findTopic(Store.view, topicId) : null, messageId);
      if (message && message.anon && App.ownsMessage(message) && emoji &&
          emoji !== (message.reactions || {})[App.user.id]) {
        UI.toast("Vous ne pouvez pas réagir à votre propre message anonyme.", "error");
        return;
      }
      if (idempotent()) {
        var mine = message ? (message.reactions || {})[App.user.id] : undefined;
        dispatch("SET_REACTION", { topicId: topicId, messageId: messageId, emoji: mine === emoji ? "" : emoji, set: true });
        return;
      }
      dispatch("SET_REACTION", { topicId: topicId, messageId: messageId, emoji: emoji });
    },

    createProposal: function (topicId, title, description) {
      var proposalId = Utils.uid();
      remember(proposalId);
      /* À l'arrivée sur les propositions, la carte créée est désignée une fois (js/motion.js) : l'idée tirée du
       * message vient d'atterrir là, pas dans un endroit inconnu. Sans la couche de mouvement, rien ne change. */
      expectMotion("p:" + proposalId);
      dispatch("CREATE_PROPOSAL", {
        topicId: topicId, proposalId: proposalId, title: title, description: description
      }).then(function (result) {
        if (!result || result.ok === false) { return; }
        App.go("#/topic/" + topicId + "/proposals");
      });
    },

    updateProposal: function (topicId, proposalId, title, description) {
      dispatch("UPDATE_PROPOSAL", { topicId: topicId, proposalId: proposalId, title: title, description: description })
        .then(closeIfAccepted);
    },

    changeProposalStatus: function (topicId, proposalId, status) {
      dispatch("CHANGE_PROPOSAL_STATUS", { topicId: topicId, proposalId: proposalId, status: status });
    },

    setVote: function (topicId, proposalId, value) {
      if (idempotent()) {
        var proposal = Core.findProposal(shownTopic(topicId), proposalId);
        if (proposal && (proposal.votes || {})[App.user.id] === value) {
          dispatch("REMOVE_VOTE", { topicId: topicId, proposalId: proposalId });
        } else {
          dispatch("SET_VOTE", { topicId: topicId, proposalId: proposalId, value: value, set: true });
        }
        return;
      }
      dispatch("SET_VOTE", { topicId: topicId, proposalId: proposalId, value: value });
    },

    removeVote: function (topicId, proposalId) {
      dispatch("REMOVE_VOTE", { topicId: topicId, proposalId: proposalId });
    },

    addConclusion: function (topicId, text) {
      var conclusionId = Utils.uid();
      remember(conclusionId);
      expectMotion("c:" + conclusionId);
      dispatch("ADD_CONCLUSION", { topicId: topicId, conclusionId: conclusionId, text: text });
    },

    updateConclusion: function (topicId, conclusionId, text) {
      dispatch("UPDATE_CONCLUSION_ITEM", { topicId: topicId, conclusionId: conclusionId, text: text })
        .then(closeIfAccepted);
    },

    deleteConclusion: function (topicId, conclusionId) {
      dispatch("DELETE_CONCLUSION", { topicId: topicId, conclusionId: conclusionId })
        .then(function () { UI.set({ modal: null }); });
    },

    setConclusionVote: function (topicId, conclusionId) {
      if (idempotent()) {
        var topic = shownTopic(topicId);
        if (topic && (topic.conclusionVotes || {})[App.user.id] === conclusionId) {
          dispatch("REMOVE_CONCLUSION_VOTE", { topicId: topicId });
        } else {
          dispatch("SET_CONCLUSION_VOTE", { topicId: topicId, conclusionId: conclusionId, set: true });
        }
        return;
      }
      dispatch("SET_CONCLUSION_VOTE", { topicId: topicId, conclusionId: conclusionId });
    }
  };

  /* ---------------------------------------------------- Service worker --- */

  /* ⚠️ `navigator.serviceWorker` se lit UNE fois, sous try/catch, et c'est sa VALEUR qu'on teste :
   * `"serviceWorker" in navigator` reste vrai quand elle vaut undefined (fenêtre privée de Firefox
   * avant la 139, Focus, Tor) et le getter peut lever (SecurityError : cookies bloqués, bac à
   * sable). Sans ce garde, l'exception sortait d'App.start, après l'affichage, sans un mot.
   * L'application fonctionne sans service worker : on ne propose alors aucune mise à jour. */
  function serviceWorkerContainer() {
    try {
      var found = navigator.serviceWorker;
      return found && typeof found.register === "function" && typeof found.addEventListener === "function"
        ? found : null;
    } catch (e) { return null; }
  }

  function registerServiceWorker() {
    var container = serviceWorkerContainer();
    if (!container) { return; }

    /* ⚠️ Le bandeau n'est posé qu'UNE fois (UI.showUpdateBanner ignore un second appel tant que
     * le premier est affiché) : son rappel ne doit donc JAMAIS retenir un worker. Au clic, on
     * relit l'enregistrement COURANT. Un autre onglet a pu appliquer la mise à jour entre-temps
     * (plus rien n'attend : on recharge simplement), ou une version plus récente a remplacé celle
     * qui attendait (l'ancienne est obsolète : un message qui lui serait envoyé n'aurait aucun
     * effet, et le bouton resterait muet). */
    function applyUpdate(known) {
      updateRequested = true;
      function conclude(registration) {
        /* Le rechargement, ou le changement de worker qui le provoque, détruit la page : les brouillons d'abord. */
        saveDrafts();
        var waiting = registration && registration.waiting;
        if (waiting) {
          try { waiting.postMessage({ type: "SKIP_WAITING" }); return; }
          catch (e) { /* devenu obsolète entre la lecture et l'envoi : on recharge */ }
        }
        window.location.reload();
      }
      var asking = null;
      try { asking = typeof container.getRegistration === "function" ? container.getRegistration() : null; }
      catch (e) { asking = null; }
      if (!asking || typeof asking.then !== "function") { conclude(known); return; }
      asking.then(function (found) { conclude(found || known); }, function () { conclude(known); });
    }

    var registering;
    try { registering = Promise.resolve(container.register("service-worker.js")); }
    catch (e) { return; }
    registering.then(function (registration) {
      function offer() {
        UI.showUpdateBanner(function () { applyUpdate(registration); });
      }
      function watch(worker) {
        if (!worker) { return; }
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && container.controller) { offer(); }
        });
      }
      /* Un worker peut être DÉJÀ en cours d'installation quand `register()` résout :
       * `updatefound` est alors parti avant que nous n'écoutions, et `waiting` est
       * encore nul — sans cette ligne, cette mise à jour n'a aucun bandeau, et il faut
       * attendre le chargement suivant pour en proposer un. */
      watch(registration.installing);
      if (registration.waiting && container.controller) { offer(); }
      registration.addEventListener("updatefound", function () { watch(registration.installing); });
    }).catch(function () { /* hors ligne ou contexte non sécurisé */ });

    container.addEventListener("controllerchange", function () {
      /* ⚠️ On ne recharge QUE si l'utilisateur a demandé la mise à jour :
       * sinon le tout premier chargement partirait en boucle. */
      if (updateRequested) { saveDrafts(); window.location.reload(); }
    });
  }

  /* --------------------------------------------------------- Démarrage --- */

  function bindGlobalEvents() {
    /* `popstate` porte le geste retour du système ; `hashchange` ne reste que
     * pour une adresse modifiée hors de l'application, les navigations internes
     * passant désormais par pushState, qui ne la lève pas. */
    window.addEventListener("popstate", surTraversee);
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
        saveDrafts();
        /* ⚠️ Et on POSTE ce qui reste en file avant de disparaître. Passer en
         * arrière-plan sur un téléphone, c'est très souvent mourir : le système
         * gèle la page, puis la tue sans prévenir et sans redonner la main. Un
         * envoi ordinaire part avec elle ; celui-ci lui survit. */
        Sync.flush();
        return;
      }
      if (sessionExpired()) { App.relock(); return; }
      touch();
      Sync.now();
      Sync.start();
    });

    /* iOS ne garantit pas visibilitychange à la fermeture ; pagehide, si. */
    window.addEventListener("pagehide", function () {
      writeSession(lastActivity);
      saveDrafts();
      Sync.flush();
    });

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
    /* Sonde d'écriture, UNE fois, avant toute lecture : voir STORAGE_REFUSED. */
    storageRefused = !Utils.storage.available();
    if (storageRefused) { UI.toast(STORAGE_REFUSED, "error"); }
    loadUser();
    loadOwnItems();
    loadConnection();
    /* Après loadConnection : la décision a besoin de savoir si cet appareil porte
     * déjà une adresse ou un mode local, sans quoi elle prendrait une installation
     * existante pour un appareil neuf. */
    loadOnboarding();
    UI.local.showArchived = Utils.storage.get(CONFIG.KEYS.showArchived, false) === true;
    App.route = parseRoute(window.location.hash);
    /* Icône installée sur iPhone : l'invitation arrive par les paramètres de l'adresse, le fragment peut manquer. */
    var launched = launchInvitation();
    if (launched && App.route.name !== "invitation") { App.route = parseRoute("#/invitation/" + launched); }
    var invitationNotice = Utils.installRequired && Utils.installRequired() ? "" : settleInvitation(!!launched);
    preparerInstallation();
    /* La trace repart de zéro : sous l'entrée courante, la pile ne contient
     * rien qui nous appartienne — qu'on arrive par un lien partagé, par un
     * rechargement ou par la reprise d'une application mise en veille. C'est ce
     * marquage qui empêche une remontée de sortir de l'application. */
    remplacer(App.route.raw);

    Sync.setHooks({
      onChange: function () { UI.render(); UI.refreshStatus(); ensureRegistered(); },
      onMessage: function (text, kind) { UI.toast(text, kind); },
      onAuthError: function () {
        UI.toast("Code d'accès refusé par le serveur : saisissez le nouveau code de l'équipe.", "error");
        App.relock();
      }
    });
    Sync.subscribe(function () { UI.refreshStatus(); });

    bindGlobalEvents();

    Sync.boot().then(function () {
      UI.force();
      if (invitationNotice) { UI.toast(invitationNotice); }
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
