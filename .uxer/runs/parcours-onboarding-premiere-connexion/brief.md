# Brief — onboarding de première connexion

Profil d'exécution : `standard`. Mode : `bypass_clarification` partiel — la demande
délègue explicitement (« la totale »), les arbitrages restants sont cotés ci-dessous
plutôt que posés en questions bloquantes.

## Demande initiale

> utilise UXER pour construire un plan séquence d'Onboarding pour la première
> connexion. (il faut aussi que tu détermines comment ide tifier une première
> connexion).
> le but montrer les différentes partie de l'appli et leur fonctionnement.
> tu dois déployer plusieurs agents spécialisé en onboarding, en plan séquence
> onboarding, UX UI, frontend, manger, product manager, designer senior, motion
> designer senior. la totale

## Objectif reformulé

Qu'une personne arrivant pour la première fois dans un espace BrainstO. sache, sans
lire la documentation, que l'outil enchaîne *sujet → débat → propositions votées →
conclusion → réunion*, et où se trouve chacun de ces temps. Second objectif, dérivé
de l'audit : nommer le seul geste que l'interface ne peut pas enseigner sur place —
l'appui sur une bulle de message, unique porte vers les réactions, la citation et la
création d'une proposition.

## Utilisateur principal

Le membre d'équipe **invité par un lien**, non technique, qui n'a pas installé
l'espace et n'a pas lu `docs/INSTALLATION.md`. En cas d'arbitrage, son usage prime
sur celui de la personne qui a déployé le backend.

## Tâche principale

Comprendre à quoi sert l'application, et où agir. Une seule tâche : se repérer.
Contribuer vient après, et relève de la v2.

## Écrans ou parcours concernés

| Écran | Fonction | Chemin |
|---|---|---|
| `screenConnection` | adresse du script + code | gate `connection`, `js/ui.js:433` |
| `screenLock` | déverrouillage | gate `lock`, `js/ui.js:512` |
| `screenName` | prénom | gate `name`, `js/ui.js:480` |
| `screenTopics` | liste des sujets | `#/`, `js/ui.js:582` |
| `screenTopic` | fil de débat | `#/topic/:id`, `js/ui.js:879` |
| `screenProposals` | propositions et votes | `#/topic/:id/proposals`, `js/ui.js:1029` |
| `screenConclusion` | conclusions votées | `#/topic/:id/conclusion`, `js/ui.js:1066` |
| `screenMeeting` | synthèse projetable | `#/meeting`, `js/ui.js:1156` |
| `screenSettings` | réglages et diagnostic | `#/settings`, `js/ui.js:1236` |

## Problèmes à résoudre — en causes observables

1. **Aucun dispositif de guidage n'existe.** `App.gate()` (`js/app.js:258`) enchaîne
   trois gates puis rend la main sur une liste vide (`js/ui.js:598`) ; toute la
   connaissance vit dans `docs/GUIDE_UTILISATEUR.md`, hors de l'application.
2. **Le cycle de valeur n'est visible nulle part.** Propositions et conclusion sont
   derrière la quickbar *à l'intérieur* d'un sujet (`js/ui.js:912`), la synthèse de
   réunion est enterrée dans les réglages (`js/ui.js:1312`).
3. **Le geste d'accès aux actions d'un message n'est pas signalé.** `messageSheet`
   (`js/ui.js:1326`) est la seule porte vers réactions, citation et création de
   proposition ; rien à l'écran ne l'annonce.
4. **L'état vide filtré n'offre aucune sortie.** Décision 12 du corpus local exige,
   pour la cause « zéro résultat de filtre », « un bouton qui élargit réellement » ;
   `js/ui.js:619` n'affiche qu'un texte, « Aucun sujet ne correspond. », sans action
   pour effacer la recherche.
5. **« Première connexion » n'est pas décidable avec les marqueurs existants.**
   `loadUser()` (`js/app.js:20`) écrit `brainsto.user` dès le premier chargement,
   avant tout gate et toute intention : la clé qu'on interrogerait spontanément ne
   prouve rien.

## Résultat attendu

Au premier passage effectif dans l'espace, une séquence de six panneaux se joue une
fois, présente les parties de l'application, se laisse passer à tout moment, se
rejoue depuis les réglages, ne se rejoue jamais toute seule — et n'apparaît pas du
tout chez les utilisateurs déjà installés au moment du déploiement.

## Portée autorisée

`js/config.js` (clé, révision, règle pure) · `js/ui.js` (panneaux, calque, entrée de
rejeu) · `js/app.js` (point de décision, touche Échap) · `css/app.css` · `index.html`
(point de montage) · `tests/` · `docs/`. Profondeur : additive. Aucune refonte des
écrans existants.

## Éléments à préserver

L'ordre des gates `connection → lock → name` · la saisissabilité immédiate du champ
de code au premier rendu · la séquence d'accueil CSS de 1060 ms · la mécanique
`signature()` / `place` / `--enter-elapsed` (`js/ui.js:1620-1684`) · le relais de
brouillons `composer:` (`js/ui.js:147`) · l'accessibilité du bandeau de mise à jour,
seul chemin de retour arrière chez un utilisateur qui ne peut rien vider.

## Contraintes métier

Anonymat réversible sur messages et sujets — aucune donnée d'onboarding ne doit
pouvoir désanonymiser. Aucune télémétrie : l'état partagé est téléchargé par tous
les clients, y inscrire une mesure nominative contredirait l'anonymat du produit.

## Contraintes techniques

Vanilla, aucune dépendance, aucun build, scripts en `<script>` ordonnés. Backend
Apps Script **hors dépôt** (`.gitignore:1-5`) : aucune action de synchronisation
n'est atteignable. Tout fichier JS ajouté doit être déclaré dans `index.html` **et**
dans `SHELL` (`service-worker.js:12`). `APP_VERSION` et `CACHE_VERSION` s'incrémentent
ensemble. Tests sans framework, sans DOM.

## Priorités — ce qui cède quand deux qualités s'opposent

1. **L'accès au produit** cède devant rien. Aucune séquence ne bloque.
2. **La sobriété du thème** cède devant la lisibilité, jamais devant l'envie.
3. **La complétude pédagogique** cède devant la brièveté : au-delà de six panneaux,
   on retire du contenu, on n'ajoute pas d'étape.
4. **L'élégance d'implémentation** cède devant la robustesse hors ligne.

## Ressources et reference packs

| Source | Catégorie | Usage |
|---|---|---|
| `client-owner-portal` (pack local) | corpus local UXER | fréquence occasionnelle, guidage, densité faible |
| `professional-minimal-ui` (pack local) | corpus local UXER | sobriété qui n'est pas du vide, registre des états |
| Décision 12 — état vide | bibliothèque de décisions | quatre causes, quatre réponses |
| Décision 16 — utiliser une animation | bibliothèque de décisions | la fréquence tranche avant tout |
| `generic-ai-design-antipatterns` | corpus local UXER | grille de refus |
| Recherche externe | voir `research-summary.md` | niveaux de preuve par référence |

Plafonds du profil `standard` respectés : 2 reference packs, 1 sous-agent à la fois,
corpus externe 6–12 références.

## Décisions confirmées par l'utilisateur

- La séquence doit montrer **les différentes parties** de l'application et leur
  fonctionnement — objectif énoncé littéralement.
- La détection de la première connexion fait **partie du mandat**.
- Le travail passe par des **spécialistes distincts** — onboarding, plan-séquence,
  UX/UI, frontend, management, produit, direction artistique, motion, accessibilité.

## Décisions déléguées

Forme de la séquence · nombre de panneaux · place dans le cycle de vie · schéma de
l'enregistrement local · découpage en lots · contenu rédigé.

## Hypothèses retenues

| # | Hypothèse | Cote | Motif | Réversibilité |
|---|---|---|---|---|
| H1 | Six panneaux d'environ 20 s sont tolérables sur un outil vu 1–2 ×/semaine | moyenne | La fréquence occasionnelle appelle du guidage (pack `client-owner-portal`) ; mais le corpus met en garde contre la friction sur outil interne | Élevée — retirer des panneaux ne change pas l'architecture |
| H2 | La friction dominante est pédagogique, pas technique | moyenne | Aucun signal terrain ; l'audit montre les deux | Élevée — les correctifs d'entrée sont un chantier distinct |
| H3 | Un marqueur local suffit, personne n'attend un onboarding synchronisé | élevée | Aucun backend atteignable ; inévitable | Nulle — contrainte, pas choix |
| H4 | Le vocabulaire du modèle est stable | élevée | `MODELE_DONNEES.md` inchangé depuis l'origine | Élevée |
| H5 | La règle de migration suffit à ne pas rejouer chez l'équipe existante | moyenne | Repose sur la présence d'une adresse, d'un mode local ou d'un nom | Faible — un défaut ici est visible par toute l'équipe, d'où un test dédié |

## Points hors périmètre

Visite ancrée et coach marks (arbitrage A, quatre constats convergents) · données de
démonstration · télémétrie · illustrations · pré-remplissage de l'adresse par un lien
partagé · bouton d'invitation d'un collègue · installation guidée de la PWA. Les
trois derniers sont des chantiers voisins réels, consignés faute de mandat.

## Critères de réussite

1. Sur un appareil au stockage vidé, la séquence se joue une fois et une seule.
2. Sur un appareil déjà utilisé, elle ne se joue **pas** après déploiement.
3. Elle n'apparaît sur aucun des trois gates ; le champ de code reste saisissable au
   premier rendu.
4. Aucune requête réseau, aucune action en attente, révision inchangée.
5. Un reverrouillage en pleine séquence rend le verrou prioritaire, sans perte
   d'étape.
6. Au lecteur d'écran : dialogue nommé, titre lu avant les commandes, changement
   d'étape annoncé, balayage confiné.
7. Sous mouvement réduit, chaque panneau est pleinement visible.
8. `node tests/{parity,sync,session,onboarding}.test.js` verts, `compat-scan` sans
   défaut tier A/B.
