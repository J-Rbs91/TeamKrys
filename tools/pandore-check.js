#!/usr/bin/env node
/* BrainstO. — contrôle de ce que l'IA publie pour Pandore.
 *
 *     node tools/pandore-check.js
 *     node tools/pandore-check.js --en-attente     dépôts que la synthèse courante ne couvre pas
 *
 * Vérifie pandore/synthese.json (lu par l'application), tout .md de pandore/, les dépôts et leur registre. L'IA lance
 * ce contrôle avant chaque commit (voir .claude/skills/pandore/SKILL.md), et la CI le relance.
 *
 * La synthèse automatique courante couvre les dépôts présents :
 *   - tant que Pandore n'est pas remise à zéro (`remiseAZero` vide), chaque référence citée est dans pandore/depots/ ;
 *   - après remise à zéro, chaque référence citée a quitté pandore/depots/ mais reste au registre (references.txt).
 * Une référence absente des deux est une source inventée.
 *
 * Le classement (`classement`, `categorie` de chaque point) est libre : l'IA choisit l'axe le plus pertinent. Le
 * contrôle n'en vérifie que la forme.
 *
 * ⚠️ Ces fichiers sont servis par GitHub Pages (Jekyll) sur le domaine de l'application, et les .md y deviennent
 * des pages. D'où trois refus dans tout .md de pandore/ : le HTML, les balises Liquid (`{{`, `{%`, qui peuvent faire
 * échouer la publication du site entier) et les attributs kramdown (`{:`), les liens vers autre chose que http(s).
 * L'application, elle, n'affiche la synthèse que comme du texte. */
"use strict";

const fs = require("fs");
const path = require("path");
const collect = require("./pandore-collect.js");

const ROOT = path.join(__dirname, "..");
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const REF_RX = /^[0-9a-f]{6,64}$/;
const ID_RX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HTML_RX = /<\s*[a-zA-Z!/?]/;
const LIQUID_RX = /\{[{%:]/;
/* Cible de lien qui n'est ni http(s) ni relative : `[x](javascript:…)`, `[x]: data:…`. */
const LINK_RX = /(\]\s*\(\s*<?|^\s*\[[^\]]+\]:\s*<?)\s*(?!https?:)[a-z][a-z0-9+.-]*:/im;
const REF_COMMENT_RX = /<!-- ref: [0-9a-f]{6,64} -->/g;
const LIMITS = { titre: 120, texte: 1500, categorie: 40, classement: 60, resume: 1500 };
/* Seuls motifs pour écarter un dépôt. Ni « hors sujet », ni « irréaliste », ni « trop critique » : l'IA synthétise,
 * elle ne trie pas. Une plainte contre l'encadrement n'est jamais écartée : elle est synthétisée sans nommer. */
const SET_ASIDE = ["personne-visee", "donnees-personnelles", "inexploitable"];
const FILE = "synthese.json";

function textField(fail, where, value, key, required) {
  if (value === undefined || value === "") {
    if (required) { fail(where + " : « " + key + " » est obligatoire."); }
    return;
  }
  if (typeof value !== "string" || (required && !value.trim())) { fail(where + " : « " + key + " » doit être un texte."); return; }
  if (value.length > LIMITS[key]) { fail(where + " : « " + key + " » dépasse " + LIMITS[key] + " caractères."); }
  if (HTML_RX.test(value)) { fail(where + " : « " + key + " » contient du HTML (« < » interdit)."); }
}

function checkSynthesis(data) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  if (!data || typeof data !== "object" || Array.isArray(data)) { return [FILE + " : un objet est attendu."]; }
  if (data.version !== 1) { fail(FILE + " : « version » doit valoir 1."); }
  const day = data.date === undefined ? "" : data.date;
  if (day !== "" && !DAY_RX.test(String(day))) { fail(FILE + " : « date » doit être une date AAAA-MM-JJ (ou vide)."); }
  const reset = data.remiseAZero === undefined ? "" : data.remiseAZero;
  if (reset !== "" && !DAY_RX.test(String(reset))) { fail(FILE + " : « remiseAZero » doit être une date AAAA-MM-JJ (ou vide)."); }
  if (reset && (!day || reset < day)) { fail(FILE + " : « remiseAZero » ne peut précéder la synthèse (« date »)."); }
  textField(fail, FILE, data.classement, "classement", false);
  textField(fail, FILE, data.resume, "resume", false);
  if (!Array.isArray(data.points)) { fail(FILE + " : « points » doit être une liste."); return errors; }
  const seen = new Set();
  data.points.forEach((point, i) => {
    const where = "point #" + (i + 1) + (point && point.id ? " (" + point.id + ")" : "");
    if (!point || typeof point !== "object") { fail(where + " : un objet est attendu."); return; }
    if (!ID_RX.test(String(point.id || ""))) { fail(where + " : « id » en minuscules, chiffres et tirets."); }
    if (seen.has(point.id)) { fail(where + " : « id » en double."); }
    seen.add(point.id);
    textField(fail, where, point.titre, "titre", true);
    textField(fail, where, point.texte, "texte", true);
    textField(fail, where, point.categorie, "categorie", false);
    if (!Array.isArray(point.sources) || !point.sources.length || !point.sources.every((r) => REF_RX.test(String(r)))) {
      fail(where + " : « sources » doit lister les références des dépôts synthétisés.");
    }
  });
  if (data.ecartes !== undefined) {
    if (!Array.isArray(data.ecartes)) { fail(FILE + " : « ecartes » doit être une liste."); return errors; }
    data.ecartes.forEach((e, i) => {
      const where = "écarté #" + (i + 1);
      if (!e || !REF_RX.test(String(e.ref || ""))) { fail(where + " : « ref » d'un dépôt attendue."); return; }
      if (SET_ASIDE.indexOf(e.motif) < 0) { fail(where + " (" + e.ref + ") : « motif » parmi " + SET_ASIDE.join(", ") + "."); }
      if (data.points.some((p) => p && Array.isArray(p.sources) && p.sources.indexOf(e.ref) >= 0)) {
        fail(where + " (" + e.ref + ") : à la fois écarté et source d'un point de la synthèse.");
      }
    });
  }
  if ((data.points.length || (Array.isArray(data.ecartes) && data.ecartes.length)) && !day) {
    fail(FILE + " : une synthèse non vide porte sa « date ».");
  }
  return errors;
}

/* Références publiées par la collecte, et le fichier qui porte chacune. */
function boxRefs(dir) {
  const refs = new Map();
  if (!fs.existsSync(dir)) { return refs; }
  fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().forEach((file) => {
    collect.parseBox(fs.readFileSync(path.join(dir, file), "utf8")).blocks.forEach((b) => refs.set(b.ref, file));
  });
  return refs;
}

/* Dépôts ni synthétisés ni écartés : le travail de la prochaine synthèse. */
function pending(data, refs) {
  const done = new Set();
  (Array.isArray(data && data.points) ? data.points : []).forEach((p) => (p && Array.isArray(p.sources) ? p.sources : []).forEach((r) => done.add(r)));
  (Array.isArray(data && data.ecartes) ? data.ecartes : []).forEach((e) => e && done.add(e.ref));
  return [...refs.keys()].filter((r) => !done.has(r));
}

/* Un .md publié depuis pandore/. `refComments` : seuls les fichiers de dépôts portent des commentaires de référence. */
function checkMarkdown(label, text, refComments) {
  const body = refComments ? text.replace(REF_COMMENT_RX, "") : text;
  const errors = [];
  if (HTML_RX.test(body)) { errors.push(label + " : HTML interdit (« < » suivi d'une lettre)."); }
  if (LIQUID_RX.test(body)) { errors.push(label + " : « {{ », « {% » ou « {: » interdits (Jekyll les interprète)."); }
  if (LINK_RX.test(body)) { errors.push(label + " : lien interdit (seuls http, https et les liens relatifs)."); }
  return errors;
}

function checkPage(name, text) { return checkMarkdown(name, text, false); }
function checkBox(name, text) { return checkMarkdown("depots/" + name, text, true); }

/* Tout .md sous pandore/, à n'importe quelle profondeur : un fichier ajouté ailleurs que prévu est contrôlé aussi. */
function markdownFiles(dir, rel) {
  if (!fs.existsSync(dir)) { return []; }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = rel ? rel + "/" + entry.name : entry.name;
    if (entry.isDirectory()) { return markdownFiles(path.join(dir, entry.name), name); }
    return entry.name.endsWith(".md") ? [name] : [];
  });
}

function run(root) {
  const dir = path.join(root || ROOT, "pandore");
  let errors = [];
  const file = path.join(dir, FILE);
  if (!fs.existsSync(file)) { return ["pandore/" + FILE + " absent."]; }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return ["pandore/" + FILE + " : JSON illisible (" + e.message + ")."]; }
  errors = errors.concat(checkSynthesis(data));
  const refs = boxRefs(path.join(dir, "depots"));
  const registry = new Set(collect.registryRefs(path.join(dir, "references.txt")));
  refs.forEach((name, r) => {
    if (!registry.has(r)) { errors.push("depots/" + name + " : référence " + r + " absente du registre pandore/references.txt."); }
  });
  const cited = [].concat(...(Array.isArray(data.points) ? data.points : []).map((p) => (p && Array.isArray(p.sources) ? p.sources : [])),
    (Array.isArray(data.ecartes) ? data.ecartes : []).map((e) => e && e.ref)).filter((r) => REF_RX.test(String(r)));
  if (data.remiseAZero) {
    cited.filter((r) => !registry.has(r)).forEach((r) => {
      errors.push(FILE + " : référence " + r + " absente du registre (source inventée ?).");
    });
    cited.filter((r) => refs.has(r)).forEach((r) => {
      errors.push("remise à zéro incomplète : " + r + " est synthétisé ou écarté, mais encore dans pandore/depots/" + refs.get(r) + ".");
    });
  } else {
    cited.filter((r) => !refs.has(r)).forEach((r) => {
      errors.push(FILE + " : référence " + r + " absente de pandore/depots/ (source inventée, ou dépôt d'avant la dernière remise à zéro ?).");
    });
  }
  markdownFiles(dir, "").forEach((name) => {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    errors = errors.concat(name.indexOf("depots/") === 0 ? checkBox(name.slice(7), text) : checkPage(name, text));
  });
  return errors;
}

module.exports = { checkSynthesis, checkPage, checkBox, boxRefs, pending, run, SET_ASIDE };

if (require.main === module) {
  if (process.argv.includes("--en-attente")) {
    const dir = path.join(ROOT, "pandore");
    const refs = boxRefs(path.join(dir, "depots"));
    let data = {};
    try { data = JSON.parse(fs.readFileSync(path.join(dir, FILE), "utf8")); } catch (e) { data = {}; }
    const todo = pending(data, refs);
    todo.forEach((r) => console.log(r + "  pandore/depots/" + refs.get(r)));
    console.log(todo.length + " dépôt(s) en attente de synthèse.");
    if (data.remiseAZero) {
      console.log("Remise à zéro le " + data.remiseAZero + " : la prochaine synthèse REMPLACE celle qui est affichée, à partir de ces seuls dépôts.");
    }
    process.exit(0);
  }
  const errors = run();
  if (errors.length) {
    errors.forEach((e) => console.error("✗ " + e));
    process.exit(1);
  }
  console.log("✓ Pandore : format conforme.");
}
