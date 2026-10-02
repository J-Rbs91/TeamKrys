#!/usr/bin/env node
/* BrainstO. — collecte quotidienne de Pandore (GitHub Actions, .github/workflows/pandore.yml).
 *
 *     BRAINSTO_SCRIPT_URL=… BRAINSTO_IDEAS_SECRET=… node tools/pandore-collect.js
 *
 * Pandore reçoit tout ce que l'équipe veut dire anonymement : idées, plaintes, questions, remarques.
 *
 * 1. demande au backend Apps Script les dépôts en attente (POST ?op=ideas-export, avec le secret de collecte) ;
 * 2. écrit ceux qui n'ont jamais été publiés dans pandore/depots/<jour de collecte>.md, dans un ordre ALÉATOIRE
 *    et sans aucune heure : on sait seulement qu'un dépôt a été fait avant la collecte ;
 * 3. ajoute leurs références au registre pandore/references.txt, puis commit et push (auteur : le robot GitHub Actions) ;
 * 4. acquitte (POST ?op=ideas-ack) : le backend retire ce qui est publié. Sans acquittement, la collecte suivante
 *    reverra les mêmes dépôts et les ignorera (référence déjà au registre).
 *
 * Les noms techniques du backend (opérations `ideas-*`, secret BRAINSTO_IDEAS_SECRET, action SUBMIT_IDEA) datent
 * d'avant le nom Pandore. Ils restent tels quels : les changer obligerait à redéployer le backend, sans rien
 * changer pour l'équipe.
 *
 * Le registre est la mémoire de Pandore : la remise à zéro (tools/pandore-reset.js) retire les dépôts synthétisés de
 * pandore/depots/, mais jamais leur référence du registre. Sans lui, un dépôt publié puis retiré reviendrait à la
 * collecte suivante si son acquittement avait échoué.
 *
 * ⚠️ SÉCURITÉ. Le dépôt Git est publié par GitHub Pages (Jekyll), sur le MÊME domaine que l'application, et Pages
 * transforme les .md en pages HTML. Un texte déposé n'est donc jamais interprété, à aucun des trois étages :
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
const BOX_DIR = path.join(ROOT, "pandore", "depots");
const REGISTRY = path.join(ROOT, "pandore", "references.txt");
const REGISTRY_HEADER = "# Références de tous les dépôts publiés par la collecte, une par ligne. Écrit par tools/pandore-collect.js : ne pas modifier.";
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

/* Références du registre (tous les dépôts jamais publiés). */
function registryRefs(file) {
  if (!fs.existsSync(file)) { return []; }
  return fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => /^[0-9a-f]{6,64}$/.test(l));
}

function appendRegistry(file, refs) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\s*$/, "\n") : REGISTRY_HEADER + "\n";
  fs.writeFileSync(file, existing + refs.map((r) => r + "\n").join(""));
}

/* Références déjà publiées : celles de pandore/depots/, et celles du registre (un dépôt retiré par remise à zéro y reste). */
function knownRefs(dir, registry) {
  const refs = new Set(registryRefs(registry || ""));
  if (!fs.existsSync(dir)) { return refs; }
  fs.readdirSync(dir).filter((f) => f.endsWith(".md")).forEach((file) => {
    parseBox(fs.readFileSync(path.join(dir, file), "utf8")).blocks.forEach((b) => refs.add(b.ref));
  });
  return refs;
}

/* Un fichier de dépôts : un en-tête, puis des blocs qui commencent par une ligne « --- ». Une ligne « --- » ne
 * peut venir que du script : le texte d'un dépôt est cité, chacune de ses lignes commence par « > ». Seul le
 * commentaire qui OUVRE un bloc compte comme référence : le texte échappé ne peut plus en former un. */
function parseBox(text) {
  const parts = String(text).replace(/\r\n?/g, "\n").split(/^---$/m);
  const blocks = [];
  parts.slice(1).forEach((raw) => {
    const m = /^\s*<!-- ref: ([0-9a-f]{6,64}) -->/.exec(raw);
    if (m) { blocks.push({ ref: m[1], raw: raw.replace(/^\n+/, "").replace(/\s*$/, "") }); }
  });
  return { header: parts[0].replace(/\s*$/, ""), blocks };
}

function serializeBox(header, blocks) {
  return header + "\n\n" + blocks.map((b) => "---\n\n" + b.raw + "\n").join("\n");
}

function frenchDay(day) {
  const [y, mo, d] = day.split("-").map(Number);
  return d + (d === 1 ? "er" : "") + " " + MONTHS[mo - 1] + " " + y;
}

function header(day) {
  return [
    "# Dépôts collectés le " + frenchDay(day),
    "",
    "Déposés anonymement dans Pandore (BrainstO.), publiés **tels quels**, dans un ordre aléatoire.",
    "Les chevrons, accolades et crochets y sont écrits en entités HTML (`&lt;`, `&#123;`, `&#91;`…) : c'est voulu.",
    "Ne cherchez pas à en identifier les auteurs. La synthèse automatique est dans",
    "[`pandore/synthese.json`](../synthese.json) et s'affiche dans l'application.",
    ""
  ].join("\n");
}

/* Un dépôt : sa référence (commentaire, pour l'IA et la déduplication), puis son texte en citation, ligne par ligne.
 * Une référence n'est jamais tirée du texte : seules les références posées par ce script comptent, et le texte
 * échappé ne peut plus en contenir (`<` devient `&lt;`). */
function renderDeposit(deposit) {
  const lines = escapeText(deposit.text).replace(/\r\n?/g, "\n").split("\n").map((l) => "> " + l.trimEnd());
  return ["---", "", "<!-- ref: " + deposit.ref + " -->", ...lines, ""].join("\n");
}

function render(day, deposits, existing) {
  const body = deposits.map(renderDeposit).join("\n");
  return (existing ? existing.replace(/\s*$/, "\n\n") : header(day) + "\n") + body;
}

function validDeposit(deposit) {
  return !!deposit && /^[0-9a-f]{6,64}$/.test(String(deposit.ref || "")) && typeof deposit.text === "string" && deposit.text.trim() !== "";
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
  const deposits = (Array.isArray(exported.ideas) ? exported.ideas : []).filter(validDeposit);
  if (!deposits.length) { console.log("Rien en attente."); return; }

  const known = knownRefs(BOX_DIR, REGISTRY);
  const fresh = deposits.filter((d) => !known.has(d.ref));
  if (fresh.length) {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(BOX_DIR, day + ".md");
    fs.mkdirSync(BOX_DIR, { recursive: true });
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    fs.writeFileSync(file, render(day, shuffle(fresh), existing));
    /* Le registre suit l'ordre mélangé du fichier, jamais celui de l'export. */
    appendRegistry(REGISTRY, parseBox(fs.readFileSync(file, "utf8")).blocks.map((b) => b.ref).filter((r) => fresh.some((d) => d.ref === r)));
    git(["config", "user.name", "github-actions[bot]"]);
    git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    git(["add", path.relative(ROOT, file), path.relative(ROOT, REGISTRY)]);
    git(["commit", "-m", "pandore : collecte du " + day + " (" + fresh.length + (fresh.length > 1 ? " dépôts)" : " dépôt)")]);
    /* Un commit arrivé entre-temps sur la branche fait refuser le push : on se recale une fois, puis on réessaie. */
    try { git(["push"]); } catch (e) { git(["pull", "--rebase"]); git(["push"]); }
    console.log(fresh.length + " dépôt(s) publié(s) dans " + path.relative(ROOT, file) + ".");
  } else {
    console.log("Tous les dépôts exportés étaient déjà publiés : acquittement seul.");
  }
  /* Acquitter APRÈS le push : un dépôt n'est retiré du backend qu'une fois dans le dépôt Git distant. */
  const ack = await call(url, "ideas-ack", { secret, refs: deposits.map((d) => d.ref) });
  console.log("Backend vidé de " + ack.removed + " dépôt(s).");
}

module.exports = { escapeText, shuffle, knownRefs, registryRefs, appendRegistry, parseBox, serializeBox, frenchDay, render,
  renderDeposit, validDeposit, REGISTRY_HEADER };

if (require.main === module) {
  main().catch((error) => {
    console.error("Collecte interrompue : " + (error && error.message ? error.message : error));
    process.exit(1);
  });
}
