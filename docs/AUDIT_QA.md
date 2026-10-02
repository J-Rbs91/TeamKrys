# Audit QA final de BrainstO.

Rapport de fin de run. Application : version 1.13.0. Backend : `brainsto-backend-1.1.0`. Dernier commit
couvert : 25c4961. Ce document dit ce qui a été audité, corrigé et vérifié, et ce qui reste.
Règle de lecture : **« non observé » n'est pas « conforme »**. Les chiffres viennent des fichiers de
travail du run (dossier `qa/`, hors dépôt, non versionné) ; chaque section cite les siens.

En bref :

- Les deux causes les plus graves (S1) sont corrigées et ont été rejouées dans un navigateur (Chromium).
- Deux revues adverses, après les 20 lots, ont encore trouvé 4 constats (noyau) et 9 (interface) : tous corrigés.
- Tout ce qui a été vu l'a été dans Chromium, avec un faux Apps Script. iOS, Firefox, vrais appareils, vrais
  lecteurs d'écran, vrai Drive et impression papier n'ont **pas** été observés (section 7).

---

## 1. Ce qui a été fait

- **Un audit QA multi-agents** d'une PWA statique (HTML, CSS, JavaScript sans dépendance) et de son backend
  Google Apps Script : 17 rapports d'agents spécialisés (accessibilité, Android, iOS, Firefox, WebView, mobile,
  performance, sécurité, protocole, synchronisation, hors ligne, produit, parcours, résilience, hygiène,
  héritage, harnais).
- **201 constats bruts et 901 contrôles** (626 conformes, 187 défauts, 46 déduits, 42 non observés),
  regroupés en **76 constats** : 2 de gravité S1, 16 S2, 58 S3. Vérification : 73 rejoués et confirmés, 3 déduits
  et non vérifiés. À l'origine, les rapports annonçaient S1 9, S2 44, S3 115, S4 33 : les 9 S1 annoncés
  se ramènent à 2 causes. 53 entrées sont restées hors run (S4, choix délibérés, §26, faux positif).
- **20 lots de correctifs** (WP-01 à WP-20 : 11 lots P0, 5 lots P1, 4 lots P2), puis **3 lots issus de la
  recette finale** : WP-21 (backend 1.1.0 : restauration et sauvegarde avant mise à niveau), WP-22 (revue
  de l'interface : brouillon anonyme, marqueur des nouveautés, focus, fenêtres, noms accessibles), WP-23
  (finitions d'interface : mots entiers, impression claire, bandeau de mise à jour).
- **Méthode imposée à chaque lot** : rejouer le constat AVANT (il échoue), écrire un test de non-régression,
  corriger au plus petit, rejouer la suite complète, rejouer le constat APRÈS (il passe), relire son diff.
  Un constat qui ne se reproduit pas n'est pas corrigé.
- **Recettes finales sur des instantanés figés** (copie du dépôt à un commit donné : le jugement ne porte que sur cette copie) :
  d5ec227 (noyau, résilience, revue du noyau) et 58b415c (parcours, interface, revue de l'interface).

Sources : `qa/BACKLOG.md` (l. 7 à 12), `qa/backlog.json` (`summary` et `items`), `qa/FIX_BRIEF.md` (§2),
`qa/ORCH_NOTES.md` (PHASE 3), `qa/recette/SNAPSHOT.txt` et `SNAPSHOT-FINAL.txt`.

---

## 2. Les deux causes les plus graves

| Constat | Cause | Conséquence | Correctif |
|---|---|---|---|
| BL-001 | Quand le serveur répond par une erreur (verrou dépassé, panne Drive, page d'erreur), l'application la prend pour un refus définitif et retire l'action de la file. | Messages et votes disparaissent sans trace, sous « À jour » (observé 3 fois en navigateur). | WP-01 : le serveur distingue `invalid` (rejet définitif) de `retry` (tout le reste). WP-08 : le client ne retire une action que sur succès, doublon reconnu ou `invalid` ; sinon elle reste, avec recul progressif et « Erreur (n) » dès le 2e échec. |
| BL-002 | Quand l'écriture dans IndexedDB échoue (connexion fermée par le système, quota), l'application retirait l'action de la file en mémoire sans l'envoyer, et gardait la connexion morte. | Le message saisi disparaît, le composeur est vidé, et les messages suivants sont perdus aussi jusqu'au rechargement, alors que le réseau fonctionne. | WP-02 : la base est rouverte une fois ; si l'écriture échoue quand même, l'action reste en file mémoire (clé `local-n`), part au serveur, un avertissement unique s'affiche ; ouverture bornée à 5 s. |

Sources : `qa/BACKLOG.md` (l. 25 et 26), `qa/ORCH_NOTES.md` (SYN-001, PWA-009), `qa/fix/WP-01.md`,
`qa/fix/WP-02.md`, `qa/fix/WP-08.md`.

---

## 3. Ce qui a été corrigé, par thème

| Thème | Lots | Ce que la personne y gagne |
|---|---|---|
| Synchronisation | WP-01, WP-07, WP-08, WP-12, WP-13 | Plus de message ni de vote perdu quand Google répond mal. Votes et réactions rejouables sans s'inverser (marqueur `set:true`). Indicateur « Erreur (n) » honnête. |
| Hors ligne et mise à jour | WP-02, WP-06, WP-11, WP-20 | L'application installée démarre depuis son cache même sur réseau faible, au lieu de rester blanche. Base locale défaillante : l'envoi continue. Navigateurs appauvris : message honnête (stockage refusé, chiffrement indisponible). Le brouillon d'un message survit à la mise à jour, au démarrage à froid et à l'onglet restauré. |
| Anonymat | WP-03, WP-05, WP-07, WP-21, WP-22 | Mon message anonyme n'a plus de cadenas qui le distingue. Rendre un message anonyme retire aussi la clé de réaction de son auteur. Une restauration ne republie plus un auteur devenu anonyme. Un brouillon anonyme n'est jamais publié signé. La déconnexion efface aussi le repère des nouveautés. |
| Verrouillage | WP-05, WP-12, WP-13 | Quand l'équipe change de code, ou en pose un, la personne saisit le nouveau code sans perdre sa file d'actions. Un appareil refusé ne multiplie plus les requêtes (au plus 10 en 5 minutes, une seule notification). |
| Interface et accessibilité | WP-03, WP-04, WP-09, WP-14, WP-17, WP-19, WP-22, WP-23 | Pastille d'état lisible (mots courts jusqu'à 430 px, complets dès 431 px). Votes lus exactement (« 6 participants sur 8 ont voté »). Nouveautés jamais sur ses propres actions. Focus conservé, champs nommés, titres d'écran, dates du sujet, recherche sans accents, synthèse, « Envoyer quand même », bandeau annoncé. |
| Mobile et CSS | WP-10, WP-16, WP-23 | Pas de défilement horizontal à 320 px ni à texte agrandi. Pour / Contre / Abstention reste dans sa carte. Clavier ouvert : le bouton d'envoi reste visible. Mots entiers, impression toujours en palette claire. |
| Backend et sauvegardes | WP-01, WP-15, WP-21 | Fichiers Drive homonymes jamais choisis en silence. Diagnostic complet. `restoreFromBackup` (copie de sécurité, rien de supprimé). Copie avant mise à niveau. Anciennes données TeamKrys lisibles. Identifiants réservés et bornés. |
| Documentation | WP-18, WP-18b, WP-18c | Installation, guide, modèle de données, checklist et README alignés sur le comportement livré. |

Sources : `qa/BACKLOG.md` (tableau des lots, l. 44 à 88), `qa/ORCH_NOTES.md` (l. 138, PHASE 3),
`qa/recette/noyau.md` (matrice, §21), `README.md` (section « Verrou »), notes `qa/fix/WP-*.md`.

---

## 4. Conformité à la spécification, clause par clause

Légende. **conforme** : observé conforme dans au moins un rapport, sans écart ouvert qui contredise la clause
(les réserves sont dites). **partiellement** : un écart connu et ouvert, ou une part de la clause seulement observée.
**non observé** : aucun contrôle ne la couvre en propre. « Où » : *parcours* (rapport fonctionnel, avec
contrôles conformes / non conformes), *noyau*, *résilience*, *interface*. « Départ » : état à la version 1.12.0.

| § | Sujet | Départ | Fin | Où | Réserve |
|---|---|---|---|---|---|
| 2 | Chemin Sujet, Discussion, Proposition, Vote, Consensus, Réunion | non observé | conforme | parcours 6/0 | |
| 3 | Sujets : états, dates, tri, recherche | partiel | conforme | parcours 54/0, interface | auteur coupé à 320 px (REC-UI-040) corrigé par WP-23, vu par sonde seulement |
| 4 | Discussion, citation, cinq réactions | partiel | conforme | parcours 24/0, noyau, interface | l'interface de citation n'est pas vue par le rapport noyau |
| 5 | Publication anonyme | partiel | conforme | parcours 43/0, noyau, interface | 2 défauts S2 de la revue adverse corrigés par WP-22 (sondes Chromium 18/18), recette complète non rejouée |
| 6 | Intégrité : verrou, signature | conforme | conforme | parcours 8/0, noyau | |
| 7 | Propositions | partiel | conforme | parcours 16/0, noyau, interface | |
| 8 | Lecture des votes | partiel | conforme | parcours 21/0, noyau, interface | |
| 9 | Consensus | partiel | conforme | parcours 22/0, noyau | repère « en tête » déduit par le noyau, observé par le parcours |
| 10 | Synthèse pour la réunion | partiel | conforme | parcours 13/0, interface | impression papier non observée (émulation seulement) ; REC-UI-043 corrigé par WP-23 |
| 11 | Nouveautés locales | partiel | conforme | parcours 29/0, interface | |
| 12 | Hors connexion, indicateur d'état | non conforme | conforme | parcours 34/0, noyau, résilience, interface | écart S4 accepté : « À jour » peint environ 4 ms avant le premier cycle |
| 13 | Mode local | conforme | conforme | parcours 11/0 | mots complets (431 px et plus) non rejoués par la résilience |
| 14 | Installation et usage mobile | partiel | **partiellement** | parcours 1/0, résilience, interface | seuls le manifeste et l'absence de magasin sont vus ; installation réelle, WebKit, Gecko non observés ; BL-045 partiel |
| 15 | Architecture statique | partiel | conforme | parcours 5/0 | aucune requête externe observée |
| 16 | Où vivent les informations | non conforme | conforme | noyau, résilience | |
| 17 | Confidentialité | partiel | conforme | parcours 36/0, noyau, résilience | |
| 18 | Niveau de sécurité | conforme | conforme | noyau, résilience | accès libre sans code d'accès : documenté |
| 19 | Synchronisation | non conforme | conforme | noyau, résilience | deux points seulement déduits (ancien backend, fenêtre avant la première réponse) |
| 20 | Écritures simultanées | conforme | conforme | noyau | le verrou est une doublure : sa sémantique réelle n'est pas observée |
| 21 | Révisions | partiel | **partiellement** | noyau, résilience | restauration manuelle à révision égale (REC-RST-003) ; fichier relu à chaque sondage (REC-SYNC-068, hors lettre) |
| 22 | Coupures et fermetures brutales | non conforme | conforme | noyau, résilience | |
| 23 | Sauvegarde et récupération | partiel | **partiellement** | noyau, résilience, parcours | restauration manuelle (REC-BACKUP-001) ; copie antérieure à une anonymisation garde l'auteur (REC-FON-090) |
| 24 | Continuité, service worker | partiel | conforme | parcours 5/0, noyau, résilience, interface | iOS non observé |
| 25 | Résumé de l'architecture | non observé | **non observé** | aucun en propre | couvert par les lignes des §15, §16, §17, §24 |

**§26** (points à considérer avant un déploiement plus large) est prospectif : aucun correctif n'est dû.

Sources : `qa/recette/fonctionnel.md` (section C), `qa/recette/noyau.md` (section 7), `qa/recette/resilience.md`
(colonne `spec`), `qa/recette/ui.md`, `qa/CONFORMITE_INITIALE.md`, `qa/fix/WP-22.md` (l. 34).

---

## 5. Chiffres des recettes finales et des revues adverses

| Rapport | Instantané | Conformes | Non conformes | Déduits | Non observés | Total indiqué |
|---|---|---|---|---|---|---|
| Noyau | d5ec227 | 186 | 3 | 1 | 4 | 194 |
| Résilience | d5ec227 | 58 | 4 | 3 | 4 | 69 |
| Parcours (fonctionnel) | 58b415c | 317 | 1 | 0 | 12 | non indiqué |
| Interface (ui) | 58b415c | 47 | 10 | 3 | 1 | non indiqué |
| Revue adverse du noyau | d5ec227 | 6 | 4 | 2 | 0 | non indiqué |

Revues adverses, constats trouvés puis corrigés :

| Revue | Constats trouvés | Corrigés par |
|---|---|---|
| Noyau, backend, coquille | 4 (1 S2, 3 S3) | WP-17 (REC-REV-001, « Envoyer quand même »), WP-21 (REC-REV-002, 003, 004) |
| Interface | 9 (3 S2) | WP-22 (REC-RUI-001 à 009) |

Ce que les recettes ont laissé ouvert : noyau REC-SYNC-068 (hors run) et REC-BACKUP-001 ; résilience REC-IDB-005
et REC-RST-003 ; parcours REC-FON-090 ; interface REC-UI-023, 044, 051. WP-23 a corrigé 6 constats de la
recette interface et n'a pas reproduit REC-UI-045. REC-SYNC-005 (« À jour » peint trop tôt au démarrage connecté, vu aussi sous le
nom REC-IND-004 par la recette de résilience) a été corrigé par le commit eb3988f, sauf un résidu d'environ 4 ms.

Sources : `qa/recette/noyau.md` (l. 5), `qa/recette/resilience.md` (l. 5), `qa/recette/fonctionnel.md` (l. 5),
`qa/recette/ui.md` (tableau « Résumé »), `qa/recette/revue-noyau.md` (« Compteurs »), `qa/recette/revue-ui.md`,
`qa/ORCH_NOTES.md` (PHASE 3), `qa/fix/WP-22.md`, `qa/fix/WP-23.md` (tableau des statuts).

---

## 6. Ce qui reste, honnêtement

| Écart connu et décidé | Conséquence concrète pour une personne |
|---|---|
| BL-045, zoom 200 % partiel | Sur un petit téléphone à 200 % de zoom (196 x 425), les barres du haut occupent 68 % de la hauteur de la discussion (72 % à l'origine, 63 % après WP-16) : il reste peu de place pour lire, il faut faire défiler. |
| BL-064, partiel | « Imprimer » prévient quand l'impression est absente ou échoue. Une impression qui se lance sans rien produire ne se détecte pas : aucun message, ouvrir la synthèse dans le navigateur. |
| BL-068, partiel | Le repère « vu » n'est plus réécrit s'il est inchangé, mais un sondage sans changement refait encore un rendu de trop : travail inutile, sans effet visible, non remesuré. |
| Pastille « À jour » peinte environ 4 ms avant le premier cycle | Au démarrage connecté, la pastille peut dire « À jour » un instant imperceptible avant le premier contact avec le serveur. |
| Ouverture d'IndexedDB qui ne répond jamais | Le premier écran arrive après 5 s au plus (écran vide d'abord), puis l'application démarre sur le repli mémoire, avec un message honnête. |
| Restauration manuelle à révision égale | Si le fichier de données est remplacé à la main, un téléphone qui avait déjà ce numéro de révision garde l'ancien état sous « À jour ». La procédure supportée est `restoreFromBackup`. |
| Fichier Drive relu à chaque sondage (SYN-013) | Chaque sondage fait lire tout le fichier par le script (971 Kio dans le scénario mesuré) : sur un gros fichier, du temps de lecture à chaque sondage, et une charge sur les quotas d'Apps Script qui n'a pas été mesurée. |
| Actions de plus de 30 jours | Une action écrite hors ligne depuis plus de 30 jours (ou avec une horloge déréglée) n'est jamais renvoyée en silence : elle est retenue, les suivantes attendent derrière, et la personne doit ouvrir Réglages puis « Envoyer quand même ». |
| PRF-001 et PRF-002 (hors run) | Sur un sujet très long et un téléphone lent, l'interface peut saccader : 803 ms pour afficher un message reçu à 300 messages, 2,6 s à 1 000, et 1,2 s pour un clic de réaction à 300 messages (processeur ralenti 4 fois, mesure indicative). |
| PUI-008 (hors run) | Un sujet publié signé ne peut pas être rendu anonyme ensuite, ni l'inverse : seule la signature des messages se change. |
| PUI-004 | Les cinq réactions sont dessinées en pictogrammes neutres, pas en emoji ; les valeurs stockées restent des emoji. À trancher si l'équipe veut des emoji à l'écran. |
| PRO-005 (hors run) | Le serveur ne garde aucune trace de l'auteur d'un message anonyme, donc ne peut pas le vérifier : quelqu'un qui connaît le code de l'équipe et appelle le serveur directement peut modifier ou signer ce message. L'application ne le propose qu'à l'appareil qui détient la preuve locale. |
| Identité par appareil (PUI-018, PRO-012) | Une personne qui se reconnecte ou change d'appareil compte pour une personne de plus (le total passe de 8 à 9), et ses anciens messages anonymes ne sont plus modifiables depuis le nouvel appareil. |
| Cibles tactiles de 24 px (REC-UI-051) | Les pastilles de réaction (33 x 24) et les boutons Pour / Contre / Abstention (36 px de haut à 320 px) sont plus petits à toucher que 44 px. La règle tenue est WCAG 2.5.8 (24 px). |
| Copies de sauvegarde (REC-FON-090) | Une copie prise avant qu'un message soit rendu anonyme garde son auteur : la protéger comme les données (dossier Drive non partagé plus largement). |
| Brouillon écrit en clair | Un brouillon non envoyé est écrit en clair sur l'appareil : l'écran de verrouillage protège l'application, pas le stockage du téléphone. |

Sources : `qa/ORCH_NOTES.md` (l. 38, 39, 40, 65, 70, 147, 180, 181), `qa/fix/WP-16.md` (l. 18), `qa/fix/WP-19.md`
(l. 15, 18, 59, 83), `qa/fix/WP-23.md` (l. 26, 127), `qa/recette/ui.md` (REC-UI-051), `qa/recette/noyau.md`
(REC-SYNC-068), `qa/recette/resilience.md` (REC-IDB-005, REC-RST-003), `qa/recette/fonctionnel.md` (REC-FON-090).

---

## 7. Ce qui n'a PAS été observé

- **Tout navigateur autre que Chromium.** Les profils « iPhone » et Android sont des émulations de Chromium.
  iOS et WebKit (dont le défaut d'IndexedDB raisonné par lecture), Firefox et Gecko : non observés. Les
  lignes « webview », « gecko » et « webkit » de la recette de résilience sont des simulations dans Chromium.
- **Vrais appareils** : installation réelle sur l'écran d'accueil, éviction réelle du stockage, vrai clavier
  virtuel (simulé par une fenêtre basse), encoche (déduite en lisant le CSS), barre d'adresse rétractable.
- **Vrais lecteurs d'écran** (VoiceOver, TalkBack, NVDA) : la structure est vérifiée (régions, noms,
  descriptions), pas l'annonce réelle. Cela vaut pour la note de brouillon, le bandeau de mise à jour et les compteurs.
- **Impression papier ou PDF réelle** : seul le mode impression a été émulé, avec un espion sur `window.print`.
- **Vrai Apps Script et vrai Drive** : un faux Drive en mémoire et un faux verrou (doublures). Quotas,
  `LockService` réel et latence réelle (de 0,3 à 2 s par exécution) non observés. Les en-têtes CORS des
  pages d'erreur de Google ne sont pas vérifiés.
- **Latence réseau réelle** : les parcours ont été joués à latence nulle.
- **Les deux derniers lots (WP-22, WP-23)** sont postérieurs aux recettes complètes. Ils ont été validés par
  leurs tests (`drafts` 34 contrôles, `ui-review` 8, `ui-banner` 6, `css-contract` 30) et par des sondes dans
  Chromium, pas par une recette complète rejouée. À la date de ce rapport, aucun chiffre de la section 5 ne
  vient d'une recette sur 25c4961.

Sources : `qa/recette/fonctionnel.md` (« Non observé »), `qa/recette/noyau.md` (« Non observé »),
`qa/recette/resilience.md` (REC-NOB-002), `qa/recette/ui.md` (« Non observé »), `qa/ORCH_NOTES.md` (l. 88),
`qa/fix/WP-22.md` (l. 152), `qa/fix/WP-23.md` (l. 85 et 129).

---

## 8. Comment rejouer

```bash
for f in tests/*.test.js; do node "$f" >/dev/null || echo "ÉCHEC $f"; done   # 24 fichiers
node tests/qa/compat-scan.js        # compatibilité navigateurs : rien de bloquant au tier B ou supérieur
python3 tools/check-contrast.py     # contrastes : 98 couples, 49 par mode, dans les deux thèmes
```

- Les 24 fichiers `tests/*.test.js` sont tous listés dans `.github/workflows/test.yml`, et une étape de la CI
  échoue si un test du dépôt n'y est pas câblé. La CI vérifie aussi la syntaxe de tous les scripts.
- **Le harnais de bout en bout** (faux Apps Script + Chromium) qui a servi aux recettes n'est **pas** dans le dépôt
  à cette date : le dossier `tests/qa/` ne contient que `compat-scan.js`, `feature-baseline.json` et
  `browser-matrix.json`. Les observations faites dans un navigateur (sections 4 et 5) ne se rejouent donc pas
  depuis le dépôt seul ; seuls les tests Node, le scan de compatibilité et le contrôle de contraste s'y rejouent.
- Les cases de [`CHECKLIST_TEST.md`](CHECKLIST_TEST.md) sont toutes vides : ce sont des contrôles à faire par une
  personne, sur des appareils réels (section « 1 octies » pour les derniers lots).

Sources : `.github/workflows/test.yml`, `ls tests/*.test.js`, `git ls-files`, `tools/check-contrast.py`
(sortie), `qa/fix/WP-23.md` (l. 86).

---

## 9. Pour déployer

1. **Monter `CONFIG.APP_VERSION` (`js/config.js`) et `CACHE_VERSION` (`service-worker.js`) ensemble**, à chaque
   publication. Sinon les appareils déjà installés ne reçoivent rien : la navigation est servie depuis le cache
   versionné. Valeurs actuelles : 1.13.0 et `brainsto-v1.13.0`.
2. **Redéployer le backend 1.1.0** (`apps-script/Code.gs`) comme **nouvelle version** du déploiement existant, en
   gardant la même adresse `/exec`. À la première écriture, le script dépose la copie
   `brainsto-data.json.avant-brainsto-backend-1.1.0.<date>`. Avant : `diagnoseStorage()` et `runSelfTest()`.
   `ACCESS_CODE` et `DATA_FILE_ID` restent vides dans le dépôt.
3. **Protéger les copies** : une copie prise avant l'anonymisation d'un message garde son auteur
   ([`INSTALLATION.md`](INSTALLATION.md)).
4. **Vérifier avec [`CHECKLIST_TEST.md`](CHECKLIST_TEST.md)**, sur iPhone, Android et Firefox Android, en thème clair
   et sombre : c'est la seule manière de couvrir ce que la section 7 dit non observé.

Sources : `js/config.js` (l. 12 et 13), `service-worker.js` (l. 3 et 11), `apps-script/Code.gs` (l. 14, 645 et 646),
[`INSTALLATION.md`](INSTALLATION.md), [`README.md`](../README.md) (« Publier une nouvelle version »).
