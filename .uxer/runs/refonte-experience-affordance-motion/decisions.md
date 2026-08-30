# Décisions UXER — refonte expérience, affordance et mouvement

## Diagnostic

### 1. Parcours du sujet — important

La discussion expose deux raccourcis vers Propositions et Conclusion/Consensus, mais ces deux écrans n'exposent pas la même navigation latérale. La position courante dans le cycle n'est donc pas persistante.

**Décision :** une navigation compacte unique `Discussion · Propositions · Consensus` est visible sur les trois écrans. L'étape courante porte `aria-current="page"`, les autres restent actionnables et les compteurs donnent un aperçu du contenu disponible.

### 2. Cartes de sujets — amélioration d'affordance

Toute la carte est un bouton. Une grande cible facilite le pointage mais ne suffit pas à rendre l'action perceptible.

**Décision :** ajouter un signifiant textuel permanent `Ouvrir` accompagné du chevron. Le hover ne fait que renforcer ce signal.

### 3. Titre du sujet — amélioration d'affordance

Le titre de la discussion ouvre les détails du sujet, mais son traitement historique est presque celui d'un titre statique.

**Décision :** conserver la grande cible et ajouter le signifiant persistant `Détails`, avec un état focus/hover propre.

### 4. Bulles de message — important

Chaque bulle est un bouton qui ouvre les actions du message. L'action est annoncée aux technologies d'assistance, mais elle manque d'un signifiant visuel persistant.

**Décision :** ajouter une marque `•••` discrète mais toujours visible. Elle indique l'existence d'actions sans transformer chaque message en barre d'outils.

### 5. Votes et statut — amélioration de correspondance commande / effet

Les boutons de vote sont explicites ; le sélecteur de statut est moins bien relié visuellement à sa fonction.

**Décision :** ajouter les libellés `Votre vote` et `Statut`, et matérialiser sur la carte la présence du vote de l'utilisateur.

### 6. Consensus choisi — amélioration de feedback

Le bouton expose déjà `aria-pressed`. Le nouvel état doit aussi se lire au niveau de l'objet choisi.

**Décision :** bord/liseré d'accent sur la carte sélectionnée et libellé de création plus spécifique (`Ajouter le consensus`).

## Direction visuelle

### Calibrage

- écart de composition : **2/5** ;
- exposition au mouvement : **3/5** ;
- densité informationnelle : **3/5**.

### Parti pris

**Le changement de niveau se perçoit comme un déplacement continu dans le parcours ; les actions répétées restent presque instantanées.**

Le mouvement est la seule dimension d'écart. Couleur, typographie, surfaces, rayons, iconographie et densité restent dans la direction « poste de travail » existante.

## Contrat de mouvement

- micro-interactions : 120–180 ms ;
- changement de route : 240 ms ;
- feuille du bas : 220 ms, origine physique en bas ;
- modale : 200 ms, translation verticale de 8 px + très légère variation d'échelle ;
- aucun ressort sur les contrôles métier ;
- aucune nouvelle cascade sur les listes pendant une transition de route ;
- View Transitions API en amélioration progressive seulement ;
- navigation vers un niveau plus profond : mouvement vers l'avant ;
- remontée : mouvement inverse ;
- changement entre écrans de même niveau : fondu/décalage vertical court ;
- `prefers-reduced-motion: reduce` neutralise les déplacements et transitions ajoutés.

## Éléments interdits

- action révélée uniquement au hover ;
- gestes cachés comme seul chemin ;
- animation longue sur vote, réaction, envoi ou saisie ;
- rebond/overshoot sur les contrôles ;
- multiplication des couleurs d'accent ;
- nouvelle bibliothèque d'animation ;
- modification du routeur pour fabriquer le mouvement ;
- suppression d'une information métier pour obtenir une interface plus minimale.
