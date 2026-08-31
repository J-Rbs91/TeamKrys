# Recherche — refonte-theme-palette-identite

## Ce qui a été consulté

**Corpus local UXER uniquement.** Aucun outil d'accès externe n'a été détecté ni
sollicité pendant cette exécution ; aucune plateforme de référence visuelle n'a
été ouverte.

Références locales réellement mobilisées :

| Fichier | Ce qu'il a tranché |
|---|---|
| `references/distinctive-direction.md` | La règle du budget, le tableau des sept dimensions avec leur coût, les quatre critères de choix, les six tests de vérification |
| `references/generic-ai-design-antipatterns.md` | Le contrepoids : les vingt et une signatures restent opposables, y compris au service d'un parti pris |
| `references/color-and-type-protocol.md` | L'ordre de l'enchaînement couleur — contexte de marque avant exploration, échelles construites **par ratio** et non par pas de luminosité, tokens sémantiques comme décision et non comme export |
| `references/identity-core-format.md` | La structure du noyau d'identité, et son interdit : aucune valeur de jeton recopiée |
| `skills/visual-identity-builder/SKILL.md` | L'extraction de matière avant les propositions, et le relevé d'une identité existante plutôt que son remplacement |
| `skills/ui-visual-direction/SKILL.md` | Neutralité et personnalité par surface, la distinction constat / préférence |

## Ce que l'absence d'accès externe change, et ce qu'elle ne change pas

Elle interdit d'affirmer qu'un traitement est « courant » ou « attendu » dans le
secteur sur la foi d'une observation : le constat C1 du brief — l'accent teal
sur ardoise froide est l'accord par défaut du secteur — est une **hypothèse de
connaissance générale, pas une consultation**, et il est coté comme tel.

Elle ne change rien au reste. Le diagnostic repose sur des propriétés lues dans
le code du produit, et la construction des échelles sur des ratios calculés,
qui ne dépendent d'aucune source.

## Niveau de preuve du livrable

| Nature | Ce qui est établi |
|---|---|
| `code` | Les jetons, leurs usages, la sémantique des statuts — lus dans `css/app.css`, `js/ui.js`, `js/utils.js` |
| `calcul` | Les 80 ratios de contraste, dans les deux modes, par `tools/check-contrast.py` |
| `visuelle` | Le rendu des composants dans les deux modes, observé sur captures produites par le Chromium de l'environnement, à partir d'un banc d'essai chargeant les feuilles réelles du dépôt |
| **non établi** | Le rendu sur appareil réel, sous éclairage de magasin, à 200 % de zoom, et le comportement du thème sur les navigateurs constructeurs. La recette mobile reste à faire — voir `next-step.md` |

Le banc d'essai n'est pas l'application : il charge les vraies feuilles et les
vraies classes, mais il ne reproduit ni la densité réelle d'un long fil, ni les
états d'erreur, ni les feuilles modales.
