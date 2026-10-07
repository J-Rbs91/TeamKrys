# Mouvement — ce qui bouge, quand, et pourquoi

Ce document dit quand l'interface bouge, avec quelles valeurs, et ce qu'elle
s'interdit. Les valeurs vivent dans les jetons de [`../css/app.css`](../css/app.css)
(« Mouvement ») : elles ne sont pas recopiées ici.

Il applique à BrainstO. la politique de mouvement de la méthode UXER : règle de
fréquence, courbes, physicalité, interruptibilité. L'identité du produit reste
portée par la couleur ([`IDENTITE_VISUELLE.md`](IDENTITE_VISUELLE.md)). Le seul
geste expressif reste la séquence du monogramme (README, « La séquence
d'accueil »). Tout ce qui suit est fonctionnel.

---

## 1. La règle

> **L'interface reste immobile tant que rien ne change. Quand quelque chose
> change, le mouvement dit ce qui vient de se passer.**

Trois niveaux, et rien entre eux :

| Niveau | Quand | Ce qui bouge | Durée |
|---|---|---|---|
| **0 — lecture** | on lit, on réfléchit | rien | — |
| **1 — interaction** | appui, réaction, vote, calque | la commande touchée, le calque | 100 à 240 ms |
| **2 — transformation** | un message devient une proposition, l'accord se déplace sur une barre, un élément change de place | l'élément transformé, et lui seul | 220 à 240 ms |

Le niveau 2 donne au produit son caractère : il rend visible ce que le produit
fabrique, un accord qui se forme. Il ne dure jamais plus que le niveau 1.

## 2. Pourquoi une couche de continuité

`UI.render` détruit et reconstruit l'écran **et** le calque à chaque appel. Un
nœud neuf naît dans son état final : aucune transition CSS ne se joue sur un
changement d'état, et ce qui disparaît disparaît d'un coup. Trois défauts en
découlaient, dont un vrai bogue :

- **Une feuille ou une fenêtre ouverte rejouait son entrée à chaque rendu de
  données.** Un vote reçu ou une synchronisation la faisait remonter sous les
  yeux, sans que personne l'ait rouverte. Constaté dans Chromium avant
  correction.
- Un message reçu, une réaction, un vote, une carte retirée **sautaient** d'un
  état à l'autre.
- Fermer une feuille la faisait disparaître en une image.

[`../js/motion.js`](../js/motion.js) relève l'avant juste avant le rendu
(positions, largeurs, états enfoncés, calque ouvert). Il laisse le rendu se
faire, puis rejoue la différence sur les nœuds neufs :

- **FLIP** pour ce qui s'est déplacé : on part de l'ancienne position et on
  glisse vers la nouvelle ;
- **une classe « depuis l'ancien état »** pour le reste. C'est le motif
  `is-flip` de l'interrupteur de signature, généralisé.

Ce que la couche ne fait pas : elle ne touche ni l'état, ni les actions, ni le
focus, ni l'ordre du DOM. Retirée, l'application fonctionne à l'identique. Elle
n'anime jamais l'arrivée sur un écran : `js/ui.js` et `css/uxer.css` s'en
chargent. Elle n'anime pas non plus un rendu qui apporte plus de trois
nouveautés d'un coup : une reconnexion n'est pas un feu d'artifice.

## 3. Les valeurs

Une courbe par **nature** de mouvement, pas par composant :

| Jeton | Pour | Pourquoi |
|---|---|---|
| `--ease-out` | ce qui entre, sort, ou répond à un appui | décélération franche dès la première image : la réponse se voit avant la fin du mouvement |
| `--ease-move` | ce qui est déjà là et se déplace ou change de forme | départ doux : un objet posé ne bondit pas |
| `--ease-drawer` | une surface qui arrive d'un bord (feuille du bas) | très longue décélération, arrivée sans à-coup |
| `--ease-in-out` | une oscillation (pastille de synchronisation, chatoiement) | symétrique, parce que le mouvement l'est |
| `--ease-mark`, `--ease-spring`, `--ease-in` | la séquence du monogramme, seulement | sa chorégraphie a été réglée avec elles ; son tracé, lui, est linéaire (un tour de table donne le même temps à chacun) |

Les durées sont bornées par la règle de fréquence. Rien de ce qui appartient à
l'interface ne dépasse 300 ms, et une **sortie est toujours plus courte que
l'entrée** :

| Jeton | Usage |
|---|---|
| `--dur-fast` | appui, couleur, survol |
| `--dur-base` | contrôle ou repère qui apparaît, réaction |
| `--dur-exit` | ce qui part : voile, fenêtre, carte, toast |
| `--dur-move` | réorganisation, barre de vote, fil qui remonte |
| `--dur-slow` | feuille, fenêtre, changement d'écran |
| `--dur-highlight` | repère « c'est ici », qui s'efface sans rien retenir |
| `--dur-loading` | cycle du chatoiement d'un chargement |

Enfoncement à l'appui : `--press-scale` (0,96) pour les commandes compactes,
`--press-scale-soft` (0,985) pour les grandes surfaces (bouton pleine largeur,
action de feuille, bouton de fenêtre). Les cartes de liste n'en ont aucun, leur
fond suffit.

Propriétés animées : `transform` et `opacity`. Trois exceptions, nommées et
bornées :

- la **largeur** des trois segments d'une barre de vote, qui n'a pas
  d'équivalent en déplacement ;
- la **couleur du voile** d'un calque : animer son opacité ferait fondre la
  feuille qu'il porte ;
- le **contour** d'un repère, qui ne déplace rien autour de lui.

## 4. Carte : action → changement → mouvement

| Action | Ce qui change | Mouvement |
|---|---|---|
| Appuyer sur une commande | rien encore | la commande s'enfonce (0,96 ou 0,985), son fond change |
| Envoyer un message | un message s'ajoute en bas | le fil remonte d'un bloc ; le nouveau message monte avec lui depuis le bas et apparaît en fondu (220 ms) |
| Recevoir un message (en bas du fil) | idem | idem : le fil glisse au lieu de sauter |
| Recevoir un message (lecture plus haut) | rien de visible | rien ne bouge sous les yeux |
| Appui long sur un message | la feuille d'actions s'ouvre | la bulle se tasse linéairement pendant l'appui (450 ms) ; la feuille **monte du bord**, opaque, le voile se teinte ; la bulle reste **désignée** (anneau du champ actif) tant que la feuille est ouverte |
| Données reçues, feuille ouverte | rien pour la personne | **rien** : la feuille ne rejoue plus son entrée |
| Réagir | la feuille se ferme, la pastille apparaît | la feuille redescend ; la pastille grandit jusqu'à sa taille (0,8 → 1, sans rebond) ; la bulle relâche sa désignation |
| « Créer une proposition » depuis un message | la feuille laisse place à la fenêtre, pré-remplie avec le texte | la feuille redescend sous la fenêtre qui s'ouvre de son centre ; le voile reste en place |
| Valider la proposition | on arrive sur les propositions | changement d'écran vers l'avant, puis la carte créée est **désignée une fois** (contour au froid de l'accord qui s'écarte et s'efface) ; ramenée dans la vue si elle est plus bas |
| Voter | ma voix et la répartition changent | le bouton choisi se pose (0,96 → 1) ; les segments de la barre **glissent** de l'ancienne répartition à la nouvelle |
| Vote d'un collègue reçu | la répartition change | la barre glisse : on voit l'accord bouger |
| Ajouter un consensus | une carte s'ajoute | elle monte de 8 px, et elle est désignée |
| Choisir un consensus | « Mon choix », peut-être « En tête » ailleurs | le bouton se pose ; le repère « En tête » apparaît (0,85 → 1) |
| Supprimer un consensus | une carte disparaît | elle s'efface à sa place pendant que les autres reprennent l'espace |
| Un sujet change de statut (accueil ouvert) | la carte change de groupe | elle glisse vers son nouveau groupe, les autres se décalent ; « Nouveau » apparaît en douceur |
| Citer (glisser ou « Citer ») | l'aperçu se pose au-dessus du champ | il monte de 4 px ; le fil remonte d'autant |
| « Explorer cette idée » (feuille ou lien « N réponses ») | on passe de la discussion à l'exploration du message | la feuille redescend ; la **bulle source** se déplace de sa place dans le fil jusqu'en tête de l'exploration (élément partagé, 240 ms, `--ease-move`) pendant que le reste fond ; puis le **trait** qui la relie aux réponses se trace une fois, de haut en bas (`scaleY`, 160 ms, après 120 ms) ; enfin les réponses montent de 4 px en fondu (160 ms, après 180 ms) |
| Revenir de l'exploration | on retrouve la discussion | la bulle source **rejoint sa place** dans le fil, centrée dans la vue ; rien d'autre ne bouge |
| Publier une réponse d'exploration | un message s'ajoute sous le trait | comme « Envoyer un message » ; le trait ne se retrace pas |
| Le nombre de réponses change (« 3 réponses ») | le libellé du lien | **rien** : un compteur ne s'anime pas |
| Ouvrir « Statut et actions » | le volet se déplie | son contenu se pose (4 px, 160 ms) |
| Toast | une confirmation apparaît puis part | il descend du haut, et y remonte en partant |
| Synthèse de Pandore en chargement | le contenu n'est pas là | deux cartes squelettes, à la forme exacte des vraies, chatoient lentement ; à l'arrivée, les cartes prennent leur place |

## 5. Changer d'écran

Ce qui **ne bouge pas** compte autant que ce qui bouge. La barre du haut, la
barre d'onglets et le parcours du sujet sont la charpente : ils restent en place
et ne font que fondre leur contenu. Seul le contenu remplacé se déplace.

- **Le titre et le bouton retour** : l'ancien s'efface en 100 ms, le nouveau
  arrive ensuite, sur place. Un fondu croisé de 240 ms superposait deux titres
  lisibles à la fois.
- **Les repères de position glissent.** Le trait de l'onglet courant passe d'un
  onglet à l'autre. Le trait de l'étape courante du parcours (Discussion,
  Propositions, Consensus) passe d'une étape à l'autre. C'est le seul mouvement
  qui dit **où** l'on est allé.
- **Sens.** Vers un niveau plus profond, le contenu vient de la droite. En
  remontant, il vient de la gauche. Entre deux onglets, c'est un fondu avec
  4 px de vertical : ce sont des pairs. Sujets → Réunion n'est plus une
  « poussée » vers la droite.
- **Fondu et déplacement séparés.** L'ancien contenu s'efface vite, le nouveau
  arrive 40 ms après et se pose sur toute la durée. Jamais de long croisement à
  mi-opacité.

**Explorer est un cas à part.** L'exploration est plus profonde que la
discussion, mais ce n'est pas un autre lieu : c'est la même idée, regardée de
plus près. D'où un sens dédié (`branch-in` / `branch-out`) : pas de glissement
latéral, un fondu court du reste de l'écran, et la bulle source qui **voyage**
entre sa place dans le fil et la tête de l'exploration. C'est elle qui dit d'où
l'on vient et où l'on revient. Sans View Transitions, l'écran entrant monte de
4 px en fondu : aucune bulle ne voyage, rien ne manque pour comprendre.

Mécanique : View Transitions, en amélioration progressive ([`../js/uxer-ui.js`](../js/uxer-ui.js),
[`../css/uxer.css`](../css/uxer.css)). Les noms ne sont posés que pendant une
transition. Sans View Transitions, l'écran entrant garde son repli : il glisse
de 12 px dans le bon sens.

## 6. Ce qui n'est volontairement pas animé

| Pas animé | Pourquoi |
|---|---|
| Fonds animés, halos, gradients qui respirent, particules, parallaxe | L'identité l'interdit : « aucune surface décorative colorée », « aucune signature de mouvement au-delà du monogramme ». Et le produit se lit debout, en magasin, entre deux clients : un fond qui bouge derrière du texte coûte à chaque lecture |
| La frappe, le défilement, la saisie | ce qui se répète plusieurs fois par minute ne s'anime pas |
| Les compteurs qui changent | c'est la valeur qui compte ; les chiffres sont à chasse fixe et ne dansent pas |
| L'entrée des cartes au défilement | une page vue plusieurs fois par jour ne se rejoue pas |
| Un rendu qui apporte plus de trois nouveautés | c'est un chargement, pas une action qu'on suit des yeux |
| Le filtre de recherche de l'accueil | une cascade à chaque frappe serait une attente |
| Tout rebond | un dépassement se lit comme un réglage laissé au hasard ; seul le point du monogramme « atterrit » |
| Message → proposition : un marqueur sur le message d'origine | le modèle de données ne relie pas une proposition à son message, et ce travail ne touche pas au modèle. Le texte pré-rempli et la carte désignée à l'arrivée portent la continuité |

Les éléments d'une messagerie d'idéation générique ne s'appliquent pas ici, faute
d'existence dans le produit : canvas, glisser-déposer, curseurs collaboratifs,
réponse d'IA en flux. Le jour où l'un d'eux existe, il reçoit sa ligne dans la
carte de la section 4, avec les mêmes valeurs. Les branches existent depuis la
1.20.0, sous le nom **Explorer** : elles ont reçu leurs lignes (section 4) et leur
sens de transition (section 5).

## 7. Mouvement réduit

`prefers-reduced-motion: reduce` coupe tout déplacement, tout enfoncement, toute
transition d'écran et tout fantôme. Deux choses restent, parce qu'elles ne
bougent pas :

- le **maintien du calque ouvert** : il supprime un mouvement ;
- les **désignations** : la bulle dont la feuille est ouverte, et le contour d'un
  élément qu'on vient de créer, affiché immobile le temps qu'il dure. Ce sont des
  informations (« c'est ce message », « c'est ici »), pas des gestes.

L'état au repos est toujours l'état final : sans animation, rien ne reste caché
ni décalé.

## 8. Ajouter un mouvement

Avant d'écrire : quel changement d'état il rend compréhensible ? Combien de fois
par jour il sera vu ? Que devient-il en mouvement réduit ? Retarde-t-il une
information attendue ? Une réponse floue à la première question suffit à
s'abstenir.

Puis :

1. une ligne dans la carte de la section 4 ;
2. les valeurs **uniquement** par les jetons ; une liste `transition` complète,
   jamais `all` ;
3. l'animation dans un bloc `@media (prefers-reduced-motion: no-preference)`,
   écrite depuis l'ancien état (`from`), l'état au repos restant l'état final ;
4. si le nœud est reconstruit par le rendu, la classe est posée par
   `js/motion.js` (ou par un drapeau à usage unique, comme `is-flip`) ;
5. `node tests/motion.test.js` vérifie les jetons, le repli, les boucles et
   l'absence de dépassement. Le reste se regarde dans un navigateur.

## 9. Ce qui a été vérifié

**Dans Chromium (Playwright, 390 × 844, mode local)**, un scénario de 20
contrôles a été joué en mouvement normal **et** en mouvement réduit. Il couvre
l'envoi, la feuille maintenue pendant un rendu de données, la réaction, le
passage feuille → fenêtre, la proposition créée et désignée, le vote, le
consensus ajouté, choisi puis supprimé, les onglets et le toast. Chaque contrôle
vérifie que l'animation **tourne réellement** (`getAnimations`), pas seulement
que sa classe est posée. Aucune erreur JavaScript.

S'y ajoutent :

- l'appui long au doigt (événements tactiles) : tassement linéaire, feuille,
  bulle désignée, feuille maintenue au relâcher ;
- le squelette de Pandore puis l'arrivée de la synthèse ;
- le changement de groupe d'un sujet sur l'accueil.

Les transitions ont été **regardées image par image** : animations figées puis
placées à des instants précis, en clair et, pour la feuille et le repère, en
sombre. Ces captures ont fait corriger trois défauts :

- la feuille, translucide pendant son entrée, laissait lire le fil au travers ;
- deux titres se superposaient pendant un changement d'écran ;
- le repère d'une proposition créée ne se jouait jamais. La règle d'arrivée sur
  l'écran (`.screen--enter .reveal`) l'emportait par spécificité. Le scénario
  ne vérifiait que la classe et ne pouvait pas le voir ; il mesure désormais
  l'animation.

**Dans les tests du dépôt** : `tests/motion.test.js` (contrat ; chaque règle a
été éprouvée par une mutation qui la viole). Et `tests/ui-focus.test.js`, qui
charge désormais la couche de mouvement : ses 42 contrôles de focus passent donc
à travers elle.

**Explorer (1.20.0)**, même méthode : un scénario de 21 contrôles joué en
mouvement normal, en mouvement réduit et en sombre (feuille et ordre des actions,
ouverture sans écriture, sens de transition, réponses rattachées, brouillon
propre, compteur « N réponses » sans bouton imbriqué, citation dans
l'exploration, proposition depuis une réponse, adresse directe et adresses
invalides, ouverture au clavier, retour d'en-tête et retour du système). L'élément
partagé a été regardé image par image à l'aller (la bulle monte en tête) et au
retour (elle revient à sa place, centrée). Le trait est mesuré : animé une seule
fois à l'arrivée, pas retracé à la réponse suivante, absent en mouvement réduit.

**Pas vérifié** : Safari iOS et WebKit en général, Firefox, un téléphone réel
d'entrée de gamme, le ressenti au doigt sur un vrai écran. Ces points sont dans
la recette ([`CHECKLIST_TEST.md`](CHECKLIST_TEST.md), « Mouvement de
continuité »).
