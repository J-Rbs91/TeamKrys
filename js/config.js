/**
 * Configuration de TeamKrys.
 *
 * Renseignez API_URL avec l'URL de votre déploiement Google Apps Script
 * (déploiement en tant qu'application Web). Voir docs/INSTALLATION.md.
 *
 * Tant que API_URL n'est pas renseignée, l'application fonctionne en
 * "mode local" : toutes les données sont conservées dans le navigateur,
 * mais aucune synchronisation avec l'équipe n'est possible.
 */
const CONFIG = {
  // Exemple : "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "",

  // Intervalle de vérification des nouvelles données (onglet visible), en ms.
  POLL_INTERVAL_VISIBLE_MS: 3000,

  // Intervalle de vérification lorsque l'onglet est masqué, en ms.
  POLL_INTERVAL_HIDDEN_MS: 30000,
};

// L'URL est-elle réellement configurée ?
CONFIG.isConfigured = function () {
  return typeof CONFIG.API_URL === "string" && CONFIG.API_URL.trim().startsWith("http");
};

const APP_VERSION = "1.0.2";
