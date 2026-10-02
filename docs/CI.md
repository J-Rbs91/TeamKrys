# CI

La workflow `.github/workflows/test.yml` exécute les tests Node sans dépendance externe sur les pull requests et sur `main`.

Le noyau historique est volontairement lancé avant tout élargissement de la suite. Les nouveaux tests ne doivent rejoindre cette workflow qu'une fois leur dépendance de production présente dans le dépôt.

## Collecte de Pandore

La workflow `.github/workflows/pandore.yml` ne teste rien : chaque jour à 04 h 17 UTC, elle publie dans `pandore/depots/` ce qui a été déposé dans Pandore, puis vide le backend. Elle seule a le droit d'écrire dans le dépôt (`contents: write`). Sans les secrets `BRAINSTO_SCRIPT_URL` et `BRAINSTO_IDEAS_SECRET`, elle sort sans rien faire. Mise en place : [`PANDORE.md`](PANDORE.md).

Un commit poussé par cette workflow ne relance pas `test.yml` (règle de GitHub pour le jeton des workflows). Ce que l'IA publie ensuite dans `pandore/` passe, lui, par `test.yml`, qui relance `node tools/pandore-check.js`.
