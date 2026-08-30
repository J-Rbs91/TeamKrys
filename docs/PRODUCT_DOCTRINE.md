# BrainstO. — doctrine produit

## 1. Mission

BrainstO. est un outil de maturation collective **avant réunion**.

Il sert à transformer les sujets qui apparaissent au fil du travail en points suffisamment mûrs pour que le temps de réunion soit consacré à arbitrer et à tenir un cap commun, plutôt qu'à découvrir le problème et reconstruire le débat depuis zéro.

La chaîne produit de référence est :

> Sujet → Discussion → Propositions → Votes → Consensus → Prêt pour la réunion

BrainstO. s'arrête volontairement à cette frontière.

Il ne gère ni la réunion elle-même, ni son ordre du jour formel, ni son compte rendu, ni le suivi de l'exécution après la réunion.

## 2. Question centrale

Toute évolution doit pouvoir répondre positivement à la question suivante :

> Est-ce que cette fonctionnalité aide un sujet à passer de « il faut qu'on en parle » à « voilà le cap que l'équipe veut tenir sur ce point » ?

Si la réponse est non, la fonctionnalité est probablement hors périmètre de BrainstO.

## 3. Les cinq questions auxquelles BrainstO. doit répondre

1. **De quoi devons-nous parler ?**
   - Les sujets capturent les problèmes, irritants, idées ou points à traiter à l'initiative de l'équipe.

2. **Qu'en pense l'équipe ?**
   - La discussion, les citations et les réactions permettent à chacun d'apporter son point de vue à son rythme.

3. **Quelles options émergent ?**
   - Les propositions transforment les idées issues du débat en options explicites.

4. **Quelle position collective se dessine ?**
   - Les votes rendent visible le niveau d'adhésion, de désaccord, d'abstention et de participation.

5. **Quel cap l'équipe veut-elle porter en réunion ?**
   - Le **Consensus** est la formulation collective préparée avant la réunion.
   - Plusieurs formulations peuvent être proposées ; chacun en choisit une et la formulation la plus soutenue ressort en tête.
   - Le Consensus n'est **pas** une décision prise en réunion et n'est **pas** un compte rendu.

## 4. Le Consensus

Le nom produit de l'étape actuellement appelée « Conclusion » devient **Consensus**.

Le Consensus représente :

- la synthèse préparée par l'équipe ;
- le cap qu'elle souhaite défendre ou tenir sur le sujet ;
- le point d'arrivée de la maturation dans BrainstO. ;
- ce qui permet de déclarer un sujet « Prêt pour la réunion ».

Il ne représente pas :

- la décision finale d'un responsable ;
- le résultat officiel d'une réunion ;
- un procès-verbal ;
- une tâche à exécuter après la réunion.

La structure de données interne peut conserver le vocabulaire historique `conclusion` tant qu'une migration ne présente pas de bénéfice concret. Le renommage produit ne doit pas imposer une migration risquée sans nécessité.

## 5. La réunion est une frontière, pas une entité métier

BrainstO. ne doit pas créer de modèle `Meeting` ou équivalent.

Les sujets sont créés à l'initiative de l'équipe et vivent indépendamment d'une réunion précise. Leur état indique seulement leur maturité :

- En discussion
- Prêt pour la réunion
- Clôturé
- Archivé

Il n'est pas nécessaire de gérer :

- une date de réunion ;
- l'affectation d'un sujet à une réunion ;
- un historique des réunions ;
- les participants à une réunion ;
- un ordre du jour formel ;
- des invitations ou une intégration calendrier.

La synthèse existante reste une vue pratique des sujets à porter collectivement, sans devenir un objet métier « réunion ».

## 6. BrainstO. n'est pas un compte rendu

Le produit ne doit pas enregistrer une « décision prise en réunion » dans le but de devenir un bilan ou une mémoire officielle des réunions.

BrainstO. prépare le collectif en amont :

> problème identifié → débat → options → positionnement → consensus

Ce qui se passe après cette préparation appartient à d'autres outils ou aux pratiques de l'équipe.

BrainstO. ne doit donc pas dériver vers :

- la rédaction de comptes rendus ;
- la gestion de décisions post-réunion ;
- le suivi de plans d'action ;
- l'attribution de tâches ;
- les échéances ;
- le Kanban ;
- la gestion de projet.

## 7. L'accueil doit montrer la maturité, pas seulement l'activité

La liste des sujets doit aider l'utilisateur à répondre à :

> Qu'est-ce qui doit maintenant avancer ?

L'activité récente reste utile, mais elle ne doit pas cacher un sujet déjà mûr.

La direction cible est :

1. **Prêts pour la réunion**
2. **En discussion**
3. **Clôturés récemment**
4. **Archivés** uniquement à la demande

À l'intérieur de chaque groupe, le tri par activité récente reste pertinent.

## 8. Votes : distinguer adhésion et participation

Un résultat de vote n'est interprétable qu'avec son niveau de participation.

La présentation doit donc rendre visibles au minimum :

- Pour
- Contre
- Abstention
- nombre de participants ayant voté / nombre de participants connus
- pourcentage favorable parmi les avis exprimés, lorsqu'il est pertinent

Un faible nombre de votes ne doit pas être présenté comme une forte preuve collective.

Le mot **consensus** est réservé à l'étape produit « Consensus » et ne doit pas être utilisé de manière ambiguë pour qualifier automatiquement un vote sur une proposition.

## 9. Propositions : ne pas dériver vers l'exécution

Les statuts des propositions doivent décrire leur maturité dans BrainstO., pas leur exécution après la réunion.

Le statut `Mise en place` est hors doctrine produit : il décrit un état post-réunion et rapproche BrainstO. d'un outil de suivi d'actions.

Le statut `Retenue` doit également être réexaminé car le Consensus est désormais l'endroit où l'équipe formule le cap qu'elle veut porter.

La cible est un jeu de statuts plus simple centré sur :

- en cours de positionnement / en vote ;
- à débattre ;
- écartée.

Toute modification du protocole partagé doit préserver les données existantes et la parité frontend/backend.

## 10. Les nouveautés depuis la dernière visite sont un besoin produit

BrainstO. est asynchrone. Il doit donc aider chacun à repérer rapidement ce qui a changé depuis sa dernière consultation.

La direction cible est un mécanisme local, léger et non intrusif :

- sujet mis à jour depuis ma dernière visite ;
- nouveaux messages ;
- nouveau mouvement sur une proposition ou un consensus.

Ce besoin ne justifie pas, à lui seul, des notifications push ou une infrastructure supplémentaire.

## 11. L'anonymat est un principe produit

L'anonymat n'est pas une option décorative.

Il permet à une idée, un problème ou un désaccord d'exister avant que l'identité de la personne qui le porte n'influence sa réception.

Les invariants existants sont à préserver :

- l'identité d'un message anonyme n'est pas conservée dans les données partagées ;
- un message anonyme ne doit pas être visuellement identifiable comme « le mien » par une personne regardant l'écran ;
- les droits locaux permettant de modifier un contenu anonyme ne doivent pas être transmis après déconnexion.

## 12. Réactions : décision assumée

Le jeu actuel de réactions est conservé :

- 👌 D'accord
- 💪 Je m'engage
- 🤏 Mitigé
- 👎 Pas d'accord
- 💩 À écarter

Le registre culturel de ces réactions est assumé comme faisant partie de BrainstO. et de son contexte d'utilisation.

## 13. Mode local

Le mode local est conservé comme :

- bac à sable ;
- démonstration ;
- moyen de découvrir l'outil sans configurer une équipe.

Il ne doit pas dicter l'évolution du modèle collectif. BrainstO. prend son sens principal à plusieurs.

## 14. Pas de système de rôles sans besoin réel

BrainstO. reste fondé sur une petite équipe de confiance.

Ne pas introduire préventivement une matrice de rôles du type administrateur / manager / modérateur / collaborateur / observateur.

Un droit spécifique ne doit apparaître qu'en réponse à un besoin concret et démontré.

## 15. Hors périmètre explicite

Sauf changement volontaire de doctrine, BrainstO. ne doit pas devenir :

- un chat généraliste ;
- un gestionnaire de tâches ;
- un outil de gestion de projet ;
- un calendrier ;
- un logiciel de réunion ;
- un outil de compte rendu ;
- une base documentaire ;
- un outil RH ;
- un système complexe de permissions.

## 16. Règle de revue produit

Toute nouvelle fonctionnalité doit être classée avant implémentation :

- **renforce directement la maturation d'un sujet** → candidate naturelle ;
- **réduit une friction importante de ce parcours** → candidate probable ;
- **sert surtout ce qui se passe pendant ou après la réunion** → hors périmètre par défaut ;
- **introduit une nouvelle catégorie de logiciel** → refus par défaut, sauf décision explicite de changer la doctrine.
