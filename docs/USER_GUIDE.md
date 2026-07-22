# Guide utilisateur TeamKrys

TeamKrys sert à **préparer les réunions de l'équipe** : rassembler les sujets,
en discuter, proposer des solutions, voter et conclure — le tout au même endroit.

## Première ouverture

À la première ouverture, deux écrans s'enchaînent :

1. **Connexion à l'équipe** : collez l'**URL du script** (fournie par la personne
   qui a installé le backend) puis **« Enregistrer et continuer »**. Vous pouvez
   aussi **« Continuer sans connexion (mode local) »** pour tester seul.
2. **Nom d'utilisateur** : choisissez le nom qui signera vos messages. Modifiable
   ensuite dans **Réglages** (icône ⚙ en haut à droite).

## Créer un sujet

- **Aucun sujet ?** Le bouton **« Ajouter un sujet »** est au milieu de l'écran.
- **Des sujets existent ?** Utilisez le bouton rond **« + »** en bas à droite.

Une fenêtre s'ouvre avec trois champs :

1. **Titre** (obligatoire) ;
2. **Description** (facultative) ;
3. **Nom** : pré-rempli avec le vôtre ; laissez-le vide pour publier en
   **« Anonyme »**.

Validez : vous arrivez sur l'écran **débat** du sujet.

## L'écran débat

Sélectionner un sujet ouvre l'écran **débat**, titré du nom du sujet. On y
échange des messages, on propose des solutions et on vote. Deux accès mènent au
travail de **Gemini** : **Résumé** et **Conclusion** (voir plus bas).

## Participer à une discussion

Sur l'écran débat, sous **Discussion** :

- écrivez un message dans le champ en bas et cliquez **Publier** ;
- vous pouvez **modifier vos propres messages** (mention « modifié ») ;
- un bouton **« Créer une proposition »** transforme un message en proposition.

## Créer une proposition

Sous **Propositions** :

- **« + Nouvelle proposition »**, ou depuis un message ;
- donnez-lui un titre et décrivez la solution ;
- son statut passe à **« Vote en cours »**.

## Voter

Sous chaque proposition :

- choisissez **Pour**, **Contre** ou **Abstention** ;
- un seul vote par personne : re-cliquez pour **changer** ou **retirer** votre
  vote (**« Retirer mon vote »**) ;
- les compteurs, le pourcentage favorable et un **indicateur** (Consensus
  favorable, Majorité favorable, Avis partagés, Majorité défavorable, Aucun
  vote) se mettent à jour immédiatement.

Chacun peut ajuster le **statut** d'une proposition : Solution retenue, À
débattre en réunion, À mettre en œuvre, Solution écartée. TeamKrys repose sur la
confiance : pas d'administrateur, pas de permissions.

## Résumé (Gemini)

Depuis l'écran débat, ouvrez **Résumé**. Cliquez **« Générer avec Gemini »** :
Gemini travaille **dans une feuille Google Sheets** pour résumer le point de vue
de **chaque collaborateur** à partir de ses messages. Ce n'est **pas
instantané** : revenez et cliquez **« ↻ Rafraîchir »** pour afficher les résumés
(une carte par personne).

## Conclusion (Gemini) et vote

Depuis l'écran débat, ouvrez **Conclusion**. **« Générer avec Gemini »** regroupe
et reformule les **propositions** du débat en plusieurs conclusions ; après un
court instant, **« ↻ Rafraîchir »** les affiche.

- **Votez** pour la conclusion que vous préférez (un seul choix ; voter pour une
  autre déplace votre vote). La mieux votée porte l'étiquette **« En tête »**.
- **« Ajouter une conclusion »** permet d'en proposer une à la main ; vous pouvez
  la **modifier** ou la **supprimer** (vos conclusions uniquement).
- Un nouveau **Rafraîchir** met à jour les conclusions de Gemini **sans effacer
  les votes** déjà exprimés.

> Gemini nécessite que l'application soit **connectée à l'équipe** et que la
> fonction `=AI()` de Google Sheets soit disponible pour le compte du script.
> En mode local, les boutons Gemini sont désactivés.

## Préparer la réunion

Depuis **Réglages → « Ouvrir la préparation de réunion »** : synthèse de tous les
sujets (conclusion en tête des votes, propositions retenues / à débattre,
résultats des votes). Des **filtres** aident à cibler. Le bouton **« Imprimer »**
produit une feuille propre, sans boutons ni navigation.

## Savoir si l'application est synchronisée

Le bandeau en haut affiche en permanence l'état :

- **À jour** : tout est synchronisé ;
- **Synchronisation…** : envoi/réception en cours ;
- **Modifications en attente** : des actions locales restent à envoyer ;
- **Hors connexion** : pas de réseau ;
- **Erreur de synchronisation** : réessayez avec **« Synchroniser maintenant »**
  (dans Réglages) ;
- **Mode local** : l'URL de l'API n'est pas configurée.

## Hors connexion

Vous pouvez continuer à consulter, écrire des messages, créer des propositions,
voter et rédiger des conclusions **sans réseau**. Vos modifications sont
conservées et **envoyées automatiquement** dès le retour de la connexion. Aucun
texte n'est perdu, même si vous fermez et rouvrez l'application.

## Mise à jour

Quand une nouvelle version est publiée, un bandeau **« Une nouvelle version de
TeamKrys est disponible »** apparaît. Cliquez **« Mettre à jour »** : vos données
locales et vos actions en attente sont conservées.
