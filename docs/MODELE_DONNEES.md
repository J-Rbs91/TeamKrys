# Modèle de données et actions

Un seul fichier JSON, sur Google Drive. Le frontend n'écrit jamais ce fichier :
il envoie des **actions**, que le backend applique sur la dernière version.

La référence exécutable de ce document est [`js/state.js`](../js/state.js) ;
le backend Apps Script en est la copie conforme, vérifiée par
[`tests/parity.test.js`](../tests/parity.test.js).

---

## Structure

```
data = {
  revision,               // entier, +1 à chaque action appliquée
  updatedAt,              // ISO 8601
  participants: [ { id, name } ],
  topics: [ topic ],
  processedActionIds: []  // 500 derniers identifiants traités (anti-doublon)
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
| `SET_REACTION` | `topicId`, `messageId`, `emoji` |
| `CREATE_PROPOSAL` | `topicId`, `proposalId`, `title`, `description` |
| `UPDATE_PROPOSAL` | `topicId`, `proposalId`, `title`, `description` |
| `CHANGE_PROPOSAL_STATUS` | `topicId`, `proposalId`, `status` |
| `SET_VOTE` | `topicId`, `proposalId`, `value` |
| `REMOVE_VOTE` | `topicId`, `proposalId` |
| `ADD_CONCLUSION` | `topicId`, `conclusionId`, `text` |
| `UPDATE_CONCLUSION_ITEM` | `topicId`, `conclusionId`, `text` |
| `DELETE_CONCLUSION` | `topicId`, `conclusionId` |
| `SET_CONCLUSION_VOTE` | `topicId`, `conclusionId` |
| `REMOVE_CONCLUSION_VOTE` | `topicId` |

L'auteur d'une action est toujours pris dans l'enveloppe (`actorId`,
`actorName`) : le contenu anonyme n'enregistre donc aucune identité.

---

## Règles métier

- Réactions autorisées : **👌 💪 🤞 🤏 👎 💩** — toute autre valeur est refusée,
  côté serveur comme côté application.
- Une réaction par personne et par message ; la même réaction rejouée la retire.
- Un vote par personne et par proposition ; le même vote rejoué le retire.
- Conclusion : **choix unique** par personne — voter ailleurs déplace le vote.
- Supprimer une conclusion retire aussi les votes qui la visaient.
- Un message n'est plus modifiable dès qu'une **autre** personne y a réagi ;
  sa signature (anonyme / signé) reste modifiable.
- Anonyme ⇒ `authorId = ""` et `authorName = "Anonyme"` : l'identité est
  effacée des données partagées. L'auteur garde ses droits grâce à un suivi
  **local** des identifiants créés sur son appareil, jamais transmis.
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

## Indicateur de vote

Dans l'ordre d'évaluation :

1. aucun vote → **Aucun vote** ;
2. uniquement des abstentions → **Avis partagés** ;
3. aucun contre → **Consensus favorable** ;
4. pour = contre → **Avis partagés** ;
5. pour > contre → **Majorité favorable** ;
6. sinon → **Majorité défavorable**.

Le pourcentage favorable est calculé **hors abstentions**.
