# Modèle de données et actions

## Fichier partagé `teamkrys-data.json`

```json
{
  "revision": 12,
  "updatedAt": "2026-01-15T09:30:00.000Z",
  "participants": [
    { "id": "uuid-local", "name": "Jérémy" }
  ],
  "topics": [ /* voir ci-dessous */ ],
  "processedActionIds": [ "uuid-action-1", "uuid-action-2" ]
}
```

- `revision` : entier incrémenté à **chaque** action appliquée.
- `processedActionIds` : les **500 derniers** identifiants d'actions appliquées,
  pour ne pas rejouer un doublon (champ interne, non renvoyé au client).

### Sujet (`topic`)

```json
{
  "id": "uuid",
  "title": "Titre du sujet",
  "description": "Description du sujet",
  "status": "open",
  "createdBy": { "id": "uuid-local", "name": "Prénom" },
  "createdAt": "date ISO",
  "updatedAt": "date ISO",
  "messages": [],
  "proposals": [],
  "conclusions": [],
  "conclusionVotes": {},
  "conclusion": "",
  "conclusionUpdatedAt": null,
  "conclusionUpdatedBy": null
}
```

Statuts : `open`, `ready`, `closed`, `archived`.

`createdBy.name` peut valoir `"Anonyme"` (choisi à la création via le champ
« nom »), tout en conservant l'`id` local de l'auteur.

Champs « Conclusion » (remplissage manuel) :

- `conclusions` : `[{ id, text, source, authorId, authorName, createdAt, updatedAt }]`
  — conclusions ajoutées par les collaborateurs (`source` vaut toujours
  `"manual"`), modifiables/supprimables par leur auteur.
- `conclusionVotes` : `{ participantId: conclusionId }` — **choix unique** par
  personne (voter pour une conclusion remplace le vote précédent).

### Conclusion (candidate votable)

```json
{
  "id": "uuid",
  "text": "Conclusion proposée",
  "source": "manual",
  "authorId": "uuid-local",
  "authorName": "Prénom",
  "createdAt": "date ISO",
  "updatedAt": "date ISO"
}
```

### Message

```json
{
  "id": "uuid",
  "authorId": "uuid-local",
  "authorName": "Prénom",
  "text": "Contenu du message",
  "createdAt": "date ISO",
  "updatedAt": null,
  "reactions": { "uuid-personne": "👌" },
  "anon": false,
  "quoteId": null
}
```

- `reactions` associe à chaque personne **une** réaction emoji parmi
  `👌 💪 🤞 🤏 👎 💩` (une par personne et par message ; recliquer la même la retire).
- `anon` : si `true`, le message est **anonyme** — `authorName` vaut `"Anonyme"`
  et `authorId` est vidé (`""`), afin qu'aucune identité ne subsiste dans le
  fichier partagé. L'auteur conserve ses droits d'édition/signature grâce à un
  suivi **local** (sur son appareil, non partagé).
- `quoteId` : identifiant d'un autre message du sujet **cité** (ou `null`).

> Un message est modifiable par son auteur **tant qu'aucune autre personne n'y a
> réagi** (verrou UI). Un sujet créé en anonyme a de même `createdBy` = `{ id:"",
> name:"Anonyme" }`.

### Proposition

```json
{
  "id": "uuid",
  "title": "Titre de la proposition",
  "description": "Description de la solution",
  "authorId": "uuid-local",
  "authorName": "Prénom",
  "createdAt": "date ISO",
  "status": "voting",
  "votes": { "uuid-personne-1": "for", "uuid-personne-2": "against" }
}
```

Statuts : `voting`, `selected`, `debate`, `implemented`, `rejected`.
Votes : `for`, `against`, `abstain` (un seul par personne).

Libellés français dans l'interface :

| Code | Sujet | Proposition |
|---|---|---|
| open / voting | Ouvert | Vote en cours |
| ready / selected | Prêt pour la réunion | Solution retenue |
| closed / debate | Traité | À débattre en réunion |
| archived / implemented | Archivé | À mettre en œuvre |
| — / rejected | — | Solution écartée |

---

## Actions

Le frontend n'envoie jamais tout le JSON : il envoie une **action**. Format :

```json
{
  "actionId": "uuid",
  "type": "CREATE_TOPIC",
  "createdAt": "date ISO",
  "participant": { "id": "uuid-local", "name": "Prénom" },
  "payload": { "topicId": "uuid", "title": "Titre", "description": "Description" }
}
```

### Types et charges utiles

| Type | `payload` |
|---|---|
| `REGISTER_PARTICIPANT` | `{}` (auteur pris dans `participant`) |
| `UPDATE_PARTICIPANT` | `{}` |
| `CREATE_TOPIC` | `{ topicId, title, description, authorName?, anon? }` (si `anon`, aucune identité enregistrée) |
| `UPDATE_TOPIC` | `{ topicId, title, description }` |
| `CHANGE_TOPIC_STATUS` | `{ topicId, status }` |
| `CREATE_MESSAGE` | `{ topicId, messageId, text, quoteId? }` |
| `UPDATE_MESSAGE` | `{ topicId, messageId, text }` |
| `SET_MESSAGE_SIGNATURE` | `{ topicId, messageId, anon }` (signer / rendre anonyme) |
| `SET_REACTION` | `{ topicId, messageId, emoji }` (bascule la réaction de l'auteur) |
| `CREATE_PROPOSAL` | `{ topicId, proposalId, title, description }` |
| `UPDATE_PROPOSAL` | `{ topicId, proposalId, title, description }` |
| `CHANGE_PROPOSAL_STATUS` | `{ topicId, proposalId, status }` |
| `SET_VOTE` | `{ topicId, proposalId, vote }` |
| `REMOVE_VOTE` | `{ topicId, proposalId }` |
| `UPDATE_CONCLUSION` | `{ topicId, conclusion }` (héritage : conclusion libre) |
| `ADD_CONCLUSION` | `{ topicId, conclusionId, text }` (conclusion manuelle) |
| `UPDATE_CONCLUSION_ITEM` | `{ topicId, conclusionId, text }` (auteur uniquement) |
| `DELETE_CONCLUSION` | `{ topicId, conclusionId }` (auteur uniquement) |
| `SET_CONCLUSION_VOTE` | `{ topicId, conclusionId }` (choix unique) |
| `REMOVE_CONCLUSION_VOTE` | `{ topicId }` |

### Traitement serveur (`applyAction`)

1. Prendre un verrou (`LockService`).
2. Lire la dernière version du JSON.
3. Si `actionId` ∈ `processedActionIds` → renvoyer l'état courant (doublon).
4. Valider l'action (`validateAction`).
5. Appliquer l'action (`reduce`).
6. Incrémenter `revision`, mettre à jour `updatedAt`, ajouter `actionId`.
7. Écrire le JSON, libérer le verrou, renvoyer le nouvel état.

### Réponses de l'API

- `GET ?mode=revision` → `{ "revision": n, "updatedAt": "…" }`
- `GET ?mode=state` → état complet (sans `processedActionIds`)
- `POST` (corps = action) →
  `{ "ok": true, "revision": n, "state": {…}, "duplicate": false }`
  ou `{ "ok": false, "error": "message" }`

### Code d'accès (authentification)

Si un code d'accès est configuré (`setPassword()` côté script), **chaque**
requête doit fournir un jeton d'authentification, sinon la réponse est
`{ "ok": false, "error": "Code d'accès requis ou incorrect.", "code": "auth" }`.

- Le jeton est `SHA-256("srv|" + sel + "|" + code)` en hexadécimal, envoyé en
  paramètre `auth` (ex. `?mode=revision&auth=…`).
- Le serveur stocke uniquement le **hachage** du code (jamais le code en clair).
- L'appareil ne stocke jamais le code : seulement un **vérificateur** distinct,
  `SHA-256("lock|" + sel + "|" + code)`, pour valider le déverrouillage local
  (y compris hors connexion) sans permettre de reconstituer le jeton serveur.

---

## Validation et limites

| Champ | Longueur max |
|---|---|
| Prénom | 50 |
| Titre de sujet | 150 |
| Description de sujet | 3 000 |
| Message | 3 000 |
| Titre de proposition | 200 |
| Description de proposition | 3 000 |
| Conclusion | 5 000 |

Sont refusés : champs obligatoires vides ou uniquement des espaces, statuts ou
votes inconnus, actions sans identifiant ou sans auteur, références vers un
sujet/message/proposition inexistant. Les contenus utilisateur sont toujours
affichés en **texte brut** (jamais via `innerHTML`).
