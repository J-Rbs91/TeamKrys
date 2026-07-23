/**
 * Configuration de TeamKrys.
 *
 * IMPORTANT — SECRET : ne renseignez PAS d'URL réelle ici et ne la committez
 * JAMAIS dans le dépôt (public). L'URL du script Apps Script est un secret
 * d'accès partagé entre les membres de l'équipe : elle est saisie via
 * Paramètres → « Connexion à l'équipe » et conservée uniquement dans le
 * localStorage de l'appareil de chaque utilisateur.
 *
 * API_URL reste donc vide dans le code source. Tant qu'aucune URL n'est
 * enregistrée sur l'appareil, l'application fonctionne en "mode local" :
 * les données restent dans le navigateur, sans synchronisation d'équipe.
 */
const CONFIG = {
  // Laisser vide dans le dépôt. Renseigné à l'exécution depuis le localStorage.
  API_URL: "",

  // Clé de stockage local de l'URL (par appareil, jamais versionnée).
  STORAGE_KEY: "teamkrys.apiUrl",

  // Intervalle de vérification des nouvelles données (onglet visible), en ms.
  POLL_INTERVAL_VISIBLE_MS: 3000,

  // Intervalle de vérification lorsque l'onglet est masqué, en ms.
  POLL_INTERVAL_HIDDEN_MS: 30000,
};

// Lecture synchrone de l'URL enregistrée sur l'appareil (localStorage).
try {
  var savedApiUrl = window.localStorage.getItem(CONFIG.STORAGE_KEY);
  if (savedApiUrl && savedApiUrl.trim()) CONFIG.API_URL = savedApiUrl.trim();
} catch (e) {
  /* localStorage indisponible (navigation privée stricte) : mode local. */
}

// L'URL est-elle réellement configurée ?
CONFIG.isConfigured = function () {
  return typeof CONFIG.API_URL === "string" && CONFIG.API_URL.trim().startsWith("http");
};

// Persiste (ou efface) l'URL dans le localStorage de l'appareil.
CONFIG.persistApiUrl = function (url) {
  var clean = url ? String(url).trim() : "";
  CONFIG.API_URL = clean;
  try {
    if (clean) window.localStorage.setItem(CONFIG.STORAGE_KEY, clean);
    else window.localStorage.removeItem(CONFIG.STORAGE_KEY);
    return true;
  } catch (e) {
    return false; // stockage indisponible : l'URL ne survivra pas au rechargement
  }
};

const APP_VERSION = "1.2.0";
