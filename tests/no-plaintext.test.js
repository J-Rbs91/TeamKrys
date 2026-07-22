/**
 * Vérifie qu'aucune donnée métier n'apparaît en clair dans le fichier enregistré,
 * et que seules les métadonnées techniques autorisées y figurent.
 */
'use strict';

var h = require('./helpers');
var Crypto = require('../js/teamkrys-crypto.js');
var Config = require('../js/teamkrys-config.js');

var KEY = Config.TEAMKRYS_ENCRYPTION_KEY_BASE64;

// Marqueurs métier facilement repérables.
var SENSITIVE = [
  'TitreTopicSecret',
  'DescriptionConfidentielle',
  'MessagePrivéEquipe',
  'PropositionInterne',
  'VoteCaché',
  'PrenomParticipantAlice',
  'ActionHistoriqueSensible'
];

function buildState() {
  return {
    schemaVersion: 1,
    createdAt: '2026-07-22T18:00:00.000Z',
    topics: [{
      id: 't1',
      title: 'TitreTopicSecret',
      description: 'DescriptionConfidentielle',
      createdBy: 'p1',
      createdAt: '2026-07-22T18:00:00.000Z',
      messages: [{ id: 'm1', body: 'MessagePrivéEquipe', authorId: 'p1', createdAt: 'x' }],
      proposals: [{
        id: 'pr1', title: 'PropositionInterne', authorId: 'p1', createdAt: 'x',
        votes: [{ participantId: 'p1', value: 'VoteCaché', at: 'x' }]
      }]
    }],
    participants: [{ id: 'p1', displayName: 'PrenomParticipantAlice', firstSeenAt: 'x' }],
    history: [{ id: 'h1', at: 'x', participantId: 'p1', action: 'ActionHistoriqueSensible' }]
  };
}

h.test('le fichier enregistré ne contient aucune donnée métier en clair', async function () {
  var state = buildState();
  var enc = await Crypto.encryptState(state, KEY);
  var envelope = Crypto.buildEnvelope({
    envelopeVersion: 1, schemaVersion: 1, revision: 12,
    updatedAt: '2026-07-22T18:00:00.000Z', iv: enc.iv, ciphertext: enc.ciphertext
  });
  var serialized = JSON.stringify(envelope);

  SENSITIVE.forEach(function (marker) {
    h.assert(serialized.indexOf(marker) === -1,
      'la donnée métier "' + marker + '" ne doit pas apparaître en clair');
  });
});

h.test('les métadonnées techniques autorisées restent en clair', async function () {
  var enc = await Crypto.encryptState(buildState(), KEY);
  var envelope = Crypto.buildEnvelope({
    envelopeVersion: 1, schemaVersion: 1, revision: 12,
    updatedAt: '2026-07-22T18:00:00.000Z', iv: enc.iv, ciphertext: enc.ciphertext
  });
  var serialized = JSON.stringify(envelope);

  h.assert(serialized.indexOf('"format":"teamkrys-encrypted-state"') !== -1, 'format en clair');
  h.assert(serialized.indexOf('"schemaVersion":1') !== -1, 'schemaVersion en clair');
  h.assert(serialized.indexOf('"revision":12') !== -1, 'révision en clair');
  h.assert(serialized.indexOf('2026-07-22T18:00:00.000Z') !== -1, 'updatedAt en clair');
  h.assert(serialized.indexOf('"algorithm":"AES-GCM"') !== -1, 'algorithme en clair');
  h.assert(serialized.indexOf(enc.iv) !== -1, 'IV en clair');
});

module.exports = true;
