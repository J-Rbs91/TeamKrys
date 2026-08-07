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

## Arbitrage des décisions restantes (2026-08-07, version 1.9.0)

Les quatre points que la note précédente renvoyait à « des tickets à part » sont
tranchés ici, plus un cinquième trouvé en les instruisant. La consigne était d'arbitrer
en me renseignant sur ce qui se fait dans ce type d'application ; chaque décision porte
donc sa raison, et deux d'entre elles vont contre le réflexe.

**D1 — La déconnexion oublie l'identité et les droits.** `ownItems` n'est pas une
préférence : c'est le porteur du droit de modifier ses propres messages anonymes. Le
laisser survivre à une déconnexion transmet ce droit à la personne suivante sur le même
appareil. `logout()` retire le code, le nom et `ownItems`. La confirmation nomme les
trois oublis, dit que les messages resteront mais ne seront plus modifiables depuis cet
appareil, et **compte les actions en attente** — perdre une file silencieusement serait
pire que le problème d'origine.

**D2 — La durabilité se demande sur le geste qui la justifie.** `navigator.storage.persist()`
est appelée depuis `DB.enqueue`, donc au moment où une action non synchronisée vient
d'être créée : c'est là que la demande a le plus de chances d'être accordée, et le seul
moment où elle est légitime. Demander au démarrage, sans rien à protéger, est le
mauvais réflexe. L'éviction est totale et silencieuse par origine ; le diagnostic dit
désormais `durable` ou `évinçable`.

**D3 — Le précache échoue plutôt que de mentir.** Deux listes aux garanties opposées.
La coquille critique passe par un seul `addAll` dans `waitUntil` **sans catch** : une
ressource manquante fait échouer l'installation, `activate` n'a pas lieu, la purge non
plus, et l'ancien service worker garde son cache complet. La complétude devient
structurelle. Le manifeste et les icônes restent tolérants, hors de `waitUntil`.
Contrepartie assumée et écrite dans le fichier : une entrée critique en 404 bloquerait
toutes les mises à jour, silencieusement.

**D4 — Le pied sort du corps qui défile, et il n'est PAS collant.** C'est la décision
qui va contre la note précédente, qui demandait « un pied collant ». Les critères
d'accessibilité sur le redimensionnement du texte nomment le contenu collant comme
*aggravant* à fort grossissement : il mange une hauteur déjà rare. Une colonne flex —
`.onboard` bornée, `.onboard-card` seul à défiler, `.onboard-foot` non rétractable —
donne la même garantie sans ce défaut, et le séparateur au-dessus du pied sert de marque
d'interruption. Mesuré à 200 % sur 320×568 : corps défilant, pied de 438 à 550 dans un
champ de 568, « Suivant » visible, aucun débordement horizontal.

**D5 — Un rendu tiers n'écrase plus une saisie en cours.** Trouvé en instruisant D4.
`restoreDrafts` réécrivait un champ dès qu'un brouillon existait, donc un rendu
déclenché par l'arrivée d'un message pouvait remplacer ce qui était en train d'être
tapé. Un registre `touchedDrafts`, alimenté par un écouteur `input` délégué en capture,
inverse le critère. Le drapeau natif *dirty value* ne pouvait pas servir : il est aussi
levé par une écriture programmatique, donc il ne distingue pas la frappe du rendu.

**Point de rupture qui reste ouvert.** À 200 % de police sur 320 px, le corps ne garde
qu'environ 155 px. C'est juste mais lisible. Le point de rupture noté au cadrage tient :
si le corps ne garde plus rien à lire, il faut abandonner la feuille pour un plein
écran. Ce n'est pas le cas aujourd'hui, donc ce n'est pas fait.

**Toujours non traité, et volontairement.** Différer les rendus pendant qu'un champ est
édité (P14) — le correctif structurel dont D5 n'est que la version observable ; la
restauration du focus et de la sélection dans `restoreDrafts` ; les quatre autres
défauts préexistants. Et la recette sur appareil réel reste le seul verrou de
publication : WebKit, VoiceOver, TalkBack, fenêtres in-app, démarrage à froid hors
ligne. Les protocoles sont écrits par agent dans `validation.md`.
