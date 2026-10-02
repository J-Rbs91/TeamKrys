# Boîte à idées

Les membres déposent des idées **anonymes** dans l'application. Une fois par jour, elles
sont publiées **brutes** dans ce dépôt. Une IA les reformule dans un **rapport de
reformulation**, que l'application affiche à toute l'équipe. Sur demande, l'IA
**réinitialise** ensuite la boîte : le rapport reste affiché jusqu'à la reformulation
suivante.

Personne ne relit une idée brute dans l'application. C'est une boîte aux lettres.

---

## Le trajet d'une idée

```
Téléphone ── SUBMIT_IDEA, sans auteur ──▶ Apps Script
                                           │  brainsto-idees.json (Drive), à part des données
                                           ▼
       chaque jour, 04 h 17 UTC : GitHub Actions « Boîte à idées »
                                           │  tools/collect-ideas.js
                                           ▼
       idees/boite/AAAA-MM-JJ.md  (public, brut, ordre mélangé, sans heure)
                                           │  puis acquittement : le Drive est vidé
                                           ▼
       Claude Code : « reformule la boîte à idées » (ou une routine)
                                           │  .claude/skills/boite-a-idees/SKILL.md
                                           ▼
       idees/reformulees.json sur main ──▶ GitHub Pages ──▶ écran « Boîte à idées »
                                           │
       sur demande : « réinitialise la boîte à idées »
                                           │  tools/reset-ideas.js
                                           ▼
       idées traitées supprimées de idees/boite/ ; le rapport reste affiché
```

| Fichier | Rôle | Écrit par |
|---|---|---|
| `brainsto-idees.json` (Drive) | idées reçues, pas encore collectées | le backend |
| `idees/boite/AAAA-MM-JJ.md` | idées brutes, une collecte par fichier | la collecte ; vidé par la réinitialisation |
| `idees/references.txt` | registre : la référence de chaque idée jamais publiée | la collecte, jamais à la main |
| `idees/reformulees.json` | le rapport de reformulation courant, affiché par l'application | l'IA |
| `idees/rapports/*.md` | synthèses écrites, quand on les demande | l'IA |
| `tools/collect-ideas.js` | la collecte | — |
| `tools/check-ideas.js` | le contrôle de ce que l'IA publie (la CI le relance) | — |
| `tools/reset-ideas.js` | la réinitialisation | — |

---

## Ce que l'anonymat garantit, et ce qu'il ne garantit pas

**Garanti par le code, et testé :**

- l'action part sans identifiant ni nom. Le serveur **refuse** une idée qui en porte un ;
- l'idée n'entre jamais dans les données de l'équipe. Elle ne fait même pas avancer la
  révision : sinon chacun pourrait lire l'heure d'un dépôt ;
- le fichier Drive ne garde que le texte et une référence aléatoire : ni heure, ni appareil ;
- le fichier publié mélange les idées et ne porte aucune heure, seulement le jour de collecte.

**Pas garanti, et pourquoi :**

| Limite | Cause | Conséquence |
|---|---|---|
| Le **contenu** peut trahir l'auteur | l'idée est publiée telle quelle | un prénom, un poste unique ou une tournure reconnaissable restent publics. L'application le dit avant le dépôt. L'IA les retire de la version reformulée, pas de la version brute |
| Le **jour** de collecte est public | le nom du fichier | dans une petite équipe, « une seule idée ce jour-là » peut suffire à recouper |
| La personne qui **administre le script** n'est pas tenue à l'écart | elle contrôle le serveur et le Drive | l'historique des versions de `brainsto-idees.json` sur Drive montre quand le fichier a changé. Plus largement, elle pourrait modifier le code. L'anonymat protège des autres membres, pas d'elle |
| Une publication est **définitive** | dépôt public et historique Git | supprimer un fichier ne l'efface pas de l'historique, ni des copies faites entre-temps |

---

## Mise en place (une seule fois)

### 1. Le backend

Déployer le backend **1.2.0** ([`INSTALLATION.md`](INSTALLATION.md), « Mettre à jour un
backend déjà en service »). Dès ce moment, l'application accepte les dépôts. Sans les
étapes suivantes, les idées s'accumulent sur le Drive : rien n'est perdu, rien n'est
publié.

### 2. Le secret de collecte

Il protège la seule porte qui lit la boîte. Sans lui, n'importe qui connaissant
l'adresse du script pourrait vider la boîte.

1. Créer une chaîne aléatoire d'au moins **24 caractères**. Par exemple, dans un
   terminal : `openssl rand -hex 24`. Ou un gestionnaire de mots de passe.
2. Apps Script → **Paramètres du projet** (roue dentée) → **Propriétés du script** →
   ajouter `BRAINSTO_IDEAS_SECRET` avec cette valeur.

Pas besoin de redéployer : le script lit la propriété à chaque appel.

**Ne jamais écrire ce secret dans le dépôt.** Il ne vit qu'à deux endroits : la
propriété du script et le secret GitHub.

### 3. Les secrets GitHub

Dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository
secret**, deux fois :

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

1. Déposer une idée de test dans l'application.
2. **Actions** → **Boîte à idées (collecte quotidienne)** → **Run workflow**.
3. Lire le journal de l'étape « Collecter les idées » :

| Message | Signification |
|---|---|
| `1 idée(s) publiée(s) dans idees/boite/…` puis `Boîte vidée de 1 idée(s).` | tout fonctionne |
| `Boîte vide.` | aucune idée en attente : déposer d'abord |
| `Collecte non configurée…` | un des deux secrets GitHub manque |
| `Backend : disabled …` | propriété `BRAINSTO_IDEAS_SECRET` absente ou trop courte |
| `Backend : auth …` | les deux secrets ne sont pas identiques, ou backend antérieur à 1.2.0 protégé par un code |
| `Backend : invalid …` | backend antérieur à 1.2.0 : il ne connaît pas la collecte |
| `Réponse illisible du backend (HTTP …)` | adresse fausse : Google renvoie une page d'erreur au lieu du script |

4. Le fichier `idees/boite/<jour>.md` apparaît sur `main`. L'idée de test y est.
   Elle y restera : une publication est définitive. Choisir un texte neutre.

GitHub peut **suspendre** une tâche planifiée dans un dépôt sans activité pendant
longtemps. Si l'onglet Actions l'indique, la réactiver.

---

## Reformuler

Ouvrir Claude Code sur ce dépôt et demander : **« reformule la boîte à idées »**.

La procédure complète est dans
[`.claude/skills/boite-a-idees/SKILL.md`](../.claude/skills/boite-a-idees/SKILL.md).
En résumé, l'IA :

1. récupère `main` et liste les idées en attente (`node tools/check-ideas.js --en-attente`) ;
2. fusionne les idées proches, retire ce qui identifie, garde le sens et les critiques ;
3. écarte seulement trois cas, nommés : une personne visée, une donnée personnelle, un
   texte inexploitable. Jamais « hors sujet » ni « irréaliste » ;
4. valide (`node tools/check-ideas.js`), commite et pousse sur `main` ;
5. rend compte, et signale chaque idée écartée : son texte brut reste public, et seul le
   propriétaire du dépôt peut décider de l'en retirer.

Le contrôle refuse une source inventée, du HTML, une balise Liquid et un lien autre que
`https` ou relatif. Cause : le dépôt est publié par GitHub Pages sur le domaine de
l'application. Conséquence : un rapport mal écrit pourrait exécuter du code chez qui
l'ouvre, ou faire échouer la publication du site entier.

Si la boîte a été réinitialisée depuis le rapport affiché, la reformulation le
**remplace** par un rapport neuf, fait des seules idées arrivées depuis. Sinon, elle le
complète.

Pour une synthèse écrite en plus : **« fais la synthèse de la boîte à idées pour
septembre »**. Elle est écrite dans `idees/rapports/` et une réinitialisation ne la
touche pas.

### En routine

Une **routine** Claude Code peut le faire seule, à intervalle fixe. La placer **après**
la collecte, par exemple le lundi à 7 h, heure de Paris. Le prompt conseillé est dans la
procédure (section « Routine planifiée »).

La routine doit pouvoir pousser sur `main`. Sinon elle publie sur une branche, et
l'application ne voit rien avant la fusion.

---

## Réinitialiser la boîte

Dans Claude Code : **« réinitialise la boîte à idées »**. Seulement sur demande : ni
l'IA ni une routine ne le font d'elles-mêmes.

**Ce que ça fait.**

- Les idées brutes que le rapport affiché couvre (reformulées ou écartées) sont
  **supprimées** de `idees/boite/`. Les fichiers vidés disparaissent.
- Le rapport reste affiché **tel quel**. L'application ajoute : « Boîte vidée le … Les
  idées déposées depuis figureront dans la prochaine reformulation, qui remplacera
  celle-ci. »
- La reformulation suivante remplace le rapport.

**Ce que ça ne fait pas.**

| Ce qui reste | Cause | Conséquence |
|---|---|---|
| Les idées arrivées **après** la reformulation | aucun rapport ne les couvre encore | elles restent dans la boîte pour la reformulation suivante. Rien n'est perdu |
| Les idées encore sur le Drive | pas encore collectées | elles arriveront à la prochaine collecte |
| Le registre `idees/references.txt` | il empêche la collecte de republier une idée retirée | il ne garde que des références aléatoires, aucun texte |
| Les textes retirés, dans l'**historique Git** | le dépôt est public et Git garde tout | la boîte est vide pour qui la parcourt, pas pour qui fouille l'historique |

**Garde-fous du script.** Il refuse sans rien écrire si le rapport est invalide, vide,
déjà réinitialisé, ou ne couvre aucune idée présente. L'IA vérifie en plus que le
rapport est publié sur `main` avant de réinitialiser : sinon des idées
disparaîtraient avant que l'équipe en ait vu la version reformulée.

---

## Retirer une idée publiée

Exemple : une idée brute contient un numéro de téléphone.

1. Le plus simple : demander à Claude Code de l'écarter (motif `donnees-personnelles`)
   puis de réinitialiser la boîte. À la main : supprimer le passage du fichier
   `idees/boite/<jour>.md`, retirer sa référence des `sources` du rapport s'il la cite
   (`node tools/check-ideas.js` le signale), et commiter. Sa référence reste au
   registre : ne pas l'en retirer.
2. Il reste dans l'**historique Git**. L'effacer demande de réécrire l'historique de
   `main` puis de forcer le push. C'est une décision du propriétaire du dépôt : elle
   casse les copies locales des autres contributeurs.

---

## Fermer la boîte

- **Arrêter la publication** : désactiver la tâche dans l'onglet Actions. Les idées
  s'accumulent alors sur le Drive.
- **Arrêter les dépôts** : retirer `"ideas"` de `FEATURES` dans `apps-script/Code.gs`,
  puis redéployer. L'écran grise le dépôt ; les idées déjà reformulées restent lisibles.
