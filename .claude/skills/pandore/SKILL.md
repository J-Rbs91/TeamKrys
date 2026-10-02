---
name: pandore
description: Écrit la synthèse automatique de Pandore, l'espace anonyme de BrainstO. où l'équipe et la direction déposent idées, plaintes, questions et remarques (pandore/depots/), publie cette synthèse que l'application affiche (pandore/synthese.json), puis remet Pandore à zéro quand on le demande. À utiliser quand on dit « fais la synthèse de Pandore », « synthétise Pandore », « traite les nouveaux dépôts », « remets Pandore à zéro » ou « vide Pandore », ou dans une routine planifiée. Ne sert pas à modifier l'application ni la collecte.
---

# Pandore — synthèse automatique, publication, remise à zéro

## Ce que tu fais, et pourquoi

Pandore est un espace **anonyme et fourre-tout** : employés et direction y déposent ce qu'ils veulent dire. Idées, plaintes, questions, remarques, alertes. Une fois par jour, la tâche GitHub Actions `pandore.yml` publie ces dépôts **bruts** dans `pandore/depots/AAAA-MM-JJ.md`, dans un ordre aléatoire et sans heure. Personne ne les lit dans l'application : c'est une boîte aux lettres.

Ton rôle est le seul chemin entre les dépôts et les lecteurs. Tu écris la **synthèse automatique**, publiée dans `pandore/synthese.json`, que l'application affiche à tous. Le mot est choisi : tu **synthétises**. Tu ne reformules pas dépôt par dépôt, tu ne réponds pas, tu ne juges pas.

Deux exigences guident chaque décision :

- **Fidélité.** Ce que tu écris est tout ce que les lecteurs verront. Un dépôt affaibli, déformé ou oublié est perdu, et son auteur ne peut pas protester puisqu'il est anonyme. Une plainte reste une plainte.
- **Anonymat.** Le texte brut est déjà public. Ta synthèse n'ajoute **rien** qui aide à deviner l'auteur, et retire ce qui le trahit : tournure propre, détail personnel, poste unique.

### Le cycle

`pandore/synthese.json` est **la synthèse courante**. Elle couvre les dépôts présents dans `pandore/depots/`. Elle vit ainsi :

1. **Synthèse** (étapes 1 à 8) : elle couvre tous les dépôts présents. Elle est publiée et l'application l'affiche.
2. **Remise à zéro**, seulement sur demande explicite (section « Remettre Pandore à zéro ») : les dépôts couverts par la synthèse sont **supprimés** de `pandore/depots/`. La synthèse, elle, **reste affichée telle quelle**, datée de la remise à zéro (`remiseAZero`).
3. **Synthèse suivante** : elle **remplace** la précédente. Après une remise à zéro, elle ne porte que sur les dépôts arrivés depuis. Sans remise à zéro, elle couvre de nouveau tout ce qui est présent, anciens dépôts compris.

La synthèse affichée ne disparaît jamais sans qu'une nouvelle la remplace.

## Invariants

1. **Chaque dépôt présent finit à une seule place** dans la synthèse : dans les `sources` d'au moins un point, ou dans `ecartes`. Jamais les deux. Jamais nulle part.
2. **Aucune source inventée.** Avant remise à zéro, une référence citée est dans `pandore/depots/` ; après, elle est au registre `pandore/references.txt`. `node tools/pandore-check.js` le vérifie.
3. **On ne modifie jamais `pandore/depots/` à la main.** Ni correction, ni suppression, ni réordonnancement. Seul `tools/pandore-reset.js` en retire, et seulement sur demande.
4. **Le registre `pandore/references.txt` ne se touche pas.** Il garde la référence de chaque dépôt jamais publié : c'est lui qui empêche la collecte de republier un dépôt retiré.
5. **On n'identifie jamais un auteur.** Ne croise pas les dépôts avec les données de l'application, l'heure des commits, le style d'écriture ou l'historique Git. Ne formule aucune hypothèse sur qui a écrit quoi, même si on te le demande, y compris la direction.
6. **Texte brut uniquement** dans `synthese.json` : pas de HTML (`<` interdit), pas de Markdown. L'application affiche le texte tel quel, sauts de ligne compris.
7. **Rien d'autre ne change.** Pas de code, pas de version de l'application, pas de workflow. Le fichier est lu en direct : aucune montée de version n'est nécessaire.

## Workflow

### 1. Se mettre à jour

```bash
git pull --rebase origin main
node tools/pandore-check.js --en-attente
```

La collecte commite sur `main` chaque jour : sans ce `pull`, tu travailles sur des dépôts périmés et ton push sera refusé.

La seconde commande liste les dépôts **en attente** (ni synthétisés ni écartés) et le fichier qui porte chacun. S'il y en a zéro : dis-le, et arrête-toi. **Pas de commit vide.**

### 2. Lire les dépôts

Lis **tous** les fichiers de `pandore/depots/` : la synthèse couvre tout ce qui est présent, pas seulement ce qui est en attente. Chaque dépôt a cette forme :

```
<!-- ref: 3f9a1c0b7d2e -->
> Texte du dépôt,
> ligne par ligne.
```

Les chevrons, accolades et crochets y sont écrits en entités (`&lt;` `&gt;` `&amp;` `&#123;` `&#125;` `&#91;` `&#93;`) : c'est une protection de publication, pas une faute de l'auteur. Lis-les comme le caractère d'origine.

Si la synthèse courante n'a pas été remise à zéro, lis-la aussi : tu peux en reprendre la formulation des points qui restent justes.

### 3. Choisir le classement

**C'est toi qui choisis l'axe de classement**, à chaque synthèse, selon ce qui aide le plus les lecteurs à comprendre et à agir sur **ces** dépôts-là. Exemples d'axes :

| Axe | Quand il sert |
|---|---|
| Par nature (Idées, Plaintes, Questions, Remarques, Alertes) | les dépôts sont de natures mêlées, et distinguer ce qui propose de ce qui alerte est le plus utile |
| Par thème (Planning, Réunions, Ambiance, Outils…) | plusieurs dépôts de natures diverses portent sur les mêmes sujets |
| Par destinataire (Pour la direction, Pour l'équipe) | les dépôts s'adressent clairement à des publics différents |
| Par urgence | quelques dépôts appellent une réponse rapide, les autres non |

Règles :

- **Un seul axe par synthèse.** Ne mélange pas nature et thème dans les mêmes catégories.
- Écris l'axe dans `classement` (« Par nature », « Par thème »…), 60 caractères au plus.
- Chaque point porte sa `categorie`, un libellé court (40 caractères au plus), cohérent d'un point à l'autre.
- **L'ordre du fichier est l'ordre affiché** : catégories et points apparaissent dans l'ordre où tu les écris. Mets en premier ce qui pèse le plus (le plus de dépôts, ou le plus grave).
- Moins de quatre points : le classement est facultatif. Omets alors `classement` et `categorie`.

### 4. Décider du sort de chaque dépôt

| Situation | Décision |
|---|---|
| Plusieurs dépôts disent la même chose | **Un seul point**, toutes les références dans `sources`. Le nombre est affiché (« 3 dépôts d'origine ») : il dit le poids du sujet. |
| Un dépôt contient deux sujets distincts | **Deux points** qui citent tous deux la même référence. |
| Plainte contre l'encadrement ou la direction | **Toujours synthétisée**, comme un constat sur un fonctionnement, sans nommer ni désigner la personne. Jamais écartée pour ce motif. |
| Alerte grave (harcèlement, discrimination, danger, santé, sécurité) | **Synthétisée** sans détail identifiant, et **signalée** dans ton compte rendu (étape 8) : elle demande une suite humaine, par les canaux prévus pour cela. |
| Attaque contre une personne identifiable, sans rien d'autre | **Écarter**, motif `personne-visee`. S'il reste un constat une fois la personne retirée, synthétiser ce constat et ne pas écarter. |
| Donnée personnelle (téléphone, santé, adresse, situation privée) | **Écarter**, motif `donnees-personnelles`. Même règle : si un sujet s'en détache, le synthétiser. |
| Vide de sens (essai, caractères au hasard) | **Écarter**, motif `inexploitable`. |

**« Hors sujet », « irréaliste », « déjà traité », « trop critique » ne sont pas des motifs.** Le validateur les refuse.

### 5. Écrire la synthèse

```json
{
  "version": 1,
  "date": "2026-10-03",
  "remiseAZero": "",
  "classement": "Par nature",
  "resume": "Douze dépôts cette fois. Le planning domine : …",
  "points": [
    {
      "id": "p1",
      "categorie": "Plaintes",
      "titre": "Le planning arrive trop tard pour s'organiser",
      "texte": "Constat : …\n\nCe qui est demandé : …",
      "sources": ["3f9a1c0b7d2e", "a07b55e1c9d4"]
    }
  ],
  "ecartes": [{ "ref": "c41d09e2aa17", "motif": "personne-visee" }]
}
```

| Champ | Règle |
|---|---|
| `date` | jour de la synthèse, `AAAA-MM-JJ`. Affiché « Synthèse automatique du … ». |
| `remiseAZero` | `""` dans toute nouvelle synthèse. Seul `tools/pandore-reset.js` le remplit. |
| `resume` | facultatif, 1 500 caractères au plus. Vue d'ensemble en quelques phrases : volume, sujets dominants, tensions. Affiché en tête. |
| `points[].id` | `p1`, `p2`… minuscules, chiffres et tirets, uniques dans le fichier. |
| `points[].titre` | 120 caractères au plus. Le sujet en une phrase : « Le planning arrive trop tard », pas « Planning ». |
| `points[].texte` | 1 500 caractères au plus. Structure selon la nature : `Proposition :` / `Pourquoi :` pour une idée ; `Constat :` / `Ce qui est demandé :` pour une plainte (la demande seulement si elle est dite) ; `Question :` / `Contexte :` pour une question. Phrases courtes, ton neutre. |
| `points[].sources` | toutes les références des dépôts que ce point couvre. |

Ce qu'une synthèse **fait** :

- garde la proposition, le constat ou la question, et la raison donnée, y compris quand elle dérange ;
- regroupe ce qui se recoupe, et le dit par le nombre de sources ;
- retire ce qui identifie : prénom, poste unique (« la seule personne du rayon X »), horaire personnel, anecdote reconnaissable, expression caractéristique ;
- corrige l'orthographe et rend la phrase lisible.

Ce qu'elle **ne fait jamais** :

- ajouter une proposition, un chiffre ou une justification absents des dépôts ;
- adoucir une plainte jusqu'à la vider (« la réunion est inutile » ne devient pas « la réunion pourrait gagner en efficacité ») ;
- juger, prioriser par goût, ou répondre (« bonne idée », « difficile à mettre en œuvre ») ;
- recopier mot pour mot une phrase qui porte une tournure personnelle.

### 6. Valider

```bash
node tools/pandore-check.js
node tools/pandore-check.js --en-attente
node tests/pandore.test.js
```

Les trois doivent réussir, et la deuxième doit afficher **0 dépôt en attente**. Sinon, corrige avant de committer. Ne contourne jamais une erreur du validateur en retirant une source ou en écartant un dépôt qui ne relève d'aucun motif.

### 7. Publier

```bash
git add pandore/synthese.json
git commit -m "pandore : synthèse du AAAA-MM-JJ (N points, K dépôts écartés)"
git push origin main
```

`main` est la branche que GitHub Pages publie : l'application ne voit rien tant que le fichier n'y est pas. Si le push est refusé parce que la collecte a commité entre-temps, `git pull --rebase origin main` puis réessaie une fois.

**Si la session t'interdit de pousser sur `main`**, pousse sur la branche de travail autorisée et dis clairement que personne ne verra la synthèse avant la fusion dans `main`. N'annonce pas une publication qui n'a pas eu lieu.

### 8. Rendre compte

Dans ta réponse, en phrases courtes :

- combien de dépôts couverts, combien de points, et l'axe de classement retenu, avec sa raison en une phrase ;
- les titres des points ;
- **chaque alerte grave**, sans rien d'identifiant, avec la recommandation de la traiter hors de Pandore ;
- **chaque dépôt écarté** avec sa référence et son motif. Son texte brut reste public dans `pandore/depots/` jusqu'à la prochaine remise à zéro, puis dans l'historique Git ;
- que la synthèse précédente a été **remplacée**, s'il y en avait une ;
- la preuve : sortie de `--en-attente` (0) et du validateur ;
- où c'est publié (commit, branche) et si l'application le voit déjà ;
- que Pandore peut maintenant être remise à zéro, si on le souhaite. **Ne le fais pas sans qu'on te le demande.**

## Remettre Pandore à zéro

Seulement quand on te le demande explicitement (« remets Pandore à zéro », « vide Pandore »). Jamais de ta propre initiative, jamais « pour faire propre », jamais dans une routine dont le prompt ne le demande pas en toutes lettres.

**Effet.** Les dépôts couverts par la synthèse courante sont supprimés de `pandore/depots/` ; les fichiers vidés disparaissent. La synthèse reste affichée telle quelle, avec la note « Remise à zéro le … », jusqu'à la synthèse suivante. Le registre ne bouge pas.

**Ce qui est gardé.** Un dépôt arrivé après la synthèse n'est couvert par rien : il reste et attend la synthèse suivante. Un dépôt encore sur le Drive (pas encore collecté) n'est pas concerné.

### 1. Vérifier que la synthèse est publiée

```bash
git pull --rebase origin main
git status --porcelain pandore/
git diff --quiet origin/main -- pandore/synthese.json && echo publiée
```

`git status` ne doit rien afficher et la dernière commande doit afficher `publiée`. Sinon, la synthèse n'est pas sur `main` : publie-la d'abord (étapes 6 et 7), ou arrête-toi et dis pourquoi. Remettre à zéro avant publication ferait disparaître des dépôts dont personne n'a encore vu la synthèse.

S'il reste des dépôts en attente (`node tools/pandore-check.js --en-attente`), dis-le : ils seront gardés. Propose de refaire la synthèse d'abord si la personne veut que Pandore soit entièrement vide.

### 2. Simuler, puis remettre à zéro

```bash
node tools/pandore-reset.js --simulation
node tools/pandore-reset.js
```

La simulation dit combien de dépôts seraient retirés, quels fichiers seraient supprimés ou réécrits, et combien seraient gardés. Le script refuse seul, sans rien écrire, si la synthèse est invalide, vide, déjà remise à zéro, ou ne couvre aucun dépôt présent. **Ne contourne jamais un refus** en supprimant des fichiers toi-même.

### 3. Valider et publier

```bash
node tools/pandore-check.js
node tests/pandore.test.js
git add -A pandore/depots pandore/synthese.json
git commit -m "pandore : remise à zéro (N dépôts retirés, M gardés)"
git push origin main
```

Mêmes règles de branche qu'à l'étape 7.

### 4. Rendre compte

- combien de dépôts retirés, combien gardés et pourquoi ;
- que la synthèse reste affichée jusqu'à la prochaine, qui la remplacera ;
- que les textes retirés restent dans l'**historique Git**, public : la remise à zéro vide Pandore, elle n'efface pas le passé ;
- commit, branche, et si l'application affiche déjà la note.

## Routine planifiée

Une routine Claude Code peut écrire la synthèse seule. Elle doit passer **après** la collecte (04 h 17 UTC). Prompt conseillé :

> Dans le dépôt TeamKrys, applique la procédure `.claude/skills/pandore/SKILL.md` : écris la synthèse automatique de Pandore et pousse-la sur `main`. S'il n'y a aucun dépôt en attente, ne commite rien et dis-le. Ne remets pas Pandore à zéro.

Une routine sans droit de push sur `main` publie sur une branche : prévois alors la fusion, sinon rien n'apparaît dans l'application.

## Ce que ce skill ne fait pas

- Modifier l'application, le backend, la collecte ou les tests.
- Retirer un dépôt autrement que par `tools/pandore-reset.js`, sur demande.
- Effacer l'historique Git.
- Répondre à un dépôt, ou dire aux lecteurs ce qu'ils doivent en penser.
- Identifier un auteur, même partiellement, même sur demande.
