# Installation de TeamKrys

Ce guide détaille le déploiement complet : backend Google Apps Script, puis
publication du frontend avec GitHub Pages.

---

## 1. Backend Google Apps Script

### 1.1 Créer le projet

1. Ouvrez <https://script.google.com> et connectez-vous avec le compte Google
   qui hébergera le fichier de données.
2. **Nouveau projet**.
3. Renommez-le `TeamKrys` (facultatif).

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
     s'afficher : **Paramètres avancés → Accéder à TeamKrys (non sécurisé)** ;
   - **Autoriser** l'accès à Google Drive.
4. Relancez **`setupProject`** si nécessaire. Le journal (**Exécution →
   Journaux**) doit indiquer « Fichier créé : … ».

> `setupProject()` crée un dossier `TeamKrys`, le fichier
> `teamkrys-data.json` **et** le classeur Google Sheets `TeamKrys — IA (Gemini)`
> qui sert d'atelier à Gemini. Il n'écrase **jamais** un fichier existant.
> Le journal affiche l'URL du classeur créé.

> Le manifeste [`appsscript.json`](../apps-script/appsscript.json) déclare
> désormais **deux** autorisations : Google Drive **et** Google Sheets. Lors de
> la première exécution de `setupProject()`, acceptez les deux.

### 1.4 Déployer en application Web

1. **Déployer → Nouveau déploiement**.
2. **Type** (roue crantée) → **Application Web**.
3. Réglages :
   - **Description** : `TeamKrys API` ;
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

---

## 2. Frontend

### 2.1 Renseigner l'URL de l'API

Deux possibilités :

**a) Depuis l'application (recommandé).** Ouvrez TeamKrys → **Paramètres →
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

## 2bis. Gemini dans Google Sheets (résumés & conclusions)

TeamKrys délègue à **Gemini** deux tâches, réalisées **dans le classeur Google
Sheets** créé par `setupProject()` :

- **Résumé** : le point de vue de chaque collaborateur, à partir de ses messages.
- **Conclusion** : le regroupement et la reformulation des propositions du débat
  en 2 à 4 conclusions, ensuite **votables** dans l'application.

### Comment ça marche

1. Depuis un sujet, l'utilisateur ouvre **Résumé** ou **Conclusion**, puis clique
   **« Générer avec Gemini »**.
2. Le backend recopie les données du sujet dans un onglet dédié du classeur
   (`TK <identifiant du sujet>`) et y insère des formules **`=AI(...)`** — la
   fonction Gemini native de Google Sheets.
3. Google Sheets calcule les réponses **de son côté** (ce n'est pas instantané).
4. L'utilisateur clique **« ↻ Rafraîchir »** : le backend relit les cellules
   calculées et réinjecte les résultats dans le JSON (résumés, conclusions).

### Pré-requis Gemini

- La fonction **`=AI()`** de Google Sheets doit être **disponible et activée**
  pour le compte Google qui exécute le script (offre Google Workspace incluant
  Gemini, ou activation de « Gemini dans Google Workspace »). Aucune clé API
  n'est nécessaire : tout passe par la feuille.
- Si `=AI()` n'est pas disponible, les cellules restent vides ou en erreur ;
  l'application affiche alors « Gemini calcule encore… ». Vérifiez l'accès à
  Gemini pour Sheets sur le compte du script.
- Le classeur peut être ouvert manuellement (URL dans le journal de
  `setupProject()`) pour observer le travail de Gemini.

> Les onglets `TK …` sont recyclés automatiquement au-delà de 40 sujets. Les
> résultats, eux, sont **figés dans le JSON** au moment du rafraîchissement : ils
> ne dépendent plus de la feuille ensuite.

---

## 3. Mise à jour de l'application

Quand vous modifiez le code frontend :

1. Incrémentez `APP_VERSION` dans `js/config.js` **et** `CACHE_VERSION` dans
   `service-worker.js`.
2. Poussez sur GitHub.
3. Les utilisateurs verront « Une nouvelle version de TeamKrys est disponible »
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
| Gemini reste « en cours » | La fonction `=AI()` n'est pas active pour le compte, ou le calcul n'est pas fini : réessayez « Rafraîchir » après quelques instants ; ouvrez le classeur pour vérifier. |
| « Autorisation requise » après mise à jour du code | Le scope Sheets a été ajouté : relancez `setupProject()` et acceptez les autorisations Drive **et** Sheets. |
