# Architecture — chiffrement & accès (simplifiée)

## Principe assumé

TeamKrys utilise une **clé de chiffrement commune inscrite directement dans le
code source** du dépôt public (`js/teamkrys-config.js`). Cette contrainte est
**volontaire et acceptée**.

L'objectif du chiffrement est **uniquement** :

- d'éviter que le contenu du fichier JSON soit immédiatement lisible depuis
  Google Drive ;
- d'éviter de stocker discussions, propositions et votes en clair ;
- de conserver un format de stockage chiffré simple ;
- de reproduire le fonctionnement léger déjà utilisé pour « La Confrérie du
  Petit Jaune ».

> Le chiffrement **n'est pas** une protection forte ni un mécanisme de contrôle
> d'accès. Toute personne ayant accès au dépôt peut retrouver la clé et
> déchiffrer le fichier si elle en obtient le contenu. Voir
> [security-limits.md](./security-limits.md).

## Vue d'ensemble

```
Navigateur (Web App)                     Google Apps Script            Google Drive
────────────────────                     ──────────────────            ────────────
TeamKrysConfig  (clé AES publique)
TeamKrysCrypto  (AES-GCM Web Crypto)     doGet / include               dossier privé « TeamKrys »
TeamKrysSchema  (validation)  ── load ─▶ loadEncryptedState  ── lit ─▶ teamkrys-data.enc.json
TeamKrysApp     (UI)          ◀─ envel.  (renvoie l'enveloppe)          (enveloppe chiffrée)
   │  déchiffre + valide + affiche
   │
   │  édition locale ─▶ chiffre (nouvel IV)
   └───────────── save ─▶ saveEncryptedState ── verrou + révision + backup ─▶ écrit
```

- **Le chiffrement/déchiffrement se fait côté navigateur** (Web Crypto). Le
  serveur ne manipule que des enveloppes chiffrées et des métadonnées.
- **Le serveur** gère le fichier Drive privé, le contrôle de révision, un verrou
  (`LockService`) et les sauvegardes.

## Chiffrement

- Algorithme **AES-GCM**, clé **AES-256**.
- **IV aléatoire de 12 octets**, **régénéré à chaque enregistrement** — jamais
  réutilisé avec la même clé.
- IV et ciphertext encodés en **Base64**.

Source : [`js/teamkrys-crypto.js`](../js/teamkrys-crypto.js).

## Format du fichier chiffré (enveloppe)

```json
{
  "format": "teamkrys-encrypted-state",
  "envelopeVersion": 1,
  "schemaVersion": 1,
  "revision": 12,
  "updatedAt": "2026-07-22T18:00:00.000Z",
  "encryption": {
    "algorithm": "AES-GCM",
    "iv": "BASE64",
    "ciphertext": "BASE64"
  }
}
```

**Chiffré (jamais en clair)** : titres de topics, descriptions, messages,
propositions, votes, noms des participants, historique des actions.

**En clair (métadonnées techniques)** : version du format, version du schéma,
numéro de révision, date de mise à jour, algorithme, IV.

Un test (`tests/no-plaintext.test.js`) vérifie qu'aucune donnée métier
n'apparaît en clair dans le fichier enregistré.

## Stockage Google Drive

- Fichier privé **`teamkrys-data.enc.json`** dans un dossier privé « TeamKrys ».
- L'**identifiant** du fichier et du dossier est stocké dans
  `PropertiesService` — **jamais dans le dépôt**.
- Les utilisateurs **ne modifient pas** le fichier directement : ils passent par
  l'application web.

Le dépôt **contient** : frontend, code Apps Script, clé AES commune,
documentation, tests, exemples de structure JSON.
Le dépôt **ne contient pas** : le vrai identifiant Drive, le contenu réel du
fichier, les sauvegardes de production, les données réelles des membres.

## Cycle de vie

- **Initialisation** : [`setupProject()`](../apps-script/Code.js) — idempotente.
- **Chargement** : `loadEncryptedState()` → déchiffrement + validation → affichage.
- **Enregistrement** : validation → nouvel IV → chiffrement → `saveEncryptedState()`
  → vérification de révision + sauvegarde + incrément + écriture.

## Documentation associée

- [deployment.md](./deployment.md) — contrôle d'accès via le déploiement Web App.
- [identity.md](./identity.md) — identification légère des participants.
- [key-rotation.md](./key-rotation.md) — rotation manuelle de la clé.
- [security-limits.md](./security-limits.md) — limites à afficher clairement.
