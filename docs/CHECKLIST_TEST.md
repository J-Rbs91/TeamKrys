# Checklist de recette

À dérouler avant chaque publication, sur un vrai téléphone (iPhone **et**
Android si possible), en thème clair **et** en thème sombre, avec la console
du navigateur ouverte : **zéro erreur console** attendue.

## 0. Automatique

- [ ] `node tests/parity.test.js` → tous les tests passent.
- [ ] `node tests/sync.test.js` → tous les tests passent.
- [ ] `node tests/session.test.js` → tous les tests passent.
- [ ] `node tests/onboarding.test.js` → tous les tests passent (règle de
      présentation, reconnaissance des appareils déjà utilisés, invariant de repli
      lu dans `css/app.css`).
- [ ] `node tests/qa/compat-scan.js` → rien de bloquant au tier A ou B
      (fonctions hors baseline, replis CSS écrits à l'envers, champs sous 16 px).
- [ ] `runSelfTest()` exécutée dans Apps Script → hachages conformes.
- [ ] `apps-script/Code.gs` : `ACCESS_CODE` et `DATA_FILE_ID` **vides** dans le
      dépôt (vérifié par `parity.test.js`, à relire tout de même avant de
      committer).
- [ ] `BACKEND_VERSION` incrémentée si `Code.gs` a changé — c'est elle qui
      déclenche la sauvegarde automatique avant la première écriture.
- [ ] `git status` propre : aucun secret, aucun `node_modules/` ni
      `package*.json`. Les seuls fichiers backend versionnés sont
      `apps-script/Code.gs` et `apps-script/appsscript.json`.
- [ ] `CONFIG.APP_VERSION` et `CACHE_VERSION` incrémentés **ensemble**.

## 1. Premier lancement

- [ ] Écran d'accueil : adresse du script + code d'accès.
- [ ] Adresse invalide → message d'erreur clair, on reste sur l'écran.
- [ ] Mauvais code → « Code d'accès refusé par le serveur. »
- [ ] Bon code → passage à l'écran du nom.
- [ ] « Continuer sans connexion (mode local) » fonctionne et affiche **Local**.
- [ ] Nom vide refusé ; nom saisi → liste des sujets.

### 1 bis. Présentation initiale

À jouer sur un stockage **vidé** (outils de développement → Application → Effacer
les données du site), sinon l'appareil est reconnu comme déjà utilisé et la
présentation ne s'affiche pas — c'est le comportement voulu.

- [ ] Après le nom, la présentation s'affiche **une fois**, en feuille basse, avec
      l'écran des sujets assombri derrière.
- [ ] Elle n'apparaît **jamais** sur l'écran de connexion, ni sur le verrou, ni sur
      l'écran du nom. Le champ de code reste saisissable au premier rendu.
- [ ] Espace vide → **cinq** panneaux. Espace déjà peuplé → **deux**. Mode local →
      **trois**, sans vote ni réunion. Le compteur suit.
- [ ] « Suivant » avance, « Précédent » revient, « Passer » sort. Au dernier panneau,
      « Suivant » devient « Commencer » et « Passer » disparaît.
- [ ] Fermer l'application au 3ᵉ panneau puis rouvrir → on **reprend au 3ᵉ**.
- [ ] Après « Commencer » ou « Passer », recharger → la présentation **ne revient pas**.
- [ ] Sur un appareil qui utilisait déjà l'application, après mise à jour → elle ne
      s'affiche **pas du tout**, et les réglages disent « vous utilisiez déjà
      l'application ».
- [ ] Provoquer un reverrouillage pendant la séquence (`LOCK_IDLE_MS` abaissé) → le
      verrou **prime**, le calque disparaît, et la séquence reprend à la même étape
      après déverrouillage.
- [ ] Réglages → « Revoir la présentation » → elle rejoue depuis le premier panneau.
      Un prénom en cours de saisie dans « Votre nom » **reste intact**.
- [ ] Mode avion : la séquence s'affiche et se ferme sans erreur.
- [ ] Aucune action n'est produite : Réglages → « Actions en attente » et
      « Révision » inchangés avant et après.

### 1 ter. Présentation — accessibilité

- [ ] VoiceOver / TalkBack : le dialogue s'annonce **avec son titre**, et le titre est
      lu **avant** les commandes.
- [ ] « Suivant » : le nouveau numéro d'étape est **annoncé** sans toucher l'écran.
- [ ] Balayage en boucle : on ne sort jamais du panneau ; rien de l'écran du dessous
      n'est lu.
- [ ] « Passer » ou « Commencer » : le focus atterrit sur un élément de l'écran réel,
      et le lecteur d'écran l'annonce.
- [ ] Clavier externe : Tab fait le tour des commandes, un contour de focus est
      **visible** sur chacune, Échap ferme. ⚠️ Sous iOS 15.0–15.3, l'indicateur de
      focus est absent — défaut connu du thème, pas de la séquence.
- [ ] Police système au maximum (200 %), portrait **et** paysage : aucun texte
      tronqué, « Suivant » reste atteignable, au besoin en faisant défiler le panneau.
- [ ] iPhone à encoche, paysage : aucune commande sous la barre gestuelle ni sous
      l'encoche.
- [ ] Réglages → Réduire les animations : chaque panneau est **pleinement visible**.
      Aucun écran vide, aucune carte figée à mi-parcours.
- [ ] Pincer pour zoomer pendant la séquence : le zoom fonctionne.
- [ ] Aperçu d'impression du mode réunion : aucune trace du calque.
- [ ] iPhone resté en iOS 15.0–15.3 (sonde tier B) : la séquence s'affiche en carte
      **non modale** sans voile, reste navigable, et aucune erreur n'apparaît. C'est
      la dégradation attendue.

## 2. Verrou

- [ ] Fermer puis rouvrir l'application dans la foulée → **aucun code demandé**,
      le contenu s'affiche directement.
- [ ] Mauvais code → refusé, même en mode avion.
- [ ] Bon code → contenu affiché.
- [ ] Plus d'une heure sans toucher à l'application → le code est **redemandé**,
      qu'elle ait été fermée, en arrière-plan ou laissée ouverte à l'écran.
      (Pour ne pas attendre une heure : ramener `LOCK_IDLE_MS` à `60 * 1000`
      dans `js/config.js` le temps du test, **et le remettre ensuite**.)
- [ ] Verrouillé par inactivité, puis bon code → on revient sur le contenu et la
      synchronisation repart.
- [ ] Code changé côté serveur, puis reconnexion avec le nouveau code → l'ancienne
      session n'ouvre plus rien.
- [ ] Réglages → « Se déconnecter de l'équipe » → retour à l'écran d'accueil,
      adresse et vérificateur oubliés.

## 3. Sujets

- [ ] Espace vide : l'état vide propose « Ajouter un sujet » **et** une ligne
      « Ensuite : … » qui annonce le reste du cycle.
- [ ] Recherche sans résultat : le terme cherché est rappelé, et un bouton
      « Effacer la recherche » ramène la liste. Ce n'est **pas** le même écran que
      l'espace vide.

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
- [ ] iPhone : toucher le champ de message → **la page ne zoome pas**, la barre
      du haut reste en place. Idem avec un brouillon en cours et avec l'aperçu
      « en réponse à … » ouvert.
- [ ] Saisir cinq lignes : le champ s'arrête à quatre lignes puis défile, la
      dernière ligne n'est pas rognée en bas.
- [ ] Ouvrir une discussion depuis une liste **déjà défilée** : le composeur est
      en place dès l'affichage, il ne remonte pas sous le pouce.
- [ ] Bloc cité : fond visible et distinct du message, dans les **quatre** cas —
      mon message / message d'un autre × thème clair / thème sombre. À vérifier
      sur un iPhone en iOS 15.4 ou 16.1, sinon on ne teste que le cas qui
      fonctionnait déjà.
- [ ] Taper un texte, ouvrir puis fermer une feuille → **le brouillon est intact**,
      curseur compris.
- [ ] Appui sur une bulle → feuille : 6 émojis, Citer, Créer une proposition,
      et pour ses propres messages Modifier + Rendre anonyme / Signer.
- [ ] Message cité : la feuille propose **« Aller au message cité »** en tête ;
      elle défile jusqu'à l'original et le fait clignoter. La citation
      elle-même n'est plus tactile.
- [ ] Lecteur d'écran (VoiceOver / TalkBack) : sur trois messages consécutifs
      d'une même personne, **l'auteur est annoncé sur les trois** ; sur un
      message cité, l'expéditeur est annoncé **avant** la personne citée ; un
      message verrouillé annonce « verrouillé ».
- [ ] Message en cours d'écriture, application en arrière-plan au-delà du délai
      d'inactivité, retour et déverrouillage : **le brouillon est toujours là**.
- [ ] Erreur pendant la saisie, clavier ouvert (couper le réseau et envoyer) :
      le message d'erreur est **visible à l'écran**.
- [ ] Composeur qui grandit jusqu'à 4 lignes, ou aperçu « en réponse à … »
      ouvert : le dernier message du fil reste visible au-dessus du champ.
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
- [ ] iPhone : ouvrir le menu de statut → **la page ne zoome pas** ; à la
      fermeture, l'affichage est identique à avant l'appui.
- [ ] Changer un statut affiche une confirmation à l'écran (« *titre* :
      *statut*. »), et le lecteur d'écran l'annonce.
- [ ] Lecteur d'écran, écran de propositions : les menus de statut portent des
      noms **distincts**, incluant le titre de chaque proposition.
- [ ] Écran de 320 px : le menu de statut occupe sa propre ligne, pleine
      largeur, et « Mise en place » s'affiche **en entier**. « Retirer mon vote »
      et « Modifier » restent atteignables sans défilement horizontal.
- [ ] Le menu de statut ne devient pas l'élément le plus voyant de la carte :
      le titre de la proposition reste dominant.
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
- [ ] Réglages → **Code d'espace identique** sur les deux appareils. Deux codes
      différents = deux scripts différents, et c'est la première explication à
      « je ne vois pas les messages des autres ».
- [ ] Réglages → **Dernier échange** avance tout seul ; **Rythme actuel**
      descend vers 1,8 s pendant une conversation et remonte vers 6 s au repos.
- [ ] Ouvrir l'application depuis un lien partagé dans **WhatsApp / Instagram /
      Messenger** (fenêtre in-app) : si Réglages affiche « Stockage local :
      mémoire — non persistant », un bandeau l'a annoncé — et **les messages
      partent quand même** vers les autres appareils.
- [ ] Laisser l'application ouverte dix minutes sans rien faire, puis écrire
      depuis l'autre appareil : le message arrive **sans** avoir à toucher
      l'écran (la boucle au repos reste vivante).
- [ ] Réglages → « Synchroniser maintenant » sur un fil déjà à jour : **le
      défilement ne saute pas** et l'écran ne clignote pas.

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
- [ ] Barre d'URL **affichée**, écran qui tient en une page : aucun défilement
      résiduel. Écran de discussion : composeur et bouton d'envoi entièrement
      visibles sans faire défiler la page. Idem sur Chrome **et** Samsung
      Internet, et sur un téléphone sans `dvh` si l'équipe en possède un
      (Chrome < 108, Samsung Internet < 21, iOS 15.0–15.3).
- [ ] Aucune police externe chargée (onglet Réseau : aucune requête de police).
- [ ] Un message contenant `<script>alert(1)</script>` s'affiche **en texte**.

## 11. Navigateurs

Trois passes obligatoires — iPhone (WebKit), Android (Blink), Firefox Android
(Gecko) — plus les passes conditionnelles : [`QA_NAVIGATEURS.md`](QA_NAVIGATEURS.md).
Un navigateur non observé n'est pas un navigateur validé.
