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
    APP_VERSION: "1.3.0",

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

    /* Reverrouillage après ce délai passé en arrière-plan. */
    LOCK_BACKGROUND_MS: 3 * 60 * 1000,

    /* Délai maximal d'une requête réseau. */
    REQUEST_TIMEOUT_MS: 20000,

    /* Au-delà de ce nombre de sujets, on affiche le champ de recherche. */
    SEARCH_THRESHOLD: 6,

    /* Clés de stockage local (appareil uniquement). */
    KEYS: {
      apiUrl: "brainsto.apiUrl",
      lockVerifier: "brainsto.lockVerifier",
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

  root.CONFIG = CONFIG;
  if (typeof module !== "undefined" && module.exports) { module.exports = CONFIG; }
})(typeof globalThis !== "undefined" ? globalThis : this);
