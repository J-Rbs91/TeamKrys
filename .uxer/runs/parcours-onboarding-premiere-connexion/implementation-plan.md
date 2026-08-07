# Plan d'implémentation — parcours-onboarding-premiere-connexion

<!-- mission UXER parcours-onboarding-premiere-connexion — profil standard — créé le 2026-08-06T23:41:49+00:00 -->

## Phases retenues

| Phase | Effort (profil standard) | État |
|---|---|---|
| `clarification` | low | terminée — `brief.md` |
| `audit` | medium | terminée — neuf spécialistes, constats dans `docs/ONBOARDING.md` |
| `reference-research` | medium | en cours — sous-agent isolé, un seul à la fois |
| `visual-direction` | **high** | à venir — c'est la seule phase où le profil autorise l'effort élevé |
| `accessibility` | medium | cahier des charges établi, à intégrer à la définition (pas en passe finale) |
| `implementation` | medium | non commencée — unités U1 à U6 |
| `review` | low | non commencée — `ui-review-qa` en clôture |

## Unités atomiques

Taille visée pour le profil `standard` : « un écran ou une section indépendante ».
Chaque unité porte une validation identifiable ; une unité sans validation n'est pas
une unité. Checkpoint obligatoire entre deux unités, commit par unité.

| Ordre | Unité | Phase | Dépend de | Validation attendue | Fichiers probables |
|---|---|---|---|---|---|
| U1 | Clé `brainsto.onboarding`, entier de révision, **règle de décision pure** et son test | implementation | — | `node tests/onboarding.test.js` vert ; les trois suites existantes toujours vertes ; **aucun effet visible dans l'app** | `js/config.js`, `tests/onboarding.test.js` |
| U2 | Mécanique du calque : point de montage, montage/démontage, piège de focus, région live, Échap, ajournement du bandeau — **un seul panneau de contenu** | implementation | U1 | Verrou provoqué en pleine séquence, retour arrière, Échap, brouillon de composeur : aucun état corrompu. `compat-scan` tier A vide | `index.html`, `js/ui.js`, `js/app.js`, `css/app.css` |
| U3 | Les six panneaux, navigation avant/arrière, compteur, variantes mode local et espace peuplé | implementation | U2 | 320 px sans défilement horizontal ; cibles ≥ 44 px ; contrastes tenus en clair **et** sombre ; texte jamais posé sur le voile | `js/ui.js`, `css/app.css` |
| U4 | Mouvement : arrivée, transitions, sortie, repli sous mouvement réduit | implementation | U3 | État au repos = état final vérifié ; aucun flou ajouté ; aucune boucle ; fluide sur appareil d'entrée de gamme | `css/app.css` |
| U5 | Rejeu depuis les réglages | implementation | U2 | Rejeu déclenché avec un brouillon `settings:name` en cours → brouillon intact | `js/ui.js` |
| U6 | État vide filtré : bouton d'effacement de la recherche (décision 12 du corpus local) + ligne « et ensuite ? » dans les quatre états vides, puis documentation | implementation | — | Les quatre causes d'état vide produisent quatre écrans distincts ; checklist de recette complétée | `js/ui.js`, `README.md`, `docs/CHECKLIST_TEST.md`, `docs/GUIDE_UTILISATEUR.md` |

## Chemin critique

**U1 → U2 → U3 → U6.** U4 est la seule variable d'ajustement : la séquence reste
complète et utilisable sans elle. U5 et U6 sont indépendantes l'une de l'autre.

U6 est volontairement sans dépendance : c'est la seule unité qui apporte une valeur
mesurable même si la séquence d'onboarding n'est jamais livrée.

## Invariant de publication

À tout instant la branche doit rester publiable : U1 est invisible, U2 est cohérente
avec un panneau unique, U4 à U6 sont additives. Chaque unité incrémente `APP_VERSION`
**et** `CACHE_VERSION` ensemble.

## Ce qui reste hors plan

Pré-remplissage de l'adresse par lien partagé · bouton d'invitation d'un collègue ·
installation guidée de la PWA · les deux défauts préexistants consignés dans
`validation.md` (identité conservée à la déconnexion, échec silencieux du stockage).
