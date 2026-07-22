/**
 * Tests cryptographiques minimaux (spec).
 */
'use strict';

var h = require('./helpers');
var Crypto = require('../js/teamkrys-crypto.js');
var Config = require('../js/teamkrys-config.js');

var KEY = Config.TEAMKRYS_ENCRYPTION_KEY_BASE64;

// import correct de la clé AES codée en dur
h.test('la clé AES codée en dur s\'importe correctement (32 octets)', async function () {
  var raw = Crypto.base64ToBytes(KEY);
  h.assertEqual(raw.length, 32, 'la clé doit faire 32 octets');
  var key = await Crypto.importKey(KEY);
  h.assert(key, 'importKey doit renvoyer une CryptoKey');
});

h.test('une clé de mauvaise taille est rejetée', async function () {
  await h.assertRejects(Crypto.importKey(Crypto.bytesToBase64(new Uint8Array(16))),
    'une clé de 16 octets doit être rejetée');
});

// chiffrement puis déchiffrement
h.test('chiffrement puis déchiffrement redonne l\'objet d\'origine', async function () {
  var state = { schemaVersion: 1, topics: [{ id: 'a', title: 'Secret' }] };
  var enc = await Crypto.encryptState(state, KEY);
  var back = await Crypto.decryptState(enc.iv, enc.ciphertext, KEY);
  h.assertEqual(JSON.stringify(back), JSON.stringify(state), 'aller-retour identique');
});

// nouvel IV à chaque chiffrement
h.test('un nouvel IV est généré à chaque chiffrement', async function () {
  var state = { a: 1 };
  var e1 = await Crypto.encryptState(state, KEY);
  var e2 = await Crypto.encryptState(state, KEY);
  h.assert(e1.iv !== e2.iv, 'les IV doivent différer');
  h.assert(e1.ciphertext !== e2.ciphertext, 'les ciphertexts doivent différer (IV différent)');
  h.assertEqual(Crypto.base64ToBytes(e1.iv).length, Crypto.IV_LENGTH, 'IV de 12 octets');
});

// échec lorsque le ciphertext est modifié
h.test('échec de déchiffrement si le ciphertext est altéré', async function () {
  var enc = await Crypto.encryptState({ a: 1 }, KEY);
  var bytes = Crypto.base64ToBytes(enc.ciphertext);
  bytes[0] = bytes[0] ^ 0xff;
  await h.assertRejects(
    Crypto.decryptState(enc.iv, Crypto.bytesToBase64(bytes), KEY),
    'un ciphertext altéré doit être rejeté (AES-GCM authentifié)');
});

// échec lorsque l'IV est modifié
h.test('échec de déchiffrement si l\'IV est altéré', async function () {
  var enc = await Crypto.encryptState({ a: 1 }, KEY);
  var iv = Crypto.base64ToBytes(enc.iv);
  iv[0] = iv[0] ^ 0xff;
  await h.assertRejects(
    Crypto.decryptState(Crypto.bytesToBase64(iv), enc.ciphertext, KEY),
    'un IV altéré doit être rejeté');
});

// échec lorsque la clé est modifiée
h.test('échec de déchiffrement avec une clé différente', async function () {
  var enc = await Crypto.encryptState({ a: 1 }, KEY);
  var otherKey = Crypto.bytesToBase64(Crypto.randomBytes(32));
  await h.assertRejects(
    Crypto.decryptState(enc.iv, enc.ciphertext, otherKey),
    'une clé différente doit échouer');
});

h.test('l\'enveloppe construite est structurellement valide', async function () {
  var enc = await Crypto.encryptState({ a: 1 }, KEY);
  var env = Crypto.buildEnvelope({
    envelopeVersion: 1, schemaVersion: 1, revision: 3,
    updatedAt: '2026-07-22T18:00:00.000Z', iv: enc.iv, ciphertext: enc.ciphertext
  });
  h.assert(Crypto.isValidEnvelope(env), 'isValidEnvelope doit être vrai');
  h.assertEqual(env.encryption.algorithm, 'AES-GCM');
  h.assertEqual(env.format, 'teamkrys-encrypted-state');
});

module.exports = true;
