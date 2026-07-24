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
    APP_VERSION: "1.0.0",

    /* Sel public partagé avec le backend. Ce n'est PAS un secret : il sert
     * uniquement à séparer les deux hachages (jeton serveur / vérificateur local). */
    PW_SALT: "brainsto.v1",

    /* Rythme d'interrogation du serveur. */
    POLL_VISIBLE_MS: 3000,
    POLL_HIDDEN_MS: 30000,

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
