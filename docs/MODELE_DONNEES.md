# Modèle de données et actions

Un seul fichier JSON, sur Google Drive. Le frontend n'écrit jamais ce fichier :
il envoie des **actions**, que le backend applique sur la dernière version.

La référence exécutable de ce document est [`js/state.js`](../js/state.js) ;
[`apps-script/Code.gs`](../apps-script/Code.gs) en est la copie conforme — et
cette conformité n'est plus déclarative : [`tests/parity.test.js`](../tests/parity.test.js)
charge les deux et leur fait passer les mêmes vecteurs, action par action.

`processedActionIds` reste **côté serveur uniquement**. Il sert à la
déduplication et le client ne le lit jamais : le backend le retire de l'état
qu'il envoie (capacité `lean`), ce qui allège d'un tiers chaque téléchargement.
`ensureShape()` le recrée à vide côté client, sans conséquence.

Le journal garde les **5000** derniers identifiants (`MAX_PROCESSED` dans
`Code.gs`). Une action retransmise après avoir été évincée du journal ne serait
plus reconnue comme déjà traitée. C'est pourquoi les choix (vote, réaction,
soutien) s'envoient sous la forme marquée `set:true` (voir « Choix idempotents »),
dont le rejeu est sans effet, et pourquoi le client retient, au lieu de la renvoyer
en silence, une action restée en file plus de 30 jours (`CONFIG.STALE_ACTION_MS`).

Le serveur annonce ses capacités dans `features` : `since` (lecture conditionnelle
par révision), `batch` (lots de 20 actions au plus), `lean` (état sans
`processedActionIds`) et `idempotent` (choix marqués `set:true`).

---

## Structure

```
data = {
  revision,               // entier, +1 à chaque action appliquée
  updatedAt,              // ISO 8601
  participants: [ { id, name } ],
  topics: [ topic ],
  processedActionIds: []  // 5000 derniers identifiants traités (anti-doublon)
}

topic = {
  id, title, description,
  status,                 // open | ready | closed | archived
  createdBy: { id, name },        // anonyme → { id: "", name: "Anonyme" }
  createdAt, updatedAt,
  messages: [ message ],
  proposals: [ proposal ],
  conclusions: [ conclusion ],
  conclusionVotes: { participantId: conclusionId }   // choix unique
}

message = {
  id, authorId, authorName, text, createdAt, updatedAt,
  reactions: { participantId: emoji },   // une réaction par personne
  anon,                                  // true → authorName "Anonyme", authorId ""
  quoteId                                // id d'un autre message du sujet, ou null
}

proposal = {
  id, title, description, authorId, authorName, createdAt,
  status,                 // voting | selected | debate | implemented | rejected
  votes: { participantId: "for" | "against" | "abstain" }
}

conclusion = { id, text, source: "manual", authorId, authorName, createdAt, updatedAt }
```

---

## Actions

Enveloppe commune :

```
{ id, type, actorId, actorName, ts, payload }
```

`id` sert à la déduplication côté serveur (une action rejouée après une coupure
réseau n'est pas appliquée deux fois).

| Action | Charge utile |
|---|---|
| `REGISTER_PARTICIPANT` | `participantId`, `name` |
| `UPDATE_PARTICIPANT` | `participantId`, `name` |
| `CREATE_TOPIC` | `topicId`, `title`, `description`, `anon` |
| `UPDATE_TOPIC` | `topicId`, `title`, `description` |
| `CHANGE_TOPIC_STATUS` | `topicId`, `status` |
| `CREATE_MESSAGE` | `topicId`, `messageId`, `text`, `quoteId`, `anon` |
| `UPDATE_MESSAGE` | `topicId`, `messageId`, `text` |
| `SET_MESSAGE_SIGNATURE` | `topicId`, `messageId`, `anon` |
| `SET_REACTION` | `topicId`, `messageId`, `emoji`, `set` (facultatif) |
| `CREATE_PROPOSAL` | `topicId`, `proposalId`, `title`, `description` |
| `UPDATE_PROPOSAL` | `topicId`, `proposalId`, `title`, `description` |
| `CHANGE_PROPOSAL_STATUS` | `topicId`, `proposalId`, `status` |
| `SET_VOTE` | `topicId`, `proposalId`, `value`, `set` (facultatif) |
| `REMOVE_VOTE` | `topicId`, `proposalId` |
| `ADD_CONCLUSION` | `topicId`, `conclusionId`, `text` |
| `UPDATE_CONCLUSION_ITEM` | `topicId`, `conclusionId`, `text` |
| `DELETE_CONCLUSION` | `topicId`, `conclusionId` |
| `SET_CONCLUSION_VOTE` | `topicId`, `conclusionId`, `set` (facultatif) |
| `REMOVE_CONCLUSION_VOTE` | `topicId` |

L'auteur d'une action est toujours pris dans l'enveloppe (`actorId`,
`actorName`) : le contenu anonyme n'enregistre donc aucune identité.

### Choix idempotents : le marqueur `set:true`

`SET_VOTE`, `SET_CONCLUSION_VOTE` et `SET_REACTION` existent sous deux formes,
selon le champ `set` de la charge utile. Le marqueur est **additif** : il ne vit
que dans l'action, jamais dans les données stockées.

| `payload.set` | Sens | Action rejouée deux fois |
|---|---|---|
| `true` | **affecter** : `votes[acteur] = value`, `conclusionVotes[acteur] = conclusionId` (déplacement), `reactions[acteur] = emoji` | même état |
| absent, `false`, `"true"`, `1`, `null` | **bascule historique** : le même choix rejoué le retire | état inversé |

- Retrait d'une réaction : `SET_REACTION` avec `emoji: ""` **et** `set:true`. Un
  `emoji` vide sans `set:true` est refusé. Retrait d'un vote ou d'un soutien :
  `REMOVE_VOTE` et `REMOVE_CONCLUSION_VOTE`, déjà idempotents.
- Un choix marqué sans effet (la valeur est déjà en place) ne change rien, pas même
  `updatedAt`. La révision, elle, avance quand même (règle de la coquille).
- Le serveur annonce la capacité par `FEATURES` (`"idempotent"`). Le client n'envoie
  la forme marquée que si ce drapeau est annoncé. Sinon, et tant qu'aucune réponse
  n'est arrivée après un démarrage (liste vide), il envoie la bascule historique à
  l'identique : un ancien backend, ou un ancien client resté en cache, fonctionne
  comme avant.
- Le client choisit d'après l'état **affiché** (vue optimiste), pas d'après le
  dernier état connu du serveur : vote affiché = valeur appuyée → `REMOVE_VOTE`,
  sinon `SET_VOTE` marqué ; réaction affichée = emoji appuyé → `SET_REACTION`
  `{ emoji: "", set: true }`, sinon `SET_REACTION` marqué ; soutien affiché =
  formulation appuyée → `REMOVE_CONCLUSION_VOTE`, sinon `SET_CONCLUSION_VOTE`
  marqué.
- Précaution : si le backend revient à une version sans `idempotent` alors que des
  actions marquées attendent en file, un `SET` marqué y redevient une bascule et un
  retrait `emoji: ""` y est refusé.

### Réponses du serveur

Une réponse qui échoue porte un `code` qui dit quoi faire de l'action.

| Réponse | Sens | Ce que fait le client |
|---|---|---|
| `{ ok: true }`, avec `duplicate: true` si l'action était déjà appliquée | appliquée | retire l'action de la file |
| `{ ok: false, code: "invalid", error }` | rejet de validation d'**une** action : définitif | retire l'action ; message « Action refusée : (raison). Texte : « … » » |
| `{ ok: false, code: "retry", error }` | toute exception côté serveur : verrou dépassé, erreur Drive, corps illisible, aucune action reçue, lot de plus de 20 actions, fichiers de données homonymes non rattachés | garde l'action, recule ; « Erreur (n) » dès le 2e échec consécutif |
| `{ ok: false, code: "auth" }` | code d'accès refusé | se reverrouille et demande le (nouveau) code, file conservée |
| `{ ok: false }` sans code (ancien backend) | refus, mais sans dire s'il est définitif | réessaie 3 fois, espacées, puis retire l'action avec le même message |
| autre code, page HTML, JSON illisible ou tronqué, statut 5xx | résultat **inconnu** | garde l'action |

Un lot (20 actions au plus) renvoie `results`, une entrée par action et dans
l'ordre. Un lot sans `results` ne retire rien. Les lectures (`doGet`) en erreur
portent aussi `code: "retry"`.

### Anciennes données (TeamKrys v1 et v2)

Les fichiers Drive de l'ère TeamKrys portaient le texte de consensus dans
`topic.conclusion` (une chaîne). Les premières versions de ce backend (1.x) ne le
relisaient pas : la première écriture l'effaçait du fichier. `ensureShape()`
(serveur **et** client, mêmes règles) le reprend maintenant :

- une chaîne non vide devient **une** formulation de consensus, ajoutée en fin de
  liste : `{ id: "legacy-<topicId>", text, source: "manual", authorId: "",
  authorName: "Anonyme", createdAt = updatedAt = conclusionUpdatedAt }` (à défaut,
  la date du sujet). Le texte est coupé à 5000 caractères ; `conclusionUpdatedBy`
  n'est pas recopié ;
- rien n'est ajouté si une formulation d'id `legacy-<topicId>` existe déjà, si une
  formulation porte déjà le même texte, ou si la valeur n'est pas une chaîne.
  Relire plusieurs fois ne duplique donc rien, et rien n'est écrasé ;
- `source` reste `"manual"` : `ensureShape` réécrit toujours ce champ (un ancien
  client aussi), `"legacy"` ne serait pas toléré.

**Un fichier déjà réécrit par une version 1.x** a perdu `conclusion` dans le fichier
vivant : le nouveau noyau ne peut plus la reprendre. Le texte reste dans la copie
`brainsto-data.json.avant-brainsto-backend-1.0.0.<date>`, déposée par le backend
avant sa première écriture. Deux voies :

1. recopier à la main les textes voulus depuis cette copie (ouverte dans Drive) et
   les saisir comme formulations de consensus : rien de ce qui a été écrit depuis
   n'est perdu ;
2. restaurer toute la copie avec `restoreFromBackup` (voir
   [`INSTALLATION.md`](INSTALLATION.md), « Revenir en arrière »), puis laisser le
   nouveau noyau la relire : il reprend `conclusion`. **Cela remplace tout l'état
   par celui de la copie** : les sujets, messages et votes écrits depuis sont
   perdus (l'état remplacé est gardé dans une copie `avant-restauration`, mais
   n'est pas refusionné).

---

## Règles métier

- Réactions autorisées : **👌 💪 🤏 👎 💩** — toute autre valeur est refusée,
  côté serveur comme côté application. La liste vit dans `Core.REACTIONS`
  (`js/state.js`) et doit être **strictement identique** dans le script Apps
  Script. Une réaction retirée de la liste est ignorée à la lecture du JSON :
  les anciennes valeurs disparaissent de l'affichage, elles ne sont jamais
  converties vers une autre réaction — cela trahirait l'avis exprimé.
  L'application les **affiche** sous forme de marques dessinées, mais ce sont
  bien ces emoji qui sont stockés (voir « Icônes et réactions » du README).
- Une réaction par personne et par message. Sans `set:true`, la même réaction
  rejouée la retire (bascule historique) ; avec `set:true`, elle est affectée, et
  `emoji: ""` la retire.
- Un vote par personne et par proposition. Sans `set:true`, le même vote rejoué le
  retire (bascule historique) ; avec `set:true`, il est affecté. `REMOVE_VOTE` le
  retire sans ambiguïté.
- Conclusion : **choix unique** par personne — voter ailleurs déplace le vote.
- Supprimer une conclusion retire aussi les votes qui la visaient.
- Un message n'est plus modifiable dès qu'une **autre** personne y a réagi ;
  sa signature (anonyme / signé) reste modifiable.
- Anonyme ⇒ `authorId = ""` et `authorName = "Anonyme"` : l'identité est
  effacée des données partagées. L'auteur garde ses droits grâce à un suivi
  **local** des identifiants créés sur son appareil, jamais transmis.
- Rendre un message anonyme retire aussi, dans `reactions`, la clé de son auteur
  précédent et celle de l'acteur : l'identifiant de l'auteur ne reste pas comme clé
  de réaction. Un message rendu anonyme avant ce changement garde sa clé jusqu'à ce
  que son auteur le rende de nouveau anonyme. L'application ne propose pas de
  réaction sur son propre message anonyme.
- **Limite assumée.** La preuve locale (`ownItems`) est une garantie d'**interface** :
  le serveur ne garde aucune identité d'un message anonyme, il ne peut donc pas
  vérifier la paternité. `UPDATE_MESSAGE` n'est refusé que par le verrou (la
  réaction d'une autre personne que l'acteur) et `SET_MESSAGE_SIGNATURE` n'a aucune
  condition de paternité : une requête envoyée directement au serveur avec le code
  de l'équipe est obéie. C'est la conséquence du modèle de confiance (un code
  partagé, ni compte individuel ni droits par personne). L'application, elle, ne
  propose Modifier et Signer qu'à l'appareil qui détient la preuve locale.
- `ensureShape()` (serveur **et** client) recrée les champs manquants : un JSON
  produit par une version antérieure ne fait jamais planter l'application.

## Limites de saisie

| Champ | Limite |
|---|---|
| Nom | 50 |
| Titre de sujet | 150 |
| Description de sujet | 3000 |
| Message | 3000 |
| Titre de proposition | 200 |
| Description de proposition | 3000 |
| Conclusion | 5000 |

Les identifiants (`actorId`, `participantId`, `topicId`, `messageId`, `proposalId`,
`conclusionId`, `quoteId` et l'`id` d'une action) ont **120 caractères au plus** : au
delà, l'action est refusée (« Identifiant invalide. », code `invalid`). Treize noms
sont aussi réservés et refusés, une fois les espaces retirés : `__proto__`,
`constructor`, `prototype`, `hasOwnProperty`, `toString`, `valueOf`,
`toLocaleString`, `isPrototypeOf`, `propertyIsEnumerable`, `__defineGetter__`,
`__defineSetter__`, `__lookupGetter__` et `__lookupSetter__`. Cause : ce sont des
propriétés que tout objet JavaScript hérite ; les accepter ferait perdre ou compter
faux les données. Conséquence : une donnée d'époque qui porte un de ces noms reste
lisible, mais ne peut plus être ciblée par une nouvelle action.

Un texte coupé à sa limite ne garde jamais une moitié d'emoji : une moitié de paire
de substitution UTF-16 laissée par la coupe est retirée.

## Indicateur de vote

Deux lectures coexistent. Le **noyau** (`Core.voteSummary`, copie dans `Code.gs`)
évalue, dans l'ordre :

1. aucun vote → **Aucun vote** ;
2. uniquement des abstentions → **Avis partagés** ;
3. aucun contre → **Consensus favorable** ;
4. pour = contre → **Avis partagés** ;
5. pour > contre → **Majorité favorable** ;
6. sinon → **Majorité défavorable**.

Le pourcentage favorable est calculé **hors abstentions**.

L'**écran**, lui, n'affiche pas ces libellés. Il affiche la lecture de
`ProductView.voteReading` (`js/product-view.js`), seule source des textes de vote de
la carte, de la synthèse et du nom accessible :

- les positions : « 3 pour · 1 contre · 2 abstentions » ;
- le pourcentage favorable, toujours suivi du nombre d'avis exprimés :
  « 75 % favorables sur 4 avis exprimés » (« sur 1 avis exprimé » au singulier) ;
  « Aucun avis exprimé », sans pourcentage, quand tout le monde s'est abstenu ;
  rien quand personne n'a voté ;
- la participation : « 6 participants sur 8 ont voté », « 1 participant sur 8 a
  voté », « 0 participant sur 8 a voté ». Le total est le nombre de personnes
  connues, augmenté des votants absents du registre : il n'est jamais inférieur au
  nombre de votants ;
- la tendance : Aucun vote, Abstentions uniquement, Avis exprimés favorables (aucun
  contre), Avis partagés (autant de pour que de contre, au moins un avis exprimé),
  Avis exprimés plutôt favorables, Avis exprimés plutôt défavorables.

Le mot « Consensus » n'est jamais utilisé pour le vote d'une proposition, et
aucun quorum n'est appliqué.
