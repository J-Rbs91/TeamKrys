#!/usr/bin/env node
/**
 * Régénère l'enveloppe initiale (état vide chiffré) à embarquer dans
 * apps-script/Code.js (constante TK_INITIAL_ENVELOPE), et l'écrit dans
 * examples/encrypted-envelope.example.json.
 *
 * À relancer après une rotation de clé (docs/key-rotation.md).
 *
 * Usage : node scripts/gen-initial-envelope.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var Crypto = require('../js/teamkrys-crypto.js');
var Schema = require('../js/teamkrys-schema.js');
var Config = require('../js/teamkrys-config.js');

var CREATED_AT = '2026-01-01T00:00:00.000Z';

(async function () {
  var state = Schema.createEmptyState(CREATED_AT);
  var enc = await Crypto.encryptState(state, Config.TEAMKRYS_ENCRYPTION_KEY_BASE64);
  var env = Crypto.buildEnvelope({
    envelopeVersion: Config.ENVELOPE_VERSION,
    schemaVersion: Schema.SCHEMA_VERSION,
    revision: 0,
    updatedAt: CREATED_AT,
    iv: enc.iv,
    ciphertext: enc.ciphertext
  });

  // Vérification aller-retour.
  var back = await Crypto.decryptState(
    env.encryption.iv, env.encryption.ciphertext, Config.TEAMKRYS_ENCRYPTION_KEY_BASE64);
  if (!Schema.validateState(back).valid) {
    throw new Error('Round-trip invalide.');
  }

  var out = path.join(__dirname, '..', 'examples', 'encrypted-envelope.example.json');
  fs.writeFileSync(out, JSON.stringify(env, null, 2) + '\n');

  process.stdout.write('Enveloppe initiale (à copier dans Code.js -> TK_INITIAL_ENVELOPE) :\n');
  process.stdout.write(JSON.stringify(env, null, 2) + '\n');
  process.stdout.write('\nExemple écrit dans ' + out + '\n');
})();
