#!/usr/bin/env node
/* BrainstO. — collecte quotidienne de la boîte à idées (GitHub Actions, .github/workflows/boite-a-idees.yml).
 *
 *     BRAINSTO_SCRIPT_URL=… BRAINSTO_IDEAS_SECRET=… node tools/collect-ideas.js
 *
 * 1. demande au backend Apps Script les idées en attente (POST ?op=ideas-export, avec le secret de collecte) ;
 * 2. écrit celles qui ne sont pas déjà dans le dépôt dans idees/boite/<jour de collecte>.md, dans un ordre ALÉATOIRE
 *    et sans aucune heure : on sait seulement qu'une idée a été déposée avant la collecte ;
 * 3. commit et push (auteur : le robot GitHub Actions) ;
 * 4. acquitte (POST ?op=ideas-ack) : le backend retire ce qui est publié. Sans acquittement, la collecte suivante
 *    reverra les mêmes idées et les ignorera (référence déjà présente).
 *
 * ⚠️ SÉCURITÉ. Le dépôt est publié par GitHub Pages (Jekyll), sur le MÊME domaine que l'application, et Pages
 * transforme les .md en pages HTML. Un texte d'idée n'est donc jamais interprété, à aucun des trois étages :
 *   - HTML : `&`, `<`, `>` échappés. Sinon une balise <script> s'exécuterait chez quiconque ouvre la page ;
 *   - Liquid : `{` et `}` échappés. Sinon `{% x %}` ferait ÉCHOUER la publication du site entier, application
 *     comprise, et `{: onclick=…}` (attributs kramdown) ajouterait un gestionnaire d'événement ;
 *   - Markdown : `[` et `]` échappés. Sinon `[ici](javascript:…)` deviendrait un lien exécutable.
 * Les entités (&lt; &#123; &#91;…) s'affichent comme le caractère d'origine, sur Pages comme sur GitHub.
 *
 * Bibliothèque standard uniquement : le dépôt n'a aucune dépendance. Sans configuration (secrets absents, fork),
 * le script dit pourquoi et sort sans erreur. */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BOX_DIR = path.join(ROOT, "idees", "boite");
const REF_RX = /<!-- ref: ([0-9a-f]{6,64}) -->/g;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
  "novembre", "décembre"];

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;", "[": "&#91;", "]": "&#93;" };

function escapeText(text) {
  return String(text).replace(/[&<>{}[\]]/g, (c) => ENTITIES[c]);
}

/* Mélange de Fisher-Yates, aléa cryptographique : l'ordre du fichier ne dit rien de l'ordre des dépôts. */
function shuffle(list, randomInt) {
  const pick = randomInt || ((max) => crypto.randomInt(max));
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/* Références déjà publiées, dans tous les fichiers de la boîte. */
function knownRefs(dir) {
  const refs = new Set();
  if (!fs.existsSync(dir)) { return refs; }
  fs.readdirSync(dir).filter((f) => f.endsWith(".md")).forEach((file) => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    let m;
    REF_RX.lastIndex = 0;
    while ((m = REF_RX.exec(text))) { refs.add(m[1]); }
  });
  return refs;
}

function frenchDay(day) {
  const [y, mo, d] = day.split("-").map(Number);
  return d + (d === 1 ? "er" : "") + " " + MONTHS[mo - 1] + " " + y;
}

function header(day) {
  return [
    "# Idées collectées le " + frenchDay(day),
    "",
    "Déposées anonymement dans BrainstO., publiées **telles quelles** (non reformulées), dans un ordre aléatoire.",
    "Les chevrons, accolades et crochets y sont écrits en entités HTML (`&lt;`, `&#123;`, `&#91;`…) : c'est voulu.",
    "Ne cherchez pas à en identifier les auteurs. Les versions reformulées sont dans",
    "[`idees/reformulees.json`](../reformulees.json) et s'affichent dans l'application.",
    ""
  ].join("\n");
}

/* Une idée : sa référence (commentaire, pour l'IA et la déduplication), puis son texte en citation, ligne par ligne.
 * Une référence n'est jamais tirée du texte : seules les références posées par ce script comptent, et le texte
 * échappé ne peut plus en contenir (`<` devient `&lt;`). */
function renderIdea(idea) {
  const lines = escapeText(idea.text).replace(/\r\n?/g, "\n").split("\n").map((l) => "> " + l.trimEnd());
  return ["---", "", "<!-- ref: " + idea.ref + " -->", ...lines, ""].join("\n");
}

function render(day, ideas, existing) {
  const body = ideas.map(renderIdea).join("\n");
  return (existing ? existing.replace(/\s*$/, "\n\n") : header(day) + "\n") + body;
}

function validIdea(idea) {
  return !!idea && /^[0-9a-f]{6,64}$/.test(String(idea.ref || "")) && typeof idea.text === "string" && idea.text.trim() !== "";
}

async function call(url, op, body) {
  const target = url + (url.indexOf("?") >= 0 ? "&" : "?") + "op=" + encodeURIComponent(op);
  /* Apps Script répond par une redirection vers googleusercontent : `fetch` la suit (POST → GET), comme le navigateur. */
  const response = await fetch(target, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("Réponse illisible du backend (HTTP " + response.status + ")."); }
  if (!data || data.ok !== true) { throw new Error("Backend : " + (data && (data.code || "") + " " + (data.error || ""))); }
  return data;
}

function git(args) { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }

async function main() {
  const url = String(process.env.BRAINSTO_SCRIPT_URL || "").trim();
  const secret = String(process.env.BRAINSTO_IDEAS_SECRET || "").trim();
  if (!url || !secret) {
    console.log("Collecte non configurée (secrets BRAINSTO_SCRIPT_URL et BRAINSTO_IDEAS_SECRET) : rien à faire.");
    return;
  }
  const exported = await call(url, "ideas-export", { secret });
  const ideas = (Array.isArray(exported.ideas) ? exported.ideas : []).filter(validIdea);
  if (!ideas.length) { console.log("Boîte vide."); return; }

  const known = knownRefs(BOX_DIR);
  const fresh = ideas.filter((i) => !known.has(i.ref));
  if (fresh.length) {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(BOX_DIR, day + ".md");
    fs.mkdirSync(BOX_DIR, { recursive: true });
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    fs.writeFileSync(file, render(day, shuffle(fresh), existing));
    git(["config", "user.name", "github-actions[bot]"]);
    git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    git(["add", path.relative(ROOT, file)]);
    git(["commit", "-m", "idées : collecte du " + day + " (" + fresh.length + (fresh.length > 1 ? " idées)" : " idée)")]);
    /* Un commit arrivé entre-temps sur la branche fait refuser le push : on se recale une fois, puis on réessaie. */
    try { git(["push"]); } catch (e) { git(["pull", "--rebase"]); git(["push"]); }
    console.log(fresh.length + " idée(s) publiée(s) dans " + path.relative(ROOT, file) + ".");
  } else {
    console.log("Toutes les idées exportées étaient déjà publiées : acquittement seul.");
  }
  /* Acquitter APRÈS le push : une idée n'est retirée de la boîte qu'une fois dans le dépôt distant. */
  const ack = await call(url, "ideas-ack", { secret, refs: ideas.map((i) => i.ref) });
  console.log("Boîte vidée de " + ack.removed + " idée(s).");
}

module.exports = { escapeText, shuffle, knownRefs, frenchDay, render, renderIdea, validIdea };

if (require.main === module) {
  main().catch((error) => {
    console.error("Collecte interrompue : " + (error && error.message ? error.message : error));
    process.exit(1);
  });
}
