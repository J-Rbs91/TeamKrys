# Liste de vérification manuelle

À dérouler après déploiement. Cochez au fur et à mesure.

## Fonctionnel

- [ ] Première ouverture : demande du prénom, création d'un profil local.
- [ ] Modification du prénom depuis Paramètres.
- [ ] Création d'un sujet (titre + description).
- [ ] Édition du titre et de la description d'un sujet.
- [ ] Ajout d'un message dans la discussion.
- [ ] Modification de son propre message (mention « modifié »).
- [ ] Création d'une proposition depuis le sujet.
- [ ] Création d'une proposition depuis un message.
- [ ] Vote Pour / Contre / Abstention.
- [ ] Modification d'un vote.
- [ ] Retrait d'un vote.
- [ ] Compteurs, pourcentage et indicateur corrects (consensus, majorité…).
- [ ] Changement de statut d'une proposition (les 5 statuts).
- [ ] Rédaction et enregistrement d'une conclusion (auteur + date affichés).
- [ ] Changement de statut d'un sujet (Ouvert / Prêt / Traité / Archivé).
- [ ] Recherche, filtre par statut et tri par activité.
- [ ] Écran Réunion : synthèse correcte, filtres.
- [ ] Bouton « Imprimer la synthèse » : rendu propre (sans boutons/navigation).

## Synchronisation (nécessite l'API Apps Script)

- [ ] Deux navigateurs voient les mêmes sujets.
- [ ] Un message publié apparaît dans l'autre navigateur en quelques secondes.
- [ ] Deux actions quasi simultanées ne s'écrasent pas (verrou serveur).
- [ ] Une même action rejouée n'est appliquée qu'une fois (`processedActionIds`).
- [ ] La révision augmente correctement (Paramètres → diagnostic).
- [ ] L'indicateur est fiable : jamais « À jour » avec des actions en attente.

## Hors connexion

- [ ] Couper le réseau : les dernières données restent consultables.
- [ ] Créer un message hors connexion → « Modifications en attente ».
- [ ] L'action reste dans la file après fermeture/réouverture de l'onglet.
- [ ] Rétablir le réseau → envoi automatique, indicateur « À jour ».
- [ ] Aucun texte rédigé n'est perdu (y compris pendant une saisie).

## Mise à jour de l'application

- [ ] Bumper `APP_VERSION` + `CACHE_VERSION`, republier.
- [ ] Bandeau « Nouvelle version disponible » + bouton « Mettre à jour ».
- [ ] Après mise à jour : données locales conservées.
- [ ] Après mise à jour : actions en attente conservées.

## Mobile

- [ ] Utilisation confortable sur petit écran (portrait).
- [ ] Boutons suffisamment grands (cibles tactiles ≥ 44 px).
- [ ] Formulaires lisibles, pas de débordement horizontal.
- [ ] Discussion et propositions faciles à parcourir.
- [ ] « Ajouter à l'écran d'accueil » installe la PWA.

## Notes

Les tests « Synchronisation » et l'installation PWA complète requièrent le
déploiement Apps Script + HTTPS (GitHub Pages). En local sans API, l'application
reste testable en « mode local ».
