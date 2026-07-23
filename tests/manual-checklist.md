# Liste de vérification manuelle

À dérouler après déploiement. Cochez au fur et à mesure.

## Accueil (onboarding)

- [ ] Première ouverture : écran « Connexion à l'équipe » avec champ URL.
- [ ] Coller une URL puis « Enregistrer et continuer » → écran du nom.
- [ ] « Continuer sans connexion (mode local) » → écran du nom directement.
- [ ] Saisie du nom d'utilisateur → écran principal.
- [ ] Liste vide : bouton « Ajouter un sujet » centré au milieu de l'écran.
- [ ] Liste non vide : bouton rond « + » en bas à droite (FAB).
- [ ] Thème sombre automatique correct (système en mode sombre).

## Fonctionnel

- [ ] Modification du nom d'utilisateur depuis Réglages.
- [ ] Création d'un sujet (titre obligatoire, description facultative, nom).
- [ ] Nom laissé vide → auteur affiché « Anonyme ».
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
- [ ] Après publication d'un message, le composeur se vide.
- [ ] Réagir à un message (👌 💪 🤞 🤏 👎 💩) : le compteur s'affiche, ma
      réaction est mise en évidence ; recliquer la retire ; changer d'emoji la
      remplace.

## Anonymat, signature, citation

- [ ] Créer un sujet en laissant le nom vide → créateur affiché « Anonyme ».
- [ ] Message signé de son nom par défaut.
- [ ] « Rendre anonyme » → affiche « Anonyme » ; « Signer avec mon nom » → revient.
- [ ] Modifier son message tant que personne n'a réagi.
- [ ] Après une réaction d'une AUTRE personne : le message est verrouillé (🔒),
      « Modifier » disparaît ; la signature reste modifiable.
- [ ] « Citer » un message : bandeau de réponse, puis le nouveau message affiche
      le message cité (clic → retour à l'original).

## Code d'accès (verrouillage)

- [ ] Script : `setPassword()` puis vérifier `?mode=revision` → erreur `auth`,
      et `?mode=revision&auth=…` → réponse normale.
- [ ] Connexion avec le bon code → accès ; mauvais code → « Code incorrect ».
- [ ] À chaque ouverture (rechargement), l'écran de verrouillage réapparaît.
- [ ] Reverrouillage après une longue mise en arrière-plan.
- [ ] « Se déconnecter de l'équipe » oublie l'URL et le code.
- [ ] `clearPassword()` : l'accès ne demande plus de code.
- [ ] Changement de statut d'un sujet (Ouvert / Prêt / Traité / Archivé).
- [ ] Recherche (au-delà de 6 sujets) et affichage/masquage des archivés.
- [ ] Écran Réunion (via Réglages) : synthèse correcte, filtres.
- [ ] Bouton « Imprimer » : rendu propre (sans boutons/navigation).

## Conclusion

- [ ] Écran « Conclusion » : « Ajouter une conclusion » (regroupe des
      propositions).
- [ ] Vote pour une conclusion (choix unique) : voter pour une autre déplace le
      vote ; « En tête » sur la mieux votée.
- [ ] Modification/suppression d'une conclusion par son auteur uniquement.
- [ ] Supprimer une conclusion retire aussi les votes qui la visaient.

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
