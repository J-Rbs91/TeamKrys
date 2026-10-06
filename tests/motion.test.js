/* BrainstO. : contrat du système de mouvement.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/motion.test.js
 *
 * Ce que ce fichier verrouille, et pourquoi chaque point casserait sans bruit :
 *  - le branchement : css/motion.css et js/motion.js chargés, dans le bon ordre, précachés, scannés ;
 *  - une seule source de valeurs : aucune courbe ni durée tapée hors des jetons de css/app.css, aucune liste
 *    `transition` qui anime « tout » ;
 *  - aucun dépassement hors du monogramme, aucune boucle hors chargement et synchronisation ;
 *  - le repli : toute animation de css/motion.css vit sous `prefers-reduced-motion: no-preference` ;
 *  - js/motion.js ne touche ni au focus ni à l'état, et ses fantômes n'ont plus d'identité ;
 *  - les actions qui font apparaître un élément ailleurs l'annoncent (Motion.expect).
 * Le comportement à l'exécution (calque maintenu, message désigné, focus intact avec la couche chargée) est vérifié
 * dans tests/ui-focus.test.js, sur son DOM de test. Le rendu réel, image par image, se vérifie dans un navigateur :
 * voir docs/MOUVEMENT.md, « Ce qui a été vérifié ».
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; } catch (error) { failures.push({ name, error }); }
}
function expect(condition, message) { if (!condition) { throw new Error(message); } }

const index = read("index.html");
const worker = read("service-worker.js");
const scan = read("tests/qa/compat-scan.js");
const APP = stripComments(read("css/app.css"));
const UXER = stripComments(read("css/uxer.css"));
const MOTION = stripComments(read("css/motion.css"));
const JS = read("js/motion.js");
const JS_CODE = stripComments(JS).replace(/^\s*\/\/.*$/gm, "");
const APP_JS = read("js/app.js");
const UI_JS = read("js/ui.js");

/* Règles CSS à plat, avec la pile de @media qui les entoure (même lecture que css-contract, en plus court). */
function rules(text) {
  const out = [];
  const stack = [];
  let i = 0;
  let buffer = "";
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      const head = buffer.trim();
      buffer = "";
      if (/^@keyframes/.test(head)) {
        let depth = 1;
        i += 1;
        while (i < text.length && depth) { if (text[i] === "{") { depth += 1; } if (text[i] === "}") { depth -= 1; } i += 1; }
        continue;
      }
      if (/^@(media|supports)/.test(head)) { stack.push(head); i += 1; continue; }
      const end = text.indexOf("}", i);
      const body = text.slice(i + 1, end);
      const decls = {};
      body.split(";").forEach((part) => {
        const at = part.indexOf(":");
        if (at > 0) { decls[part.slice(0, at).trim()] = part.slice(at + 1).trim(); }
      });
      out.push({ selector: head, decls, media: stack.slice() });
      i = end + 1;
      continue;
    }
    if (ch === "}") { stack.pop(); buffer = ""; i += 1; continue; }
    buffer += ch;
    i += 1;
  }
  return out;
}

const MOTION_RULES = rules(MOTION);
const UXER_RULES = rules(UXER);

/* ------------------------------------------------------------- Branchement --- */

check("index.html charge css/motion.css après css/uxer.css", () => {
  const uxer = index.indexOf('href="css/uxer.css"');
  const motion = index.indexOf('href="css/motion.css"');
  expect(motion > 0, "css/motion.css n'est pas chargée");
  expect(motion > uxer, "css/motion.css doit venir après css/uxer.css : elle porte les listes `transition` des commandes");
});

check("js/motion.js : après js/product-ui.js, avant js/uxer-ui.js", () => {
  const product = index.indexOf('src="js/product-ui.js"');
  const motion = index.indexOf('src="js/motion.js"');
  const uxer = index.indexOf('src="js/uxer-ui.js"');
  expect(motion > 0, "js/motion.js n'est pas chargé");
  expect(product < motion, "les cartes de l'accueil doivent être regroupées AVANT la mesure (product-ui avant motion)");
  expect(motion < uxer, "View Transitions doit appeler le rendu de la couche de mouvement (motion avant uxer-ui)");
});

check("la PWA précache les deux fichiers, et le scan de compatibilité les lit", () => {
  ["css/motion.css", "js/motion.js"].forEach((file) => {
    expect(worker.indexOf('"' + file + '"') >= 0, "service-worker.js ne précache pas " + file);
    expect(scan.indexOf('"' + file + '"') >= 0, "tests/qa/compat-scan.js ne lit pas " + file);
  });
});

/* ---------------------------------------------------------------- Valeurs --- */

check("jetons : une courbe par nature de mouvement, des durées bornées, une sortie plus courte que l'entrée", () => {
  ["--ease-out", "--ease-move", "--ease-drawer", "--ease-in-out", "--dur-fast", "--dur-base", "--dur-exit", "--dur-move",
    "--dur-slow", "--dur-highlight", "--dur-loading", "--press-scale", "--press-scale-soft"].forEach((token) => {
    expect(new RegExp(token + "\\s*:").test(APP), "jeton absent de css/app.css : " + token);
  });
  const ms = (token) => {
    const m = new RegExp(token + "\\s*:\\s*([\\d.]+)(ms|s)").exec(APP);
    return m ? parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1) : NaN;
  };
  expect(ms("--dur-exit") < ms("--dur-slow"), "--dur-exit doit être plus court que --dur-slow : on renvoie plus vite qu'on n'ouvre");
  ["--dur-fast", "--dur-base", "--dur-exit", "--dur-move", "--dur-slow"].forEach((token) => {
    expect(ms(token) <= 300, token + " dépasse 300 ms, le plafond de ce qui appartient à l'interface");
  });
  const scale = (token) => parseFloat(new RegExp(token + "\\s*:\\s*([\\d.]+)").exec(APP)[1]);
  expect(scale("--press-scale") >= 0.95 && scale("--press-scale") < 1, "--press-scale hors de [0,95 ; 1[");
  expect(scale("--press-scale-soft") > scale("--press-scale") && scale("--press-scale-soft") < 1, "--press-scale-soft doit enfoncer moins que --press-scale");
});

check("aucune courbe ni durée tapée hors des jetons dans css/uxer.css et css/motion.css", () => {
  [["css/uxer.css", UXER], ["css/motion.css", MOTION]].forEach(([file, text]) => {
    expect(!/cubic-bezier\(/.test(text), file + " : une courbe tapée en dur — elle appartient aux jetons de css/app.css");
    expect(!/--ux-motion|--ux-ease/.test(text), file + " : les anciens jetons propres à UXER sont revenus");
    rules(text).forEach((r) => {
      ["animation", "transition", "animation-duration"].forEach((prop) => {
        const value = r.decls[prop];
        if (!value || value === "none") { return; }
        /* Seuls les décalages courts (≤ 60 ms) s'écrivent en clair : ce sont des écarts, pas des durées. */
        (value.match(/\b(\d+(?:\.\d+)?)(ms|s)\b/g) || []).forEach((raw) => {
          const n = parseFloat(raw) * (/ms$/.test(raw) ? 1 : 1000);
          expect(n <= 60, file + " « " + r.selector + " » : durée en dur (" + raw + ") — utiliser un jeton --dur-*");
        });
      });
    });
  });
});

check("aucune liste `transition` qui anime « tout », nulle part", () => {
  [["css/app.css", APP], ["css/uxer.css", UXER], ["css/motion.css", MOTION], ["css/product.css", stripComments(read("css/product.css"))]].forEach(([file, text]) => {
    expect(!/transition\s*:\s*all\b/.test(text) && !/transition-property\s*:\s*all\b/.test(text),
      file + " : `transition: all` anime ce qu'on n'avait pas prévu, y compris des propriétés coûteuses");
  });
});

check("aucun dépassement hors du monogramme : --ease-spring n'est employé que par le point du logo", () => {
  [["css/uxer.css", UXER], ["css/motion.css", MOTION]].forEach(([file, text]) => {
    expect(text.indexOf("--ease-spring") < 0, file + " emploie --ease-spring");
  });
  const uses = APP.match(/var\(--ease-spring\)/g) || [];
  expect(uses.length === 1 && /\.logo-dot\s*\{[^}]*var\(--ease-spring\)/.test(APP), "--ease-spring doit rester réservé au point du monogramme");
});

check("aucune boucle hors chargement : `infinite` seulement sur la pastille de synchronisation et le squelette", () => {
  const loops = [];
  [APP, UXER, MOTION].forEach((text) => {
    rules(text).forEach((r) => { if (/\binfinite\b/.test(r.decls.animation || "")) { loops.push(r.selector); } });
  });
  expect(loops.length === 2, "boucles trouvées : " + JSON.stringify(loops));
  expect(loops.some((s) => /status-syncing/.test(s)) && loops.some((s) => /skeleton-card/.test(s)), "boucles inattendues : " + JSON.stringify(loops));
});

/* ------------------------------------------------------------------ Repli --- */

check("css/motion.css : chaque animation vit sous prefers-reduced-motion: no-preference", () => {
  const animated = MOTION_RULES.filter((r) => r.decls.animation && r.decls.animation !== "none" || r.decls["animation-name"]);
  expect(animated.length >= 12, "trop peu d'animations relevées (" + animated.length + ") : la lecture de la feuille a changé ?");
  animated.forEach((r) => {
    expect(r.media.some((m) => /prefers-reduced-motion:\s*no-preference/.test(m)),
      "« " + r.selector + " » s'anime hors de (prefers-reduced-motion: no-preference) : un utilisateur de mouvement réduit la verrait");
  });
});

check("l'enfoncement des commandes est réservé au mouvement permis", () => {
  MOTION_RULES.filter((r) => /:active/.test(r.selector) && /scale/.test(r.decls.transform || "")).forEach((r) => {
    expect(r.media.some((m) => /no-preference/.test(m)), "« " + r.selector + " » s'enfonce aussi en mouvement réduit");
  });
});

check("les repères de position glissent par View Transitions, et seulement pendant une transition", () => {
  ["ux-topbar", "ux-tabbar", "ux-flow", "ux-tab-mark", "ux-flow-mark", "ux-title", "ux-back", "ux-branch-source"].forEach((name) => {
    const rule = UXER_RULES.find((r) => r.decls["view-transition-name"] === name);
    expect(rule, "view-transition-name « " + name + " » absent de css/uxer.css");
    expect(/^html\.ux-vt\b/.test(rule.selector), "« " + name + " » doit être posé seulement pendant une transition (html.ux-vt)");
    expect(rule.media.some((m) => /@supports\s*\(view-transition-name/.test(m)), "« " + name + " » hors du bloc @supports");
  });
  expect(UI_JS.indexOf('class: "tabbar-mark"') >= 0, "js/ui.js doit poser le trait de l'onglet courant comme un élément");
  expect(read("js/uxer-ui.js").indexOf('"ux-flow-mark"') >= 0, "js/uxer-ui.js doit poser le trait de l'étape courante comme un élément");
  expect(!/\.tabbar-item\.is-current::before/.test(APP), "le trait de l'onglet est revenu en ::before : il ne glisserait plus");
});

check("exploration : on y entre et on en revient sans glissement latéral ; la bulle source est l'élément partagé", () => {
  const js = read("js/uxer-ui.js");
  expect(/return "branch-in";/.test(js) && /return "branch-out";/.test(js), "sens dédiés à l'exploration absents de transitionDirection");
  expect(/markShared\(shared\);[\s\S]*startViewTransition[\s\S]*enhance\(\);\s*markShared\(shared\);/.test(js),
    "la bulle source doit être désignée AVANT la capture de l'ancien écran, puis dans le nouveau");
  ["branch-in", "branch-out"].forEach((dir) => {
    const old = UXER_RULES.find((r) => r.selector.indexOf('[data-ux-direction="' + dir + '"]::view-transition-old(root)') >= 0);
    expect(old && !/ux-route-old-(forward|back)/.test(old.decls.animation || ""), dir + " : l'ancien écran ne doit pas glisser de côté");
    expect(UXER_RULES.some((r) => r.selector.indexOf('ux-route-fallback[data-ux-direction="' + dir + '"]') >= 0), dir + " : repli sans View Transitions absent");
  });
  const connector = MOTION_RULES.find((r) => /\.screen--enter \.branch-connector/.test(r.selector));
  expect(connector && /motion-connector/.test(connector.decls.animation) && /--enter-elapsed/.test(connector.decls["animation-delay"] || ""),
    "le trait d'origine se trace une fois, à l'arrivée, en reprenant un rendu en cours");
  expect(!MOTION_RULES.some((r) => /branch-connector/.test(r.selector) && /\binfinite\b/.test(r.decls.animation || "")), "le trait ne doit jamais boucler");
});

check("changer d'onglet est latéral, jamais une poussée vers la droite", () => {
  const js = read("js/uxer-ui.js");
  expect(/TAB_PLACES\.indexOf\(previousPlace\) >= 0 && TAB_PLACES\.indexOf\(nextPlace\) >= 0\) \{ return "lateral"; \}/.test(js),
    "transitionDirection doit traiter deux onglets comme des pairs");
});

/* -------------------------------------------------------------- js/motion.js --- */

check("js/motion.js ne touche ni au focus, ni à l'état, ni aux actions", () => {
  expect(!/\.focus\(/.test(JS_CODE), "js/motion.js déplace le focus");
  expect(!/\bUI\.set\(|\bApp\.(go|actions)\b|\bStore\.(view|dispatch)\s*=|\bSync\./.test(JS_CODE), "js/motion.js agit sur l'état ou la navigation");
  expect(!/https?:\/\//.test(JS_CODE), "js/motion.js ne doit charger aucune ressource distante");
});

check("js/motion.js : aucune animation permanente, et le mouvement réduit est lu", () => {
  expect(!/setInterval\s*\(|requestAnimationFrame\s*\(/.test(JS_CODE), "boucle JavaScript permanente dans js/motion.js");
  expect(JS_CODE.indexOf("prefers-reduced-motion: reduce") >= 0, "js/motion.js doit lire la préférence de mouvement réduit");
  expect(/typeof root\.Element\.prototype\.animate === "function"/.test(JS_CODE), "Element.animate doit être détecté avant usage");
  expect(/var MAX_NEW = \d+;/.test(JS_CODE), "plafond des nouveautés animées absent : une reconnexion deviendrait un feu d'artifice");
});

check("les fantômes (calque qui part, carte retirée) perdent toute identité", () => {
  const m = /var STRIPPED = \[([\s\S]*?)\];/.exec(JS_CODE);
  expect(m, "liste STRIPPED absente");
  ["id", "role", "aria-modal", "data-key", "data-draft", "data-message-id", "data-motion-key", "tabindex"].forEach((attr) => {
    expect(m[1].indexOf('"' + attr + '"') >= 0, "un fantôme garde « " + attr + " » : une requête de l'application pourrait le trouver");
  });
  expect(/setAttribute\("inert", ""\)/.test(JS_CODE) && /setAttribute\("aria-hidden", "true"\)/.test(JS_CODE), "un fantôme doit être inerte et masqué");
});

check("une bulle anonyme ne reçoit aucun attribut de plus (BL-013) : la clé d'un message vient de sa bulle", () => {
  expect(!/"data-motion-key":\s*"m:"/.test(UI_JS), "js/ui.js pose une clé de mouvement sur la rangée d'un message");
  expect(/"m:" \+ bubble\.getAttribute\("data-message-id"\)/.test(JS_CODE), "js/motion.js doit lire l'identifiant déjà porté par la bulle");
});

check("les actions qui font apparaître un élément ailleurs l'annoncent", () => {
  expect(/createProposal:[\s\S]*?expectMotion\("p:" \+ proposalId\)/.test(APP_JS), "createProposal n'annonce pas la carte créée");
  expect(/addConclusion:[\s\S]*?expectMotion\("c:" \+ conclusionId\)/.test(APP_JS), "addConclusion n'annonce pas la carte créée");
  expect(/function expectMotion\(key\) \{\s*try \{/.test(APP_JS), "l'annonce doit être facultative et ne jamais lever");
  expect(/"data-motion-key": "p:" \+ proposal\.id/.test(UI_JS),
    "les cartes annoncées doivent porter la clé correspondante");
});

/* ---------------------------------------------------------------- Rapport --- */

if (failures.length) {
  failures.forEach(({ name, error }) => console.error("✗ " + name + "\n  " + error.message));
  console.error("\nmotion : " + passed + " contrôle(s) OK, " + failures.length + " en échec.");
  process.exit(1);
}
console.log("motion : " + passed + " contrôles OK");
