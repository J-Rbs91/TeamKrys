# Rotation manuelle de la clé

La rotation **automatique** n'est pas nécessaire. Voici la procédure **manuelle**.

La nouvelle clé pourra, comme l'ancienne, **rester inscrite dans le dépôt
public** (voir [security-limits.md](./security-limits.md)).

## Procédure

1. **Ouvrir l'application avec l'ancienne clé** (celle actuellement dans
   `js/teamkrys-config.js`).
2. **Exporter / charger l'état déchiffré**. Par exemple, dans la console du
   navigateur sur la page de l'app :
   ```js
   const s = TeamKrysApp.getState();
   copy(JSON.stringify(s));   // copie l'état déchiffré dans le presse-papiers
   ```
   Conservez ce JSON temporairement (hors dépôt).
3. **Générer une nouvelle clé AES-256** :
   ```bash
   node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"
   ```
4. **Remplacer la clé** dans le **seul** fichier prévu :
   `js/teamkrys-config.js` → `TEAMKRYS_ENCRYPTION_KEY_BASE64`.
5. **Rechiffrer l'état** avec la nouvelle clé et **régénérer l'enveloppe
   initiale** :
   ```bash
   npm run gen:envelope
   ```
   Copiez la constante affichée dans `apps-script/Code.js`
   (`TK_INITIAL_ENVELOPE`). Le test de cohérence
   (`tests/compat.test.js`) vérifie que les deux restent alignés.
   > Note : `gen:envelope` régénère l'enveloppe **vide** (bootstrap). Pour
   > rechiffrer un état **existant**, rechargez le JSON de l'étape 2 dans l'app
   > (nouvelle clé importée), ce qui déclenchera un `saveEncryptedState()`
   > chiffré avec la nouvelle clé.
6. **Enregistrer la nouvelle enveloppe** (l'app le fait à la première
   sauvegarde ; ou réinitialisez un projet vierge avec `setupProject`).
7. **Déployer la nouvelle version** de l'application (`npm run build` +
   `clasp push` + nouveau déploiement — voir [deployment.md](./deployment.md)).
8. **Vérifier le déchiffrement depuis un second navigateur** : ouvrez l'URL,
   confirmez que les topics/discussions/propositions/votes s'affichent.

## Rappel

- Ne **jamais réutiliser** le même IV avec la même clé : chaque enregistrement
  génère un IV aléatoire — c'est déjà géré par `TeamKrysCrypto.encryptState`.
- La clé reste **centralisée dans un seul fichier** (`js/teamkrys-config.js`).
  Ne la dispersez pas.
