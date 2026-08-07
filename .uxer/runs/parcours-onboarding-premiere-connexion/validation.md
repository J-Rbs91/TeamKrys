# Validations — parcours-onboarding-premiere-connexion

<!-- mission UXER parcours-onboarding-premiere-connexion — profil standard — créé le 2026-08-06T23:41:49+00:00 -->

## Commandes exécutées

| Date | Commande | Résultat |
|---|---|---|
| 2026-08-06 | `python3 scripts/init-run.py --run-id parcours-onboarding-premiere-connexion --profile standard` | mission initialisée, profil `standard` |
| 2026-08-06 | `grep -rn "location.search\|URLSearchParams\|navigator.share\|clipboard" js/ index.html` | **aucune occurrence** — un lien partagé ne peut rien pré-remplir, et rien ne permet d'inviter un collègue depuis l'app |
| 2026-08-06 | `grep -n "aura\|grain\|deux couches\|mode de fusion" README.md css/app.css` | confirme `css/app.css:339-346` — suppression documentée de deux couches plein écran composées |
| 2026-08-06 | `cat .gitignore` | confirme `apps-script/` hors dépôt : aucune action serveur atteignable |

## Vérifications manuelles

### U2 — banc d'essai Chromium headless (2026-08-07)

Le dépôt n'a pas d'outil de test d'interface. J'ai monté un banc **hors du dépôt** :
les fichiers servis par lien symbolique depuis un serveur statique local, des pages
d'amorçage qui préparent `localStorage`, et un rapport renvoyé par balise HTTP lue
dans le journal du serveur. Aucune dépendance installée, aucun fichier ajouté au
dépôt.

**Scénario joué** (segment mode local, trois panneaux) :

| Étape | Constat |
|---|---|
| Ouverture | dialogue monté, **modal** (pas le repli), `open` posé, focus sur `.onboard-card` |
| Compteur | « 1 / 3 » puis « 2 / 3 » puis « 3 / 3 » — le segment local est bien détecté |
| Annonce | « Étape 1 sur 3, Les sujets. » à chaque changement, dans la région live |
| Dernier panneau | « Suivant » devient « Commencer », « Passer » disparaît |
| Premier panneau | « Précédent » masqué — et il l'est réellement, voir l'anomalie A7 |
| Persistance | `step` écrit sur l'appareil à chaque avance, et relu au retour |
| Précédent | revient à l'étape 2, compteur et annonce suivent |
| Échap | ferme, écrit `done` + `skipped`, et **rend le focus** à un bouton de l'écran réel |
| Erreurs | aucune exception, aucun rejet de promesse |

**Les quatre cas où la présentation ne doit pas apparaître :**

| Cas | Résultat |
|---|---|
| Appareil neuf, stockage vide | gate `connection` : la règle dit « due » mais **rien n'est affiché** — critère A2 tenu |
| Présentation déjà vue | rien, état lu « vue » |
| Appareil déjà utilisé, aucun enregistrement | rien, enregistrement écrit avec `migrated: true` — **la branche critique fonctionne dans l'application réelle** |
| Enregistrement illisible sur appareil ancien | rien, traité comme absent puis migré — un JSON corrompu ne transforme pas un ancien appareil en neuf |

### U3 — les cinq panneaux (2026-08-07)

Parcours complet du segment `full` dans Chromium : les cinq surtitres, titres et
corps s'enchaînent correctement, le compteur va de « 1 / 5 » à « 5 / 5 »,
l'annonce porte le numéro **et** le titre, la barre de vote apparaît au panneau 3
et le monogramme au panneau 5, « Suivant » devient « Commencer » au dernier.

**Mesures dans un cadre réel de 320 × 780** — c'est la largeur critique :

| Mesure | Valeur | Verdict |
|---|---|---|
| `scrollWidth` / `clientWidth` | 320 / 320 | aucun débordement horizontal |
| Éléments dépassant à droite | aucun | — |
| Bas du panneau / hauteur de la fenêtre | 780 / 780 | la feuille colle bien au bas |
| « Suivant » | 127 × 44 | cible tenue |
| « Précédent » | 44 × 44 | cible tenue |
| « Passer » | 77 × 44 | cible tenue, alors que c'est le piège habituel |

**Défaut trouvé au rendu et corrigé** : le conteneur du panneau reçoit le focus par
programme à chaque étape, et la règle globale `:focus-visible` — à spécificité
égale mais plus bas dans le fichier — dessinait un anneau d'accent **autour de tout
le panneau**. Battue par un sélecteur descendant, pas par `!important`.

**⚠️ Portée du banc.** Chromium uniquement, donc **Blink**. Le moteur du tier A sur
iPhone est **WebKit**, et il n'est pas testable ici : le chemin de repli
`.onboard--flat` (sonde tier B, iOS 15.0 → 15.3) n'a **pas** été exercé, non plus
que VoiceOver, TalkBack, le clavier virtuel, la barre gestuelle et la police système
à 200 %. Tout cela reste dans les vérifications restantes.

### Revue finale QA (2026-08-07) — huit agents du dépôt + revue de code

**Verdicts rendus** : `qa-webkit-ios` NEEDS_CORRECTION · `qa-blink-android` NEEDS_CORRECTION ·
`qa-gecko-firefox` NEEDS_CORRECTION · `qa-mobile-a11y` NEEDS_CORRECTION ·
`qa-pwa-offline` NEEDS_CORRECTION · `qa-responsive-touch` NEEDS_CORRECTION ·
`qa-webview-inapp` NEEDS_INPUT · `qa-mobile-perf` **OK avec réserves**.

**Le défaut capital, trouvé par la revue de code et confirmé indépendamment par
Blink et par Gecko : la séquence ne s'affichait JAMAIS à la première connexion.**
`App.onboardingPlan` réévaluait la règle au moment d'afficher ; or à cet instant
`App.gate()` vaut `null`, donc l'adresse et le prénom existent, et aucun
enregistrement n'avait encore été écrit — la règle répondait « appareil déjà
utilisé ». La fonctionnalité était inopérante hors rejeu manuel. Reproduit par
exécution directe de la règle, corrigé de deux façons cumulées : l'enregistrement
est posé dès que le démarrage conclut « première fois », et le plan ne re-dérive
plus que le segment.

**Mon banc d'essai est la cause du silence** : il préremplissait `localStorage`,
donc il ne traversait jamais les gates. Le scénario manquant a été écrit — stockage
vide, mode local, prénom, séquence — et c'est lui qui atteste désormais le critère A1.

| # | Défaut corrigé | Trouvé par |
|---|---|---|
| 1 | Séquence jamais affichée à la première connexion | revue de code, Blink, Gecko |
| 2 | `background: var(--scrim)` invalide sur `::backdrop` avant Firefox 120 / Chromium 122 / WebKit 17.4 → **voile absent sur presque tous les planchers de la matrice** | Gecko, WebKit, Blink |
| 3 | `showModal()` appelé avant que le titre soit écrit → dialogue ouvert **sans nom accessible** | a11y |
| 4 | Focus sur un conteneur sans nom ni rôle, et région live ne portant pas le corps du panneau | a11y |
| 5 | Région live insérée et remplie dans la même tâche → étape 1 probablement non annoncée | a11y |
| 6 | `:focus-visible` sans doublon `:focus` → **aucun indicateur de focus** sur le moteur même qui prend le repli non modal | a11y, WebKit |
| 7 | Liste de sélecteurs contenant `:focus-visible` → règle rejetée en bloc au tier B | WebKit, Gecko |
| 8 | `.onboard-foot` sans `flex-wrap` → débordement à 150 % de police | responsive |
| 9 | Bouton principal sautant de 104 px au dernier panneau (masquer « Passer » emporte son `margin-right: auto`) | responsive |
| 10 | `vh` sans compagnon `dvh` → feuille rognée en paysage | WebKit, Blink, responsive |
| 11 | `overflow-x` laissé à `auto` par la feuille de l'agent utilisateur, et pas d'`overscroll-behavior` | responsive, Blink |
| 12 | Terme de recherche interpolé sans `min-width: 0` ni `overflow-wrap` → **débordement horizontal de la page** à 320 px | responsive |
| 13 | « Effacer la recherche » à 36 px au lieu de 44 | responsive |
| 14 | Note « aucun résultat » affichée aussi quand la liste est vide par archivage → guillemets vides et bouton sans effet | revue de code |
| 15 | « Effacer la recherche » sans effet visible : `restoreDrafts` réinjectait l'ancien terme | revue de code |
| 16 | `pendingUpdate` ressorti sur une simple pause → bandeau posé sur l'écran de verrou | revue de code |
| 17 | Bandeau de version déjà posé **recouvrant** les commandes du panneau sur le chemin de repli | PWA |
| 18 | `CONFIG.onboardingDue` appelé sans garde **avant** `Sync.boot()` → en chargement mixte, démarrage gelé et file d'actions non rejouée | PWA |
| 19 | `App.onboardingState` appelé sans garde → écran Réglages mort en chargement mixte | PWA |
| 20 | Toast d'échec d'écriture émis juste avant de monter le calque, donc invisible et non annoncé | a11y |
| 21 | `hidden` posé sur le bouton portant le focus avant de replacer celui-ci | a11y |
| 22 | Bord du repli à 1,4:1 du contenu, sans voile pour le détacher | a11y |

**Non corrigé, et assumé** : le calque supérieur masque les toasts pendant la
séquence (documenté dans le code) ; l'ordre de tabulation ne suit pas l'ordre visuel
pour « Passer » (décision d'a11y, revendiquée) ; le geste de retour Android sous
Chromium 120 peut naviguer sans fermer le dialogue (à trancher) ; et la séquence se
rejoue à chaque ouverture dans une fenêtre in-app à stockage refusé (irréductible,
borné à une fois par chargement).

## Vérifications restantes

Toutes celles des critères de réussite du brief, plus la recette a11y sur appareil
réel : confinement du balayage sous `aria-modal` + `inert` (VoiceOver **et** TalkBack,
qui ne se comportent pas pareil), annonce effective du changement d'étape sans
re-rendu, restitution du focus à la sortie, absence de troncature à 200 % en portrait
et en paysage, atteignabilité des commandes hors encoche et hors barre gestuelle.

Rien de cela n'a été entendu ni vu sur un téléphone : ce sont des vérifications
différées, pas des acquis.

## Anomalies connues

Relevées en auditant le code pour cette mission. **Aucune n'est causée par
l'onboarding, aucune ne doit être corrigée dans ses lots** — elles appellent leurs
propres tickets.

| # | Anomalie | Emplacement | Gravité |
|---|---|---|---|
| A1 | `App.logout()` efface adresse, vérificateur, mode et session mais **conserve `brainsto.user` et `brainsto.ownItems`**. La personne suivante sur le même appareil hérite de l'identité de la précédente, saute le gate `name`, et `App.ownsMessage` lui accorde l'édition de ses messages **anonymes** | `js/app.js:203-221`, `js/app.js:44-48` | **Confidentialité** |
| A2 | `Utils.storage.set` renvoie `false` en silence et aucun appelant ne teste ce retour. Stockage indisponible ⇒ `loadUser()` régénère un uid à **chaque** chargement : un nouveau participant serveur par lancement, `ownItems` toujours vide, session jamais reprise. Aucun équivalent de l'avertissement « stockage non persistant » que `sync.js` émet pour IndexedDB | `js/utils.js:426-429`, `js/app.js:20-28` | Élevée |
| A3 | `role="dialog" aria-modal="true"` sans nom accessible sur les feuilles **et** les fenêtres ; aucun piège de focus nulle part. Les surfaces actuelles s'annoncent « boîte de dialogue » sans titre | `js/ui.js:383`, `:397` | Accessibilité |
| A4 | `:focus-visible` sans doublon `:focus` : sur Safari iOS 15.0–15.3, classé tier B par `compat-scan`, la règle entière est rejetée et il ne reste **aucun** indicateur de focus au clavier externe | `css/app.css:1800` | Accessibilité |
| A5 | `statusPill` change en silence : « En attente (n) » n'est ni `role="status"` ni annoncé | `js/ui.js:310-317` | Accessibilité |
| A7 | `[hidden]` n'était **pas fiable** : sa règle vient de la feuille de l'agent utilisateur, et `.btn{display:inline-flex}` la battait — un bouton marqué `hidden` restait visible, silencieusement. **Corrigé en U2** par une règle explicite. Le défaut préexistait, mais aucun code du dépôt n'utilisait `hidden` : il n'avait jamais eu d'effet | `css/app.css` | Moyenne — **corrigée** |
| A6 | État vide filtré sans sortie : « Aucun sujet ne correspond. » sans bouton pour effacer la recherche, alors que la décision 12 du corpus local exige « un bouton qui élargit réellement » | `js/ui.js:618-620` | Moyenne — **traitée en U6** |

## Vérification de l'arbitrage final (2026-08-07, version 1.9.0)

Niveaux de preuve selon la convention UXER : 0 non consulté, 1 documentation lue,
2 code lu, 3 interaction observée.

| Décision | Vérification | Niveau |
| --- | --- | --- |
| D1 déconnexion | Exécution directe : après `logout()`, `KEYS.user` et `KEYS.ownItems` absents, `ownItems === []`, `loadUser()` rappelé après la purge de la file. Confirmation lue, compte d'actions en attente correct. | 3 |
| D2 durabilité | `DB.requestPersistence()` déclenchée par `DB.enqueue`, pas au démarrage. Garde `hasStorageManager()` vérifiée sous Node. Diagnostic affiche `durable` / `évinçable`. | 3 |
| D3 précache | Lecture du fichier et raisonnement sur le contrat `waitUntil` : `addAll` sans `catch` → installation en échec → pas d'`activate` → pas de purge. Non rejoué sur appareil réel : le démarrage à froid hors ligne est dans la recette d'appareil, qui reste due. | 2 |
| D4 pied de séquence | Mesuré au banc, 320×568, police système à 200 % : `.onboard-card` défile, `.onboard-foot` de 438 à 550 dans un champ de 568, « Suivant » visible, `scrollWidth === clientWidth`. Corps résiduel ≈ 155 px. | 3 |
| D5 brouillons | Rendu tiers simulé pendant une saisie : le nom en cours n'est plus écrasé. Champ délibérément vidé : survit au rendu. Champ jamais touché : toujours prérempli. | 3 |

**Suites.** onboarding 27/27, session 9/9, sync 15/15, `compat-scan` sans blocage au
tier B ou supérieur. `parity.test.js` échoue avant comme après ces changements — il lit
`apps-script/Code.gs`, absent du dépôt. Vérifié par mise de côté des changements, donc
préexistant, et jamais présenté comme vert.

**Ce que cette vérification ne couvre pas.** D3 n'est établi qu'au niveau 2 : le
scénario qui compte — installation partielle, puis démarrage à froid hors ligne — n'est
observable que sur appareil réel. Aucun moteur n'a été consulté sur cette suite ; les
verdicts moteur de la ronde précédente ne s'y appliquent pas.
