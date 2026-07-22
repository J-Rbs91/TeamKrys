/**
 * Compatibilité :
 *  - vecteur fixe : une enveloppe produite ailleurs (autre navigateur / build)
 *    se déchiffre avec la clé commune → interopérabilité multi-navigateurs ;
 *  - après « rechargement » : re-parser puis re-déchiffrer une enveloppe stockée
 *    redonne l'état intact.
 *
 * L'enveloppe d'exemple est celle embarquée dans Apps Script (état initial vide)
 * et régénérée par scripts/gen-initial-envelope.js.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var h = require('./helpers');
var Crypto = require('../js/teamkrys-crypto.js');
var Schema = require('../js/teamkrys-schema.js');
var Config = require('../js/teamkrys-config.js');

var KEY = Config.TEAMKRYS_ENCRYPTION_KEY_BASE64;

h.test('vecteur fixe : l\'enveloppe d\'exemple se déchiffre (interop multi-navigateurs)', async function () {
  var p = path.join(__dirname, '..', 'examples', 'encrypted-envelope.example.json');
  var env = JSON.parse(fs.readFileSync(p, 'utf8'));
  h.assert(Crypto.isValidEnvelope(env), 'enveloppe d\'exemple valide');
  var state = await Crypto.decryptState(env.encryption.iv, env.encryption.ciphertext, KEY);
  h.assert(Schema.validateState(state).valid, 'l\'état déchiffré doit respecter le schéma');
});

h.test('l\'enveloppe embarquée dans Apps Script correspond au vecteur d\'exemple', function () {
  var env = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'examples', 'encrypted-envelope.example.json'), 'utf8'));
  var code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
  h.assert(code.indexOf(env.encryption.iv) !== -1,
    'l\'IV embarqué dans Code.js doit correspondre à l\'exemple (régénérer + recopier après rotation)');
  h.assert(code.indexOf(env.encryption.ciphertext) !== -1,
    'le ciphertext embarqué dans Code.js doit correspondre à l\'exemple');
});

h.test('compatibilité après rechargement : re-sérialiser puis re-déchiffrer', async function () {
  var original = Schema.createEmptyState('2026-07-22T10:00:00.000Z');
  original.topics.push({
    id: 't', title: 'Sujet', description: 'd', createdBy: 'p', createdAt: 'x',
    messages: [], proposals: []
  });

  var enc = await Crypto.encryptState(original, KEY);
  var envelope = Crypto.buildEnvelope({
    envelopeVersion: 1, schemaVersion: 1, revision: 1,
    updatedAt: '2026-07-22T10:00:00.000Z', iv: enc.iv, ciphertext: enc.ciphertext
  });

  // Simule un stockage Drive + rechargement de page : passage par une chaîne JSON.
  var stored = JSON.stringify(envelope);
  var reloaded = JSON.parse(stored);

  var back = await Crypto.decryptState(
    reloaded.encryption.iv, reloaded.encryption.ciphertext, KEY);
  h.assertEqual(JSON.stringify(back), JSON.stringify(original),
    'l\'état doit être intact après rechargement');
});

module.exports = true;
