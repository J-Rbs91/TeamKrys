/**
 * TeamKrys — Identification légère des participants
 * -------------------------------------------------
 * Aucune authentification forte. Le participant est identifié fonctionnellement
 * par un UUID généré localement (crypto.randomUUID) et stocké dans localStorage
 * avec son nom d'affichage.
 *
 * Limites (voir docs/identity.md) : un utilisateur peut effacer son stockage
 * local ou changer d'identité. Convient à une petite équipe de confiance ;
 * ce n'est pas un système d'identité sécurisé.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TeamKrysParticipant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'teamkrys.participant';

  function getStore() {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage indisponible.');
    }
    return localStorage;
  }

  function newUuid() {
    var c = (typeof crypto !== 'undefined' && crypto) ||
      (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }
    // Repli (ne devrait pas servir sur navigateurs modernes).
    var bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var i = 0; i < 16; i++) {
      hex.push((bytes[i] + 0x100).toString(16).slice(1));
    }
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('');
  }

  /** Retourne l'identité stockée ou null. */
  function load() {
    var raw = getStore().getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.participantId && parsed.displayName) {
        return parsed;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function save(identity) {
    getStore().setItem(STORAGE_KEY, JSON.stringify(identity));
    return identity;
  }

  /**
   * Récupère l'identité existante, ou en crée une nouvelle avec le nom fourni.
   */
  function ensure(displayName) {
    var existing = load();
    if (existing) return existing;
    return save({ participantId: newUuid(), displayName: displayName });
  }

  /** Met à jour le nom d'affichage en conservant l'UUID. */
  function rename(newDisplayName) {
    var current = load();
    if (!current) {
      return save({ participantId: newUuid(), displayName: newDisplayName });
    }
    current.displayName = newDisplayName;
    return save(current);
  }

  function clear() {
    getStore().removeItem(STORAGE_KEY);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    newUuid: newUuid,
    load: load,
    save: save,
    ensure: ensure,
    rename: rename,
    clear: clear
  };
});
