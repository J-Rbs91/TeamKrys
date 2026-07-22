# Limites de sécurité — à lire et à assumer

Ces limites sont **acceptées** et **ne doivent pas empêcher** l'implémentation.
Elles doivent en revanche être **affichées clairement**.

## Le fichier est chiffré, mais la clé est publique

La clé AES est inscrite dans le dépôt public (`js/teamkrys-config.js`). Par
conséquent :

- le **chiffrement ne constitue pas un contrôle d'accès** ;
- le **dépôt public permet de récupérer la clé** ;
- une personne obtenant le **fichier chiffré** peut le **déchiffrer** ;
- la confidentialité dépend **principalement de la protection du fichier Drive
  et de l'URL de la Web App** (voir [deployment.md](./deployment.md)) ;
- une Web App accessible publiquement **ne doit pas contenir de données
  réellement sensibles**.

## Usage prévu

- Application destinée à un **petit groupe interne** de confiance.
- **Ne doit pas** stocker de données clients, médicales, financières ou
  confidentielles.
- **Ne doit pas** être présentée comme une solution sécurisée pour des données
  sensibles.

## Ce qui n'est volontairement PAS fait

Pour rester léger et honnête, on **ne** met **pas** en place :

- de code d'initialisation temporaire ;
- de phrase secrète ;
- de dérivation PBKDF2 ;
- de jeton d'autorisation dérivé ;
- d'empreinte de clé ;
- d'écran de déverrouillage ;
- de rotation automatique de clé.

> Il ne faut **pas créer de faux système de sécurité** basé sur une clé présente
> dans le même dépôt public. Le chiffrement AES-GCM ici garantit surtout que le
> fichier Drive n'est pas lisible « à l'œil nu » et que son contenu est
> intègre/authentifié — rien de plus.

## Ce que le chiffrement apporte réellement

- Le contenu du fichier Drive n'est pas lisible directement.
- Discussions, propositions et votes ne sont pas stockés en clair.
- AES-GCM authentifie le contenu : une altération de l'IV, du ciphertext ou un
  mauvais déchiffrement échoue proprement (message générique côté app).
