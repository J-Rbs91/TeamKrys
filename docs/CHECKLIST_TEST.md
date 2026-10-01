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
- [ ] `node tests/navigation.test.js` → tous les tests passent (chaque écran a
      une profondeur déclarée, aucune navigation n'écrit `location.hash` dans son
      coin, les boutons retour dépilent au lieu de naviguer).
- [ ] Les autres tests : `for f in tests/*.test.js; do node "$f" >/dev/null || echo
      "ÉCHEC $f"; done` → aucune ligne « ÉCHEC » (backend, pastille d'état,
      nouveautés, code changé, choix idempotents, service worker, lecture des votes,
      contrat CSS).
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
      Le `.gitignore` ignore tout autre fichier de `apps-script/` par défaut :
      `git check-ignore -v --no-index apps-script/Helpers.gs` le montre ignoré, et
      la même commande sur `apps-script/Code.gs` ne le déclare pas ignoré.
- [ ] `CONFIG.APP_VERSION` et `CACHE_VERSION` incrémentés **ensemble**.

## 0 bis. Geste retour — sur un téléphone, en comptant les appuis

Ces six-là ne se vérifient pas autrement : le défaut qu'elles attrapent ne
produit aucune erreur, ne casse aucun test, et ne se voit pas sur un ordinateur.
Le raisonnement est dans [`NAVIGATION.md`](NAVIGATION.md).

- [ ] Sujets → un sujet → ses propositions, puis retour jusqu'à sortir :
      **deux appuis**, pas trois.
- [ ] Ouvrir trois sujets voisins à la file : **un seul appui** ramène à la
      liste.
- [ ] Fermer une feuille ou une modale, puis appuyer sur retour : elle **ne
      revient pas**.
- [ ] Créer un sujet depuis la modale, puis appuyer sur retour : on revient à la
      **liste**, pas au formulaire.
- [ ] Depuis les propositions, comparer le bouton retour de l'en-tête et celui
      du système : **même écran**.
- [ ] Ouvrir un lien partagé vers un sujet, puis appuyer sur retour : on **monte
      dans l'arbre**, on ne sort pas de l'application au premier appui.

## 1. Premier lancement

- [ ] Écran d'accueil : adresse du script + code d'accès.
- [ ] Adresse invalide → message d'erreur clair, on reste sur l'écran.
- [ ] Mauvais code → « Code d'accès refusé par le serveur. »
- [ ] Bon code → passage à l'écran du nom.
- [ ] « Continuer sans connexion (mode local) » fonctionne et affiche **Mode local**.
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
      lu **avant** les commandes. **Noter mot pour mot** ce qui est entendu à
      l'apparition : un « boîte de dialogue » sans nom est un défaut, pas un détail.
- [ ] Le titre est entendu **une** fois, pas deux.
- [ ] Le **paragraphe** du panneau est lu — à l'étape 1 **comme aux suivantes**. C'est
      la charge utile ; le titre seul ne suffit pas.
- [ ] « Suivant » : le nouveau numéro d'étape est **annoncé** sans toucher l'écran.
- [ ] Balayage en boucle : on ne sort jamais du panneau ; rien de l'écran du dessous
      n'est lu.
- [ ] « Passer » ou « Commencer » : le focus atterrit sur un élément de l'écran réel,
      et le lecteur d'écran l'annonce.
- [ ] Clavier externe : Tab fait le tour des commandes, un contour de focus est
      **visible** sur chacune, Échap ferme. À faire sur un appareil ≥ iOS 15.4 **et**
      sur la sonde 15.0–15.3, où la séquence est non modale : c'est là que le clavier
      devient le seul moyen de s'orienter, et l'indicateur de focus y est désormais
      doublé par `:focus` — vérifier qu'il est bien là.
- [ ] Tab atteint « Précédent » avant « Passer », alors que « Passer » est à gauche à
      l'écran : décalage assumé (une sortie ne doit pas précéder le chemin principal),
      à constater sans en faire un blocage.
- [ ] Police système au maximum (200 %), portrait **et** paysage : aucun texte
      tronqué, « Suivant » reste atteignable, au besoin en faisant défiler le panneau.
- [ ] iPhone à encoche, paysage : aucune commande sous la barre gestuelle ni sous
      l'encoche.
- [ ] Réglages → Réduire les animations : chaque panneau est **pleinement visible**.
      Aucun écran vide, aucune carte figée à mi-parcours.
- [ ] Pincer pour zoomer pendant la séquence : le zoom fonctionne.
- [ ] Aperçu d'impression du mode réunion : aucune trace du calque.
- [ ] « Précédent » depuis l'étape 2 : le focus n'est pas perdu, et rien n'annonce un
      retour en haut du document. (Le bouton se masque alors qu'il peut porter le focus.)
- [ ] Police système à **130 %** en plus de 200 % : la rangée de commandes ne déborde
      pas, et **aucun défilement horizontal** n'apparaît dans la feuille.
- [ ] Panneau 5 sous mouvement réduit : anneau du monogramme **complet** et point
      présent — c'est le seul composant réutilisé que le test statique ne couvre pas.
- [ ] Geste de retour du système pendant la séquence : il **ferme** le panneau. Il ne
      doit jamais naviguer en laissant le panneau ouvert sur un autre écran.
- [ ] Provoquer une erreur de synchronisation pendant la séquence (mode avion) : le
      message est **dit au démontage**, pas perdu.
- [ ] Navigation privée → Réglages → « Revoir la présentation » : l'application dit que
      cet appareil n'enregistre rien, et le dit **après** la séquence, pas sous elle.
- [ ] Sonde tier B **avec VoiceOver actif** : le panneau est-il atteint au balayage, à
      quel rang, l'arrière-plan est-il lu, Échap ferme-t-il ?
- [ ] iPhone resté en iOS 15.0–15.3 (sonde tier B) : la séquence s'affiche en carte
      **non modale** sans voile, reste navigable, et aucune erreur n'apparaît. C'est
      la dégradation attendue.

### 1 quater. Noms accessibles des calques

- [ ] Ouvrir une feuille (infos d'un sujet, menu d'un message) et une fenêtre
      (nouveau sujet, confirmation) : chacune s'annonce **avec son titre**, jamais
      « boîte de dialogue » seule.
- [ ] La pastille de synchronisation : passer hors ligne, poser une action, revenir en
      ligne. L'indicateur affiche **Hors ligne (1)**, puis **Synchronisation** ou
      **En attente (1)**, puis **À jour**. Le lecteur d'écran annonce l'entrée en
      attente, hors ligne ou erreur et le retour à **À jour**, sans annoncer chaque
      va-et-vient entre Synchronisation et À jour : il n'y a qu'une région
      d'annonce par écran. À 430 px et moins, le libellé court est affiché
      (« Sync… », « Local ») ; le nom complet reste lu.

### 1 quinquies. Déconnexion et stockage

- [ ] Réglages → « Se déconnecter » : la confirmation nomme les trois oublis **et**
      prévient que les messages anonymes ne seront plus modifiables depuis ce téléphone.
- [ ] Avec des actions en attente : la confirmation les **compte** et annonce leur perte.
- [ ] Après déconnexion : l'écran du **nom** est redemandé, et un message anonyme
      envoyé avant n'offre plus « Modifier ».
- [ ] Diagnostic → « Stockage local » : dit **durable** ou **évinçable**, jamais
      « IndexedDB » seul.
- [ ] Poser une action hors ligne, puis relire le diagnostic : l'état de durabilité a
      été demandé au moins une fois.
- [ ] Précache : renommer temporairement un fichier de la liste critique, publier, et
      vérifier que l'ancienne version **reste en place** au lieu d'être remplacée par
      une version cassée.

### 1 sexies. Clavier : feuilles, fenêtres et bascule Anonyme / Signer

À faire avec un clavier (celui d'un ordinateur, ou un clavier externe sur le
téléphone) : ces contrôles ne se voient pas à la souris ni au doigt.

- [ ] **Tab** reste dans une feuille ou une fenêtre ouverte : après la dernière
      commande il revient à la première, **Maj + Tab** va à la dernière.
- [ ] **Échap** ferme la feuille et rend le focus au bouton qui l'a ouverte.
- [ ] Le fond ne défile pas et ne reçoit pas le focus tant qu'une feuille est
      ouverte.
- [ ] Le bouton **Anonyme / Signer** garde le focus quand on l'actionne et annonce
      l'état du prochain message (« Publié en anonyme » ou « Signé : » suivi du
      nom).

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
- [ ] Code changé côté serveur → l'espace se reverrouille avec « Code d'accès refusé
      par le serveur : saisissez le nouveau code de l'équipe. »
- [ ] Nouveau code saisi sur l'écran de verrouillage → « Nouveau code accepté. » ;
      les actions en attente partent ; rien n'est effacé.
- [ ] Nouveau code saisi hors ligne → « Code d'accès incorrect, ou nouveau code
      impossible à vérifier sans connexion. » ; l'appareil reste verrouillé et la
      file est conservée.
- [ ] Équipe en accès libre qui pose un code → chaque appareil affiche l'écran de
      verrouillage et demande ce code ; le saisir ; la file est conservée.
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
- [ ] Appui sur une bulle → feuille : les 5 réactions (pictogrammes), Citer, Créer
      une proposition, et pour ses propres messages Modifier + Rendre anonyme /
      Signer. Sur son propre message anonyme, la feuille ne propose **aucune
      réaction**.
- [ ] Message cité : la feuille propose **« Aller au message cité »** en tête ;
      elle défile jusqu'à l'original et le fait clignoter. La citation
      elle-même n'est plus tactile.
- [ ] Lecteur d'écran (VoiceOver / TalkBack) : sur trois messages consécutifs
      d'une même personne, **l'auteur est annoncé sur les trois** ; sur un
      message cité, l'expéditeur est annoncé **avant** la personne citée ; un
      message signé verrouillé annonce « verrouillé » (un message anonyme verrouillé
      ne l'annonce pas : rien ne le distingue des autres anonymes).
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
- [ ] Réaction d'une **autre** personne → 🔒 sur un message signé, et « Modifier »
      grisé avec sa raison (« Modifier (verrouillé : quelqu'un y a déjà réagi) ») ;
      la signature reste modifiable. Un message anonyme verrouillé n'a pas de
      cadenas.
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
- [ ] Lecture du vote : « 3 pour · 1 contre · 2 abstentions », puis le pourcentage
      suivi du nombre d'avis exprimés (« 75 % favorables sur 4 avis exprimés ») et la
      participation (« 6 participants sur 8 ont voté », « 1 participant sur 8 a
      voté ») ; jamais « 6 / 8 ». Tout le monde s'est abstenu : « Aucun avis
      exprimé », sans pourcentage.
- [ ] Tendance affichée : Aucun vote / Abstentions uniquement / Avis exprimés
      favorables / Avis partagés / Avis exprimés plutôt favorables / Avis exprimés
      plutôt défavorables (ce sont les libellés de l'écran, pas ceux de
      `Core.voteSummary`).
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
- [ ] Action hors ligne → affichage immédiat, indicateur **Hors ligne (n)** (réseau
      coupé) ; **En attente (n)** quand le réseau est là mais que l'envoi n'a pas
      abouti.
- [ ] Rechargement hors ligne → la file **survit** (IndexedDB).
- [ ] Retour du réseau → envoi automatique, indicateur **À jour**.
- [ ] Jamais « À jour » tant qu'il reste des actions en attente.
- [ ] Action devenue impossible (sujet supprimé ailleurs) → « Action refusée :
      (raison). Texte : « … » » (le texte saisi est repris) et file débloquée.
- [ ] Panne du serveur (verrou Drive dépassé, erreur Drive, page HTML) : l'action
      reste en file, l'indicateur passe à **Erreur (n)** dès le 2e échec avec le
      message « Le serveur ne répond pas correctement : vos actions sont gardées et
      repartiront. », puis **À jour** une fois l'action appliquée une seule fois.
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

### 8 bis. La page qui meurt juste après un envoi

> ⚠️ C'est le scénario du 5 août : message écrit avec du réseau, téléphone
> rangé dans la seconde, message reçu **deux jours plus tard**. Un envoi
> ordinaire meurt avec la page ; ces contrôles vérifient qu'il lui survit.

- [ ] Écrire un message puis, **dans la seconde**, revenir à l'écran d'accueil
      du téléphone (ou fermer l'onglet). Sur l'autre appareil, le message
      arrive **sans** rouvrir l'application de l'expéditeur.
- [ ] Même chose en coupant le réseau pendant la frappe et en le rétablissant
      avant de fermer : le message part quand même.
- [ ] Après ce rattrapage, rouvrir l'application de l'expéditeur : le message
      n'apparaît **pas en double** (déduplication serveur), et l'indicateur
      redescend à **À jour**.
- [ ] Réglages → « Dernier envoi de secours » apparaît après un tel envoi. S'il
      apparaît à *chaque* message, la voie ordinaire ne passe plus : regarder
      « Rythme actuel » et le nombre d'échecs.
- [ ] Un message pas encore parti affiche **« envoi… »** à la place de son
      heure ; l'heure s'affiche dès qu'il est remis.
- [ ] Écrire un message **pendant** qu'une lecture est en cours (envoyer depuis
      les deux appareils en même temps) : le message envoyé **ne disparaît
      jamais** de l'écran de son auteur, même une fraction de seconde.

### 8 ter. Sauvegarde, rattachement et restauration (éditeur Apps Script)

- [ ] `backupNow()` crée `brainsto-data.json.manuel.<date>` dans le dossier du
      fichier de données.
- [ ] `diagnoseStorage()` : `used` est le fichier attendu (identifiant, dossier,
      taille, date, révision) ; `candidates` liste chaque `brainsto-data.json` ;
      `warning` est absent quand il n'y a qu'un fichier.
- [ ] Deux fichiers `brainsto-data.json` sans rattachement : le service refuse (les
      téléphones affichent **Erreur** et gardent leurs actions), le message liste
      chaque fichier et dit comment rattacher le bon ; `setupProject()` n'en
      rattache aucun ; rien n'est supprimé. Avec `DATA_FILE_ID` ou la propriété
      `BRAINSTO_FILE_ID`, le rattachement l'emporte.
- [ ] `restoreFromBackup("<identifiant de la copie>")`, appelée par une fonction
      temporaire : la révision devient le plus grand des deux numéros plus un, une
      copie `avant-restauration` est créée, le rattachement ne change pas, aucun
      fichier n'est supprimé, et un téléphone resté sur l'ancienne révision recharge
      l'état restauré (jamais « À jour » sur l'ancien état).
- [ ] La fonction temporaire est supprimée une fois la restauration faite.

## 9. PWA

- [ ] Installation sur l'écran d'accueil (iPhone et Android), icône monogramme.
- [ ] Démarrage à froid hors ligne : la coquille se charge.
- [ ] Réseau connecté mais muet (lie-fi) ou réponse 503 du site : l'application
      installée **démarre depuis le cache** sans écran blanc ; HTML et scripts sont
      toujours de la même version.
- [ ] Nouvelle version publiée → bandeau « nouvelle version disponible » ;
      « Mettre à jour » recharge ; **aucune boucle de rechargement** au premier
      chargement.
- [ ] Les appels API ne sont jamais servis depuis le cache.

## 10. Finition

- [ ] Thèmes clair et sombre corrects (sombre en vrai noir).
- [ ] Cibles tactiles : 24 px au minimum dans les deux sens (WCAG 2.5.8, la règle
      tenue). La plupart des commandes atteignent 44 px (`--tap`) ; les plus petites
      (réactions, boutons `btn-sm`) mesurent de 24 à 36 px de haut, délibérément.
      Rien sous l'encoche ni sous la barre d'accueil.
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
