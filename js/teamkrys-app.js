/**
 * TeamKrys — Logique applicative front-end
 * ----------------------------------------
 * Orchestration : chargement/déchiffrement de l'état, rendu de l'interface,
 * édition locale, puis chiffrement/enregistrement avec contrôle de révision.
 *
 * Dépend de : TeamKrysConfig, TeamKrysCrypto, TeamKrysSchema, TeamKrysParticipant.
 * S'appuie sur `google.script.run` (Apps Script) pour le backend Drive.
 */
(function (root) {
  'use strict';

  var Config = root.TeamKrysConfig;
  var Crypto = root.TeamKrysCrypto;
  var Schema = root.TeamKrysSchema;
  var Participant = root.TeamKrysParticipant;

  var KEY = Config.TEAMKRYS_ENCRYPTION_KEY_BASE64;

  // État courant en mémoire.
  var state = null;
  var currentRevision = 0;
  var identity = null;

  // --- Pont Apps Script ----------------------------------------------------

  // Appelle une fonction serveur Apps Script et retourne une promesse.
  function callServer(fnName, arg) {
    return new Promise(function (resolve, reject) {
      if (!root.google || !root.google.script || !root.google.script.run) {
        reject(new Error('google.script.run indisponible (hors Apps Script).'));
        return;
      }
      var runner = root.google.script.run
        .withSuccessHandler(function (res) {
          if (res && res.ok) resolve(res.data);
          else reject(new Error((res && res.message) || 'Erreur serveur.'));
        })
        .withFailureHandler(function (err) { reject(err); });
      // google.script.run n'accepte pas `undefined` comme argument.
      if (typeof arg === 'undefined') runner[fnName]();
      else runner[fnName](arg);
    });
  }

  // --- Utilitaires DOM -----------------------------------------------------

  function $(id) { return document.getElementById(id); }
  function nowIso() { return new Date().toISOString(); }

  function showError(message) {
    var el = $('tk-error');
    if (el) { el.textContent = message; el.hidden = false; }
  }
  function clearError() {
    var el = $('tk-error');
    if (el) { el.hidden = true; }
  }

  // --- Chargement ----------------------------------------------------------

  function loadEncryptedState() {
    clearError();
    return callServer('loadEncryptedState').then(function (envelope) {
      if (!Crypto.isValidEnvelope(envelope)) {
        throw new Error('Enveloppe chiffrée invalide.');
      }
      currentRevision = envelope.revision;
      return Crypto.decryptState(
        envelope.encryption.iv, envelope.encryption.ciphertext, KEY);
    }).then(function (decrypted) {
      var check = Schema.validateState(decrypted);
      if (!check.valid) {
        throw new Error('Données invalides ou incompatibles.');
      }
      state = decrypted;
      return state;
    }).catch(function (err) {
      // Message générique : on ne distingue pas déchiffrement / schéma.
      showError('Les données sont invalides ou incompatibles avec cette version.');
      throw err;
    });
  }

  // --- Enregistrement (avec contrôle de révision) --------------------------

  function saveState() {
    clearError();
    var check = Schema.validateState(state);
    if (!check.valid) {
      showError('Modification refusée : état local invalide.');
      return Promise.reject(new Error('État local invalide : ' + check.errors.join(', ')));
    }
    return Crypto.encryptState(state, KEY).then(function (enc) {
      return callServer('saveEncryptedState', {
        expectedRevision: currentRevision,
        schemaVersion: Schema.SCHEMA_VERSION,
        iv: enc.iv,
        ciphertext: enc.ciphertext
      });
    }).then(function (data) {
      currentRevision = data.revision;
      render();
      return data;
    }).catch(function (err) {
      showError('Enregistrement impossible : ' + (err.message || err));
      throw err;
    });
  }

  // --- Actions métier ------------------------------------------------------

  function logAction(action, details) {
    state.history.push({
      id: Participant.newUuid(),
      at: nowIso(),
      participantId: identity.participantId,
      action: action,
      details: details || {}
    });
  }

  function ensureParticipantRegistered() {
    var known = state.participants.some(function (p) {
      return p.id === identity.participantId;
    });
    if (!known) {
      state.participants.push({
        id: identity.participantId,
        displayName: identity.displayName,
        firstSeenAt: nowIso()
      });
    }
  }

  function addTopic(title, description) {
    ensureParticipantRegistered();
    var topic = {
      id: Participant.newUuid(),
      title: title,
      description: description || '',
      createdBy: identity.participantId,
      createdAt: nowIso(),
      messages: [],
      proposals: []
    };
    state.topics.push(topic);
    logAction('topic.create', { topicId: topic.id });
    return saveState();
  }

  function addMessage(topicId, body) {
    var topic = findTopic(topicId);
    if (!topic) return Promise.reject(new Error('Topic introuvable.'));
    ensureParticipantRegistered();
    topic.messages.push({
      id: Participant.newUuid(),
      body: body,
      authorId: identity.participantId,
      createdAt: nowIso()
    });
    logAction('message.create', { topicId: topicId });
    return saveState();
  }

  function addProposal(topicId, title) {
    var topic = findTopic(topicId);
    if (!topic) return Promise.reject(new Error('Topic introuvable.'));
    ensureParticipantRegistered();
    topic.proposals.push({
      id: Participant.newUuid(),
      title: title,
      authorId: identity.participantId,
      createdAt: nowIso(),
      votes: []
    });
    logAction('proposal.create', { topicId: topicId });
    return saveState();
  }

  function vote(topicId, proposalId, value) {
    var topic = findTopic(topicId);
    if (!topic) return Promise.reject(new Error('Topic introuvable.'));
    var proposal = topic.proposals.filter(function (p) { return p.id === proposalId; })[0];
    if (!proposal) return Promise.reject(new Error('Proposition introuvable.'));
    ensureParticipantRegistered();
    // Un vote par participant : on remplace le précédent.
    proposal.votes = proposal.votes.filter(function (v) {
      return v.participantId !== identity.participantId;
    });
    proposal.votes.push({ participantId: identity.participantId, value: value, at: nowIso() });
    logAction('proposal.vote', { topicId: topicId, proposalId: proposalId, value: value });
    return saveState();
  }

  function findTopic(topicId) {
    return state.topics.filter(function (t) { return t.id === topicId; })[0];
  }

  function displayNameFor(participantId) {
    var p = state.participants.filter(function (x) { return x.id === participantId; })[0];
    return p ? p.displayName : 'Inconnu';
  }

  // --- Rendu ---------------------------------------------------------------

  function render() {
    var container = $('tk-topics');
    if (!container || !state) return;
    if (identity) {
      var nameEl = $('tk-current-name');
      if (nameEl) nameEl.textContent = identity.displayName;
    }
    if (state.topics.length === 0) {
      container.innerHTML = '<p class="tk-empty">Aucun sujet pour le moment.</p>';
      return;
    }
    var html = state.topics.map(function (t) {
      var messages = t.messages.map(function (m) {
        return '<li><strong>' + escapeHtml(displayNameFor(m.authorId)) + ' :</strong> ' +
          escapeHtml(m.body) + '</li>';
      }).join('');
      var proposals = t.proposals.map(function (p) {
        var up = p.votes.filter(function (v) { return v.value === 'up'; }).length;
        var down = p.votes.filter(function (v) { return v.value === 'down'; }).length;
        return '<li>' + escapeHtml(p.title) +
          ' <span class="tk-votes">👍 ' + up + ' / 👎 ' + down + '</span>' +
          ' <button data-topic="' + t.id + '" data-proposal="' + p.id +
          '" data-vote="up" class="tk-vote">Pour</button>' +
          ' <button data-topic="' + t.id + '" data-proposal="' + p.id +
          '" data-vote="down" class="tk-vote">Contre</button></li>';
      }).join('');
      return '<article class="tk-topic">' +
        '<h3>' + escapeHtml(t.title) + '</h3>' +
        '<p>' + escapeHtml(t.description) + '</p>' +
        '<h4>Discussion</h4><ul>' + (messages || '<li class="tk-empty">—</li>') + '</ul>' +
        '<h4>Propositions</h4><ul>' + (proposals || '<li class="tk-empty">—</li>') + '</ul>' +
        '</article>';
    }).join('');
    container.innerHTML = html;

    Array.prototype.forEach.call(container.querySelectorAll('.tk-vote'), function (btn) {
      btn.addEventListener('click', function () {
        vote(btn.getAttribute('data-topic'),
          btn.getAttribute('data-proposal'),
          btn.getAttribute('data-vote'));
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // --- Initialisation UI ---------------------------------------------------

  function promptIdentity() {
    identity = Participant.load();
    if (!identity) {
      var name = (root.prompt && root.prompt('Votre prénom ou pseudonyme :')) || 'Anonyme';
      identity = Participant.ensure(name.trim() || 'Anonyme');
    }
  }

  function bindForms() {
    var topicForm = $('tk-new-topic');
    if (topicForm) {
      topicForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var title = $('tk-topic-title').value.trim();
        var desc = $('tk-topic-desc').value.trim();
        if (title) { addTopic(title, desc).then(function () { topicForm.reset(); }); }
      });
    }
    var renameBtn = $('tk-rename');
    if (renameBtn) {
      renameBtn.addEventListener('click', function () {
        var name = root.prompt('Nouveau nom d\'affichage :', identity.displayName);
        if (name && name.trim()) {
          identity = Participant.rename(name.trim());
          render();
        }
      });
    }
  }

  function init() {
    promptIdentity();
    bindForms();
    loadEncryptedState().then(render).catch(function () { /* message déjà affiché */ });
  }

  // API publique (utile pour les tests manuels en console).
  var App = {
    init: init,
    loadEncryptedState: loadEncryptedState,
    saveState: saveState,
    addTopic: addTopic,
    addMessage: addMessage,
    addProposal: addProposal,
    vote: vote,
    getState: function () { return state; },
    getRevision: function () { return currentRevision; }
  };
  root.TeamKrysApp = App;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
