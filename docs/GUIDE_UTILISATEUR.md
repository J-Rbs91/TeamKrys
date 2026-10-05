# BrainstO. - guide de l'équipe

BrainstO. sert à préparer les réunions **avant** la réunion. L'équipe fait remonter
les sujets au fil du travail, en discute à son rythme, transforme les idées en
propositions, se positionne par le vote puis formule un **Consensus** : le cap que
l'équipe souhaite porter sur le sujet lorsqu'il sera abordé.

BrainstO. ne gère ni l'ordre du jour, ni le compte rendu, ni le suivi des actions
après la réunion.

---

## Démarrer

**Avec un lien d'invitation** (le cas le plus courant) : ouvrez le lien reçu dans
Safari (iPhone) ou Chrome (Android). L'écran **Rejoindre l'équipe** ne demande que le
**code d'accès**, écrit dans le même message, puis votre **prénom**. L'écran donne
aussi les étapes pour installer l'application.

- Sur iPhone, l'application installée ne voit rien de ce que Safari a ouvert. Touchez
  **Copier l'invitation** avant d'installer. Ouvrez ensuite l'application depuis son
  icône et touchez **Coller l'invitation**.
- Si le téléphone fait déjà partie d'une autre équipe, l'écran le dit. **Garder mon
  équipe actuelle** ne change rien.

**Sans lien d'invitation :**

1. Ouvrir l'adresse communiquée par l'équipe **dans le navigateur** (Safari sur
   iPhone ; Chrome, Samsung Internet ou Firefox sur Android). Si le lien arrive
   dans WhatsApp, Instagram, Messenger, Gmail ou Teams, il s'ouvre dans une
   fenêtre intégrée à cette application, où l'on ne peut rien installer : en
   sortir avec le menu de la fenêtre (« Ouvrir dans le navigateur »).
2. Ajouter BrainstO. à l'**écran d'accueil** du téléphone (recommandé), puis
   ouvrir l'application depuis son icône. Les étapes, navigateur par navigateur,
   sont dans [`INSTALLATION.md`](INSTALLATION.md).
3. **Dans l'application installée**, coller l'**adresse de l'équipe** (elle se
   termine par `/exec`), ou le lien d'invitation entier, et saisir le
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

Si l'application répond « Ce navigateur refuse d'enregistrer des données sur
l'appareil : ouvrez BrainstO. dans votre navigateur habituel. » ou « Ce navigateur ne
permet pas la connexion. Ouvrez BrainstO. dans Chrome ou Safari. », ouvrez
l'adresse (en `https`) dans Chrome ou Safari. Dans le premier cas, la connexion à
l'équipe est bloquée tant que le navigateur ne peut rien enregistrer ; dans le
second, le code d'accès ne peut pas être vérifié. Le détail est dans
[`INSTALLATION.md`](INSTALLATION.md), « Problèmes fréquents ».

Le code n'est pas redemandé à chaque ouverture. Il redevient nécessaire après une
heure sans activité. Le code lui-même n'est jamais enregistré sur le téléphone.

Le bouton **Continuer sans connexion (mode local)** permet d'essayer BrainstO. seul.
Ce mode est un bac à sable : les données restent sur l'appareil et les fonctions
collectives prennent naturellement leur sens une fois connecté à l'équipe.

---

## Se déplacer

En bas de l'écran, quatre onglets : **Sujets** (la liste, l'accueil), **Réunion** (la
synthèse à projeter), **Pandore** (l'expression libre et anonyme) et **Réglages**. Dans
un sujet, la barre disparaît : le bouton retour, en haut à gauche, ramène à la liste.
Le geste retour du téléphone ramène toujours à **Sujets**, puis quitte l'application.
Pendant la saisie d'un texte, la barre s'efface pour laisser la place au clavier.

## Les sujets

Un sujet correspond à un point que l'équipe souhaite faire mûrir.

L'accueil les regroupe par état :

1. **Prêts pour la réunion**
2. **En discussion**
3. **Clôturés**
4. **Archivés**, seulement lorsqu'on demande à les afficher

Dans chaque groupe, les sujets les plus récemment actifs apparaissent en premier.

Le classement suit l'heure réelle de la dernière activité, et les sujets dont la
date est absente ou illisible passent en dernier. La carte d'un sujet dit quand il
a été actif pour la dernière fois : « Actif à l'instant », « Actif il y a 5 min »,
« Actif il y a 2 h », « Actif il y a 1 jour » ou « Actif il y a 3 jours », puis la
date (« Actif le 12/09/2026 ») à partir de sept jours.

Un sujet possède un titre obligatoire et une description facultative. Il peut être
proposé sans signature : dans « Nouveau sujet », allumez l'interrupteur **Publier en
anonyme**, le même que sous le champ de message. Aucune identité n'est alors
enregistrée dans les données partagées pour son auteur. Interrupteur éteint, le nom
est obligatoire : un nom effacé ne publie jamais en anonyme par accident.

**Clôturer** ou **archiver** un sujet (dans « Détails ») demande une confirmation :
le changement vaut pour toute l'équipe. Il se rattrape en rechoisissant le statut.

Les statuts sont :

- **En discussion** : le sujet mûrit encore ;
- **Prêt pour la réunion** : l'équipe a suffisamment travaillé le sujet pour le porter ;
- **Clôturé** : le travail préparatoire est terminé ;
- **Archivé** : le sujet quitte la vue courante sans être supprimé.

**Épingler un sujet.** Dans « Détails », **Épingler pour toute l'équipe** place le
sujet en tête de l'accueil, dans la section **Épinglés**, chez tout le monde. Tout
membre peut épingler ou désépingler. Épingler ne change pas la date d'activité du
sujet. Un sujet archivé reste dans les archives, même épinglé. La synthèse de réunion
commence aussi par les sujets épinglés. Si le serveur de l'équipe n'a pas été mis à
jour (backend 1.2.0), la commande est grisée et le dit.

Appuyer sur le titre d'un sujet, dans sa discussion, ouvre ses informations :
l'auteur (« Anonyme » pour un sujet proposé sans signature), « Créé le » et
« Dernière activité le », chacun avec la date et l'heure.

Au-delà de six sujets, la recherche apparaît. Les archives restent masquées par
défaut.

La recherche porte sur le titre et la description des sujets. Elle ignore les
majuscules, les accents et les espaces en trop : « reunion » trouve « Réunion », et
« oeuvre » trouve « œuvre » (idem pour « æ » et « ae »). Elle cherche le morceau
de texte saisi, pas ses variantes : « réunions » ne trouve pas « réunion ». Quand
rien ne correspond, l'écran rappelle le terme cherché et propose « Effacer la
recherche ».

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

**Deux gestes**, comme dans une messagerie :

- **Appui long** sur un message (une demi-seconde) : la feuille d'actions s'ouvre.
  Un simple toucher ne fait rien, pour qu'on puisse faire défiler le fil sans rien
  ouvrir par erreur.
- **Glisser un message vers la droite** : il est cité. L'aperçu « En réponse à … »
  apparaît au-dessus du champ, et le clavier s'ouvre.

Au clavier, Entrée sur un message ouvre la feuille. À la souris, un clic ou un clic
droit. Avec un lecteur d'écran, le double toucher. Un rappel de ces gestes s'affiche
au-dessus de la conversation tant que vous n'avez pas touché « Compris ».

Le texte d'un message ne se sélectionne plus au doigt : l'appui long ouvre les
actions. Utilisez **Copier le texte**.

La feuille d'un message donne accès aux actions suivantes :

| Action | Effet |
|---|---|
| Coche | D'accord |
| Vague | Mitigé |
| Croix | Pas d'accord |
| Cercle barré | À écarter |
| **Citer** | Répondre en conservant le contexte (ou glisser le message vers la droite) |
| **Explorer cette idée** | Ouvrir un espace attaché à ce message pour creuser l'idée sans encombrer la discussion (voir ci-dessous) |
| **Créer une proposition** | Transformer l'idée en option structurée |
| **Copier le texte** | Copier le message dans le presse-papiers |
| **Modifier** | Corriger votre message tant qu'il n'est pas verrouillé |
| **Rendre anonyme / Signer avec mon nom** | Modifier la signature du message. « Signer avec mon nom » demande une confirmation : votre nom devient visible de toute l'équipe, et ce qui a été vu ne se reprend pas. « Rendre anonyme » s'applique tout de suite et se défait depuis ce téléphone. |

Une personne ne peut avoir qu'une réaction par message. Appuyer à nouveau sur la
même réaction la retire.

Les cinq réactions sont dessinées par l'application sous forme de pictogrammes,
et non en emoji. Le nom de chacune est celui de la colonne « Effet » ci-dessus.

**Créer une proposition** à partir d'un message en reprend le texte : le titre est le
début du message, coupé à la fin d'un mot et terminé par « … » quand il dépasse 200
caractères, et la description reprend le message en entier dès que le titre en est
une version raccourcie. Seul le texte est repris, jamais son auteur. Les fenêtres
**Modifier** (message, sujet, formulation du consensus) s'ouvrent avec le texte
actuel, prêt à être corrigé. Si l'enregistrement est refusé (par exemple parce
qu'une autre personne vient de réagir à votre message), la fenêtre reste **ouverte**,
avec le texte que vous avez rédigé, et un message vous explique pourquoi : corrigez,
ou copiez votre texte avant d'appuyer sur **Annuler**. Cela vaut aussi pour la
fenêtre **Modifier la proposition**.

### Explorer une idée

Un message de la discussion lance parfois un échange à lui seul : précisions,
objections, variantes. **Explorer cette idée**, dans la feuille d'actions, ouvre un
espace attaché à ce message. Ce qui s'y écrit reste rattaché à l'idée, sans
s'intercaler dans la discussion du sujet.

- **En haut**, le message d'origine, rappelé tel quel. **En dessous**, les réponses
  de l'exploration, puis le champ d'écriture habituel (signé ou anonyme, comme dans
  la discussion).
- **Ouvrir ne crée rien.** Tant que personne n'a répondu, l'exploration n'existe pas
  pour les autres : rien n'apparaît dans la discussion.
- **Dans la discussion**, sous un message exploré, un lien **« 3 réponses »**
  (le nombre suit) rouvre l'exploration. Les réponses n'apparaissent pas dans le fil
  principal.
- **Un seul niveau.** On n'explore pas une réponse d'exploration : l'action n'est pas
  proposée sur ces messages. Pour creuser une réponse, citez-la.
- **Citer** dans une exploration cite le message d'origine ou une réponse. Les réactions,
  la modification, la signature et l'anonymat fonctionnent comme dans la discussion.
- **Créer une proposition** depuis une réponse d'exploration crée une proposition du
  sujet, comme depuis la discussion.
- **Revenir** : le bouton « Discussion » en haut, ou le geste retour du téléphone,
  ramène à la discussion, sur le message exploré.

Chaque exploration a son propre brouillon, distinct de celui de la discussion.

Si l'action est grisée avec la mention « le serveur de l'équipe doit être mis à
jour », la personne qui gère l'équipe doit redéployer le serveur (voir le README). Avec
la mention « disponible à la prochaine connexion au serveur de l'équipe »,
l'application attend simplement que le serveur ait répondu une première fois.

### Message en cours d'écriture

Ce que vous tapez dans le champ de message d'un sujet est gardé **sur votre
téléphone**, sans rien envoyer à personne. Le texte revient tout seul si
l'application se recharge (« Mettre à jour »), si le système la ferme en arrière-plan
puis la rouvre, ou si l'onglet est restauré. Chaque sujet a son propre brouillon, et chaque exploration aussi.
Après un verrouillage par inactivité, il est toujours là une fois le code saisi ; il
n'est jamais affiché sur l'écran de verrouillage.

Le brouillon est effacé quand le message est accepté dans la file d'envoi, quand
vous videz le champ, et quand vous vous déconnectez de l'équipe. Si le téléphone
refuse l'envoi, le texte revient dans le champ et la citation est remise.

**Signer ou publier en anonyme.** Au-dessus du champ, une ligne montre le nom que les
autres verront (« Signé : » suivi de votre prénom) et un interrupteur **Publier en
anonyme**. Allumez-le : le nom devient **Anonyme**, le bouton glisse et le fond de la
ligne se creuse. Le champ d'écriture change lui aussi, pour que vous le voyiez en
tapant : un masque à l'entrée, un bord en tirets, l'indication « Message anonyme… »,
et un petit masque sur le bouton d'envoi (lu « Envoyer en anonyme » par un lecteur
d'écran). Éteignez l'interrupteur pour signer de nouveau. Avec le mouvement réduit
activé sur l'appareil, rien ne s'anime : l'état change simplement.

**Brouillon écrit en anonyme.** Si vous écriviez en anonyme, ce choix est gardé
avec le brouillon, sur votre téléphone seulement. Au retour, le brouillon revient en
anonyme, avec la note « Brouillon retrouvé sur cet appareil. Il sera publié en
anonyme : vérifiez avant d'envoyer. » : il n'est jamais republié sous votre nom à
votre insu. Comme ce choix vaut pour tout l'écran de discussion, retrouver un
brouillon anonyme met aussi les autres sujets en anonyme, jusqu'à ce que vous
éteigniez l'interrupteur. Un brouillon écrit en **Signé** n'a aucun indicateur : il
revient signé, avec la note « Brouillon retrouvé sur cet appareil. Vérifiez « Signé »
ou « Anonyme » avant d'envoyer. ». Un appui sur l'interrupteur fait disparaître la note.

Ne sont jamais gardés : votre nom, les champs de connexion et de code, le texte des
fenêtres « Modifier » et de création. Tant qu'il n'est pas envoyé, le brouillon est
écrit en clair sur l'appareil : l'écran de verrouillage protège l'application, pas le
stockage du téléphone.

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

Dans l'onglet **Réunion**, BrainstO. rassemble les sujets non archivés,
leurs propositions, les résultats de vote et les Consensus.

Cette page sert de support de préparation à projeter ou imprimer. Elle ne constitue
pas un ordre du jour formel, un compte rendu ou un historique de réunions.

Les sujets y suivent l'ordre de l'accueil (prêts pour la réunion, en discussion,
clôturés), les plus récemment actifs d'abord dans chaque groupe. En tête de la
synthèse, alignée à droite, la pastille d'état (le point vert quand tout est à jour,
**Hors ligne (n)** ou **En attente (n)** sinon) dit si l'appareil est synchronisé ; elle n'est pas imprimée, comme les barres
et les boutons.

**Imprimer** ouvre l'impression du navigateur. Si le navigateur ne peut pas
imprimer (certaines fenêtres intégrées à une application), le message « Impression
indisponible ici : affichez la synthèse à l'écran ou ouvrez-la dans votre
navigateur. » s'affiche et la synthèse reste à l'écran. Si l'impression se lance
mais ne produit rien, l'application ne peut pas le savoir et ne dit rien : ouvrez
alors la synthèse dans le navigateur.

À l'impression, la synthèse reprend toujours les couleurs claires sur fond blanc, même
si votre appareil est en thème sombre : l'écran reste sombre, le papier ou le PDF ne
l'est jamais.

---

## Pandore

Pandore est la zone d'**expression libre et anonyme** de l'équipe et de la direction.
Ce n'est pas une discussion : on y dépose ce qu'on veut dire, une idée, une plainte,
une question, une remarque, sans attendre de réponse. On l'ouvre avec l'onglet
**Pandore**, dans la barre du bas.

**Déposer.** Écrivez votre texte, puis **Déposer anonymement**. Il part **sans nom ni
identifiant**, même si vous signez vos messages ailleurs. C'est une boîte aux lettres :
personne ne relit un dépôt dans l'application, pas même vous, et il ne se retire pas.

**Ce que deviennent les dépôts.**

1. Une fois par jour, ils sont publiés **tels quels** sur le GitHub public du projet
   (dossier `pandore/depots/`), dans un ordre mélangé et sans heure. N'y mettez donc
   **aucun nom ni rien de confidentiel**.
2. Une IA en écrit ensuite une **synthèse automatique** : sujets proches regroupés,
   détails qui trahiraient l'auteur retirés, sens conservé, plaintes comprises.
3. La synthèse s'affiche sous le champ de dépôt, **pour tous**. L'IA choisit comment la
   classer (par nature, par thème…) et l'écran l'indique. « 3 dépôts d'origine »
   signifie que trois dépôts disaient la même chose.

Un dépôt n'apparaît donc pas tout de suite : il faut la collecte du jour, puis le
passage de l'IA.

Ce qui s'affiche est **la dernière synthèse automatique**, datée (« Synthèse
automatique du … »). Quand Pandore a été remise à zéro après cette synthèse, une note
le dit : la synthèse reste affichée, et ce qui a été déposé depuis figurera dans la
suivante, qui la remplacera.

En mode local, ou si le serveur de l'équipe n'a pas été mis à jour (backend 1.2.0), le
dépôt est grisé et l'écran dit pourquoi. La lecture de la synthèse fonctionne quand même.

---

## Hors connexion

BrainstO. reste utilisable lorsque le réseau disparaît :

- la dernière version connue des données reste disponible ;
- les nouvelles actions sont conservées dans l'ordre sur l'appareil ;
- elles sont envoyées automatiquement lorsque la connexion revient.

L'indicateur de synchronisation distingue six états : **À jour**,
**Synchronisation**, **En attente (n)**, **Hors ligne (n)**, **Erreur (n)** et
**Mode local**. Le nombre n est celui des actions qui attendent d'être envoyées
(**Hors ligne** et **Erreur** l'omettent quand rien n'attend).

Dans la barre du haut, **À jour** et **Synchronisation** se réduisent à un point :
vert et plein quand tout est à jour, un anneau qui pulse pendant une synchronisation.
Les autres états gardent leurs mots, parce qu'ils demandent votre attention. Sur un
écran étroit (430 px et moins), ils s'affichent en forme courte (« Local »). Le nom
complet de l'état reste toujours lu par le lecteur d'écran, qui n'annonce que les
changements utiles. Réglages → Système affiche l'état en toutes lettres.

- **En attente (n)** : des actions n'ont pas encore été envoyées ;
- **Hors ligne (n)** : le téléphone n'a plus de réseau ;
- **Erreur (n)** : le serveur répond mal plusieurs fois de suite (par exemple un
  verrou dépassé côté Google). Un message le dit : « Le serveur ne répond pas
  correctement : vos actions sont gardées et repartiront. » Ne vous déconnectez
  pas : la déconnexion efface les actions en attente.

Au démarrage, dès que le cycle de synchronisation s'ouvre (la file d'actions est
alors relue sur l'appareil, ce qui peut prendre quelques secondes), l'indicateur
est un anneau qui pulse (**Synchronisation**), jamais le point plein de **À jour**. Avec des actions en attente et un
serveur qui ne répond pas, il affiche **En attente (n)**, jamais **À jour**.

Une action ne quitte la file que lorsque le serveur l'a prise en compte, ou l'a
refusée de façon définitive. Dans ce dernier cas, le message « Action refusée : … »
reprend le texte saisi, pour que vous puissiez le recopier.

Une action restée en file plus de 30 jours (écrite hors ligne, ou avec une horloge
déréglée) n'est jamais renvoyée en silence : elle est **retenue**, et celles que
vous avez écrites après elle attendent derrière, pour garder l'ordre. Un message le
dit une fois par session : « 1 action de plus de 30 jours attend : ouvrez Réglages,
puis Système, pour l'envoyer. » **Réglages** le rappelle sur la carte **Système**.
Dans **Système**, un bloc dit « 1 action de plus de 30 jours attend sur cet
appareil. » (« 2 actions de plus de 30 jours attendent sur cet appareil. » au
pluriel) et propose le bouton **Envoyer quand même**. Une confirmation rappelle
qu'une action ancienne peut défaire un choix plus récent de l'équipe. Une fois
confirmé, les actions retenues partent dans l'ordre de la file, et un message le
confirme (« 1 action va partir. », « 2 actions vont partir. »). **Annuler** n'envoie
rien. Le bloc n'existe que lorsqu'au moins une action est retenue. Si l'envoi ne peut pas être lancé,
« L'envoi n'a pas pu être lancé : vos actions restent sur cet appareil. » s'affiche
et rien n'est perdu. Si l'application se ferme avant l'envoi, ces actions sont
retenues de nouveau au démarrage suivant.

Sur un appareil connecté qui n'a pas encore reçu les données de l'équipe (juste
après la connexion, avant le premier échange réussi), un lien vers un sujet affiche
« Contenu pas encore disponible sur cet appareil » et « Il s'affichera à la
prochaine connexion. », au lieu d'« Introuvable ». Dès que l'appareil a reçu les
données une fois, un sujet qui n'existe plus affiche « Introuvable ».

Tant qu'une action est en attente, BrainstO. ne prétend jamais qu'elle est déjà
synchronisée.

---

## Réglages et déconnexion

Les réglages ont deux niveaux, pour éviter les fausses manœuvres.

**Réglages** (l'onglet) contient ce qui sert à chacun, sans risque : votre nom, la
synthèse de **Réunion**, l'invitation des collaborateurs et la présentation, à revoir.
Rien n'y coupe l'appareil de l'équipe.

**Système** (en bas des Réglages) contient la connexion et la synchronisation. On n'y
va que pour dépanner. Aucun mot de passe n'en garde l'entrée, mais **chaque action y
demande une confirmation** qui dit son effet : **Synchroniser maintenant**, **Modifier
l'adresse ou le code**, **Envoyer quand même** et **Se déconnecter de l'équipe**.
**Annuler** ne change rien. Le **code d'espace**, à comparer d'un téléphone à l'autre,
est affiché avec la connexion. Le détail technique (révision, rythme, stockage,
version) est replié sous **Diagnostic technique** ; l'ouvrir ne change rien. La
dernière erreur de synchronisation, elle, reste toujours visible. Le bouton retour
ramène aux Réglages.

**Inviter des collaborateurs.** Un seul bouton : **Partager le lien d'invitation**. Le
téléphone propose de lui-même les applications possibles (SMS, mail, WhatsApp…), avec
un message déjà écrit qui contient le lien. Sans feuille de partage (ordinateur,
certaines fenêtres intégrées), le message est copié : collez-le où vous voulez. Si
l'équipe a un code d'accès, le message se termine par « Code d'accès : ». Ajoutez-y le
code avant d'envoyer : l'application ne le connaît pas. Quiconque reçoit le lien et le
code peut rejoindre l'équipe : envoyez-les seulement aux personnes concernées.

**Si l'équipe change de code**, ou en pose un alors qu'elle travaillait sans code,
l'espace se verrouille avec le message « Code d'accès refusé par le serveur :
saisissez le nouveau code de l'équipe. ». Saisissez le nouveau code sur l'écran de
verrouillage : vos actions en attente sont conservées. Ne vous déconnectez pas, la
déconnexion les efface. Sans réseau, le nouveau code ne peut pas être vérifié
(« Code d'accès incorrect, ou nouveau code impossible à vérifier sans
connexion. ») : l'appareil reste verrouillé et rien n'est perdu.

**Se déconnecter de l'équipe** (dans Système) oublie sur cet appareil l'adresse de l'équipe, le
verrouillage, votre identité locale et la preuve de propriété de vos contenus
anonymes, ainsi que vos brouillons de messages (avec leur choix « anonyme ») et le
repère de ce que l'appareil avait déjà consulté : la personne qui se connecte ensuite
voit les nouveautés comme neuves. Le verrouillage d'inactivité d'une heure, lui, garde
ce repère et vos brouillons : c'est la même personne après le code. Les données
partagées de l'équipe restent intactes.

Si des actions sont encore en attente, elles seraient perdues lors de la
déconnexion. Attendez **À jour** avant de vous déconnecter.

---

## Lecteur d'écran, clavier et confort d'affichage

- **Titre d'écran.** Chaque écran a un titre, lu par le lecteur d'écran et repris
  dans l'onglet du navigateur : « Sujets - BrainstO. », « *titre du sujet* -
  BrainstO. », « Propositions : *titre du sujet* - BrainstO. », « Consensus : *titre
  du sujet* - BrainstO. », « Réglages - BrainstO. », « Synthèse de réunion -
  BrainstO. ». Avant la connexion : « Connexion - BrainstO. » et « Votre nom -
  BrainstO. ». Quand l'espace est verrouillé : « Espace verrouillé - BrainstO. » (le
  titre d'un sujet ne reste pas dans l'onglet).
- **Champs.** Chaque champ de saisie a un nom lu par le lecteur d'écran, avec son
  indication : « Votre nom », dans « Nouveau sujet », annonce « Laissez vide pour
  publier ce sujet en anonyme : aucune identité ne sera enregistrée. »
- **Erreurs de saisie.** Quand une saisie est refusée (titre de sujet vide, code
  d'accès incorrect, adresse manquante), un message apparaît sous le champ, lu avec
  lui, et le curseur y revient. Le message passager habituel reste affiché et
  annoncé. Le message sous le champ disparaît dès la première frappe.
- **Clavier.** Tab reste dans une feuille ou une fenêtre ouverte : après la dernière
  commande, il revient à la première ; Maj + Tab fait l'inverse. Échap la ferme et
  rend le focus au bouton qui l'avait ouverte. Le fond ne défile pas et ne reçoit pas
  le focus tant qu'elle est ouverte.
- **Animations réduites.** Quand le système demande de réduire les animations,
  « Aller au message cité » défile instantanément au lieu de glisser.
- **Écran étroit ou grand texte.** Sous 22 rem de large (352 px à la taille de texte
  normale, plus quand le texte est agrandi), le bouton retour se réduit à sa flèche ;
  son nom (« Retour vers Sujets ») reste lu par le lecteur d'écran. À 440 px de large
  et moins, les icônes des étapes du parcours (Discussion, Propositions, Consensus)
  sont masquées : le mot et le compteur restent, et le compteur disparaît à son tour
  à 350 px et moins. Les mots du parcours ne sont jamais coupés, ni par des points de
  suspension ni en plein mot : quand le texte est agrandi (130 % et 200 %) ou que
  l'écran est très étroit (320 px), une étape qui ne tient plus passe à la ligne et le
  parcours prend **deux lignes**, ce qui laisse un peu moins de place au fil.
- **Écran bas** (téléphone en paysage, clavier ouvert). Sous 480 px de hauteur, les
  barres du haut ne restent plus collées en haut de l'écran, et le champ d'envoi ne
  grandit que jusqu'à environ un quart de la hauteur, puis défile : le bouton d'envoi
  reste visible. Sous 300 px de hauteur, le parcours est masqué. À fort zoom, les
  barres occupent encore une bonne part de l'écran de discussion.
- **Grand écran.** Sur l'accueil, à partir de 900 px de large, les groupes de sujets
  s'empilent sur toute la largeur et leurs cartes se répartissent en colonnes.
- **Noms et compteurs lus.** Le bouton flottant de l'accueil est nommé « Nouveau
  sujet » pour le lecteur d'écran, comme à l'écran. Sur une carte de sujet, chaque
  compteur est lu avec son unité : « 1 message », « 2 propositions », « 3
  formulations », et non « 1 2 3 ».
- **Nouvelle version.** Quand une nouvelle version est prête, le bandeau « Une
  nouvelle version est disponible. » propose **Mettre à jour**, ou une croix nommée
  « Plus tard ». Son apparition est annoncée une seule fois au lecteur d'écran, par la
  zone d'annonces de l'écran, sans fenêtre ni message en plus ; il reste atteignable au
  clavier.

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
