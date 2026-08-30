# Plan d'implémentation — brainsto-logo-motion-identity

> Découpage produit par **UXER**, phase `design`, job `SPJ-b2c3d4e5f607`.
> Transcrit depuis l'enveloppe de résultat ; enveloppe brute dans [`uxer-jobs/`](uxer-jobs/).

## Phases retenues

`research` (terminée) -> `design` (terminée) -> `execute` -> `review`.

Le découpage suit les quatre phases du protocole d'appel externe UXER, pas les phases
internes du run controller : la mission est conduite par un orchestrateur externe qui
délègue chaque phase au plugin.

## Unités atomiques

| Ordre | Unité | Objectif | Fichiers | Validation |
|---|---|---|---|---|
| 1 | U1 | Aller-retour divergence vers convergence des 4 fragments | `css/app.css` | 4 délais distincts, crans 38 % et 55 % identiques |
| 2 | U2 | Recalage de la ligne de temps | `css/app.css` | point et logotype finissent à 1100 ms ; total 1180 ms |
| 3 | U3 | Seuil de taille des fragments | `js/utils.js` | `logoMark(40)` sans `.logo-seed`, `logoMark(52)` avec 4 |
| 4 | U4 | Non-rejeu à travers les reverrouillages | `js/ui.js`, `css/app.css` | 2e passage par le verrou sans classe narrative |
| 5 | U5 | Doctrine et invariants | `README.md`, `docs/` | tableau de fréquence corrigé sur le verrou |
| 6 | U6 | Test structurel de non-régression | `tests/logo-motion.test.js` | `node tests/logo-motion.test.js` sort en 0 |

## Détail transcrit de la spécification

U1 — Étendre `logo-seed-in` en un aller-retour divergence→convergence réutilisant les 4 offsets SEMENCES existants, avec easing par segment (ease-out puis ease-in) et délais par `:nth-of-type`. Fichiers : css/app.css uniquement (aucune modification de js/utils.js pour cette unité). Critère : lecture du CSS confirme 4 délais distincts (0/60/110/160 ms), un cran à 38% et un cran identique à 55%, et les deux `animation-timing-function` attendues aux crans 0% et 55%.
U2 — Recaler anneau/point/logotype/signature sur la nouvelle ligne de temps (délais uniquement, durées inchangées) pour préserver l'invariant point=logotype. Fichiers : css/app.css. Critère : delay+durée du point (780+320) = delay+durée du wordmark (820+280) = 1100 ms ; fin de tagline (940+240) = 1180 ms = durée totale.
U3 — Ajouter le seuil de taille sous lequel les graines ne sont pas créées. Fichiers : js/utils.js (`Utils.logoMark`, boucle SEMENCES conditionnée à `px >= 44`). Critère : `Utils.logoMark(40)` retourne un SVG sans élément `.logo-seed` ; `Utils.logoMark(52)` en contient toujours 4.
U4 — Introduire le drapeau de session `heroSequencePlayed` et la classe `screen--enter-repeat`, branchés sur le mécanisme `entering`/`lastPlace` existant (js/ui.js autour de la ligne 1855-1868). Fichiers : js/ui.js ; css/app.css seulement pour un commentaire de garde expliquant pourquoi `screen--enter-repeat` ne doit jamais matcher les keyframes narratives. Critère : scénario simulant deux passages consécutifs par le verrou dans la même session (sans rechargement) — le premier porte les classes narratives, le second porte `screen--enter-repeat` et aucune classe narrative ; un rechargement complet réinitialise le drapeau.
U5 — Documenter l'invariant dans README.md (tableau de fréquence et section « La séquence d'accueil ») : distinguer explicitement l'exposition accueil (une fois par ouverture) de l'exposition verrou (une fois par ouverture d'APPLICATION, pas par déverrouillage) et citer la règle de non-replay. Fichiers : README.md.
U6 — Test structurel de non-régression, sur le modèle exact de tests/navigation.test.js (lecture texte de css/app.css et js/ui.js, sans navigateur) : présence des 4 délais de graines, égalité point/wordmark à 1100 ms, absence de librairie d'animation, présence de `heroSequencePlayed`/`screen--enter-repeat`, présence du garde `px >= 44` dans js/utils.js. Fichiers : nouveau tests/logo-motion.test.js. Critère : `node tests/logo-motion.test.js` sort en code 0.

## Invariants à documenter

Frame final : identique à l'existant (anneau tracé, point plein, graines invisibles) — jamais redessiné. Durée : 1180 ms au total, chevauchement documenté, sous le plancher de 1,2 s demandé. Reduced-motion : toute animation narrative exclusivement dans `@media (prefers-reduced-motion: no-preference)` ; aucun état masqué hors de ce bloc ; `stroke-dasharray` jamais posé globalement. Déclenchement : uniquement `screen--enter` sur accueil et verrou, jamais dans le panneau d'onboarding. Non-replay : `heroSequencePlayed` (session, non persisté) + `screen--enter-repeat` empêchent tout rejeu de la narration à travers plusieurs reverrouillages dans la même ouverture d'application. Dépendances interdites : aucune librairie d'animation, aucune requête réseau, propriétés limitées à transform/opacity/stroke-dashoffset, aucune boucle, aucune pulsation/rotation/glow permanents.
