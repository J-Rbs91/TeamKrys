/* Revue adverse de l'interface (Phase 3), lot WP-22 : ce que le faux DOM des autres tests ne voit pas.
 *
 * Les tests de l'interface chargent js/ui.js SEUL : les deux couches qui enveloppent UI.render (js/product-ui.js,
 * js/uxer-ui.js) et DÉPLACENT des nœuds n'y sont pas, c'est pourquoi tout était vert alors que le focus tombait sur <body>
 * dans Chromium (REC-RUI-003 et 004). La preuve réelle est un script Chromium (QA_DIR/fix/WP-22/) ; ici, des contrôles
 * qui échouent sans les correctifs :
 *  - le code livré de restoreFocus (extrait de chaque couche) rend le focus au nœud déplacé, et à lui seul ;
 *  - enhance() de chaque couche relève le focus AVANT de déplacer et le rend APRÈS, et rien ne déplace hors de enhance() ;
 *  - REC-RUI-002 : App.logout efface le marqueur des nouveautés, avec la MÊME chaîne que js/product-ui.js ;
 *  - REC-RUI-005 : les quatre fenêtres « Modifier » ne se ferment que si l'action est acceptée ;
 *  - REC-RUI-006 : le nom accessible d'un bouton flottant contient son texte visible (WCAG 2.5.3) ;
 *  - REC-RUI-007 : le compteur d'une carte est lu avec son unité (le code livré de countChip est exécuté).
 * (Le choix anonyme des brouillons, REC-RUI-001 et 008 : tests/drafts.test.js ; REC-RUI-009 : tests/css-contract.test.js.)
 *
 * `UI_REVIEW_ROOT` : racine alternative (par exemple une copie de HEAD) pour prouver que le test échoue sur l'ancien code. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.UI_REVIEW_ROOT || path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const queue = [];
function check(name, fn) { queue.push({ name, fn }); }
function assert(condition, message) { if (!condition) { throw new Error(message); } }

/* Le texte d'une fonction de premier niveau d'un module IIFE (indentation de deux espaces). */
function functionSource(file, name) {
  const m = new RegExp("\\n  function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n").exec("\n" + read(file));
  assert(m, file + " : fonction " + name + "() introuvable");
  return m[0];
}

/* ===================================================== REC-RUI-003 et 004 : le focus après un déplacement === */

/* Un document minimal : le focus appartient à `activeElement`, comme dans un navigateur ; déplacer le nœud focalisé le renvoie
 * sur <body> (c'est ce que fait Chromium), et `focus()` le reprend. */
function miniDocument() {
  const body = { name: "body" };
  const html = { name: "html", attached: [] };
  const doc = { body, documentElement: html, activeElement: body };
  html.contains = (node) => html.attached.indexOf(node) >= 0;
  const node = (name, options) => {
    const n = { name, calls: [], focus(arg) {
      n.calls.push(arg);
      if (options && options.throws) { throw new Error("non focalisable"); }
      doc.activeElement = n;
    } };
    html.attached.push(n);
    return n;
  };
  return { doc, body, html, node };
}

["js/product-ui.js", "js/uxer-ui.js"].forEach((file) => {
  const layer = file.replace("js/", "").replace(".js", "");

  check("REC-RUI-003/004 " + layer + " : restoreFocus rend le focus au nœud déplacé, et à lui seul", () => {
    const code = functionSource(file, "restoreFocus");
    const restore = (w) => vm.runInNewContext(code + "\nrestoreFocus;", { document: w.doc });

    let w = miniDocument();                                   // le nœud focalisé a été déplacé : le focus est sur <body>
    const card = w.node("carte");
    w.doc.activeElement = w.body;
    restore(w)(card);
    assert(w.doc.activeElement === card, "le focus n'est pas rendu au nœud déplacé");
    assert(card.calls.length === 1 && card.calls[0] && card.calls[0].preventScroll === true, "focus rendu avec défilement : " + JSON.stringify(card.calls));

    w = miniDocument();                                       // changement d'écran : le focus était déjà sur <body>, il n'est pas posé
    const other = w.node("autre carte");
    restore(w)(w.body);
    restore(w)(null);
    restore(w)(w.html);
    assert(w.doc.activeElement === w.body && other.calls.length === 0, "le focus est posé alors qu'il n'y en avait pas");

    w = miniDocument();                                       // un champ a pris le focus entre-temps : jamais volé
    const moved = w.node("carte");
    const field = w.node("champ");
    w.doc.activeElement = field;
    restore(w)(moved);
    assert(w.doc.activeElement === field && moved.calls.length === 0, "le focus d'un champ en cours de saisie est volé");

    w = miniDocument();                                       // nœud encore focalisé : rien à faire (pas de focus() inutile)
    const kept = w.node("carte");
    w.doc.activeElement = kept;
    restore(w)(kept);
    assert(kept.calls.length === 0, "focus() rappelé sur un nœud qui l'a déjà");

    w = miniDocument();                                       // nœud sorti du document : rien
    const gone = w.node("carte retirée");
    w.html.attached.splice(w.html.attached.indexOf(gone), 1);
    restore(w)(gone);
    assert(gone.calls.length === 0 && w.doc.activeElement === w.body, "focus rendu à un nœud absent du document");

    w = miniDocument();                                       // nœud qui refuse le focus : aucune exception
    const stubborn = w.node("carte", { throws: true });
    restore(w)(stubborn);
  });

  check("REC-RUI-003/004 " + layer + " : enhance() relève le focus AVANT de déplacer et le rend APRÈS, rien ne déplace hors d'enhance()", () => {
    const src = read(file);
    const enhance = functionSource(file, "enhance");
    const first = layer === "product-ui" ? "enhanceTopics(" : "enhanceProposals()";
    const last = layer === "product-ui" ? "renameOnboarding();" : "enhancePressedState();";
    const captured = enhance.indexOf("var focused = document.activeElement;");
    const moves = enhance.indexOf(first);
    const given = enhance.indexOf("restoreFocus(focused);");
    assert(captured >= 0, "enhance() ne relève pas le focus");
    assert(moves > captured, "le focus est relevé APRÈS le premier déplacement (" + first + ")");
    assert(given > enhance.lastIndexOf(last), "le focus n'est pas rendu APRÈS le dernier traitement (" + last + ")");
    const outside = src.replace(enhance, "").replace(new RegExp("function " + first.replace("(", "\\(").replace(")", "\\)")), "");
    assert(outside.indexOf(first) < 0, first + " est appelée hors d'enhance() : un déplacement échapperait à la garde du focus");
  });
});

/* ====================================================== REC-RUI-002 : la déconnexion efface le marqueur === */

check("REC-RUI-002 App.logout efface le marqueur des nouveautés, avec la MÊME chaîne que js/product-ui.js, et App.relock le garde", () => {
  const seen = /var SEEN_KEY = "([^"]+)";/.exec(read("js/product-ui.js"));
  assert(seen, "SEEN_KEY introuvable dans js/product-ui.js");
  const app = read("js/app.js");
  const logout = /App\.logout = function \(\) \{[\s\S]*?\n  \};/.exec(app);
  const relock = /App\.relock = function \(\) \{[\s\S]*?\n  \};/.exec(app);
  assert(logout && relock, "App.logout ou App.relock introuvable");
  assert(logout[0].indexOf('Utils.storage.remove("' + seen[1] + '")') >= 0 || logout[0].indexOf("Utils.storage.remove(CONFIG.KEYS.seenTopics)") >= 0,
    "App.logout n'efface pas " + seen[1] + " (condensat de mon identifiant : de quoi désigner l'auteur d'un message anonyme)");
  assert(relock[0].indexOf(seen[1]) < 0 && relock[0].indexOf("seenTopics") < 0, "App.relock efface le marqueur : même personne après le code");
});

/* ======================================== REC-RUI-005 : une fenêtre d'édition ne ferme que sur une action acceptée === */

check("REC-RUI-005 les quatre fenêtres « Modifier » ne se ferment qu'après une action acceptée (le comportement est exécuté dans tests/drafts.test.js)", () => {
  const app = read("js/app.js");
  const helper = /function closeIfAccepted\(result\) \{([\s\S]*?)\n  \}/.exec(app);
  assert(helper && /result\.ok !== false/.test(helper[1]) && /UI\.set\(\{ modal: null \}\)/.test(helper[1]), "closeIfAccepted() absent ou sans test du résultat");
  ["UPDATE_TOPIC", "UPDATE_MESSAGE", "UPDATE_PROPOSAL", "UPDATE_CONCLUSION_ITEM"].forEach((type) => {
    const m = new RegExp('dispatch\\("' + type + '"[^;]*?\\)\\s*\\.then\\(([^;]*?)\\);').exec(app);
    assert(m && m[1] === "closeIfAccepted", type + " : la fenêtre se ferme sans regarder le résultat : " + (m && m[1]));
  });
});

/* =========================================================== REC-RUI-006 : nom accessible et texte visible === */

check("REC-RUI-006 boutons flottants : le nom accessible contient le texte visible (WCAG 2.5.3)", () => {
  const fabs = read("js/ui.js").match(/el\("button", \{\s*class: "fab"[\s\S]*?\}, \[icon\("plus", 20\), el\("span", \{ text: "[^"]+" \}\)\]\)/g) || [];
  assert(fabs.length >= 2, "au moins 2 boutons flottants attendus, " + fabs.length + " trouvés");
  fabs.forEach((src) => {
    const visible = /text: "([^"]+)" \}\)\]\)$/.exec(src)[1];
    const label = /"aria-label": "([^"]+)"/.exec(src);
    assert(!label || label[1].toLowerCase().indexOf(visible.toLowerCase()) >= 0,
      "nom accessible « " + (label && label[1]) + " » ne contient pas le texte visible « " + visible + " »");
  });
  const topics = fabs.filter((src) => src.indexOf('"data-key": "create-topic"') >= 0)[0];
  assert(topics && !/"aria-label"/.test(topics), "le bouton « Nouveau sujet » doit être nommé par son texte visible");
});

/* ============================================================ REC-RUI-007 : « 1 message », pas « 1 1 1 » === */

check("REC-RUI-007 compteurs d'une carte : le nombre est suivi de son unité, accord juste, masquée à la vue", () => {
  const code = functionSource("js/ui.js", "countChip");
  const make = (tag, attrs, kids) => ({ tag, attrs: attrs || {}, kids: kids || [] });
  const sandbox = { Utils: { plural: (n, s, p) => n + " " + (n > 1 ? p : s) }, icon: (name) => make("svg", { name }), el: make };
  vm.runInNewContext(code + "\nthis.out = [countChip('message', 1, 'message'), countChip('idea', 2, 'proposition'), countChip('checkCircle', 3, 'formulation')];", sandbox);
  const hidden = (chip) => chip.kids.filter((k) => k.attrs.class === "visually-hidden").map((k) => k.attrs.text).join("");
  const shown = (chip) => chip.kids.filter((k) => k.tag === "span" && !k.attrs.class).map((k) => k.attrs.text).join("");
  assert(JSON.stringify(sandbox.out.map(hidden)) === JSON.stringify([" message", " propositions", " formulations"]), "unité lue : " + JSON.stringify(sandbox.out.map(hidden)));
  assert(JSON.stringify(sandbox.out.map(shown)) === JSON.stringify(["1", "2", "3"]), "nombre affiché : " + JSON.stringify(sandbox.out.map(shown)));
  assert(sandbox.out[1].attrs.title === "2 propositions", "l'info-bulle a changé : " + sandbox.out[1].attrs.title);
});

const failures = [];
queue.forEach((c) => {
  try { c.fn(); } catch (e) { failures.push(c.name + "\n    " + (e && e.message || e)); }
});
if (failures.length) {
  console.error("ui-review : " + failures.length + " échec(s) sur " + queue.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("ui-review : " + queue.length + " contrôles OK");
