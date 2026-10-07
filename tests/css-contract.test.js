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
 *    sans colonnes de tableau (BL-050) ;
 *  - lot WP-23 : parcours aux mots entiers et pied de carte qui passe à la ligne (REC-UI-041, 040), jetons
 *    sombres limités à l'écran donc palette claire à l'impression (043), bandeau de mise à jour centré
 *    sans transform (046).
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

var PILL_WIDTHS = [150, 200, 255, 256, 257, 300, 320, 360, 390, 430, 430.5, 431, 480, 500, 600, 768, 1024, 1280];
var PILL_STATES = ["idle", "syncing", "pending", "offline", "error", "local"];

/* Une pastille dans la barre ; `main` : la pastille principale (classe `status-main`, qui porte la région d'annonce). */
function pillLabels(state, main) {
  var pill = ["status-pill", "status-" + state].concat(main ? ["status-main"] : []);
  var ancestors = [{ tag: "div", classes: pill }, { tag: "div", classes: ["topbar-actions"] }, { tag: "header", classes: ["topbar"] }];
  return {
    short: { tag: "span", classes: ["status-short"], ancestors: ancestors },
    long: { tag: "span", classes: ["status-label", "status-long"], ancestors: ancestors },
    pill: { tag: "div", classes: pill, ancestors: ancestors.slice(1) }
  };
}

function expectWords(state, main) {
  var els = pillLabels(state, main);
  [16, 20.8, 32].forEach(function (rem) {
    PILL_WIDTHS.forEach(function (width) {
      var env = { width: width, rem: rem };
      var shortShown = (declFor(els.short, "display", env) || "inline") !== "none";
      var longShown = (declFor(els.long, "display", env) || "inline") !== "none";
      var where = " (état " + state + (main ? ", pastille principale" : ", seconde pastille") + ", largeur " + width + " px, rem " + rem + " px)";
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
}

check("BL-008 libellés court et long jamais visibles ensemble, seuils 431 px et 16rem", function () {
  /* La seconde pastille (carte Synchronisation de Système) garde ses mots dans les six états ; la principale, dans
     ceux qui demandent l'attention. */
  PILL_STATES.forEach(function (state) { expectWords(state, false); });
  ["pending", "offline", "error"].forEach(function (state) { expectWords(state, true); });
  expect(/@media \(max-width: 16rem\)/.test(APP_TEXT), "la règle @media (max-width: 16rem) est absente de app.css");
  expect(/@media \(min-width: 431px\)/.test(APP_TEXT), "la règle @media (min-width: 431px) est absente de app.css");
});

check("BL-008 pastille principale : à jour, en synchronisation ou en local, masquée visuellement (la région d'annonce reste) ; les états d'attention gardent leurs mots", function () {
  ["idle", "syncing", "local"].forEach(function (state) {
    var pill = { tag: "div", classes: ["status-pill", "status-main", "status-" + state], ancestors: [] };
    [16, 20.8, 32].forEach(function (rem) {
      PILL_WIDTHS.forEach(function (width) {
        var env = { width: width, rem: rem };
        var where = " (état " + state + ", largeur " + width + " px, rem " + rem + " px)";
        expect(declFor(pill, "position", env) === "absolute" && declFor(pill, "clip", env) === "rect(0 0 0 0)",
          "la pastille principale doit être masquée visuellement" + where);
        expect(declFor(pill, "display", env) !== "none", "masquée visuellement, jamais retirée : la région d'annonce doit parler" + where);
      });
    });
  });
  ["pending", "offline", "error"].forEach(function (state) {
    var pill = { tag: "div", classes: ["status-pill", "status-main", "status-" + state], ancestors: [] };
    expect(!declFor(pill, "width", BASE) && declFor(pill, "position", BASE) !== "absolute", "l'état " + state + " reste visible, avec ses mots");
  });
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

check("BL-039 (révisé, douceur) le composeur signé est un aplat sans contour ; le bord --line-field n'est plus que le repère de l'anonymat", function () {
  var field = { tag: "textarea", classes: ["textarea", "grow"], ancestors: [{ tag: "div", classes: ["composer"] }] };
  expect(declFor(field, "border-color", BASE) === "transparent" && declFor(field, "background", BASE) === "var(--fill)", ".composer .textarea : aplat --fill, bord transparent");
});

check("gestes au doigt : la bulle laisse le défilement vertical au navigateur, ne sélectionne pas son texte au doigt, et l'ancien repère « ••• » a disparu", function () {
  var bubble = { tag: "button", classes: ["bubble"], ancestors: [{ tag: "div", classes: ["msg-col"] }, { tag: "div", classes: ["msg-row"] }] };
  expect(declFor(bubble, "touch-action", BASE) === "pan-y", ".bubble doit porter touch-action: pan-y (le glisser horizontal revient à l'application)");
  expect(ruleExists(function (r) {
    return r.selectors.indexOf(".bubble") >= 0 && r.media.some(function (m) { return /pointer:\s*coarse/.test(m); }) &&
      r.decls["user-select"] === "none" && r.decls["-webkit-touch-callout"] === "none";
  }), "au doigt (pointer: coarse), la bulle doit couper la sélection et le menu système de l'appui long");
  expect(!ruleExists(function (r) { return r.selectors.some(function (s) { return s.indexOf("ux-bubble-cue") >= 0; }); }),
    "le repère « ••• » promet un toucher qui n'ouvre plus rien : ses règles doivent disparaître");
  var row = { tag: "div", classes: ["msg-row"], ancestors: [] };
  expect(declFor(row, "position", BASE) === "relative", ".msg-row doit ancrer le repère de citation (position: relative)");
  expect(RULES.some(function (r) { return r.selectors.indexOf(".bubble.is-pressing") >= 0 && r.decls.transform &&
    r.media.some(function (m) { return /prefers-reduced-motion:\s*no-preference/.test(m); }); }),
    "le tassement de l'appui long doit être réservé à prefers-reduced-motion: no-preference");
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
  expect(declFor(composer, "overflow-y", LOW) !== "auto" && !declFor(composer, "max-height", LOW),
    ".composer ne doit ni plafonner ni défiler en interne : le bouton d'envoi passerait sous son défilement (fenêtre de 160 px)");
  var bodies = mediaBodies(APP_TEXT, "(max-height: 480px)").join("\n");
  expect(/\.composer \.textarea \{\s*max-height: 24vh;\s*max-height: 24dvh;/.test(bodies), ".composer .textarea : repli vh AVANT dvh (la dernière déclaration gagne)");
  expect(/\.quote-preview \.quote-text \{\s*-webkit-line-clamp: 1;/.test(bodies), "la citation du composeur tient sur une ligne en fenêtre basse");
  var field = { tag: "textarea", classes: ["textarea", "grow"], ancestors: [{ tag: "div", classes: ["composer"] }] };
  expect(/24d?vh/.test(declFor(field, "max-height", LOW) || ""), "le champ d'envoi doit être plafonné (24 % de la hauteur) en fenêtre basse");
  expect(declFor(field, "max-height", TALL) === "140px", "à 100 % le champ garde son plafond de 140 px (celui d'autoGrow)");
  var topbar = { tag: "header", classes: ["topbar"], ancestors: [] };
  expect(declFor(topbar, "position", LOW) === "static", "la barre du haut ne colle plus sous 480 px de hauteur");
  expect(declFor(topbar, "position", { width: 568, height: 700, rem: 16 }) === "sticky", "au-dessus de 480 px de hauteur la barre reste collante");
  var flow = { tag: "nav", classes: ["ux-flow"], ancestors: [] };
  expect(declFor(flow, "display", { width: 568, height: 299, rem: 16 }) === "none", "le parcours s'efface sous 300 px de hauteur (clavier ouvert en paysage)");
  expect(declFor(flow, "display", LOW) === "flex", "le parcours reste affiché à 320 px de hauteur (rangée flex qui passe à la ligne)");
});

check("BL-043 libellés du parcours : jamais de points de suspension, un mot par ligne de 351 à 480 px", function () {
  var chain = [{ tag: "button", classes: ["ux-flow-step"] }, { tag: "nav", classes: ["ux-flow"] }];
  var label = { tag: "span", classes: ["ux-flow-label"], ancestors: chain };
  expect(!declFor(label, "text-overflow", BASE), ".ux-flow-label ne doit plus porter text-overflow");
  expect(declFor(label, "white-space", BASE) !== "nowrap", ".ux-flow-label ne doit plus être en nowrap");
  expect(["anywhere", "break-word"].indexOf(declFor(label, "overflow-wrap", BASE)) < 0, ".ux-flow-label ne doit jamais couper n'importe où : le mot reste entier et l'étape passe à la ligne (REC-UI-041)");
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
  var unread = { tag: "span", classes: ["badge", "tone-info", "product-unread"], ancestors: [{ tag: "div", classes: ["row-wrap"] }, { tag: "div", classes: ["card-foot"] }, { tag: "button", classes: ["card"] }] };
  expect(declFor(unread, "white-space", BASE) === "nowrap", ".product-unread doit garder sa ligne unique : sécable, il ferait replier les compteurs du pied de carte à 320 px");
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

check("repli iOS 15.0 à 15.3 : l'anneau du conteneur d'une feuille ou d'une fenêtre n'est neutralisé que sans :focus-visible", function () {
  expect(/@supports not selector\(:focus-visible\) \{\s*\.sheet\[tabindex="-1"\]:focus,\s*\.modal\[tabindex="-1"\]:focus \{ outline: none; \}\s*\}/.test(APP_TEXT),
    "il manque le repli @supports not selector(:focus-visible) sur .sheet et .modal");
  RULES.forEach(function (r) {
    r.selectors.forEach(function (s) {
      if (/^\.(sheet|modal)\[tabindex="-1"\]/.test(s) && s.indexOf(":focus-visible") >= 0) {
        expect(r.decls.outline !== "none", "l'anneau clavier (:focus-visible) du conteneur ne doit pas être retiré");
      }
    });
  });
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

check("BL-009 message d'erreur d'un champ : texte en couleur d'erreur, champ invalide encadré", function () {
  expect(ruleExists(function (r) {
    return r.selectors.indexOf(".hint.field-error") >= 0 && r.decls["color"] === "var(--danger)";
  }), "le message d'erreur relié à son champ doit prendre la couleur d'erreur");
  expect(ruleExists(function (r) {
    return r.selectors.indexOf('input[aria-invalid="true"]') >= 0 && r.decls["border-color"] === "var(--danger)";
  }), "un champ invalide doit être encadré par la couleur d'erreur");
});

check("REC-RUI-009 sous-titre de la barre du haut : le premier texte rétrécit avec des points de suspension, le repère « Détails » disparaît sous 22rem", function () {
  expect(ruleExists(function (r) {
    return r.selectors.indexOf(".topbar-sub > span:first-child") >= 0 && r.decls["min-width"] === "0" &&
      r.decls["overflow"] === "hidden" && r.decls["text-overflow"] === "ellipsis";
  }), "le premier texte de .topbar-sub doit pouvoir rétrécir (min-width: 0) avec overflow: hidden et text-overflow: ellipsis (text-overflow ne s'applique pas aux enfants d'un conteneur flex)");
  expect(ruleExists(function (r) { return r.selectors.indexOf(".topbar-sub .icon") >= 0 && r.decls.flex === "none"; }), "l'icône du sous-titre ne doit pas rétrécir");
  var hide = null;
  RULES.forEach(function (r) { if (r.selectors.indexOf(".ux-title-hint") >= 0 && r.decls.display === "none") { hide = r; } });
  expect(hide, "il manque la règle .ux-title-hint { display: none } en petit écran");
  expect(mediaApplies(hide.media, { width: 320, rem: 16 }), "à 320 px le repère « Détails » doit être masqué");
  expect(mediaApplies(hide.media, { width: 700, rem: 32 }), "à 200 % de police le repère doit être masqué jusqu'à 704 px");
  expect(!mediaApplies(hide.media, { width: 360, rem: 16 }) && !mediaApplies(hide.media, { width: 393, rem: 16 }), "à 100 % le repère reste visible dès 353 px (aucun changement sur les téléphones courants)");
});

/* --- WP-23 : finitions de la recette finale « ui » (mots entiers, impression claire, bandeau) ------ */

check("REC-UI-041 libellés du parcours : jamais coupés au milieu d'un mot, l'étape entière passe à la ligne", function () {
  var chain = [{ tag: "button", classes: ["ux-flow-step"] }, { tag: "nav", classes: ["ux-flow"] }];
  var label = { tag: "span", classes: ["ux-flow-label"], ancestors: chain };
  var step = { tag: "button", classes: ["ux-flow-step"], ancestors: [{ tag: "nav", classes: ["ux-flow"] }] };
  var flow = { tag: "nav", classes: ["ux-flow"], ancestors: [] };
  [{ width: 320, rem: 16 }, { width: 390, rem: 16 }, { width: 320, rem: 20.8 }, { width: 390, rem: 20.8 }, { width: 320, rem: 32 }, { width: 600, rem: 32 }].forEach(function (env) {
    var where = " (largeur " + env.width + " px, rem " + env.rem + " px)";
    var wrap = declFor(label, "overflow-wrap", env);
    expect(wrap !== "anywhere" && wrap !== "break-word", ".ux-flow-label ne doit jamais couper n'importe où (overflow-wrap: " + wrap + ")" + where);
    var brk = declFor(label, "word-break", env);
    expect(brk !== "break-all" && brk !== "break-word", ".ux-flow-label ne doit pas porter word-break: " + brk + where);
    expect(declFor(label, "hyphens", env) !== "auto", ".ux-flow-label ne doit pas porter hyphens: auto (césure au milieu du mot)" + where);
    expect(declFor(label, "min-width", env) !== "0" && declFor(step, "min-width", env) !== "0", "ni l'étape ni son libellé ne portent min-width: 0 : le mot le plus long ne doit jamais rétrécir" + where);
    expect(declFor(flow, "display", env) === "flex" && declFor(flow, "flex-wrap", env) === "wrap", ".ux-flow doit être une rangée flex qui passe à la ligne entre les étapes" + where);
    expect(declFor(step, "flex", env) === "1 1 0%", ".ux-flow-step doit partager la rangée à parts égales (flex: 1 1 0%) tant que les mots tiennent" + where);
  });
  RULES.forEach(function (r) {
    r.selectors.forEach(function (s) {
      if (s.indexOf("ux-flow-label") < 0 && s.indexOf("ux-flow-step") < 0) { return; }
      var d = r.decls;
      expect(d["overflow-wrap"] !== "anywhere" && d["overflow-wrap"] !== "break-word", "le sélecteur « " + s + " » coupe les mots (overflow-wrap: " + d["overflow-wrap"] + ")");
      expect(d["word-break"] !== "break-all" && d["word-break"] !== "break-word", "le sélecteur « " + s + " » coupe les mots (word-break: " + d["word-break"] + ")");
      expect(d["text-overflow"] === undefined, "le sélecteur « " + s + " » pose des points de suspension");
    });
  });
});

check("REC-UI-040 pied de carte : il passe à la ligne dès 384 px (24rem), le nom de l'auteur garde sa largeur ou sa ligne", function () {
  var foot = { tag: "div", classes: ["card-foot"], ancestors: [{ tag: "button", classes: ["card"] }] };
  var open = { tag: "span", classes: ["ux-card-action"], ancestors: [{ tag: "div", classes: ["card-foot"] }, { tag: "button", classes: ["card"] }] };
  [320, 360, 375, 384].forEach(function (w) {
    expect(declFor(foot, "flex-wrap", { width: w, rem: 16 }) === "wrap", "à " + w + " px et 100 % le pied de carte doit passer à la ligne (le nom de l'auteur tenait dans 29 à 46 px)");
  });
  [385, 390, 430, 600].forEach(function (w) {
    expect(declFor(foot, "flex-wrap", { width: w, rem: 16 }) !== "wrap", "à " + w + " px et 100 % le pied de carte ne change pas");
  });
  [20.8, 32].forEach(function (rem) {
    expect(declFor(foot, "flex-wrap", { width: 390, rem: rem }) === "wrap", "à " + Math.round(rem * 100 / 16) + " % de police le pied de carte doit passer à la ligne sur 390 px");
  });
  expect(declFor(open, "margin-left", { width: 320, rem: 16 }) === "auto", "« Ouvrir » reste à droite quand le pied passe à la ligne");
  var meta = { tag: "span", classes: ["card-meta"], ancestors: [{ tag: "div", classes: ["card-foot"] }] };
  expect(declFor(meta, "min-width", BASE) === "0", ".card-meta garde min-width: 0 (un nom sans espace ne pousse pas « Ouvrir » hors de la carte)");
});

check("REC-UI-043 jetons sombres : posés par data-theme, limités à l'écran, la palette claire reste en vigueur à l'impression", function () {
  var dark = RULES.filter(function (r) { return r.decls["--canvas"] !== undefined && r.media.length; });
  expect(dark.length === 1, "le bloc des jetons sombres (--canvas) doit exister une seule fois : " + dark.length);
  expect(dark[0].selectors.length === 1 && dark[0].selectors[0] === ':root[data-theme="dark"]',
    "les jetons sombres doivent dépendre du thème choisi (:root[data-theme=\"dark\"]), trouvé « " + dark[0].selectors.join(", ") + " »");
  expect(dark[0].media.length === 1 && /^screen$/.test(dark[0].media[0].trim()),
    "les jetons sombres doivent être limités à l'écran (@media screen) ; trouvé « @media " + dark[0].media.join(" / ") + " » : imprimée depuis un appareil en thème sombre, la synthèse sortirait en textes clairs sur papier blanc (REC-UI-043)");
  expect(!/prefers-color-scheme/.test(APP_TEXT.replace(/\/\*[\s\S]*?\*\//g, "")),
    "plus aucune règle ne doit lire prefers-color-scheme : le téléphone est suivi par le script de thème (index.html), sinon le choix « Clair » des Réglages serait contredit");
  RULES.forEach(function (r) {
    if (r.decls["--canvas"] === undefined || !r.media.length) { return; }
    expect(r.media.some(function (c) { return /(^|\s)screen(\s|$)/.test(c); }), "« " + r.selectors.join(", ") + " » redéfinit --canvas hors d'un @media screen : il s'appliquerait à l'impression");
  });
  expect(ruleExists(function (r) { return r.selectors.indexOf(":root") >= 0 && r.decls["--canvas"] !== undefined && !r.media.length; }), "les jetons clairs doivent rester sur :root, sans @media : ils servent l'écran ET l'impression");
});

check("REC-UI-046 bandeau de mise à jour : centré sans transform, l'animation d'entrée ne le décale plus", function () {
  var banner = { tag: "div", classes: ["update-banner"], ancestors: [] };
  var transform = declFor(banner, "transform", BASE);
  expect(!transform || transform === "none", ".update-banner ne doit porter aucun transform au repos (`animation` le remplace pendant l'entrée : translateX(-50%) écrasé, le bandeau sautait d'une demi-largeur)");
  expect(declFor(banner, "left", BASE) === "0" && declFor(banner, "right", BASE) === "0" && declFor(banner, "margin", BASE) === "0 auto", ".update-banner doit se centrer par left: 0, right: 0 et margin: 0 auto");
  expect(/banner-up/.test(declFor(banner, "animation", BASE) || ""), ".update-banner garde une animation d'entrée (banner-up)");
  var frames = /@keyframes banner-up \{([\s\S]*?\})\s*\}/.exec(APP_TEXT.replace(/\/\*[\s\S]*?\*\//g, ""));
  expect(frames, "il manque @keyframes banner-up (entrée du bandeau)");
  expect(!/translateX/.test(frames[1]), "l'entrée du bandeau ne doit jamais porter de translateX : le centrage ne passe pas par un transform");
  var travel = /translateY\((\d+)px\)/.exec(frames[1]);
  expect(travel && Number(travel[1]) <= 14, "la course verticale de l'entrée doit rester sous la marge basse du bandeau (14 px) : son rectangle ne sort jamais de l'écran");
  expect(/@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{[^}]*animation-duration: 0\.001ms !important/.test(APP_TEXT), "sous « réduire les animations » le bandeau arrive sans mouvement (durée quasi nulle)");
});

check("REC-UI-041 / BL-045 fenêtre très étroite et basse : le parcours à plusieurs lignes se resserre pour rendre sa place au fil", function () {
  var step = { tag: "button", classes: ["ux-flow-step"], ancestors: [{ tag: "nav", classes: ["ux-flow"] }] };
  var flow = { tag: "nav", classes: ["ux-flow"], ancestors: [] };
  var zoomed = { width: 196, height: 425, rem: 16 };
  expect(declFor(step, "min-height", zoomed) === "32px", "à 196 x 425 (page zoomée à 200 %) les étapes passent à 32 px de haut (WCAG 2.5.8 : 24 px au minimum)");
  expect(declFor(flow, "gap", zoomed) === "3px", "à 196 x 425 le parcours resserre son espacement");
  expect(declFor(flow, "padding-left", { width: 196, rem: 16 }) === "6px" && declFor(flow, "padding-right", { width: 196, rem: 16 }) === "6px", "à 196 px de large les marges latérales du parcours se resserrent (deux étapes sur la première ligne, même avec un ascenseur)");
  [{ width: 320, height: 568, rem: 16 }, { width: 568, height: 320, rem: 16 }, { width: 667, height: 375, rem: 16 }, { width: 390, height: 844, rem: 16 }, { width: 320, height: 284, rem: 16 }, { width: 241, height: 425, rem: 16 }].forEach(function (env) {
    expect(declFor(step, "min-height", env) === "var(--tap)", "les paysages, les claviers ouverts et les téléphones à 100 % gardent des étapes de 44 px (" + env.width + " x " + env.height + ")");
  });
  expect(declFor(flow, "padding-left", { width: 320, height: 568, rem: 16 }) === "10px", "le parcours garde ses marges de 10 px dès 241 px de large");
});

check("REC-UI-042 textes rognés : le repère « nouveau » est un bloc à points de suspension, les champs en ont aussi", function () {
  var unread = { tag: "span", classes: ["badge", "tone-info", "product-unread"], ancestors: [{ tag: "div", classes: ["row-wrap"] }, { tag: "div", classes: ["card-foot"] }, { tag: "button", classes: ["card"] }] };
  expect(declFor(unread, "display", BASE) === "inline-block", ".product-unread doit être un bloc (inline-block) : text-overflow ne s'applique pas au texte d'un conteneur flex, et .badge est un inline-flex");
  expect(declFor(unread, "overflow", BASE) === "hidden" && declFor(unread, "text-overflow", BASE) === "ellipsis" && declFor(unread, "white-space", BASE) === "nowrap", ".product-unread garde overflow: hidden, text-overflow: ellipsis et sa ligne unique");
  [["input", "input"], ["textarea", "textarea"], ["select", "select"]].forEach(function (t) {
    var field = { tag: t[0], classes: [t[1]], ancestors: [] };
    expect(declFor(field, "text-overflow", BASE) === "ellipsis", "le champ « " + t[0] + " » doit porter text-overflow: ellipsis (indication ou valeur trop longue)");
  });
});

check("interrupteur Anonyme : cible de 44 px, forme de pastille gardée au focus (deux règles, jamais un groupe), libellé qui peut passer à la ligne", function () {
  var sw = { tag: "button", classes: ["sig-switch"], ancestors: [{ tag: "div", classes: ["signature-toggle"] }] };
  expect(declFor(sw, "min-height", BASE) === "var(--tap)", ".sig-switch doit garder une cible de 44 px (--tap)");
  expect(/^0 1 auto$/.test(declFor(sw, "flex", BASE) || ""),
    ".sig-switch doit pouvoir rétrécir (flex: 0 1 auto) : au grand texte le libellé passe à la ligne au lieu de déborder");
  ["focus", "focus-visible"].forEach(function (pseudo) {
    expect(ruleExists(function (r) {
      return r.selectors.length === 1 && r.selectors[0] === ".sig-switch:" + pseudo && r.decls["border-radius"] === "var(--radius-chip)";
    }), ".sig-switch:" + pseudo + " doit avoir sa propre règle de rayon (le :focus global ramène tout à 6 px)");
  });
  var row = { tag: "div", classes: ["signature-toggle"], ancestors: [] };
  expect(declFor(row, "flex-wrap", BASE) === "wrap", ".signature-toggle doit passer à la ligne au grand texte");
});

check("interrupteur Anonyme : toute animation de bascule est réservée à `prefers-reduced-motion: no-preference`, sans courbe à dépassement", function () {
  var flips = RULES.filter(function (r) {
    return r.selectors.some(function (s) { return s.indexOf("is-flip") >= 0; });
  });
  expect(flips.length >= 6, "les six animations de bascule (bouton, piste, nom, dans les deux sens) sont attendues, " + flips.length + " trouvées");
  flips.forEach(function (r) {
    expect(r.media.some(function (m) { return /prefers-reduced-motion:\s*no-preference/.test(m); }),
      "« " + r.selectors[0] + " » s'anime hors de (prefers-reduced-motion: no-preference) : un utilisateur de mouvement réduit la verrait");
    expect(!r.decls.animation || (/var\(--ease-out\)/.test(r.decls.animation) && !/ease-spring/.test(r.decls.animation)),
      "« " + r.selectors[0] + " » : l'animation doit utiliser --ease-out, sans dépassement");
  });
  ["sig-thumb-on", "sig-thumb-off", "sig-track-on", "sig-track-off", "sig-name-up", "sig-name-down"].forEach(function (name) {
    expect(new RegExp("@keyframes " + name + "\\b").test(APP_TEXT), "@keyframes " + name + " absent");
  });
  var plain = RULES.filter(function (r) {
    return r.selectors.some(function (s) { return /\.sig-(switch|track|thumb)\b/.test(s) && s.indexOf("is-flip") < 0; }) && (r.decls.transition || r.decls.animation);
  });
  expect(!plain.length, "une transition ou une animation hors `is-flip` sur l'interrupteur : le rendu reconstruit le nœud, elle ne se jouerait jamais");
});

check("écriture anonyme : bord en tirets mais toujours sur --line-field, fond creusé, place du masque à gauche, pastille d'envoi ancrée", function () {
  var anonField = { tag: "textarea", classes: ["textarea", "grow"], ancestors: [{ tag: "div", classes: ["composer", "is-anon"] }] };
  expect(declFor(anonField, "border-style", BASE) === "dashed", "le champ d'écriture anonyme doit avoir un bord en tirets");
  expect(declFor(anonField, "border-color", BASE) === "var(--line-field)", "le bord en tirets reste sur --line-field (3:1, BL-039)");
  expect(declFor(anonField, "background", BASE) === "var(--surface-sunken)", "le champ d'écriture anonyme doit être creusé");
  expect(/^\d+px$/.test(declFor(anonField, "padding-left", BASE) || "") && parseInt(declFor(anonField, "padding-left", BASE), 10) >= 40,
    "le texte doit laisser la place du masque (44 px à gauche)");
  var signedField = { tag: "textarea", classes: ["textarea", "grow"], ancestors: [{ tag: "div", classes: ["composer"] }] };
  expect(!declFor(signedField, "border-style", BASE) && !declFor(signedField, "padding-left", BASE) && declFor(signedField, "padding", BASE) === "12px 18px",
    "le champ signé garde son bord plein et sa marge de 18 px (le tiret et le retrait de 44 px sont réservés à .composer.is-anon)");
  var send = { tag: "button", classes: ["send-btn", "is-anon"], ancestors: [] };
  expect(declFor(send, "position", BASE) === "relative", ".send-btn doit ancrer sa pastille d'anonymat");
  var mark = { tag: "span", classes: ["send-mark"], ancestors: [{ tag: "button", classes: ["send-btn", "is-anon"] }] };
  expect(declFor(mark, "pointer-events", BASE) === "none", "la pastille d'envoi ne doit pas intercepter le toucher");
  var fieldMark = { tag: "span", classes: ["field-mark"], ancestors: [{ tag: "div", classes: ["composer-field"] }] };
  expect(declFor(fieldMark, "pointer-events", BASE) === "none", "le masque du champ ne doit pas intercepter le toucher ni le focus");
});

check("cibles tactiles : voter, choisir, retirer son vote à 44 px ; pastille de réaction à zone tactile de 44 px sans mordre sur la bulle", function () {
  var vote = { tag: "button", classes: ["btn", "btn-sm", "btn-outline"], ancestors: [{ tag: "div", classes: ["vote-actions"] }] };
  expect(declFor(vote, "min-height", BASE) === "var(--tap)", "boutons de vote : min-height var(--tap) attendu, trouvé " + declFor(vote, "min-height", BASE));
  var foot = { tag: "button", classes: ["btn", "btn-sm", "btn-outline"], ancestors: [{ tag: "div", classes: ["card-foot", "row-wrap"] }] };
  expect(declFor(foot, "min-height", BASE) === "var(--tap)", "« Choisir » et « Retirer mon vote » : min-height var(--tap) attendu, trouvé " + declFor(foot, "min-height", BASE));
  var hit = RULES.filter(function (r) { return r.selectors.indexOf(".reaction::before") >= 0; })[0];
  expect(hit, ".reaction::before (zone tactile) absent");
  var px = function (v) { return parseFloat(String(v || "0").replace("px", "")); };
  var height = 24 - px(hit.decls.top) - px(hit.decls.bottom);
  expect(height >= 44, "zone tactile de la réaction : " + height + " px de haut, 44 attendus");
  expect(-px(hit.decls.top) <= 6, "la zone tactile ne doit presque pas monter sur la bulle (top " + hit.decls.top + ")");
  expect(-px(hit.decls.left) * 2 <= 4 && -px(hit.decls.right) * 2 <= 4, "deux zones voisines ne doivent pas se chevaucher (écart de 4 px)");
  var chip = { tag: "button", classes: ["reaction"], ancestors: [{ tag: "div", classes: ["reactions"] }] };
  expect(declFor(chip, "position", BASE) === "relative", ".reaction doit ancrer sa zone tactile (position: relative)");
});

if (failures.length) {
  console.error("css-contract : " + failures.length + " échec(s) sur " + total + " contrôles");
  failures.forEach(function (f) { console.error(" - " + f); });
  process.exit(1);
}
console.log("css-contract : OK (" + total + " contrôles)");
