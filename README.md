# BrainstO.

Outil interne de préparation de réunion pour l'équipe d'un magasin : chaque sujet
devient une conversation de groupe, on en tire des propositions, on vote, et on
arrive en réunion avec une conclusion partagée. Il remplace le tableur partagé.

Ce dépôt contient **uniquement le frontend** : un site statique (HTML + CSS +
JavaScript, sans framework ni build) publié par GitHub Pages, installable comme
application (PWA) sur iPhone et Android.

---

## Architecture

| Brique | Où elle vit | Dans ce dépôt ? |
|---|---|---|
| Frontend (PWA) | GitHub Pages | **oui** — c'est ce que Pages sert |
| Backend | Google Apps Script | **non, jamais** |
| Données (un fichier JSON) | Google Drive | **non, jamais** |
| Secrets (code d'accès, adresse du script) | script Apps Script / appareil | **non, jamais** |

Règles tenues par ce dépôt :

- aucun fichier de backend (`.gs`, `appsscript.json`, dossier `apps-script/`) ;
- aucun secret : ni code d'accès, ni adresse de script, ni jeton, ni hachage ;
- aucune dépendance externe : pas de npm, pas de CDN, **pas de police distante**
  (typographie 100 % système, donc zéro requête réseau pour l'affichage) ;
- aucune image distante non plus : les icônes sont des SVG construits en
  JavaScript et le grain est un data-URI (voir « Direction artistique »).

L'adresse du script et le code d'accès sont saisis **par chaque utilisateur dans
l'application**. L'adresse reste dans le `localStorage` de son appareil ; le code
n'est jamais stocké (voir « Verrou » ci-dessous).

---

## Contenu

```
index.html                 coquille de l'application
css/app.css                thème unique, clair et sombre automatiques
js/config.js               constantes (version, rythmes, clés de stockage)
js/utils.js                DOM sûr (texte brut), dates, SHA-256, stockage
js/state.js                modèle de données, validation et réduction des actions
js/database.js             IndexedDB : file d'actions + dernier état connu
js/api.js                  appels au backend (GET révision / état, POST action)
js/sync.js                 synchronisation optimiste, file, indicateur d'état
js/ui.js                   rendu des écrans, feuilles et fenêtres
js/app.js                  démarrage, navigation, verrou, actions utilisateur
service-worker.js          hors ligne : précache de la coquille
manifest.webmanifest       installation sur l'écran d'accueil
assets/icons/              monogramme « O. » (SVG + PNG 192/512/maskable)
docs/                      installation, guide utilisateur, checklist de test
tests/parity.test.js       tests exécutables avec `node tests/parity.test.js`
```

---

## Direction artistique

Le langage visuel est une transposition de celui de **HorizonX**
([horizonx.so](https://horizonx.so/)) au contexte de l'application : un outil
d'équipe consulté debout, en magasin, plusieurs fois par jour. Les jetons sont
en tête de [`css/app.css`](css/app.css).

| Élément | Valeur | Pourquoi ici |
|---|---|---|
| Fond | crème `#faede3` | moins fatigant qu'un blanc clinique sur une journée entière |
| Encre | `#171717`, jamais de noir pur | contraste éditorial, plus doux à l'écran |
| Surfaces | blancs superposés + flou | réservées à ce qui flotte : barres collantes, feuilles, FAB |
| Rayons | 30 px cartes, 19 px champs, 100 px pastilles | |
| Ombres | `0 20px 70px` à 7 % | la carte lévite au lieu de « tomber » |
| Typographie | système, échelle fluide (`clamp`), surtitres 11 px `+0.08em` | zéro requête réseau, hiérarchie éditoriale |
| Mouvement | `cubic-bezier(.16,1,.3,1)`, révélation `translateY(36px) scale(.96)` décalée de 45 ms | |

Trois écarts assumés par rapport à la source, dictés par l'usage :

- **le halo de CTA est directionnel** (`0 6px 18px`) et non omnidirectionnel :
  dans un formulaire dense, un halo bave sur le champ du dessus. Le halo
  d'origine reste sur le FAB, qui flotte seul ;
- **l'état par défaut n'est pas coloré.** « En discussion » et « En vote »
  concernent presque tous les éléments : les teinter saturerait la liste. La
  couleur signale ce qui appelle une action ou une issue ;
- **les révélations ne se jouent qu'à l'arrivée sur un écran**, pas à chaque
  mise à jour de données — sinon un message reçu relance toute la cascade.

Le thème sombre n'est pas l'inverse du clair : il garde la chaleur (charbon
`#16120f`, surfaces teintées crème). Sans cela, l'identité disparaît la nuit.

### Icônes et réactions

Aucune police d'icônes : `Utils.icon(nom, taille)` construit un SVG en trait
(1,7 px, bouts arrondis, `currentColor`). Rendu identique partout, contrairement
aux emoji dont le dessin change d'un système à l'autre.

Les réactions restent **stockées sous forme d'emoji** (`Core.REACTIONS`, validée
à l'identique par le backend) mais elles sont **affichées** comme des marques
dessinées (`Utils.reactionMark`), accompagnées de leur libellé :

| Valeur stockée | Marque | Libellé |
|---|---|---|
| `👌` | coche | D'accord |
| `💪` | éclair | Je m'engage |
| `🤏` | onde | Mitigé |
| `👎` | croix | Pas d'accord |
| `💩` | sens interdit | À écarter |

À 22 px, une main dessinée est illisible : on traduit donc l'intention, pas le
geste. Une valeur inconnue (donnée écrite par une version différente) retombe
sur l'emoji brut.

> `🤞` a été retiré du jeu. **La même liste doit être appliquée dans le script
> Apps Script** — sinon un appareil resté sur l'ancienne version peut encore
> écrire cette réaction. Elle est alors ignorée à la lecture : elle disparaît de
> l'affichage, sans jamais être convertie vers une autre réaction.

## Synchronisation : écriture par actions

Le frontend n'écrit **jamais** le JSON complet. Il envoie des actions précises
(`CREATE_MESSAGE`, `SET_VOTE`, …) que le backend applique sur la dernière
version. Deux personnes qui écrivent en même temps ne s'écrasent donc pas.

- `GET ?mode=revision` → `{revision, updatedAt}` — léger, appelé en boucle
  (3 s onglet visible, 30 s onglet masqué) ;
- `GET ?mode=state` → l'état complet, téléchargé **seulement** si la révision
  a changé ;
- `POST` (corps = l'action) → `{ok, revision, state, duplicate}`.

Côté serveur : verrou (`LockService`), déduplication des identifiants d'actions
déjà traités, `revision` incrémentée à chaque écriture.

Côté application : application optimiste immédiate, file d'actions persistée
dans **IndexedDB** (ordre garanti par une clé auto-incrémentée), rejeu au retour
du réseau. Une erreur **réseau** conserve la file ; une erreur **métier**
(action devenue impossible) retire l'action et l'explique à l'utilisateur.

> Le POST part volontairement en `Content-Type: text/plain;charset=utf-8` :
> c'est une « requête simple », sans préflight `OPTIONS`, auquel Apps Script ne
> sait pas répondre.

---

## Verrou par code d'accès

- Le code vit **uniquement** dans une variable en haut du script Apps Script
  (vide = accès libre). Il n'est ni dans ce dépôt, ni codé en dur dans l'app.
- L'application envoie au serveur un jeton `SHA-256("srv|" + sel + "|" + code)`.
- Elle conserve sur l'appareil un **vérificateur** `SHA-256("lock|" + sel + "|" +
  code)` — un hachage **différent**, qui permet de valider le déverrouillage
  hors ligne sans permettre de reconstituer le jeton serveur.
- Le code lui-même n'est **jamais** enregistré.
- Le jeton ne vit qu'en mémoire vive : le verrou est redemandé à **chaque
  ouverture**, et après 3 minutes passées en arrière-plan.
- Si le serveur refuse le jeton en cours de session, l'application se
  reverrouille immédiatement.

Le sel est une constante publique partagée par l'application et le script : il
sert seulement à séparer les deux hachages, ce n'est pas un secret.

---

## Publier le frontend (GitHub Pages)

1. **Settings → Pages** du dépôt ;
2. *Source* : **Deploy from a branch**, branche `main`, dossier `/ (root)` ;
3. l'adresse publique s'affiche au bout d'une minute.

Le backend, lui, s'installe dans Google Apps Script — voir
[`docs/INSTALLATION.md`](docs/INSTALLATION.md).

### Renseigner l'adresse et le code depuis l'application

Au premier lancement, l'application demande :

1. l'**adresse du script** de l'équipe (elle se termine par `/exec`) ;
2. le **code d'accès**, s'il y en a un (sinon laisser vide) ;
3. puis le **nom d'utilisateur**.

Un lien « Continuer sans connexion (mode local) » permet d'essayer
l'application sans backend : les données restent alors sur l'appareil.
Réglages → « Modifier l'adresse ou le code » permet d'y revenir, et
« Se déconnecter de l'équipe » oublie l'adresse et le vérificateur.

---

## Publier une nouvelle version

Incrémenter **ensemble** :

- `CONFIG.APP_VERSION` dans `js/config.js` ;
- `CACHE_VERSION` dans `service-worker.js`.

Sans quoi les appareils garderont l'ancienne coquille en cache. Au chargement
suivant, un bandeau « nouvelle version disponible » propose la mise à jour ;
le rechargement n'a lieu que si l'utilisateur l'a demandé.

---

## Tests

```bash
node tests/parity.test.js
```

Ces tests couvrent, action par action, la logique que le backend doit reproduire
à l'identique (validation, réduction, migration des anciens JSON, indicateurs de
vote), ainsi que les **vecteurs de hachage** partagés avec le serveur. Le script
Apps Script expose une fonction `runSelfTest()` qui vérifie exactement les mêmes
valeurs de référence : c'est le garde-fou du piège des octets signés de
`Utilities.computeDigest`.

Le parcours d'interface se vérifie à la main :
[`docs/CHECKLIST_TEST.md`](docs/CHECKLIST_TEST.md).

---

## Documentation

- [`docs/INSTALLATION.md`](docs/INSTALLATION.md) — installer le backend et publier le site
- [`docs/GUIDE_UTILISATEUR.md`](docs/GUIDE_UTILISATEUR.md) — guide de l'équipe
- [`docs/MODELE_DONNEES.md`](docs/MODELE_DONNEES.md) — structure du JSON et liste des actions
- [`docs/CHECKLIST_TEST.md`](docs/CHECKLIST_TEST.md) — recette avant publication
