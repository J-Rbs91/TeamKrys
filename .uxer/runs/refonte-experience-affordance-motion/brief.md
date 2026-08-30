# Brief UXER — refonte expérience, affordance et mouvement

## Mission

Refondre l'expérience utilisateur de BrainstO. sans modifier son modèle métier : rendre les actions importantes immédiatement découvrables, rendre le parcours d'un sujet lisible à tout instant et introduire des transitions dynamiques soignées sans transformer le mouvement en taxe sur les usages répétés.

## Tâche principale

BrainstO. prépare une réunion d'équipe selon un cycle stable :

1. ouvrir ou créer un sujet ;
2. discuter ;
3. transformer des idées en propositions ;
4. voter ;
5. formuler puis choisir un consensus ;
6. produire la synthèse de réunion.

L'interface est utilisée comme un outil de travail quotidien, principalement sur téléphone. La rapidité, la prédictibilité et les cibles tactiles priment sur l'expression décorative.

## Périmètre confirmé

- accueil et cartes de sujets ;
- discussion et actions sur les messages ;
- passage Discussion → Propositions → Consensus ;
- vote et statut des propositions ;
- choix du consensus ;
- feuilles et fenêtres ;
- transitions entre niveaux de navigation ;
- comportement mobile et mouvement réduit.

## Contraintes conservées

- aucune dépendance, police, image ou ressource distante ;
- PWA hors ligne conservée ;
- aucune modification du modèle partagé, du backend ou du protocole de synchronisation ;
- pile de navigation hiérarchique existante conservée ;
- cibles tactiles de 44 px minimum conservées ;
- palette neutre + accent teal existante conservée ;
- `prefers-reduced-motion` est une contrainte, pas une option ;
- les enrichissements UX doivent être progressifs : leur absence ne doit pas casser BrainstO.

## Niveau de preuve

- **Code : disponible** — structure, actions réelles, sémantique, états et navigation inspectés.
- **Historique UXER : disponible** — mission onboarding précédente et doctrine de mouvement relues.
- **Rendu navigateur instrumenté : indisponible dans l'environnement de cette mission.**

Conséquence : cette mission peut conclure sur les actions réellement disponibles et sur les signifiants ajoutés dans le code. Elle ne doit pas présenter la perceptibilité finale, le ressenti des transitions ou la qualité tactile comme visuellement vérifiés tant qu'une inspection du produit rendu n'a pas été faite.
