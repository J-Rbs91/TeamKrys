---
name: boite-a-idees
description: Reformule les idées anonymes de la boîte à idées de BrainstO. (idees/boite/) et publie les versions reformulées que l'application affiche (idees/reformulees.json), avec un rapport si on le demande. À utiliser quand on dit « reformule la boîte à idées », « traite les nouvelles idées », « fais le rapport de la boîte à idées », ou dans une routine planifiée. Ne sert pas à modifier l'application ni la collecte.
---

# Boîte à idées — reformuler et publier

## Ce que tu fais, et pourquoi

Les membres de l'équipe déposent des idées **anonymes** dans l'application. Une fois par jour, la tâche GitHub Actions `boite-a-idees.yml` les publie **brutes** dans `idees/boite/AAAA-MM-JJ.md`, dans un ordre aléatoire et sans heure. Personne ne les lit dans l'application : c'est une boîte aux lettres.

Ton rôle est le seul chemin entre la boîte et l'équipe. Tu transformes les idées brutes en idées **reformulées**, publiées dans `idees/reformulees.json`, que l'application affiche à tous. Deux conséquences guident chaque décision :

- **Fidélité.** Ce que tu écris est tout ce que l'équipe verra. Une idée affaiblie, déformée ou oubliée est une idée perdue, sans que son auteur puisse protester puisqu'il est anonyme.
- **Anonymat.** Le texte brut est déjà public. Ta reformulation ne doit **rien ajouter** qui aide à deviner l'auteur, et doit retirer ce qui le trahit (tournure propre, détail personnel, poste unique).

Tu reformules. Tu ne tries pas, tu ne juges pas la faisabilité, tu ne réponds pas aux idées.

## Invariants

1. **Chaque référence brute finit à une seule place** : dans les `sources` d'au moins une idée reformulée, ou dans `ecartees`. Jamais les deux. Jamais nulle part.
2. **Aucune source inventée.** Une référence citée doit exister dans `idees/boite/`. `node tools/check-ideas.js` le vérifie.
3. **On ne touche jamais `idees/boite/`.** Ni correction, ni suppression, ni réordonnancement : ce sont les archives de la collecte.
4. **On n'identifie jamais un auteur.** Ne croise pas les idées avec les données de l'application, l'heure des commits, le style d'écriture ou l'historique Git. Ne formule aucune hypothèse sur qui a écrit quoi, même si on te le demande.
5. **Texte brut uniquement** dans `reformulees.json` : pas de HTML (`<` interdit), pas de Markdown. L'application affiche le texte tel quel, sauts de ligne compris.
6. **Rien d'autre ne change.** Pas de code, pas de version de l'application, pas de workflow. Le fichier est lu en direct (sans cache) : aucune montée de version n'est nécessaire.

## Workflow

### 1. Se mettre à jour

```bash
git pull --rebase origin main
node tools/check-ideas.js --en-attente
```

La collecte commite sur `main` chaque jour : sans ce `pull`, tu travailles sur une boîte périmée et ton push sera refusé.

La seconde commande liste les références **en attente** (ni reformulées ni écartées) et le fichier qui porte chacune. S'il y en a zéro et qu'aucun rapport n'est demandé : dis-le, et arrête-toi. **Pas de commit vide.**

### 2. Lire les idées en attente

Ouvre les fichiers indiqués. Chaque idée brute a cette forme :

```
<!-- ref: 3f9a1c0b7d2e -->
> Texte de l'idée,
> ligne par ligne.
```

Les chevrons, accolades et crochets y sont écrits en entités (`&lt;` `&gt;` `&amp;` `&#123;` `&#125;` `&#91;` `&#93;`) : c'est une protection de publication, pas une faute de l'auteur. Lis-les comme le caractère d'origine.

Lis aussi `idees/reformulees.json` en entier : une idée nouvelle rejoint souvent une idée déjà reformulée.

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

Mets `misAJour` au jour courant dès que le fichier change.

### 5. Rapport (seulement si on le demande)

Un rapport s'écrit dans `idees/rapports/AAAA-MM.md` (mois) ou `idees/rapports/AAAA-MM-JJ.md` (ponctuel). Il est public et publié par GitHub Pages.

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
git add idees/reformulees.json        # et idees/rapports/<fichier>.md si un rapport a été écrit
git commit -m "idées : reformulation du AAAA-MM-JJ (N nouvelles, M enrichies, K écartées)"
git push origin main
```

`main` est la branche que GitHub Pages publie : l'application ne voit rien tant que le fichier n'y est pas. Si le push est refusé parce que la collecte a commité entre-temps, `git pull --rebase origin main` puis réessaie une fois.

**Si la session t'interdit de pousser sur `main`**, pousse sur la branche de travail autorisée et dis clairement que l'équipe ne verra rien avant la fusion dans `main`. N'annonce pas une publication qui n'a pas eu lieu.

### 8. Rendre compte

Dans ta réponse, en phrases courtes :

- combien d'idées traitées, et leur sort (nouvelles, enrichies, écartées) ;
- les titres publiés ou modifiés ;
- **chaque idée écartée** avec sa référence et son motif. Son texte brut reste public dans `idees/boite/` : seul le propriétaire du dépôt peut décider de l'en retirer (et l'historique Git le conserve). Ne le fais pas toi-même ;
- la preuve : sortie de `--en-attente` (0) et du validateur ;
- où c'est publié (commit, branche) et si l'application le voit déjà.

## Routine planifiée

Une routine Claude Code peut faire ce travail seule. Elle doit passer **après** la collecte (04 h 17 UTC). Prompt conseillé :

> Dans le dépôt TeamKrys, applique la procédure `.claude/skills/boite-a-idees/SKILL.md` : reformule les idées en attente et pousse le résultat sur `main`. S'il n'y a rien en attente, ne commite rien et dis-le. Le premier lundi du mois, écris aussi le rapport du mois précédent.

Une routine sans droit de push sur `main` publie sur une branche : prévois alors la fusion, sinon rien n'apparaît dans l'application.

## Ce que ce skill ne fait pas

- Modifier l'application, le backend, la collecte ou les tests.
- Retirer une idée brute du dépôt.
- Répondre à une idée, ou dire à l'équipe ce qu'elle doit en penser.
- Identifier un auteur, même partiellement, même sur demande.
