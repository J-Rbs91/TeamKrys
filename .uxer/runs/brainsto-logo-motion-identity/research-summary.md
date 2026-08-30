# Synthèse de recherche — motion identity du logo

> Produit par le **plugin UXER réellement exécuté**, phase `research`, job
> `SPJ-a1b2c3d4e5f6`. Enveloppes brutes conservées dans
> [`uxer-jobs/`](uxer-jobs/). Ce fichier est une transcription de l'enveloppe de
> résultat, pas une reformulation par l'orchestrateur.

## Mode de recherche — déclaré par UXER

```
Mode utilisé :          inspection de code, hors ligne
Plateformes externes :  AUCUNE consultée
Navigateur :            NON exercé
Nature des preuves :    code uniquement (lecture statique)
```

**Aucune consultation externe n'a eu lieu et rien n'est attribué à une plateforme
tierce.** Les partis pris viennent de la direction artistique du dépôt et de la
méthode UXER.

## Statut

`passed` — 1 capacité(s) mobilisée(s) : `uxer-orchestrator`. Aucun fichier modifié (phase inspect-only,
confinement vérifié par le lanceur).

## Constat central

La séquence d'entrée **existe déjà** et raconte déjà une convergence. Ce que
l'issue #30 demande n'est donc pas une animation là où il n'y en a pas, mais un
**battement de divergence** là où il manque.

## Constats

### UX-001 — high

Risque de duplication narrative (pas technique) entre une eventuelle marque animee racontant litteralement le parcours produit et l'onboarding qui raconte deja ce meme parcours panneau par panneau avec de vrais fragments d'UI, pour la meme audience de premier arrivant.

**Preuve.** docs/ONBOARDING.md:485-503 (5 panneaux = les 5 parties de l'app) vs objectif de l'issue #30 de faire porter le meme recit au logo; js/ui.js:2032-2035 montre que le produit a deja tranche contre deux gestes expressifs successifs

### UX-002 — medium

L'ecran de verrou, ou la marque animee apparait deja, peut se representer plusieurs fois par jour (LOCK_IDLE_MS=1h) pour un usage intermittent typique, ce qui contredit la classification 'une fois par ouverture' appliquee a toute la sequence d'accueil dans le tableau de frequence du README, et interdit d'y etendre la duree du geste.

**Preuve.** js/config.js:72 LOCK_IDLE_MS=3600000; js/ui.js:617 heroBlock dans screenLock; README.md:208,218-222 classification 'une fois par ouverture'

### UX-003 — medium

Le storyboard de l'issue #30 (5 phases, 4-6 fragments, 1,2-1,5s) contredit deux principes deja actes dans le depot: le chevauchement anti-diaporama (la somme des temps actuels depasse deja 1,3s pour seulement 3 temps, tenue a 1060ms par chevauchement) et l'interdiction de faire porter au logo une representation litterale des etapes produit.

**Preuve.** css/app.css:515-517 et README.md:236-237 (chevauchement anti-diaporama); README.md:241-244 et docs/ONBOARDING.md:634-640 (les points n'appartiennent pas a la marque, aucune illustration nouvelle)

### UX-004 — low

La sequence actuelle ne dramatise aucune divergence: les 4 points de semence apparaissent deja disperses (fade-in sur positions fixes) plutot que de se separer visiblement depuis une origine commune, ce qui est le veritable ecart avec l'intention DIVERGENCE de l'issue #30.

**Preuve.** js/utils.js:247 SEMENCES positions fixes; css/app.css:545-550 logo-seed-in part de opacity:0 sans etat de depart centre


## Preuves collectées

- js/ui.js:80-86 heroBlock() monte Utils.logoMark(52)+wordmark+tagline
- js/ui.js:555 heroBlock dans screenConnection (gate 'connection')
- js/ui.js:617 heroBlock dans screenLock (gate 'lock')
- js/ui.js:576-604 screenName n'a aucun heroBlock/logo animé
- js/ui.js:2032-2038 onboardExtra kind==='logo' affiche Utils.logoMark(40) au repos avec commentaire explicite anti-rejeu
- js/utils.js:227-301 Utils.logoMark: constantes LOGO identiques à assets/icons/icon.svg, 4 .logo-seed a opacite 0 au repos
- css/app.css:460-609 section Revelation: keyframes logo-ring-draw/logo-seed-in/logo-dot-pop/wordmark-rise/tagline-in avec delais negatifs chevauches
- css/app.css:184-198 tokens --ease-out/--ease-in/--ease-spring/--ease-in-out et --dur-fast/base/slow
- js/ui.js:1829-1912 UI.render: mecanisme screen--enter + --enter-elapsed + enterAt/ENTER_WINDOW_MS=1400ms (ligne 106-107)
- js/app.js:282-287 App.gate() enchaine connection->lock->name->null
- js/config.js:72 LOCK_IDLE_MS = 60*60*1000 (1h), js/app.js:96 needsUnlock
- README.md:196-269 doctrine Mouvement, tableau de frequence (203-210), doctrine sequence d'accueil et 3 decisions moins evidentes (239-252) dont 'les quatre points n'appartiennent pas a la marque'
- docs/ONBOARDING.md:485-503 plan des 5 panneaux exact sur le parcours sujet->debat->propositions->conclusion->reunion
- docs/ONBOARDING.md:634-640 refus explicite de toute illustration nouvelle, points de convergence non reemployes
- docs/ONBOARDING.md:642-680 choregraphie: regime expressif vu une fois vs regime frequent vu 4 fois/30s, aucun chevauchement avec la sequence d'accueil
- assets/icons/icon.svg + manifest.webmanifest:14-17 frame final statique
- service-worker.js:1-37 CACHE_VERSION couple a CONFIG.APP_VERSION (js/config.js:13), SHELL precache offline
- css/app.css:474,559,599,758,1125,1896,2064 tous les blocs d'animation gardes par prefers-reduced-motion

## Limites déclarées

- Texte brut de l'issue GitHub #30 non consulte: gh issue view a ete refuse par la politique d'approbation de l'environnement (deux tentatives). Travail fonde sur la reformulation du JOB uniquement.
- Aucune plateforme visuelle externe consultee (visual-reference-research, ux-resource-researcher non exerces): aucun outil/acces reel disponible en mode inspect hors ligne, conformement a la consigne de declarer l'absence de consultation plutot que de la simuler.
- Aucune verification executee dans un navigateur reel: tous les constats sont des preuves de code (lecture statique), pas des preuves comportementales ou visuelles capturees a l'execution.
- Les capacites ux-navigation-audit et product-pattern-research n'ont pas ete invoquees comme skills separes: la methodologie equivalente (reperage de la marque a travers les contextes de navigation, comparaison du recit existant au pattern demande) a ete appliquee directement par inspection de code et de documentation sous le cadrage de uxer-orchestrator.
