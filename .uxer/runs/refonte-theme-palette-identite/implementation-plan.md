# Plan d'exécution — refonte-theme-palette-identite

Profil `standard`. Six unités, séquentielles : chacune a une validation
identifiable, et aucune ne dépend d'une phase ultérieure.

| # | Unité | Fichiers | Validation | État |
|---|---|---|---|---|
| U1 | Extraire la matière, construire trois territoires, faire trancher | — (conversation) | Trois idées directrices distinctes, une recommandation, un arbitrage rendu | fait |
| U2 | Figer le noyau d'identité dans le projet | `docs/IDENTITE_VISUELLE.md` | Les neuf points de contrôle du format sont couverts, aucune valeur de jeton recopiée | fait |
| U3 | Reconstruire les jetons — neutres, deux voix, couche technique, segments de vote | `css/app.css` | Chaque palier construit par ratio, aucun jeton orphelin, `--accent*` renommé partout | fait |
| U4 | Appliquer la sémantique dans les composants | `css/app.css`, `css/product.css`, `css/uxer.css`, `js/ui.js`, `js/utils.js` | Aucune teinte technique dans la délibération, aucune teinte de délibération dans le chrome hors accord | fait |
| U5 | Rendre la vérification exécutable | `tools/check-contrast.py`, `.github/workflows/test.yml` | 40 couples par mode, sortie non nulle sous le seuil, CI verte | fait |
| U6 | Propager la version et le récit | `index.html`, `manifest.webmanifest`, `tools/build-icons.py`, `assets/icons/`, `js/config.js`, `service-worker.js`, `README.md`, `.claude/agents/` | Suite de tests verte, icônes régénérées, aucune trace du thème sortant | fait |

## Ce que le plan n'a pas prévu, et qui a été fait

- **U4 bis — le bouton de vote choisi.** Il portait la couleur de l'accord quel
  que soit le vote exprimé : un « contre » s'allumait en bleu. Découvert en
  relisant l'usage de `--accord-surface`, corrigé par `data-vote`.
- **U6 bis — la règle du seul aplat.** La barre de vote la contredisait, et la
  contradiction n'est apparue qu'au rendu. La règle a été reformulée avec son
  exception plutôt que d'être laissée fausse.
