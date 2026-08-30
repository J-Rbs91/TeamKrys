# Brief consolidé — brainsto-logo-motion-identity

<!-- mission UXER brainsto-logo-motion-identity — profil standard -->

Mode : `bypass_clarification`. Le demandeur délègue explicitement les arbitrages
réversibles (« Les choix réversibles sont délégués à UXER », « Ne me demande pas de
valider chaque détail visuel intermédiaire »). Aucune question bloquante n'a donc été
posée ; les arbitrages sont cotés dans [`decisions.md`](decisions.md).

## Demande initiale

Issue GitHub [#30](https://github.com/J-Rbs91/TeamKrys/issues/30) — « UXER — Animer le
logo BrainstO par divergence → convergence », ouverte par le propriétaire du dépôt.
Elle est la **source de vérité fonctionnelle et créative** de la mission.

> Le logo ne doit pas dire « BrainstO. est dynamique ». Il doit montrer en moins de
> deux secondes ce que BrainstO. fait à plusieurs idées : il les fait converger vers
> quelque chose de commun.

## Objectif reformulé

Faire porter au monogramme une **motion identity** — pas un splash, pas un décor —
qui rende perceptible `DIVERGENCE → CONVERGENCE → CONSENSUS`, sans allonger la seule
séquence expressive de l'application au-delà de ce que sa fréquence d'exposition
réelle autorise, et sans redessiner l'identité finale.

## Utilisateur principal

Le membre d'équipe qui ouvre l'application pour préparer une réunion. Il voit la
marque à l'ouverture et au déverrouillage. En cas d'arbitrage, **sa centième
exposition prime sur sa première** — c'est la règle de fréquence du dépôt.

## Hypothèses retenues

| # | Hypothèse | Cotation |
|---|---|---|
| H1 | La séquence d'entrée existante est la bonne base : l'issue demande un battement manquant, pas un second système | Confirmée par l'audit — `research-summary.md` |
| H2 | L'exposition réelle sur le verrou est plus fréquente que « une fois par ouverture » | Établie, `CONFIG.LOCK_IDLE_MS` = 1 h — constat UX-002 |
| H3 | Le storyboard de l'issue est une intention, pas une spécification pixel-perfect | Énoncé par le demandeur lui-même |

## Portée autorisée

`css/app.css` (chorégraphie) · `js/utils.js` (géométrie du monogramme) ·
`js/ui.js` (déclenchement et non-rejeu) · `js/config.js` et `service-worker.js`
(versions couplées) · `README.md` et `docs/` (doctrine) · `tests/` (non-régression).

Hors portée : l'identité finale du logo, la séquence d'onboarding, toute dépendance
frontend, toute ressource distante.

## Critères de réussite

Ceux de l'issue #30, section « Critères d'acceptation », repris sans amendement, plus
les invariants dégagés par la phase design : durée totale tenue, non-rejeu à travers
les reverrouillages, état de repos = état final, aucune boucle.

## Ce qui n'est pas récupérable

La conversation d'orchestration. Les enveloppes `Specialist Job/Result` de
[`uxer-jobs/`](uxer-jobs/) sont la seule trace faisant foi du passage d'UXER.
