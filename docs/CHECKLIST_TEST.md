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
      contrat CSS, démarrage robuste, focus, champs nommés, actions retenues,
      recherche et synthèse, brouillons).
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

- [ ] Écran d'accueil : « Adresse de l'équipe » + code d'accès (aucun « script » ni « URL » à l'écran).
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
- [ ] Navigateur qui refuse tout stockage (fenêtre intégrée d'une messagerie, ou
      cookies et données de site bloqués) : au démarrage, le message « Ce navigateur
      refuse d'enregistrer des données sur l'appareil : ouvrez BrainstO. dans votre
      navigateur habituel. » s'affiche **une fois**, et une ligne fixe le répète dans
      la carte de connexion ; « Enregistrer et continuer » ne connecte pas (rien
      n'est enregistré ni envoyé). Le mode local reste possible.
- [ ] Adresse du site ouverte en `http` (hors `localhost`) : connexion avec un code →
      « Ce navigateur ne permet pas la connexion. Ouvrez BrainstO. dans Chrome ou
      Safari. » ; même message au déverrouillage, l'appareil reste verrouillé ;
      connexion **sans** code : possible.

### 1 sexies. Clavier : feuilles, fenêtres et interrupteur Anonyme

À faire avec un clavier (celui d'un ordinateur, ou un clavier externe sur le
téléphone) : ces contrôles ne se voient pas à la souris ni au doigt.

- [ ] **Tab** reste dans une feuille ou une fenêtre ouverte : après la dernière
      commande il revient à la première, **Maj + Tab** va à la dernière.
- [ ] **Échap** ferme la feuille et rend le focus au bouton qui l'a ouverte.
- [ ] Le fond ne défile pas et ne reçoit pas le focus tant qu'une feuille est
      ouverte.
- [ ] L'interrupteur **Publier en anonyme** garde le focus quand on l'actionne
      (Espace ou Entrée), garde **le même libellé** dans les deux états, et annonce
      « activé » ou « désactivé » avec le nom du prochain message (« Anonyme » ou
      « Signé : » suivi du nom). Sous VoiceOver et TalkBack : lu comme un interrupteur,
      pas comme un bouton.

### 1 sexies bis. Interrupteur Anonyme et repères de la zone d'écriture

À faire sur téléphone, clair **et** sombre, à 100 % puis avec la police du système
agrandie.

- [ ] Interrupteur éteint : à gauche « Signé : » suivi du prénom, à droite le libellé
      fixe **Publier en anonyme** et la piste claire, bouton à gauche (silhouette).
- [ ] Un appui allume l'interrupteur : le bouton **glisse** vers la droite (masque), la
      piste passe à l'encre, le nom devient **Anonyme** en montant à sa place, en
      moins d'un quart de seconde, sans rebond. Un second appui rejoue l'inverse.
- [ ] Interrupteur allumé : le **champ d'écriture** montre un masque à l'entrée, un bord
      en tirets sur fond creusé, et « Message anonyme… » quand il est vide ; le bouton
      d'envoi porte un petit masque. Tout disparaît à l'extinction.
- [ ] Les repères tiennent **pendant la frappe** (le masque et les tirets restent quand
      le champ contient du texte et grandit sur plusieurs lignes).
- [ ] À 320 px de large : rien ne déborde. Si la ligne est trop étroite, le nom passe
      seul sur sa ligne, l'interrupteur dessous ; avec la police agrandie, le libellé
      passe à la ligne (mots entiers) sans être coupé.
- [ ] Mouvement réduit activé dans le système : aucune animation, l'état change d'un coup.

### 1 sexies ter. Gestes sur les messages

- [ ] **Toucher** un message : rien ne s'ouvre. Faire défiler le fil en partant d'un
      message : rien ne s'ouvre.
- [ ] **Appui long** (une demi-seconde) : le message se tasse pendant l'appui, puis la
      feuille d'actions s'ouvre (vibration brève sur Android) et **reste ouverte** au
      relâcher. Aucune loupe, aucun menu système, aucune sélection de texte.
- [ ] **Glisser vers la droite** : le message suit le doigt, l'icône de citation se
      remplit au-delà du seuil ; au relâcher, l'aperçu « En réponse à … » apparaît et
      le clavier s'ouvre. En dessous du seuil, rien ne se passe.
- [ ] Glisser depuis le **bord gauche** de l'écran : c'est le geste « retour » du
      système, la citation ne s'active pas.
- [ ] **Copier le texte** dans la feuille : le texte est dans le presse-papiers.
- [ ] Rappel « Appui long sur un message… » visible une fois, retiré par **Compris**,
      absent après rechargement.
- [ ] Clavier : Entrée sur un message ouvre la feuille. Souris : clic ou clic droit.
      VoiceOver / TalkBack : double toucher.
- [ ] **Clavier ouvert**, en pleine frappe : toucher l'interrupteur, **Envoyer** ou la
      croix « Annuler la citation » ne ferme pas le clavier ; le curseur reste à sa
      place et la frappe continue. Après **Envoyer**, le champ est vide et le clavier
      toujours là pour le message suivant.
- [ ] Une arrivée de nouveaux messages pendant ou juste après la bascule ne rejoue pas
      l'animation et ne fait pas perdre le texte en cours de saisie.

### 1 septies. Lecteur d'écran : champs, erreurs, titres, mouvement réduit

À faire avec VoiceOver ou TalkBack : ces contrôles ne se voient pas à l'écran.

- [ ] Écran de connexion : chaque champ est annoncé avec son **nom** (« Adresse du
      script de l'équipe », « Code d'accès »), pas seulement avec son texte
      d'exemple ; idem pour « Votre nom », la recherche, le champ de message,
      « Texte du message » (fenêtre Modifier le message) et « Titre » /
      « Description » (fenêtre Modifier le sujet).
- [ ] Nouveau sujet : l'interrupteur **Publier en anonyme** est lu comme un
      interrupteur ; allumé, il annonce « Anonyme » et « Aucune identité ne sera
      enregistrée avec ce sujet. », et le champ « Votre nom » disparaît.
- [ ] Valider un nouveau sujet sans titre : « Le titre du sujet est obligatoire. »
      s'affiche **sous le champ**, le focus y revient, le lecteur d'écran lit le
      message avec le champ, et le message disparaît à la première frappe. Même
      contrôle avec un mauvais code sur l'écran de verrouillage (« Code d'accès
      incorrect. »).
- [ ] Chaque écran a un **titre** annoncé (un seul titre de niveau 1) et repris dans
      l'onglet du navigateur : « Sujets - BrainstO. », le titre du sujet,
      « Propositions : … », « Consensus : … », « Réglages - BrainstO. », « Synthèse
      de réunion - BrainstO. » ; verrouillé : « Espace verrouillé - BrainstO. » (le
      titre du sujet ne reste pas dans l'onglet).
- [ ] Réglage du système « Réduire les animations » activé : « Aller au message
      cité » défile **instantanément** ; désactivé, le défilement est animé.

### 1 octies. Brouillons anonymes, fenêtres « Modifier », noms lus, impression, bandeau, copies

- [ ] Allumer **Publier en anonyme**, taper un brouillon, puis recharger la page (ou
      « Mettre à jour ») : la ligne dit « Anonyme », l'interrupteur est allumé, la note « Brouillon retrouvé sur cet
      appareil. Il sera publié en anonyme : vérifiez avant d'envoyer. » est affichée près
      du champ, et **Envoyer** publie le message sans nom. Dans les outils du navigateur,
      `brainsto.drafts.v1` contient une liste `anon` avec la clé du sujet, et rien
      d'identitaire (ni nom ni identifiant).
- [ ] Brouillon écrit en **Signé**, puis rechargé : pas de liste `anon` dans
      `brainsto.drafts.v1` ; le brouillon revient signé, avec la note « Brouillon
      retrouvé sur cet appareil. Vérifiez « Signé » ou « Anonyme » avant d'envoyer. »,
      et rien n'est converti en anonyme.
- [ ] Brouillon anonyme retrouvé, puis interrupteur **éteint** : la note disparaît et le
      message part signé (le geste est respecté). Sans toucher à l'interrupteur, le message
      ne part **jamais** signé. Avec un brouillon anonyme dans un autre sujet : les
      autres sujets passent aussi en anonyme jusqu'à ce que l'interrupteur soit éteint.
- [ ] « Se déconnecter de l'équipe », puis lecture du stockage du navigateur :
      `brainsto.drafts.v1` **et** `brainsto.seenTopics.v1` sont absents. Au
      reverrouillage d'inactivité d'une heure, au contraire, les deux sont toujours là
      et aucun « Nouveau » en trop n'apparaît après le code.
- [ ] « Modifier le message » refusé pendant la saisie (un collègue vient de réagir) : la
      fenêtre **reste ouverte** avec le texte rédigé, le message d'erreur est visible,
      « Annuler » la ferme. Même contrôle pour « Modifier le sujet », « Modifier la
      proposition » et « Modifier la formulation » quand l'enregistrement est refusé.
- [ ] Lecteur d'écran (VoiceOver ou TalkBack) sur l'accueil : le bouton flottant est lu
      « Nouveau sujet » ; chaque compteur d'une carte est lu avec son unité (« 1 message,
      1 proposition, 1 formulation »), jamais « 1 1 1 ».
- [ ] Appareil en **thème sombre** : Réglages → Ouvrir la synthèse → Imprimer (aperçu ou
      enregistrement en PDF) : le document est en couleurs claires sur fond blanc, tous
      les textes sont lisibles (badges « Prêt pour la réunion » et « En discussion »,
      mentions « proposé par… » comprises) ; l'écran, lui, reste sombre. À faire sur une
      vraie impression ou un vrai PDF : le contrôle automatique n'a émulé que le mode
      impression.
- [ ] Nouvelle version publiée, **VoiceOver ou TalkBack** activé : à l'apparition du
      bandeau, « Une nouvelle version est disponible. » est annoncée **une seule fois**,
      sans fenêtre ni message en plus ; « Mettre à jour » et « Plus tard » s'atteignent
      au toucher et au clavier ; le bandeau est entier à l'écran pendant son entrée (320,
      393 et 768 px de large).
- [ ] Texte du système à 130 % puis 200 %, écran de 320 px : dans le parcours (Discussion,
      Propositions, Consensus) aucun mot n'est coupé en deux, une étape entière passe à
      la ligne (le parcours tient sur deux lignes) ; sur les cartes de l'accueil, le nom
      de l'auteur n'est pas coupé en plein mot et le pied de la carte passe à la ligne.
- [ ] Message signé, copie manuelle (`backupNow()`), puis « Rendre anonyme » : l'état
      partagé est anonyme, mais la copie `brainsto-data.json.manuel.<date>` contient
      encore l'auteur. Vérifier que le dossier `BrainstO.` n'est pas plus partagé que le
      fichier de données ; après `restoreFromBackup` sur cette copie, le message reste
      anonyme.

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
- [ ] Interrupteur **Publier en anonyme** allumé → sujet créé au nom d'**Anonyme**.
- [ ] Interrupteur éteint et nom effacé → « Indiquez votre nom, ou allumez « Publier
      en anonyme ». » sous le champ ; aucun sujet créé.
- [ ] Allumer puis éteindre l'interrupteur : le nom tapé revient.
- [ ] Plus de six sujets → champ de recherche ; la recherche filtre bien.
- [ ] Recherche tolérante : « cafe » trouve « Café », « REUNION » trouve « réunion »,
      « oeuvre » trouve « œuvre », et deux espaces dans la saisie ne gênent pas ; la
      recherche porte sur le titre et la description.
- [ ] Écrire un message dans un sujet du milieu de la liste : au retour sur l'accueil,
      il est **en tête de son groupe** et sa carte dit « Actif à l'instant » ; plus
      tard « Actif il y a 5 min », « Actif il y a 2 h », « Actif il y a 3 jours », puis
      « Actif le jj/mm/aaaa » à partir de sept jours.
- [ ] Ouvrir un lien direct vers un sujet sur un appareil connecté qui n'a pas encore
      reçu les données (stockage vidé, avant le premier échange réussi) : « Contenu
      pas encore disponible sur cet appareil » et « Il s'affichera à la prochaine
      connexion. », jamais « Introuvable » ; après la première synchronisation, un
      lien vers un sujet qui n'existe plus dit « Introuvable ».
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
- [ ] Message en cours d'écriture dans un sujet, puis « Mettre à jour » (ou recharger
      la page, ou fermer l'application et la rouvrir, ou restaurer l'onglet) : le
      texte revient dans le composeur **de ce sujet**, et pas dans celui d'un autre
      sujet, qui garde le sien.
- [ ] Brouillon en cours, espace verrouillé : le texte n'est **jamais** affiché sur
      l'écran de verrouillage ; il revient après le code. Envoyer le message : le
      champ est vidé et le texte ne revient **pas** après un rechargement ; vider le
      champ à la main efface aussi le brouillon ; « Se déconnecter » efface les
      brouillons (rouvrir le sujet après la reconnexion : champ vide).
- [ ] « Modifier le message », « Modifier le sujet » et « Modifier la formulation »
      s'ouvrent avec le texte actuel déjà dans le champ.
- [ ] Créer une proposition depuis un message de plus de 200 caractères : titre = début
      du message, coupé à la fin d'un mot et terminé par « … » (200 caractères au
      plus), description = message en entier. Depuis un message court : titre =
      message, description vide.
- [ ] Erreur pendant la saisie, clavier ouvert (couper le réseau et envoyer) :
      le message d'erreur est **visible à l'écran**.
- [ ] Composeur qui grandit jusqu'à 4 lignes, ou aperçu « en réponse à … »
      ouvert : le dernier message du fil reste visible au-dessus du champ.
- [ ] Réaction posée → pastille sous la bulle, la mienne surlignée ; compteur
      au-delà de 1 ; re-tap = retrait.
- [ ] Citer → aperçu « en réponse à … » annulable ; message publié avec bloc
      cité ; appui sur le bloc → défilement + flash sur l'original.
- [ ] Rendre anonyme après envoi → nom remplacé par « Anonyme », bandeau « Message
      rendu anonyme. », sans question ; l'auteur conserve ses droits après rechargement.
- [ ] « Signer avec mon nom » sur un de ses messages anonymes → fenêtre « Signer avec
      mon nom » qui dit l'effet ; **Annuler** ne change rien ; **Signer** restaure le nom.
- [ ] Réaction d'une **autre** personne → 🔒 sur un message signé, et « Modifier »
      grisé avec sa raison (« Modifier (verrouillé : quelqu'un y a déjà réagi) ») ;
      la signature reste modifiable. Un message anonyme verrouillé n'a pas de
      cadenas.
- [ ] Barre compacte : compteurs Propositions / Conclusion à jour.
- [ ] Appui sur le titre (ⓘ) → infos du sujet, changement de statut, modification.
- [ ] Détails → **Épingler pour toute l'équipe** : bandeau de confirmation ; à
      l'accueil, section **Épinglés** en tête, sur **un autre téléphone** aussi après
      synchronisation. La date « Actif il y a … » ne change pas. **Désépingler** le
      remet dans sa section. Backend non mis à jour : commande grisée avec sa raison.
- [ ] Statut **Clôturé** ou **Archivé** → fenêtre de confirmation ; **Annuler** laisse
      le statut d'avant ; « Prêt pour la réunion » et « En discussion » partent sans
      fenêtre.
- [ ] Infos du sujet : l'auteur (ou « Anonyme »), « Créé le … » et « Dernière activité
      le … », chacun avec la date et l'heure.
- [ ] Bouton **Retour** visible et fonctionnel sur chaque écran secondaire.

## 5. Propositions

- [ ] Création (titre obligatoire, description facultative).
- [ ] Les 5 statuts sélectionnables et conservés.
- [ ] iPhone : ouvrir le menu de statut → **la page ne zoome pas** ; à la
      fermeture, l'affichage est identique à avant l'appui.
- [ ] Changer un statut affiche une confirmation à l'écran (« *titre* :
      *statut*. »), et le lecteur d'écran l'annonce.
- [ ] « Écartée » ouvre d'abord la fenêtre « Écarter la proposition » ; **Annuler**
      laisse le menu sur le statut d'avant. Les autres statuts partent sans fenêtre.
- [ ] Boutons **Pour / Contre / Abstention**, **Choisir** et **Retirer mon vote** :
      44 px de haut. Pastilles de réaction sous les bulles : un toucher juste en
      dessous de la pastille la touche encore, un toucher sur le bord bas de la bulle
      ouvre toujours la feuille du message.
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
- [ ] Les sujets suivent l'ordre de l'accueil (prêts, en discussion, clôturés), aucun
      archivé ; la pastille d'état est en tête de la synthèse, à droite, et
      n'apparaît pas à l'impression.
- [ ] « Imprimer » ouvre l'impression du navigateur. Dans une fenêtre intégrée qui ne
      sait pas imprimer : « Impression indisponible ici : affichez la synthèse à
      l'écran ou ouvrez-la dans votre navigateur. », sans erreur en console, et la
      synthèse reste à l'écran.

## 8. Synchronisation et hors ligne

- [ ] Deux appareils : une action apparaît sur l'autre en quelques secondes.
- [ ] Mode avion : l'application s'ouvre et affiche les dernières données.
- [ ] Action hors ligne → affichage immédiat, indicateur **Hors ligne (n)** (réseau
      coupé) ; **En attente (n)** quand le réseau est là mais que l'envoi n'a pas
      abouti.
- [ ] Rechargement hors ligne → la file **survit** (IndexedDB).
- [ ] Retour du réseau → envoi automatique, indicateur **À jour**.
- [ ] Jamais « À jour » tant qu'il reste des actions en attente.
- [ ] Ouvrir l'application connectée (réseau lent, ou serveur coupé avec une action en
      attente) : dès l'ouverture du cycle, l'indicateur dit **Synchronisation**
      (« Sync… » à 430 px et moins), jamais **À jour** ; serveur muet avec une action
      en attente : **En attente (1)**, jamais **À jour**.
- [ ] Action de plus de 30 jours (écrire une action hors ligne, puis avancer
      l'horloge de l'appareil de plus de 30 jours, réseau revenu) : rien n'est envoyé,
      l'indicateur reste sur **En attente (n)** et « 1 action de plus de 30 jours
      attend : ouvrez Réglages pour l'envoyer. » s'affiche une fois. Réglages montre
      « 1 action de plus de 30 jours attend sur cet appareil. » et **Envoyer quand
      même** ; un appui annonce « 1 action va partir. », l'action et celles qui la
      suivent partent dans l'ordre, le bloc disparaît, l'indicateur passe à
      **À jour**. Sans action retenue, le bloc est absent.
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
- [ ] `restoreFromBackup` avec l'identifiant d'un fichier qui n'est pas une copie
      BrainstO (un fichier `{}`, ou un autre JSON) : refus avec « La copie … n'est pas
      un fichier de données lisible : rien n'a été modifié. » ; la révision, le fichier
      de données et les copies ne changent pas, aucune copie `avant-restauration`.
- [ ] Rendre un message anonyme **après** une sauvegarde, puis restaurer cette
      sauvegarde : le message reste « Anonyme » sur tous les appareils (nom et
      identifiant de l'auteur absents des données).
- [ ] Première écriture après le déploiement du backend 1.1.0 : une copie
      `brainsto-data.json.avant-brainsto-backend-1.1.0.<date>` est déposée dans le
      dossier du fichier de données, une seule ; l'écriture suivante n'en dépose pas
      d'autre.

## 9. PWA

- [ ] Installation sur l'écran d'accueil (iPhone et Android), icône monogramme.
- [ ] Démarrage à froid hors ligne : la coquille se charge.
- [ ] Réseau connecté mais muet (lie-fi) ou réponse 503 du site : l'application
      installée **démarre depuis le cache** sans écran blanc ; HTML et scripts sont
      toujours de la même version.
- [ ] Nouvelle version publiée → bandeau « nouvelle version disponible » ;
      « Mettre à jour » recharge ; **aucune boucle de rechargement** au premier
      chargement.
- [ ] Publier **deux** versions de suite sans toucher au bandeau de la première, puis
      appuyer sur « Mettre à jour » : l'application passe à la **plus récente** (pas à
      l'avant-dernière). S'il ne reste rien à installer, le bouton recharge
      simplement la page.
- [ ] Navigateur qui refuse le service worker : l'application démarre sans erreur en
      console et ne propose aucune mise à jour.
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
- [ ] Écran de 320 px de large, puis texte du système à 130 % et à 200 % : le bouton
      retour se réduit à sa flèche (son nom « Retour vers … » reste lu), aucune
      étiquette du parcours n'est coupée (ni par « … » ni en plein mot : le parcours
      passe sur deux lignes quand il ne tient plus sur une),
      aucun défilement horizontal sur l'accueil, les propositions, les réglages et la
      synthèse.
- [ ] Téléphone en paysage (moins de 480 px de haut) ou clavier ouvert, six lignes
      saisies : le bouton d'envoi reste visible, les barres du haut ne collent plus,
      et sous 300 px de haut le parcours est masqué. Limite connue : à 200 % de
      zoom, les barres occupent encore environ 68 % de la hauteur de la discussion
      sur un téléphone de 393 px de large.
- [ ] Au clavier, un anneau de focus **plein** (2 px) entoure chaque commande (boutons,
      champs, menu de statut), et l'élément qui a le focus n'est jamais caché derrière
      la barre du haut ni derrière le bouton flottant.
- [ ] Accueil sur grand écran (900 px de large et plus) : les groupes (prêts, en
      discussion, clôturés) s'empilent sur toute la largeur, leurs cartes en colonnes ;
      pas de colonnes façon tableau Kanban.

## 11. Navigateurs

Trois passes obligatoires — iPhone (WebKit), Android (Blink), Firefox Android
(Gecko) — plus les passes conditionnelles : [`QA_NAVIGATEURS.md`](QA_NAVIGATEURS.md).
Un navigateur non observé n'est pas un navigateur validé.
