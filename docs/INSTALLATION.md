# Installation de BrainstO.

Ce guide détaille le déploiement complet : backend Google Apps Script, puis
publication du frontend avec GitHub Pages.

---

## 1. Backend Google Apps Script

### 1.1 Créer le projet

1. Ouvrez <https://script.google.com> et connectez-vous avec le compte Google
   qui hébergera le fichier de données.
2. **Nouveau projet**.
3. Renommez-le `BrainstO.` (facultatif).

### 1.2 Copier le code

1. Dans l'éditeur, remplacez le contenu de `Code.gs` par celui de
   [`apps-script/Code.gs`](../apps-script/Code.gs).
2. Affichez le fichier manifeste : **⚙️ Paramètres du projet → cochez
   « Afficher le fichier manifeste `appsscript.json` »**.
3. Ouvrez `appsscript.json` et remplacez son contenu par celui de
   [`apps-script/appsscript.json`](../apps-script/appsscript.json).
4. Enregistrez (Ctrl/Cmd + S).

### 1.3 Créer le fichier de données

1. Dans la liste des fonctions (en haut), sélectionnez **`setupProject`**.
2. Cliquez sur **Exécuter**.
3. Une fenêtre d'autorisation apparaît :
   - **Vérifier les autorisations** → choisissez votre compte ;
   - un avertissement « Google n'a pas validé cette application » peut
     s'afficher : **Paramètres avancés → Accéder à BrainstO. (non sécurisé)** ;
   - **Autoriser** l'accès à Google Drive.
4. Relancez **`setupProject`** si nécessaire. Le journal (**Exécution →
   Journaux**) doit indiquer « Fichier créé : … ».

> `setupProject()` crée un dossier `TeamKrys` et le fichier
> `teamkrys-data.json`. Il n'écrase **jamais** un fichier existant.

### 1.4 Déployer en application Web

1. **Déployer → Nouveau déploiement**.
2. **Type** (roue crantée) → **Application Web**.
3. Réglages :
   - **Description** : `BrainstO. API` ;
   - **Exécuter en tant que** : **Moi** ;
   - **Qui a accès** : **Tout le monde**.
4. **Déployer**, autorisez si demandé.
5. Copiez l'**URL de l'application Web** (se termine par `/exec`).

> À chaque modification du code, créez un **nouveau déploiement** ou **gérez le
> déploiement existant → Modifier → Nouvelle version**, sinon l'ancienne version
> reste servie.

### 1.5 Vérifier

Ouvrez dans le navigateur `VOTRE_URL/exec?mode=revision`. Vous devez obtenir :

```json
{"revision":0,"updatedAt":"..."}
```

### 1.6 Code d'accès (optionnel mais recommandé)

Pour que l'URL seule ne suffise pas — et bloquer l'accès aux données à qui
n'a pas le code — définissez un **code d'accès** côté script.

**Méthode recommandée (`setPassword`).** Dans `Code.gs`, ouvrez la fonction
`setPassword()`, renseignez `PASSWORD` avec votre code, **exécutez-la une fois**,
puis **remettez `PASSWORD = ""`** et enregistrez. Le code n'est jamais stocké en
clair : seul son **hachage** est conservé dans les propriétés du script (privé).
Pour désactiver : exécutez `clearPassword()`.

**Méthode alternative (constante `PW_HASH`).** Vous pouvez aussi coller le
**hachage** de votre code dans la constante `PW_HASH` en haut de `Code.gs`
(laissée vide dans le dépôt). ⚠️ **Ne committez JAMAIS ce hachage dans un dépôt
public** : le hachage d'un code court (ex. 6 chiffres) se retrouve en une
seconde. Renseignez `PW_HASH` uniquement dans **votre** projet Apps Script privé,
et gardez-le vide partout ailleurs.

> Chaque collaborateur saisit le code une fois à la connexion ; il lui est
> **redemandé à chaque ouverture** (protège un téléphone égaré).

> Le code circule vers le script sous forme de **hachage** (jamais en clair) et
> n'est **jamais stocké** sur l'appareil (seul un vérificateur local l'est).
> Rappel : une application web ne peut pas être totalement inviolable sur un
> téléphone **déverrouillé** — comptez aussi sur le verrouillage d'écran du
> téléphone et n'y mettez pas de données sensibles.

Vérification : `VOTRE_URL/exec?mode=revision` doit désormais répondre
`{"ok":false,"error":"Code d'accès requis ou incorrect.","code":"auth"}`, et
`...?mode=revision&auth=LE_HACHAGE` doit répondre normalement.

---

## 2. Frontend

### 2.1 Renseigner l'URL de l'API

Deux possibilités :

**a) Depuis l'application (recommandé).** Ouvrez BrainstO. → **Réglages →
Connexion à l'équipe**, collez l'URL du script (terminant par `/exec`) dans le
champ **« URL du script »** et cliquez **« Enregistrer et connecter »**. L'URL
est conservée **uniquement dans le `localStorage` de l'appareil** (jamais dans
le dépôt) ; un test de connexion s'affiche. Chaque collaborateur le fait une
fois sur son appareil. (Priorité sur `config.js`.)

**b) Valeur par défaut pour tous** dans [`js/config.js`](../js/config.js) avant
publication :

```js
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
  POLL_INTERVAL_VISIBLE_MS: 3000,
  POLL_INTERVAL_HIDDEN_MS: 30000,
};
```

### 2.2 Tester en local

```bash
python3 -m http.server 8080
# ouvrir http://localhost:8080
```

Au premier lancement, saisissez votre prénom. L'indicateur doit passer à
« À jour ». Créez un sujet : le fichier Drive doit se remplir.

### 2.3 Publier avec GitHub Pages

1. Poussez le dépôt sur GitHub.
2. **Settings → Pages**.
3. **Source : Deploy from a branch**, branche `main`, dossier **`/ (root)`**.
4. Enregistrez ; l'URL publique apparaît après quelques instants.
5. Partagez l'URL à l'équipe.

> ⚠️ Si vous publiez **avant** de renseigner `API_URL`, l'application
> fonctionnera en mode local seulement. Renseignez l'URL puis re-poussez.

---

## 3. Mise à jour de l'application

Quand vous modifiez le code frontend :

1. Incrémentez `APP_VERSION` dans `js/config.js` **et** `CACHE_VERSION` dans
   `service-worker.js`.
2. Poussez sur GitHub.
3. Les utilisateurs verront « Une nouvelle version de BrainstO. est disponible »
   avec un bouton **Mettre à jour**. Les données locales et les actions en
   attente sont **conservées**.

---

## 4. Dépannage rapide

| Symptôme | Piste |
|---|---|
| « Projet non initialisé » | Exécutez `setupProject()`. |
| Indicateur « Mode local » | `API_URL` non renseignée dans `config.js`. |
| Erreur de synchronisation | Vérifiez `?mode=revision`, l'accès « Tout le monde », et le déploiement à jour. |
| Le service worker ne se met pas à jour | Bumpez `CACHE_VERSION`, videz le cache, rechargez. |
