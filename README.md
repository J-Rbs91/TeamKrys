# TeamKrys

Petite application interne de **discussion, propositions et votes** pour une
équipe de magasin. Les données sont **chiffrées côté navigateur** (AES-GCM) et
stockées dans un fichier privé sur **Google Drive**, servi via **Google Apps
Script**.

> ⚠️ **La clé de chiffrement est publique** (inscrite dans le dépôt). Le
> chiffrement évite que le fichier Drive soit lisible « à l'œil nu » — ce **n'est
> pas** un contrôle d'accès. Le vrai contrôle d'accès repose sur le déploiement
> de la Web App. Voir [`docs/security-limits.md`](./docs/security-limits.md).

## Structure

```
js/                     Modules front-end (source canonique, isomorphes navigateur/Node)
  teamkrys-config.js       clé AES commune (fichier UNIQUE), noms de fichiers/dossiers
  teamkrys-crypto.js       AES-GCM (Web Crypto) + enveloppe chiffrée
  teamkrys-schema.js       schéma des données métier + validation
  teamkrys-participant.js  identité légère (UUID local, localStorage)
  teamkrys-app.js          logique d'interface + pont google.script.run
apps-script/            Projet Google Apps Script (backend + pages)
  Code.js                  doGet, include, setupProject, load/save, backups, health…
  appsscript.json          manifeste (runtime V8, scopes)
  index.html, styles.html  interface
  js_*.html                includes GÉNÉRÉS depuis js/*.js (npm run build)
scripts/                Outils de build
  build-includes.js        enveloppe js/*.js → apps-script/js_*.html
  gen-initial-envelope.js  régénère l'enveloppe initiale chiffrée
tests/                  Tests sans dépendance (node tests/run.js)
docs/                   Documentation (architecture, déploiement, limites, rotation, identité)
examples/               Exemples de structure JSON (état clair + enveloppe chiffrée)
```

## Démarrage rapide (développement)

```bash
npm run build        # régénère les includes Apps Script depuis js/*.js
npm test             # exécute les tests crypto / schéma / non-fuite en clair
```

## Déploiement

Voir [`docs/deployment.md`](./docs/deployment.md) :

1. pousser `apps-script/` dans un projet Apps Script (clasp ou copier-coller) ;
2. exécuter **`setupProject`** une fois (idempotente) ;
3. **Déployer ▸ Application web** et choisir le mode d'accès adapté aux comptes
   Google des membres du magasin.

## Fonctions Apps Script exposées

`doGet`, `include`, `setupProject`, `getApplicationStatus`, `loadEncryptedState`,
`saveEncryptedState`, `getCurrentRevision`, `createBackup`, `listBackupMetadata`,
`restoreBackup`, `healthCheck`.

Toutes renvoient `{ ok: true, data }` ou `{ ok: false, code, message }`.

## Chiffrement en bref

- AES-GCM, clé AES-256, **IV aléatoire de 12 octets régénéré à chaque
  enregistrement** (jamais réutilisé), IV + ciphertext en Base64.
- Contrôle de **révision** obligatoire + **verrou** serveur (`LockService`) pour
  éviter les écrasements entre utilisateurs, avec **sauvegarde** avant écriture.

## Documentation

- [Architecture](./docs/architecture.md)
- [Déploiement & contrôle d'accès](./docs/deployment.md)
- [Limites de sécurité](./docs/security-limits.md)
- [Rotation manuelle de la clé](./docs/key-rotation.md)
- [Identité des participants](./docs/identity.md)

## Licence

MIT.
