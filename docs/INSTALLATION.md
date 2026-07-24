# Installer BrainstO.

Trois étapes : le backend dans Google Apps Script, le site sur GitHub Pages,
puis la configuration de l'application sur chaque téléphone.

L'installation complète est faite **une seule fois**, par une personne de
l'équipe (celle dont le compte Google hébergera le fichier de données).

---

## 1. Le backend (Google Apps Script)

> Le code du backend n'est **pas** dans ce dépôt, et ne doit jamais y être
> ajouté : il contient le code d'accès de l'équipe. Il vous a été fourni à part,
> sous forme de deux blocs à copier-coller (le script et son manifeste).

1. Ouvrir <https://script.google.com> avec le compte Google qui hébergera les
   données, puis **Nouveau projet**.
2. Coller le contenu du script dans le fichier de code (remplacer entièrement
   `function myFunction()`).
3. Afficher le manifeste : **Paramètres du projet** → cocher « Afficher le
   fichier manifeste `appsscript.json` », puis coller le manifeste fourni.
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
| L'application reste sur l'ancienne version | cache du service worker | publier en incrémentant `APP_VERSION` **et** `CACHE_VERSION`, puis « Mettre à jour » dans le bandeau |
| Les données n'apparaissent plus | déconnexion ou changement d'adresse | Réglages → Modifier l'adresse ou le code |

---

## Où sont les données ?

Dans **un seul fichier JSON**, sur le Google Drive du compte qui a déployé le
script. Pour en faire une copie de sauvegarde : ouvrir le dossier créé par
`setupProject` et dupliquer le fichier. Aucune donnée n'est stockée ailleurs,
hormis une copie locale de lecture sur chaque appareil (pour le hors-ligne),
effacée par « Se déconnecter de l'équipe ».
