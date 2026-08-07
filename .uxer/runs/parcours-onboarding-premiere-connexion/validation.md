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

Aucune — aucune ligne de code applicatif n'a encore été écrite. La phase en cours est
la recherche ; les unités U1 à U6 ne sont pas commencées.

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
| A6 | État vide filtré sans sortie : « Aucun sujet ne correspond. » sans bouton pour effacer la recherche, alors que la décision 12 du corpus local exige « un bouton qui élargit réellement » | `js/ui.js:618-620` | Moyenne — **traitée en U6** |
