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
   existant : la relancer est sans danger.
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
   *Révision*. C'est le nombre à retrouver à l'étape 5.
3. Coller le nouveau `Code.gs` (et le manifeste), **sans encore déployer**.
   Renseigner `ACCESS_CODE` avec le code existant de l'équipe — le même
   qu'avant, sinon tous les téléphones seront refusés.
4. Exécuter **`diagnoseStorage()`**. Elle n'écrit rien. Elle affiche le fichier
   que le nouveau script utilisera, sa date de dernière modification, la
   révision, le nombre de sujets, de participants et de messages.
5. **Comparer.** Si la révision et les nombres correspondent à votre espace,
   continuer. Sinon **ne pas déployer** : renseigner `DATA_FILE_ID` en haut du
   script avec l'identifiant du bon fichier (la fonction liste les candidats
   trouvés sur le Drive) puis relancer `diagnoseStorage()`.
6. Exécuter `runSelfTest()` : hachages et noyau partagé conformes.
7. Déployer une **nouvelle version** du déploiement existant, en conservant la
   **même adresse `/exec`** — sinon chaque personne devra ressaisir l'adresse.

À la première écriture, le script dépose sur Drive une copie
`brainsto-data.json.avant-<version>.<date>`. Pour revenir en arrière : remettre
l'ancien code, et si le fichier de données a été abîmé, renommer la copie en
`brainsto-data.json` après avoir écarté l'exemplaire fautif.

> **Pas besoin de synchroniser les deux déploiements.** Le frontend et le
> backend négocient leurs capacités : un téléphone resté sur l'ancienne version
> de l'application continue de fonctionner contre le nouveau script, et
> inversement. Vous pouvez donc déployer l'un puis l'autre, dans l'ordre que
> vous voulez, sans fenêtre de panne.

### Diffuser l'adresse et le code

L'adresse et le code se transmettent de la main à la main (message privé,
oral) — jamais dans un dépôt public, jamais dans une capture d'écran partagée.

---

## 2. Le site (GitHub Pages)

1. **Settings → Pages** du dépôt.
2. *Source* : **Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Attendre une minute : l'adresse publique s'affiche en haut de la page.

Rien d'autre à faire : le site est statique, il n'y a ni build ni dépendance.

---

## 3. Sur le téléphone de chaque personne

1. Ouvrir l'adresse du site.
2. **Installer l'application** (facultatif mais recommandé) :
   - iPhone (Safari) : bouton *Partager* → **Sur l'écran d'accueil** ;
   - Android (Chrome) : menu ⋮ → **Installer l'application**.
3. Au premier lancement :
   - coller l'**adresse du script** (celle qui se termine par `/exec`) ;
   - saisir le **code d'accès** s'il y en a un ;
   - choisir son **nom**.

L'application vérifie tout de suite l'adresse et le code : un code erroné est
signalé immédiatement.

---

## Vérifier que tout fonctionne

- L'indicateur en haut à droite affiche **À jour**.
- Un sujet créé sur un téléphone apparaît sur un autre en quelques secondes.
- En mode avion, l'application s'ouvre quand même, les messages écrits partent
  au retour du réseau et l'indicateur passe par **En attente (n)**.

---

## Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Réponse illisible du serveur » | l'adresse ne finit pas par `/exec`, ou le déploiement n'est pas accessible à « tout le monde » | recopier l'adresse du déploiement, vérifier les droits |
| « Code d'accès refusé » | le code saisi ne correspond pas à `ACCESS_CODE` | vérifier le code auprès de la personne qui a installé le backend |
| Modifications du script sans effet | déploiement pas mis à jour | créer une **nouvelle version** du déploiement |
| L'application reste sur l'ancienne version | cache du service worker | publier en incrémentant `APP_VERSION` **et** `CACHE_VERSION`, puis **charger deux fois** : le premier chargement installe la nouvelle version, le second l'exécute (« Mettre à jour » dans le bandeau fait le second tout de suite) |
| Le code d'accès est redemandé à chaque ouverture | l'appareil n'enregistre rien : navigation privée, ou lien ouvert dans la fenêtre in-app d'une messagerie | ouvrir l'application dans le vrai navigateur et l'installer sur l'écran d'accueil ; Réglages → **Réglages sur l'appareil** dit lequel des deux cas s'applique |
| Les données n'apparaissent plus | déconnexion ou changement d'adresse | Réglages → Modifier l'adresse ou le code |
| Espace vide après une mise à jour du script | le script pointe vers un autre fichier que le vôtre | **ne rien écrire de plus** : exécuter `diagnoseStorage()`, puis renseigner `DATA_FILE_ID` avec le bon identifiant |
| « Fichier de données introuvable » | aucun fichier repérable sur ce Drive | `setupProject()` pour un espace neuf, ou `DATA_FILE_ID` pour un espace existant |
| Une personne ne voit pas les messages des autres | les deux appareils ne visent pas le même script | comparer le **Code d'espace** dans Réglages : il doit être identique |
| « Serveur occupé, réessayez » | plusieurs écritures simultanées ont dépassé le verrou | sans gravité, l'action repart toute seule au tour suivant |

---

## Où sont les données ?

Dans **un seul fichier JSON**, sur le Google Drive du compte qui a déployé le
script. Pour en faire une copie de sauvegarde : ouvrir le dossier créé par
`setupProject` et dupliquer le fichier. Aucune donnée n'est stockée ailleurs,
hormis une copie locale de lecture sur chaque appareil (pour le hors-ligne),
effacée par « Se déconnecter de l'équipe ».
