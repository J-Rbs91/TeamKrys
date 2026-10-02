# CI

La workflow `.github/workflows/test.yml` exécute les tests Node sans dépendance externe sur les pull requests et sur `main`.

Le noyau historique est volontairement lancé avant tout élargissement de la suite. Les nouveaux tests ne doivent rejoindre cette workflow qu'une fois leur dépendance de production présente dans le dépôt.

## Collecte de la boîte à idées

La workflow `.github/workflows/boite-a-idees.yml` ne teste rien : chaque jour à 04 h 17 UTC, elle publie dans `idees/boite/` les idées déposées dans l'application, puis vide la boîte côté Apps Script. Elle seule a le droit d'écrire dans le dépôt (`contents: write`). Sans les secrets `BRAINSTO_SCRIPT_URL` et `BRAINSTO_IDEAS_SECRET`, elle sort sans rien faire. Mise en place : [`BOITE_A_IDEES.md`](BOITE_A_IDEES.md).

Un commit poussé par cette workflow ne relance pas `test.yml` (règle de GitHub pour le jeton des workflows). Ce que l'IA publie ensuite dans `idees/` passe, lui, par `test.yml`, qui relance `node tools/check-ideas.js`.
