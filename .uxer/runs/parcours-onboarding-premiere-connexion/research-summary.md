# Synthèse de recherche — parcours-onboarding-premiere-connexion

<!-- mission UXER parcours-onboarding-premiere-connexion — profil standard -->

## Mode de recherche

```
Outils détectés :      recherche web (WebSearch) · fetch HTTP (WebFetch)
                       navigateur : ABSENT · capture : ABSENTE · session authentifiée : AUCUNE
Mode retenu :          B — recherche et fetch
Plafond de preuve :    niveau 1 sur TOUTES les références
```

**Conséquence à respecter dans tous les livrables de cette mission** : aucune
affirmation sur une composition, une densité, un rythme typographique, un
enchaînement réel ou une durée constatée. Le texte a été lu, le rendu n'a pas été
observé.

## Ressources réellement consultées — 13, toutes niveau 1, le 2026-08-06

| Ressource | Famille |
|---|---|
| W3C ARIA APG — pattern Dialog (Modal) | norme |
| W3C WCAG 2.2 — SC 2.3.3 Animation from Interactions (AAA) | norme |
| MDN — attribut global `inert` | documentation de plateforme |
| NN/g — Onboarding Tutorials vs. Contextual Help (2023) | recherche documentée |
| NN/g — Instructional Overlays and Coach Marks (2014) | recherche documentée |
| NN/g — Mobile-App Onboarding: Components and Techniques (2020) | recherche documentée |
| NN/g — Executing UX Animations: Duration (2020) | recherche documentée |
| GOV.UK Design System — index des patterns (constat d'absence) | design system ouvert |
| GOV.UK — Start using a service | design system ouvert |
| GOV.UK — Interruption pages | design system ouvert |
| Shopify — guide de conception Onboarding | design system ouvert |
| Shopify App Home — composition Setup guide | design system ouvert |
| GitLab Growth — work item 1541, invitation des coéquipiers | artefact d'ingénierie |

## Ressources non consultées — aucune affirmation sur leur contenu

| Ressource | Raison constatée | Mode d'échec |
|---|---|---|
| Adobe Spectrum — Coach mark | seul le titre est revenu | rendu côté client — inutile de réessayer en fetch |
| Material Design 3 — foundations/onboarding | HTTP 404 | route inexistante |
| Atlassian — components/onboarding | page dépréciée, route en 404 | route obsolète |
| IBM Carbon — Empty states | tronqué à la conversion, 2 tentatives | page trop longue |
| Mobbin · Page Flows · Ripplix | compte requis, aucune session légitime | **non tenté, aucun contournement** |

## Les huit principes retenus

Formulés sans nommer de source. Chacun porte sa limite et son **point de rupture** —
c'est le point de rupture qui dit quand le principe cesse de s'appliquer ici.

**P1 — Une étape ne survit que si aucun autre emplacement ne porte son information.**
Point de rupture : si le premier écran utile est vide et que rien ne s'y passe sans
qu'un collègue agisse, il n'y a plus de « moment de l'usage » où déporter
l'explication. **C'est exactement le cas du premier arrivant de BrainstO.** Le
principe cède, et une explication en amont devient nécessaire.

**P2 — Plafonner à cinq écrans pédagogiques, et afficher la longueur dès le premier.**
Limite : le plafond vient de prescriptions d'éditeur, jamais d'une mesure publiée dans
ce corpus. Point de rupture : les écrans **obligatoires** — connexion, verrou, prénom
— n'entrent pas dans le décompte et ne se suppriment pas pour tenir le plafond.

**P3 — La sortie est présente à chaque étape, à un emplacement stable, et son libellé
dit ce qui se passe ensuite.** Limite : une sortie très visible fait baisser la
complétion — c'est le prix, pas un défaut à corriger en la cachant.

**P4 — Ce qui est fermé se rouvre depuis un emplacement permanent ; l'état se conserve
côté utilisateur, pas côté session.** Limite : **aucune source consultée ne prescrit de
mécanisme de détection du premier lancement ni de garde anti-rejeu.** Toute la section
« Détection » de la spécification est une **extrapolation**, et doit être présentée
comme telle. Point de rupture : sur appareil partagé, ou après effacement du stockage,
un marqueur local rejoue la séquence à tort — et ici aucun marqueur serveur n'est
atteignable.

**P5 — Une liste de contrôle persistante traite la reprise sans mécanique de reprise.**
Point de rupture : sur un produit ouvert 1–2 fois par semaine, une liste jamais
terminée devient un reproche permanent. **C'est ce qui écarte la checklist ici.**

**P6 — L'invitation des collègues se loge dans une étape existante, jamais en étape
supplémentaire.** Point de rupture : une personne arrivant sur un espace déjà peuplé
n'a pas à traverser les étapes du premier arrivant.

**P7 — Un calque qui bloque l'arrière-plan porte un nom accessible issu de son titre
visible, rend le fond réellement **et visiblement** inerte, boucle le focus, ferme sur
Échap, rend le focus au déclencheur.** Limite : le corpus normatif décrit **un**
dialogue, pas une **séquence** — l'annonce du changement d'étape, le replacement du
focus et la mise à jour du nom accessible entre étapes ne sont couverts par aucune
source consultée. Point de rupture : déclarer un fond modal sans l'inerter réellement
est condamné à la source ; l'attribut devient un mensonge.

**P8 — Transition entre étapes : sous 150 ms ou inexistante. Ouverture du calque, vue
une seule fois : 200 à 250 ms.** Point de rupture : dès qu'un **déplacement** ou un
changement de taille intervient, le critère normatif de mouvement s'applique. Un
**fondu d'opacité seul en sort** — c'est la voie la moins coûteuse.

## Convergences

Trois familles de sources sur quatre déconseillent la séquence en amont et poussent
l'explication vers le moment d'usage. La convergence traverse des contextes
différents — recherche en utilisabilité, service public transactionnel — ce qui
l'empêche d'être écartée comme effet de mode. Le plafond de longueur converge vers
cinq. La sortie est traitée comme un dû, jamais une option. La progression visible
accompagne la sortie partout où elle existe.

## Divergences non arbitrées par les sources

Calque bloquant contre liste persistante non bloquante : les deux répondent au même
besoin, aucune source ne tranche. Indices ancrés au contexte contre panneau plein qui
ne contient que son message : divergence de fond. Explication avant ou après
l'authentification : le contexte décide, et **l'arrivée par lien partagé d'un collègue
n'est couverte par aucune des deux**.

## Éléments rejetés

Tutoriel en cartes défilables — déconseillé à la source · coach marks en chaîne —
déconseillés, et l'ancrage exige de mesurer une position en JavaScript, impossible en
CSS seul · style « dessiné » recommandé pour distinguer l'annotation — exigerait une
police externe · illustration par étape — asset par étape, incompatible avec « aucune
ressource distante » · modale à confettis — animation décorative longue, exposée au
préjudice vestibulaire documenté · le chiffre « +141 % » rencontré en recherche — porte
sur une autre expérience, sans méthode ni échantillon publiés.

## Régime A — directement reprenable, sans dépendance

Deux ressources sont faites pour être appliquées, et le sont ici :

1. **Les patterns et le clavier de l'ARIA APG** — publics, applicables tels quels.
2. **`<dialog>` + `showModal()`** — fournit **nativement** le piège de focus, le calque
   supérieur et l'inertie de l'arrière-plan. Satisfait P7 sans aucune bibliothèque.

**Réserve dirimante, tirée de la baseline du dépôt et non de la recherche** :
`tests/qa/feature-baseline.json` donne à `js-dialog-showmodal` un plancher WebKit
**15.4**, un mode d'échec **`throws`** et une sévérité **`high`** ; or
`tests/qa/browser-matrix.json` classe `safari-ios-15.0` (iOS 15.0 → 15.3) en **tier
B**, où « une dégradation cosmétique documentée est tolérée, **jamais une perte de
fonction** ». Un `showModal()` non gardé y lève une exception : c'est une perte de
fonction, donc interdit. L'appel doit être gardé, avec repli documenté.

## Limites de la recherche

Toutes les références sont de niveau 1. **Aucune plateforme d'observation de produits
n'a été consultée** : la dimension « ce que les produits récents privilégient » repose
sur des prescriptions et de la recherche documentée, pas sur un relevé de produits.
La dimension « déclenchement et anti-rejeu » est à peine couverte (voir P4). La
dimension « valeur collective » est la plus faible : une seule référence, contexte
éloigné, non testée, et **aucune source sur la différence espace vide / espace
peuplé**. Aucun chiffre d'abandon en cours de séquence n'a été obtenu d'une source de
poids : ceux rencontrés viennent d'éditeurs d'outils d'onboarding, sans méthode et
avec un intérêt commercial dans la conclusion — ils ne sont pas retenus.

## À vérifier lors d'un prochain accès

1. **La séquence de dialogues, côté normatif** — dans l'APG et les techniques WCAG :
   pour un dialogue dont le contenu change sans fermeture, le focus se replace-t-il en
   tête à chaque étape, le changement est-il annoncé par une région live,
   `aria-labelledby` pointe-t-il un titre qui change. C'est le trou le plus gênant du
   corpus, et il porte sur la partie la plus technique de la spécification.
2. **Adobe Spectrum, Coach mark** — avec un navigateur : prescription de nombre
   d'étapes, compteur, contrôle de sortie, consigne de focus entre étapes.
3. **Material Design 3** — retrouver l'emplacement actuel de la matière onboarding.
4. **Atlassian `@atlaskit/spotlight`** — focus dans un parcours multi-étapes,
   compteur, position de la sortie.
5. **IBM Carbon, Empty states** — distinction premier usage / absence de résultat /
   erreur, et si le premier usage y est traité comme support pédagogique.
6. **Le cas collectif**, avec une session légitime : sur trois outils d'équipe,
   comparer ce que voit le créateur d'un espace vide et ce que voit une personne
   invitée sur un espace peuplé, et où l'invitation est demandée.
7. **Le rejeu** — existence et libellé exact d'une entrée de réglages.
8. **Une source de poids sur l'abandon en cours de séquence**, avec méthode et
   échantillon. Aucun chiffre d'abandon ne devrait entrer dans une décision avant.
