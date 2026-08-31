# Identité — BrainstO.

Mise à jour : 2026-08-31 · Statut : en vigueur

Ce fichier dit **pourquoi** BrainstO. ressemble à cela. Les valeurs, elles, vivent
dans les jetons de [`../css/app.css`](../css/app.css), qui en est la source unique :
recopier une couleur ici créerait une seconde vérité, qui divergerait.

Il a été produit par une mission UXER — `.uxer/runs/refonte-theme-palette-identite`.
Aucune plateforme externe n'a été consultée : la proposition est construite à partir
du corpus local UXER et de la matière extraite du produit lui-même.

---

## 1. Essence

**Idée centrale.** BrainstO. sert à une équipe de magasin à faire mûrir un sujet
avant la réunion : plusieurs personnes déposent des positions divergentes, et
l'outil rend visible ce sur quoi elles convergent.

**Personnalité.** Sobre plutôt qu'institutionnel · direct plutôt que policé ·
franc plutôt que rassurant · outil plutôt qu'application grand public.

**Doit faire ressentir**, au moment d'usage réel — debout, en magasin, entre deux
clients, sur un téléphone : *je vois en trois secondes où en est l'accord sur ce
sujet.* Pas « c'est joli », pas « c'est moderne » : **où en est l'accord**.

**Ne doit pas devenir** un outil collaboratif interchangeable de plus. C'est la
dérive vraisemblable de ce produit-là, et elle a déjà eu lieu une fois : l'ardoise
froide et l'accent teal du thème précédent étaient corrects, accessibles, cohérents
— et transposables tels quels à n'importe quel SaaS d'équipe. Sans faute ne veut pas
dire reconnaissable.

---

## 2. Matière retenue

| Élément du produit | Ce qu'il autorise visuellement |
|---|---|
| La chaîne `Sujet → Discussion → Propositions → Votes → Consensus` est le produit tout entier | Une couleur qui **change d'état le long de la chaîne** plutôt qu'un accent constant et décoratif |
| Le vote rend visibles adhésion, désaccord, abstention et participation | La divergence est une **donnée affichée**, pas une métaphore : elle peut porter la couleur |
| Le Consensus est le point d'arrivée, et il est une **formulation écrite** | Un point d'arrivée doit se voir comme un point d'arrivée : quelque chose y disparaît |
| Le monogramme porte déjà `DIVERGENCE → CONVERGENCE → CONSENSUS` (mission précédente, issue #30) | L'identité existe déjà en mouvement ; la couleur la **relève et la prolonge** au lieu d'en inventer une seconde |
| L'outil a remplacé un tableur partagé, et tout son contenu est du texte écrit par l'équipe | Un registre d'encre et de papier plutôt que de verre et de lumière |
| Usage debout, en magasin, plusieurs fois par jour, sous éclairage fort | Contraste réel exigé partout ; aucune matière lourde, aucun flou nouveau, aucune signature de mouvement |

---

## 3. Territoire

**Retenu — « Deux voix qui convergent ».**

Deux teintes portent le produit et n'ont chacune qu'un seul sens : une teinte froide
pour ce sur quoi l'équipe converge, une teinte chaude pour ce qui diverge encore.
Tant qu'un sujet est en discussion, les deux coexistent à l'écran. Sur un sujet prêt
et sur le Consensus, la teinte chaude a disparu — la convergence n'est pas décrite,
elle est **visible par soustraction**. Tout le reste de l'interface est en neutre
chaud, sans aucune couleur.

**Écartés.**

- *L'encre et les voix* — chrome entièrement en encre, aucune couleur d'interface, la
  teinte de marque réservée au Consensus. Écarté : l'écart y est plus discret et ne
  met pas en scène la divergence, qui est pourtant ce que le produit sert à voir.
- *Le registre du magasin* — contraste maximal et un orange de signalétique unique.
  Écarté : l'orange entre en collision avec le jaune d'avertissement, et une couleur
  de signalétique fatigue en usage répété plusieurs fois par jour.

---

## 4. Principes

1. **La couleur ne dit qu'une chose : où en est l'accord.** Froid = ce sur quoi
   l'équipe converge. Chaud = ce qui diverge encore. Tout le reste — cartes, bulles,
   texte, séparateurs — est en neutre.
   *Coût accepté :* on renonce à colorer pour hiérarchiser. La hiérarchie passe donc
   entièrement par la graisse, l'espacement et le rapport de surfaces, ce qui est plus
   exigeant à tenir.

2. **Hors barre de vote, une seule des deux teintes est dépensée en aplat sur
   une même surface ; l'autre ne peut y apparaître qu'en trait ou en encre.**
   C'est ce qui empêche la bi-teinte de se lire comme une décoration sur un écran
   dense. La barre de vote est la seule exception, et c'en est la raison d'être :
   c'est le seul endroit où la divergence est une **quantité**, donc le seul où
   les deux teintes doivent se comparer côte à côte.
   *Coût accepté :* chaque nouveau composant demande de trancher laquelle des deux
   teintes y est en aplat. Ce n'est pas automatisable, et l'exception ne s'étend
   à aucune autre surface — une seconde exception ferait tomber la règle.

3. **Deux couches chromatiques disjointes, et elles ne se croisent jamais.** La
   couche de délibération n'emploie que les deux voix et le neutre. La couche
   technique — synchronisation, erreur, action destructive — n'emploie que le vert,
   le carmin et l'ocre, et n'emploie jamais les deux voix.
   *Coût accepté :* cinq teintes au total dans le fichier. C'est plus qu'un accent
   unique, et cela ne se justifie que par cette séparation — si elle se relâche, la
   palette redevient une dispersion.

4. **Une proposition écartée n'est pas une erreur.** Un état résolu par l'équipe est
   du neutre ou du froid, jamais du rouge : le rouge appartient à la couche technique.
   *Coût accepté :* on perd la saillance immédiate du rouge sur « rejetée » ; le
   libellé et la position la portent.

5. **Le neutre est chaud, et il l'est partout — y compris là où on met du blanc.**
   L'assiette du produit est une grège d'encre et de papier, pas une ardoise froide,
   et la surface la plus claire est du papier, pas du blanc pur. Un blanc pur posé sur
   une assiette chaude se lit comme un trou froid découpé dedans : il rouvre à lui
   seul le registre clinique que le reste de l'échelle existe pour quitter. C'est ce
   qui fait que le bleu se lit comme l'unique élément froid de l'écran.
   *Coût accepté :* on perd le contraste maximal qu'offrait le blanc pur, donc la
   marge sur les seuils est plus étroite en mode clair — c'est le script de contrôle
   qui la tient, pas la prudence. Et le mode sombre est plus difficile à régler : un
   sombre chaud vire au sépia s'il est trop teinté, et à l'ardoise s'il ne l'est pas
   assez.

---

## 5. Signatures

| Signature | Nature | Où | Absence visible à |
|---|---|---|---|
| **La résolution chromatique** — la teinte chaude disparaît quand l'équipe a tranché | **Principale** (porte l'écart, dimension couleur) | Barre et légende de vote · état d'un sujet · état d'une proposition · Consensus · sujet prêt | Un écran de Consensus qui porte encore du chaud, ou un sujet en pleine discussion entièrement froid |
| Le point du monogramme est le seul froid de la marque au repos | Secondaire | Icône, écran de verrouillage, en-tête | Un monogramme dont l'anneau serait coloré |
| Les cartes ne se détachent que par le rapport surface / fond, jamais par une ombre portée décorative | Secondaire | Toutes les listes, toutes les cartes | Une carte qui « lévite » sans être empilée sur quoi que ce soit |
| Les valeurs numériques sont à chasse fixe partout | Secondaire | Compteurs de votes, participation, horodatages | Un compteur dont les chiffres dansent quand la valeur change |
| Le trait qui délimite tient seul le seuil des composants ; le trait qui habille ne porte aucune information | Secondaire | Champs, contrôles, séparateurs | Un champ dont le bord ne se distingue plus du séparateur d'à côté |

---

## 6. Application par surface

| Surface | Ce qui porte l'identité | Ce qui est relâché |
|---|---|---|
| Page publique | Sans objet — le produit n'en a pas | — |
| Navigation (barre collante, parcours du sujet) | Le froid marque l'étape atteinte ; le chaud n'y entre jamais | Aucune expression au-delà du marqueur d'étape |
| Écrans fonctionnels (liste des sujets) | L'état d'accord de chaque sujet, en pastille | Rien de coloré en dehors des pastilles |
| Fil de discussion (l'écran le plus dense et le plus vu) | Rien, sauf les propositions et les votes qui s'y trouvent. Les bulles sont neutres, y compris les siennes | Intensité minimale : c'est la surface la plus exposée du produit |
| Tableaux et données (barre de vote, légende, participation) | **Intensité maximale de l'application** — c'est là que la divergence est une donnée | Rien n'est relâché ici ; c'est la surface de référence |
| Formulaires et composeur | Le froid sur le champ actif et l'action d'envoi | Aucun chaud, jamais |
| Modales, feuilles, panneaux | Le froid sur l'action principale ; le carmin sur l'action destructive | Aucune expression de surface |
| États vides et erreurs | Neutre et texte. Une erreur appartient à la couche technique | Aucune des deux voix |
| Première ouverture (présentation, monogramme) | Intensité maximale admissible : c'est le moment rare — la séquence `divergence → convergence` du monogramme | Rien d'autre ne se permet ce geste |
| Mobile | Tout ce qui précède : le mobile **est** le produit, il n'est pas une réduction | Rien |

---

## 7. Interdits

Propres à ce produit :

- **La teinte chaude n'apparaît jamais dans le chrome.** Ni bouton, ni barre, ni
  focus, ni lien. Sa seule apparition signifie qu'il reste du désaccord.
- **Aucune troisième teinte identitaire.** Le budget d'écart est dépensé ; une
  troisième couleur ne renforcerait pas la direction, elle la dissoudrait.
- **Aucune couleur de la couche technique dans la couche de délibération** — pas de
  vert « pour », pas de rouge « contre », pas d'ocre « en débat ».
- **Aucune surface décorative colorée.** Un aplat coloré signifie toujours un état
  d'accord, jamais un ornement.
- **Aucun blanc pur, et aucun noir pur**, hors feuille d'impression — le papier
  d'imprimante, lui, est réellement blanc. Une encre posée sur un aplat coloré est
  du papier, pas du blanc.
- **Aucune seconde famille typographique, aucune police distante.** La contrainte
  « zéro requête réseau » est antérieure à cette identité et lui est supérieure.
- **Aucune signature de mouvement au-delà du monogramme.** La règle de fréquence du
  dépôt prime : ce qui est vu cent fois par jour reste court ou immobile.

Dérives génériques : voir le fichier des signatures génériques du corpus UXER
(`references/generic-ai-design-antipatterns.md`), qui reste opposable en entier.
Un parti pris ne lève aucun seuil d'accessibilité : un écart qui échoue au contraste
se corrige en gardant l'intention et en changeant la valeur.
