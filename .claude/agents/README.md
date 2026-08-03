# Agents QA — recette mobile multi-navigateurs

Dix agents spécialisés dans le test de BrainstO. sur téléphone. Le découpage
suit les **moteurs de rendu**, pas les noms commerciaux : c'est le moteur qui
décide du comportement, et trois moteurs couvrent tous les navigateurs mobiles
qui existent.

| Agent | Couvre | Appeler quand |
|---|---|---|
| `qa-mobile-orchestrator` | la recette entière | toute demande de test mobile, avant publication |
| `qa-webkit-ios` | Safari iOS **et tous les navigateurs iOS** | iPhone, iPad, installation, clavier, stockage effacé |
| `qa-blink-android` | Chrome, Samsung Internet, Edge, Opera, Brave, Xiaomi, Huawei, Oppo, Silk | Android, bannière d'installation, mode sombre forcé |
| `qa-gecko-firefox` | Firefox Android, Focus, Tor | règle CSS qui « saute », sélecteur récent, stockage cloisonné |
| `qa-webview-inapp` | WhatsApp, Instagram, Gmail, Teams, WeChat, WebView système | lien partagé, écran blanc chez un collègue, adresse à ressaisir |
| `qa-legacy-proxy-browsers` | Opera Mini, UC cloud, Puffin, KaiOS, plateformes mortes | statuer sur le non-supporté, garantir un échec propre |
| `qa-pwa-offline` | Service Worker, manifeste, cache, file d'actions | `service-worker.js`, hors ligne, mise à jour, publication |
| `qa-responsive-touch` | largeurs, zones sûres, clavier, gestes, cibles | `css/app.css`, écran coupé, bouton inatteignable |
| `qa-mobile-a11y` | VoiceOver, TalkBack, contraste, focus | `js/ui.js`, feuille modale, icône sans libellé |
| `qa-mobile-perf` | poids, listes, flou, boucle de synchronisation | lenteur, longue discussion, nouvelle animation |

## Ordre d'intervention

```
0. node tests/qa/compat-scan.js --json   ← toujours en premier, sans exception
1. qa-webkit-ios · qa-blink-android · qa-gecko-firefox      (en parallèle)
2. qa-webview-inapp · qa-legacy-proxy-browsers              (en parallèle)
3. qa-pwa-offline · qa-responsive-touch · qa-mobile-a11y · qa-mobile-perf
4. qa-mobile-orchestrator : matrice, verdict, reste à faire sur appareil
```

## Règles communes

- **Aucun agent n'écrit dans le code.** Ils lisent, exécutent des commandes non
  destructives, et proposent des correctifs situés (fichier, ligne, valeur).
- **Aucun agent n'ajoute de dépendance.** Ni `package.json`, ni `node_modules/`,
  ni Playwright : la règle du dépôt prime sur le confort de l'outillage.
- **Aucun agent ne commit, ne pousse, ni ne touche aux numéros de version.**
- **Trois états seulement** : observé conforme, observé défaillant, non observé.
  Le troisième ne se convertit jamais en `OK`.
- Chaque agent rend un compte-rendu Markdown aux sections imposées **et** un
  bloc JSON strict, pour que l'orchestrateur puisse agréger.

Références : `docs/QA_NAVIGATEURS.md` (protocole et matrice lisible),
`tests/qa/browser-matrix.json` (matrice machine),
`tests/qa/feature-baseline.json` (baseline de support),
`docs/CHECKLIST_TEST.md` (recette fonctionnelle).
