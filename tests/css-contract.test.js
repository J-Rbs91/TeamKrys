"use strict";

/* Contrat des feuilles de style (lecture statique, aucun navigateur).
 *
 * Une mise en page ne se teste pas en Node : les mesures (débordement, espacement, place
 * dans la barre) relèvent des recettes navigateur de responsive-touch/. Ce test fige ce qui
 * se lit dans le texte des trois feuilles et qui, retouché par mégarde, casse sans bruit :
 *
 *  - la pastille d'état (BL-008) : libellé court et libellé long jamais visibles ensemble,
 *    seuils de 431 px et de 16rem, une forme de gommette distincte par état, et aucune règle
 *    qui touche la région d'annonce (elle reste masquée par `visually-hidden`) ;
 *  - la rangée de vote qui passe à la ligne (BL-016), les titres qui se coupent (BL-036),
 *    `.card.stack` en colonne flex (BL-037) ;
 *  - plus d'opacité de groupe sur « Clôturés » et « Archivés » (BL-038), bord du composeur
 *    sur `--line-field` (BL-039), repère de bulle sans opacité (BL-040) ;
 *  - marges de zone sûre latérales (BL-041), `overscroll-behavior: contain` et verrou du
 *    défilement sous une couche (BL-011, partie CSS).
 *
 * `CSS_CONTRACT_ROOT` : racine alternative (par exemple une copie de HEAD) pour prouver que
 * le test échoue sur l'ancien CSS. */

var fs = require("fs");
var path = require("path");

var ROOT = process.env.CSS_CONTRACT_ROOT || path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

/* ------------------------------------------------------------------ Lecture CSS -- */

function parseDecls(body) {
  var out = {};
  body.split(";").forEach(function (part) {
    var k = part.indexOf(":");
    if (k < 0) { return; }
    var prop = part.slice(0, k).trim().toLowerCase();
    var value = part.slice(k + 1).trim().replace(/\s*!important$/i, "");
    if (prop === "background-color") { prop = "background"; }
    if (prop) { out[prop] = value; }
  });
  return out;
}

function parseRules(css, media, out) {
  var i = 0;
  while (i < css.length) {
    var open = css.indexOf("{", i);
    if (open < 0) { break; }
    var head = css.slice(i, open).trim();
    var depth = 1;
    var j = open + 1;
    while (j < css.length && depth) {
      if (css.charAt(j) === "{") { depth++; } else if (css.charAt(j) === "}") { depth--; }
      j++;
    }
    var body = css.slice(open + 1, j - 1);
    if (head.charAt(0) === "@") {
      if (/^@media/i.test(head)) {
        parseRules(body, media.concat([head.replace(/^@media\s*/i, "").trim()]), out);
      } else if (/^@supports/i.test(head)) {
        parseRules(body, media.concat(["@supports"]), out);
      }
      /* @keyframes, @font-face : sans intérêt ici */
    } else {
      out.push({
        selectors: head.split(",").map(function (s) { return s.trim().replace(/\s+/g, " "); }),
        decls: parseDecls(body),
        media: media,
        order: 0
      });
    }
    i = j;
  }
  return out;
}

function loadSheet(file) {
  var text = read(file);
  return { text: text, rules: parseRules(text.replace(/\/\*[\s\S]*?\*\//g, ""), [], []) };
}

var sheets = ["css/app.css", "css/uxer.css", "css/product.css"].map(loadSheet);
var RULES = [];
sheets.forEach(function (s) { s.rules.forEach(function (r) { r.order = RULES.length; RULES.push(r); }); });
var APP_TEXT = sheets[0].text;

/* Une condition de media est évaluée seulement si elle ne porte que sur la largeur (px, rem) ;
   toute autre (mouvement, survol, impression, @supports) rend la règle « non évaluée ». */
function mediaApplies(conds, env) {
  return conds.every(function (c) {
    if (c === "@supports") { return false; }
    var seen = false;
    var ok = true;
    c.replace(/\((min|max)-width:\s*([\d.]+)(px|rem|em)\)/g, function (m, kind, n, unit) {
      seen = true;
      var px = parseFloat(n) * (unit === "px" ? 1 : env.rem);
      ok = ok && (kind === "min" ? env.width >= px : env.width <= px);
      return m;
    });
    var rest = c.replace(/\((min|max)-width:\s*[\d.]+(px|rem|em)\)/g, "").replace(/\band\b/g, "").trim();
    return seen && !rest && ok;
  });
}

function compound(s) {
  var tag = (s.match(/^[a-z][a-z0-9]*/i) || [""])[0].toLowerCase();
  var classes = [];
  var other = 0;
  s.replace(/\.([\w-]+)/g, function (m, c) { classes.push(c); return m; });
  s.replace(/\[[^\]]*\]|::?[\w-]+(\([^)]*\))?/g, function () { other++; return ""; });
  return { tag: tag, classes: classes, other: other };
}

function nodeMatches(c, node) {
  if (c.other) { return false; }
  if (c.tag && c.tag !== node.tag) { return false; }
  return c.classes.every(function (k) { return (node.classes || []).indexOf(k) >= 0; });
}

/* Sélecteurs à combinateur descendant seulement ; renvoie la spécificité ou null. */
function matchSelector(selector, el) {
  if (/[>+~]/.test(selector)) { return null; }
  var parts = selector.split(" ").map(compound);
  var subject = parts[parts.length - 1];
  if (!nodeMatches(subject, el)) { return null; }
  var up = (el.ancestors || []).slice();
  for (var i = parts.length - 2; i >= 0; i--) {
    var found = false;
    while (up.length) {
      if (nodeMatches(parts[i], up.shift())) { found = true; break; }
    }
    if (!found) { return null; }
  }
  var spec = [0, 0, 0];
  parts.forEach(function (c) { spec[1] += c.classes.length + c.other; spec[2] += c.tag ? 1 : 0; });
  return spec;
}

function higher(a, b) {
  for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) { return a[i] > b[i]; } }
  return false;
}

function declFor(el, prop, env) {
  var best = null;
  RULES.forEach(function (r) {
    if (!mediaApplies(r.media, env) || r.decls[prop] === undefined) { return; }
    r.selectors.forEach(function (s) {
      var spec = matchSelector(s, el);
      if (!spec) { return; }
      if (!best || higher(spec, best.spec) || (!higher(best.spec, spec) && r.order > best.order)) {
        best = { spec: spec, order: r.order, value: r.decls[prop] };
      }
    });
  });
  return best && best.value;
}

function ruleExists(test) {
  return RULES.some(test);
}

/* ------------------------------------------------------------------- Contrôles -- */

var failures = [];
var total = 0;

function check(name, fn) {
  total++;
  try { fn(); } catch (e) { failures.push(name + " : " + e.message); }
}

function expect(cond, message) {
  if (!cond) { throw new Error(message); }
}

var BASE = { width: 390, rem: 16 };

/* --- BL-008 : pastille d'état -------------------------------------------------- */

check("BL-008 aucune règle ne cible la région d'annonce", function () {
  RULES.forEach(function (r) {
    r.selectors.forEach(function (s) {
      expect(s.indexOf("status-announce") < 0, "le sélecteur « " + s + " » cible .status-announce");
      if (s.indexOf("visually-hidden") >= 0) {
        expect(/^\.visually-hidden$/.test(s), "le sélecteur « " + s + " » touche .visually-hidden");
      }
    });
  });
  var hidden = null;
  RULES.forEach(function (r) { if (r.selectors.indexOf(".visually-hidden") >= 0) { hidden = r; } });
  expect(hidden, "la classe .visually-hidden n'est plus définie");
  expect(hidden.decls.display === undefined && hidden.decls.visibility === undefined,
    ".visually-hidden ne doit ni changer `display` ni `visibility` (la région d'annonce sortirait de l'arbre d'accessibilité)");
  expect(hidden.decls.position === "absolute" && /rect\(0/.test(hidden.decls.clip || ""),
    ".visually-hidden doit rester un masquage visuel (absolute + clip)");
});

check("BL-008 libellés court et long jamais visibles ensemble, seuils 431 px et 16rem", function () {
  var shortEl = { tag: "span", classes: ["status-short"], ancestors: [{ tag: "div", classes: ["status-pill", "status-idle"] }, { tag: "div", classes: ["topbar-actions"] }, { tag: "header", classes: ["topbar"] }] };
  var longEl = { tag: "span", classes: ["status-label", "status-long"], ancestors: shortEl.ancestors };
  var widths = [150, 200, 255, 256, 257, 300, 320, 360, 390, 430, 430.5, 431, 480, 500, 600, 768, 1024, 1280];
  [16, 20.8, 32].forEach(function (rem) {
    widths.forEach(function (width) {
      var env = { width: width, rem: rem };
      var shortShown = (declFor(shortEl, "display", env) || "inline") !== "none";
      var longShown = (declFor(longEl, "display", env) || "inline") !== "none";
      var where = " (largeur " + width + " px, rem " + rem + " px)";
      expect(!(shortShown && longShown), "libellé court et long visibles ensemble" + where);
      if (width <= 16 * rem) {
        expect(!shortShown && !longShown, "sous 16rem la gommette doit rester seule" + where);
      } else if (width >= 431) {
        expect(longShown && !shortShown, "dès 431 px les mots complets seuls" + where);
      } else {
        expect(shortShown && !longShown, "jusqu'à 430 px le libellé court seul" + where);
      }
    });
  });
  expect(/@media \(max-width: 16rem\)/.test(APP_TEXT), "la règle @media (max-width: 16rem) est absente de app.css");
  expect(/@media \(min-width: 431px\)/.test(APP_TEXT), "la règle @media (min-width: 431px) est absente de app.css");
});

check("BL-008 une forme de gommette distincte par état (jamais la couleur seule)", function () {
  var seen = {};
  ["idle", "syncing", "pending", "offline", "error", "local"].forEach(function (state) {
    var dot = { tag: "span", classes: ["status-dot"], ancestors: [{ tag: "div", classes: ["status-pill", "status-" + state] }] };
    var get = function (p) { return declFor(dot, p, BASE) || ""; };
    var shape = [get("width"), get("height"), get("border-radius"), get("clip-path"), get("transform"), get("background") === "transparent" ? "creux" : "plein"].join(" ");
    expect(!seen[shape], "les états « " + seen[shape] + " » et « " + state + " » ont la même forme de gommette (" + shape + ")");
    seen[shape] = state;
  });
});

/* --- BL-016 / BL-036 / BL-037 : mise en page ------------------------------------ */

check("BL-016 la rangée Pour / Contre / Abstention passe à la ligne", function () {
  var row = { tag: "div", classes: ["vote-actions"], ancestors: [] };
  expect(declFor(row, "display", BASE) === "flex" && declFor(row, "flex-wrap", BASE) === "wrap", ".vote-actions doit être flex avec flex-wrap: wrap");
});

check("BL-036 titres, descriptions et synthèse coupent les mots trop longs", function () {
  [["card-title", "div"], ["card-desc", "p"], ["sheet-title", "div"], ["modal-title", "h2"], ["print-doc", "div"]].forEach(function (t) {
    var e = { tag: t[1], classes: [t[0]], ancestors: [] };
    expect(declFor(e, "overflow-wrap", BASE) === "anywhere", "." + t[0] + " doit porter overflow-wrap: anywhere");
  });
  var title = { tag: "div", classes: ["card-title"], ancestors: [{ tag: "div", classes: ["row"] }] };
  expect(declFor(title, "min-width", BASE) === "0", ".card-title doit porter min-width: 0 (bloc flexible dans .row)");
});

check("BL-037 .card.stack est une colonne flex, les autres cartes restent des blocs", function () {
  var stack = { tag: "div", classes: ["card", "card-static", "stack"], ancestors: [] };
  expect(declFor(stack, "display", BASE) === "flex", ".card.stack doit être display: flex (spécificité)");
  expect(declFor(stack, "flex-direction", BASE) === "column", ".card.stack doit être flex-direction: column");
  expect(declFor(stack, "gap", BASE) === "15px", ".card.stack doit garder gap: 15px");
  var plain = { tag: "button", classes: ["card"], ancestors: [] };
  expect(declFor(plain, "display", BASE) === "block", "une carte sans .stack doit rester display: block");
});

/* --- BL-038 / BL-039 / BL-040 : contrastes -------------------------------------- */

check("BL-038 plus d'opacité de groupe sur les sujets clôturés et archivés", function () {
  var group = false;
  RULES.forEach(function (r) {
    r.selectors.forEach(function (s) {
      if (/data-topic-status="(closed|archived)"/.test(s)) {
        group = true;
        expect(r.decls.opacity === undefined, "le sélecteur « " + s + " » déclare une opacité");
      }
    });
  });
  expect(group, "les règles des groupes clôturés et archivés ont disparu");
  expect(ruleExists(function (r) {
    return r.selectors.some(function (s) { return /data-topic-status="archived"\] \.card-title/.test(s); }) && r.decls.color === "var(--muted)";
  }), "le titre des cartes archivées doit passer au jeton --muted");
});

check("BL-039 le bord du composeur est sur --line-field", function () {
  var field = { tag: "textarea", classes: ["textarea", "grow"], ancestors: [{ tag: "div", classes: ["composer"] }] };
  expect(declFor(field, "border-color", BASE) === "var(--line-field)", ".composer .textarea doit avoir border-color: var(--line-field)");
});

check("BL-040 le repère de bulle n'a plus d'opacité", function () {
  RULES.forEach(function (r) {
    r.selectors.forEach(function (s) {
      if (s.indexOf("ux-bubble-cue") >= 0) { expect(r.decls.opacity === undefined, "le sélecteur « " + s + " » déclare une opacité"); }
    });
  });
  var cue = { tag: "span", classes: ["ux-bubble-cue"], ancestors: [{ tag: "div", classes: ["bubble-meta"] }, { tag: "button", classes: ["bubble"] }, { tag: "div", classes: ["msg-row"] }] };
  expect(declFor(cue, "color", BASE) === "var(--muted)", "le repère doit prendre le jeton --muted");
  var mine = { tag: "span", classes: ["ux-bubble-cue"], ancestors: [{ tag: "div", classes: ["bubble-meta"] }, { tag: "button", classes: ["bubble"] }, { tag: "div", classes: ["msg-row", "mine"] }] };
  expect(declFor(mine, "color", BASE) === "var(--on-ink-soft)", "le repère d'une bulle à soi doit prendre --on-ink-soft");
});

check("WP-03 .sheet-action:disabled est stylé sans opacité", function () {
  expect(ruleExists(function (r) {
    return r.selectors.indexOf(".sheet-action:disabled") >= 0 && r.decls.color === "var(--faint)" && r.decls.opacity === undefined;
  }), "il manque la règle .sheet-action:disabled (color: var(--faint), sans opacité)");
});

/* --- BL-041 / BL-011 : zones sûres, défilement sous les couches ------------------ */

check("BL-041 feuilles, fenêtres et bandeau de mise à jour respectent les zones sûres latérales", function () {
  var sheet = { tag: "div", classes: ["sheet"], ancestors: [] };
  expect(/safe-left/.test(declFor(sheet, "padding-left", BASE) || ""), ".sheet doit réserver --safe-left");
  expect(/safe-right/.test(declFor(sheet, "padding-right", BASE) || ""), ".sheet doit réserver --safe-right");
  var overlay = { tag: "div", classes: ["overlay", "center"], ancestors: [] };
  expect(/safe-left/.test(declFor(overlay, "padding-left", BASE) || ""), ".overlay.center doit réserver --safe-left");
  expect(/safe-right/.test(declFor(overlay, "padding-right", BASE) || ""), ".overlay.center doit réserver --safe-right");
  var banner = { tag: "div", classes: ["update-banner"], ancestors: [] };
  expect(/safe-left/.test(declFor(banner, "width", BASE) || "") && /safe-right/.test(declFor(banner, "width", BASE) || ""), ".update-banner doit réduire sa largeur des zones sûres");
});

check("BL-011 overscroll-behavior: contain sur le fil, les feuilles et les fenêtres", function () {
  ["thread", "sheet", "modal"].forEach(function (k) {
    var e = { tag: "div", classes: [k], ancestors: [] };
    expect(declFor(e, "overscroll-behavior", BASE) === "contain", "." + k + " doit porter overscroll-behavior: contain");
  });
});

check("BL-011 le défilement du document se verrouille sous une couche (html.has-layer)", function () {
  var root = { tag: "html", classes: ["has-layer"], ancestors: [] };
  var body = { tag: "body", classes: [], ancestors: [{ tag: "html", classes: ["has-layer"] }] };
  expect(declFor(root, "overflow", BASE) === "hidden", "html.has-layer doit porter overflow: hidden");
  expect(declFor(body, "overflow", BASE) === "hidden", "html.has-layer body doit porter overflow: hidden");
  var noLayer = { tag: "body", classes: [], ancestors: [{ tag: "html", classes: [] }] };
  expect(declFor(noLayer, "overflow", BASE) !== "hidden", "sans has-layer, le corps ne doit pas être verrouillé");
});

if (failures.length) {
  console.error("css-contract : " + failures.length + " échec(s) sur " + total + " contrôles");
  failures.forEach(function (f) { console.error(" - " + f); });
  process.exit(1);
}
console.log("css-contract : OK (" + total + " contrôles)");
