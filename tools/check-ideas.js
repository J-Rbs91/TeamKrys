#!/usr/bin/env node
/* BrainstO. — contrôle de ce que l'IA publie pour la boîte à idées.
 *
 *     node tools/check-ideas.js
 *
 * Vérifie idees/reformulees.json (lu par l'application) et idees/rapports/*.md. L'IA lance ce contrôle avant
 * chaque commit (voir .claude/skills/boite-a-idees/SKILL.md), et la CI le relance.
 *
 * ⚠️ Ces fichiers sont servis par GitHub Pages (Jekyll) sur le domaine de l'application, et les .md y deviennent
 * des pages. D'où trois refus dans tout .md de idees/ : le HTML, les balises Liquid (`{{`, `{%`, qui peuvent faire
 * échouer la publication du site entier) et les attributs kramdown (`{:`), les liens vers autre chose que http(s).
 * L'application, elle, n'affiche les idées reformulées que comme du texte. */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const REF_RX = /^[0-9a-f]{6,64}$/;
const ID_RX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HTML_RX = /<\s*[a-zA-Z!/?]/;
const LIQUID_RX = /\{[{%:]/;
/* Cible de lien qui n'est ni http(s) ni relative : `[x](javascript:…)`, `[x]: data:…`. */
const LINK_RX = /(\]\s*\(\s*<?|^\s*\[[^\]]+\]:\s*<?)\s*(?!https?:)[a-z][a-z0-9+.-]*:/im;
const REF_COMMENT_RX = /<!-- ref: [0-9a-f]{6,64} -->/g;
const LIMITS = { titre: 120, texte: 1500, theme: 40 };
/* Seuls motifs pour écarter une idée brute. Ni « hors sujet » ni « irréaliste » : l'IA reformule, elle ne trie pas. */
const SET_ASIDE = ["personne-visee", "donnees-personnelles", "inexploitable"];

function checkReformulated(data) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  if (!data || typeof data !== "object" || Array.isArray(data)) { return ["reformulees.json : un objet est attendu."]; }
  if (data.version !== 1) { fail("reformulees.json : « version » doit valoir 1."); }
  if (data.misAJour !== "" && !DAY_RX.test(String(data.misAJour))) { fail("reformulees.json : « misAJour » doit être une date AAAA-MM-JJ (ou vide)."); }
  if (!Array.isArray(data.idees)) { fail("reformulees.json : « idees » doit être une liste."); return errors; }
  const seen = new Set();
  data.idees.forEach((idea, i) => {
    const where = "idée #" + (i + 1) + (idea && idea.id ? " (" + idea.id + ")" : "");
    if (!idea || typeof idea !== "object") { fail(where + " : un objet est attendu."); return; }
    if (!ID_RX.test(String(idea.id || ""))) { fail(where + " : « id » en minuscules, chiffres et tirets."); }
    if (seen.has(idea.id)) { fail(where + " : « id » en double."); }
    seen.add(idea.id);
    ["titre", "texte"].forEach((k) => {
      if (typeof idea[k] !== "string" || !idea[k].trim()) { fail(where + " : « " + k + " » est obligatoire."); }
    });
    ["titre", "texte", "theme"].forEach((k) => {
      if (idea[k] === undefined) { return; }
      if (typeof idea[k] !== "string") { fail(where + " : « " + k + " » doit être un texte."); return; }
      if (idea[k].length > LIMITS[k]) { fail(where + " : « " + k + " » dépasse " + LIMITS[k] + " caractères."); }
      if (HTML_RX.test(idea[k])) { fail(where + " : « " + k + " » contient du HTML (« < » interdit)."); }
    });
    if (!DAY_RX.test(String(idea.date || ""))) { fail(where + " : « date » AAAA-MM-JJ obligatoire."); }
    if (!Array.isArray(idea.sources) || !idea.sources.length || !idea.sources.every((r) => REF_RX.test(String(r)))) {
      fail(where + " : « sources » doit lister les références des idées brutes reformulées.");
    }
  });
  if (data.ecartees !== undefined) {
    if (!Array.isArray(data.ecartees)) { fail("reformulees.json : « ecartees » doit être une liste."); return errors; }
    data.ecartees.forEach((e, i) => {
      const where = "écartée #" + (i + 1);
      if (!e || !REF_RX.test(String(e.ref || ""))) { fail(where + " : « ref » d'une idée brute attendue."); return; }
      if (SET_ASIDE.indexOf(e.motif) < 0) { fail(where + " (" + e.ref + ") : « motif » parmi " + SET_ASIDE.join(", ") + "."); }
      if (data.idees.some((idea) => idea && Array.isArray(idea.sources) && idea.sources.indexOf(e.ref) >= 0)) {
        fail(where + " (" + e.ref + ") : à la fois écartée et source d'une idée reformulée.");
      }
    });
  }
  return errors;
}

/* Références publiées par la collecte, et le fichier qui porte chacune. */
function boxRefs(dir) {
  const refs = new Map();
  if (!fs.existsSync(dir)) { return refs; }
  fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().forEach((file) => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    (text.match(REF_COMMENT_RX) || []).forEach((c) => refs.set(c.slice(10, -4), file));
  });
  return refs;
}

/* Idées brutes ni reformulées ni écartées : le travail de la prochaine reformulation. */
function pending(data, refs) {
  const done = new Set();
  (Array.isArray(data && data.idees) ? data.idees : []).forEach((i) => (i && Array.isArray(i.sources) ? i.sources : []).forEach((r) => done.add(r)));
  (Array.isArray(data && data.ecartees) ? data.ecartees : []).forEach((e) => e && done.add(e.ref));
  return [...refs.keys()].filter((r) => !done.has(r));
}

/* Un .md publié depuis idees/. `refComments` : la boîte porte, seule, des commentaires de référence posés par la collecte. */
function checkMarkdown(label, text, refComments) {
  const body = refComments ? text.replace(REF_COMMENT_RX, "") : text;
  const errors = [];
  if (HTML_RX.test(body)) { errors.push(label + " : HTML interdit (« < » suivi d'une lettre)."); }
  if (LIQUID_RX.test(body)) { errors.push(label + " : « {{ », « {% » ou « {: » interdits (Jekyll les interprète)."); }
  if (LINK_RX.test(body)) { errors.push(label + " : lien interdit (seuls http, https et les liens relatifs)."); }
  return errors;
}

function checkReport(name, text) { return checkMarkdown("rapports/" + name, text, false); }
function checkBox(name, text) { return checkMarkdown("boite/" + name, text, true); }

function run(root) {
  const dir = path.join(root || ROOT, "idees");
  let errors = [];
  const file = path.join(dir, "reformulees.json");
  if (!fs.existsSync(file)) { return ["idees/reformulees.json absent."]; }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return ["idees/reformulees.json : JSON illisible (" + e.message + ")."]; }
  errors = errors.concat(checkReformulated(data));
  /* Une source qui n'existe pas dans la boîte est une source inventée. */
  const refs = boxRefs(path.join(dir, "boite"));
  const cited = [].concat(...(Array.isArray(data.idees) ? data.idees : []).map((i) => (i && Array.isArray(i.sources) ? i.sources : [])),
    (Array.isArray(data.ecartees) ? data.ecartees : []).map((e) => e && e.ref));
  cited.filter((r) => REF_RX.test(String(r)) && !refs.has(r)).forEach((r) => {
    errors.push("reformulees.json : référence " + r + " introuvable dans idees/boite/ (source inventée ?).");
  });
  [["rapports", checkReport], ["boite", checkBox]].forEach(([sub, checkOne]) => {
    const folder = path.join(dir, sub);
    if (!fs.existsSync(folder)) { return; }
    fs.readdirSync(folder).filter((f) => f.endsWith(".md")).forEach((f) => {
      errors = errors.concat(checkOne(f, fs.readFileSync(path.join(folder, f), "utf8")));
    });
  });
  ["README.md"].filter((f) => fs.existsSync(path.join(dir, f))).forEach((f) => {
    errors = errors.concat(checkMarkdown(f, fs.readFileSync(path.join(dir, f), "utf8"), false));
  });
  return errors;
}

module.exports = { checkReformulated, checkReport, checkBox, boxRefs, pending, run, SET_ASIDE };

if (require.main === module) {
  if (process.argv.includes("--en-attente")) {
    const dir = path.join(ROOT, "idees");
    const refs = boxRefs(path.join(dir, "boite"));
    let data = {};
    try { data = JSON.parse(fs.readFileSync(path.join(dir, "reformulees.json"), "utf8")); } catch (e) { data = {}; }
    const todo = pending(data, refs);
    todo.forEach((r) => console.log(r + "  idees/boite/" + refs.get(r)));
    console.log(todo.length + " idée(s) brute(s) en attente de reformulation.");
    process.exit(0);
  }
  const errors = run();
  if (errors.length) {
    errors.forEach((e) => console.error("✗ " + e));
    process.exit(1);
  }
  console.log("✓ Boîte à idées : format conforme.");
}
