/* BrainstO. — boîte à idées : collecte (tools/collect-ideas.js) et contrôle de publication (tools/check-ideas.js).
 *
 *     node tests/ideas.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const collect = require("../tools/collect-ideas.js");
const checker = require("../tools/check-ideas.js");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; } catch (error) { failures.push(name + " → " + (error && error.message)); }
}
function assert(c, m) { if (!c) { throw new Error(m || "assertion échouée"); } }
function equal(a, b, m) {
  const x = JSON.stringify(a); const y = JSON.stringify(b);
  if (x !== y) { throw new Error((m || "valeurs différentes") + " : " + x + " ≠ " + y); }
}

check("collecte : une idée n'est jamais du HTML (GitHub Pages sert le dépôt sur le domaine de l'application)", () => {
  const md = collect.render("2026-10-03", [{ ref: "a1b2c3d4e5f6", text: "<script>alert(1)</script> & <img src=x onerror=y>" }], "");
  assert(md.indexOf("<script") < 0 && md.indexOf("<img") < 0, "balise restée brute : " + md);
  assert(md.indexOf("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;img") >= 0, "texte non échappé : " + md);
});

check("collecte : ni Liquid ni Markdown actif (une idée ne casse pas la publication du site et ne crée aucun lien)", () => {
  const text = "{% include x %} {{ site.time }} {: onclick=\"y\"} [ici](javascript:alert(1)) [r]: data:x";
  const md = collect.render("2026-10-03", [{ ref: "a1b2c3d4e5f6", text }], "");
  assert(!/\{[{%:]/.test(md), "accolade Liquid ou kramdown restée brute : " + md);
  assert(md.indexOf("[ici]") < 0 && md.indexOf("[r]") < 0, "crochet de lien resté brut : " + md);
  assert(md.indexOf("&#123;% include x %&#125;") >= 0 && md.indexOf("&#91;ici&#93;") >= 0, "entités attendues : " + md);
  equal(checker.checkBox("2026-10-03.md", md), [], "le fichier produit par la collecte doit passer le contrôle");
});

check("collecte : référence en commentaire, texte en citation ligne par ligne, en-tête daté, aucune heure", () => {
  const md = collect.render("2026-10-01", [{ ref: "abcdef123456", text: "Ligne 1\r\nLigne 2" }], "");
  assert(/^# Idées collectées le 1er octobre 2026/.test(md), "en-tête : " + md.split("\n")[0]);
  assert(md.indexOf("<!-- ref: abcdef123456 -->\n> Ligne 1\n> Ligne 2") >= 0, "forme d'une idée : " + md);
  assert(!/\d{1,2}:\d{2}/.test(md), "aucune heure ne doit apparaître");
});

check("collecte : un faux marqueur de référence dans le texte ne compte pas ; les références publiées sont retrouvées", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boite-"));
  const md = collect.render("2026-10-03", [
    { ref: "111111aaaaaa", text: "Normale" },
    { ref: "222222bbbbbb", text: "Piège <!-- ref: 999999ffffff -->" }
  ], "");
  fs.writeFileSync(path.join(dir, "2026-10-03.md"), md);
  equal([...collect.knownRefs(dir)].sort(), ["111111aaaaaa", "222222bbbbbb"]);
  const more = collect.render("2026-10-03", [{ ref: "333333cccccc", text: "Ajoutée" }], md);
  assert(more.indexOf("Normale") >= 0 && more.indexOf("Ajoutée") >= 0 && (more.match(/^# /gm) || []).length === 1,
    "un second passage le même jour ajoute sans dupliquer l'en-tête");
});

check("collecte : mélange complet et déterministe sous un aléa donné ; idées invalides écartées", () => {
  const list = ["a", "b", "c", "d"];
  const out = collect.shuffle(list, () => 0);
  equal(out.slice().sort(), list, "rien de perdu");
  assert(JSON.stringify(out) !== JSON.stringify(list), "l'ordre doit changer");
  equal(list, ["a", "b", "c", "d"], "la liste d'origine n'est pas modifiée");
  assert(!collect.validIdea({ ref: "zz", text: "x" }) && !collect.validIdea({ ref: "abcdef12", text: "  " }) &&
    collect.validIdea({ ref: "abcdef12", text: "ok" }), "filtre des idées");
});

check("publication IA : format de reformulees.json, HTML refusé, sources obligatoires, rapports sans HTML", () => {
  const ok = { version: 1, misAJour: "2026-10-03", idees: [
    { id: "r-2026-10-03-1", titre: "Raccourcir la réunion du lundi", texte: "Plusieurs idées proposent…", theme: "Réunions", date: "2026-10-03", sources: ["abcdef123456"] }
  ] };
  equal(checker.checkReformulated(ok), [], "format valide");
  const bad = JSON.parse(JSON.stringify(ok));
  bad.idees[0].texte = "<b>gras</b>";
  bad.idees.push({ id: "r-2026-10-03-1", titre: "", date: "hier", sources: [] });
  const errors = checker.checkReformulated(bad);
  ["HTML", "en double", "« titre » est obligatoire", "« date »", "« sources »"].forEach((needle) => {
    assert(errors.some((e) => e.indexOf(needle) >= 0), "erreur attendue : " + needle + " — " + JSON.stringify(errors));
  });
  equal(checker.checkReport("2026-10.md", "# Rapport\n\nVoir [la boîte](../boite/2026-10-03.md) et [le site](https://exemple.fr)."), []);
  assert(checker.checkReport("x.md", "Voir <a href=x>ici</a>").length === 1, "HTML dans un rapport");
  ["{% if x %}", "{{ site }}", "Para\n{: onclick=\"x\"}", "[ici](javascript:alert(1))", "[ici]( JavaScript:x)", "[r]: data:text/html,x"]
    .forEach((bad) => assert(checker.checkReport("x.md", bad).length === 1, "rapport accepté à tort : " + bad));
  assert(checker.checkBox("b.md", "<!-- ref: abcdef123456 -->\n> ok").length === 0, "commentaire de référence refusé à tort");
  assert(checker.checkBox("b.md", "<!-- autre -->\n> ok").length === 1, "seuls les commentaires de référence sont admis dans la boîte");
});

check("publication IA : aucune source inventée, idées en attente listées, écartées seulement pour un motif admis", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idees-"));
  fs.mkdirSync(path.join(root, "idees", "boite"), { recursive: true });
  fs.writeFileSync(path.join(root, "idees", "boite", "2026-10-03.md"),
    collect.render("2026-10-03", [{ ref: "aaaaaa111111", text: "A" }, { ref: "bbbbbb222222", text: "B" }, { ref: "cccccc333333", text: "C" }], ""));
  const write = (data) => fs.writeFileSync(path.join(root, "idees", "reformulees.json"), JSON.stringify(data));
  const idea = (sources) => ({ id: "r-1", titre: "T", texte: "X", date: "2026-10-04", sources });
  const data = { version: 1, misAJour: "2026-10-04", idees: [idea(["aaaaaa111111"])], ecartees: [{ ref: "bbbbbb222222", motif: "personne-visee" }] };
  write(data);
  equal(checker.run(root), [], "état valide");
  equal(checker.pending(data, checker.boxRefs(path.join(root, "idees", "boite"))), ["cccccc333333"], "en attente");
  write(Object.assign({}, data, { idees: [idea(["aaaaaa111111", "dddddd444444"])] }));
  assert(checker.run(root).some((e) => /dddddd444444 introuvable/.test(e)), "une source inventée doit être refusée");
  const motif = checker.checkReformulated(Object.assign({}, data, { ecartees: [{ ref: "cccccc333333", motif: "hors-sujet" }] }));
  assert(motif.some((e) => /motif/.test(e)), "motif non admis accepté");
  const both = checker.checkReformulated(Object.assign({}, data, { ecartees: [{ ref: "aaaaaa111111", motif: "inexploitable" }] }));
  assert(both.some((e) => /à la fois écartée et source/.test(e)), "une idée ne peut être à la fois écartée et reformulée");
});

check("dépôt : idees/reformulees.json est conforme, et la collecte est câblée chaque jour", () => {
  equal(checker.run(), [], "le fichier publié doit passer le contrôle");
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/boite-a-idees.yml"), "utf8");
  assert(/schedule:\s*\n\s*- cron:/.test(wf) && /node tools\/collect-ideas\.js/.test(wf), "tâche quotidienne absente");
  assert(/contents: write/.test(wf), "la tâche doit pouvoir écrire dans le dépôt");
  assert(/secrets\.BRAINSTO_IDEAS_SECRET/.test(wf) && !/BRAINSTO_IDEAS_SECRET:[ \t]*["']?[A-Za-z0-9]/.test(wf.replace(/\$\{\{[^}]*\}\}/g, "")),
    "le secret doit venir des secrets GitHub, jamais du fichier");
});

if (failures.length) {
  failures.forEach((f) => console.error("✗ " + f));
  console.error(failures.length + " échec(s), " + passed + " réussi(s)");
  process.exit(1);
}
console.log("ideas : " + passed + " contrôles OK");
