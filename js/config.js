/* BrainstO. — configuration.
 * Aucune donnée sensible ici : ni code d'accès, ni URL de script.
 * L'URL du script et le code d'accès sont saisis par chaque utilisateur dans
 * l'application ; seul un « vérificateur » (hachage) est conservé sur l'appareil.
 */
(function (root) {
  "use strict";

  var CONFIG = {
    APP_NAME: "BrainstO.",

    /* À incrémenter EN MÊME TEMPS que CACHE_VERSION dans service-worker.js. */
    APP_VERSION: "1.12.0",

    /* Révision de la SÉQUENCE de présentation, volontairement DISTINCTE de
     * APP_VERSION. Indexer le rejeu sur la version de l'application ferait revoir
     * la présentation à toute l'équipe au moindre correctif de patch — c'est
     * exactement ce qu'il ne faut pas. On n'incrémente ce nombre que lorsqu'on
     * veut réellement que la séquence soit rejouée. */
    ONBOARDING_REV: 1,

    /* Schéma de l'enregistrement posé sur l'appareil. Un changement de forme
     * incompatible s'accompagne d'un incrément : un enregistrement écrit sous un
     * autre schéma est alors traité comme absent, jamais réinterprété de travers. */
    ONBOARDING_SCHEMA: 1,

    /* Sel public partagé avec le backend. Ce n'est PAS un secret : il sert
     * uniquement à séparer les deux hachages (jeton serveur / vérificateur local). */
    PW_SALT: "brainsto.v1",

    /* Rythme d'interrogation du serveur — ADAPTATIF.
     *
     * Un rythme fixe de 3 s était le pire des deux mondes : 1 200 requêtes par
     * heure et par personne sur un backend Apps Script qui sérialise tout
     * derrière un LockService (donc file d'attente, latence, réponses en
     * erreur quand plusieurs téléphones interrogent en même temps), et malgré
     * ce coût une réception toujours en retard d'un tour de boucle.
     *
     * On règle donc la cadence sur l'activité réelle : nerveux pendant une
     * conversation, calme quand personne n'écrit.
     *
     * ⚠️ Le repos est volontairement gardé COURT (6 s, pas 15 ou 30). C'est lui
     * qui plafonne l'attente du PREMIER message après un silence — le seul cas
     * où la nouvelle cadence peut être plus lente que l'ancienne. Le gain de
     * charge vient surtout de la fenêtre nerveuse, qui évite d'interroger à
     * 1,8 s en permanence « au cas où ». */
    POLL_ACTIVE_MS: 1800,          // quelqu'un vient d'écrire : on colle au fil
    POLL_IDLE_MS: 6000,            // conversation au repos
    POLL_HIDDEN_MS: 60000,         // onglet masqué
    POLL_ACTIVE_WINDOW_MS: 90000,  // durée du régime nerveux après une activité
    POLL_BACKOFF_MAX_MS: 60000,    // plafond du recul après échecs réseau

    /* Actions envoyées en un seul POST, quand le serveur annonce « batch ».
     * Doit rester ≤ MAX_BATCH du script Apps Script, sinon le lot est refusé
     * en bloc et le client repart en envoi unitaire pour rien. */
    MAX_BATCH: 20,

    /* Petite attente avant d'envoyer, pour laisser une rafale se regrouper.
     * Sans elle, la première action part seule pendant que les suivantes
     * attendent encore leur clé de file, et cinq réactions coûtent deux envois
     * au lieu d'un. 150 ms est invisible à côté d'un aller-retour Apps Script,
     * qui se compte en secondes. Ignoré si le serveur ne sait pas grouper. */
    BATCH_COALESCE_MS: 150,

    /* Reverrouillage après ce délai SANS manipulation — que l'application soit
     * restée ouverte à l'écran, en arrière-plan, ou complètement fermée.
     *
     * Redemander le code à chaque ouverture protégeait surtout contre le
     * propriétaire du téléphone, qui consulte l'application vingt fois par
     * jour : le verrou existe pour l'appareil oublié sur une table, pas pour
     * la personne qui vient d'écrire un message il y a deux minutes. */
    LOCK_IDLE_MS: 60 * 60 * 1000,

    /* Écriture de l'horodatage d'activité espacée d'autant : un doigt qui fait
     * défiler une conversation ne doit pas écrire dans localStorage à chaque
     * geste. Conséquence assumée : après une fermeture brutale, l'échéance peut
     * être en retard de ce délai — dans le sens prudent. */
    SESSION_TOUCH_MS: 30 * 1000,

    /* Contrôle périodique de l'inactivité, pour reverrouiller une application
     * laissée ouverte à l'écran sans que personne n'y touche. */
    IDLE_CHECK_MS: 60 * 1000,

    /* Délai maximal d'une LECTURE. Elle est rejouée au tour suivant sans rien
     * risquer : couper tôt libère la boucle. */
    REQUEST_TIMEOUT_MS: 20000,

    /* Délai maximal d'une ÉCRITURE — délibérément plus long.
     *
     * Apps Script sérialise toutes les requêtes derrière un LockService : quand
     * deux téléphones sont dans la même conversation, un envoi attend son tour
     * DERRIÈRE les lectures des autres. À 20 s, une écriture parfaitement
     * valide était coupée alors que le serveur l'exécutait encore — le message
     * restait en file, l'utilisateur ne voyait rien, et l'action repartait plus
     * tard en doublon. Couper une écriture ne l'annule pas : ça ne fait que
     * nous en cacher l'issue. On laisse donc au serveur le temps de répondre. */
    WRITE_TIMEOUT_MS: 45000,

    /* Au-delà de ce nombre de sujets, on affiche le champ de recherche. */
    SEARCH_THRESHOLD: 6,

    /* Clés de stockage local (appareil uniquement). */
    KEYS: {
      apiUrl: "brainsto.apiUrl",
      lockVerifier: "brainsto.lockVerifier",
      session: "brainsto.session",
      user: "brainsto.user",
      ownItems: "brainsto.ownItems",
      localMode: "brainsto.localMode",
      showArchived: "brainsto.showArchived",
      onboarding: "brainsto.onboarding"
    }
  };

  /* Entrée du hachage envoyé au serveur (jeton d'authentification). */
  CONFIG.serverTokenInput = function (code) {
    return "srv|" + CONFIG.PW_SALT + "|" + String(code == null ? "" : code);
  };

  /* Entrée du hachage conservé sur l'appareil (vérification hors ligne).
   * Volontairement DIFFÉRENT du jeton serveur : connaître le vérificateur ne
   * permet pas de reconstituer le jeton. */
  CONFIG.verifierInput = function (code) {
    return "lock|" + CONFIG.PW_SALT + "|" + String(code == null ? "" : code);
  };

  /* Une session déverrouillée survit à la fermeture de l'application tant qu'il
   * s'est écoulé moins de LOCK_IDLE_MS depuis la dernière manipulation.
   *
   * Fonction PURE, et c'est volontaire : c'est la seule règle du verrou qui
   * décide, à froid, si l'on entre sans code. Elle est testée séparément
   * (tests/session.test.js) plutôt que vérifiée à la main sur un téléphone.
   *
   * Renvoie la session utilisable, ou null — auquel cas le code est redemandé.
   * Trois refus : enregistrement abîmé, code changé depuis (le vérificateur ne
   * correspond plus), et horodatage hors fenêtre. Une date FUTURE est refusée
   * elle aussi : horloge reculée ou enregistrement bricolé, on ne s'y fie pas. */
  CONFIG.sessionUsable = function (saved, verifier, now) {
    if (!saved || typeof saved !== "object") { return null; }
    if (typeof saved.v !== "string" || typeof saved.t !== "string") { return null; }
    if (typeof saved.at !== "number" || !isFinite(saved.at)) { return null; }
    if (!verifier || saved.v !== verifier) { return null; }
    var age = now - saved.at;
    if (age < 0 || age > CONFIG.LOCK_IDLE_MS) { return null; }
    return { verifier: saved.v, token: saved.t, at: saved.at };
  };

  /* ------------------------------------------------ Présentation initiale --- */

  /* Ce que la présentation montre, et à qui. Ce ne sont pas des panneaux choisis :
   * ce sont les cinq parties de l'application, dans l'ordre où on les traverse.
   *
   * Trois listes, parce que la même séquence ne convient pas à tout le monde :
   *
   *  - `full` — l'espace est VIDE. C'est le seul cas où tout expliquer d'avance se
   *    justifie : rien ne se passera sur cet écran tant qu'un collègue n'aura pas
   *    agi, donc il n'existe aucun « moment de l'usage » où déporter l'explication.
   *  - `joining` — l'espace est DÉJÀ PEUPLÉ. Les écrans existent et s'enseigneront
   *    d'eux-mêmes ; on ne garde que ce qui ne se devine pas (l'appui sur une bulle)
   *    et ce à quoi tout cela sert (la conclusion). Faire traverser à un arrivant les
   *    étapes du fondateur lui ferait lire des consignes sans objet.
   *  - `local` — SEUL sur l'appareil. Ni votes ni réunion : ils n'ont aucun sens à une
   *    personne, et les annoncer serait promettre un collectif absent.
   *
   * L'ordre des tests compte : le mode local l'emporte sur la présence de sujets,
   * parce qu'un espace local peuplé reste un espace d'une seule personne. */
  CONFIG.ONBOARDING_PANELS = {
    full: ["topics", "debate", "proposals", "conclusion", "meeting"],
    joining: ["debate", "conclusion"],
    local: ["topics", "debate", "conclusion"]
  };

  CONFIG.onboardingSegment = function (context) {
    var ctx = context || {};
    if (ctx.localMode) { return "local"; }
    if (ctx.hasTopics) { return "joining"; }
    return "full";
  };

  /* Un enregistrement relu est utilisable, ou il ne l'est pas. Comme pour la
   * session, on ne répare rien : localStorage est partagé avec d'autres versions de
   * l'application et modifiable à la main depuis la console. Une forme inattendue
   * est traitée comme une absence — jamais interprétée à moitié, jamais une
   * exception au démarrage.
   *
   * La date future est refusée pour la même raison que dans `sessionUsable` :
   * horloge reculée ou enregistrement bricolé, on ne s'y fie pas. */
  function onboardingRecord(saved, now) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) { return null; }
    if (saved.s !== CONFIG.ONBOARDING_SCHEMA) { return null; }
    if (typeof saved.rev !== "number" || !isFinite(saved.rev)) { return null; }
    if (typeof saved.step !== "number" || !isFinite(saved.step)) { return null; }
    if (saved.step < 0 || Math.floor(saved.step) !== saved.step) { return null; }
    if (typeof saved.at !== "number" || !isFinite(saved.at) || saved.at > now) { return null; }
    return {
      rev: saved.rev,
      step: saved.step,
      at: saved.at,
      done: saved.done === true,
      skipped: saved.skipped === true,
      migrated: saved.migrated === true
    };
  }

  /* Faut-il présenter l'application, et à partir de quelle étape ?
   *
   * Fonction PURE, et c'est volontaire : c'est la seule règle qui décide, à froid,
   * si un nouvel arrivant voit la présentation. Elle est testée séparément
   * (tests/onboarding.test.js) plutôt que vérifiée à la main sur un téléphone.
   *
   * `context` porte ce que l'appareil sait déjà de lui-même :
   *   hasConnection — une adresse de script est enregistrée
   *   localMode     — l'appareil a choisi de rester local
   *   hasName       — un prénom a été saisi
   *   hasTopics     — l'espace rapatrié contient au moins un sujet
   *
   * Renvoie null (rien à faire), ou un objet :
   *   { reason: "migrate" }                     appareil déjà utilisé : marquer vu,
   *                                             et surtout NE RIEN AFFICHER
   *   { reason: "first"|"revision", step, panels, segment }
   *
   * ⚠️ La branche « migrate » est la plus importante du fichier, et la moins
   * évidente. Au déploiement, aucun appareil de l'équipe ne porte l'enregistrement :
   * sans cette branche, TOUT LE MONDE reverrait la présentation le jour de la mise à
   * jour. Trois indices suffisent à reconnaître un appareil déjà utilisé — une
   * adresse, un mode local, un prénom — et aucun d'eux n'existe sur un appareil
   * réellement neuf.
   *
   * ⚠️ On ne se fie NI à la présence de `brainsto.user` (écrite dès le premier
   * chargement par `loadUser`, avant tout gate et toute intention : elle ne prouve
   * rien), NI à un état vide (un espace d'équipe neuf est indistinguable d'un
   * utilisateur neuf), NI à la révision du serveur (partagée par toute l'équipe). */
  CONFIG.onboardingDue = function (saved, context, rev, now) {
    var ctx = context || {};
    var revision = (typeof rev === "number" && isFinite(rev)) ? rev : CONFIG.ONBOARDING_REV;
    var segment = CONFIG.onboardingSegment(ctx);
    var panels = CONFIG.ONBOARDING_PANELS[segment] || CONFIG.ONBOARDING_PANELS.full;

    function run(reason, step) {
      return { reason: reason, step: step, panels: panels.slice(), segment: segment };
    }

    var record = onboardingRecord(saved, now);

    if (!record) {
      if (ctx.hasConnection || ctx.localMode || ctx.hasName) { return { reason: "migrate" }; }
      return run("first", 0);
    }

    if (record.done) {
      /* Rejeu volontaire seulement. Une révision enregistrée SUPÉRIEURE à la
       * révision courante vient d'une version plus récente de l'application : on ne
       * rejoue pas en arrière. */
      if (revision > record.rev) { return run("revision", 0); }
      return null;
    }

    /* Séquence interrompue. Si le segment a changé entre-temps — un collègue a
     * déposé le premier sujet pendant que la présentation était ouverte —, l'étape
     * enregistrée peut ne plus exister : on reprend au début plutôt que de pointer
     * dans le vide. */
    if (record.step >= panels.length) { return run("first", 0); }
    return run("first", record.step);
  };

  root.CONFIG = CONFIG;
  if (typeof module !== "undefined" && module.exports) { module.exports = CONFIG; }
})(typeof globalThis !== "undefined" ? globalThis : this);