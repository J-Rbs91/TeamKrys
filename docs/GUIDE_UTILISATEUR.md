# BrainstO. - guide de l'équipe

BrainstO. sert à préparer les réunions **avant** la réunion. L'équipe fait remonter
les sujets au fil du travail, en discute à son rythme, transforme les idées en
propositions, se positionne par le vote puis formule un **Consensus** : le cap que
l'équipe souhaite porter sur le sujet lorsqu'il sera abordé.

BrainstO. ne gère ni l'ordre du jour, ni le compte rendu, ni le suivi des actions
après la réunion.

---

## Démarrer

1. Ouvrir l'adresse communiquée par l'équipe **dans le navigateur** (Safari sur
   iPhone ; Chrome, Samsung Internet ou Firefox sur Android). Si le lien arrive
   dans WhatsApp, Instagram, Messenger, Gmail ou Teams, il s'ouvre dans une
   fenêtre intégrée à cette application, où l'on ne peut rien installer : en
   sortir avec le menu de la fenêtre (« Ouvrir dans le navigateur »).
2. Ajouter BrainstO. à l'**écran d'accueil** du téléphone (recommandé), puis
   ouvrir l'application depuis son icône. Les étapes, navigateur par navigateur,
   sont dans [`INSTALLATION.md`](INSTALLATION.md).
3. **Dans l'application installée**, coller l'**adresse du script** et saisir le
   **code d'accès** s'il y en a un.
4. Choisir votre **nom** : il apparaîtra à côté de vos contenus signés.

Pourquoi dans cet ordre ? Une application installée garde ses données à part de
celles du navigateur : ce qu'on a saisi dans Safari ou Chrome avant d'installer n'y
est pas retrouvé. Sur iPhone, Safari peut en plus effacer ce qu'un site a
enregistré après sept jours d'utilisation de Safari sans visite de ce site ;
d'après WebKit, l'application installée n'est pas concernée par ce délai. Si
cela arrive quand même, l'écran de connexion revient : ressaisissez l'adresse, le code et le nom.
Les données de l'équipe ne sont pas touchées, mais les actions qui n'avaient pas
encore été envoyées sont perdues.

Le code n'est pas redemandé à chaque ouverture. Il redevient nécessaire après une
heure sans activité. Le code lui-même n'est jamais enregistré sur le téléphone.

Le bouton **Continuer sans connexion (mode local)** permet d'essayer BrainstO. seul.
Ce mode est un bac à sable : les données restent sur l'appareil et les fonctions
collectives prennent naturellement leur sens une fois connecté à l'équipe.

---

## Les sujets

Un sujet correspond à un point que l'équipe souhaite faire mûrir.

L'accueil les regroupe par état :

1. **Prêts pour la réunion**
2. **En discussion**
3. **Clôturés**
4. **Archivés**, seulement lorsqu'on demande à les afficher

Dans chaque groupe, les sujets les plus récemment actifs apparaissent en premier.

Un sujet possède un titre obligatoire et une description facultative. Il peut être
proposé sans signature : aucune identité n'est alors enregistrée dans les données
partagées pour son auteur.

Les statuts sont :

- **En discussion** : le sujet mûrit encore ;
- **Prêt pour la réunion** : l'équipe a suffisamment travaillé le sujet pour le porter ;
- **Clôturé** : le travail préparatoire est terminé ;
- **Archivé** : le sujet quitte la vue courante sans être supprimé.

Au-delà de six sujets, la recherche apparaît. Les archives restent masquées par
défaut.

### Nouveautés

BrainstO. mémorise localement ce que cet appareil a déjà consulté. À votre retour,
l'accueil peut donc signaler :

- un nouveau sujet ;
- de nouveaux messages ;
- de nouvelles propositions ;
- des votes mis à jour ;
- un Consensus mis à jour.

Ces marqueurs restent sur l'appareil. Ils ne créent aucun compte et ne sont pas
synchronisés entre téléphones. Vos propres actions (vos sujets, vos messages, vos
propositions, vos votes, vos réactions et vos soutiens à un Consensus) ne sont
pas signalées comme des nouveautés sur votre appareil : seules celles des autres le
sont. Après une déconnexion, vos anciens messages anonymes ne sont plus reconnus
comme les vôtres : ils peuvent être signalés une fois. À la toute première
synchronisation d'un appareil, les sujets déjà présents servent de point de
départ, en silence : seul ce qui arrive ensuite est signalé.

---

## La discussion

Chaque sujet contient une conversation de groupe.

Vos messages signés sont affichés à droite. Les contenus des autres personnes sont
à gauche. Un message publié anonymement est lui aussi présenté à gauche, y compris
sur votre propre téléphone.

Appuyer sur un message donne accès aux actions suivantes :

| Action | Effet |
|---|---|
| Coche | D'accord |
| Éclair | Je m'engage |
| Vague | Mitigé |
| Croix | Pas d'accord |
| Cercle barré | À écarter |
| **Citer** | Répondre en conservant le contexte |
| **Créer une proposition** | Transformer l'idée en option structurée |
| **Modifier** | Corriger votre message tant qu'il n'est pas verrouillé |
| **Rendre anonyme / Signer** | Modifier la signature du message |

Une personne ne peut avoir qu'une réaction par message. Appuyer à nouveau sur la
même réaction la retire.

Les cinq réactions sont dessinées par l'application sous forme de pictogrammes,
et non en emoji. Le nom de chacune est celui de la colonne « Effet » ci-dessus.

### Anonymat

L'anonymat fait partie du fonctionnement de BrainstO., pas seulement de son
apparence. Lorsqu'un message devient anonyme, son identité est effacée des données
partagées. Le téléphone conserve seulement une preuve locale lui permettant de
reconnaître ce contenu comme le vôtre et de vous laisser le modifier ou le signer
plus tard.

La déconnexion efface cette preuve locale. Le message reste anonyme dans l'espace
de l'équipe, mais ce téléphone ne pourra plus prouver qu'il vous appartenait.

Vous ne pouvez pas réagir à votre propre message anonyme : la réaction inscrirait
votre identifiant dans les données partagées et lèverait l'anonymat. La feuille de
ce message ne propose donc aucune réaction.

Cette garantie est celle de l'interface. Le serveur ne garde aucune identité d'un
message anonyme : il ne peut pas vérifier qui en est l'auteur. L'application ne
propose de modifier ou de signer qu'à l'appareil qui a créé le message, mais
quelqu'un qui enverrait des requêtes directement au serveur, avec le code de
l'équipe, pourrait le faire aussi. C'est la limite d'un outil d'équipe protégé par
un code partagé, sans compte individuel.

### Verrou de modification

Dès qu'une **autre personne** a réagi à votre message, son texte n'est plus
modifiable. Cela évite qu'un avis ou un désaccord reste attaché à un texte qui a
changé après coup. La signature peut toujours être modifiée.

Dans la feuille du message, le bouton **Modifier** est alors grisé et son libellé
donne la raison : « Modifier (verrouillé : quelqu'un y a déjà réagi) ». Votre
message signé verrouillé porte aussi un petit cadenas dans la discussion. Un
message anonyme verrouillé n'en porte pas : le cadenas le distinguerait des autres
messages anonymes.

---

## Propositions

Une idée suffisamment mûre peut devenir une proposition.

Chaque proposition possède un titre, une description facultative et peut recevoir
un vote :

- **Pour**
- **Contre**
- **Abstention**

Un seul vote est conservé par personne et par proposition. Il peut être déplacé ou
retiré.

BrainstO. affiche à la fois la répartition des avis et la participation. Par
exemple :

`3 pour · 1 contre · 2 abstentions · 75 % favorables sur 4 avis exprimés · 6 participants sur 8 ont voté`

Le pourcentage favorable est calculé uniquement parmi les avis exprimés, donc hors
abstentions, et il est toujours suivi du nombre d'avis exprimés : il ne se lit
jamais seul. Si tout le monde s'est abstenu, l'écran dit « Aucun avis exprimé » et
n'affiche pas de pourcentage. La participation reste affichée séparément pour
éviter qu'un résultat obtenu avec peu de votants ressemble à une position forte de
toute l'équipe : « 6 participants sur 8 ont voté », « 1 participant sur 8 a voté »,
« 0 participant sur 8 a voté ». Le total (le « 8 ») est le nombre de personnes
connues de l'espace, augmenté de celles qui ont voté sans y figurer : il n'est
jamais inférieur au nombre de votants. Aucun quorum n'est appliqué.

Le mot **Consensus** n'est pas utilisé pour qualifier automatiquement un vote de
proposition. Il est réservé à l'étape collective suivante.

### Statuts des propositions

Pour les nouvelles évolutions, les statuts utiles sont :

- **En vote**
- **À débattre**
- **Écartée**

Les anciennes valeurs **Retenue** et **Mise en place** peuvent encore apparaître
sur des données historiques. Elles sont signalées comme anciens statuts mais ne
sont plus proposées pour faire évoluer une proposition. BrainstO. ne suit pas la
mise en oeuvre après la réunion.

---

## Consensus

Le **Consensus** est le cap que l'équipe souhaite porter sur un sujet après la
discussion, les propositions et les votes.

Plusieurs formulations peuvent être proposées. Chacun choisit une seule
formulation ; choisir une autre déplace le vote. Celle qui reçoit le plus de choix
porte la mention **En tête**.

Le Consensus n'est pas un compte rendu et n'enregistre pas une décision prise après
la réunion. Il sert uniquement à arriver avec un cap collectif déjà préparé.

Vous pouvez modifier ou supprimer les Consensus que vous avez créés. Supprimer une
formulation supprime aussi les votes qui la visaient.

---

## Synthèse à projeter ou imprimer

Dans **Réglages → Ouvrir la synthèse**, BrainstO. rassemble les sujets non archivés,
leurs propositions, les résultats de vote et les Consensus.

Cette page sert de support de préparation à projeter ou imprimer. Elle ne constitue
pas un ordre du jour formel, un compte rendu ou un historique de réunions.

---

## Hors connexion

BrainstO. reste utilisable lorsque le réseau disparaît :

- la dernière version connue des données reste disponible ;
- les nouvelles actions sont conservées dans l'ordre sur l'appareil ;
- elles sont envoyées automatiquement lorsque la connexion revient.

L'indicateur de synchronisation distingue six états : **À jour**,
**Synchronisation**, **En attente (n)**, **Hors ligne (n)**, **Erreur (n)** et
**Mode local**. Le nombre n est celui des actions qui attendent d'être envoyées
(**Hors ligne** et **Erreur** l'omettent quand rien n'attend). Sur un écran étroit
(430 px et moins), l'indicateur affiche une forme courte (« Sync… », « Local ») ;
son nom complet reste toujours lu par le lecteur d'écran, qui n'annonce que les
changements utiles.

- **En attente (n)** : des actions n'ont pas encore été envoyées ;
- **Hors ligne (n)** : le téléphone n'a plus de réseau ;
- **Erreur (n)** : le serveur répond mal plusieurs fois de suite (par exemple un
  verrou dépassé côté Google). Un message le dit : « Le serveur ne répond pas
  correctement : vos actions sont gardées et repartiront. » Ne vous déconnectez
  pas : la déconnexion efface les actions en attente.

Une action ne quitte la file que lorsque le serveur l'a prise en compte, ou l'a
refusée de façon définitive. Dans ce dernier cas, le message « Action refusée : … »
reprend le texte saisi, pour que vous puissiez le recopier.

Tant qu'une action est en attente, BrainstO. ne prétend jamais qu'elle est déjà
synchronisée.

---

## Réglages et déconnexion

Les réglages permettent de modifier votre nom, la connexion, de revoir la
présentation initiale, d'ouvrir la synthèse et de consulter le diagnostic de
synchronisation.

**Si l'équipe change de code**, ou en pose un alors qu'elle travaillait sans code,
l'espace se verrouille avec le message « Code d'accès refusé par le serveur :
saisissez le nouveau code de l'équipe. ». Saisissez le nouveau code sur l'écran de
verrouillage : vos actions en attente sont conservées. Ne vous déconnectez pas, la
déconnexion les efface. Sans réseau, le nouveau code ne peut pas être vérifié
(« Code d'accès incorrect, ou nouveau code impossible à vérifier sans
connexion. ») : l'appareil reste verrouillé et rien n'est perdu.

**Se déconnecter de l'équipe** oublie sur cet appareil l'adresse du script, le
verrouillage, votre identité locale et la preuve de propriété de vos contenus
anonymes. Les données partagées de l'équipe restent intactes.

Si des actions sont encore en attente, elles seraient perdues lors de la
déconnexion. Attendez **À jour** avant de vous déconnecter.

---

## Bonnes pratiques

- Un sujet correspond à un point à faire mûrir.
- Citez un message lorsque votre réponse dépend de son contexte.
- Utilisez les réactions pour exprimer rapidement une position ; développez par un
  message lorsque l'argument compte.
- Transformez une idée suffisamment claire en proposition plutôt que de la laisser
  se perdre dans le fil.
- Regardez la participation en plus du rapport Pour / Contre.
- Utilisez le Consensus pour formuler le cap collectif, pas pour rédiger un compte
  rendu.
- Passez un sujet en **Prêt pour la réunion** lorsque l'équipe considère que son cap
  est suffisamment mûr.
- Archivez les sujets qui n'ont plus besoin d'occuper l'espace courant.
