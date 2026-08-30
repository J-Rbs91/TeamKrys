# BrainstO. — roadmap produit

Cette roadmap applique la doctrine définie dans `docs/PRODUCT_DOCTRINE.md`.

Elle ne cherche pas à élargir BrainstO. à la gestion des réunions ou au suivi d'exécution. Elle vise à rendre plus lisible et plus efficace le parcours existant :

> Sujet → Discussion → Propositions → Votes → Consensus → Prêt pour la réunion

---

## Priorité 0 — rétablir les garde-fous de modification métier

### P0.1 — Restaurer la parité frontend/backend dans le dépôt

Le frontend indique que `js/state.js` doit rester strictement équivalent au backend Apps Script, et `tests/parity.test.js` est conçu pour vérifier cette parité. Or `apps-script/Code.gs` n'est actuellement pas présent sur `main`, ce qui empêche de sécuriser les changements qui touchent le protocole ou les statuts.

**Objectif :** remettre le backend versionné ou rétablir un autre mécanisme de parité exécutable avant toute modification du schéma partagé.

**Critères de sortie :**

- le backend de référence est versionné sans secret ;
- `node tests/parity.test.js` peut s'exécuter jusqu'au bout ;
- toute évolution de statut/action est testée côté client et côté serveur.

Cette priorité ne bloque pas les changements purement UI/local qui ne modifient pas le protocole partagé.

---

# Phase 1 — rendre la maturité du travail immédiatement lisible

## P1.1 — Regrouper l'accueil par maturité

### Problème

L'accueil trie aujourd'hui surtout les sujets par dernière activité. Un sujet secondaire très actif peut donc masquer un sujet déjà prêt à être porté collectivement.

### Cible

Afficher les sujets actifs par groupes :

1. **Prêts pour la réunion**
2. **En discussion**
3. **Clôturés récemment**
4. **Archivés** uniquement lorsque l'utilisateur les demande

À l'intérieur d'un groupe, conserver le tri par `updatedAt` décroissant.

### Contraintes

- ne pas créer de notion de réunion ;
- ne pas ajouter de date d'échéance ;
- conserver la recherche ;
- conserver le comportement des archives ;
- ne pas transformer l'accueil en tableau Kanban.

### Critères de sortie

- un sujet `ready` apparaît toujours avant un sujet `open` ;
- les sujets `open` restent triés par activité récente ;
- les sujets `closed` restent visibles mais clairement secondaires ;
- les archives restent masquées par défaut ;
- recherche et états vides restent cohérents avec les groupes.

---

## P1.2 — Clarifier la lecture des votes par la participation

### Problème

Les résultats actuels montrent la répartition des votes, mais pas suffisamment le nombre de personnes qui se sont effectivement prononcées par rapport à l'équipe connue.

### Cible

Pour chaque proposition, afficher clairement :

- `X pour`
- `Y contre`
- `Z abstention(s)`
- `N / T participants ont voté`
- le pourcentage favorable parmi les avis exprimés, quand il y a au moins un avis exprimé

### Règle de vocabulaire

Le mot **Consensus** désigne l'étape produit dédiée au cap collectif et ne doit pas être utilisé comme verdict automatique d'un simple vote de proposition.

Les libellés de résumé de vote doivent donc décrire le résultat sans surinterpréter la représentativité.

### Critères de sortie

- `1 pour / 0 contre / 9 abstentions` ne peut pas être présenté comme une preuve collective forte ;
- la participation est lisible sans ouvrir un écran secondaire ;
- les abstentions restent exclues du calcul du pourcentage favorable ;
- aucun quorum complexe n'est introduit.

---

# Phase 2 — clarifier la destination du parcours

## P2.1 — Renommer « Conclusion » en « Consensus » dans le produit

### Objectif

Le mot visible par l'utilisateur devient **Consensus**.

Il désigne la formulation du cap que l'équipe souhaite porter sur le sujet avant la réunion.

### À renommer

- barre d'accès depuis la discussion ;
- titre d'écran ;
- états vides ;
- onboarding ;
- synthèse imprimable ;
- guide utilisateur ;
- textes d'aide et libellés visibles.

### Compatibilité

Le modèle interne (`conclusions`, `conclusionVotes`, routes historiques, noms d'actions) peut rester inchangé dans un premier temps.

Un renommage interne n'est justifié que s'il simplifie réellement le code et peut être migré sans risque.

### Critères de sortie

- aucun texte utilisateur ne présente cette étape comme une conclusion prise après la réunion ;
- l'onboarding explique clairement que le Consensus est le cap préparé par l'équipe ;
- les anciennes données restent lisibles sans migration destructive.

---

## P2.2 — Réduire le chevauchement entre proposition et Consensus

### Problème

Une proposition peut aujourd'hui être marquée `Retenue` ou `Mise en place`, alors que BrainstO. possède déjà une étape distincte pour formuler le cap collectif.

### Cible produit

Les propositions servent à :

- formuler des options ;
- mesurer l'avis ;
- signaler qu'une option mérite encore un débat ;
- écarter une option.

Le Consensus sert à :

- formuler ce que l'équipe veut porter en réunion.

### Direction de simplification

Réexaminer les cinq statuts actuels :

- `voting`
- `selected`
- `debate`
- `implemented`
- `rejected`

La cible doit supprimer les états qui décrivent une décision ou une exécution postérieure à la maturation dans BrainstO.

Une cible plausible est :

- **En vote**
- **À débattre**
- **Écartée**

La migration exacte des valeurs existantes doit être décidée avec la parité frontend/backend restaurée.

### Critères de sortie

- aucune proposition n'a besoin d'un statut « Mise en place » ;
- le statut d'une proposition ne prétend pas enregistrer ce qui s'est passé après la réunion ;
- la séparation `option` / `Consensus` est compréhensible sans documentation technique.

---

# Phase 3 — améliorer l'usage asynchrone

## P3.1 — Signaler ce qui est nouveau depuis la dernière visite

### Problème

BrainstO. est conçu pour être consulté par intermittence. L'utilisateur doit pouvoir identifier immédiatement les sujets qui ont évolué depuis sa dernière consultation.

### Cible

Introduire un mécanisme **local à l'appareil**, sans serveur supplémentaire, permettant de signaler :

- un sujet mis à jour depuis la dernière visite ;
- de nouveaux messages ;
- un mouvement sur les propositions ou le Consensus.

### Direction technique

Conserver localement un marqueur de dernière consultation par sujet.

Le serveur reste la source de vérité du contenu ; le marqueur de lecture est une préférence locale et n'a pas vocation à être synchronisé entre appareils dans cette phase.

### Contraintes

- aucune notification push dans cette phase ;
- aucune obligation de compte utilisateur ;
- aucun compteur global complexe ;
- ne jamais présenter une activité créée par l'utilisateur lui-même comme une nouveauté nécessitant son attention si elle vient d'être vue dans le même contexte.

### Critères de sortie

- l'accueil permet de repérer les sujets ayant changé ;
- ouvrir un sujet marque son état courant comme vu ;
- le mécanisme survit à la fermeture lorsque le stockage local est disponible ;
- l'absence de stockage local dégrade proprement la fonctionnalité sans casser l'application.

---

## P3.2 — Mettre l'anonymat au premier plan de la documentation produit

### Objectif

Faire apparaître clairement dans le README, le guide et l'onboarding que l'anonymat est un mécanisme de sécurité sociale du débat, pas un gadget de messagerie.

### Invariants

- aucun affaiblissement du mécanisme actuel ;
- aucune identité anonyme ajoutée côté serveur pour faciliter des fonctionnalités secondaires ;
- la déconnexion continue de supprimer les porteurs de droits locaux liés aux contenus anonymes.

---

# Phase 4 — simplifier sans élargir

## P4.1 — Assumer le mode local comme bac à sable

### Objectif

Clarifier les textes du produit : le mode local sert à découvrir BrainstO. seul, pas à définir un deuxième usage principal.

Aucune fonctionnalité collective ne doit être dégradée ou complexifiée pour optimiser un cas d'usage individuel.

---

## P4.2 — Garder le modèle de permissions minimal

Aucun système général de rôles n'est prévu.

Toute demande future de permission doit être évaluée comme un besoin métier précis, pas comme une occasion de créer une matrice d'autorisations générique.

---

# Réactions — invariant maintenu

Le jeu de réactions reste inchangé :

- 👌 D'accord
- 💪 Je m'engage
- 🤏 Mitigé
- 👎 Pas d'accord
- 💩 À écarter

Aucun chantier de neutralisation du registre ou de remplacement de ces réactions n'est prévu.

---

# Hors roadmap par décision produit

Les éléments suivants sont explicitement exclus :

- création d'une entité « réunion » ;
- date ou calendrier de réunion ;
- affectation des sujets à une réunion ;
- ordre du jour formel ;
- historique de réunions ;
- compte rendu ;
- décision finale post-réunion ;
- bilan de réunion ;
- attribution et suivi de tâches ;
- échéances et relances ;
- Kanban ;
- gestion de projet ;
- changement du jeu de réactions ;
- rôles et permissions génériques.

---

# Ordre d'exécution recommandé

1. **P0.1** — rétablir la parité backend pour sécuriser les futures évolutions métier.
2. **P1.1** — accueil orienté maturité.
3. **P1.2** — participation visible dans les votes et libellés moins ambigus.
4. **P2.1** — « Conclusion » → « Consensus » côté produit, sans migration interne inutile.
5. **P2.2** — simplification des statuts de propositions une fois la parité restaurée.
6. **P3.1** — nouveautés depuis la dernière visite.
7. **P3.2**, **P4.1**, **P4.2** — consolidation documentaire et garde-fous.

Les étapes 2, 3 et 4 peuvent avancer sans attendre une refonte du backend tant qu'elles ne modifient pas le protocole partagé.

---

# Définition de « terminé » pour cette roadmap

La roadmap sera considérée comme atteinte lorsque :

- l'accueil met naturellement les sujets prêts devant les sujets simplement actifs ;
- un vote expose à la fois la position et la participation ;
- l'utilisateur parle de **Consensus**, pas de conclusion de réunion ;
- proposition et Consensus ont des rôles non concurrents ;
- BrainstO. permet d'identifier ce qui a changé depuis la dernière consultation ;
- aucun chantier n'a introduit de gestion de réunion, de compte rendu ou de suivi d'exécution ;
- les invariants d'anonymat, de fonctionnement hors ligne et de simplicité des permissions restent intacts.
