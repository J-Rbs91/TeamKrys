# CI

La workflow `.github/workflows/test.yml` exécute les tests Node sans dépendance externe sur les pull requests et sur `main`.

Le noyau historique est volontairement lancé avant tout élargissement de la suite. Les nouveaux tests ne doivent rejoindre cette workflow qu'une fois leur dépendance de production présente dans le dépôt.
