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

/* -------------------------------------------------------------- Mot de passe
 * Verrouillage optionnel de l'application par mot de passe.
 *
 * - Le mot de passe lui-même n'est JAMAIS stocké sur l'appareil.
 * - On conserve seulement un « vérificateur » : un hachage SHA-256 dérivé du
 *   mot de passe, qui permet de valider la saisie à l'écran de déverrouillage
 *   (y compris hors connexion) sans révéler le mot de passe ni le jeton serveur.
 * - Le jeton envoyé au script (auth) est un hachage DIFFÉRENT du même mot de
 *   passe : disposer du vérificateur ne permet pas de reconstituer ce jeton.
 * - Le sel est public (partagé client/serveur) ; il évite les tables
 *   arc-en-ciel triviales sur le hachage stocké.
 */
CONFIG.PW_SALT = "teamkrys-v1";
CONFIG.PW_VERIFIER_KEY = "teamkrys.pwVerifier";

// Chaînes hachées (doivent être identiques côté script Apps Script).
CONFIG.serverTokenInput = function (password) { return "srv|" + CONFIG.PW_SALT + "|" + password; };
CONFIG.verifierInput = function (password) { return "lock|" + CONFIG.PW_SALT + "|" + password; };

CONFIG.hasPassword = function () {
  try {
    return !!window.localStorage.getItem(CONFIG.PW_VERIFIER_KEY);
  } catch (e) {
    return false;
  }
};

CONFIG.getVerifier = function () {
  try {
    return window.localStorage.getItem(CONFIG.PW_VERIFIER_KEY) || "";
  } catch (e) {
    return "";
  }
};

// Enregistre (ou efface avec une valeur vide) le vérificateur local.
CONFIG.setVerifier = function (hash) {
  try {
    if (hash) window.localStorage.setItem(CONFIG.PW_VERIFIER_KEY, hash);
    else window.localStorage.removeItem(CONFIG.PW_VERIFIER_KEY);
    return true;
  } catch (e) {
    return false;
  }
};

// Délai d'inactivité (onglet masqué) au-delà duquel on reverrouille, en ms.
CONFIG.LOCK_IDLE_MS = 3 * 60 * 1000;

const APP_VERSION = "1.4.0";
