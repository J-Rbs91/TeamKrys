/* BrainstO. — garde-fous de la motion identity du monogramme (issue #30).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/logo-motion.test.js
 *
 * ⚠️ PORTÉE. Ces contrôles lisent le TEXTE de css/app.css, js/ui.js et
 * js/utils.js, comme tests/navigation.test.js et tests/onboarding.test.js —
 * aucune exécution DOM, aucune dépendance. Ils ne prouvent pas que la
 * séquence est belle : ils protègent les invariants NOMMÉS de la spécification
 * (durée totale, égalité point/logotype, seuil de taille, non-rejeu) contre
 * une régression silencieuse au prochain réglage de délai.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CSS = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
const UI = fs.readFileSync(path.join(ROOT, "js/ui.js"), "utf8");
const UTILS = fs.readFileSync(path.join(ROOT, "js/utils.js"), "utf8");
const ICON = fs.readFileSync(path.join(ROOT, "assets/icons/icon.svg"), "utf8");

function sansCommentairesJS(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function sansCommentairesCSS(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ");
}

const UI_CODE = sansCommentairesJS(UI);
const UTILS_CODE = sansCommentairesJS(UTILS);
const CSS_CODE = sansCommentairesCSS(CSS);

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push({ name, error }); }
}

/* ---------------------------------------------------------- Utilitaires --- */

/* Isole le corps `{ … }` qui suit une accroche donnée, par comptage
 * d'accolades — même technique que tests/onboarding.test.js pour les blocs
 * `@media`. Suffisant ici : aucun bloc lu n'imbrique d'accolades internes. */
function bodyAfter(source, marker) {
  const start = source.indexOf(marker);
  assert(start !== -1, "marqueur introuvable : " + marker);
  const open = source.indexOf("{", start);
  let depth = 1;
  let index = open + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === "{") { depth += 1; }
    else if (source[index] === "}") { depth -= 1; }
    index += 1;
  }
  return { text: source.slice(open + 1, index - 1), end: index };
}

/* Lit délai (`calc(Xs - …)`) et durée (`animation: nom Xs …`) d'une règle
 * `.screen--enter .cible { … }`, et renvoie l'instant où elle se termine. */
function delayAndDuration(selector, keyframeName) {
  const body = bodyAfter(CSS_CODE, selector).text;
  const durMatch = body.match(new RegExp(keyframeName + "\\s+([\\d.]+)s"));
  assert(durMatch, "durée introuvable pour " + selector);
  const delayMatch = body.match(/animation-delay:\s*calc\(([\d.]+)s/);
  assert(delayMatch, "délai introuvable pour " + selector);
  const duration = Math.round(parseFloat(durMatch[1]) * 1000);
  const delay = Math.round(parseFloat(delayMatch[1]) * 1000);
  return { delay: delay, duration: duration, end: delay + duration };
}

/* ------------------------------------------------- Les quatre fragments --- */

check("les quatre fragments partent d'une origine commune avec des délais distincts", () => {
  const base = delayAndDuration(".screen--enter .logo-seed {", "logo-seed-in");
  assert(base.duration === 640, "durée locale attendue 640 ms, trouvé " + base.duration);
  assert(base.delay === 0, "le premier fragment doit partir sans délai, trouvé " + base.delay);

  const delais = [base.delay];
  [2, 3, 4].forEach((n) => {
    const body = bodyAfter(CSS_CODE, ".screen--enter .logo-seed:nth-of-type(" + n + ") {").text;
    const match = body.match(/calc\(([\d.]+)s/);
    assert(match, "délai introuvable pour le fragment nth-of-type(" + n + ")");
    delais.push(Math.round(parseFloat(match[1]) * 1000));
  });

  assert(delais.length === 4, "quatre fragments attendus, trouvé " + delais.length);
  assert(new Set(delais).size === 4, "les quatre délais doivent être distincts : " + delais.join(", "));
  assert(
    delais[0] === 0 && delais[1] === 60 && delais[2] === 110 && delais[3] === 160,
    "délais attendus 0/60/110/160 ms, trouvé " + delais.join("/"),
  );
});

check("le palier de divergence (38%→55%) est à valeurs identiques et sans courbe propre", () => {
  const kf = bodyAfter(CSS_CODE, "@keyframes logo-seed-in {").text;

  function crans(pct) {
    const match = kf.match(new RegExp(pct + "%\\s*\\{([^}]*)\\}"));
    assert(match, "cran " + pct + "% introuvable dans logo-seed-in");
    return match[1];
  }

  const c0 = crans("0");
  const c38 = crans("38");
  const c55 = crans("55");
  const c100 = crans("100");

  assert(/animation-timing-function/.test(c0), "le cran 0% doit poser une courbe pour le segment sortant");
  assert(!/animation-timing-function/.test(c38), "le cran 38% ne doit poser aucune courbe (il hérite de 0%, sans effet visible)");
  assert(/animation-timing-function/.test(c55), "le cran 55% doit poser la courbe du retour vers le centre");

  const valeurs = (text) => text.replace(/animation-timing-function:[^;]*;/, "").replace(/\s+/g, " ").trim();
  assert(
    valeurs(c38) === valeurs(c55),
    "le palier doit porter EXACTEMENT les mêmes opacité/transform aux deux crans",
  );
  assert(/opacity:\s*0\b/.test(c100), "le cran 100% doit refermer sur une opacité nulle (absorption dans l'anneau)");
});

/* --------------------------------------------- Ligne de temps du reste --- */

check("le point et le logotype se terminent sur le même instant (invariant du dépôt)", () => {
  const dot = delayAndDuration(".screen--enter .logo-dot {", "logo-dot-pop");
  const wordmark = delayAndDuration(".screen--enter .wordmark {", "wordmark-rise");
  assert(
    dot.end === wordmark.end,
    "fin du point (" + dot.end + " ms) ≠ fin du logotype (" + wordmark.end + " ms)",
  );
});

check("la durée totale retenue est 1180 ms, sous le plancher de 1,2 s du mandat", () => {
  const tagline = delayAndDuration(".screen--enter .tagline {", "tagline-in");
  assert(tagline.end === 1180, "fin de séquence attendue à 1180 ms, trouvé " + tagline.end + " ms");
});

check("l'anneau démarre après les premiers fragments, chevauchement conservé", () => {
  const ring = delayAndDuration(".screen--enter .logo-ring {", "logo-ring-draw");
  assert(ring.delay === 300, "délai de l'anneau attendu 300 ms, trouvé " + ring.delay);
  assert(ring.duration === 520, "durée de l'anneau attendue 520 ms (inchangée), trouvé " + ring.duration);
});

/* -------------------------------------------------------- Repli & taille --- */

check("aucun état masqué n'est posé hors du bloc no-preference pour l'anneau", () => {
  /* Même garde que tests/onboarding.test.js : sans dasharray hors media query,
   * un <circle> sans tiret se rend toujours PLEIN — jamais à moitié tracé. */
  const horsBloc = CSS_CODE
    .replace(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*?\n\}\n/g, (bloc, offset) => {
      void offset;
      return "";
    });
  assert(
    !/\.logo-ring\s*\{[^}]*stroke-dasharray/.test(horsBloc),
    "stroke-dasharray ne doit jamais être posé sur .logo-ring hors du bloc no-preference",
  );
});

check("le seuil de taille sous lequel les fragments ne sont jamais créés est posé à 44 px", () => {
  const fn = bodyAfter(UTILS_CODE, "Utils.logoMark = function").text;
  const guardMatch = fn.match(/if\s*\(\s*px\s*>=\s*44\s*\)\s*\{/);
  assert(guardMatch, "garde `if (px >= 44)` introuvable dans Utils.logoMark");

  const guardBody = bodyAfter(fn, guardMatch[0].slice(0, -1));
  assert(
    /class",\s*"logo-seed"/.test(guardBody.text),
    "la création des fragments (classe logo-seed) doit vivre À L'INTÉRIEUR de la garde de taille",
  );

  const apres = fn.slice(guardBody.end);
  assert(
    /class",\s*"logo-ring"/.test(apres) && /class",\s*"logo-dot"/.test(apres),
    "l'anneau et le point doivent être créés HORS de la garde de taille : ils survivent à toute taille",
  );
});

/* -------------------------------------------------------------- Non-rejeu --- */

check("un drapeau de session (non persisté) mémorise si la narration a déjà été jouée", () => {
  assert(
    /var\s+heroSequencePlayed\s*=\s*false;/.test(UI_CODE),
    "heroSequencePlayed doit être une variable de module initialisée à false",
  );
  assert(
    !new RegExp("Utils\\.storage\\.set\\([^)]*heroSequencePlayed").test(UI_CODE),
    "heroSequencePlayed ne doit jamais être persisté : un vrai rechargement doit être la seule remise à zéro",
  );
});

check("un écran hero déjà vu cette session porte screen--enter-repeat, jamais la classe narrative", () => {
  assert(/screen--enter-repeat/.test(UI_CODE), "la classe screen--enter-repeat est introuvable dans js/ui.js");
  assert(
    /heroRepeatActive\s*\?\s*"screen--enter-repeat"\s*:\s*"screen--enter"/.test(UI_CODE),
    "le choix entre classe narrative et repli doit être un branchement exclusif sur heroRepeatActive",
  );
});

check("screen--enter-repeat ne sélectionne aucune règle CSS narrative", () => {
  const cibles = ["logo-seed", "logo-ring", "logo-dot", "wordmark", "tagline"];
  cibles.forEach((cible) => {
    assert(
      !new RegExp("\\.screen--enter-repeat[^{]*\\." + cible).test(CSS_CODE),
      "une règle CSS scope encore .screen--enter-repeat sur ." + cible + " — la non-lecture ne doit tenir qu'à l'absence de classe",
    );
  });
});

/* ------------------------------------------------------ Aucune librairie --- */

check("aucune bibliothèque d'animation n'est introduite", () => {
  const suspects = /gsap|anime\.min|animejs|framer-motion|velocity\.js|\.animate\(\s*\[/i;
  assert(!suspects.test(CSS_CODE), "css/app.css référence une bibliothèque d'animation");
  assert(!suspects.test(UI_CODE), "js/ui.js référence une bibliothèque d'animation");
  assert(!suspects.test(UTILS_CODE), "js/utils.js référence une bibliothèque d'animation");
});

/* ---------------------------------------------- Couleurs figées (#30) --- */

check("les jetons figés reprennent EXACTEMENT les couleurs du logo statique", () => {
  const rectMatch = ICON.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/);
  assert(rectMatch, "fond du logo statique introuvable dans assets/icons/icon.svg");
  assert(rectMatch[1] === "#0c1317", "fond du logo statique attendu #0c1317, trouvé " + rectMatch[1]);

  const circles = ICON.match(/<circle[^>]*\/>/g) || [];
  assert(circles.length === 2, "deux <circle> attendus dans assets/icons/icon.svg, trouvé " + circles.length);

  const ringMatch = circles[0].match(/stroke="(#[0-9a-fA-F]{6})"/);
  assert(ringMatch, "anneau du logo statique introuvable");
  assert(ringMatch[1] === "#e8eef3", "anneau du logo statique attendu #e8eef3, trouvé " + ringMatch[1]);

  const dotMatch = circles[1].match(/fill="(#[0-9a-fA-F]{6})"/);
  assert(dotMatch, "point du logo statique introuvable");
  assert(dotMatch[1] === "#4fc3dd", "point du logo statique attendu #4fc3dd, trouvé " + dotMatch[1]);

  assert(CSS_CODE.includes("--logo-canvas: #0c1317"), "--logo-canvas doit valoir #0c1317, comme le fond du logo statique");
  assert(CSS_CODE.includes("--logo-ring: #e8eef3"), "--logo-ring doit valoir #e8eef3, comme l'anneau du logo statique");
  assert(CSS_CODE.includes("--logo-dot: #4fc3dd"), "--logo-dot doit valoir #4fc3dd, comme le point du logo statique");
});

check("les jetons --logo-* ne sont jamais redéclarés dans le thème sombre", () => {
  const darkIndex = CSS_CODE.indexOf("@media (prefers-color-scheme: dark)");
  assert(darkIndex !== -1, "bloc @media (prefers-color-scheme: dark) introuvable");

  ["--logo-canvas:", "--logo-ring:", "--logo-dot:"].forEach((token) => {
    const firstIndex = CSS_CODE.indexOf(token);
    assert(firstIndex !== -1, "déclaration introuvable : " + token);
    assert(firstIndex < darkIndex, token + " doit être déclaré dans le :root de base, avant le premier bloc sombre");
    assert(
      CSS_CODE.indexOf(token, darkIndex) === -1,
      token + " ne doit JAMAIS être redéclaré dans ou après le bloc sombre — c'est cette absence qui le fige",
    );
  });
});

check("le monogramme ne référence plus aucun jeton thème-dépendant", () => {
  const markBody = bodyAfter(CSS_CODE, ".logo-mark {").text;
  assert(markBody.includes("var(--logo-ring)"), ".logo-mark doit poser color: var(--logo-ring)");
  assert(markBody.includes("var(--logo-canvas)"), ".logo-mark doit poser background: var(--logo-canvas)");
  assert(!markBody.includes("var(--ink)"), ".logo-mark ne doit plus référencer var(--ink)");
  assert(!markBody.includes("var(--accent)"), ".logo-mark ne doit plus référencer var(--accent)");

  assert(UTILS_CODE.includes('"var(--logo-dot)"'), "le point doit être peint avec var(--logo-dot)");
  assert(!UTILS_CODE.includes('"var(--accent)"'), "le point ne doit plus être peint avec var(--accent)");
});

check("l'enveloppe de l'onboarding ne réintroduit pas de dépendance au thème", () => {
  const wrapBody = bodyAfter(CSS_CODE, ".onboard-mark {").text;
  assert(
    !wrapBody.includes("color: var(--ink)"),
    ".onboard-mark ne doit plus poser color: var(--ink) — .logo-mark fixe sa propre couleur sur l'enfant svg",
  );
});

/* ------------------------------------------------------------ Rapport --- */

if (failures.length) {
  failures.forEach(({ name, error }) => {
    console.error("✗ " + name + "\n  " + error.message);
  });
  console.error("\n" + passed + " test(s) OK, " + failures.length + " en échec.");
  process.exit(1);
}
console.log("✓ " + passed + " test(s) OK.");
