# TeamKrys

**Outil interne, simple et mobile, de préparation de réunion pour l'équipe d'un magasin.**

Avant une réunion, chaque membre de l'équipe peut créer des sujets, en discuter,
proposer des solutions, voter, dégager les consensus et rédiger des conclusions.
L'équipe regroupe les propositions en **conclusions votables**. Pendant la
réunion, l'écran **« Préparation de la réunion »** offre une synthèse imprimable
de tous les sujets.

Interface volontairement **épurée** (inspiration Apple / Tesla), thème clair et
sombre automatiques. Le parcours : on colle d'abord l'**URL du script**, on
choisit un **nom d'utilisateur**, puis on accède à la **liste des sujets** ;
chaque sujet ouvre un écran **débat** (messages horodatés et signés, modifiables
par leur auteur) donnant accès à l'écran **Conclusion**.

TeamKrys fonctionne **en ligne et hors connexion** (PWA). Il n'y a **ni compte,
ni mot de passe, ni base de données, ni serveur** : les données partagées sont
stockées dans un simple fichier JSON sur Google Drive, lu et écrit par un petit
script Google Apps Script.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Lancer l'application localement](#lancer-lapplication-localement)
- [Installer le backend Apps Script](#installer-le-backend-apps-script)
- [Renseigner l'URL de l'API](#renseigner-lurl-de-lapi)
- [Publier avec GitHub Pages](#publier-avec-github-pages)
- [Mode hors connexion](#mode-hors-connexion)
- [Synchronisation](#synchronisation)
- [Limites connues](#limites-connues)
- [Documentation complémentaire](#documentation-complémentaire)

---

## Fonctionnalités

- **Sujets** : création, édition, statuts (`Ouvert`, `Prêt pour la réunion`,
  `Traité`, `Archivé`), recherche, filtre et tri.
- **Discussion** : messages chronologiques, édition de ses propres messages,
  mention « modifié ».
- **Propositions** : plusieurs solutions par sujet, créées directement ou
  depuis un message, avec statuts en français.
- **Votes** : Pour / Contre / Abstention, un vote par personne, modifiable et
  retirable, comptage et indicateur automatique (consensus, majorité, etc.).
- **Conclusion** : l'équipe ajoute des conclusions (regroupant les propositions
  du débat), **votables** (choix unique par personne), modifiables et
  supprimables par leur auteur.
- **Synthèse de réunion** : vue d'ensemble filtrable et **imprimable**.
- **Hors connexion** : consultation et modifications possibles, envoyées
  automatiquement au retour du réseau (aucun texte perdu).
- **Indicateur de synchronisation** permanent et **console de diagnostic**.

## Architecture

```
Application TeamKrys (PWA statique, GitHub Pages)
        │  HTML / CSS / JavaScript
        ├── Service worker (cache hors connexion)
        ├── IndexedDB (cache des données + identité locale)
        └── File d'actions en attente
                    │  (fetch : GET révision/état, POST action)
                    ▼
          Google Apps Script  (doGet / doPost + LockService)
                    │
                    ▼
         teamkrys-data.json   (Google Drive, en clair)
```

Le frontend n'écrit **jamais** tout le JSON : il envoie des **actions précises**
(ex. `CREATE_MESSAGE`, `SET_VOTE`). Le serveur les applique sur la dernière
version, ce qui évite qu'un collaborateur écrase le travail d'un autre.

Fichiers principaux :

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique de l'application |
| `js/config.js` | Configuration (URL de l'API, version) |
| `js/state.js` | Modèle métier + réducteur d'actions (miroir du backend) |
| `js/database.js` | IndexedDB (cache, file d'actions) |
| `js/api.js` | Appels à Apps Script |
| `js/sync.js` | Moteur de synchronisation (optimiste, file, poll) |
| `js/ui.js` | Rendu de l'interface (texte brut, sans `innerHTML`) |
| `js/app.js` | Contrôleur, routage, service worker |
| `service-worker.js` | Cache hors connexion + mises à jour |
| `apps-script/Code.gs` | Backend Drive (lecture/écriture du JSON) |

## Lancer l'application localement

Un simple serveur statique suffit (le service worker exige `http://`, pas
`file://`) :

```bash
# Python 3
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Sans URL d'API configurée, l'application démarre en **mode local** : tout
fonctionne dans le navigateur, mais sans partage entre collaborateurs. Idéal
pour tester l'interface.

## Installer le backend Apps Script

Voir le guide détaillé : [`docs/INSTALLATION.md`](docs/INSTALLATION.md).

Résumé :

1. Créez un projet sur <https://script.google.com>.
2. Copiez le contenu de `apps-script/Code.gs` et `apps-script/appsscript.json`.
3. Exécutez la fonction **`setupProject()`** une fois et acceptez les
   autorisations Drive. Elle crée le dossier `TeamKrys` et le fichier
   `teamkrys-data.json` (jamais écrasé s'il existe déjà).
4. Déployez le projet en **application Web** :
   - « Exécuter en tant que » : **moi** ;
   - « Qui a accès » : **Tout le monde**.
5. Copiez l'**URL de déploiement** (`.../exec`).

## Renseigner l'URL de l'API

**Le plus simple (recommandé, sans toucher au code) :** ouvrez l'application,
allez dans **Paramètres → Connexion à l'équipe**, collez l'URL du script
(terminant par `/exec`) dans le champ **« URL du script »**, puis cliquez
**« Enregistrer et connecter »**. L'URL est conservée **uniquement dans le
`localStorage` de votre appareil** — elle n'est jamais écrite dans le dépôt et
reste donc secrète. L'indicateur passe de « Mode local » à « À jour ». Un bouton
**« Retirer »** permet de revenir au mode local. Chaque collaborateur saisit
l'URL une fois sur son appareil.

**Alternative (valeur par défaut pour tous) :** définissez l'URL dans
`js/config.js` avant de publier, afin qu'elle soit préremplie pour tout le
monde :

```js
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
  ...
};
```

> L'URL saisie dans les Paramètres est prioritaire sur celle de `config.js`.

> Le fichier de **production** `teamkrys-data.json` n'est **pas** versionné
> (voir `.gitignore`). Il vit uniquement dans votre Google Drive.

## Publier avec GitHub Pages

1. Poussez le dépôt sur GitHub.
2. **Settings → Pages → Build and deployment → Source : Deploy from a branch**.
3. Choisissez la branche (ex. `main`) et le dossier **`/ (root)`**.
4. Patientez ; l'URL publique s'affiche (ex. `https://<user>.github.io/teamkrys/`).
5. Partagez cette URL à l'équipe. Sur mobile, « Ajouter à l'écran d'accueil »
   installe l'application.

## Mode hors connexion

Le service worker met en cache la coquille de l'application (HTML, CSS, JS,
icônes) et la dernière version connue des données. Hors connexion, vous pouvez
consulter les données, créer un sujet, publier un message, créer une
proposition, voter, rédiger une conclusion. Les modifications sont enregistrées
dans une **file locale** (IndexedDB) et envoyées automatiquement au retour du
réseau, **dans leur ordre de création**. Un texte en cours de rédaction n'est
jamais perdu.

## Synchronisation

- Onglet visible : vérification toutes les **3 secondes** ; le JSON complet
  n'est téléchargé que si la **révision** a changé.
- Onglet masqué : vérification ralentie.
- Après une action locale : envoi immédiat, interface mise à jour sans attendre.
- Un identifiant d'action (`actionId`) évite qu'une action envoyée deux fois
  (après coupure réseau) soit appliquée deux fois.
- L'indicateur affiche : `À jour`, `Synchronisation…`, `Modifications en
  attente`, `Hors connexion`, `Erreur de synchronisation`, `Nouvelle version
  disponible`. Il n'affiche jamais « À jour » s'il reste des actions en attente.

## Limites connues

- Pas de temps réel permanent : les échanges apparaissent en **quelques
  secondes** (poll de 3 s), pas instantanément.
- Aucun contrôle d'accès : quiconque possède l'URL de l'application et de l'API
  peut lire et écrire. **N'y mettez aucune donnée sensible** (client, médicale,
  bancaire, personnelle). Réservé aux discussions générales du magasin.
- Résolution de conflits volontairement simple (dernière écriture appliquée par
  action ; pas de fusion de texte).
- Quotas Google Apps Script : suffisants pour une petite équipe.

## Documentation complémentaire

- [`docs/INSTALLATION.md`](docs/INSTALLATION.md) — installation pas à pas.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — modèle de données et actions.
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — guide utilisateur.
- [`tests/manual-checklist.md`](tests/manual-checklist.md) — tests à effectuer.
