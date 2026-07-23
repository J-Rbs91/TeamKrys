# Guide utilisateur TeamKrys

TeamKrys sert à **préparer les réunions de l'équipe** : rassembler les sujets,
en discuter, proposer des solutions, voter et conclure — le tout au même endroit.

## Première ouverture

À la première ouverture, deux écrans s'enchaînent :

1. **Connexion à l'équipe** : collez l'**URL du script** (fournie par la personne
   qui a installé le backend), et le **code d'accès** si votre équipe en utilise
   un, puis **« Enregistrer et continuer »**. Vous pouvez aussi **« Continuer
   sans connexion (mode local) »** pour tester seul.
2. **Nom d'utilisateur** : choisissez le nom qui signera vos messages. Modifiable
   ensuite dans **Réglages** (icône ⚙ en haut à droite).

### Verrouillage par code

Si un code d'accès est configuré, l'application se **verrouille à chaque
ouverture** : un écran demande le code avant d'afficher quoi que ce soit. Le
code n'est **jamais enregistré** sur l'appareil ; on ne conserve qu'un
« vérificateur » permettant de le contrôler (y compris hors connexion).
L'application se reverrouille aussi après une longue période en arrière-plan.
Le bouton **« Se déconnecter de l'équipe »** oublie l'URL et le code sur
l'appareil.

## Créer un sujet

- **Aucun sujet ?** Le bouton **« Ajouter un sujet »** est au milieu de l'écran.
- **Des sujets existent ?** Utilisez le bouton rond **« + »** en bas à droite.

Une fenêtre s'ouvre avec trois champs :

1. **Titre** (obligatoire) ;
2. **Description** (facultative) ;
3. **Nom** : pré-rempli avec le vôtre ; laissez-le vide pour créer le sujet en
   **« Anonyme »** (aucune identité n'est alors enregistrée — idéal pour aborder
   un sujet qui fâche sans être « celui qui a mis les pieds dans le plat »).

Validez : vous arrivez sur l'écran **débat** du sujet.

## L'écran débat

Sélectionner un sujet ouvre l'écran **débat**, titré du nom du sujet. On y
échange des messages, on propose des solutions et on vote. Un bouton mène à
l'écran **Conclusion** (voir plus bas).

## Participer à une discussion

Sur l'écran débat, sous **Discussion** :

- écrivez un message dans le champ en bas et cliquez **Publier** ;
- **réagissez** à un message avec un emoji (👌 💪 🤞 🤏 👎 💩) : cliquez le bouton
  🙂 sous le message, choisissez une réaction ; recliquer la retire. Une seule
  réaction par personne et par message ; le compteur s'affiche à côté ;
- un bouton **« Proposition »** transforme un message en proposition.

### Signer ou rester anonyme

Un message est **signé de votre nom par défaut**. Juste après l'avoir publié,
le bouton **« Rendre anonyme »** apparaît sur votre message : il masque votre
identité (le message affiche « Anonyme » et n'enregistre plus qui l'a écrit).
Vous pouvez **rebasculer** avec **« Signer avec mon nom »** — pratique en cas
d'erreur. C'est utile pour donner un avis délicat sans crainte de reproches.

### Modifier un message

Vous pouvez **modifier vos propres messages** (mention « modifié ») **tant que
personne n'y a réagi**. Dès qu'une autre personne ajoute une réaction, le
message est **verrouillé** (indicateur 🔒) : il ne peut plus être modifié, pour
éviter de changer un propos que d'autres ont déjà commenté. La signature
(nom/anonyme), elle, reste modifiable.

### Citer un message

Pour répondre à un message précis ou y faire référence, cliquez **« Citer »** :
un bandeau « en réponse à … » apparaît au-dessus du champ de saisie. Publiez
votre message : il affichera le message cité en en-tête (cliquable pour revenir
à l'original). Utile quand la conversation part dans tous les sens.

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
