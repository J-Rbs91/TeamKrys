# Recette mobile — tous les navigateurs

Ce document dit **qui doit fonctionner, à quel point, et comment le vérifier**.
Il complète [`CHECKLIST_TEST.md`](CHECKLIST_TEST.md), qui vérifie les
fonctionnalités ; ici on vérifie les navigateurs.

---

## Trois moteurs, et rien d'autre

Il existe des dizaines de navigateurs mobiles et trois moteurs. Tester par nom
commercial fait perdre du temps ; tester par moteur couvre tout.

| Moteur | Qui l'utilise sur mobile | Ce qu'il faut savoir |
|---|---|---|
| **WebKit** | Safari iOS, **et aussi** Chrome iOS, Firefox iOS, Edge, Brave, DuckDuckGo, Opera, Arc, Orion | Sur iOS, tous les navigateurs partagent le WebKit du système. La version qui compte est celle d'**iOS**, jamais celle de l'application. Un défaut dans l'un existe dans tous. |
| **Blink** | Chrome Android, Samsung Internet, Edge, Opera, Brave, Vivaldi, DuckDuckGo, Xiaomi, Huawei, Oppo, vivo, Amazon Silk, WebView système | « Chromium » ne veut pas dire « à jour » : les navigateurs constructeurs embarquent des versions figées, parfois très anciennes. On raisonne en **version Chromium embarquée**. |
| **Gecko** | Firefox Android, Firefox Focus, Tor Browser, Iceraven, Mull | Le plus tardif sur les sélecteurs récents : `:has()` en 121, `color-mix()` en 113. C'est notre meilleur révélateur de CSS fragile. Firefox **iOS** n'est pas Gecko. |
| *(rendu distant)* | Opera Mini en économie extrême, UC en mode cloud, Puffin | La page est composée sur un serveur. Ni Service Worker, ni IndexedDB, ni WebCrypto : l'application **ne peut pas** y tourner. Objectif : échouer proprement. |

---

## Niveaux d'exigence

| Tier | Exigence | Qui |
|---|---|---|
| **A** | Doit fonctionner parfaitement. Un défaut bloque la publication. | Safari iOS 15.4+, Chrome iOS, Chrome Android 108+, Samsung Internet 21+, Firefox Android 121+, WebView système, fenêtres in-app WhatsApp / Meta / Gmail |
| **B** | Doit fonctionner. Dégradation cosmétique documentée tolérée, jamais une perte de fonction. | iOS 15.0–15.3, Chrome Android 100+, Samsung Internet 16+, Edge, Brave, DuckDuckGo, Opera, Firefox 115+ |
| **C** | Doit rester utilisable, ou échouer honnêtement. Ni écran blanc, ni perte de données. | Navigateurs constructeurs (Xiaomi, Huawei, Oppo, vivo), UC, QQ / WeChat, Silk, Vivaldi, Focus, Tor, Opera Mini, Puffin |
| **D** | Hors support. Aucun correctif n'est dû. | KaiOS, Internet Explorer Mobile, Edge Legacy, BlackBerry, Symbian |

La liste complète et à jour vit dans [`../tests/qa/browser-matrix.json`](../tests/qa/browser-matrix.json) :

```bash
node tests/qa/compat-scan.js --list
```

---

## Ce qui se vérifie sans appareil

```bash
node tests/qa/compat-scan.js              # rapport lisible
node tests/qa/compat-scan.js --json       # rapport machine, pour les agents QA
node tests/qa/compat-scan.js --tier=A     # n'échouer que sur le tier A
node tests/qa/compat-scan.js --browser=safari-ios
```

Le scan croise les fonctions web réellement présentes dans le dépôt avec la
baseline hors ligne, et répond à une seule question : **quelle ligne casse sur
quel navigateur, et est-ce gardé ?** Il détecte quatre choses :

1. **Fonctions hors baseline** — un `color-mix()` sur un parc qui descend à
   iOS 15.4, un `:has()` sur Firefox 115.
2. **Replis écrits à l'envers** — `min-height: 100dvh` suivi de
   `min-height: 100vh`. Les deux déclarations sont valides sur un moteur
   récent : c'est la **seconde** qui gagne, donc la moderne ne sert nulle part.
   Le repli se met **avant**, toujours.
3. **Champs sous 16 px** — sur iOS, donner le focus à un champ dont le texte
   fait moins de 16 px zoome toute la page, et le zoom ne se défait pas.
4. **Couverture par navigateur** — ce qui manque, navigateur par navigateur.

Un faux positif se justifie sur place, il ne se contourne pas :

```css
/* qa-allow: css-color-mix — surface décorative, l'absence est sans effet */
```

Le scan n'ouvre aucun navigateur et n'en ouvrira jamais : le dépôt n'a ni
`package.json` ni `node_modules/`, et cette règle prime sur le confort de
l'outillage.

---

## Ce qui ne se vérifie que sur un vrai téléphone

Rendu, tactile, clavier virtuel, installation, éviction du stockage, fenêtres
in-app, lecteur d'écran, fluidité. Trois passes obligatoires avant publication,
en thème clair **et** sombre, console ouverte, **zéro erreur** attendue.

### Passe 1 — iPhone (WebKit) · agent `qa-webkit-ios`

- [ ] Ouvrir en **https** (`crypto.subtle` et `crypto.randomUUID` n'existent pas
      en `http://` sur IP locale : le verrou échouerait sans que le code soit en
      cause — c'est le premier faux bug à écarter).
- [ ] Safari : installation sur l'écran d'accueil, icône monogramme, démarrage
      en mode autonome.
- [ ] Chrome iOS : l'application fonctionne, et aucun texte ne promet une
      installation impossible ailleurs que dans Safari.
- [ ] Composeur de messages, **clavier ouvert** : champ visible, dernier message
      lisible, bouton d'envoi atteignable.
- [ ] Focus sur le champ de message : **la page ne zoome pas**.
- [ ] Application en arrière-plan plus de 3 minutes : reverrouillage au retour,
      resynchronisation immédiate, brouillon intact.
- [ ] Mode avion : ouverture, dernières données, action mise en file.
- [ ] Zones sûres : rien sous l'encoche ni sous la barre d'accueil, **y compris
      en paysage**.

### Passe 2 — Android (Blink) · agent `qa-blink-android`

- [ ] Chrome : bannière ou menu d'installation, application autonome, splash.
- [ ] **Samsung Internet** au même rang que Chrome : mode sombre forcé activé,
      contraste vérifié sur les bulles et les surfaces floutées.
- [ ] Taille de police du système à **130 %** : rien de tronqué ni superposé.
- [ ] Tirage vers le bas dans le fil de discussion : **pas de rechargement**
      au milieu d'une saisie.
- [ ] Geste de retour du système depuis un écran secondaire : retour dans
      l'application, pas sortie.
- [ ] Application chassée de la mémoire puis rouverte : file d'actions intacte.
- [ ] Un navigateur constructeur au moins (Xiaomi, Huawei, Oppo) si l'équipe en
      utilise : vérifier la version réelle via `chrome://version`.

### Passe 3 — Firefox Android (Gecko) · agent `qa-gecko-firefox`

- [ ] Mise en page conforme : c'est ici que se voient les règles CSS rejetées
      en bloc.
- [ ] Protection renforcée en mode **strict** : l'application fonctionne, et le
      retour à l'écran d'accueil est propre si le stockage a été effacé.
- [ ] Aucune fonction absente appelée sans test de présence (partage,
      installation automatique).

### Passes conditionnelles

| Quand | Passe | Agent |
|---|---|---|
| Le lien circule dans WhatsApp, Instagram, Gmail, Teams | ouvrir depuis chaque application : l'écran d'accueil s'affiche, l'adresse se ressaisit sans erreur, la sortie vers un vrai navigateur est possible | `qa-webview-inapp` |
| `service-worker.js` ou `manifest.webmanifest` changent | cycle de mise à jour, bandeau sans boucle, file conservée | `qa-pwa-offline` |
| `css/app.css` change | 320 px → tablette, paysage, clavier, cibles 44 px | `qa-responsive-touch` |
| `js/ui.js` change | VoiceOver et TalkBack : libellés, focus dans les feuilles, annonces d'état | `qa-mobile-a11y` |
| Lenteur signalée, longue discussion | 500 messages, défilement, flou, boucle de synchronisation | `qa-mobile-perf` |
| Vieux téléphone, réseau du magasin | échec propre, message utile, aucune saisie perdue | `qa-legacy-proxy-browsers` |

---

## Les agents QA

Dix agents spécialisés vivent dans [`../.claude/agents/`](../.claude/agents/).
Ils lisent le dépôt, exécutent le scan, et rendent un verdict argumenté ; aucun
n'écrit dans le code, n'ajoute de dépendance ni ne commit. Voir
[`../.claude/agents/README.md`](../.claude/agents/README.md) pour le routage et
l'ordre d'intervention.

Règle qu'ils appliquent tous, et qui vaut aussi pour un humain pressé : **trois
états seulement** — observé conforme, observé défaillant, non observé. Le
troisième est le plus fréquent, et il ne devient jamais « ça devrait marcher ».

---

## Tenir la matrice à jour

Deux fichiers, versionnés, relus à la main, sans aucune donnée téléchargée :

- [`../tests/qa/browser-matrix.json`](../tests/qa/browser-matrix.json) — les
  navigateurs visés, leur tier, leur version plancher. À revoir quand le parc de
  l'équipe change, ou quand un membre signale un navigateur absent de la liste.
- [`../tests/qa/feature-baseline.json`](../tests/qa/feature-baseline.json) — la
  version à partir de laquelle chaque fonction web est disponible. À compléter
  quand une nouvelle fonction entre dans le code. Les entrées marquées
  `"verify": true` sont approximatives : les confirmer sur appareil avant de les
  opposer à quiconque.

Relever un plancher de version est une décision d'équipe, pas un raccourci
technique : cela revient à exclure des téléphones réels. La consigner ici, avec
sa date et sa raison.
