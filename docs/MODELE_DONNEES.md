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
en silence, une action restée en file plus de 30 jours (`CONFIG.STALE_ACTION_MS`) :
le bouton « Envoyer quand même » de Réglages → Système la libère, après confirmation
(`Sync.releaseStale()`).

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
  pinned,                 // true → en tête de l'accueil, pour toute l'équipe (absent = false)
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
  quoteId,                               // id d'un autre message du sujet, ou null (citation)
  branchRootId                           // id d'un message du fil principal du sujet, ou null (exploration)
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
| `CREATE_MESSAGE` | `topicId`, `messageId`, `text`, `quoteId`, `anon`, `branchRootId` (facultatif, capacité `branches`) |
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
| `SET_TOPIC_PIN` | `topicId`, `pinned` (affectation, pas bascule) |
| `SUBMIT_IDEA` | `ideaId`, `text` ; `actorId` **vide** obligatoire. Dépôt dans Pandore (nom technique d'avant Pandore) |

L'auteur d'une action est toujours pris dans l'enveloppe (`actorId`,
`actorName`) : le contenu anonyme n'enregistre donc aucune identité.

`SET_TOPIC_PIN` et `SUBMIT_IDEA` n'existent qu'à partir du backend 1.2.0, qui annonce
les capacités `pins` et `ideas`. Le client ne les propose pas à un serveur qui ne les
annonce pas.

`SUBMIT_IDEA` (un dépôt dans Pandore) est à part :

- le serveur **refuse** un dépôt dont l'enveloppe porte un `actorId` (« Une idée est
  toujours anonyme. », message d'avant Pandore) ; le client envoie `actorId: ""` et
  `actorName: "Anonyme"` ;
- il ne laisse **aucune trace** dans les données partagées : ni texte, ni révision,
  ni `updatedAt`, ni `id` dans `processedActionIds`. Cause : une révision qui avance
  sans rien de visible dirait à chacun l'heure du dépôt. Conséquence : un renvoi est
  dédupliqué par la référence du dépôt (sur le Drive, puis dans le dépôt GitHub), pas
  par l'`id` de l'action ;
- le serveur range son texte dans un second fichier Drive, `brainsto-idees.json`, à
  côté du fichier de données, sous une référence tirée de `ideaId` par hachage. Ni
  heure ni appareil n'y sont notés. La collecte quotidienne le vide (voir
  [`PANDORE.md`](PANDORE.md)).

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
`brainsto-data.json.avant-<version>.<date>`, déposée par le backend avant sa
première écriture. Le nom porte la version du code qui s'apprête à écrire
(`BACKEND_VERSION`), donc celle du **nouveau** code : le backend 1.0.0 dépose
`brainsto-data.json.avant-brainsto-backend-1.0.0.<date>`, puis le backend 1.1.0
dépose `brainsto-data.json.avant-brainsto-backend-1.1.0.<date>` avant sa propre
première écriture. Si la 1.0.0 a déjà réécrit le fichier, le texte de `conclusion`
n'est que dans la copie de la 1.0.0 : celle de la 1.1.0 garde l'état déjà réécrit,
sans `conclusion`. Deux voies :

1. recopier à la main les textes voulus depuis cette copie (ouverte dans Drive) et
   les saisir comme formulations de consensus : rien de ce qui a été écrit depuis
   n'est perdu ;
2. restaurer toute la copie avec `restoreFromBackup` (voir
   [`INSTALLATION.md`](INSTALLATION.md), « Revenir en arrière »), puis laisser le
   nouveau noyau la relire : il reprend `conclusion`. **Cela remplace tout l'état
   par celui de la copie** : les sujets, messages et votes écrits depuis sont
   perdus (l'état remplacé est gardé dans une copie `avant-restauration`, mais
   n'est pas refusionné).

### Ce que `restoreFromBackup` refuse et garde

- **Une copie sans liste de sujets est refusée, sans rien écrire.** Le fichier doit
  contenir une liste `topics` (vide ou non). Un fichier `{}`, un export de
  diagnostic ou le fichier d'une autre application est refusé avec le message
  « La copie … n'est pas un fichier de données lisible : rien n'a été modifié. » :
  ni le fichier de données, ni la révision, ni les copies de sécurité ne changent.
  Les copies des anciennes versions (TeamKrys v1 et v2) restent acceptées, même vides.
- **Les anonymisations faites après la copie sont conservées.** Un message qui est
  anonyme dans l'état actuel et qui est signé dans la copie reste anonyme après la
  restauration : le noyau lui applique `SET_MESSAGE_SIGNATURE` avec `anon: true`, donc
  `authorId` est vidé, `authorName` devient « Anonyme » et la clé de réaction de son
  auteur est retirée, comme pour une anonymisation ordinaire. Un message anonyme dans
  la copie le reste, même s'il a été signé de nouveau depuis.
- **Limites.** Si le fichier actuel est illisible, il n'y a rien à reporter : les
  anonymisations faites après la copie ne subsistent alors que dans la copie
  `avant-restauration`, qui garde le texte abîmé tel quel. `updatedAt` du message et
  du sujet concernés prend la date de la restauration : le sujet remonte dans la
  liste.
- **Une copie prise avant l'anonymisation d'un message contient encore son auteur.**
  Les copies (`manuel`, `avant-<version>`, `avant-restauration`) sont des instantanés
  complets du fichier : rendre un message anonyme ensuite ne les réécrit pas (constat
  REC-FON-090 de la recette : la copie `brainsto-data.json.manuel.<date>` gardait
  `authorId` et `authorName`). Conséquence : une copie se protège comme les données
  elles-mêmes (même dossier Drive, mêmes personnes), et se supprime à la main quand
  elle ne sert plus : le script ne supprime aucune copie. `restoreFromBackup`
  ré-applique les anonymisations postérieures à la copie (voir plus haut), mais ne
  réécrit jamais la copie restaurée.

---

## Règles métier

- Réactions autorisées : **👌 💪 🤏 👎 💩** — toute autre valeur est refusée,
  côté serveur comme côté application. Depuis la 1.18.0, l'interface ne propose ni
  n'affiche plus 💪 (« Je m'engage ») ; la valeur reste valide en données, pour ne
  rien casser ni demander de redéploiement. La liste vit dans `Core.REACTIONS`
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

### Explorer un message (`branchRootId`)

Une exploration est un **espace d'exploration d'une idée à l'intérieur d'un sujet** :
le sous-fil ouvert depuis un message du fil principal, pour approfondir l'idée sans
encombrer la discussion. Ce n'est **pas** un objet : il n'existe ni collection
`branches`, ni action `CREATE_BRANCH`, ni titre, ni statut. C'est un attribut du
message :

- `branchRootId = null` : le message appartient au **fil principal** ;
- `branchRootId = "<id>"` : le message appartient à l'exploration ouverte depuis le
  message `<id>`.

Une exploration existe dès qu'**au moins un** message la désigne. L'ouvrir n'écrit
rien : aucune exploration vide n'est jamais enregistrée.

Règles, identiques côté application (`js/state.js`) et côté serveur
(`apps-script/Code.gs`), vérifiées vecteur par vecteur par `tests/parity.test.js` :

- **Le message source** existe, dans le **même sujet**, et appartient au **fil
  principal** (`branchRootId === null`). Il n'est pas le message lui-même.
- **Une seule profondeur.** On n'explore pas une réponse d'exploration : une
  exploration ne contient jamais de sous-exploration.
- **Immuable.** Aucune action ne change `branchRootId` après la création : modifier,
  signer ou réagir laisse le message dans son fil.
- **Citer n'est pas explorer.** `quoteId` (« ce message répond à celui-ci ») et
  `branchRootId` (« ce message appartient à cette exploration ») sont deux champs
  distincts. Un message d'exploration peut citer un autre message : sa règle est
  inchangée (tout message du sujet, sauf lui-même). La durcir ferait refuser le
  message d'un ancien client qui cite une réponse d'exploration.
- **Normalisation à la lecture** (`ensureShape`), en deux passes pour que le
  résultat ne dépende jamais de l'ordre des messages : d'abord, une source absente
  ou égale au message est neutralisée (`null`) ; ensuite, une source qui portait
  elle-même un `branchRootId` après la première passe l'est aussi. Le message
  reste, dans le fil principal. Relire un état normalisé ne change rien.
- **Validation de `CREATE_MESSAGE`** : `branchRootId` absent ou `null` = fil
  principal (exactement le comportement d'avant). Sinon, refus métier (code
  `invalid`) si : « Le message d'origine n'existe plus. », « On n'explore pas une
  réponse : explorez le message d'origine. », « Un message ne peut pas être sa propre
  origine. », ou identifiant invalide (mêmes limites que les autres identifiants).
- **Anonymat.** `branchRootId` relie un message à un message, jamais à une
  personne. Un message anonyme d'exploration n'a ni `authorId` ni réaction de son
  auteur, comme dans le fil principal.
- **Une proposition reste au sujet.** Elle naît du texte d'un message (fil principal
  ou exploration) mais ne porte aucun lien d'exploration.
- **Aucun message n'est supprimable** dans BrainstO. : un message source ne peut pas
  disparaître, et une réponse ne peut donc jamais devenir orpheline en usage normal.
  La neutralisation de `ensureShape` couvre les données abîmées.

**Compatibilité de versions** (le frontend et le backend se déploient séparément) :

| Situation | Ce qui se passe |
|---|---|
| Message d'avant la 1.20.0, sans le champ | Lu `branchRootId: null` : fil principal, comme avant. Aucune migration |
| Backend 1.3.0, application à jour | Le serveur annonce la capacité `branches` ; « Explorer » est disponible |
| Backend antérieur, application à jour | Pas de capacité `branches` : « Explorer » reste visible mais désactivé, avec sa raison, et l'application ne met **jamais** un message d'exploration en file. Un backend antérieur l'accepterait en perdant le champ en silence (constaté et testé : `tests/sync.test.js`) |
| Ouverture hors ligne, avant toute réponse du serveur | La dernière réponse connue du serveur, retenue sur l'appareil (`brainsto.cap.branches`, un booléen, effacé à la déconnexion et au changement de serveur). Inconnue : non |
| Mode local | Disponible : le noyau de l'appareil range lui-même |
| Ancien frontend (gardé en cache par la PWA) | Sa normalisation ignore le champ : il affiche **temporairement** les réponses d'exploration dans le fil principal, à leur place chronologique, jusqu'à sa mise à jour (bandeau « Nouvelle version »). Il ne peut rien corrompre : un client n'envoie jamais l'état, seulement des actions, et il ne peut pas créer de message d'exploration |
| **Retour à un backend antérieur** après usage | À sa première écriture, il réécrit le fichier sans le champ : toutes les réponses d'exploration retombent dans le fil principal (rien n'est perdu, la structure l'est). Une copie Drive est faite automatiquement au premier enregistrement de chaque nouvelle `BACKEND_VERSION` : c'est elle qu'il faut restaurer |

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
| Dépôt dans Pandore | 2000 |

Les identifiants (`actorId`, `participantId`, `topicId`, `messageId`, `proposalId`,
`conclusionId`, `quoteId`, `branchRootId`, `ideaId` et l'`id` d'une action) ont **120 caractères au plus** : au
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

---

## Données gardées sur l'appareil

Le fichier Drive est la seule copie partagée de l'espace. Chaque appareil garde en
plus, pour lui seul, une copie de lecture et quelques réglages. Ce sont des états
locaux, pas un second exemplaire à synchroniser.

- **IndexedDB** (`js/database.js`) : la file des actions pas encore confirmées par
  le serveur et le dernier état connu de l'espace, pour le hors ligne. Là où
  IndexedDB est refusée, un repli en mémoire prend le relais (voir le README).
- **`localStorage`** : les clés ci-dessous, toutes préfixées `brainsto.`. Les huit
  premières sont déclarées dans `CONFIG.KEYS` (`js/config.js`).

| Clé | Contenu | Retirée par « Se déconnecter de l'équipe » |
|---|---|---|
| `brainsto.apiUrl` | adresse du script de l'équipe | oui |
| `brainsto.lockVerifier` | hachage qui sert à vérifier le code d'accès hors ligne, jamais le code lui-même | oui |
| `brainsto.session` | session déverrouillée : vérificateur, jeton dérivé du code, moment de la dernière manipulation | oui |
| `brainsto.user` | identité locale (identifiant et nom choisi) | oui |
| `brainsto.ownItems` | suivi local des identifiants des contenus créés sur cet appareil (la preuve des messages anonymes) | oui |
| `brainsto.localMode` | choix du mode local | oui |
| `brainsto.showArchived` | choix « Afficher les sujets archivés » | non |
| `brainsto.onboarding` | état de la présentation initiale (étape atteinte, terminée ou passée) | non |
| `brainsto.seenTopics.v1` (`js/product-ui.js`) | ce que l'appareil a déjà consulté, pour signaler les nouveautés (porte un condensat de l'identifiant de la personne) | oui |
| `brainsto.drafts.v1` (`js/ui.js`) | brouillons des messages en cours d'écriture | oui |
| `brainsto.probe` (`js/utils.js`) | sonde d'écriture du stockage, écrite puis retirée aussitôt | sans objet |

Le repère `brainsto.seenTopics.v1` est effacé à la déconnexion parce qu'il porte un
condensat de l'identifiant de la personne et des comptes « sans moi » : de quoi
désigner l'auteur d'un message anonyme (`App.logout`, `js/app.js`). C'est une preuve
locale dérivée, au même titre que `brainsto.ownItems`. La personne qui se connecte
ensuite repart donc sans pastilles « Nouveau ». Le reverrouillage d'inactivité d'une
heure (`App.relock`) le garde, comme les brouillons : c'est la même personne après le
code.

### Les brouillons (`brainsto.drafts.v1`)

- **Ce qui est stocké** : le texte en cours d'écriture dans le champ de message de
  chaque sujet, sous la forme `{ "composer:<identifiant du sujet>": "texte",
  "anon": ["composer:<identifiant du sujet>"] }`. Seules les clés qui commencent par
  `composer:` sont acceptées, à l'écriture comme à la lecture ; une valeur absente,
  abîmée ou d'une autre forme est ignorée sans erreur.
- **Le choix « anonyme »** : un brouillon écrit en mode Anonyme garde ce choix, sur
  l'appareil seulement. La liste `anon` ne contient que des clés de brouillons (jamais
  un nom ni un identifiant) ; elle n'est écrite que s'il existe au moins un brouillon
  anonyme, et un brouillon signé n'a aucun indicateur. L'indicateur ne survit jamais à
  son texte : il part avec lui (envoi accepté, champ vidé, déconnexion). Cause : un nom
  divulgué ne se rattrape pas, alors qu'un message resté anonyme par prudence se
  corrige. Conséquence : au retour, le brouillon anonyme est rétabli en anonyme et une
  note le dit près du composeur (« Brouillon retrouvé sur cet appareil. Il sera publié
  en anonyme : vérifiez avant d'envoyer. ») ; il n'est **jamais** converti en signé. Un
  brouillon sans indicateur (signé, ou écrit avant ce changement) revient signé, avec la
  note « Brouillon retrouvé sur cet appareil. Vérifiez « Signé » ou « Anonyme » avant
  d'envoyer. ». Le choix de publication vaut pour tout l'écran : rétablir un brouillon
  anonyme met aussi les autres sujets en anonyme, jusqu'à un geste sur la bascule, qui
  retire la note et réécrit le choix fait. Un ancien `js/ui.js` ignore la liste `anon`.
- **Ne sont jamais conservés** : le nom et l'identité, la citation en cours, les champs
  de connexion et de code, les fenêtres « Modifier » et de création, la recherche.
- **Bornes** (`js/ui.js`) : 50 brouillons au plus (les plus anciens partent d'abord),
  20 000 caractères au total, 4 000 caractères par brouillon. L'écriture a lieu après
  500 ms sans frappe ; elle est faite tout de suite au passage en arrière-plan, à la
  fermeture de la page et avant le rechargement de « Mettre à jour ».
- **Quand il revient** : au premier rendu du composeur du même sujet, après un
  rechargement (mise à jour, page fermée par le système, onglet restauré) et après
  un déverrouillage. Il n'est jamais affiché sur l'écran de verrouillage.
- **Quand il est effacé** : quand le message est accepté dans la file d'envoi (sauf si
  un texte plus récent a été saisi pendant l'envoi), quand le champ est vidé, et par
  « Se déconnecter de l'équipe » ; son indicateur anonyme part toujours avec lui. Pas au
  verrouillage par inactivité. Un envoi refusé sur l'appareil remet le texte dans le
  champ et dans le brouillon, avec son indicateur. Après « Se déconnecter »,
  `brainsto.drafts.v1` et `brainsto.seenTopics.v1` sont absents du stockage.
- **Il ne quitte jamais l'appareil** : aucune requête ne le porte, et la clé n'est
  définie que dans `js/ui.js`. Il est écrit en clair : l'écran de verrouillage
  protège l'interface, pas le stockage. Si le stockage est refusé, le brouillon ne
  vit qu'en mémoire.
