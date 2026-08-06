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
    APP_VERSION: "1.6.0",

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

    /* Délai maximal d'une requête réseau. */
    REQUEST_TIMEOUT_MS: 20000,

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
      showArchived: "brainsto.showArchived"
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

  root.CONFIG = CONFIG;
  if (typeof module !== "undefined" && module.exports) { module.exports = CONFIG; }
})(typeof globalThis !== "undefined" ? globalThis : this);
