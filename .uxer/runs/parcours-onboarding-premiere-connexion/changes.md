# Journal des changements validés — parcours-onboarding-premiere-connexion

<!-- mission UXER parcours-onboarding-premiere-connexion — profil standard — créé le 2026-08-06T23:41:49+00:00 -->

Une entrée par unité terminée et validée. Une unité en cours n'y figure pas.

## Aucune unité terminée pour l'instant

## U1 — clé, révision et règle de décision (2026-08-06)

`js/config.js` · `tests/onboarding.test.js` · `service-worker.js` · `README.md`

Ajoutés : `CONFIG.KEYS.onboarding` (`brainsto.onboarding`), `ONBOARDING_REV`,
`ONBOARDING_SCHEMA`, `ONBOARDING_PANELS` (les trois segments), `onboardingSegment()`
et `onboardingDue()` — pure, non lançante, sur le modèle de `sessionUsable`.
`APP_VERSION` et `CACHE_VERSION` portés à 1.7.1 ensemble.

**Aucun effet visible dans l'application** : rien n'appelle encore la règle. C'était
le critère de sortie de l'unité.

23 tests, dont quatre sur la seule branche qui compte vraiment — la reconnaissance
d'un appareil déjà utilisé. Un défaut là ferait revoir la présentation à toute
l'équipe le jour du déploiement, et c'est pour ce cas que la règle a été extraite en
fonction pure plutôt que laissée dans le calque.

Un test vérifie explicitement que changer `APP_VERSION` ne rejoue rien : c'est la
garantie que la révision de séquence reste indépendante des correctifs de patch.
