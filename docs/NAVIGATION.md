# Navigation arrière — ce que fait le geste retour

Ce document dit ce que doit faire le bouton retour d'Android, le bouton retour
de l'en-tête et le glissement latéral d'iOS, comment c'est tenu dans le code, et
comment le vérifier.

Il applique à BrainstO. le contrat de navigation arrière de la méthode UXER
(`references/back-navigation-contract.md`).

---

## 1. Pourquoi ça compte ici plus qu'ailleurs

Installée sur l'écran d'accueil, l'application n'a **aucune barre de
navigateur**. Le geste retour du système est alors le seul moyen de circuler
autrement qu'en visant un bouton. Un geste retour qui se comporte mal n'est pas
une gêne : c'est la moitié de la navigation qui ne marche pas.

Et ce défaut est invisible pendant la conception. Il ne se voit pas sur un
ordinateur, où personne n'appuie sur retour ; il ne casse aucun test
fonctionnel ; il se constate en trente secondes sur un téléphone.

## 2. Le défaut, tel qu'il était

Le geste retour rejoue la **pile d'historique** : la chronologie des écrans
visités, à l'envers. Personne ne se représente une application comme une
chronologie — on se la représente comme un **arbre**, et « retour » veut dire
remonter d'un niveau.

Les deux coïncident tant qu'on ne fait que descendre, et divergent au premier
pas de côté.

| Ce qu'on faisait | Ce qui se passait |
|---|---|
| Ouvrir six sujets à la file depuis la liste | Sept appuis sur retour pour sortir |
| Appuyer sur le bouton retour de l'en-tête | Une entrée **de plus** était empilée : remonter éloignait la sortie au lieu de la rapprocher |
| Aller aux Réglages puis revenir | Deux entrées pour un aller-retour au même niveau |
| Appuyer sur retour, une modale ouverte | L'écran changeait **et** la modale se fermait : la saisie partait avec |

Les deux dernières lignes sont les plus coûteuses : elles font douter de ce
qu'on vient de faire.

## 3. Le contrat

Un seul invariant, et tout en découle :

> **La pile d'historique est toujours le chemin de la racine à l'écran courant.**

Sous cet invariant, le geste retour remonte l'arbre **de lui-même**, sans une
ligne d'interception. Et il ne faut surtout pas intercepter : sur iOS le retour
est un glissement continu et réversible qu'une interception transforme en saut
sec, sur Android il entre en concurrence avec les gestes du système, et partout
il casserait le retour du navigateur.

Trois gestes seulement, et l'intention se **déduit** de la position des deux
écrans dans l'arbre — elle ne se déclare jamais à la main :

| Intention | Position de la cible | Geste sur la pile |
|---|---|---|
| Descendre | plus profonde | empiler |
| Frère | même profondeur | **remplacer** |
| Remonter | moins profonde | **dépiler** |

C'est la ligne du milieu qu'on oublie, et c'est elle qui produisait le défaut.

### L'arbre de BrainstO.

```
Sujets  (racine)
├── Sujet
│   ├── Propositions
│   └── Conclusion
└── Réglages
    └── Réunion
```

La table `PARENT`, en tête de la section navigation de `js/app.js`, est **le
seul endroit** où cette structure est écrite. Ajouter un écran, c'est y ajouter
une ligne : les liens qui y mènent se comportent alors correctement sans que
personne ait à y penser.

### Les couches

Une feuille du bas et une modale ne sont pas des feuilles de l'arbre : ce sont
des calques posés dessus. Elles comptent chacune pour **un niveau de plus**, ce
qui fait qu'en sortir est toujours une remontée — d'où qu'elles aient été
ouvertes, et quel que soit le geste : bouton « Fermer », touche Échap, clic sur
le fond, ou bouton retour du téléphone. Une couche fermée quitte la pile et ne
peut plus être ressuscitée.

Le point d'interception est `UI.set`, et nulle part ailleurs : les couches se
déclarent par l'état, et il n'existe qu'un endroit où cet état change.

**La séquence de présentation fait exception.** C'est un `<dialog>` modal, servi
nativement par le navigateur au-dessus de Chromium 120 (`CloseWatcher`), avec un
repli sur `popstate` en dessous. Lui ajouter notre mécanisme en ferait deux, et
deux mécanismes de retour divergent toujours.

### Quand la trace est vide

Arrivée par une adresse partagée, rechargement, reprise d'une application mise
en veille : la pile ne contient rien sous l'écran courant. Dépiler sortirait de
l'application — et retenir quelqu'un sur le premier écran parce qu'on n'a pas su
gérer la pile serait un défaut, pas une protection.

Le repli est donc de **remplacer** l'entrée courante par le parent déclaré : la
pile ne grandit pas, ce qui est le point important, et le retour suivant sort
proprement. Chaque écran a pour cela un parent de repli, distinct du parent
réellement parcouru.

Le marquage qui rend ce repli possible est posé au démarrage : la trace repart
de zéro à chaque chargement.

## 4. Le bouton retour de l'en-tête

Chaque écran secondaire en porte un — l'iPhone n'a pas de bouton retour
matériel, et l'application installée n'a pas de barre de navigateur : sans lui,
l'écran serait sans issue.

Il appelle `App.remonter`, qui **dépile**. Il ne navigue pas vers le parent :
naviguer empilerait une entrée de plus, et c'est précisément ce qui rendait la
sortie plus lointaine à chaque remontée. C'est aussi la seule façon que les deux
retours — celui de l'interface et celui du système — aboutissent au même écran
depuis le même point.

Son libellé nomme la destination (« Sujets », « Discussion », « Réglages »).
C'est exact ici parce que chaque écran a un seul parent. Le jour où un écran en
aura plusieurs, un libellé figé mentirait deux fois sur trois : il faudra alors
nommer le nœud réellement atteint, ou retomber sur « Retour » — jamais annoncer
un parent statique quand le geste mène ailleurs.

## 5. Comment le vérifier

Six vérifications, sur un téléphone, dans cet ordre. Elles sont reprises dans
`docs/CHECKLIST_TEST.md`.

1. **Compter les appuis.** Sujets → un sujet → ses propositions, puis retour
   jusqu'à sortir. Deux appuis, pas trois, pas quatre.
2. **Faire des pas de côté.** Ouvrir trois sujets voisins à la file. Le nombre
   d'appuis pour sortir ne doit pas avoir changé — il reste à un.
3. **Fermer une couche puis appuyer sur retour.** La feuille ou la modale ne
   doit pas revenir.
4. **Terminer un parcours puis appuyer sur retour.** Après avoir créé un sujet
   depuis la modale, le retour ramène à la liste — pas au formulaire.
5. **Comparer les deux retours.** Depuis les propositions, le bouton de
   l'en-tête et le bouton du système doivent mener au même écran.
6. **Arriver directement en profondeur** par un lien partagé vers un sujet, puis
   appuyer sur retour. On doit monter dans l'arbre, pas sortir au premier appui.

`node tests/navigation.test.js` ne vérifie pas ce comportement — il ne le
pourrait pas sans navigateur. Il protège les deux conditions structurelles sans
lesquelles le défaut revient au prochain écran ajouté : la profondeur déclarée
en un seul endroit, et la navigation qui passe par un seul point.

## 6. En ajoutant un écran

1. Le déclarer dans `parseRoute`.
2. **Lui donner un parent dans `PARENT`.** Sans cela, `node tests/navigation.test.js`
   échoue — c'est voulu : un écran sans profondeur déclarée est un écran où le
   geste retour rejouera la chronologie des visites.
3. Y mettre un bouton retour d'en-tête branché sur `App.remonter`, jamais sur
   `App.go`.
4. Naviguer vers lui par `App.go`, jamais en écrivant `location.hash`.
5. Refaire les six vérifications ci-dessus.
