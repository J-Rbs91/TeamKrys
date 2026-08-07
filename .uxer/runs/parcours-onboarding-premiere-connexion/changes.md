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

## U2 à U6 — le calque, les panneaux, le mouvement, le rejeu, les états vides

`index.html` · `js/ui.js` · `js/app.js` · `css/app.css` · `tests/onboarding.test.js`
· `README.md` · `docs/CHECKLIST_TEST.md` · `docs/GUIDE_UTILISATEUR.md`
`APP_VERSION` et `CACHE_VERSION` portés ensemble de 1.7.0 à **1.8.0**.

Livré : calque `<dialog>` + `showModal()` gardé, hors du cycle de `UI.render` ·
cinq panneaux rédigés et modulés par segment · mouvement à deux régimes avec
invariant de repli testé · rejeu depuis les réglages sans navigation ni re-rendu ·
« et ensuite ? » dans les quatre états vides · sortie du filtre sans résultat.

Quatre défauts trouvés en chemin, aucun causé par ce chantier, tous consignés dans
`validation.md` : `[hidden]` inopérant face à `.btn` (corrigé), anneau de focus
parasite sur le conteneur du panneau (corrigé), `translateX(-50%)` au repos sur le
chemin de repli (supprimé), et `restoreDrafts` qui n'restaure un brouillon que si le
champ est vide — contourné, pas corrigé, parce que c'est une logique partagée.

## Suite post-fusion — les points laissés ouverts par la revue (2026-08-07)

Branche repartie de `main` après la fusion de la PR #15 : une PR fusionnée est finie,
le suivi est un changement neuf. Version **1.8.2**.

**Comportement.** Les toasts levés pendant la séquence sont retenus et dits au
démontage — en modal seulement, puisque sur le chemin de repli ils sont visibles.
Une navigation pendant la séquence la **ferme**, comme `CloseWatcher` le fait au-dessus
de Chromium 120 : en dessous, le geste de retour naviguait en laissant le panneau
ouvert sur un autre écran. Et l'application ne prétend plus « pas encore vue » quand
l'écriture a échoué : `Utils.storage.available()` sonde en écrivant, et les Réglages
disent que l'appareil n'enregistre rien.

**Outillage.** Entrée `css-backdrop-inherit` ajoutée à `feature-baseline.json`, avec
détection de l'absence de repli dans un `var()` de `::backdrop`. Vérifiée par
réintroduction de la régression : elle ressort en BLOQUANT au tier A, et se taît quand
le repli est là. Trois agents l'avaient demandée — c'est ce qui empêche la classe de
défaut de revenir, pas le correctif ponctuel.

**Accessibilité.** `--fs-eyebrow` passe de `11px` à `0.6875rem` : une taille absolue
ignore le réglage de police du système. Conséquence assumée à l'échelle de
l'application — tous les surtitres suivent désormais ce réglage. Et « Passer » porte un
nom accessible complet.

**Simplification.** Le mécanisme de report que j'avais ajouté pour le seul message de
rejeu a été supprimé : `UI.toast` retient lui-même, deux états pour la même chose ne
se justifiaient plus.

**Documentation.** Trois divergences entre le cadrage et le code corrigées : l'attente
de 360 ms et non `ENTER_WINDOW_MS`, la garde de chargement mixte qui vit dans
`js/app.js` et non dans `js/ui.js`, et la sonde `storageOk` — que le code ne transmet
pas à la règle, volontairement, et qui sert ailleurs. Onze lignes ajoutées à la recette
d'accessibilité, et la promesse « elle repart là où vous l'avez laissée » du guide est
désormais conditionnée à ce que le navigateur autorise l'enregistrement.

**Non traité, et ce sont des tickets à part** : les cinq défauts préexistants, dont la
fuite d'identité de `App.logout()` ; `navigator.storage.persist()` jamais appelé ;
l'installation du service worker tolérante suivie d'une purge inconditionnelle ; et le
pied de panneau qui passe sous le pli à 200 % de police, qui demande un pied collant
et donc un arbitrage de conception.
