# Validation UXER — refonte expérience, affordance et mouvement

## Vérifications statiques réalisées

### Architecture

- la couche UX est isolée dans `css/uxer.css` et `js/uxer-ui.js` ;
- elle enveloppe `UI.render` après `product-ui.js` et avant `App.start` ;
- le routeur, le modèle, les actions, IndexedDB, la synchronisation et Apps Script ne sont pas modifiés ;
- les deux nouveaux fichiers sont ajoutés à la coquille critique du service worker ;
- aucune dépendance ni URL distante n'est introduite.

### Affordance

- carte de sujet : action réelle + signifiant persistant `Ouvrir` ;
- titre de sujet : action réelle + signifiant persistant `Détails` ;
- bulle de message : action réelle + signifiant persistant `•••` ;
- parcours du sujet : trois destinations visibles sur les trois écrans, avec `aria-current="page"` ;
- vote : libellé local `Votre vote` et état pressé conservé ;
- statut : libellé visible `Statut` regroupé avec le sélecteur ;
- consensus choisi : feedback porté par la carte et par le bouton.

### Mouvement

- micro-interactions bornées à 120–180 ms ;
- route à 240 ms ;
- feuille du bas à 220 ms ;
- View Transitions utilisée uniquement si `document.startViewTransition` existe ;
- profondeur de route utilisée pour distinguer avant / arrière / latéral ;
- cascade historique de cartes neutralisée pendant une transition de route pour éviter le double mouvement ;
- `prefers-reduced-motion: reduce` neutralise les déplacements ajoutés.

### Tests ajoutés

`tests/uxer-integration.test.js` verrouille :

- l'ordre de chargement ;
- le précache PWA ;
- les trois étapes du parcours ;
- l'amélioration progressive View Transitions ;
- le repli reduced-motion ;
- les signifiants des cartes et des bulles ;
- l'absence d'URL distante.

Le workflow GitHub vérifie également la syntaxe de `js/uxer-ui.js`.

## Vérifications non revendiquées

L'environnement de réalisation ne fournit pas de navigateur instrumenté sur BrainstO. Les points suivants restent donc **non vérifiés visuellement** :

- frame statique sans hover sur téléphone réel ;
- perception exacte du signifiant `•••` dans chaque type de bulle ;
- rythme ressenti des transitions avant / arrière ;
- comportement au clavier virtuel pendant une transition ;
- dark mode rendu ;
- largeurs 320 / 390 / 768 / desktop ;
- VoiceOver / TalkBack sur la navigation de parcours.

## Gate UXER avant merge

La CI doit être verte. Ensuite, une inspection visuelle et comportementale du rendu réel sur au moins un téléphone tactile et un viewport desktop doit confirmer qu'aucun signifiant n'est trop faible ou trop présent et que le mouvement explique la navigation sans ralentir la tâche.
