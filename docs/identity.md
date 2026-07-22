# Identification des participants (légère)

**Aucune authentification individuelle forte** n'est demandée.

## Fonctionnement

- À la **première ouverture**, l'utilisateur saisit son **prénom ou pseudonyme**.
- Un **UUID** est généré via `crypto.randomUUID()`.
- L'identité est stockée dans **`localStorage`** :

  ```json
  {
    "participantId": "UUID",
    "displayName": "Prénom"
  }
  ```

- L'utilisateur peut **modifier son nom d'affichage** (bouton « Changer de nom »)
  tout en conservant le même UUID.
- Le participant est identifié **fonctionnellement par son UUID local**.

Source : [`js/teamkrys-participant.js`](../js/teamkrys-participant.js).

## Limites (assumées)

- Un utilisateur peut **effacer son stockage local** (et donc perdre / réinitialiser
  son identité).
- Un utilisateur peut **techniquement changer d'identité**.
- Le système convient à une **petite équipe de confiance**.
- Ce **n'est pas un système d'identité sécurisé** : les UUID ne sont pas
  vérifiés côté serveur et un participant peut en usurper un autre.
