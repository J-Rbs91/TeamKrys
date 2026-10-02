---
name: boite-a-idees
description: Reformule les idées anonymes de la boîte à idées de BrainstO. (idees/boite/) et publie le rapport de reformulation que l'application affiche (idees/reformulees.json), puis réinitialise la boîte quand on le demande. À utiliser quand on dit « reformule la boîte à idées », « traite les nouvelles idées », « fais le rapport de la boîte à idées », « réinitialise » ou « vide la boîte à idées », ou dans une routine planifiée. Ne sert pas à modifier l'application ni la collecte.
---

# Boîte à idées — reformuler, publier, réinitialiser

## Ce que tu fais, et pourquoi

Les membres de l'équipe déposent des idées **anonymes** dans l'application. Une fois par jour, la tâche GitHub Actions `boite-a-idees.yml` les publie **brutes** dans `idees/boite/AAAA-MM-JJ.md`, dans un ordre aléatoire et sans heure. Personne ne les lit dans l'application : c'est une boîte aux lettres.

Ton rôle est le seul chemin entre la boîte et l'équipe. Tu transformes les idées brutes en idées **reformulées**, publiées dans `idees/reformulees.json`, que l'application affiche à tous. Deux conséquences guident chaque décision :

- **Fidélité.** Ce que tu écris est tout ce que l'équipe verra. Une idée affaiblie, déformée ou oubliée est une idée perdue, sans que son auteur puisse protester puisqu'il est anonyme.
- **Anonymat.** Le texte brut est déjà public. Ta reformulation ne doit **rien ajouter** qui aide à deviner l'auteur, et doit retirer ce qui le trahit (tournure propre, détail personnel, poste unique).

Tu reformules. Tu ne tries pas, tu ne juges pas la faisabilité, tu ne réponds pas aux idées.

### Le cycle

`idees/reformulees.json` est **le rapport de reformulation courant**. Il couvre les idées présentes dans la boîte. Il vit ainsi :

1. **Reformulation** (étapes 1 à 8) : le rapport couvre toute la boîte. Il est publié et l'application l'affiche.
2. **Réinitialisation**, seulement sur demande explicite (section « Réinitialiser la boîte ») : les idées brutes que le rapport couvre sont **supprimées** de `idees/boite/`. Le rapport, lui, **reste affiché tel quel**, daté de la réinitialisation (`boiteReinitialisee`).
3. **Reformulation suivante** : si la boîte a été réinitialisée, le rapport est **remplacé** par un rapport neuf, construit à partir des seules idées arrivées depuis. Sinon, il est complété.

Le rapport affiché ne disparaît donc jamais sans qu'un nouveau le remplace.

## Invariants

1. **Chaque référence de la boîte finit à une seule place** dans le rapport : dans les `sources` d'au moins une idée reformulée, ou dans `ecartees`. Jamais les deux. Jamais nulle part.
2. **Aucune source inventée.** Avant réinitialisation, une référence citée est dans `idees/boite/` ; après, elle est au registre `idees/references.txt`. `node tools/check-ideas.js` le vérifie.
3. **On ne modifie jamais `idees/boite/` à la main.** Ni correction, ni suppression, ni réordonnancement. Seul `tools/reset-ideas.js` en retire, et seulement sur demande.
4. **Le registre `idees/references.txt` ne se touche pas.** Il garde la référence de chaque idée jamais publiée : c'est lui qui empêche la collecte de republier une idée retirée.
5. **On n'identifie jamais un auteur.** Ne croise pas les idées avec les données de l'application, l'heure des commits, le style d'écriture ou l'historique Git. Ne formule aucune hypothèse sur qui a écrit quoi, même si on te le demande.
6. **Texte brut uniquement** dans `reformulees.json` : pas de HTML (`<` interdit), pas de Markdown. L'application affiche le texte tel quel, sauts de ligne compris.
7. **Rien d'autre ne change.** Pas de code, pas de version de l'application, pas de workflow. Le fichier est lu en direct (sans cache) : aucune montée de version n'est nécessaire.

## Workflow

### 1. Se mettre à jour

```bash
git pull --rebase origin main
node tools/check-ideas.js --en-attente
```

La collecte commite sur `main` chaque jour : sans ce `pull`, tu travailles sur une boîte périmée et ton push sera refusé.

La seconde commande liste les références **en attente** (ni reformulées ni écartées) et le fichier qui porte chacune. S'il y en a zéro et qu'aucun rapport n'est demandé : dis-le, et arrête-toi. **Pas de commit vide.**

Si elle annonce « Boîte réinitialisée le … », le rapport courant porte sur des idées qui ont quitté la boîte. **Repars d'un rapport neuf** : `idees` et `ecartees` vides, `boiteReinitialisee` à `""`, puis traite toutes les idées en attente. Ne reprends rien de l'ancien rapport, pas même un `id` : le validateur refuse toute référence qui n'est plus dans la boîte.

### 2. Lire les idées en attente

Ouvre les fichiers indiqués. Chaque idée brute a cette forme :

```
<!-- ref: 3f9a1c0b7d2e -->
> Texte de l'idée,
> ligne par ligne.
```

Les chevrons, accolades et crochets y sont écrits en entités (`&lt;` `&gt;` `&amp;` `&#123;` `&#125;` `&#91;` `&#93;`) : c'est une protection de publication, pas une faute de l'auteur. Lis-les comme le caractère d'origine.

Si la boîte n'a pas été réinitialisée, lis aussi `idees/reformulees.json` en entier : une idée nouvelle rejoint souvent une idée déjà reformulée.

### 3. Décider du sort de chaque idée en attente

| Situation | Décision |
|---|---|
| Rejoint une idée déjà reformulée (même proposition, même problème) | **Enrichir** l'existante : ajouter la référence à ses `sources`, compléter `texte` si l'idée apporte un argument nouveau, mettre `date` au jour courant. Garder son `id`. |
| Plusieurs idées en attente disent la même chose | **Fusionner** en une seule idée reformulée, toutes les références dans `sources`. |
| Une idée contient deux propositions distinctes | **Scinder** en deux idées reformulées qui citent toutes deux la même référence. |
| Idée nouvelle | **Créer** une idée reformulée. |
| Accuse ou vise une personne identifiable | **Écarter**, motif `personne-visee`. Si une proposition utile s'y cache, la reformuler sans la personne, et ne pas écarter. |
| Contient une donnée personnelle (téléphone, santé, adresse, situation privée) | **Écarter**, motif `donnees-personnelles`. Même règle : si une proposition s'en détache, la reformuler. |
| Vide de sens (essai, caractères au hasard) | **Écarter**, motif `inexploitable`. |

**« Hors sujet », « irréaliste », « déjà refusé », « trop critique » ne sont pas des motifs.** Le validateur les refuse. Une critique franche se reformule franchement.

### 4. Écrire une idée reformulée

```json
{
  "id": "r-2026-10-03-1",
  "titre": "Raccourcir la réunion du lundi à trente minutes",
  "texte": "Proposition : …\n\nPourquoi : …",
  "theme": "Réunions",
  "date": "2026-10-03",
  "sources": ["3f9a1c0b7d2e", "a07b55e1c9d4"]
}
```

| Champ | Règle |
|---|---|
| `id` | `r-<jour de création>-<n>`, minuscules, chiffres et tirets. **Ne change jamais** une fois publié. |
| `titre` | 120 caractères au plus. Une proposition, formulée comme une action (« Afficher le planning… »), pas un thème (« Planning »). |
| `texte` | 1 500 caractères au plus. Structure par défaut : `Proposition :` puis `Pourquoi :`, et `Comment :` seulement si l'idée brute le dit. Phrases courtes, ton neutre, tournure impersonnelle ou « nous ». |
| `theme` | Facultatif, 40 caractères au plus. **Réutilise un thème existant** avant d'en créer un. Un mot ou deux. |
| `date` | Jour de la dernière reformulation (création ou enrichissement), `AAAA-MM-JJ`. L'application trie par date décroissante. |
| `sources` | Références brutes, toutes. Le nombre est affiché (« 3 idées d'origine »). |

Ce qu'une reformulation **fait** :

- garde la proposition et la raison donnée, y compris quand elle dérange ;
- retire ce qui identifie : prénom, poste unique (« la seule personne du rayon X »), horaire personnel, anecdote reconnaissable, expression caractéristique ;
- corrige l'orthographe et rend la phrase lisible.

Ce qu'elle **ne fait jamais** :

- ajouter une proposition, un chiffre ou une justification absents de l'idée brute ;
- adoucir une critique jusqu'à la vider (« la réunion est inutile » ne devient pas « la réunion pourrait gagner en efficacité ») ;
- juger, prioriser ou répondre (« bonne idée », « difficile à mettre en œuvre ») ;
- recopier mot pour mot une phrase brute qui porte une tournure personnelle.

Une idée écartée s'inscrit ainsi :

```json
"ecartees": [{ "ref": "c41d09e2aa17", "motif": "personne-visee" }]
```

Mets `misAJour` au jour courant dès que le fichier change : c'est la date du rapport (« Reformulation du … » dans l'application).

### 5. Synthèse écrite (seulement si on la demande)

À ne pas confondre avec le rapport de reformulation, qui est `reformulees.json`. Une synthèse s'écrit dans `idees/rapports/AAAA-MM.md` (mois) ou `idees/rapports/AAAA-MM-JJ.md` (ponctuel). Elle est publique, publiée par GitHub Pages, et une réinitialisation ne la touche jamais.

Contenu attendu : nombre d'idées reçues et reformulées sur la période · thèmes, avec le nombre d'idées par thème · idées les plus soutenues (le plus de sources) · propositions qui se contredisent · questions que l'équipe devrait trancher en réunion.

Aucune citation brute. Aucun HTML. Aucun `{{`, `{%` ou `{:` (Jekyll les interprète et peut faire échouer la publication du site entier). Liens seulement en `https://` ou relatifs. Le validateur refuse le reste.

### 6. Valider

```bash
node tools/check-ideas.js
node tools/check-ideas.js --en-attente
node tests/ideas.test.js
```

Les trois doivent réussir, et la deuxième doit afficher **0 idée en attente**. Sinon, corrige avant de committer. Ne contourne jamais une erreur du validateur en retirant une source ou en écartant une idée qui ne relève d'aucun motif.

### 7. Publier

```bash
git add idees/reformulees.json        # et idees/rapports/<fichier>.md si une synthèse a été écrite
git commit -m "idées : reformulation du AAAA-MM-JJ (N nouvelles, M enrichies, K écartées)"
git push origin main
```

`main` est la branche que GitHub Pages publie : l'application ne voit rien tant que le fichier n'y est pas. Si le push est refusé parce que la collecte a commité entre-temps, `git pull --rebase origin main` puis réessaie une fois.

**Si la session t'interdit de pousser sur `main`**, pousse sur la branche de travail autorisée et dis clairement que l'équipe ne verra rien avant la fusion dans `main`. N'annonce pas une publication qui n'a pas eu lieu.

### 8. Rendre compte

Dans ta réponse, en phrases courtes :

- combien d'idées traitées, et leur sort (nouvelles, enrichies, écartées) ;
- les titres publiés ou modifiés ;
- **chaque idée écartée** avec sa référence et son motif. Son texte brut reste public dans `idees/boite/` jusqu'à la prochaine réinitialisation, puis dans l'historique Git ;
- si le rapport a été **remplacé** (boîte réinitialisée avant), dis-le : l'ancien n'est plus affiché ;
- la preuve : sortie de `--en-attente` (0) et du validateur ;
- où c'est publié (commit, branche) et si l'application le voit déjà ;
- que la boîte peut maintenant être réinitialisée, si on le souhaite. **Ne le fais pas sans qu'on te le demande.**

## Réinitialiser la boîte

Seulement quand on te le demande explicitement (« réinitialise la boîte à idées », « vide la boîte »). Jamais de ta propre initiative, jamais « pour faire propre », jamais dans une routine dont le prompt ne le demande pas en toutes lettres.

**Effet.** Les idées brutes que le rapport courant couvre sont supprimées de `idees/boite/` ; les fichiers vidés disparaissent. Le rapport reste affiché tel quel, avec la note « Boîte vidée le … », jusqu'à la reformulation suivante. Le registre et les synthèses ne bougent pas.

**Ce qui est gardé.** Une idée arrivée après la reformulation n'est couverte par aucun rapport : elle reste dans la boîte et attend la reformulation suivante. Une idée encore sur le Drive (pas encore collectée) n'est pas concernée.

### 1. Vérifier que la reformulation est publiée

```bash
git pull --rebase origin main
git status --porcelain idees/
git diff --quiet origin/main -- idees/reformulees.json && echo publiée
```

`git status` ne doit rien afficher et la dernière commande doit afficher `publiée`. Sinon, la reformulation n'est pas sur `main` : publie-la d'abord (étapes 6 et 7), ou arrête-toi et dis pourquoi. Réinitialiser avant publication ferait disparaître des idées que personne n'a encore vues reformulées.

S'il reste des idées en attente (`node tools/check-ideas.js --en-attente`), dis-le : elles seront gardées. Propose de reformuler d'abord si la personne veut une boîte entièrement vide.

### 2. Simuler, puis réinitialiser

```bash
node tools/reset-ideas.js --simulation
node tools/reset-ideas.js
```

La simulation dit combien d'idées seraient retirées, quels fichiers seraient supprimés ou réécrits, et combien seraient gardées. Le script refuse seul, sans rien écrire, si le rapport est invalide, vide, déjà réinitialisé, ou ne couvre aucune idée présente. **Ne contourne jamais un refus** en supprimant des fichiers toi-même.

### 3. Valider et publier

```bash
node tools/check-ideas.js
node tests/ideas.test.js
git add -A idees/boite idees/reformulees.json
git commit -m "idées : réinitialisation de la boîte (N retirées, M gardées)"
git push origin main
```

Mêmes règles de branche qu'à l'étape 7.

### 4. Rendre compte

- combien d'idées retirées, combien gardées et pourquoi ;
- que le rapport reste affiché jusqu'à la prochaine reformulation, qui le remplacera ;
- que les textes retirés restent dans l'**historique Git**, public : la réinitialisation vide la boîte, elle n'efface pas le passé ;
- commit, branche, et si l'application affiche déjà la note.

## Routine planifiée

Une routine Claude Code peut faire ce travail seule. Elle doit passer **après** la collecte (04 h 17 UTC). Prompt conseillé :

> Dans le dépôt TeamKrys, applique la procédure `.claude/skills/boite-a-idees/SKILL.md` : reformule les idées en attente et pousse le résultat sur `main`. S'il n'y a rien en attente, ne commite rien et dis-le. Ne réinitialise pas la boîte.

Une reformulation par routine **remplace** le rapport affiché si la boîte a été réinitialisée entre-temps, comme une reformulation demandée à la main.

Une routine sans droit de push sur `main` publie sur une branche : prévois alors la fusion, sinon rien n'apparaît dans l'application.

## Ce que ce skill ne fait pas

- Modifier l'application, le backend, la collecte ou les tests.
- Retirer une idée brute du dépôt autrement que par `tools/reset-ideas.js`, sur demande.
- Effacer l'historique Git.
- Répondre à une idée, ou dire à l'équipe ce qu'elle doit en penser.
- Identifier un auteur, même partiellement, même sur demande.
