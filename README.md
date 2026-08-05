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
tests/parity.test.js       parité client / backend, action par action
tests/sync.test.js         deux clients face à un faux backend (réception, file)
```

---

## Direction artistique

Le langage visuel est une transposition de celui de **HorizonX**
([horizonx.so](https://horizonx.so/)) au contexte de l'application : un outil
d'équipe consulté debout, en magasin, plusieurs fois par jour. Les jetons sont
en tête de [`css/app.css`](css/app.css).

La palette est imposée et tient en cinq couleurs :

| | `#01161E` | `#124559` | `#598392` | `#AEC3B0` | `#EFF6E0` |
|---|---|---|---|---|---|
| | Ink Black | Dark Teal | Air Force Blue | Ash Grey | Beige |

Elles ne se répartissent pas au goût : leur **luminance** décide de leur emploi.
Les deux premières sont trop sombres pour porter du texte, les deux dernières
trop claires pour servir de fond, et celle du milieu échoue au contraste des
deux côtés (`#598392` ne fait que 3,72:1 sous du Beige et 4,48:1 sous de l'Ink
Black : aucun texte ne tient dessus). L'Air Force Blue n'est donc **ni un fond
ni une encre : c'est la lumière**. L'élévation d'une surface se mesure à la
quantité de bleu ajoutée au fond — ce qui fournit les six niveaux
intermédiaires que cinq couleurs ne donnent pas, sans jamais introduire de
teinte étrangère.

| Élément | Valeur | Pourquoi ici |
|---|---|---|
| Fond | Beige `#EFF6E0` le jour, `#031C25` la nuit | l'Ink Black relevé de 12 % de Dark Teal, pour que la vignette garde de quoi descendre |
| Encre | Ink Black / Beige, jamais de noir ni de blanc purs | contraste éditorial, plus doux à l'écran |
| Surfaces | superpositions translucides + flou | réservées à ce qui flotte : barres collantes, feuilles, FAB |
| Rayons | 30 px cartes, 19 px champs, 100 px pastilles | |
| Ombres | `0 20px 70px` à 10 % le jour, 55 % la nuit | la carte lévite au lieu de « tomber » |
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

Le thème sombre n'est pas l'inverse du clair : c'est la même palette lue par
l'autre bout. Le Beige devient l'encre, l'Ink Black devient le fond, et les
surfaces s'éclairent à l'Air Force Blue au lieu de s'éclaircir au blanc — sans
quoi l'identité disparaîtrait la nuit.

Un point de vocabulaire change avec le fond sombre : **la lévitation ne vient
plus de l'ombre.** Sur du `#031C25`, une ombre diffuse ne se voit pas, quel que
soit son alpha. Ce sont le liseré clair du haut de carte (`--glass-line`) et
l'écart de luminance entre la surface et le fond qui font flotter — l'ombre ne
fait plus qu'ancrer.

Deux jetons portent la conformité et ne doivent pas être confondus :
`--line` habille (filets, séparateurs, aucune information n'en dépend) tandis
que `--line-field` délimite — il dessine le bord des champs de saisie et tient
seul le seuil de 3:1 exigé par le critère WCAG 1.4.11. Le second n'existait pas
avant la refonte de palette : les bordures de champs étaient à 1,85:1.

Enfin, la palette ne contient **aucune teinte chaude**. Le rouge de danger
(`#C0301B` le jour, `#FF8A73` la nuit) et l'ambre d'avertissement sont les
seuls emprunts du fichier : un danger teinté teal serait un contresens
sémantique, pas un choix esthétique. Ils restent cantonnés au signal — jamais
une surface, jamais un texte courant.

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

- `GET ?mode=revision` → `{revision, updatedAt}` — léger, appelé en boucle ;
- `GET ?mode=state` → l'état complet, téléchargé **seulement** si la révision
  a changé ;
- `POST` (corps = l'action) → `{ok, revision, state, duplicate}`.

### Rythme adaptatif

Le rythme d'interrogation n'est pas fixe : il suit l'activité réelle
(`CONFIG.POLL_*`).

| Régime | Cadence | Quand |
|---|---|---|
| Nerveux | 1,8 s | pendant les 90 s qui suivent une écriture — la sienne ou celle d'un autre |
| Repos | jusqu'à 6 s | personne n'écrit ; relâchement progressif, pas un saut |
| Arrière-plan | 60 s | onglet masqué |
| Recul | ×2 par échec, plafond 60 s | le réseau ou le serveur ne répond pas |

Une cadence fixe de 3 s était le pire des deux mondes : 1 200 requêtes par
heure et par personne sur un backend Apps Script qui sérialise tout derrière un
`LockService` — donc contention, latence et erreurs dès que plusieurs
téléphones interrogent ensemble — et malgré ce coût une réception toujours en
retard d'un tour de boucle.

Le repos reste volontairement **court** (6 s) : c'est lui qui plafonne l'attente
du *premier* message après un silence, le seul cas où la nouvelle cadence peut
être plus lente que l'ancienne. Tout le reste d'une conversation arrive à 1,8 s,
soit près de deux fois plus vite qu'avant — et sur un serveur bien moins
encombré, donc avec des allers-retours eux-mêmes plus courts.

> Les deux `GET` partent en `cache: "no-store"` avec un paramètre jetable :
> `/exec` répond par une redirection 302 que les navigateurs mettent en cache
> **heuristiquement** faute d'en-tête, et une redirection figée gèle la révision
> — les messages des autres n'arrivent alors plus jamais.

Côté serveur : verrou (`LockService`), déduplication des identifiants d'actions
déjà traités, `revision` incrémentée à chaque écriture.

Côté application : application optimiste immédiate, file d'actions persistée
dans **IndexedDB** (ordre garanti par une clé auto-incrémentée), rejeu au retour
du réseau. Une erreur **réseau** conserve la file ; une erreur **métier**
(action devenue impossible) retire l'action et l'explique à l'utilisateur. Un
échec du **stockage local** est une troisième catégorie, à ne confondre avec
aucune des deux : l'action quitte quand même la file en mémoire — sinon elle
serait repostée sans fin — et l'éventuel doublon au redémarrage est absorbé par
la déduplication serveur.

Là où IndexedDB est refusée (fenêtre in-app d'une messagerie, navigation privée,
protection renforcée contre le pistage), `js/database.js` bascule sur un repli
**mémoire**. Ce repli doit rendre exactement la même forme que la branche
IndexedDB — c'est le rôle du déballage commun de `withStore`. L'application le
signale à l'utilisateur, car ce mode n'a pas la même garantie : une action
écrite hors ligne n'y survit pas à la fermeture de la page.

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
node tests/sync.test.js
node tests/qa/compat-scan.js
```

`sync.test.js` monte **deux clients complets** (`state.js` + `database.js` +
`sync.js`, chacun dans son contexte isolé) face à un faux backend qui reproduit
le contrat du script Apps Script, et vérifie la seule question qui compte :
*l'utilisateur A voit-il le message de l'utilisateur B ?* Il couvre aussi le
repli mémoire, le refus métier, la panne réseau et l'arrêt de la boucle. Node
n'ayant pas d'IndexedDB, c'est toujours le repli mémoire qui est exercé — la
branche IndexedDB reste du ressort de la recette sur appareil.

Ces tests couvrent, action par action, la logique que le backend doit reproduire
à l'identique (validation, réduction, migration des anciens JSON, indicateurs de
vote), ainsi que les **vecteurs de hachage** partagés avec le serveur. Le script
Apps Script expose une fonction `runSelfTest()` qui vérifie exactement les mêmes
valeurs de référence : c'est le garde-fou du piège des octets signés de
`Utilities.computeDigest`.

`compat-scan.js` répond à une autre question : **quelle ligne de ce dépôt casse
sur quel navigateur mobile ?** Il croise les fonctions web réellement utilisées
avec une baseline de support hors ligne et la matrice des navigateurs visés — et
repère au passage deux défauts invisibles à la lecture : un repli CSS écrit
*après* la valeur moderne qu'il est censé secourir, et un champ de saisie sous
16 px, qui fait zoomer toute la page sur iOS. Comme le reste du dépôt, il
n'ouvre aucun navigateur et n'installe rien.

Le parcours d'interface se vérifie à la main :
[`docs/CHECKLIST_TEST.md`](docs/CHECKLIST_TEST.md). La recette navigateur par
navigateur : [`docs/QA_NAVIGATEURS.md`](docs/QA_NAVIGATEURS.md), assistée par
dix agents QA spécialisés par moteur de rendu
([`.claude/agents/`](.claude/agents/)).

---

## Documentation

- [`docs/INSTALLATION.md`](docs/INSTALLATION.md) — installer le backend et publier le site
- [`docs/GUIDE_UTILISATEUR.md`](docs/GUIDE_UTILISATEUR.md) — guide de l'équipe
- [`docs/MODELE_DONNEES.md`](docs/MODELE_DONNEES.md) — structure du JSON et liste des actions
- [`docs/CHECKLIST_TEST.md`](docs/CHECKLIST_TEST.md) — recette avant publication
- [`docs/QA_NAVIGATEURS.md`](docs/QA_NAVIGATEURS.md) — recette navigateur par navigateur (mobile)
