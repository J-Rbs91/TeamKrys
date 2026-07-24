# Checklist de recette

À dérouler avant chaque publication, sur un vrai téléphone (iPhone **et**
Android si possible), en thème clair **et** en thème sombre, avec la console
du navigateur ouverte : **zéro erreur console** attendue.

## 0. Automatique

- [ ] `node tests/parity.test.js` → tous les tests passent.
- [ ] `runSelfTest()` exécutée dans Apps Script → hachages conformes.
- [ ] `git status` propre : aucun `.gs`, aucun `appsscript.json`, aucun secret,
      aucun `node_modules/` ni `package*.json`.
- [ ] `CONFIG.APP_VERSION` et `CACHE_VERSION` incrémentés **ensemble**.

## 1. Premier lancement

- [ ] Écran d'accueil : adresse du script + code d'accès.
- [ ] Adresse invalide → message d'erreur clair, on reste sur l'écran.
- [ ] Mauvais code → « Code d'accès refusé par le serveur. »
- [ ] Bon code → passage à l'écran du nom.
- [ ] « Continuer sans connexion (mode local) » fonctionne et affiche **Local**.
- [ ] Nom vide refusé ; nom saisi → liste des sujets.

## 2. Verrou

- [ ] Fermer puis rouvrir l'application → le code est **redemandé**.
- [ ] Mauvais code → refusé, même en mode avion.
- [ ] Bon code → contenu affiché.
- [ ] Laisser l'app en arrière-plan plus de 3 minutes → reverrouillage au retour.
- [ ] Réglages → « Se déconnecter de l'équipe » → retour à l'écran d'accueil,
      adresse et vérificateur oubliés.

## 3. Sujets

- [ ] Liste vide → bouton « Ajouter un sujet » **centré**.
- [ ] Liste non vide → bouton rond **+** en bas à droite.
- [ ] Titre obligatoire ; description facultative.
- [ ] Nom laissé vide → sujet créé au nom d'**Anonyme**.
- [ ] Plus de six sujets → champ de recherche ; la recherche filtre bien.
- [ ] Sujet archivé masqué ; bouton « Afficher les sujets archivés » ; le choix
      est conservé après rechargement.

## 4. Discussion

- [ ] Mes messages à droite, ceux des autres à gauche avec leur nom.
- [ ] Messages consécutifs d'un même auteur regroupés (nom affiché une fois).
- [ ] Séparateurs de jour (« Aujourd'hui », « Hier », date).
- [ ] Défilement automatique en bas à l'ouverture et après envoi.
- [ ] **Le champ de saisie est vidé après l'envoi** (aucun texte réinjecté).
- [ ] Taper un texte, ouvrir puis fermer une feuille → **le brouillon est intact**,
      curseur compris.
- [ ] Appui sur une bulle → feuille : 6 émojis, Citer, Créer une proposition,
      et pour ses propres messages Modifier + Rendre anonyme / Signer.
- [ ] Réaction posée → pastille sous la bulle, la mienne surlignée ; compteur
      au-delà de 1 ; re-tap = retrait.
- [ ] Citer → aperçu « en réponse à … » annulable ; message publié avec bloc
      cité ; appui sur le bloc → défilement + flash sur l'original.
- [ ] Rendre anonyme après envoi → nom remplacé par « Anonyme » ; re-signer
      restaure le nom ; l'auteur conserve ses droits après rechargement.
- [ ] Réaction d'une **autre** personne → 🔒 et modification refusée ; la
      signature reste modifiable.
- [ ] Barre compacte : compteurs Propositions / Conclusion à jour.
- [ ] Appui sur le titre (ⓘ) → infos du sujet, changement de statut, modification.
- [ ] Bouton **Retour** visible et fonctionnel sur chaque écran secondaire.

## 5. Propositions

- [ ] Création (titre obligatoire, description facultative).
- [ ] Les 5 statuts sélectionnables et conservés.
- [ ] Vote Pour / Contre / Abstention ; re-tap = retrait ; « Retirer mon vote ».
- [ ] Barre de répartition cohérente avec les compteurs.
- [ ] Indicateur : Aucun vote / Avis partagés / Consensus favorable /
      Majorité favorable / Majorité défavorable.
- [ ] Pourcentage favorable calculé **hors abstentions**.

## 6. Conclusion

- [ ] Ajout d'une conclusion ; champ vidé après ajout.
- [ ] Choix unique : voter pour une autre déplace le vote ; re-tap = retrait.
- [ ] Badge **★ En tête** sur la mieux votée.
- [ ] Modification et suppression des siennes ; la suppression retire les votes
      qui la visaient.

## 7. Réunion

- [ ] Réglages → « Ouvrir la synthèse » : tous les sujets non archivés.
- [ ] Propositions avec statut, indicateur et détail des votes.
- [ ] Conclusions triées par nombre de votes, mention « en tête ».
- [ ] Aperçu avant impression : barres, boutons et bandeaux masqués.

## 8. Synchronisation et hors ligne

- [ ] Deux appareils : une action apparaît sur l'autre en quelques secondes.
- [ ] Mode avion : l'application s'ouvre et affiche les dernières données.
- [ ] Action hors ligne → affichage immédiat, indicateur **En attente (n)**.
- [ ] Rechargement hors ligne → la file **survit** (IndexedDB).
- [ ] Retour du réseau → envoi automatique, indicateur **À jour**.
- [ ] Jamais « À jour » tant qu'il reste des actions en attente.
- [ ] Action devenue impossible (sujet supprimé ailleurs) → message clair et
      file débloquée.
- [ ] Code invalidé côté serveur → reverrouillage immédiat.

## 9. PWA

- [ ] Installation sur l'écran d'accueil (iPhone et Android), icône monogramme.
- [ ] Démarrage à froid hors ligne : la coquille se charge.
- [ ] Nouvelle version publiée → bandeau « nouvelle version disponible » ;
      « Mettre à jour » recharge ; **aucune boucle de rechargement** au premier
      chargement.
- [ ] Les appels API ne sont jamais servis depuis le cache.

## 10. Finition

- [ ] Thèmes clair et sombre corrects (sombre en vrai noir).
- [ ] Cibles tactiles ≥ 44 px, rien sous l'encoche ni sous la barre d'accueil.
- [ ] Aucune police externe chargée (onglet Réseau : aucune requête de police).
- [ ] Un message contenant `<script>alert(1)</script>` s'affiche **en texte**.
