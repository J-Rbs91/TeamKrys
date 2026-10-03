# Installer BrainstO.

Trois étapes : le backend dans Google Apps Script, le site sur GitHub Pages,
puis la configuration de l'application sur chaque téléphone.

L'installation complète est faite **une seule fois**, par une personne de
l'équipe (celle dont le compte Google hébergera le fichier de données).

---

## 1. Le backend (Google Apps Script)

> Le code du backend est dans ce dépôt : [`apps-script/Code.gs`](../apps-script/Code.gs)
> et [`apps-script/appsscript.json`](../apps-script/appsscript.json). Il n'y
> contient **aucun secret** — `ACCESS_CODE` y est vide et se renseigne dans
> l'éditeur, à l'étape 4.

1. Ouvrir <https://script.google.com> avec le compte Google qui hébergera les
   données, puis **Nouveau projet**.
2. Coller le contenu de `apps-script/Code.gs` dans le fichier de code
   (remplacer entièrement `function myFunction()`).
3. Afficher le manifeste : **Paramètres du projet** → cocher « Afficher le
   fichier manifeste `appsscript.json` », puis coller
   `apps-script/appsscript.json`.
4. **Choisir le code d'accès de l'équipe** : en haut du script, renseigner la
   variable `ACCESS_CODE`. La laisser vide signifie « accès libre ».
   Ce code ne doit figurer nulle part ailleurs : ni dans un dépôt, ni dans un
   message public.
5. Sélectionner la fonction `setupProject` et l'exécuter une fois. Autoriser
   l'accès à Google Drive quand la fenêtre le demande. Cette fonction crée le
   dossier et le fichier JSON de l'équipe, et **n'écrase jamais** un fichier
   existant : la relancer est sans danger. S'il existe déjà un seul fichier
   `brainsto-data.json` sur le Drive, elle le rattache et le dit dans le journal
   d'exécution (identifiant, dossier, taille, date). S'il en existe plusieurs, elle
   n'en rattache aucun : voir « Plusieurs fichiers `brainsto-data.json` sur le
   Drive » plus bas.
6. *(recommandé)* Exécuter `runSelfTest` : la fonction vérifie que les hachages
   du serveur correspondent exactement à ceux du navigateur.
7. **Déployer** → *Nouveau déploiement* → type **Application Web** :
   - Description : `BrainstO.`
   - Exécuter en tant que : **moi**
   - Qui a accès : **tout le monde**
8. Copier l'**adresse du déploiement**, celle qui se termine par `/exec`.
   C'est elle que l'équipe saisira dans l'application.

> À chaque modification du script, il faut créer une **nouvelle version** du
> déploiement (Déployer → Gérer les déploiements → Modifier → Version : Nouvelle),
> sinon l'ancienne version continue de répondre.

---

## 1 bis. Mettre à jour un backend **déjà en service**

Cette section ne concerne que les espaces qui tournent déjà, avec des données
réelles. Le risque n'est pas le code : c'est de faire pointer le nouveau script
vers le **mauvais fichier**, ou vers aucun. L'ordre ci-dessous existe pour que
rien d'irréversible n'arrive avant la vérification.

1. **Sauvegarder d'abord, à la main.** Dans l'éditeur, exécuter `backupNow()` si
   l'ancienne version l'expose — sinon ouvrir le dossier `BrainstO.` sur Drive
   et dupliquer le fichier JSON. Ne pas sauter cette étape parce que le script
   en fait une automatiquement : la sauvegarde automatique n'a lieu qu'à la
   première écriture du nouveau code, donc *après* le point de non-retour.
2. **Noter la révision actuelle**, lisible dans l'application : Réglages →
   *Système* → *Diagnostic technique* → *Révision*. C'est le nombre à retrouver à l'étape 5.
3. Coller le nouveau `Code.gs` (et le manifeste), **sans encore déployer**.
   Renseigner `ACCESS_CODE` avec le code existant de l'équipe — le même
   qu'avant, sinon tous les téléphones seront refusés.
4. Exécuter **`diagnoseStorage()`**. Elle n'écrit rien. Le résultat s'affiche dans
   le journal d'exécution :
   - `used` : le fichier que le script utilisera **réellement** (identifiant,
     dossier, taille, date de dernière modification, révision, nombre de sujets,
     de participants et de messages) ;
   - `property` et `dataFileId` : le rattachement posé par `setupProject()`
     (propriété `BRAINSTO_FILE_ID`) et la valeur de `DATA_FILE_ID` ;
   - `candidates` : chaque fichier nommé `brainsto-data.json` trouvé sur le Drive,
     avec les mêmes champs, plus `trashed` (dans la corbeille ou non) ;
   - `warning` : un avertissement s'il existe des homonymes ou si le fichier
     utilisé est dans la corbeille, et `usedError` si aucun fichier n'a pu être
     retenu.
5. **Comparer.** Si la révision et les nombres correspondent à votre espace,
   continuer. Sinon **ne pas déployer** : renseigner `DATA_FILE_ID` en haut du
   script avec l'identifiant du bon fichier (la fonction liste les candidats
   trouvés sur le Drive) puis relancer `diagnoseStorage()`.
6. Exécuter `runSelfTest()` : hachages et noyau partagé conformes.
7. Déployer une **nouvelle version** du déploiement existant, en conservant la
   **même adresse `/exec`** — sinon chaque personne devra ressaisir l'adresse.

À la première écriture, le script dépose sur Drive, dans le dossier du fichier de
données, une copie `brainsto-data.json.avant-<version>.<date>` (`<version>` est la
valeur de `BACKEND_VERSION` du **nouveau** code). La version actuelle du backend est
`brainsto-backend-1.2.0` (épinglage des sujets, boîte à idées) : la première écriture
après son déploiement dépose donc `brainsto-data.json.avant-brainsto-backend-1.2.0.<date>`,
une seule fois par version
du backend. Les autres copies portent `manuel` (créée par
`backupNow()`) ou `avant-restauration` (créée par `restoreFromBackup`). Pour
revenir en arrière, voir « Revenir en arrière » plus bas : `restoreFromBackup`
refuse une copie qui n'a pas de liste de sujets et conserve les anonymisations
faites après la copie.

**Protégez les copies comme le fichier de données.** Une copie prise **avant** qu'un
message soit rendu anonyme contient encore le nom et l'identifiant de son auteur :
rendre le message anonyme ensuite ne réécrit pas les copies déjà déposées. Ne partagez
donc pas le dossier `BrainstO.` plus largement que le fichier de données, et
supprimez à la main les copies dont vous n'avez plus besoin (le script n'en supprime
aucune).

> **Pas besoin de synchroniser les deux déploiements.** Le frontend et le
> backend négocient leurs capacités : un téléphone resté sur l'ancienne version
> de l'application continue de fonctionner contre le nouveau script, et
> inversement. Vous pouvez donc déployer l'un puis l'autre, dans l'ordre que
> vous voulez, sans fenêtre de panne.

### Revenir en arrière

Si c'est le code qui est en cause, remettre l'ancien code. Si le fichier de
données a été abîmé, **restaurer une copie avec `restoreFromBackup`**.

Ne renommez pas la copie et ne supprimez pas le fichier fautif. Cause : le script
lit et écrit le fichier **par son identifiant** (propriété `BRAINSTO_FILE_ID`
posée par `setupProject()`), pas par son nom. Conséquence : renommer une copie en
`brainsto-data.json` ne change rien, le script continue de lire le fichier
rattaché ; et supprimer ce fichier casse le service.

1. Dans Drive, ouvrir le dossier `BrainstO.`, repérer la copie à restaurer, puis
   **Partager** → **Copier le lien** (ou **Obtenir le lien**, selon l'interface).
   L'identifiant de la copie est la suite de caractères entre `/d/` et `/view`
   dans l'adresse.
2. Dans l'éditeur Apps Script, ajouter une fonction **temporaire**. Le bouton
   **Exécuter** n'accepte pas d'argument : il faut une fonction qui appelle
   `restoreFromBackup` avec l'identifiant.

   ```js
   function restaurer() {
     restoreFromBackup("COLLER_ICI_L_IDENTIFIANT_DE_LA_COPIE");
   }
   ```

3. Sélectionner `restaurer`, cliquer sur **Exécuter**, lire le journal
   d'exécution, puis **supprimer** cette fonction temporaire.

`restoreFromBackup` travaille sous le verrou du service (les écritures des
téléphones attendent la fin) :

- elle refuse, sans rien modifier et sans créer de copie de sécurité, un
  identifiant vide ou inconnu, une copie illisible ou sans liste de sujets (un
  fichier `{}`, ou le fichier d'une autre application), ou le fichier déjà
  utilisé. Pour une copie illisible ou sans liste de sujets, le message est
  « La copie … n'est pas un fichier de données lisible : rien n'a été modifié. » ;
- elle crée d'abord une **copie de sécurité** de l'état actuel
  (`brainsto-data.json.avant-restauration.<date>`) ;
- elle écrit le contenu de la copie **dans le fichier rattaché** : le
  rattachement ne change pas ;
- elle conserve les anonymisations faites après la copie : un message qui est
  anonyme dans l'état actuel et qui était signé dans la copie reste anonyme (nom et
  identifiant de l'auteur vidés, clé de réaction de l'auteur retirée). Si le fichier
  actuel est illisible, il n'y a rien à reporter : ces anonymisations ne subsistent
  que dans la copie `avant-restauration`, qui garde le texte abîmé tel quel ;
- elle ne modifie jamais la copie restaurée : si cette copie a été prise avant qu'un
  message soit rendu anonyme, elle contient encore son auteur et reste à protéger
  comme les données (voir « Protégez les copies » plus haut) ;
- elle donne à l'état restauré une révision égale au plus grand des deux numéros
  (état actuel, copie) **plus un**. Cause : un numéro de révision ne doit jamais
  se répéter. Conséquence : un téléphone qui avait déjà ce numéro recharge l'état
  restauré, au lieu de garder l'ancien état sous **À jour** ;
- elle réunit les identifiants d'actions déjà traitées (les 5000 plus récents au
  plus) : une action annulée par la restauration n'est pas réappliquée si un
  téléphone la renvoie ;
- elle ne supprime ni ne met à la corbeille aucun fichier. Le journal le rappelle
  (« Aucun fichier supprimé. »).

**Ne jamais supprimer le fichier rattaché.** S'il est supprimé définitivement, le
service échoue (« No item with the given ID could be found ») et la dernière
révision servie est perdue : un numéro pourrait alors se répéter, et un téléphone
resté sur ce numéro garderait un état faux. Une restauration faite à la main
(renommer ou recopier un fichier) n'a pas ces garanties.

### Plusieurs fichiers `brainsto-data.json` sur le Drive

Cause : un second fichier porte ce nom (par exemple une copie renommée à la main,
comme le conseillait l'ancienne procédure de retour arrière, ou un fichier déposé
dans un autre dossier du même Drive). Conséquence : le script ne sait pas lequel
est le bon, et il ne le devine jamais.

- **Un rattachement existe** (`DATA_FILE_ID` renseigné, ou propriété
  `BRAINSTO_FILE_ID` posée par `setupProject()`) : il l'emporte. Les autres
  fichiers sont ignorés, jamais supprimés.
- **Aucun rattachement** : les lectures et les écritures échouent avec un message
  qui liste chaque fichier (identifiant, dossier, taille en octets, date de
  modification) et dit comment rattacher le bon. Les téléphones gardent leurs
  actions en file et affichent **Erreur** (avec le nombre d'actions en attente) ;
  rien n'est perdu. `setupProject()` n'en rattache aucun : il écrit la même liste
  dans le journal d'exécution.

Pour rattacher le bon : exécuter `diagnoseStorage()`, comparer la révision, les
nombres et la date de chaque candidat, copier l'identifiant du bon fichier dans
`DATA_FILE_ID` en haut du script, exécuter `setupProject()`, puis déployer une
**nouvelle version**. Ne supprimer aucun des autres fichiers avant d'avoir
vérifié leur contenu.

### Diffuser l'adresse et le code

L'adresse et le code se transmettent de la main à la main (message privé,
oral) — jamais dans un dépôt public, jamais dans une capture d'écran partagée.

**Le plus simple : le lien d'invitation.** Dans l'application, **Réglages → Inviter
des collaborateurs** prépare un message avec un lien qui ouvre BrainstO. déjà réglé
sur l'équipe. Un seul bouton, **Partager le lien d'invitation** : le téléphone propose
de lui-même SMS, mail, WhatsApp et les autres applications. Sans feuille de partage
(ordinateur, certaines fenêtres intégrées), le message est copié. La personne
invitée n'a plus qu'à saisir le code d'accès et son prénom.

- **Le code n'est pas dans le message.**
  - Cause : l'application ne garde jamais le code.
  - Conséquence : le message se termine par « Code d'accès : », à compléter avant
    l'envoi. Une équipe sans code n'a pas cette ligne.
- **L'adresse du script est dans le lien**, après le `#`.
  - Cause : cette partie d'une adresse ne quitte jamais le téléphone.
  - Conséquence : elle n'est envoyée ni à GitHub, ni aux aperçus de lien des
    messageries. Elle circule seulement dans le message.
- **Seule une adresse de script Google est acceptée** dans un lien d'invitation.
  L'application ne rejoint jamais une équipe toute seule : la personne valide, et un
  téléphone déjà réglé sur une autre équipe le dit avant de changer.
- **Limite.** Le jeton envoyé au serveur ne dépend que du code. Un faux lien vers le
  script Google d'un tiers pourrait donc recueillir ce jeton. N'ouvrez que les
  invitations reçues de la personne qui gère l'équipe, et ne publiez jamais le
  message.
- **Sur iPhone**, l'application installée ne voit rien de ce que Safari a ouvert.
  L'écran d'arrivée le dit : copier l'invitation, installer, ouvrir l'application,
  puis **Coller l'invitation**. Le champ d'adresse accepte aussi le lien entier.

Ce que l'application fait du code : elle ne l'envoie jamais tel quel, mais un
jeton calculé à partir de lui. Pour les lectures, Apps Script n'accepte que des
paramètres dans l'adresse (requête `GET`) : ce jeton figure donc dans l'adresse
des lectures vers le script, et peut apparaître dans les journaux d'exécution du
propriétaire du script. La page n'envoie son adresse à aucun autre site
(`no-referrer`) et applique une politique de sécurité du contenu. Cela reste un
secret partagé par l'équipe, pas une authentification individuelle.

---

## 2. Le site (GitHub Pages)

1. **Settings → Pages** du dépôt.
2. *Source* : **Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Attendre une minute : l'adresse publique s'affiche en haut de la page.

Rien d'autre à faire : le site est statique, il n'y a ni build ni dépendance.

---

## 3. Sur le téléphone de chaque personne

**Ordre à respecter : installer d'abord, configurer ensuite.** Cause : une
application ajoutée à l'écran d'accueil garde ses données à part de celles du
navigateur. Conséquence : ce qu'on a saisi dans le navigateur (adresse du script,
code, nom) n'y est pas retrouvé, il faudrait tout ressaisir.

1. Ouvrir l'adresse du site **dans le navigateur lui-même**. Un lien reçu dans
   WhatsApp, Instagram, Messenger, Gmail ou Teams s'ouvre dans une fenêtre
   intégrée à cette application : on n'y installe rien et le stockage peut n'y
   être que provisoire. En sortir avec le menu de la fenêtre (« Ouvrir dans
   Safari », « Ouvrir dans le navigateur » ou l'équivalent).
2. **Installer l'application** (facultatif mais recommandé) :
   - iPhone, Safari : bouton *Partager* → **Sur l'écran d'accueil** ;
   - Android, Chrome : menu ⋮ → **Installer l'application** ;
   - Android, Samsung Internet : menu ≡ → **Ajouter la page à** → **Écran
     d'accueil** ;
   - Android, Firefox : menu ⋮ → **Installer**.

   Les libellés exacts varient d'une version de navigateur à l'autre.
3. **Ouvrir l'application depuis son icône** sur l'écran d'accueil. Au premier
   lancement, dans l'application installée :
   - coller l'**adresse du script** (celle qui se termine par `/exec`) ;
   - saisir le **code d'accès** s'il y en a un ;
   - choisir son **nom**.

L'application vérifie tout de suite l'adresse et le code : un code erroné est
signalé immédiatement.

### Effacement du stockage par Safari (iPhone)

Cause : sur iPhone, Safari peut effacer ce qu'un site a enregistré (copie de
lecture, actions en attente, adresse du script, nom) après **sept jours
d'utilisation de Safari sans visite de ce site**. Une application ajoutée à
l'écran d'accueil a son propre compteur de jours d'usage : d'après la documentation
de WebKit, elle n'est pas concernée par ce délai. C'est la raison de l'ordre
ci-dessus.

Conséquence si cela arrive quand même : l'application revient à l'écran de
connexion. Il faut ressaisir l'adresse, le code et le nom. Les données de
l'équipe, sur Drive, ne sont pas touchées ; les actions qui n'avaient pas encore
été envoyées sont perdues.

---

## 4. Pandore (facultatif)

Le backend 1.2.0 accepte les dépôts dans Pandore dès son déploiement. Pour qu'ils soient
publiés puis synthétisés, il faut encore un secret de collecte (propriété du script
`BRAINSTO_IDEAS_SECRET`) et deux secrets GitHub. Tout est dans
[`PANDORE.md`](PANDORE.md), « Mise en place ». Sans cette étape, les dépôts
s'accumulent sur le Drive, dans `brainsto-idees.json` : rien n'est perdu, rien n'est
publié.

---

## Vérifier que tout fonctionne

- L'indicateur en haut à droite est un point vert plein (**À jour**). Réglages →
  Système l'écrit en toutes lettres.
- Un sujet créé sur un téléphone apparaît sur un autre en quelques secondes.
- En mode avion, l'application s'ouvre quand même et les messages écrits restent
  en file : l'indicateur affiche **Hors ligne (n)** (n est le nombre d'actions en
  attente). Au retour du réseau, elles partent toutes seules et l'indicateur
  repasse par **Synchronisation** (ou **En attente (n)**), puis **À jour**.

---

## Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Réponse illisible du serveur » | l'adresse ne finit pas par `/exec`, ou le déploiement n'est pas accessible à « tout le monde » | recopier l'adresse du déploiement, vérifier les droits |
| « Code d'accès refusé » | le code saisi ne correspond pas à `ACCESS_CODE` | vérifier le code auprès de la personne qui a installé le backend |
| « Code d'accès refusé par le serveur : saisissez le nouveau code de l'équipe. » | l'équipe a changé `ACCESS_CODE`, ou en a posé un sur un script jusque-là en accès libre | saisir le nouveau code sur l'écran de verrouillage : les actions en attente sont gardées. **Ne pas se déconnecter** : la déconnexion efface la file |
| Modifications du script sans effet | déploiement pas mis à jour | créer une **nouvelle version** du déploiement |
| L'application reste sur l'ancienne version | l'application installée est servie par le cache versionné du service worker : une publication sans montée de `CACHE_VERSION` n'atteint pas les appareils déjà installés | publier en incrémentant `APP_VERSION` **et** `CACHE_VERSION` ensemble, puis « Mettre à jour » dans le bandeau |
| Les données n'apparaissent plus | déconnexion ou changement d'adresse | Réglages → Système → Modifier l'adresse ou le code (confirmer) |
| Espace vide après une mise à jour du script | le script pointe vers un autre fichier que le vôtre | **ne rien écrire de plus** : exécuter `diagnoseStorage()`, puis renseigner `DATA_FILE_ID` avec le bon identifiant |
| « Fichier de données introuvable » | aucun fichier repérable sur ce Drive | `setupProject()` pour un espace neuf, ou `DATA_FILE_ID` pour un espace existant |
| Une erreur dit « Plusieurs fichiers « brainsto-data.json » existent et aucun n'est rattaché » | deux fichiers du même nom sur le Drive, sans rattachement | le script n'en choisit aucun : voir « Plusieurs fichiers `brainsto-data.json` sur le Drive » plus haut |
| Une personne ne voit pas les messages des autres | les deux appareils ne visent pas le même script | comparer le **Code d'espace** dans Réglages → Système : il doit être identique |
| **Erreur (n)** et le message « Le serveur ne répond pas correctement : vos actions sont gardées et repartiront. » | le script répond mal plusieurs fois de suite (verrou Drive dépassé, panne de Google Drive, plusieurs fichiers de données non rattachés, page d'erreur) | ne rien supprimer et ne pas se déconnecter : les actions restent en file et repartent toutes seules quand le script répond bien. Si cela dure, lire l'erreur dans l'éditeur (Exécutions) et exécuter `diagnoseStorage()` |
| « Action refusée : … Texte : « … » » | le script a jugé l'action invalide (par exemple, le sujet a été supprimé entre-temps) : refus définitif | l'action est retirée de la file et le message reprend le texte saisi, pour le recopier. Un ancien script, qui ne renvoie pas de code, voit son refus réessayé trois fois avant le retrait |
| « Enregistrement sur cet appareil impossible : l'envoi continue, gardez l'application ouverte. » | le téléphone a fermé ou refusé sa base locale (iPhone après un passage en arrière-plan, stockage plein) | garder l'application ouverte jusqu'à **À jour** : l'action part quand même au serveur |
| « Ce navigateur refuse d'enregistrer des données sur l'appareil : ouvrez BrainstO. dans votre navigateur habituel. » | le navigateur refuse tout stockage local : fenêtre intégrée à une application (WhatsApp, Instagram, Messenger, Gmail, Teams), cookies et données de site bloqués, ou stockage plein | ouvrir l'adresse dans Chrome ou Safari. Le message s'affiche au démarrage et reste affiché dans la carte de connexion ; tant que le stockage est refusé, « Enregistrer et continuer » ne connecte pas (rien n'est enregistré ni envoyé). Le mode local reste possible, mais rien n'y survit à un rechargement |
| « Ce navigateur ne permet pas la connexion. Ouvrez BrainstO. dans Chrome ou Safari. » | l'adresse est ouverte en `http` hors `localhost` (contexte non sécurisé), ou le navigateur n'offre pas le calcul de hachage (`crypto.subtle`) : le code d'accès ne peut pas être vérifié | ouvrir l'adresse en `https`, dans Chrome ou Safari. Le message s'affiche aussi au déverrouillage, et l'appareil reste verrouillé. Sans code d'accès, la connexion reste possible : rien n'est haché |
| « 1 action de plus de 30 jours attend : ouvrez Réglages, puis Système, pour l'envoyer. » (ou « n actions de plus de 30 jours attendent : ouvrez Réglages, puis Système, pour les envoyer. ») | une action est en file depuis plus de 30 jours (écrite hors ligne, ou avec une horloge déréglée) : l'application ne la renvoie pas en silence, et celles écrites après elle attendent derrière, pour garder l'ordre | Réglages → Système → **Envoyer quand même**, puis confirmer : les actions retenues partent dans l'ordre de la file. L'indicateur reste sur **En attente (n)** tant qu'elles ne sont pas parties. Ne pas se déconnecter : la déconnexion efface la file |

---

## Où sont les données ?

Dans **un seul fichier JSON**, sur le Google Drive du compte qui a déployé le
script. Pour en faire une copie de sauvegarde : exécuter `backupNow()` (la copie
`brainsto-data.json.manuel.<date>` est créée dans le même dossier), ou ouvrir le
dossier créé par `setupProject` et dupliquer le fichier. Pour restaurer une copie,
voir « Revenir en arrière ». Seule exception : les dépôts faits dans Pandore, gardés
dans `brainsto-idees.json` (même dossier) jusqu'à leur collecte, puis publiés dans le
dépôt GitHub ([`PANDORE.md`](PANDORE.md)). Aucune autre donnée n'est stockée ailleurs,
hormis, sur chaque appareil, une copie locale de lecture (pour le hors-ligne) et
le brouillon du message en cours d'écriture dans chaque sujet (avec son choix
« anonyme » quand il a été écrit en anonyme) et le repère de ce que l'appareil a déjà
consulté (détail dans
[`MODELE_DONNEES.md`](MODELE_DONNEES.md)), effacés par « Se déconnecter de
l'équipe ».
