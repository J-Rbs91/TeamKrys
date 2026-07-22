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
  "conclusion": "",
  "conclusionUpdatedAt": null,
  "conclusionUpdatedBy": null
}
```

Statuts : `open`, `ready`, `closed`, `archived`.

### Message

```json
{
  "id": "uuid",
  "authorId": "uuid-local",
  "authorName": "Prénom",
  "text": "Contenu du message",
  "createdAt": "date ISO",
  "updatedAt": null
}
```

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
| `CREATE_TOPIC` | `{ topicId, title, description }` |
| `UPDATE_TOPIC` | `{ topicId, title, description }` |
| `CHANGE_TOPIC_STATUS` | `{ topicId, status }` |
| `CREATE_MESSAGE` | `{ topicId, messageId, text }` |
| `UPDATE_MESSAGE` | `{ topicId, messageId, text }` |
| `CREATE_PROPOSAL` | `{ topicId, proposalId, title, description }` |
| `UPDATE_PROPOSAL` | `{ topicId, proposalId, title, description }` |
| `CHANGE_PROPOSAL_STATUS` | `{ topicId, proposalId, status }` |
| `SET_VOTE` | `{ topicId, proposalId, vote }` |
| `REMOVE_VOTE` | `{ topicId, proposalId }` |
| `UPDATE_CONCLUSION` | `{ topicId, conclusion }` |

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
