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
 *    défilement sous une couche (BL-011, partie CSS) ;
 *  - lot WP-16 : composeur plafonné et barres resserrées en fenêtre basse (BL-042, BL-045),
 *    libellés du parcours sans ellipse (BL-043), rangées, pastilles et pieds de carte qui passent
 *    à la ligne (BL-044), marge de défilement (BL-046), anneau de focus en règles séparées
 *    (BL-047), bouton retour compact (BL-048), repli vh avant dvh (BL-049), accueil de bureau
 *    sans colonnes de tableau (BL-050).
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

/* Une condition de media est évaluée seulement si elle ne porte que sur la largeur ou la hauteur
   (px, rem) ; toute autre (mouvement, survol, impression, @supports) rend la règle « non évaluée ». */
function mediaApplies(conds, env) {
  return conds.every(function (c) {
    if (c === "@supports") { return false; }
    var seen = false;
    var ok = true;
    c.replace(/\((min|max)-(width|height):\s*([\d.]+)(px|rem|em)\)/g, function (m, kind, dim, n, unit) {
      seen = true;
      var px = parseFloat(n) * (unit === "px" ? 1 : env.rem);
      /* Sans `height` dans l'environnement : une fenêtre haute (900 px), donc aucune règle de fenêtre basse. */
      var size = dim === "width" ? env.width : (env.height === undefined ? 900 : env.height);
      ok = ok && (kind === "min" ? size >= px : size <= px);
      return m;
    });
    var rest = c.replace(/\((min|max)-(width|height):\s*[\d.]+(px|rem|em)\)/g, "").replace(/\band\b/g, "").trim();
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
    var shape = [get("width"), get("height"), get("border-radius"), get("clip-path"), get("transform"), get("border"), get("background") === "transparent" ? "creux" : "plein"].join(" ");
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
  [["card-title", "div"], ["card-desc", "p"], ["card-meta", "span"], ["msg-author", "div"], ["sheet-title", "div"], ["modal-title", "h2"], ["print-doc", "div"]].forEach(function (t) {
    var e = { tag: t[1], classes: [t[0]], ancestors: [] };
    expect(declFor(e, "overflow-wrap", BASE) === "anywhere", "." + t[0] + " doit porter overflow-wrap: anywhere");
  });
  var title = { tag: "div", classes: ["card-title"], ancestors: [{ tag: "div", classes: ["row"] }] };
  expect(declFor(title, "min-width", BASE) === "0", ".card-title doit porter min-width: 0 (bloc flexible dans .row)");
  var meta = { tag: "span", classes: ["card-meta"], ancestors: [{ tag: "div", classes: ["card-foot"] }] };
  expect(declFor(meta, "min-width", BASE) === "0", ".card-meta doit porter min-width: 0 (nom d'auteur collé dans un pied de carte)");
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

/* --- WP-16 : confort (fenêtres basses, zoom 200 %, troncatures, focus) ----------- */

/* Corps de tous les blocs `@media <entête> { ... }` d'un texte CSS (comptage d'accolades). */
function mediaBodies(text, header) {
  var out = [];
  var marker = "@media " + header + " {";
  var from = 0;
  var at = text.indexOf(marker, from);
  while (at >= 0) {
    var depth = 1;
    var i = at + marker.length;
    while (i < text.length && depth) {
      if (text.charAt(i) === "{") { depth++; } else if (text.charAt(i) === "}") { depth--; }
      i++;
    }
    out.push(text.slice(at + marker.length, i - 1));
    from = i;
    at = text.indexOf(marker, from);
  }
  return out;
}

var LOW = { width: 568, height: 320, rem: 16 };
var TALL = { width: 390, height: 844, rem: 16 };

check("BL-042 / BL-045 fenêtre basse : composeur plafonné, barre du haut non collante, parcours effacé sous 300 px", function () {
  var composer = { tag: "div", classes: ["composer"], ancestors: [] };
  expect(declFor(composer, "overflow-y", LOW) === "auto", ".composer doit défiler en interne sous 480 px de hauteur");
  expect(!declFor(composer, "max-height", TALL), "aucun plafond de composeur au-dessus de 480 px de hauteur (rien ne change à 100 %)");
  var bodies = mediaBodies(APP_TEXT, "(max-height: 480px)").join("\n");
  expect(/\.composer \{[^}]*max-height: 50vh;\s*max-height: 50dvh;/.test(bodies), ".composer : repli vh AVANT dvh (la dernière déclaration gagne)");
  expect(/\.composer \.textarea \{\s*max-height: 24vh;\s*max-height: 24dvh;/.test(bodies), ".composer .textarea : repli vh AVANT dvh");
  var field = { tag: "textarea", classes: ["textarea", "grow"], ancestors: [{ tag: "div", classes: ["composer"] }] };
  expect(/24d?vh/.test(declFor(field, "max-height", LOW) || ""), "le champ d'envoi doit être plafonné (24 % de la hauteur) en fenêtre basse");
  expect(declFor(field, "max-height", TALL) === "140px", "à 100 % le champ garde son plafond de 140 px (celui d'autoGrow)");
  var topbar = { tag: "header", classes: ["topbar"], ancestors: [] };
  expect(declFor(topbar, "position", LOW) === "static", "la barre du haut ne colle plus sous 480 px de hauteur");
  expect(declFor(topbar, "position", { width: 568, height: 700, rem: 16 }) === "sticky", "au-dessus de 480 px de hauteur la barre reste collante");
  var flow = { tag: "nav", classes: ["ux-flow"], ancestors: [] };
  expect(declFor(flow, "display", { width: 568, height: 299, rem: 16 }) === "none", "le parcours s'efface sous 300 px de hauteur (clavier ouvert en paysage)");
  expect(declFor(flow, "display", LOW) === "grid", "le parcours reste affiché à 320 px de hauteur");
});

check("BL-043 libellés du parcours : jamais de points de suspension, un mot par ligne de 351 à 480 px", function () {
  var chain = [{ tag: "button", classes: ["ux-flow-step"] }, { tag: "nav", classes: ["ux-flow"] }];
  var label = { tag: "span", classes: ["ux-flow-label"], ancestors: chain };
  expect(!declFor(label, "text-overflow", BASE), ".ux-flow-label ne doit plus porter text-overflow");
  expect(declFor(label, "white-space", BASE) !== "nowrap", ".ux-flow-label ne doit plus être en nowrap");
  expect(declFor(label, "overflow-wrap", BASE) === "anywhere", ".ux-flow-label doit passer à la ligne (overflow-wrap: anywhere) quand le mot ne tient pas");
  var icon = { tag: "svg", classes: ["icon"], ancestors: chain };
  var count = { tag: "span", classes: ["ux-flow-count"], ancestors: chain };
  [320, 351, 390, 412, 430, 440].forEach(function (w) {
    expect(declFor(icon, "display", { width: w, rem: 16 }) === "none", "l'icône doit céder sa place au mot à " + w + " px");
  });
  [441, 480, 600, 1280].forEach(function (w) {
    expect(declFor(icon, "display", { width: w, rem: 16 }) !== "none", "l'icône reste visible à " + w + " px");
  });
  [351, 390, 480].forEach(function (w) {
    expect(declFor(count, "display", { width: w, rem: 16 }) !== "none", "le compteur reste visible à " + w + " px");
  });
  expect(declFor(count, "display", { width: 350, rem: 16 }) === "none", "le compteur n'apparaît pas à 350 px");
  var step = { tag: "button", classes: ["ux-flow-step"], ancestors: [{ tag: "nav", classes: ["ux-flow"] }] };
  expect(declFor(step, "padding-left", { width: 351, rem: 16 }) === "4px" && declFor(step, "padding-left", { width: 480, rem: 16 }) === "4px", "marges du parcours resserrées de 351 à 480 px");
  expect(!declFor(step, "padding-left", { width: 481, rem: 16 }), "le resserrage du parcours s'arrête à 480 px");
});

check("BL-044 rangées, pastilles, pieds de carte et lignes de diagnostic passent à la ligne au lieu de déborder", function () {
  expect(declFor({ tag: "div", classes: ["row"], ancestors: [] }, "flex-wrap", BASE) === "wrap", ".row doit porter flex-wrap: wrap");
  var badge = { tag: "span", classes: ["badge", "tone-accord"], ancestors: [{ tag: "div", classes: ["row"] }] };
  expect(declFor(badge, "white-space", BASE) === "normal", ".badge ne doit plus être en nowrap (292 px à 200 % de texte)");
  expect(declFor(badge, "max-width", BASE) === "100%", ".badge doit rester dans sa ligne (max-width: 100 %)");
  var diag = { tag: "div", classes: ["diag-row"], ancestors: [{ tag: "div", classes: ["diag"] }] };
  expect(declFor(diag, "flex-wrap", BASE) === "wrap", ".diag-row doit passer à la ligne");
  expect(ruleExists(function (r) {
    return r.selectors.indexOf(".row > .card-title") >= 0 && /^min\(100%,\s*5\.5em\)$/.test(r.decls["min-width"] || "");
  }), "il manque .row > .card-title { min-width: min(100%, 5.5em) } (une pastille large ne doit pas écraser le titre)");
  var foot = { tag: "div", classes: ["card-foot"], ancestors: [{ tag: "button", classes: ["card"] }] };
  expect(declFor(foot, "flex-wrap", { width: 390, rem: 16 }) !== "wrap", "à 100 % sur 390 px le pied de carte ne change pas");
  expect(declFor(foot, "flex-wrap", { width: 196, rem: 16 }) === "wrap", "le pied de carte doit passer à la ligne sur 196 px");
  expect(declFor(foot, "flex-wrap", { width: 600, rem: 32 }) === "wrap", "le pied de carte doit passer à la ligne à 200 % de police (19rem = 608 px)");
  ["bubble-text", "bubble-meta", "emoji-label"].forEach(function (k) {
    var e = { tag: "div", classes: [k], ancestors: [] };
    expect(/rem$/.test(declFor(e, "font-size", BASE) || ""), "." + k + " doit être en rem (il suit le réglage de police)");
  });
});

check("BL-046 marge de défilement : la barre collante et le bouton flottant ne cachent plus l'élément focalisé", function () {
  var html = { tag: "html", classes: [], ancestors: [] };
  var top = declFor(html, "scroll-padding-top", BASE) || "";
  var bottom = declFor(html, "scroll-padding-bottom", BASE) || "";
  expect(/safe-top/.test(top) && /5rem/.test(top), "html doit réserver la barre du haut (--safe-top + 5rem) dans scroll-padding-top");
  expect(/safe-bottom/.test(bottom) && /6rem/.test(bottom), "html doit réserver le bouton flottant (--safe-bottom + 6rem) dans scroll-padding-bottom");
  expect(declFor(html, "scroll-padding-top", LOW) === "var(--safe-top)", "sous 480 px de hauteur la barre ne colle plus : plus de marge en haut");
  expect(/6rem/.test(declFor(html, "scroll-padding-bottom", LOW) || ""), "la marge du bouton flottant reste en fenêtre basse");
});

check("BL-047 anneau de focus : :focus et :focus-visible en règles séparées (jamais un groupe)", function () {
  var plain = false;
  var visible = false;
  RULES.forEach(function (r) {
    var hasFocus = r.selectors.indexOf(":focus") >= 0;
    var hasVisible = r.selectors.indexOf(":focus-visible") >= 0;
    expect(!(hasFocus && hasVisible), "le groupe « :focus, :focus-visible » est rejeté en bloc par un moteur sans :focus-visible : l'anneau disparaît");
    if (hasFocus && /solid/.test(r.decls.outline || "")) { plain = true; }
    if (hasVisible && /solid/.test(r.decls.outline || "")) { visible = true; }
  });
  expect(plain, "il manque la règle :focus seule (anneau de 2 px) pour les moteurs sans :focus-visible");
  expect(visible, "il manque la règle :focus-visible seule (anneau de 2 px)");
  expect(ruleExists(function (r) { return r.selectors.indexOf(":focus:not(:focus-visible)") >= 0 && r.decls.outline === "none"; }), "il manque :focus:not(:focus-visible) { outline: none } (pas d'anneau au pointeur)");
});

check("BL-048 bouton retour compact : le libellé se masque sous 22rem, l'aria-label porte le nom", function () {
  var hide = null;
  RULES.forEach(function (r) { if (r.selectors.indexOf(".btn-back > span") >= 0) { hide = r; } });
  expect(hide && hide.decls.display === "none", "il manque la règle .btn-back > span { display: none }");
  expect(mediaApplies(hide.media, { width: 320, rem: 16 }), "à 320 px et 100 % le libellé du bouton retour doit être masqué");
  expect(mediaApplies(hide.media, { width: 320, rem: 20.8 }) && mediaApplies(hide.media, { width: 430, rem: 20.8 }), "à 130 % de police le libellé doit être masqué sur tous les téléphones");
  expect(mediaApplies(hide.media, { width: 700, rem: 32 }), "à 200 % de police le libellé doit être masqué jusqu'à 704 px");
  expect(!mediaApplies(hide.media, { width: 360, rem: 16 }) && !mediaApplies(hide.media, { width: 393, rem: 16 }), "à 100 % le libellé reste visible dès 353 px (aucun changement sur les téléphones courants)");
  var btn = { tag: "button", classes: ["btn-back"], ancestors: [{ tag: "header", classes: ["topbar"] }] };
  expect(declFor(btn, "padding", { width: 320, rem: 16 }) === "0", "bouton retour compact : plus de marge latérale");
  expect(declFor(btn, "padding", { width: 393, rem: 16 }) === "0 10px 0 4px", "à 100 % le bouton retour garde sa forme");
  expect(declFor(btn, "min-width", { width: 320, rem: 16 }) === "var(--tap)", "la flèche garde une cible de 44 px");
  expect(/class: "btn-back"[\s\S]{0,200}"aria-label"/.test(read("js/ui.js")), "topbar() doit nommer le bouton retour par un aria-label (le libellé visible est masqué sous 22rem)");
});

check("BL-049 feuilles et fenêtres : repli vh puis ligne dvh", function () {
  expect(/\.sheet \{[^}]*max-height: 86vh;\s*max-height: 86dvh;/.test(APP_TEXT), ".sheet : max-height: 86vh puis 86dvh (repli AVANT la valeur moderne)");
  expect(/\.modal \{[^}]*max-height: 88vh;\s*max-height: 88dvh;/.test(APP_TEXT), ".modal : max-height: 88vh puis 88dvh (repli AVANT la valeur moderne)");
});

check("BL-050 accueil de bureau : les groupes s'empilent, seules leurs cartes se répartissent en colonnes", function () {
  var grid = null;
  RULES.forEach(function (r) { if (r.selectors.indexOf(".topics-grid > .product-topic-group") >= 0) { grid = r; } });
  expect(grid, "il manque la règle .topics-grid > .product-topic-group");
  expect(grid.decls["grid-column"] === "1 / -1", "chaque groupe doit occuper toute la largeur de la grille (pas une colonne de tableau)");
  expect(grid.decls.display === "grid" && /repeat\(auto-fill,\s*minmax\(320px/.test(grid.decls["grid-template-columns"] || ""), "les cartes d'un groupe se répartissent en colonnes de 320 px au moins");
  expect(mediaApplies(grid.media, { width: 1280, rem: 16 }) && mediaApplies(grid.media, { width: 900, rem: 16 }) && !mediaApplies(grid.media, { width: 899, rem: 16 }), "la règle ne vaut que dès 900 px (le mobile reste une colonne)");
  expect(ruleExists(function (r) {
    return r.selectors.indexOf(".product-topic-group > .product-topic-group-title") >= 0 && r.decls["grid-column"] === "1 / -1";
  }), "le titre d'un groupe doit occuper toute la ligne");
});

if (failures.length) {
  console.error("css-contract : " + failures.length + " échec(s) sur " + total + " contrôles");
  failures.forEach(function (f) { console.error(" - " + f); });
  process.exit(1);
}
console.log("css-contract : OK (" + total + " contrôles)");
