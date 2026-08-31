# Décisions — refonte-theme-palette-identite

Ce qui est ici ne se rediscute pas sans motif nouveau.

Le noyau d'identité produit par cette mission vit **hors de ce dossier**, parce
qu'il lui survit : [`../../../docs/IDENTITE_VISUELLE.md`](../../../docs/IDENTITE_VISUELLE.md).

---

## D1 — La dimension porteuse est la couleur

Les sept dimensions ont été confrontées aux quatre critères de la doctrine
d'écart. Trois ont été exclues **avant** tout choix esthétique :

| Dimension | Sort | Motif |
|---|---|---|
| Typographie | Exclue | La règle « zéro requête réseau » interdit toute police distante, et une famille système varie trop d'un appareil à l'autre pour porter une identité. La contrainte a décidé avant nous — c'est le critère 2 de la doctrine |
| Mouvement | Exclue | Surface vue plusieurs fois par jour. La plus chère et la plus fragile des sept ; la règle de fréquence prime sur toute considération esthétique |
| Matière | Exclue | Même motif, plus le coût de rendu sur téléphone d'entrée de gamme — l'aura et le grain avaient déjà été retirés pour cette raison en 1.5.0 |
| Rythme, imagerie | Écartées | Le rythme se paie en apprentissage et en responsive sur un produit déjà en usage ; le produit n'a pas d'imagerie et ne doit pas en acquérir |
| Voix | Conservée conventionnelle | Excellent rapport qualité-prix, mais la demande porte explicitement sur le thème et la palette. Reste disponible pour une mission ultérieure |
| **Couleur** | **Retenue** | Admissible à cette fréquence, coût de maintenance faible, tient sous densité. Son seul risque — l'accessibilité — est celui que ce dépôt sait déjà tenir, et qu'il tient désormais par script |

## D2 — Le territoire est « Deux voix qui convergent », choisi par le demandeur

Trois territoires ont été construits, réellement distincts par leur idée
directrice et non par leur palette. La recommandation portait sur « L'encre et
les voix » ; le demandeur a retenu « Deux voix qui convergent », et cette
décision lui appartient. Les motifs des deux écartés sont dans le noyau
d'identité, section 3, pour qu'un débat déjà tranché ne se rejoue pas.

Les deux risques nommés au moment du choix ont été traités comme des conditions
de livraison, pas comme des réserves :

- *deux échelles complètes à vérifier au ratio dans les deux modes* →
  `tools/check-contrast.py`, 40 couples par mode, exécuté par la CI ;
- *risque que la bi-teinte se lise comme décorative sur un écran dense* →
  la règle « un seul aplat coloré par surface », et la bulle d'encre de D5.

## D3 — Deux couches chromatiques disjointes

La couche de délibération n'emploie que les deux voix et le neutre. La couche
technique n'emploie que le vert, le carmin et l'ocre. Elles ne se croisent
jamais.

C'est ce qui justifie cinq teintes là où la doctrine d'écart pousserait à en
avoir moins. **Si la séparation se relâche, cinq teintes redeviennent une
dispersion** — c'est le point de fragilité de cette identité, et il est nommé
comme tel dans l'en-tête de `css/app.css`.

Conséquence appliquée : « prêt pour la réunion » passe du vert à l'accord,
« en débat » de l'ocre à la voix, « rejetée » du rouge au neutre, et la barre
de vote abandonne le couple vert / rouge.

## D4 — Une proposition écartée n'est pas une erreur

Le rouge appartient à la couche technique. Une équipe qui tranche contre une
option n'a rien fait de mal, et un état résolu par l'équipe est une convergence.
Coût accepté : on perd la saillance immédiate du rouge sur « rejetée » ; le
libellé et la position la portent.

## D5 — « Mes » messages sont pleins d'encre, pas d'accord

C'est le point où le parti pris se paie, et il se paie sur l'écran le plus vu du
produit. « C'est moi qui ai écrit ça » n'est pas une information d'accord : un
bleu ici dirait la même chose qu'un bleu sur le Consensus, et le système
cesserait de vouloir dire quelque chose là où il est le plus lu.

L'information reste portée deux fois — remplissage **et** alignement à droite —
donc elle ne dépend ni de la couleur ni d'une seule dimension. Elle libère au
passage le plus grand aplat coloré de l'application, ce qui sert la règle du
seul aplat par surface.

## D6 — Le bouton de vote choisi porte la couleur de ce qu'il exprime

Un « contre » qui s'allumerait en bleu dirait la même chose qu'un Consensus, à
l'endroit exact où l'on vote. Le bouton porte donc `data-vote`, et sa couleur
en découle. L'abstention se remplit en neutre — elle n'est ni un accord ni une
divergence. Le remplissage double `aria-pressed`, il ne le remplace pas.

## D7 — L'identité existante est relevée, pas remplacée

Le monogramme porte déjà `DIVERGENCE → CONVERGENCE → CONSENSUS` depuis la
mission `brainsto-logo-motion-identity`. Cette mission ne rejoue ni sa
chorégraphie ni sa durée : elle **prolonge la même idée sur la couleur**, ce qui
est la conduite prescrite quand un produit porte déjà une identité. En inventer
une seconde par-dessus aurait produit deux identités concurrentes, ce qui est
pire que l'absence.

`css/uxer.css` déclarait porter « l'écart sur une seule dimension, la continuité
de l'action ». Cette formulation est corrigée : le mouvement y est une politique
fonctionnelle, pas un écart d'identité — sans quoi le budget d'écart serait
dépensé deux fois.

## D8 — La vérification devient un script

`tools/check-contrast.py` lit les jetons de `css/app.css`, ne les recopie pas,
résout les `var()` et les `rgba()` posés sur leur fond réel, et échoue sous le
seuil. La CI l'exécute, ainsi que la régénération des icônes, dont le fond doit
rester identique à `background_color`.

Motif : la phrase « tous les couples ont été vérifiés au ratio » vieillissait à
chaque modification de jeton, parce qu'elle reposait sur une relecture à l'œil.

## D9 — Le palier le plus clair n'est pas blanc

Retour du demandeur après livraison : « le blanc que tu as choisi est trop
blanc ». Le constat est juste et il était vérifiable sur les captures — les
surfaces étaient à `#ffffff` sur une assiette chaude, ce qui les fait lire comme
un trou froid découpé dans le papier plutôt que comme du papier. Le registre
clinique revenait par la seule surface la plus grande de l'écran.

Toute la plaque claire descend d'un cran, teinte conservée : c'est le **rapport**
entre la surface et le fond qui détache une carte, pas la clarté absolue de la
carte. Les encres posées sur un aplat coloré suivent — un blanc pur y rouvrirait
le même trou.

Coût accepté : la marge sur les seuils se resserre en mode clair. Les 80 couples
tiennent, et c'est le script qui le dit, pas la prudence. L'interdit « aucun
blanc pur hors impression » entre au noyau d'identité, sans quoi il reviendrait
au premier composant ajouté.

## Attribution

Proposition construite à partir du corpus local UXER et de la matière extraite
du produit lui-même. **Aucune plateforme externe n'a été consultée** pendant
cette exécution ; aucun outil d'accès externe n'a été détecté ni sollicité.
