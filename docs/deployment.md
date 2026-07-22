# Déploiement & contrôle d'accès

Le **contrôle d'accès principal** de TeamKrys repose sur le **déploiement de la
Web App Google Apps Script**, pas sur le chiffrement (la clé est publique — voir
[security-limits.md](./security-limits.md)).

## 1. Mettre le code dans un projet Apps Script

Le code Apps Script se trouve dans [`apps-script/`](../apps-script/) :

- `Code.js` → fichier de script (`.gs`) ;
- `appsscript.json` → manifeste ;
- `index.html`, `styles.html` → pages ;
- `js_*.html` → modules front-end **générés** depuis `js/*.js`.

> Les fichiers `js_*.html` sont générés. Après toute modification d'un module
> `js/*.js`, régénérez-les :
>
> ```bash
> npm run build
> ```

### Option A — copier-coller

Créez un projet sur <https://script.google.com>, puis recopiez chaque fichier
(les `.html` comme fichiers HTML, `Code.js` comme fichier de script, le contenu
de `appsscript.json` dans le manifeste — activez son affichage dans les
paramètres du projet).

### Option B — clasp (recommandé)

```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json   # renseignez votre scriptId
npm run build                        # (re)génère les includes
clasp push                           # pousse le contenu de apps-script/
```

`.clasp.json` pointe `rootDir` vers `apps-script/`. Ce fichier contient votre
`scriptId` privé : il est **ignoré par git** (voir `.gitignore`).

## 2. Initialiser le stockage

Dans l'éditeur Apps Script, exécutez une fois la fonction **`setupProject`**.
Elle crée le dossier privé, le fichier `teamkrys-data.enc.json` (état initial
vide déjà chiffré) et enregistre les identifiants dans `PropertiesService`.

`setupProject()` est **idempotente** : la relancer ne recrée rien et n'écrase
rien. (Une remise à zéro explicite nécessite `setupProject({ force: true })`,
à réserver à un projet vierge.)

Vérifiez ensuite avec `getApplicationStatus()` ou `healthCheck()`.

## 3. Choisir le mode d'accès (Déployer ▸ Nouveau déploiement ▸ Application web)

Deux réglages déterminent l'accès :

**Exécuter en tant que**
- *Moi* — le script accède à **votre** Drive (celui qui héberge le fichier).
  C'est le réglage attendu ici (le fichier vit sur le Drive du propriétaire).

**Qui a accès**

| Choix | Qui peut ouvrir l'app | Convient à |
|---|---|---|
| **Moi uniquement** | seulement le propriétaire | tests, usage solo |
| **Tout utilisateur Google connecté** | toute personne avec un compte Google **que vous autorisez** | équipe identifiée par compte Google |
| **Membres d'un domaine Google Workspace** *(si disponible)* | uniquement les comptes du domaine | magasin disposant d'un Workspace |
| **Tout le monde (avec le lien)** | quiconque possède l'URL | usage interne léger, confiance acceptée |

Choisissez selon les **comptes Google réellement utilisés** par les membres du
magasin.

### Si vous publiez « pour toute personne disposant du lien »

À préciser (et assumé) :

- l'**URL devient le principal moyen d'accès** ;
- la **clé étant publique, elle ne protège pas l'accès** ;
- **toute personne disposant de l'URL** peut potentiellement lire **et modifier**
  les données ;
- cette configuration convient **uniquement** à un usage interne léger, avec un
  niveau de confiance accepté.

## 4. Mettre à jour l'application

Après modification du code : `npm run build` puis `clasp push`, et créez un
**nouveau déploiement** (ou mettez à jour le déploiement existant) pour publier
la nouvelle version.
