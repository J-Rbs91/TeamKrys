# Validation — refonte-theme-palette-identite

## 1. Contrastes

`python3 tools/check-contrast.py` — **80 couples, 40 par mode, tous au-dessus de
leur seuil.** Le script lit les jetons de `css/app.css`, résout les `var()` et
compose les `rgba()` sur leur fond réel. Il sort 1 sous le seuil et la CI
l'exécute.

Les cinq couples les plus tendus, ceux qui bougeront en premier si un jeton est
retouché :

| Couple | Mode | Ratio | Seuil |
|---|---|---|---|
| Bord de champ sur un creux | clair | 3,40:1 | 3,0 |
| Segment « abstention » | clair | 3,40:1 | 3,0 |
| Bord de champ sur une feuille | sombre | 3,43:1 | 3,0 |
| Segment « abstention » | sombre | 3,79:1 | 3,0 |
| Encre secondaire sur l'accord | sombre | 4,76:1 | 4,5 |

## 2. Non-dépendance à la couleur

| Information | Second porteur |
|---|---|
| Barre de vote | Légende nommée et chiffrée sous la barre, plus `aria-label` sur la barre entière |
| Bouton de vote choisi | `aria-pressed`, remplissage, graisse |
| Statut d'un sujet ou d'une proposition | Libellé en toutes lettres dans la pastille, plus la pastille elle-même |
| « Mes » messages | Alignement à droite **et** remplissage — la couleur n'a jamais porté cette information seule |
| État de synchronisation | Libellé et forme de la pastille |

## 3. Les six tests de la doctrine d'écart

### Test de la phrase unique — **passé**

> La couleur ne dit qu'une chose : où en est l'accord.

Aucun adjectif d'ambiance, et la phrase tranche des cas concrets : elle a suffi
à décider seule du sort de la bulle « mes messages », du bouton de vote et de la
pastille « rejetée ».

### Test de justification — **passé**

Chaque choix visible se relie à quelque chose du produit : les deux teintes à la
chaîne `divergence → consensus` ; leur résolution au fait que le Consensus est
un point d'arrivée ; le neutre chaud au fait que le produit est du texte écrit
par l'équipe et qu'il a remplacé un tableur ; l'exclusion de la typographie à la
règle « zéro requête réseau ».

### Test du système — **passé**

Retirer la règle de résolution fait perdre quelque chose aux autres éléments :
les pastilles de statut redeviennent un code arbitraire, la barre de vote une
jauge parmi d'autres, le Consensus un écran comme les autres. Ils se répondent,
ce n'est pas une collection de décorations autonomes.

### Test des trois écrans — **passé avec une réserve nommée**

| Écran | La dimension porteuse y est-elle identifiable ? |
|---|---|
| Liste des sujets (dense, écran d'entrée) | Oui — les pastilles d'état portent l'accord ou le neutre |
| Proposition en débat | Oui, à l'intensité maximale — c'est la surface de référence |
| Consensus / sujet prêt | Oui, **par soustraction** : plus aucun chaud |

**Réserve.** Sur un fil de discussion **sans proposition**, il ne reste que le
chrome : l'écart n'y est pas visible. C'est un réglage d'intensité par surface,
prévu et écrit dans le noyau d'identité, et non une disparition de la dimension
— mais c'est le point où cette identité est la plus fragile, et il est nommé
plutôt que masqué.

### Test du coût réel — **passé**

| Question | Réponse |
|---|---|
| Combien de fichiers pour changer d'avis ? | Un seul bloc de jetons dans `css/app.css`, plus quatre règles de composants. Le reste passe par les jetons |
| Combien pèse le parti pris ? | Zéro octet réseau : aucune police, aucune image, aucune bibliothèque. Le fichier de style ne grossit que de ses commentaires |
| Mouvement réduit, 200 % de zoom, machine modeste ? | Aucun effet ajouté, aucune animation ajoutée, aucune surface floutée ajoutée. Les tailles restent en `rem`. Le thème n'a pas de coût de rendu propre |
| Qui le maintient au douzième écran ? | `tools/check-contrast.py` tient les seuils, `docs/IDENTITE_VISUELLE.md` tient les règles, et les deux sont référencés depuis l'en-tête de la feuille |

### Test de substitution de marque — **passé, et de justesse sur un point**

La **règle** ne se transpose pas : elle suppose un produit qui a un état de
convergence, ce qu'un outil financier, un logiciel de ressources humaines ou un
site de restaurant n'ont pas. Une capture de la barre de vote sur un sujet
convergé et une sur un sujet en débat appartiennent visiblement au même produit
et à aucun autre.

**Où il passe de justesse :** la palette prise isolément — grège chaude, bleu
d'encre, terre cuite — pourrait habiller un autre produit. Ce n'est pas elle qui
porte l'identité, c'est ce qu'elle signifie. C'est aussi pourquoi l'interdit
« aucune couleur de la couche technique dans la couche de délibération » est
structurel et non cosmétique : sans lui, il ne reste qu'une palette.

## 4. Ce qui n'est pas vérifié

- **Aucune recette sur appareil réel.** Le rendu a été observé sur captures
  produites par le Chromium de l'environnement, à partir d'un banc d'essai
  chargeant les feuilles réelles. Ce n'est ni un iPhone, ni un téléphone
  d'entrée de gamme, ni l'éclairage d'un magasin.
- **Aucune passe sur les navigateurs constructeurs**, alors que le dépôt en a
  une doctrine et des agents dédiés.
- **Le fil de discussion long** n'a pas été rendu : le banc d'essai en montre
  deux messages, pas soixante.

## 5. Suite de tests du dépôt

Tous verts après la mission :
`parity` · `sync` · `session` · `onboarding` · `navigation` · `product-view` ·
`product-integration` · `uxer-integration` · `compat-scan` · `check-contrast`.

Un seul test a dû être amendé : `product-integration` vérifie que l'application
et le cache annoncent la même version, et la version passe à 1.12.0.
