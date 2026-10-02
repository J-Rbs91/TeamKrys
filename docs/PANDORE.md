# Pandore

Pandore est l'espace **anonyme et fourre-tout** de BrainstO. : employés et direction y
déposent ce qu'ils veulent dire. Idées, plaintes, questions, remarques.

Une fois par jour, les dépôts sont publiés **bruts** dans le dépôt GitHub. Une IA en
écrit une **synthèse automatique**, que l'application affiche à tous. Sur demande,
l'IA **remet ensuite Pandore à zéro** : la synthèse reste affichée jusqu'à la suivante.

Personne ne relit un dépôt dans l'application. C'est une boîte aux lettres.

> Dans ce document, « un dépôt » est ce qu'une personne a déposé dans Pandore. Le
> dépôt de code est toujours appelé « dépôt GitHub ».

---

## Le trajet d'un dépôt

```
Téléphone ── SUBMIT_IDEA, sans auteur ──▶ Apps Script
                                           │  brainsto-idees.json (Drive), à part des données
                                           ▼
       chaque jour, 04 h 17 UTC : GitHub Actions « Pandore »
                                           │  tools/pandore-collect.js
                                           ▼
       pandore/depots/AAAA-MM-JJ.md  (public, brut, ordre mélangé, sans heure)
                                           │  puis acquittement : le Drive est vidé
                                           ▼
       Claude Code : « fais la synthèse de Pandore » (ou une routine)
                                           │  .claude/skills/pandore/SKILL.md
                                           ▼
       pandore/synthese.json sur main ──▶ GitHub Pages ──▶ écran « Pandore »
                                           │
       sur demande : « remets Pandore à zéro »
                                           │  tools/pandore-reset.js
                                           ▼
       dépôts couverts supprimés de pandore/depots/ ; la synthèse reste affichée
```

| Fichier | Rôle | Écrit par |
|---|---|---|
| `brainsto-idees.json` (Drive) | dépôts reçus, pas encore collectés | le backend |
| `pandore/depots/AAAA-MM-JJ.md` | dépôts bruts, une collecte par fichier | la collecte ; vidé par la remise à zéro |
| `pandore/references.txt` | registre : la référence de chaque dépôt jamais publié | la collecte, jamais à la main |
| `pandore/synthese.json` | la synthèse automatique courante, affichée par l'application | l'IA |
| `tools/pandore-collect.js` | la collecte | — |
| `tools/pandore-check.js` | le contrôle de ce que l'IA publie (la CI le relance) | — |
| `tools/pandore-reset.js` | la remise à zéro | — |

**Noms techniques gardés.** L'action `SUBMIT_IDEA`, la capacité `ideas`, le secret
`BRAINSTO_IDEAS_SECRET` et le fichier Drive `brainsto-idees.json` datent d'avant le nom
Pandore.
- Cause : ils sont lus par le backend déjà publié.
- Conséquence : les renommer obligerait à redéployer le backend, sans rien changer pour
  l'équipe. Ils restent tels quels.

---

## La synthèse automatique

Elle couvre **tous les dépôts présents** dans `pandore/depots/`, et remplace la précédente.

- **Classement choisi par l'IA.** À chaque synthèse, l'IA choisit l'axe le plus utile
  pour ces dépôts-là : par nature (idées, plaintes, questions…), par thème, par
  destinataire, par urgence. Un seul axe à la fois. L'écran l'affiche (« Classement
  choisi par l'IA : … ») et montre les catégories dans l'ordre où l'IA les a écrites.
- **Un point par sujet.** Plusieurs dépôts qui disent la même chose forment un seul
  point. « 3 dépôts d'origine » dit le poids du sujet.
- **Une plainte reste une plainte.** Elle est synthétisée comme un constat, sans être
  adoucie. Une plainte contre l'encadrement ou la direction n'est jamais écartée : elle
  est gardée, sans nommer ni désigner personne.
- **Une alerte grave** (harcèlement, discrimination, danger, santé, sécurité) est
  synthétisée sans détail identifiant, et signalée à la personne qui a lancé la
  synthèse : elle demande une suite humaine, par les canaux prévus pour cela.
- **Trois motifs d'écart seulement** : une attaque contre une personne identifiable sans
  autre contenu, une donnée personnelle, un texte inexploitable. Jamais « hors sujet »,
  « irréaliste » ni « trop critique ».

Le contrôle refuse une source inventée, du HTML, une balise Liquid et un lien autre que
`https` ou relatif.
- Cause : le dépôt GitHub est publié par GitHub Pages sur le domaine de l'application.
- Conséquence : sans ce refus, un fichier mal écrit pourrait exécuter du code chez qui
  l'ouvre, ou faire échouer la publication du site entier.

---

## Ce que l'anonymat garantit, et ce qu'il ne garantit pas

**Garanti par le code, et testé :**

- le dépôt part sans identifiant ni nom. Le serveur **refuse** un dépôt qui en porte un ;
- le dépôt n'entre jamais dans les données de l'équipe. Il ne fait même pas avancer la
  révision : sinon chacun pourrait lire l'heure d'un dépôt ;
- le fichier Drive ne garde que le texte et une référence aléatoire : ni heure, ni appareil ;
- le fichier publié mélange les dépôts et ne porte aucune heure, seulement le jour de collecte.

**Pas garanti, et pourquoi :**

| Limite | Cause | Conséquence |
|---|---|---|
| Le **contenu** peut trahir l'auteur | le dépôt est publié tel quel | un prénom, un poste unique ou une tournure reconnaissable restent publics. L'application le dit avant le dépôt. L'IA les retire de la synthèse, pas du texte brut |
| Le **jour** de collecte est public | le nom du fichier | dans une petite équipe, « un seul dépôt ce jour-là » peut suffire à recouper |
| La personne qui **administre le script** n'est pas tenue à l'écart | elle contrôle le serveur et le Drive | l'historique des versions de `brainsto-idees.json` sur Drive montre quand le fichier a changé. Plus largement, elle pourrait modifier le code. L'anonymat protège des autres membres, pas d'elle |
| Une publication est **définitive** | dépôt GitHub public et historique Git | supprimer un fichier ne l'efface pas de l'historique, ni des copies faites entre-temps |

---

## Mise en place (une seule fois)

### 1. Le backend

Déployer le backend **1.2.0** ([`INSTALLATION.md`](INSTALLATION.md), « Mettre à jour un
backend déjà en service »). Dès ce moment, l'application accepte les dépôts. Sans les
étapes suivantes, ils s'accumulent sur le Drive : rien n'est perdu, rien n'est publié.

### 2. Le secret de collecte

Il protège la seule porte qui lit Pandore côté serveur. Sans lui, n'importe qui
connaissant l'adresse du script pourrait vider Pandore.

1. Créer une chaîne aléatoire d'au moins **24 caractères**. Par exemple, dans un
   terminal : `openssl rand -hex 24`. Ou un gestionnaire de mots de passe.
2. Apps Script → **Paramètres du projet** (roue dentée) → **Propriétés du script** →
   ajouter `BRAINSTO_IDEAS_SECRET` avec cette valeur.

Pas besoin de redéployer : le script lit la propriété à chaque appel.

**Ne jamais écrire ce secret dans le dépôt GitHub.** Il ne vit qu'à deux endroits : la
propriété du script et le secret GitHub.

### 3. Les secrets GitHub

Dépôt GitHub → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**, deux fois :

| Nom | Valeur |
|---|---|
| `BRAINSTO_SCRIPT_URL` | l'adresse du script, celle qui finit par `/exec` |
| `BRAINSTO_IDEAS_SECRET` | la même valeur qu'à l'étape 2 |

### 4. Le droit d'écrire

La collecte commite sur `main` avec le jeton fourni par GitHub Actions. Deux réglages
peuvent l'en empêcher :

- **Settings → Actions → General → Workflow permissions** : si la tâche échoue au
  `push` avec une erreur 403, choisir **Read and write permissions** ;
- une **règle de protection** de `main` qui impose une pull request refuse aussi ce
  push. Autoriser GitHub Actions à la contourner, ou retirer cette exigence.

### 5. Vérifier la mise en place

1. Faire un dépôt de test dans l'application.
2. **Actions** → **Pandore (collecte quotidienne)** → **Run workflow**.
3. Lire le journal de l'étape « Collecter les dépôts » :

| Message | Signification |
|---|---|
| `1 dépôt(s) publié(s) dans pandore/depots/…` puis `Backend vidé de 1 dépôt(s).` | tout fonctionne |
| `Rien en attente.` | aucun dépôt en attente : déposer d'abord |
| `Collecte non configurée…` | un des deux secrets GitHub manque |
| `Backend : disabled …` | propriété `BRAINSTO_IDEAS_SECRET` absente ou trop courte |
| `Backend : auth …` | les deux secrets ne sont pas identiques, ou backend antérieur à 1.2.0 protégé par un code |
| `Backend : invalid …` | backend antérieur à 1.2.0 : il ne connaît pas la collecte |
| `Réponse illisible du backend (HTTP …)` | adresse fausse : Google renvoie une page d'erreur au lieu du script |

4. Le fichier `pandore/depots/<jour>.md` apparaît sur `main`. Le dépôt de test y est.
   Il y restera dans l'historique : une publication est définitive. Choisir un texte neutre.

GitHub peut **suspendre** une tâche planifiée dans un dépôt GitHub sans activité pendant
longtemps. Si l'onglet Actions l'indique, la réactiver.

---

## Faire la synthèse

Ouvrir Claude Code sur ce dépôt GitHub et demander : **« fais la synthèse de Pandore »**.

La procédure complète est dans
[`.claude/skills/pandore/SKILL.md`](../.claude/skills/pandore/SKILL.md). En résumé, l'IA :

1. récupère `main` et liste les dépôts en attente (`node tools/pandore-check.js --en-attente`) ;
2. lit tous les dépôts présents, choisit l'axe de classement, regroupe ce qui se recoupe,
   retire ce qui identifie, garde le sens, plaintes comprises ;
3. valide (`node tools/pandore-check.js`), commite et pousse sur `main` ;
4. rend compte : axe retenu, points publiés, alertes graves, dépôts écartés.

### En routine

Une **routine** Claude Code peut écrire la synthèse seule, à intervalle fixe. La placer
**après** la collecte, par exemple le lundi à 7 h, heure de Paris. Le prompt conseillé
est dans la procédure (section « Routine planifiée »). Il interdit la remise à zéro.

La routine doit pouvoir pousser sur `main`. Sinon elle publie sur une branche, et
l'application ne voit rien avant la fusion.

---

## Remettre Pandore à zéro

Dans Claude Code : **« remets Pandore à zéro »**. Seulement sur demande : ni l'IA ni une
routine ne le font d'elles-mêmes.

**Ce que ça fait.**

- Les dépôts que la synthèse affichée couvre (synthétisés ou écartés) sont
  **supprimés** de `pandore/depots/`. Les fichiers vidés disparaissent.
- La synthèse reste affichée **telle quelle**. L'application ajoute : « Remise à zéro le
  … : ce qui a été déposé depuis figurera dans la prochaine synthèse, qui remplacera
  celle-ci. »
- La synthèse suivante remplace l'actuelle.

**Ce que ça ne fait pas.**

| Ce qui reste | Cause | Conséquence |
|---|---|---|
| Les dépôts arrivés **après** la synthèse | aucune synthèse ne les couvre encore | ils restent pour la synthèse suivante. Rien n'est perdu |
| Les dépôts encore sur le Drive | pas encore collectés | ils arriveront à la prochaine collecte |
| Le registre `pandore/references.txt` | il empêche la collecte de republier un dépôt retiré | il ne garde que des références aléatoires, aucun texte |
| Les textes retirés, dans l'**historique Git** | le dépôt GitHub est public et Git garde tout | Pandore est vide pour qui la parcourt, pas pour qui fouille l'historique |

**Garde-fous du script.** Il refuse sans rien écrire si la synthèse est invalide, vide,
déjà remise à zéro, ou ne couvre aucun dépôt présent. L'IA vérifie en plus que la
synthèse est publiée sur `main` avant de remettre à zéro : sinon des dépôts
disparaîtraient avant que quiconque en ait vu la synthèse.

---

## Retirer un dépôt publié

Exemple : un dépôt contient un numéro de téléphone.

1. Le plus simple : demander à Claude Code de l'écarter (motif `donnees-personnelles`)
   puis de remettre Pandore à zéro. À la main : supprimer le passage du fichier
   `pandore/depots/<jour>.md`, retirer sa référence des `sources` de la synthèse si elle
   la cite (`node tools/pandore-check.js` le signale), et commiter. Sa référence reste
   au registre : ne pas l'en retirer.
2. Il reste dans l'**historique Git**. L'effacer demande de réécrire l'historique de
   `main` puis de forcer le push. C'est une décision du propriétaire du dépôt GitHub :
   elle casse les copies locales des autres contributeurs.

---

## Fermer Pandore

- **Arrêter la publication** : désactiver la tâche dans l'onglet Actions. Les dépôts
  s'accumulent alors sur le Drive.
- **Arrêter les dépôts** : retirer `"ideas"` de `FEATURES` dans `apps-script/Code.gs`,
  puis redéployer. L'écran grise le dépôt ; la synthèse déjà publiée reste lisible.
