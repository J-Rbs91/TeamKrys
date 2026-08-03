/* BrainstO. — scan de compatibilité navigateurs mobiles.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/qa/compat-scan.js
 *     node tests/qa/compat-scan.js --json          rapport machine (agents QA)
 *     node tests/qa/compat-scan.js --tier=A        n'échouer que sur le tier A
 *     node tests/qa/compat-scan.js --browser=safari-ios
 *     node tests/qa/compat-scan.js --list          matrice des navigateurs
 *
 * Le scan croise les fonctions web réellement présentes dans les sources avec
 * la baseline hors ligne (feature-baseline.json) et la matrice des navigateurs
 * visés (browser-matrix.json). Il répond à une seule question : « quelle ligne
 * de ce dépôt casse sur quel navigateur, et est-ce gardé ? »
 *
 * Ce qu'il ne fait PAS, et ne fera jamais : ouvrir un navigateur. Le rendu, le
 * tactile, le clavier virtuel, l'installation, l'éviction du stockage et les
 * fenêtres in-app se vérifient sur appareil — voir docs/QA_NAVIGATEURS.md et
 * les agents .claude/agents/qa-*.md.
 *
 * Faux positif : ajouter « qa-allow: <id-de-fonction> — raison » en commentaire
 * sur la ligne concernée ou sur la ligne précédente.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const HERE = __dirname;

const MATRIX = JSON.parse(fs.readFileSync(path.join(HERE, "browser-matrix.json"), "utf8"));
const BASELINE = JSON.parse(fs.readFileSync(path.join(HERE, "feature-baseline.json"), "utf8"));

/* Sources analysées. Le backend (Apps Script) et les tests n'en font pas
 * partie : ils ne s'exécutent jamais dans un navigateur. */
const SOURCES = [
  "index.html",
  "css/app.css",
  "js/config.js",
  "js/utils.js",
  "js/state.js",
  "js/database.js",
  "js/api.js",
  "js/sync.js",
  "js/ui.js",
  "js/app.js",
  "service-worker.js"
];

const ENGINE_KEY = { webkit: "webkit", blink: "chromium", gecko: "firefox" };

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const TIER_RANK = { A: 4, B: 3, C: 2, D: 1 };

/* ------------------------------------------------------------- Options --- */

const argv = process.argv.slice(2);
const options = {
  json: argv.includes("--json"),
  list: argv.includes("--list"),
  quiet: argv.includes("--quiet"),
  tier: (argv.find((a) => a.startsWith("--tier=")) || "--tier=B").split("=")[1].toUpperCase(),
  browser: (argv.find((a) => a.startsWith("--browser=")) || "").split("=")[1] || null
};

const color = process.stdout.isTTY && !options.json
  ? {
    red: (s) => "[31m" + s + "[0m",
    yellow: (s) => "[33m" + s + "[0m",
    green: (s) => "[32m" + s + "[0m",
    dim: (s) => "[2m" + s + "[0m",
    bold: (s) => "[1m" + s + "[0m"
  }
  : { red: (s) => s, yellow: (s) => s, green: (s) => s, dim: (s) => s, bold: (s) => s };

/* ------------------------------------------------------------ Versions --- */

function parseVersion(value) {
  return String(value).split(".").map((part) => parseInt(part, 10) || 0);
}

/* -1 si a < b, 0 si égales, 1 si a > b. */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l !== r) { return l < r ? -1 : 1; }
  }
  return 0;
}

/* --------------------------------------------------------- Lecture des --- */

/* Neutralise les commentaires en préservant la numérotation des lignes, pour
 * qu'un exemple cité dans un commentaire ne soit pas compté comme un usage. */
function stripComments(source, kind) {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  if (kind === "js") {
    out = out.replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));
  }
  if (kind === "html") {
    out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  }
  return out;
}

function kindOf(file) {
  if (file.endsWith(".css")) { return "css"; }
  if (file.endsWith(".js")) { return "js"; }
  if (file.endsWith(".html")) { return "html"; }
  return "other";
}

/* Un fichier HTML porte aussi du CSS et du JS en ligne : on garde les mêmes
 * numéros de ligne en blanchissant tout ce qui est hors de la balise voulue. */
function inlineOf(source, tag) {
  const pattern = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "gi");
  const kept = [];
  let match = pattern.exec(source);
  while (match) {
    kept.push({ start: match.index + match[0].indexOf(">") + 1, end: match.index + match[0].length - (tag.length + 3) });
    match = pattern.exec(source);
  }
  if (!kept.length) { return null; }
  return source
    .split("")
    .map((char, index) => {
      if (char === "\n") { return char; }
      return kept.some((zone) => index >= zone.start && index < zone.end) ? char : " ";
    })
    .join("");
}

function readSources() {
  const files = [];
  SOURCES.forEach((relative) => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) { return; }
    const raw = fs.readFileSync(absolute, "utf8");
    const kind = kindOf(relative);
    const views = [{ kind: kind, text: stripComments(raw, kind) }];
    if (kind === "html") {
      const css = inlineOf(raw, "style");
      const js = inlineOf(raw, "script");
      if (css) { views.push({ kind: "css", text: stripComments(css, "css") }); }
      if (js) { views.push({ kind: "js", text: stripComments(js, "js") }); }
    }
    files.push({ file: relative, raw: raw, views: views });
  });
  return files;
}

/* ------------------------------------------------------------ Détection --- */

function isAllowed(lines, index, featureId) {
  const window = [lines[index] || "", lines[index - 1] || ""].join("\n");
  return new RegExp("qa-allow\\s*:\\s*" + featureId.replace(/[-]/g, "\\-")).test(window);
}

function detect(files) {
  const hits = [];
  BASELINE.features.forEach((feature) => {
    const patterns = feature.detect.map((source) => new RegExp(source));
    files.forEach((entry) => {
      entry.views
        .filter((view) => view.kind === feature.kind)
        .forEach((view) => {
          const lines = view.text.split("\n");
          lines.forEach((line, index) => {
            if (!patterns.some((pattern) => pattern.test(line))) { return; }
            if (isAllowed(entry.raw.split("\n"), index, feature.id)) { return; }
            hits.push({
              feature: feature.id,
              file: entry.file,
              line: index + 1,
              snippet: line.trim().slice(0, 96)
            });
          });
        });
    });
  });
  return hits;
}

/* Ordre des replis. Deux déclarations consécutives de la même propriété = un
 * repli. Il n'est correct que si la valeur ancienne vient EN PREMIER : sinon
 * elle écrase la valeur récente sur les moteurs qui, eux, la comprennent. */
function detectFallbackOrder(files) {
  const rules = (BASELINE.fallback_rules && BASELINE.fallback_rules.modern_values) || [];
  if (!rules.length) { return []; }
  const compiled = rules.map((rule) => ({ id: rule.id, label: rule.label, pattern: new RegExp(rule.pattern) }));
  const property = /^\s*([-a-z]+)\s*:\s*([^;]+);/;
  const inverted = [];

  files.forEach((entry) => {
    entry.views
      .filter((view) => view.kind === "css")
      .forEach((view) => {
        const lines = view.text.split("\n");
        lines.forEach((line, index) => {
          const current = property.exec(line);
          const next = property.exec(lines[index + 1] || "");
          if (!current || !next || current[1] !== next[1]) { return; }
          compiled.forEach((rule) => {
            if (rule.pattern.test(current[2]) && !rule.pattern.test(next[2])) {
              inverted.push({
                rule: rule.id,
                label: rule.label,
                property: current[1],
                file: entry.file,
                line: index + 1,
                modern: current[0].trim(),
                legacy: next[0].trim()
              });
            }
          });
        });
      });
  });
  return inverted;
}

/* Zoom automatique de WebKit. Sur iOS, donner le focus à un champ dont la
 * taille de texte est inférieure à 16 px déclenche un zoom de toute la page,
 * qui ne se défait pas tout seul. C'est le défaut mobile le plus fréquent et
 * le moins visible en développement : sur simulateur de bureau, il n'existe
 * pas. */
const FIELD_SELECTOR = /(?:^|[\s,>+~])(?:input|textarea|select)\b|\.(?:input|textarea|select|field|composer)/i;

function resolveCustomProperties(css) {
  const values = new Map();
  const declaration = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match = declaration.exec(css);
  while (match) {
    values.set("--" + match[1], match[2].trim());
    match = declaration.exec(css);
  }
  return values;
}

function toPixels(value, variables, depth) {
  const raw = String(value).trim();
  if (depth > 3) { return null; }
  const variable = /^var\(\s*(--[\w-]+)/.exec(raw);
  if (variable) {
    const resolved = variables.get(variable[1]);
    return resolved ? toPixels(resolved, variables, depth + 1) : null;
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(raw);
  if (px) { return parseFloat(px[1]); }
  const rem = /^(\d+(?:\.\d+)?)rem$/.exec(raw);
  if (rem) { return parseFloat(rem[1]) * 16; }
  /* clamp() / calc() : la borne basse fait foi, c'est elle qui déclenche le zoom. */
  const clamp = /^clamp\(\s*(\d+(?:\.\d+)?)(px|rem)/.exec(raw);
  if (clamp) { return parseFloat(clamp[1]) * (clamp[2] === "rem" ? 16 : 1); }
  return null;
}

function detectIosInputZoom(files) {
  const issues = [];
  files.forEach((entry) => {
    entry.views
      .filter((view) => view.kind === "css")
      .forEach((view) => {
        const variables = resolveCustomProperties(view.text);
        const lines = view.text.split("\n");
        let selector = "";
        lines.forEach((line, index) => {
          const opening = /^([^{}]+)\{/.exec(line);
          if (opening) { selector = opening[1].trim(); }
          if (/^\s*}/.test(line)) { selector = ""; }
          const size = /font-size\s*:\s*([^;}]+)[;}]/.exec(line);
          if (!size || !selector || !FIELD_SELECTOR.test(selector)) { return; }
          const pixels = toPixels(size[1], variables, 0);
          if (pixels === null || pixels >= 16) { return; }
          issues.push({
            selector: selector,
            file: entry.file,
            line: index + 1,
            value: size[1].trim(),
            pixels: pixels
          });
        });
      });
  });
  return issues;
}

function findGuards(files) {
  const whole = files.map((entry) => entry.raw).join("\n");
  const guarded = new Set();
  BASELINE.features.forEach((feature) => {
    if (!feature.guard) { return; }
    if (feature.guard.some((source) => new RegExp(source).test(whole))) {
      guarded.add(feature.id);
    }
  });
  return guarded;
}

/* ------------------------------------------------------------ Analyse ----- */

function targetVersion(browser) {
  if (browser.engine === "blink") { return browser.chromium_equivalent || browser.target_floor; }
  return browser.target_floor;
}

/* Statut d'une fonction sur un navigateur : ok, missing, unsupported,
 * not-evaluable (moteur distant ou figé : la version ne veut rien dire). */
function statusFor(feature, browser) {
  const key = ENGINE_KEY[browser.engine];
  if (!key) { return "not-evaluable"; }
  const support = feature.support[key];
  if (support === false) { return "unsupported"; }
  if (support === true) { return "ok"; }
  const floor = targetVersion(browser);
  if (!floor) { return "not-evaluable"; }
  return compareVersions(floor, support) >= 0 ? "ok" : "missing";
}

/* Gravité intrinsèque, puis plafonnement par le meilleur tier touché : un
 * défaut qui n'existe que sur un navigateur de tier C ne bloque pas une
 * publication, il se documente. */
function classify(feature, guarded, worstTier) {
  let level;
  if (guarded) {
    level = "degraded";
  } else if (feature.failure === "syntax" || feature.failure === "throws") {
    level = "blocking";
  } else if (SEVERITY_RANK[feature.severity] >= 3) {
    level = "blocking";
  } else if (SEVERITY_RANK[feature.severity] === 2) {
    level = "warning";
  } else {
    level = "note";
  }
  if (TIER_RANK[worstTier] <= TIER_RANK.D) { return "note"; }
  if (TIER_RANK[worstTier] <= TIER_RANK.C && level === "blocking") { return "warning"; }
  return level;
}

function analyse() {
  const files = readSources();
  const hits = detect(files);
  const guards = findGuards(files);
  const inverted = detectFallbackOrder(files);

  /* Un repli écrit à l'envers n'est pas un repli : il ne protège rien et
   * neutralise la valeur moderne. La fonction repasse donc non gardée. */
  inverted.forEach((issue) => { guards.delete("css-" + issue.rule); });

  const browsers = MATRIX.browsers.filter((b) => (options.browser ? b.id === options.browser : true));
  const byFeature = new Map();
  hits.forEach((hit) => {
    if (!byFeature.has(hit.feature)) { byFeature.set(hit.feature, []); }
    byFeature.get(hit.feature).push(hit);
  });

  const findings = [];
  const perBrowser = browsers.map((browser) => ({ browser: browser, missing: [] }));

  byFeature.forEach((occurrences, featureId) => {
    const feature = BASELINE.features.find((f) => f.id === featureId);
    const guarded = guards.has(featureId);
    const affected = [];
    perBrowser.forEach((row) => {
      const status = statusFor(feature, row.browser);
      /* Une propriété propre à un moteur est absente ailleurs par nature :
       * ce n'est pas un défaut de compatibilité. */
      if (status === "unsupported" && feature.ignore_unsupported) { return; }
      if (status === "missing" || status === "unsupported") {
        affected.push({ id: row.browser.id, name: row.browser.name, tier: row.browser.tier, status: status });
        row.missing.push(featureId);
      }
    });
    if (!affected.length) { return; }
    const worstTier = affected.reduce((best, b) => (TIER_RANK[b.tier] > TIER_RANK[best] ? b.tier : best), "D");
    findings.push({
      feature: featureId,
      label: feature.label,
      severity: feature.severity,
      failure: feature.failure,
      guarded: guarded,
      verify: Boolean(feature.verify),
      impact: feature.impact || "",
      level: classify(feature, guarded, worstTier),
      worst_tier: worstTier,
      browsers: affected,
      occurrences: occurrences
    });
  });

  const order = { blocking: 0, warning: 1, degraded: 2, note: 3 };
  findings.sort((a, b) => {
    if (order[a.level] !== order[b.level]) { return order[a.level] - order[b.level]; }
    if (TIER_RANK[b.worst_tier] !== TIER_RANK[a.worst_tier]) { return TIER_RANK[b.worst_tier] - TIER_RANK[a.worst_tier]; }
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });

  return {
    files: files.map((f) => f.file),
    hits: hits,
    findings: findings,
    inverted: inverted,
    zoom: detectIosInputZoom(files),
    perBrowser: perBrowser
  };
}

/* ------------------------------------------------------------- Rapport ---- */

function levelLabel(level) {
  if (level === "blocking") { return color.red("BLOQUANT "); }
  if (level === "warning") { return color.yellow("À VÉRIFIER"); }
  if (level === "degraded") { return color.dim("DÉGRADÉ  "); }
  return color.dim("INFO     ");
}

function printReport(result) {
  const { files, hits, findings, inverted, zoom, perBrowser } = result;

  console.log(color.bold("\nBrainstO. — compatibilité navigateurs mobiles"));
  console.log(color.dim("baseline " + BASELINE.version + " du " + BASELINE.updated
    + " · matrice " + MATRIX.version + " · " + files.length + " fichiers · " + hits.length + " usages détectés"));

  if (!findings.length) {
    console.log(color.green("\n✓ Aucune fonction hors baseline sur les navigateurs de la matrice.\n"));
  } else {
    console.log("");
    findings.forEach((finding) => {
      const tiers = finding.browsers.filter((b) => b.tier === "A" || b.tier === "B");
      console.log(levelLabel(finding.level) + "  " + color.bold(finding.label)
        + color.dim("  [" + finding.feature + " · " + finding.failure + "]")
        + (finding.guarded ? color.dim(" · repli détecté") : "")
        + (finding.verify ? color.dim(" · version à confirmer") : ""));
      finding.occurrences.slice(0, 4).forEach((hit) => {
        console.log("            " + color.dim(hit.file + ":" + hit.line + "  " + hit.snippet));
      });
      if (finding.occurrences.length > 4) {
        console.log("            " + color.dim("… et " + (finding.occurrences.length - 4) + " autres"));
      }
      console.log("            manque sur : " + finding.browsers.map((b) => b.name + " (" + b.tier + ")").join(", "));
      if (finding.impact && (finding.level === "blocking" || finding.level === "warning")) {
        console.log("            " + color.dim("→ " + finding.impact));
      }
      if (tiers.length && finding.level === "blocking") {
        console.log("            " + color.red("→ tier A/B touché : correction due avant publication."));
      }
      console.log("");
    });
  }

  if (inverted.length) {
    console.log(color.bold("Replis écrits à l'envers") + color.dim(" — la valeur ancienne doit précéder la récente\n"));
    inverted.forEach((issue) => {
      console.log(color.red("BLOQUANT ") + "  " + color.bold(issue.property) + color.dim("  [" + issue.label + "]"));
      console.log("            " + color.dim(issue.file + ":" + issue.line + "  " + issue.modern));
      console.log("            " + color.dim(issue.file + ":" + (issue.line + 1) + "  " + issue.legacy + "  ← écrase la ligne du dessus"));
      console.log("            → sur un moteur récent, les deux déclarations sont valides et c'est la"
        + " seconde qui gagne :\n              " + issue.label + " n'a donc d'effet nulle part. Inverser les deux lignes.\n");
    });
  }

  if (zoom.length) {
    console.log(color.bold("Zoom automatique au focus (WebKit)") + color.dim(" — champ sous 16 px\n"));
    zoom.forEach((issue) => {
      console.log(color.red("BLOQUANT ") + "  " + color.bold(issue.selector)
        + color.dim("  [" + issue.value + " ≈ " + issue.pixels + "px]"));
      console.log("            " + color.dim(issue.file + ":" + issue.line));
      console.log("            → sur iOS, le focus zoome toute la page et le zoom ne se défait pas au"
        + "\n              retour : la barre du haut sort de l'écran. Passer à 16px minimum.\n");
    });
  }

  console.log(color.bold("Couverture par navigateur"));
  const groups = { A: [], B: [], C: [], D: [] };
  perBrowser.forEach((row) => { groups[row.browser.tier].push(row); });
  ["A", "B", "C", "D"].forEach((tier) => {
    if (!groups[tier].length) { return; }
    console.log(color.dim("  tier " + tier + " — " + MATRIX.tiers[tier]));
    groups[tier].forEach((row) => {
      const version = targetVersion(row.browser);
      const label = "    " + row.browser.name + (version ? " " + version + "+" : "");
      if (!ENGINE_KEY[row.browser.engine]) {
        console.log(label + color.dim(" — moteur distant ou figé : contrôle manuel (agent " + row.browser.agent + ")"));
      } else if (!row.missing.length) {
        console.log(label + " " + color.green("✓"));
      } else {
        console.log(label + " " + color.red("✗ " + row.missing.length + " fonction(s) hors baseline")
          + color.dim(" : " + row.missing.join(", ")));
      }
    });
  });

  console.log(color.dim("\nCe scan ne remplace pas la recette sur appareil : rendu, tactile, clavier"));
  console.log(color.dim("virtuel, installation, éviction du stockage et fenêtres in-app ne sont pas"));
  console.log(color.dim("observables ici. Voir docs/QA_NAVIGATEURS.md et .claude/agents/qa-*.md.\n"));
}

function printList() {
  console.log(color.bold("\nMatrice des navigateurs — " + MATRIX.browsers.length + " navigateurs, "
    + MATRIX.webviews.length + " familles de fenêtres in-app\n"));
  ["A", "B", "C", "D"].forEach((tier) => {
    const rows = MATRIX.browsers.filter((b) => b.tier === tier);
    if (!rows.length) { return; }
    console.log(color.bold("  Tier " + tier) + color.dim(" — " + MATRIX.tiers[tier]));
    rows.forEach((b) => {
      const version = targetVersion(b);
      console.log("    " + (b.name + (version ? " " + version + "+" : "")).padEnd(46)
        + color.dim(MATRIX.engines[b.engine].label + " · " + b.agent));
    });
    console.log("");
  });
  MATRIX.webviews.forEach((w) => {
    console.log("  " + ("[in-app] " + w.name).padEnd(50) + color.dim("tier " + w.tier + " · " + w.agent));
  });
  console.log("");
}

/* ------------------------------------------------------------ Exécution --- */

if (options.list) {
  printList();
  process.exit(0);
}

const result = analyse();

if (options.json) {
  console.log(JSON.stringify({
    baseline_version: BASELINE.version,
    matrix_version: MATRIX.version,
    scanned: result.files,
    detections: result.hits.length,
    findings: result.findings,
    fallback_order_issues: result.inverted,
    ios_input_zoom_issues: result.zoom,
    coverage: result.perBrowser.map((row) => ({
      id: row.browser.id,
      name: row.browser.name,
      tier: row.browser.tier,
      engine: row.browser.engine,
      target: targetVersion(row.browser),
      agent: row.browser.agent,
      evaluable: Boolean(ENGINE_KEY[row.browser.engine]),
      missing: row.missing
    }))
  }, null, 2));
} else if (!options.quiet) {
  printReport(result);
}

const failingTier = TIER_RANK[options.tier] || TIER_RANK.B;
const blockers = result.findings.filter((finding) =>
  finding.level === "blocking" && finding.browsers.some((b) => TIER_RANK[b.tier] >= failingTier));
const total = blockers.length + result.inverted.length + result.zoom.length;

if (total) {
  if (!options.json && !options.quiet) {
    console.error(color.red("✗ " + total + " problème(s) bloquant(s) au tier " + options.tier + " ou supérieur.")
      + color.dim("\n  Corriger, ou justifier par « qa-allow: <id> — raison » sur la ligne concernée.\n"));
  }
  process.exit(1);
}

if (!options.json && !options.quiet) {
  console.log(color.green("✓ Rien de bloquant au tier " + options.tier + " ou supérieur.\n"));
}
