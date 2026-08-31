# Brief consolidé — refonte-theme-palette-identite

<!-- mission UXER refonte-theme-palette-identite — profil standard -->

## Demande initiale

> « faut refondre le thème et palette de couleur de TeamKrys — ça fait vraiment ia
> générique là — utilise UXER pour corriger cela »

## Nature du problème

**Indifférencié**, et non visuel. C'est la ligne qu'on classe le plus souvent à
tort comme un défaut d'exécution. Le thème sortant n'avait aucune faute : douze
neutres construits par ratio, un accent unique dépensé avec avarice, deux
élévations, un mouvement borné par la fréquence d'usage. Il était accessible,
cohérent et documenté.

Il était aussi transposable tel quel à n'importe quel outil d'équipe. Les causes
observables :

| # | Constat | Pourquoi c'est générique |
|---|---|---|
| C1 | Ardoise froide ~205° + accent teal ~192° | L'accent est voisin du neutre en teinte : l'unique dépense de couleur ne crée aucune tension, elle se fond. C'est aussi l'accord par défaut du secteur — écart nul |
| C2 | Aucune des sept dimensions ne porte d'écart | Toutes sont au réglage sobre. « Neutre » y était un point d'arrivée, pas une décision |
| C3 | La couleur ne signifiait rien du produit | Un accent de sélection dit « c'est choisi », jamais « où en est l'accord » — alors que c'est la seule question que le produit sert à répondre |
| C4 | Les statuts empruntaient au vocabulaire technique | « Prêt » en vert de succès, « en débat » en ocre d'avertissement, « rejetée » en rouge d'erreur. Une proposition écartée n'est pas une erreur |

## Utilisateur principal

Le membre de l'équipe d'un magasin, sur téléphone, debout, entre deux clients,
plusieurs fois par jour, sous éclairage fort. **Sa centième exposition prime sur
sa première** — règle de fréquence du dépôt, inchangée.

## Contraintes tenues, antérieures à cette mission

- Zéro requête réseau : aucune police distante, aucun CDN, aucune image externe,
  aucune bibliothèque d'animation. **Cette contrainte a exclu la typographie
  comme dimension porteuse**, alors qu'elle est le meilleur rapport
  qualité-prix des sept.
- Cibles tactiles ≥ 44 px, seuils WCAG 2.2 opposables, aucune dépendance.
- La fréquence d'usage exclut le mouvement et la matière lourde comme
  dimension porteuse.

## Périmètre autorisé

`css/app.css` · `css/product.css` · `css/uxer.css` · `js/ui.js` (couche
sémantique des statuts) · `js/utils.js` (monogramme) · `index.html` ·
`manifest.webmanifest` · `tools/` · `assets/icons/` · `docs/` · `README.md` ·
`tests/` · CI.

Hors périmètre : la structure des écrans, la navigation, le modèle de données,
le backend, la séquence de mouvement du monogramme (décidée en mission
`brainsto-logo-motion-identity`, relevée et non rejouée).

## Décision du demandeur

Trois territoires ont été construits et soumis avec une recommandation. Le
demandeur a retenu **« Deux voix qui convergent »** — le plus littéral et le
plus coûteux des trois — contre la recommandation, qui portait sur « L'encre et
les voix ». Les deux risques nommés au moment du choix ont été tenus comme
conditions de livraison : voir `validation.md`.

## Critères de réussite

1. Le parti pris se dit en une phrase sans adjectif d'ambiance.
2. La dimension porteuse est identifiable sur trois écrans éloignés.
3. Aucun couple de couleurs sous son seuil, dans les deux modes, **vérifié par
   un script et non par une relecture**.
4. Aucune information ne repose sur la teinte seule.
5. La suite de tests existante passe sans amendement autre que la version.
