/**
 * TeamKrys — Configuration centralisée
 * ------------------------------------
 * Ce fichier est le SEUL endroit où la clé de chiffrement commune est définie.
 *
 * Principe assumé (voir docs/security-limits.md) :
 *   - La clé AES-256 ci-dessous est publique et présente dans le dépôt public.
 *   - Le chiffrement sert uniquement à éviter que le contenu du fichier JSON
 *     stocké sur Google Drive soit immédiatement lisible.
 *   - Ce n'est PAS un contrôle d'accès. Toute personne ayant accès au dépôt
 *     peut retrouver cette clé et déchiffrer le fichier si elle en obtient le
 *     contenu.
 *
 * Pour changer la clé : voir docs/key-rotation.md.
 * Ne pas disperser la clé dans d'autres fichiers.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api; // Node (tests)
  }
  root.TeamKrysConfig = api; // Navigateur / Apps Script
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Clé AES-256 (32 octets) encodée en Base64.
  // Générée aléatoirement. Remplaçable manuellement (rotation manuelle).
  var TEAMKRYS_ENCRYPTION_KEY_BASE64 = 'OEMucZwBDqYd3M26smQvlu/xP8k39+6WYt+Hui1f2dk=';

  return {
    TEAMKRYS_ENCRYPTION_KEY_BASE64: TEAMKRYS_ENCRYPTION_KEY_BASE64,

    // Nom du fichier chiffré géré côté Google Drive.
    ENCRYPTED_FILE_NAME: 'teamkrys-data.enc.json',

    // Nom du dossier privé Drive.
    DRIVE_FOLDER_NAME: 'TeamKrys',

    // Versions supportées par ce client.
    ENVELOPE_VERSION: 1,
    SCHEMA_VERSION: 1
  };
});
