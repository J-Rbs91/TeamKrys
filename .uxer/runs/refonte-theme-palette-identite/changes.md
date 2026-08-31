# Changements — refonte-theme-palette-identite

## Ajoutés

| Fichier | Rôle |
|---|---|
| `docs/IDENTITE_VISUELLE.md` | Le noyau d'identité : essence, matière, territoire retenu et écartés, principes, signatures, application par surface, interdits. Aucune valeur de jeton — elles vivent dans la feuille de style |
| `tools/check-contrast.py` | Relit les jetons de `css/app.css`, résout `var()` et compose les `rgba()`, vérifie 40 couples par mode, sort 1 sous le seuil |

## Modifiés

| Fichier | Ce qui change |
|---|---|
| `css/app.css` | En-tête réécrit — le parti pris et ses quatre décisions. Neutres passés de l'ardoise froide (~205°) à la grège chaude (~40°). `--accent*` renommé `--accord*`. Ajout de `--voix`, `--voix-strong`, `--voix-bg`, `--on-voix`, `--on-ink-soft`, `--vote-accord`, `--vote-voix`, `--vote-abstention`. Segments de vote et légende reliés aux deux voix. Pastilles `tone-accord` et `tone-voix`. Bulle « mes messages » passée de l'accord à l'encre. Bouton de vote coloré par la valeur qu'il exprime. Ombres et voile réchauffés. Mode sombre entièrement recalculé |
| `js/ui.js` | `TOPIC_TONES` et `PROPOSAL_TONES` passent à la couche de délibération : « prêt » et « retenue » à l'accord, « en débat » à la voix, « clôturé » et « rejetée » au neutre. Le bouton de vote porte `data-vote` |
| `js/utils.js` | Le point du monogramme référence `--accord` ; son commentaire dit ce qu'il signifie |
| `css/product.css` | Le titre de groupe « prêt pour la réunion » passe du succès à l'accord |
| `css/uxer.css` | L'intention est corrigée : le mouvement y est une politique fonctionnelle, pas un écart d'identité |
| `index.html`, `manifest.webmanifest` | `theme-color`, `background_color` et le fond anti-flash suivent le nouveau thème |
| `tools/build-icons.py`, `assets/icons/*` | Fond, anneau et point du monogramme suivent les jetons sombres ; icônes régénérées |
| `js/config.js`, `service-worker.js` | Version 1.12.0, cache aligné |
| `tests/product-integration.test.js` | La version attendue suit |
| `.github/workflows/test.yml` | Deux étapes : contrastes du thème, et icônes synchronisées avec le manifeste |
| `README.md` | « Direction artistique » réécrite : ce que la couleur signifie, les deux règles qui la protègent, les valeurs des deux voix, la vérification exécutable |
| `.claude/agents/qa-mobile-a11y.md` | Le rappel de palette suit, et renvoie au script plutôt qu'à une estimation |

## Après-livraison — correction du palier le plus clair

Le demandeur a signalé que le blanc des surfaces était trop blanc. Toute la
plaque claire descend d'un cran, teinte conservée : `--n-0` passe du blanc pur
au papier, et les paliers 25 à 900 suivent pour préserver le rapport qui détache
une carte. Les encres posées sur un aplat coloré (`--on-accord`, `--on-voix`,
`--on-danger`) cessent elles aussi d'être du blanc pur. `--vote-abstention` est
assombri pour regagner la marge que le fond plus sombre lui avait prise.

Suivent : `index.html` (fond anti-flash et `theme-color` du mode clair), le
tableau de neutres du README, et l'interdit « aucun blanc pur hors impression »
au noyau d'identité. Les 80 couples tiennent toujours. Voir décision D9.

## Non touché, et c'est délibéré

La structure des écrans, la navigation, le modèle de données, le backend, la
séquence de mouvement du monogramme, la typographie, les rayons, les élévations,
les espacements, la politique de flou. **Une refonte de palette qui déplace la
mise en page n'est plus une refonte de palette** — et cinq des sept dimensions
doivent rester conventionnelles pour que la sixième se voie.
