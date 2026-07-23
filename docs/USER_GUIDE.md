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
échange des messages, on propose des solutions et on vote. Un bouton mène à
l'écran **Conclusion** (voir plus bas).

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

## Conclusion et vote

Depuis l'écran débat, ouvrez **Conclusion**.

- **« Ajouter une conclusion »** : proposez une conclusion qui regroupe et
  reformule les **propositions** du débat.
- **Votez** pour la conclusion que vous préférez (un seul choix ; voter pour une
  autre déplace votre vote). La mieux votée porte l'étiquette **« En tête »**.
- Vous pouvez **modifier** ou **supprimer** **vos** conclusions.

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
