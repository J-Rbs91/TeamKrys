# Onboarding de première connexion — cadrage et plan-séquence

> Document de **spécification**, produit avant toute ligne de code. Il tranche ce
> qui doit l'être, expose ce qui reste à arbitrer, et découpe le chantier.
> Aucune implémentation n'en découle automatiquement.

Établi contre `js/app.js`, `js/ui.js`, `js/config.js`, `js/utils.js`,
`js/state.js`, `js/sync.js`, `js/database.js`, `css/app.css`,
`service-worker.js`, `index.html`, `tests/`, et les cinq documents de `docs/`.

Méthode : UXER, sept étapes. Mission `parcours-onboarding-premiere-connexion`,
profil `standard`. Le dossier d'exécution — brief, décisions durables, plan d'unités,
synthèse de recherche, validations — vit dans `.uxer/runs/`.

---

## Mode de recherche

```
Outils détectés :      recherche web · fetch HTTP
                       navigateur : ABSENT · capture : ABSENTE · session : AUCUNE
Mode utilisé :         recherche et fetch
Ressources consultées : 13, toutes de NIVEAU 1, le 2026-08-06 — normes W3C et MDN,
                       recherche NN/g, design systems ouverts (GOV.UK, Shopify),
                       un artefact d'ingénierie (GitLab)
Non consultées mais pertinentes : Adobe Spectrum (rendu côté client), Material 3
                       (404), Atlassian (route obsolète), IBM Carbon (tronqué),
                       Mobbin · Page Flows · Ripplix (compte requis, non tenté)
```

**Niveau 1 signifie : le texte a été lu, le rendu n'a pas été observé.** Aucune
affirmation de ce document ne porte donc sur une composition, une densité, un rythme
typographique, un enchaînement réel ou une durée constatée dans un produit tiers.
Les partis pris visuels et de mouvement viennent de la direction artistique du dépôt
et du corpus local UXER, pas d'une observation externe.

Détail, limites et vérifications différées : `.uxer/runs/parcours-onboarding-premiere-connexion/research-summary.md`.

---

## Principes retenus (étape 4 — extraction)

Huit principes, formulés sans nommer leur source, chacun avec son **point de
rupture** — c'est lui qui dit quand le principe cesse de s'appliquer ici.

| # | Principe | Point de rupture, appliqué à ce produit |
|---|---|---|
| P1 | Une étape ne survit que si aucun autre emplacement ne porte son information | **Cède pour le premier arrivant** : sur un espace vide où rien ne se passe sans qu'un collègue agisse, il n'existe aucun « moment de l'usage » où déporter l'explication |
| P2 | Plafonner à cinq écrans pédagogiques, et afficher la longueur dès le premier | Les gates obligatoires — connexion, verrou, prénom — n'entrent pas dans le décompte et ne se suppriment pas pour tenir le plafond |
| P3 | La sortie est à chaque étape, à un emplacement stable, et son libellé dit la suite | Une sortie très visible fait baisser la complétion : c'est le prix, pas un défaut à corriger en la cachant |
| P4 | Ce qui est fermé se rouvre depuis un emplacement permanent | **Aucune source consultée ne prescrit de détection du premier lancement** : le § *Détection* est une extrapolation, et ici aucun marqueur serveur n'est atteignable |
| P5 | Une liste de contrôle persistante traite la reprise sans mécanique de reprise | **Écarte la checklist ici** : sur un produit ouvert 1–2 ×/semaine, une liste jamais terminée devient un reproche permanent |
| P6 | L'invitation des collègues se loge dans une étape existante, jamais en étape de plus | Qui rejoint un espace peuplé n'a pas à traverser les étapes du premier arrivant |
| P7 | Un calque bloquant porte un nom accessible issu de son titre visible, rend le fond réellement et **visiblement** inerte, boucle le focus, ferme sur Échap | Le corpus normatif décrit **un** dialogue, pas une **séquence** : l'annonce du changement d'étape et le replacement du focus entre étapes ne sont couverts par aucune source consultée |
| P8 | Transition entre étapes sous 150 ms ou inexistante ; ouverture du calque 200–250 ms | Dès qu'un **déplacement** intervient, le critère normatif de mouvement s'applique ; un fondu d'opacité seul **sort du champ du critère** |

**Convergence la plus gênante pour cette demande, et il faut la dire :** trois familles
de sources sur quatre déconseillent la séquence en amont et poussent l'explication vers
le moment de l'usage. La convergence traverse des contextes différents, ce qui empêche
de l'écarter comme effet de mode. Ce qui sauve la séquence ici est le point de rupture
de P1 — et il ne la sauve que pour le premier arrivant. D'où la décision **M** :
deux traitements selon que l'espace est vide ou déjà peuplé.

---

## PHASE 1 — Reformulation de la demande

**Demande** : une séquence d'onboarding jouée à la première connexion, montrant
les différentes parties de l'application et leur fonctionnement — la détection
de la « première connexion » faisant partie de la demande.

**Objectif retenu** : qu'un nouvel arrivant sache, avant d'avoir tâtonné, que
BrainstO. enchaîne *sujet → débat → propositions votées → conclusion → réunion*,
et où se trouve chacun de ces temps. Objectif secondaire, hérité du diagnostic :
nommer le seul geste que l'interface ne peut pas enseigner sur place — **appuyer
sur une bulle de message ouvre les réactions, la citation et la création d'une
proposition** (`js/ui.js:1326`, `messageSheet`).

**Portée** : frontend uniquement, état 100 % local à l'appareil, zéro action de
synchronisation, zéro requête réseau, zéro dépendance.

**Ce qui était manifestement flou dans la demande, et qui est tranché ici** :
la définition de « première connexion » (§ Détection), la forme de la séquence
(panneaux ou visite ancrée — § PHASE 4, arbitrage A), et son caractère bloquant
ou non (arbitrage B).

---

## PHASE 2 — Analyse par les six filtres

### Filtre 1 — Intention métier

| | |
|---|---|
| **Confirmé** | L'app n'offre aujourd'hui **aucune** pédagogie : `App.gate()` (`js/app.js:258`) enchaîne `connection → lock → name → null`, puis dépose l'utilisateur sur une liste de sujets vide (`js/ui.js:598`). Toute la connaissance vit dans `docs/GUIDE_UTILISATEUR.md`, que personne n'ouvre depuis un téléphone. |
| **Confirmé** | La valeur du produit est **collective** : réactions, votes, conclusions votées n'ont aucun sens à une personne. |
| **Manquant** | Aucun signal terrain n'est disponible : ni analytics, ni retour utilisateur consigné dans le dépôt. Les hypothèses de problème ci-dessous sont raisonnées, non mesurées. |
| **À arbitrer** | « Montrer toutes les parties » (demande) contre « faire produire une première contribution » (objectif d'activation). Les deux sont défendables ; la demande explicite prime, l'activation est traitée en v2. |
| **Risque d'interprétation** | Confondre onboarding et documentation. L'onboarding **ne remplace pas** `GUIDE_UTILISATEUR.md` : il en reprend les phrases d'ouverture, pas les 4 statuts de sujet ni les 5 statuts de proposition. |

### Filtre 2 — Périmètre fonctionnel

**Écrans existants concernés** : `screenTopics` (`js/ui.js:582`), `screenTopic`
(`:879`), `screenProposals` (`:1029`), `screenConclusion` (`:1066`),
`screenMeeting` (`:1156`), `screenSettings` (`:1236`).

**Contrainte structurelle décisive, vérifiée** : à la première connexion sur un
espace neuf, ces écrans **n'existent pas**. `screenTopic`, `screenProposals` et
`screenConclusion` exigent un `topicId` (`js/ui.js:879`, `1029`, `1066`), et le
FAB lui-même est conditionné à `if (all.length)` (`js/ui.js:654`). Une visite
guidée qui surligne les vrais éléments est donc **techniquement impossible** au
moment même où elle serait utile.

**Inclus (v1)** : cinq panneaux séquentiels au maximum — moins selon le segment,
voir 9.2 bis —, un marqueur de première connexion,
une entrée de rejeu dans les Réglages.
**Exclu (v1)** : voir § *Hors périmètre*.

### Filtre 3 — Expérience / logique d'usage

| | |
|---|---|
| **Confirmé** | Déclencheur : premier instant où `App.gate()` renvoie `null` — connexion configurée, verrou ouvert, nom saisi. |
| **Confirmé** | Le gate `lock` ne doit **rien** recevoir : le README garantit que le champ de code est saisissable au premier rendu. Quelqu'un qui reverrouille après une heure n'est plus un débutant. |
| **Confirmé** | Trois contextes d'entrée distincts : la personne qui a installé l'espace (il est vide, elle doit l'amorcer), celle qui rejoint par un lien (l'espace est peuplé), celle qui essaie en mode local (elle est seule). |
| **Manquant** | Rien dans l'état ne distingue l'installateur de l'invité. La différenciation se fait donc sur l'**état observable** (`Store.view.topics.length`, `participants.length`, `Sync.connection.localMode`), jamais sur un rôle déclaré. |
| **À arbitrer** | Nombre de panneaux : 6 (couvre les parties, répond à la demande) ou 4 (thèse du cadrage produit : au-delà, on paie une friction pour une information déjà présente in situ). |

### Filtre 4 — Données et règles

L'onboarding **ne lit et n'écrit qu'une seule clé locale**. Il ne produit aucune
action, ne touche pas à `Store`, ne modifie pas l'état partagé, n'émet aucune
requête. Inventaire complet des marqueurs existants et de leur survie à une
déconnexion : § *Détection*, table 1.

### Filtre 5 — Impacts techniques

| | |
|---|---|
| **Confirmé** | `UI.render` **détruit et reconstruit** `#app` à chaque appel (`js/ui.js:1679`), avec court-circuit par `signature()` (`:1620`), capture/restauration des brouillons `[data-draft]` (`:140`), et fenêtre d'entrée `ENTER_WINDOW_MS = 1400 ms` publiée en `--enter-elapsed` (`:95-101`, `:1663-1684`). |
| **Confirmé** | `renderOverlay` (`:1574`) est **mono-emplacement** : il vide `#overlay-root` et rend une feuille **ou** une fenêtre. Y loger la séquence la ferait disparaître au premier `UI.set`. |
| **Confirmé** | `onHashChange` (`js/app.js:305`) et la touche Échap (`js/app.js:484`) remettent `sheet`/`modal` à `null`. Une séquence implémentée comme `modal` est tuée par un retour arrière. |
| **Confirmé** | `apps-script/` est **gitignoré** (`.gitignore:1-5`, « Ce dépôt ne contient QUE le frontend »). Toute idée d'action serveur est hors d'atteinte et casserait `tests/parity.test.js`. |
| **Confirmé** | Un fichier JS nouveau doit être déclaré **deux fois** : `index.html` et `SHELL` (`service-worker.js:12-29`). Oubli du second = démarrage à froid hors ligne cassé. |
| **À arbitrer** | Le calque vit-il dans le cycle de `UI.render` ou hors de lui ? Tranché en C : **hors**. |

### Filtre 6 — Validation

Testable sous Node, sans DOM ni framework, dans le style de
`tests/session.test.js` : **la règle de décision uniquement**, extraite en
fonction pure. Tout le reste — focus, annonces, clavier virtuel, 200 %, hors
ligne à froid — relève de la recette manuelle et des agents QA du dépôt.
`node tests/qa/compat-scan.js` est un préalable, pas une vérification finale.

---

## PHASE 3 — Questionnaire de clarification

### A. Questions critiques

1. **Six panneaux ou quatre ?** La demande dit « les différentes parties » ; le
   cadrage produit soutient que seules quatre informations ne sont pas déjà
   enseignées in situ. Le plan ci-dessous retient **six** et assume la friction.
2. **La séquence doit-elle pouvoir être passée dès le premier panneau ?** Le
   plan retient **oui**, « Passer » visible dès la première image.
3. **Rejouer la séquence à une évolution majeure de l'app ?** Le plan retient
   **non par défaut** : `CONFIG.ONBOARDING_REV` existe et permet de le décider
   au cas par cas, mais n'est jamais indexé sur `APP_VERSION`.

### B. Questions importantes

4. Le rejeu depuis les Réglages est-il souhaité en v1 (lot L4) ou reportable ?
5. En mode local, panneau raccourci et honnête (« vous êtes seul, le vote et les
   réactions prennent leur sens à plusieurs ») ou séquence identique ?
6. Une déconnexion suivie d'une reconnexion sur le même appareil rejoue-t-elle
   la séquence ? Le plan retient **non**, avec une réserve de confidentialité
   documentée en § *Constats préexistants*.

### C. Questions d'optimisation

7. Faut-il saisir l'occasion pour ajouter un bouton « Inviter l'équipe » (copie
   de l'adresse) — aujourd'hui inexistant, alors que c'est la friction la plus
   coûteuse d'un outil dont la valeur est collective ?
8. Faut-il un panneau « installer l'application sur l'écran d'accueil », et si
   oui au **deuxième** lancement plutôt qu'au premier ?

---

## PHASE 4 — Options et arbitrages

### Arbitrage A — Forme de la séquence

| Option | Description | Avantages | Inconvénients | Impacts | Verdict |
|---|---|---|---|---|---|
| **A1 · Panneaux séquentiels** | 6 feuilles basses successives, posées sur l'écran réel assombri | Coût maîtrisé ; aucune dépendance à la présence d'un élément ; conforme à la direction artistique ; a11y traitable | Ne montre pas le geste in situ | `js/ui.js`, `css/app.css`, `js/config.js` | **RETENU** |
| A2 · Visite ancrée (spotlight sur les vrais éléments) | Trou dans le voile + halo sur la cible | Pédagogie supérieure *quand elle fonctionne* | Voir démonstration ci-dessous | Fort, fragile | Écarté (v2 partiel) |
| A3 · Carrousel horizontal | Panneaux balayables | Familier | Six glissements = diaporama ; `scroll-snap` à vérifier en tier A | Moyen | Écarté |
| A4 · Empty states enrichis seuls | Une ligne « et ensuite ? » dans chaque état vide existant | Coût quasi nul ; se réenseigne | Ne répond pas à la demande (« montrer les parties ») | Très faible | **Complément retenu** |

**Pourquoi A2 est écarté** — quatre constats indépendants convergent :

1. **Direction artistique** : l'aura et le grain ont été supprimés du thème
   précisément parce qu'ils coûtaient « deux couches fixes plein écran, dont une
   en mode de fusion » (`css/app.css:339-346`). Un spotlight rétablit ce que le
   thème a payé pour retirer.
2. **Technique** : la seule implémentation sans mesure JavaScript — un
   `box-shadow: 0 0 0 100vmax var(--scrim)` porté par la cible — est **rognée**
   par `.screen.chat { overflow: hidden }` (`css/app.css:377`) et par `.thread`
   (`:1129`), et inopérante sur les trois barres à `backdrop-filter`
   (`:395`, `:1158`, `:1400`) qui créent un contexte d'empilement. Le trou ne
   fonctionne donc sur **aucune** des cibles qui valaient la peine : bulle de
   message, barre du haut, quickbar, composeur.
3. **Accessibilité** : en thème clair, un anneau `--accent` sur le scrim mesure
   **2,02:1**, très en dessous du seuil de 3:1 (SC 1.4.11). Il faudrait deux
   valeurs d'anneau selon le thème.
4. **Périmètre** : les écrans à surligner n'existent pas au premier lancement
   (Filtre 2).

Toute mise en évidence par mesure de position (`getBoundingClientRect`, cadre
flottant en `top/left`, `clip-path`, `mask`) est **interdite** : `UI.render`
détruit le nœud mesuré (`js/ui.js:1679`), et la panne est silencieuse.

### Arbitrage B — Place dans le cycle de vie

| Option | Avantages | Inconvénients | Verdict |
|---|---|---|---|
| B1 · Nouveau gate `welcome` en tête de `App.gate()` | Simple à brancher ; `currentScreen()` gagne une branche | Un défaut de la séquence peut empêcher d'atteindre les Réglages **et** le bandeau de mise à jour — or le rechargement n'a lieu que si l'utilisateur clique (`js/app.js:439-442`). Seul recours : désinstaller la PWA | Écarté |
| **B2 · Calque monté après `gate() === null`** | La séquence ne peut jamais bloquer l'accès ni la mise à jour ; le chemin critique connexion/verrou/nom reste intact | Un point de montage à écrire | **RETENU** |

### Arbitrage C — Où vit l'état de la séquence

| Option | Avantages | Inconvénients | Verdict |
|---|---|---|---|
| C1 · `UI.local.tour` | Idiomatique | `UI.set` incrémente `UI.local.version`, qui entre dans `signature()` (`js/ui.js:1627`) : **chaque « Suivant » reconstruit `#app`**. Focus perdu (seuls les `[data-draft]` sont restaurés), et une région `aria-live` insérée en même temps que son contenu **n'annonce rien** | Écarté |
| **C2 · Calque autonome, hors du cycle `UI.render`** | Focus stable, région live persistante, brouillons intacts, cascade `.reveal` non rejouée, animation jamais interrompue | Doit gérer son propre montage/démontage | **RETENU** |

C2 résout d'un coup cinq problèmes distincts : le blocage a11y ci-dessus, la
perte des brouillons non préfixés `composer:` (`js/ui.js:147`), le rejeu
parasite de la cascade dans la fenêtre de 1400 ms, la destruction du calque par
un retour arrière, et le besoin d'un mécanisme `--onboard-elapsed` jumeau de
`--enter-elapsed` — **inutile** dès lors qu'aucun rendu n'interrompt la
séquence. Les précédents du dépôt existent : `UI.showUpdateBanner`
(`js/ui.js:1710`, garde d'idempotence + `document.body.appendChild`) et
`UI.refreshStatus` (`:319`, mutation en place hors rendu).

### Arbitrage D — Fichier et testabilité

| Option | Avantages | Inconvénients | Verdict |
|---|---|---|---|
| D1 · Nouveau `js/onboarding.js` | Isolation, testable | Double déclaration `index.html` + `SHELL` ; oubli = écran blanc hors ligne uniquement |  Écarté |
| **D2 · Règle pure dans `js/config.js`, panneaux dans `js/ui.js`** | Aucun fichier ajouté, donc risque `SHELL` nul ; `config.js` héberge **déjà** une règle pure testée du même genre (`CONFIG.sessionUsable`, `:113`) ; `heroBlock`/`sectionTitle`/`reveal` restent accessibles dans l'IIFE de `ui.js` | `ui.js` grossit | **RETENU** |

---

## PHASE 5 — Hypothèses temporaires

| Hypothèse | Risque | Conséquence si fausse |
|---|---|---|
| H1 · Six panneaux d'environ 20 s sont tolérables sur un outil interne vu 1–2 ×/semaine | Moyen | Réflexe « Passer » massif : la séquence ne nuit pas (tout son contenu existe ailleurs) mais ne sert à rien. Repli : réduire à quatre, sans changement d'architecture |
| H2 · La friction d'entrée dominante est pédagogique, pas technique | Moyen | Si le vrai blocage est l'URL du script à recoller, l'onboarding ne le corrige pas. Traité séparément (question C7) |
| H3 · Un marqueur local suffit ; personne n'a besoin d'un onboarding synchronisé entre ses appareils | Faible | Séquence rejouée sur le second téléphone. Acceptable, et de toute façon inévitable sans backend |
| H4 · Le vocabulaire du modèle (sujet / proposition / conclusion) est stable | Faible | Contenu à réécrire si le modèle change. `MODELE_DONNEES.md` est stable depuis l'origine |
| H5 · La règle de migration suffit à ne pas rejouer la séquence chez l'équipe existante | **Élevé** | Sans elle, **tout le monde** revoit l'onboarding au déploiement. C'est le défaut le plus visible possible : il est traité en R4 et testé |

---

# LIVRABLE FINAL

## 1. Titre

Séquence d'onboarding de première connexion, et détection de la première
connexion.

## 2. Objectif métier

Qu'un nouvel arrivant connaisse en une minute les cinq temps de l'outil et
sache où chacun se trouve, sans lire la documentation, sans bloquer l'accès, et
sans qu'aucune donnée quitte l'appareil.

## 3. Contexte

PWA vanilla sans dépendance ni build, publiée sur GitHub Pages, backend Apps
Script hors dépôt. Petite équipe, usage hebdomadaire, entrée fréquente par un
lien partagé, public en partie non technique. Version courante `1.7.0`.

## 4. Périmètre

**Inclus** — cinq panneaux séquentiels au maximum, modulés par segment ; marqueur local de première connexion avec
règle de migration ; entrée de rejeu dans les Réglages ; ligne « et ensuite ? »
dans les quatre états vides existants ; documentation et recette.

**Exclus** — visite ancrée / spotlight / coach marks (arbitrage A) ; onboarding
avant les gates connexion, verrou et nom ; données de démonstration ; toute
action de synchronisation et toute télémétrie ; vidéo, image, police ou
illustration nouvelle ; onboarding différencié par rôle déclaré.

**Hors sujet** — refonte de l'écran de connexion ; bouton d'invitation ;
installation PWA guidée. Chacun est un chantier propre (voir § *Suites*).

**Évolutions futures non incluses** — pédagogie *just-in-time* au premier
contact réel avec chaque écran (v2), au plus deux coach marks différés (v2).

## 5. Comportement attendu (chronologique)

1. Au démarrage, `App.start` charge identité, éléments propres et connexion.
2. Après `loadConnection()`, la règle de décision est évaluée **une fois** :
   marqueur absent ou incomplet → séquence due ; marqueur absent mais appareil
   manifestement déjà utilisé → marqueur écrit en « déjà vu », rien affiché.
3. Les gates s'enchaînent normalement : `connection`, puis `lock`, puis `name`.
   **La séquence n'apparaît à aucun de ces trois moments.**
4. Au premier rendu où `App.gate()` renvoie `null`, et seulement après
   l'extinction de la fenêtre d'entrée (`ENTER_WINDOW_MS`, 1400 ms), le calque
   se monte : voile, puis premier panneau du segment détecté.
5. « Suivant » remplace le contenu du panneau **sans reconstruire l'écran** et
   écrit l'étape courante sur l'appareil.
6. « Passer » (panneaux 1 à 5) ou « Commencer » (panneau 6) démonte le calque,
   écrit l'achèvement, rend le focus à l'écran réel. La route en cours est
   **conservée** : la séquence ne navigue jamais à la place de l'utilisateur.
7. Toute réapparition d'un gate pendant la séquence (reverrouillage après une
   heure, retour sur la connexion) **démonte le calque immédiatement** ;
   l'étape est conservée et la séquence reprend une fois le gate franchi.
8. Rechargée, réinstallée, la séquence ne se rejoue pas — sauf rejeu explicite
   depuis les Réglages.

## 6. Règles métier

- **R1** — La séquence n'est jamais un `gate`. Elle ne peut, à aucun instant,
  empêcher d'atteindre les Réglages ni le bandeau de nouvelle version.
- **R2** — Un seul enregistrement local, sous une seule clé, écrit en une seule
  opération JSON (une écriture partielle est impossible).
- **R3** — Si l'enregistrement est absent **mais** que l'appareil porte déjà une
  adresse de script, un mode local ou un nom d'utilisateur, l'appareil est une
  installation existante : écrire « déjà vu, par migration » et **ne rien
  afficher**.
- **R4** — Le rejeu automatique n'est jamais indexé sur `APP_VERSION` : il est
  gouverné par un entier dédié, incrémenté à la main et seulement si l'on veut
  réellement rejouer.
- **R5** — Un enregistrement abîmé (nul, vide, type inattendu, étape négative,
  horodatage futur) est traité comme absent, sans jamais lever d'exception.
- **R6** — Si le stockage local est indisponible ou refuse l'écriture, la
  séquence est affichée **au plus une fois par chargement de page**, via un
  drapeau en mémoire. Jamais deux fois, jamais de boucle.
- **R7** — L'étape courante est persistée à chaque avance : une interruption
  reprend où elle s'est arrêtée.
- **R8** — La séquence n'émet aucune action, ne modifie pas `Store`, ne provoque
  aucune requête réseau et ne dépend pas de la connectivité.
- **R9** — Aucun champ de saisie dans la séquence, et **aucun attribut
  `data-draft`** : `captureDrafts` balaye tout le document (`js/ui.js:142`).
- **R10** — Le bandeau de nouvelle version est ajourné tant que la séquence est
  affichée ; il apparaît dès son démontage.
- **R11** — La touche Échap ferme la séquence. `showModal()` la sert nativement,
  mais le gestionnaire global (`js/app.js:484`) doit tout de même la connaître : sinon
  il provoque en plus un rendu complet de l'écran de fond à chaque appui, et sur le
  chemin de repli tier B — où il n'y a pas de `<dialog>` — Échap ne fermerait rien.
- **R12** — L'état au repos du balisage est l'état **final** : sans animation,
  chaque panneau est complet, lisible et actionnable.
- **R13** — Aucun texte de la séquence n'est posé directement sur le voile : en
  thème clair, le blanc sur scrim mesure 2,94:1. Le texte vit sur une surface
  opaque.
- **R14** — Une déconnexion ne rejoue pas la séquence ; un changement d'adresse
  de script non plus. La séquence porte sur le produit, pas sur l'espace.

## 7. Données impactées

**Table 1 — marqueurs existants et leur survie à `App.logout()`**

| Clé | Écrite | Effacée | Survit à la déconnexion |
|---|---|---|---|
| `brainsto.user` | `js/app.js:26`, **dès le premier chargement** (uid généré), et `:271` | jamais | **oui** |
| `brainsto.apiUrl` | `:159` | `:192`, `:204` | non |
| `brainsto.lockVerifier` | `:161` | `:162`, `:193`, `:205` | non |
| `brainsto.session` | `:72`, seulement si verrou **et** déverrouillé | `:79` (relock, logout, mode local, expiration) | non |
| `brainsto.ownItems` | `:39` | jamais | **oui** |
| `brainsto.localMode` | `:191` / `:160` | `:206` | non |
| `brainsto.showArchived` | `js/ui.js:626` | jamais | **oui** |
| IndexedDB `queue` / `meta.state` | `js/database.js:90`, `js/sync.js:178` | `js/app.js:213` | non |
| `state.participants[]` (serveur) | `REGISTER_PARTICIPANT` depuis `js/app.js:272` | jamais | partagé |

**Conséquence capitale** : `loadUser()` (`js/app.js:20-28`) est appelé en tête de
`App.start` (`:491`), avant tout gate et toute intention utilisateur ; sa branche
`else` génère un uid et l'écrit immédiatement. **`brainsto.user` existe donc dès
la première milliseconde : sa présence ne prouve rien.**

**Ajout** — une clé, `brainsto.onboarding`, dans le bloc `CONFIG.KEYS`
(`js/config.js:79-87`), plus un entier `CONFIG.ONBOARDING_REV` à côté de
`APP_VERSION` (`:13`).

Forme de l'enregistrement :

| Champ | Rôle |
|---|---|
| `s` | version du **schéma** de l'enregistrement (migrations futures) |
| `rev` | valeur de `ONBOARDING_REV` au moment de l'achèvement |
| `at` | horodatage du premier lancement sur ce stockage |
| `step` | étape courante si la séquence a été interrompue ; `0` si terminée |
| `done` | séquence achevée |
| `skipped` | achevée par « Passer » plutôt que par « Commencer » |
| `migrated` | installation antérieure reconnue, séquence jamais montrée |

## 8. Détection de la première connexion

> **Statut probatoire de cette section — décision O.** Aucune des treize sources
> consultées ne prescrit de mécanisme de détection du premier lancement ni de garde
> anti-rejeu (limite de P4). Tout ce qui suit est une **extrapolation** appuyée sur le
> code de ce produit, non un relevé de pratiques. La solution reste la bonne pour
> BrainstO. — elle est vérifiable, testable et sans alternative ici, puisque aucun
> marqueur serveur n'est atteignable — mais son statut doit être exact.
> Le point de rupture de P4 s'applique en plein : sur appareil partagé ou après
> effacement du stockage, un marqueur local rejoue la séquence à tort, et rien dans ce
> produit ne peut l'empêcher.

### 8.1 Quatre notions à ne pas confondre

1. **Premier lancement sur ce stockage** — plus exactement sur ce partitionnement
   (appareil × origine × profil × navigation privée × PWA installée *vs* onglet).
   Décidable **uniquement** par l'absence d'une clé que nous écrivons nous-mêmes.
   C'est la seule des quatre qui soit techniquement solide, et c'est celle que
   nous utilisons.
2. **Première entrée effective dans l'espace** — premier instant où `App.gate()`
   renvoie `null`. C'est l'événement produit intéressant, distinct du précédent :
   entre les deux, il peut s'écouler des jours et plusieurs abandons sur l'écran
   de connexion. C'est ce moment qui **déclenche l'affichage**.
3. **Première fois que cette personne utilise le produit** — **indécidable**, et
   c'est un choix d'architecture assumé : ni compte, ni identité serveur avant
   `REGISTER_PARTICIPANT`, et l'uid est régénéré à chaque stockage neuf. Ne
   jamais construire quoi que ce soit qui en dépende.
4. **Première utilisation après réinstallation ou vidage** — par construction
   **identique à (1)**. Au mieux une heuristique douce, jamais bloquante :
   identité neuve alors que l'état rapatrié contient déjà des participants et une
   révision non nulle → « vous rejoignez un espace déjà actif ».

### 8.2 Règle retenue

Une fonction **pure**, dans `js/config.js`, sur le modèle exact de
`CONFIG.sessionUsable` (`:113`) — même esprit, même testabilité sous Node : elle
reçoit l'enregistrement relu, le contexte (`{ hasConnection, hasName,
storageOk }`), la révision courante, et renvoie `null` (rien à faire) ou l'étape
à laquelle démarrer. Elle applique R3, R4, R5 et R7, et ne touche à rien.

Évaluée **une fois** au démarrage, après `loadConnection()` (`js/app.js:493`) —
il faut `Sync.connection` et `App.user.name` renseignés pour trancher la
migration — et jamais réévaluée ensuite dans le même chargement.

### 8.3 Cas limites

| Cas | Comportement attendu |
|---|---|
| Navigation privée, stockage refusé | `Utils.storage` échoue en silence (`js/utils.js:426-429`) : détecter par une sonde, basculer sur un drapeau **mémoire**, afficher au plus une fois par chargement (R6) |
| `localStorage` plein (`QuotaExceededError`) | `set` renvoie `false` : tester le retour, marquer « vu » en mémoire, poursuivre sans toast bloquant |
| Éviction iOS Safari après 7 jours sans usage | Indistinguable d'un premier lancement : séquence rejouée. Atténuation possible par l'heuristique 8.1-4, jamais un blocage |
| Même personne, deux appareils | Séquence sur chacun. Assumé (H3) |
| Deux personnes, même appareil | **Non couvert aujourd'hui** — voir § *Constats préexistants*, n° 2 |
| Déconnexion puis reconnexion | Pas de rejeu (R14) |
| Changement d'espace (nouvelle URL) | Pas de rejeu (R14) |
| Mise à jour du service worker en pleine séquence | Aucun rechargement sans clic (`js/app.js:439-442`) ; `step` étant persisté, la séquence reprend après rechargement. Bandeau ajourné (R10) |
| Reverrouillage après une heure pendant la séquence | Le gate `lock` **prime** : calque démonté, étape conservée, reprise après déverrouillage |
| Lien profond `#/topic/xxx` | La route gagne toujours. La séquence ne réécrit **jamais** `window.location.hash` |
| Mode local puis passage en mode équipe | Pas de rejeu ; un panneau raccourci reste préférable en mode local (question C5) |
| Retour de `name` vers `connection` puis retour | Aucun effet : la décision n'est prise qu'une fois par chargement |

### 8.4 Signaux à ne jamais utiliser pour détecter

`brainsto.ownItems` (vide chez un lecteur assidu et sur son second appareil) ·
l'état vide (un espace neuf est indistinguable d'un utilisateur neuf, et l'état
est nul pendant les premières centaines de millisecondes) · la révision serveur
(partagée, remise à zéro par une réinstallation du backend, et `meta.state` est
vidé par la déconnexion) · les cookies (absents du dépôt, non partagés entre PWA
et onglet, plafonnés à 7 jours par l'ITP) · le user-agent · la présence de
`brainsto.user` (§7) · `sessionStorage` (réinitialisé à chaque lancement) ·
`DB.loadState() === null` (vrai aussi après un premier `pull` hors ligne).

## 9. Le plan-séquence

### 9.1 Vue d'ensemble

**Cinq panneaux, et cinq seulement** — décision **J**, tirée de P2. Ils ne sont pas
choisis : ce sont exactement les cinq parties de l'application. Le panneau
d'introduction de la version précédente a été retiré, parce qu'il faisait doublon avec
l'accroche déjà affichée à l'entrée, « Préparer les réunions de l'équipe, ensemble. »
(`js/ui.js:459`).

| N° | Partie | Icône | Objectif pédagogique | Sortie |
|---|---|---|---|---|
| 1 / 5 | Les sujets | `message` | un sujet = un point à traiter ; où l'on en ajoute | Passer |
| 2 / 5 | Le débat | `users` | **le geste non devinable** : appuyer sur une bulle | Passer |
| 3 / 5 | Propositions et votes | `idea` | trois voix, un vote par personne, la barre de répartition | Passer |
| 4 / 5 | La conclusion | `checkCircle` | choix unique, mention « En tête » | Passer |
| 5 / 5 | La réunion | `print` | la synthèse projetable ; où revoir la présentation | Commencer |

Toutes ces icônes existent déjà dans `Utils.icon` (`js/utils.js:65-102`) **et
sont déjà associées à ces écrans** dans `ui.js`. C'est le vrai levier du « ça a
toujours fait partie de l'app » : l'utilisateur voit dans le panneau le signe
exact qu'il retrouvera dans la barre.

### 9.2 Contenu rédigé

Surtitre commun : `icône + NOM DE LA PARTIE + « n / 5 »`, en capitales, gris
`--faint`, sur le modèle de `sectionTitle()` (`js/ui.js:48`). Le compteur est
**textuel** — `font-variant-numeric: tabular-nums` est déjà global, le chiffre ne
saute pas d'un panneau à l'autre, et six caractères remplacent une rangée de
pastilles. Il satisfait aussi P2 : la longueur est visible dès le premier panneau.

**1 / 5 — LES SUJETS**
Titre : « Un sujet par point à traiter »
Corps : « L'équipe dépose ici ce qu'il faut traiter en réunion, du plus récemment
actif au plus ancien. Le bouton + en ajoute un ; vous pouvez le proposer sans le
signer. »

**2 / 5 — LE DÉBAT**
Titre : « On en discute, chacun à son rythme »
Corps : « La discussion se lit comme un fil de messages. Appuyez sur une bulle
pour réagir, la citer, ou en tirer une proposition. »

**3 / 5 — PROPOSITIONS**
Titre : « Les idées deviennent des propositions »
Corps : « Une proposition se vote pour, contre ou abstention — un vote par
personne, modifiable. La barre montre où en est l'équipe. »
Appui visuel : la vraie `.vote-bar` en miniature dans un `.note`, jamais une
flèche vers l'écran.

**4 / 5 — LA CONCLUSION**
Titre : « Ce que vous présenterez »
Corps : « Chaque sujet se referme sur une conclusion. Chacun en choisit une
seule ; la mieux votée porte la mention En tête. »

**5 / 5 — LA RÉUNION**
Titre : « Tout tient sur une page »
Corps : « Réglages, puis Ouvrir la synthèse : sujets, votes et conclusions,
prêts à projeter. Vous pourrez revoir cette présentation depuis les Réglages. »
Ornement : `Utils.logoMark(44)` **au repos** — anneau et point, sans animation.
Bouton unique : « Commencer ». Plus de « Passer » : il n'y a plus rien à passer.

**Le libellé de la sortie dit la suite** (P3) : « Passer » sur les panneaux 1 à 4,
« Commencer » sur le dernier. Jamais « Fermer », qui ne dit rien de ce qui arrive.

### 9.2 bis Deux traitements selon le segment — décision M

C'est la conséquence la plus importante de la recherche, et elle n'était pas dans la
version précédente de ce document.

| Segment | Détection | Traitement | Fondement |
|---|---|---|---|
| **Premier arrivant** — espace vide (`Store.view.topics.length === 0`) | état observable, jamais un rôle déclaré | **Les cinq panneaux.** C'est le seul cas où la séquence en amont est justifiée | Point de rupture de P1 : sur un écran vide où rien ne se passe sans qu'un collègue agisse, il n'existe aucun « moment de l'usage » où déporter l'explication |
| **Personne qui rejoint** — espace déjà peuplé | idem | **Deux panneaux** : *Le débat* (le geste de la bulle) et *La conclusion* (ce à quoi ça sert). Le reste est déporté au moment de l'usage, dans les états vides | P1 s'applique pleinement : les écrans existent, ils s'enseigneront d'eux-mêmes. Et P6 : cette personne n'a pas à traverser les étapes du premier arrivant |
| **Mode local** — solo | `Sync.connection.localMode` | **Trois panneaux** : sujets, débat, conclusion. Ni votes ni réunion : ils n'ont aucun sens seul | Ne rien promettre d'un collectif absent |

Le compteur s'adapte : « 1 / 2 », « 1 / 3 », « 1 / 5 » selon le segment. Il ne
promet jamais plus d'étapes qu'il n'en reste.

**Variante de corps en mode local**, panneau *Les sujets* : « En mode local, les
données restent sur cet appareil. Le vote et les réactions prennent leur sens à
plusieurs. »

**Variante de corps sur espace peuplé**, panneau *Le débat* : « L'équipe a déjà
lancé des sujets. Ouvrez-en un : la discussion s'y trouve. »

### 9.3 Machine à états

| État | Événement | État suivant | Effet |
|---|---|---|---|
| absent | `gate()` passe à `null`, fenêtre d'entrée écoulée | `running(1)` | montage du calque |
| `running(n)` | Suivant | `running(n+1)` | mutation en place, `step` écrit |
| `running(n)` | Précédent | `running(n-1)` | mutation en place |
| `running(n)` | Passer | `done(skipped)` | démontage, focus rendu |
| `running(dernier)` | Commencer | `done` | démontage, focus rendu |
| `running(n)` | un gate réapparaît | `paused(n)` | démontage immédiat, `step` conservé |
| `paused(n)` | gate franchi | `running(n)` | remontage à l'étape n |
| `running(n)` | Échap | `done(skipped)` | comme Passer (R11) |
| `done` / `skipped` | rejeu depuis les Réglages | `running(1)` | seul l'enregistrement d'onboarding est remis à zéro |
| `done` | `ONBOARDING_REV` incrémentée | `running(1)` | uniquement si la décision est prise explicitement (R4) |

Le mode hors ligne n'apparaît pas dans cette table : aucune étape n'attend le
réseau (R8).

### 9.4 Parcours alternatifs

| Situation | Comportement |
|---|---|
| Abandon au panneau 3 | `done(skipped)` écrit, calque retiré sans confirmation, aucune relance automatique |
| Espace déjà peuplé | Variante de panneau 2 ; aucune écriture provoquée |
| Mode local | Variante de panneau 1 ; le badge « Local » des Réglages sert d'appui au panneau 6 |
| Lien profond, séquence non finie | La route est conservée ; les panneaux ne parlent d'aucun écran précis, la séquence reste valable où que l'on soit |
| Rotation, 200 %, clavier ouvert | Aucune mesure de position n'est en jeu : rien à recalculer |

### 9.5 Rejeu

Nouvelle carte dans `screenSettings`, insérée **entre** la carte « Réunion » et
le bloc de diagnostic (`js/ui.js:1319`) — après les fonctions utiles, avant la
technique : surtitre `sparkle` « Présentation », une ligne d'état (« Vue le … » /
« Passée » / « Non vue »), un bouton `btn-outline btn-block` « Revoir la
présentation ».

**Remis à zéro** : le seul enregistrement `brainsto.onboarding`.
**Intacts** : identité, éléments propres, connexion, vérificateur, session
déverrouillée, préférence d'archives, file d'actions, données d'équipe.
Le rejeu ne repasse **jamais** par les gates.

## 10. Direction artistique et mouvement

**Contrat esthétique** — dix règles opposables, chacune adossée à une décision
déjà écrite du dépôt :

1. Le panneau est une **feuille**, jamais un écran : `--surface-sheet`,
   `--shadow-2`, `--radius-card` sur les coins hauts, `border-top: 1px solid
   var(--line)`. Le niveau 2 est réservé à ce qui flotte ; un panneau plein écran
   inventerait une troisième élévation.
2. **Une seule dépense d'accent par panneau** : le bouton principal. L'accent se
   dépense en cinq endroits dans tout le thème, et ni le surtitre, ni le
   compteur, ni les icônes, ni le liseré n'en font partie.
3. **Aucune taille typographique nouvelle.** Cinq existent ; `--display` et
   `--page-title` sont réservés au logotype et aux titres d'écran. La hiérarchie
   passe par la graisse.
4. **Un seul niveau de capitales** par panneau : le surtitre.
5. **Rythme 6 / 14 / 26**, sans valeur intermédiaire inventée.
6. **Aucun flou** : le flou est cantonné à trois surfaces collantes. Le panneau
   est opaque par construction.
7. **État au repos = état final** (R12).
8. **Aucune seconde couche plein écran composée** — c'est la raison documentée de
   la suppression de l'aura et du grain (`css/app.css:339-346`).
9. **Un seul geste** : l'ouverture. Entre deux panneaux, le contenu change en
   opacité, le panneau ne bouge pas.
10. `--line` habille, `--line-field` délimite : tout contrôle interne porte
    `--line-field`, seul à tenir le seuil de 3:1.

**Aucune illustration nouvelle.** Six dessins introduiraient une grammaire
graphique que le dépôt n'a pas — tout son dessin tient dans un trait de 1,7 px,
bouts arrondis, `currentColor` — pour des actifs vus une seule fois, et toute
production externe est fermée d'avance. Le sens est porté par les icônes de
l'interface réelle (§9.1). Les quatre points de convergence de la séquence
d'accueil ne sont **pas** réemployés : le README dit qu'ils n'appartiennent pas à
la marque et n'existent que pendant l'animation.

**Chorégraphie** — trois gestes seulement, et ils ne sont pas du même régime :
l'arrivée est vue une fois (régime expressif, dépense autorisée — c'est l'option D de
la décision 16 du corpus local, qui nomme explicitement l'onboarding), la
**transition est vue quatre fois en trente secondes** (régime des actions
fréquentes, borne basse), la sortie une fois.

**Révision issue de la recherche — décision L.** La version précédente de ce document
donnait 220 ms à la transition, avec un déplacement de 8 px sur le texte. Deux
raisons de la corriger : P8 place la transition inter-étapes sous 150 ms, et le
critère normatif de mouvement ne vise que le **déplacement** et le changement de
taille — **un fondu d'opacité seul sort du champ du critère**. Supprimer le
déplacement entre étapes ne compense donc pas le risque vestibulaire : il l'élimine.

```
Arrivée (une fois, 400 ms)          Transition n → n+1 (4 fois, 140 ms)
ms  0    100   200   300   400      ms  0    100
voile [======240======]             voile ——— inchangé, aucun repaint ———
panneau   [====220====]  (dép. 180) texte_n [=100=]         opacity 1 → 0
  ↳ opacity + translateY 8px        texte_n+1  [=100=]      opacity 0 → 1
    (vu une fois, replié sous          (départ 40 — recouvrement 60 ms)
     mouvement réduit)               ↳ OPACITÉ SEULE, aucun déplacement
```

Durées existantes uniquement : `--dur-slow` (240 ms) pour la pose du voile,
`--dur-fast` (100 ms) pour les deux moitiés de la transition, `--reveal-duration` /
`--reveal-distance` (220 ms, 8 px) pour l'entrée du premier panneau — seul endroit où
le vocabulaire de déplacement du dépôt est employé. **Courbe unique :
`--ease-out`.** `--ease-in` est réservé aux points de convergence, `--ease-spring` au
point du monogramme — un dépassement sur un élément d'interface se lit comme un défaut.

**Le voile ne se refond jamais entre deux panneaux** : c'est le seul repère fixe
de la séquence. **Aucune boucle** : une animation en boucle est de fréquence
infinie, et la seule du fichier (`pulse-dot`) porte une information d'état réelle.
**Rien de tout cela ne chevauche la séquence d'accueil** : le calque attend
l'extinction de `ENTER_WINDOW_MS`. Une seule chose bouge à la fois.

Propriétés animées : `opacity` partout, `transform` **uniquement** sur l'entrée du
premier panneau. Interdites : `width`, `height`, `top/left/inset`, marges,
`box-shadow`, `border-radius`, `filter`, `backdrop-filter`, `letter-spacing`,
`font-weight`.

## 11. Accessibilité — cahier des charges opposable

**Révision issue de la recherche — décision K.** Le calque est un **`<dialog>` ouvert
par `showModal()`**, et non un `div` appareillé à la main. L'élément natif fournit
d'un coup le piège de focus, le calque supérieur et l'inertie réelle de
l'arrière-plan — ce qui satisfait P7 **sans aucune bibliothèque**, donc sans toucher à
la règle « zéro dépendance ». C'est plus court à écrire, plus sûr, et plus proche de
la norme que le dispositif manuel prévu dans la version précédente.

**Réserve dirimante, et elle ne vient pas de la recherche mais de la baseline du
dépôt** : `tests/qa/feature-baseline.json` donne à `js-dialog-showmodal` un plancher
WebKit **15.4**, un mode d'échec **`throws`** et une sévérité **`high`** ; or
`tests/qa/browser-matrix.json` classe `safari-ios-15.0` (iOS 15.0 → 15.3) en **tier
B**, où « une dégradation cosmétique documentée est tolérée, **jamais une perte de
fonction** ». Un `showModal()` non gardé y lève une exception et emporte la séquence.
Donc :

- **L'appel est gardé** par un test de disponibilité de la méthode. Si elle manque, le
  panneau se rend en carte ordinaire dans le flux, non modale, sans voile : la
  séquence reste lisible et actionnable, seule l'inertie du fond est perdue. C'est une
  dégradation cosmétique documentée, admise au tier B — pas une perte de fonction.
- Le même plancher 15.4 gouverne déjà `:focus-visible`, que l'application utilise
  (anomalie A4 du registre de mission). Le tier A est à 15.4 : `<dialog>` n'y ajoute
  aucune contrainte. Seule la sonde tier B exige le repli.

Le reste du cahier des charges tient inchangé :

- Nom accessible **obligatoire** par `aria-labelledby` pointant le titre **visible** du
  panneau, plus `aria-describedby` vers le corps. À noter : les feuilles et fenêtres
  actuelles posent `role="dialog" aria-modal="true"` **sans nom accessible**
  (`js/ui.js:383`, `:397`) — la séquence ne doit pas reproduire ce défaut.
- **Ce que `showModal()` ne fait pas** : le corpus normatif décrit **un** dialogue, pas
  une **séquence** (limite de P7). Le passage d'une étape à la suivante reste donc à
  spécifier à la main, et il n'a aucune source : le focus se replace sur le conteneur
  du panneau, `aria-labelledby` pointe le nouveau titre, et le changement est annoncé
  par la région live. C'est le point de la spécification le plus faiblement étayé, et
  il figure en tête des vérifications différées.
- **Focus initial sur le conteneur du panneau** (`tabindex="-1"`), pas sur
  « Suivant » : sinon le lecteur d'écran annonce « Suivant, bouton » et
  l'explication est perdue. Ordre de tabulation : titre → corps → Précédent →
  Suivant → Passer, « Passer » **dernier dans le DOM** même s'il est visuellement
  en haut : c'est une sortie, pas une action principale.
- **Restitution du focus** à la fermeture sur le premier élément interactif de
  l'écran réel — jamais sur `document.body`, qui renvoie VoiceOver en haut du
  document sans le dire.
- Région `role="status" aria-live="polite"` **présente dans le DOM initial du
  calque** et remplie après coup (« Étape 3 sur 6, Le débat »). Une région live
  insérée en même temps que son contenu n'annonce rien. Jamais `assertive` : cela
  couperait un toast d'erreur.
- **Contrastes** : le texte vit sur `--surface-sheet`, opaque, où `--text`,
  `--muted` et `--faint` passent dans les deux thèmes. Sur le voile en thème
  clair, le blanc mesure 2,94:1, `--muted` 2,08:1, `--accent` 2,02:1 — R13.
- Cibles ≥ 44 px (`--tap`), « Passer » compris : c'est le piège habituel, un lien
  de 11 px.
- **Aucune hauteur fixe** : `max-height: 86vh` + `overflow-y: auto`, sur le
  modèle de `.sheet` (`css/app.css:1504`), sinon le texte est tronqué à 200 % de
  police système. En paysage sous 480 px de hauteur, passer le centrage vertical
  en `flex-start`, faute de quoi le haut du panneau est coupé et inatteignable.
- Le calque est `position: fixed` : il **n'hérite d'aucun** `--safe-*`. Sans
  `calc(var(--safe-bottom) + …)`, « Suivant » passe sous la barre gestuelle.
- Ne pas toucher au `viewport` (`index.html:5`) : ni `maximum-scale`, ni
  `user-scalable=no`. Le pincement doit fonctionner pendant la séquence.
- Sous mouvement réduit : substitution immédiate du contenu, sans fondu croisé,
  et **aucun style de base à `opacity: 0`** — avec le blocage global
  (`css/app.css:1791`), l'animation se terminerait instantanément sur un panneau
  invisible. C'est le mode de panne le plus grave du thème.

## 12. Impacts techniques à prendre en compte

- `signature()` (`js/ui.js:1620`) et `place` (`:1659`) **ne changent pas** :
  l'étape ne vit pas dans `UI.local` (arbitrage C). Rien ne rejoue la cascade.
- Un nouveau point de montage dans `index.html` : la coquille change, donc
  `CACHE_VERSION` (`service-worker.js:10`) **et** `APP_VERSION`
  (`js/config.js:13`) sont incrémentés ensemble, à chaque lot. `SHELL` n'a
  aucun fichier à recevoir (arbitrage D).
- La navigation est *network-first* et les sous-ressources *cache-first*
  (`service-worker.js:70-92`) : un `index.html` neuf peut coexister avec un
  `js/ui.js` de cache ancien. Le code doit se comporter comme « rien à faire »
  si la règle de décision est absente.
- `js/app.js:484` (Échap) est le seul point du chantier qui touche `app.js` en
  dehors du point de décision — R11.
- `UI.showUpdateBanner` (`js/ui.js:1710`) doit s'ajourner (R10) : son bouton est
  focusable, il vit sur `document.body`, il échapperait au piège de focus et se
  poserait en bas de l'écran, exactement sous les commandes du panneau.
- Aucun impact sur `Sync`, `Store`, `state.js`, la file d'actions,
  `tests/parity.test.js`, ni sur le backend — qui n'est pas dans ce dépôt.
- Impression : le calque porte `no-print`, sans quoi il apparaîtrait dans
  l'aperçu du mode réunion.

## 13. Critères d'acceptation

| # | Critère (conforme / non conforme) |
|---|---|
| A1 | Stockage vidé, connexion faite, nom saisi → la séquence apparaît une fois, après la liste des sujets, jamais avant |
| A2 | Elle n'apparaît **jamais** sur les écrans de connexion, de verrou ou de nom ; le champ de code reste saisissable au premier rendu |
| A3 | Après « Passer » ou « Commencer », rechargement puis réouverture → elle ne réapparaît pas |
| A4 | Déploiement sur un appareil qui utilisait déjà l'app (adresse ou nom présents) → **aucune** séquence, aucun clignotement |
| A5 | `Sync.diagnostics()` : révision et actions en attente **inchangées** avant/après la séquence ; aucune requête réseau observée |
| A6 | Hors ligne et en mode local : la séquence s'affiche et se ferme sans erreur ; variante raccourcie en mode local |
| A7 | Reverrouillage provoqué en pleine séquence → le verrou prime, le calque disparaît, la séquence reprend à la même étape après déverrouillage |
| A8 | Un brouillon en cours dans les Réglages survit à un rejeu de la séquence |
| A9 | Lecteur d'écran : le dialogue s'annonce **avec son titre**, le titre est lu avant les commandes, chaque changement d'étape est annoncé, le balayage ne sort jamais du panneau |
| A10 | Clavier externe : Tab fait le tour et revient, un contour de focus est visible sur chaque commande, Échap ferme |
| A11 | Police système à 200 %, en portrait et en paysage : aucun texte tronqué, « Suivant » atteignable |
| A12 | Mouvement réduit activé : chaque panneau est **pleinement visible**, aucun écran vide, aucun élément figé décalé |
| A13 | Aucune commande sous l'encoche ni la barre gestuelle, en portrait comme en paysage |
| A14 | Navigation privée : la séquence s'affiche au plus une fois par chargement, jamais en boucle |
| A15 | Aperçu d'impression du mode réunion : aucune trace du calque |
| A16 | `node tests/{parity,sync,session,onboarding}.test.js` verts ; `node tests/qa/compat-scan.js` sans défaut tier A/B |
| A17 | **Chemin de repli tier B** : avec `showModal` rendu indisponible, la séquence s'affiche en carte non modale, reste navigable, et Échap la ferme. Aucune exception en console |
| A18 | **Les trois segments produisent trois séquences distinctes** : espace vide → cinq panneaux ; espace peuplé → deux ; mode local → trois. Le compteur ne promet jamais plus d'étapes qu'il n'en reste |
| A19 | Entre deux panneaux, **aucun déplacement** : seule l'opacité change, et le mur de transition reste sous 150 ms |
| A20 | Le voile ne se refond pas entre deux panneaux — vérifiable à l'œil : le fond ne clignote pas |

## 14. Cas de test

**`tests/onboarding.test.js`** — style `tests/session.test.js` (assertions
maison, horodatage figé, sortie non nulle en cas d'échec), sur la fonction pure.
La fonction reçoit aussi le segment observé, ce qui la rend testable sans DOM :

- premier lancement, aucune connexion → séquence due à l'étape 1
- installation antérieure reconnue par l'adresse → rien
- installation antérieure reconnue par le nom, en mode local → rien
- séquence interrompue → reprise à l'étape enregistrée
- séquence passée → jamais rejouée à révision égale
- révision incrémentée → rejeu ; révision antérieure à l'enregistrement → rien
- `APP_VERSION` seule modifiée → **aucun** rejeu (R4)
- enregistrement abîmé : `null`, `""`, `[]`, `{}`, étape négative, étape
  au-delà du dernier panneau, `rev` non numérique, horodatage futur → traité
  comme absent, aucune exception (R5)
- stockage indisponible → séquence due, marquée en mémoire (R6)
- non-collision des clés de `CONFIG.KEYS`
- **segment** : espace vide → cinq panneaux ; espace peuplé → deux ; mode local →
  trois ; espace peuplé **et** mode local → trois (le mode local gagne)
- le compteur annoncé égale le nombre de panneaux du segment, jamais cinq par défaut

**Recette manuelle** (à verser dans `docs/CHECKLIST_TEST.md`) : premier
lancement sur stockage vidé · Passer puis réouverture · migration sur appareil
déjà équipé · verrou abaissé à 60 s · brouillon de composeur · clavier iOS ·
démarrage à froid hors ligne · bandeau de nouvelle version · aperçu d'impression
· thème clair et sombre · 200 % · paysage sur appareil à encoche · lecteur
d'écran.

**Agents QA du dépôt**, dans l'ordre : `compat-scan` d'abord et toujours, puis
`qa-webkit-ios`, `qa-blink-android`, `qa-gecko-firefox` en parallèle, puis
`qa-webview-inapp` (spécifiquement le stockage refusé) et
`qa-legacy-proxy-browsers`, puis `qa-pwa-offline`, `qa-responsive-touch`,
`qa-mobile-a11y`, `qa-mobile-perf`, et `qa-mobile-orchestrator` pour le verdict.
**Bloquent la publication** : tout défaut tier A, un `compat-scan` non vide en
tier A/B, un « non observé » sur WebKit iOS, Blink, `qa-pwa-offline` ou
`qa-mobile-a11y`.

## 15. Points de vigilance pour les développeurs

1. **`brainsto.user` n'est pas un marqueur** : il est écrit dès la première
   milliseconde (`js/app.js:26`).
2. **Ne pas loger l'étape dans `UI.local`** : chaque `UI.set` reconstruit `#app`
   et détruit focus et région live.
3. **Ne rien mesurer** : `getBoundingClientRect` sur un nœud que `UI.render` va
   détruire échoue en silence.
4. **Ne jamais poser `data-draft`** dans le calque : `captureDrafts` balaye tout
   le document.
5. **La règle de migration (R3) est le point le plus visible du chantier** : sans
   elle, toute l'équipe revoit l'onboarding au déploiement.
6. **Tester le retour de `Utils.storage.set`** : il renvoie `false` en silence.
7. **Incrémenter `APP_VERSION` et `CACHE_VERSION` ensemble**, à chaque lot.
8. **Ne pas toucher à `enterAt`** ni allonger `ENTER_WINDOW_MS`.

## 16. Version pour ticket

> Ajouter une séquence d'onboarding de cinq panneaux au maximum — deux ou trois
> selon le segment détecté —, jouée une seule fois au
> premier passage effectif dans l'espace (après connexion, verrou et nom), qui
> présente les parties de l'app : sujets, débat, propositions et votes,
> conclusion, réunion. Détection par une clé locale unique
> (`brainsto.onboarding`) et une fonction pure testée dans `js/config.js`, avec
> règle de migration pour ne pas rejouer chez les utilisateurs existants. Calque
> autonome hors du cycle de `UI.render`, jamais un gate, toujours passable,
> rejouable depuis les Réglages. Zéro action serveur, zéro requête, zéro
> dépendance, zéro fichier ajouté.

## 17. Plan d'exécution et découpage

| Lot | Objectif | Fichiers | Ordre | Critère de sortie |
|---|---|---|---|---|
| **L0** | Clé, révision et **règle pure** + tests | `js/config.js`, `tests/onboarding.test.js` | 1er | `node tests/onboarding.test.js` vert, trois autres suites toujours vertes, **aucun effet visible** |
| **L1** | Mécanique du calque : point de montage, montage/démontage, piège de focus, région live, Échap, ajournement du bandeau, **un seul panneau** | `index.html`, `js/ui.js`, `js/app.js`, `css/app.css` | 2e | Le risque architectural est levé en production avec un contenu minimal ; verrou, brouillons, retour arrière et Échap éprouvés |
| **L2** | Les cinq panneaux, navigation avant/arrière, compteur adaptatif, et les trois segments de 9.2 bis | `js/ui.js`, `css/app.css` | 3e | 320 px sans défilement horizontal, cibles ≥ 44 px, contrastes tenus dans les deux thèmes ; les trois segments produisent trois séquences distinctes |
| **L3** | Mouvement : arrivée, transitions, sortie, repli | `css/app.css` | 4e — **coupable** | État au repos = état final vérifié ; aucun flou ajouté ; aucune boucle |
| **L4** | Rejeu depuis les Réglages | `js/ui.js` | 5e | Rejeu avec un brouillon en cours → brouillon intact |
| **L5** | Ligne « et ensuite ? » dans les 4 états vides + documentation | `js/ui.js`, `README.md`, `docs/CHECKLIST_TEST.md`, `docs/GUIDE_UTILISATEUR.md` | 6e | Checklist complète ; dépôt auto-documenté |

Chemin critique **L0 → L1 → L2 → L5**. L3 est la seule variable d'ajustement.
À tout instant la branche reste publiable : L0 est invisible, L1 est cohérent
avec un panneau unique, L3 à L5 sont additifs.

**Interrupteur** : pas de feature flag serveur — il exigerait le backend, hors
dépôt. Sa forme dégénérée suffit : une constante booléenne dans `js/config.js`,
lue en un seul point, qui ramène le retour arrière à un diff d'une ligne plus un
bump de version. Le vrai garde-fou reste architectural : jamais un gate,
« Passer » toujours atteignable.

**Retour arrière** : `git revert` du lot fautif **plus** une version incrémentée
— jamais décrémentée, `CACHE_VERSION` se compare par égalité. Chez l'utilisateur
qui ne peut rien vider, la navigation étant *network-first*, la coquille
corrigée est resollicitée à la prochaine ouverture en ligne, **mais le
rechargement n'a lieu que s'il clique « Mettre à jour »** : d'où R1 et R10, qui
ne sont pas négociables.

---

## Hors périmètre — et pourquoi

| Écarté | Motif |
|---|---|
| Visite ancrée, spotlight, coach marks | Arbitrage A : quatre constats convergents |
| Onboarding avant connexion / verrou / nom | Le champ de code doit être saisissable au premier rendu ; le chemin critique reste intact |
| Données de démonstration | Elles passeraient par `Sync.dispatch` et pollueraient l'espace de toute l'équipe ; en mode local elles seraient écrasées par la première réponse serveur (`js/sync.js:404`, `:441`) |
| Télémétrie d'onboarding | Exigerait le backend (hors dépôt), casserait la parité, et déposerait une mesure nominative dans le JSON que tous les clients téléchargent — dans une app qui efface l'identité dès qu'on choisit l'anonymat |
| Vidéo, image, illustration, police | Aucune dépendance ni ressource distante ; poids de précache |
| Rôles déclarés (installateur / invité) | Rien dans l'état ne les distingue ; la différenciation se fait sur l'état observable |
| Carrousel horizontal | Quatre glissements font un diaporama là où un fondu de 100 ms suffit ; et le tutoriel en cartes défilables est déconseillé par la recherche |
| Checklist de démarrage persistante | Décision **N**, point de rupture de P5 : sur un produit ouvert 1–2 ×/semaine, une liste jamais terminée devient un reproche permanent |
| Piège de focus écrit à la main | Décision **K** : l'élément natif le fournit, sans dépendance et plus conformément à la norme |

## Suites — v2 et chantiers voisins

**v2, pédagogie *just-in-time*** — chaque état vide gagne une ligne « et
ensuite ? » nommant l'étape suivante du cycle (déjà en L5) ; au premier contact
réel avec un fil non vide, une mention unique sur le geste de la bulle ; carte
« synthèse » quand un sujet passe en « Prêt pour la réunion ». Le coût est
faible, la reprise d'apprentissage gratuite, et c'est ce qui fait réellement
agir — là où les panneaux font seulement savoir.

**Chantiers voisins, révélés par ce cadrage et volontairement non traités ici** :

1. **Aucun moyen d'inviter un collègue depuis l'app.** Ni `navigator.share`, ni
   presse-papier nulle part dans `js/` ; le seul indice d'espace partagé est le
   « Code d'espace » enfoui dans le diagnostic (`js/ui.js:1283`). Dans un outil
   dont la valeur est collective, c'est probablement la friction la plus coûteuse
   du produit — et aucun onboarding ne la corrige.
   Quand ce chantier s'ouvrira, P6 le cadre déjà : l'invitation se loge dans une
   **étape existante**, jamais en étape supplémentaire, et le parcours de la personne
   invitée se conçoit dans le même mouvement — c'est justement lui que la décision M
   traite ici.
2. **Un lien partagé ne peut rien pré-remplir.** `parseRoute` ne lit que le hash
   (`js/app.js:281`) et il n'existe aucun `location.search` / `URLSearchParams`
   dans le dépôt : chacun doit retrouver une URL `…/exec` de 120 caractères dans
   une autre conversation.
3. **Le mode local est un cul-de-sac au même poids visuel que la connexion**
   (`js/ui.js:469`) : un essai en local est silencieusement écrasé par la
   première réponse serveur.

## Constats préexistants — hors périmètre, à traiter séparément

Relevés en lisant le code pour ce cadrage. **Aucun ne doit être corrigé en
douce dans un chantier d'onboarding.**

1. **`Utils.storage.set` échoue en silence** (`js/utils.js:426-429`) et aucun
   appelant ne teste son retour. Si le stockage est indisponible, `loadUser()`
   régénère un uid **à chaque chargement** : un nouveau participant serveur par
   lancement, `ownItems` toujours vide, session jamais reprise. Il n'existe
   aucun équivalent de l'avertissement « stockage non persistant » que `sync.js`
   émet pour IndexedDB.
2. **`App.logout()` conserve l'identité** (`js/app.js:203-221`) : il efface
   adresse, vérificateur, mode et session, mais **pas** `brainsto.user` ni
   `brainsto.ownItems`. La personne suivante sur le même appareil hérite de
   l'uid et du nom, saute le gate `name`, et `App.ownsMessage`
   (`js/app.js:44-48`) lui accorde l'édition des messages **anonymes** de la
   précédente. C'est un défaut de confidentialité, pas un défaut d'onboarding.
3. **Dialogues sans nom accessible** : `role="dialog" aria-modal="true"` sans
   `aria-labelledby` (`js/ui.js:383`, `:397`), et aucun piège de focus nulle
   part. Les feuilles actuelles s'annoncent « boîte de dialogue » sans titre.
4. **`:focus-visible` sans doublon `:focus`** (`css/app.css:1800`) : sur Safari
   iOS 15.0–15.3, classé tier B par `compat-scan`, la règle entière est rejetée
   et il ne reste **aucun** indicateur de focus au clavier externe.
5. **`statusPill` change en silence** (`js/ui.js:310`) : « En attente (n) » n'est
   ni `role="status"` ni annoncé.
