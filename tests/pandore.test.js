/* BrainstO. — Pandore : collecte (tools/pandore-collect.js), contrôle de publication (tools/pandore-check.js) et
 * remise à zéro (tools/pandore-reset.js).
 *
 *     node tests/pandore.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const collect = require("../tools/pandore-collect.js");
const checker = require("../tools/pandore-check.js");
const reset = require("../tools/pandore-reset.js");

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

check("collecte : un dépôt n'est jamais du HTML (GitHub Pages sert le dépôt Git sur le domaine de l'application)", () => {
  const md = collect.render("2026-10-03", [{ ref: "a1b2c3d4e5f6", text: "<script>alert(1)</script> & <img src=x onerror=y>" }], "");
  assert(md.indexOf("<script") < 0 && md.indexOf("<img") < 0, "balise restée brute : " + md);
  assert(md.indexOf("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;img") >= 0, "texte non échappé : " + md);
});

check("collecte : ni Liquid ni Markdown actif (un dépôt ne casse pas la publication du site et ne crée aucun lien)", () => {
  const text = "{% include x %} {{ site.time }} {: onclick=\"y\"} [ici](javascript:alert(1)) [r]: data:x";
  const md = collect.render("2026-10-03", [{ ref: "a1b2c3d4e5f6", text }], "");
  assert(!/\{[{%:]/.test(md), "accolade Liquid ou kramdown restée brute : " + md);
  assert(md.indexOf("[ici]") < 0 && md.indexOf("[r]") < 0, "crochet de lien resté brut : " + md);
  assert(md.indexOf("&#123;% include x %&#125;") >= 0 && md.indexOf("&#91;ici&#93;") >= 0, "entités attendues : " + md);
  equal(checker.checkBox("2026-10-03.md", md), [], "le fichier produit par la collecte doit passer le contrôle");
});

check("collecte : référence en commentaire, texte en citation ligne par ligne, en-tête daté, aucune heure", () => {
  const md = collect.render("2026-10-01", [{ ref: "abcdef123456", text: "Ligne 1\r\nLigne 2" }], "");
  assert(/^# Dépôts collectés le 1er octobre 2026/.test(md), "en-tête : " + md.split("\n")[0]);
  assert(md.indexOf("<!-- ref: abcdef123456 -->\n> Ligne 1\n> Ligne 2") >= 0, "forme d'un dépôt : " + md);
  assert(!/\d{1,2}:\d{2}/.test(md), "aucune heure ne doit apparaître");
  assert(!/reformul|idée/i.test(md), "vocabulaire d'avant Pandore dans l'en-tête : " + md);
});

check("collecte : un faux marqueur de référence dans le texte ne compte pas ; une ligne « --- » déposée ne coupe rien", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "depots-"));
  const md = collect.render("2026-10-03", [
    { ref: "111111aaaaaa", text: "Normal\n---\nsuite" },
    { ref: "222222bbbbbb", text: "Piège <!-- ref: 999999ffffff -->" }
  ], "");
  fs.writeFileSync(path.join(dir, "2026-10-03.md"), md);
  equal([...collect.knownRefs(dir)].sort(), ["111111aaaaaa", "222222bbbbbb"]);
  const parsed = collect.parseBox(md);
  equal(collect.serializeBox(parsed.header, parsed.blocks), md, "lecture puis écriture : fichier identique");
  const more = collect.render("2026-10-03", [{ ref: "333333cccccc", text: "Ajouté" }], md);
  assert(more.indexOf("Normal") >= 0 && more.indexOf("Ajouté") >= 0 && (more.match(/^# /gm) || []).length === 1,
    "un second passage le même jour ajoute sans dupliquer l'en-tête");
});

check("collecte : mélange complet et déterministe sous un aléa donné ; dépôts invalides écartés", () => {
  const list = ["a", "b", "c", "d"];
  const out = collect.shuffle(list, () => 0);
  equal(out.slice().sort(), list, "rien de perdu");
  assert(JSON.stringify(out) !== JSON.stringify(list), "l'ordre doit changer");
  equal(list, ["a", "b", "c", "d"], "la liste d'origine n'est pas modifiée");
  assert(!collect.validDeposit({ ref: "zz", text: "x" }) && !collect.validDeposit({ ref: "abcdef12", text: "  " }) &&
    collect.validDeposit({ ref: "abcdef12", text: "ok" }), "filtre des dépôts");
});

check("synthèse : format, classement libre choisi par l'IA, résumé facultatif, HTML refusé, sources obligatoires", () => {
  const ok = { version: 1, date: "2026-10-03", remiseAZero: "", classement: "Par nature", resume: "Trois sujets dominent.",
    points: [
      { id: "p1", categorie: "Plainte", titre: "La réunion du lundi déborde sur l'ouverture", texte: "Constat : …", sources: ["abcdef123456"] },
      { id: "p2", titre: "Sans catégorie", texte: "Une remarque isolée.", sources: ["abcdef654321"] }
    ] };
  equal(checker.checkSynthesis(ok), [], "format valide, catégorie facultative");
  equal(checker.checkSynthesis({ version: 1, date: "", remiseAZero: "", points: [] }), [], "synthèse vide d'origine");
  const bad = JSON.parse(JSON.stringify(ok));
  bad.points[0].texte = "<b>gras</b>";
  bad.points[0].categorie = "x".repeat(41);
  bad.classement = "<i>axe</i>";
  bad.points.push({ id: "p1", titre: "", sources: [] });
  const errors = checker.checkSynthesis(bad);
  ["« texte » contient du HTML", "« categorie » dépasse", "« classement » contient du HTML", "en double", "« titre » est obligatoire", "« sources »"].forEach((needle) => {
    assert(errors.some((e) => e.indexOf(needle) >= 0), "erreur attendue : " + needle + " — " + JSON.stringify(errors));
  });
  assert(checker.checkSynthesis(Object.assign({}, ok, { date: "" })).some((e) => /porte sa « date »/.test(e)), "une synthèse non vide doit être datée");
});

check("pages : HTML, Liquid, attributs kramdown et liens non http refusés ; commentaires de référence admis dans les seuls dépôts", () => {
  equal(checker.checkPage("README.md", "# Pandore\n\nVoir [les dépôts](depots/2026-10-03.md) et [le site](https://exemple.fr)."), []);
  assert(checker.checkPage("x.md", "Voir <a href=x>ici</a>").length === 1, "HTML dans une page");
  ["{% if x %}", "{{ site }}", "Para\n{: onclick=\"x\"}", "[ici](javascript:alert(1))", "[ici]( JavaScript:x)", "[r]: data:text/html,x"]
    .forEach((bad) => assert(checker.checkPage("x.md", bad).length === 1, "page acceptée à tort : " + bad));
  assert(checker.checkBox("b.md", "<!-- ref: abcdef123456 -->\n> ok").length === 0, "commentaire de référence refusé à tort");
  assert(checker.checkBox("b.md", "<!-- autre -->\n> ok").length === 1, "seuls les commentaires de référence sont admis dans les dépôts");
});

/* Un dépôt Git jouet : une collecte de trois dépôts (fichier + registre), et une synthèse à écrire. */
function sandbox(deposits) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pandore-"));
  const dir = path.join(root, "pandore");
  fs.mkdirSync(path.join(dir, "depots"), { recursive: true });
  const list = deposits || [{ ref: "aaaaaa111111", text: "A" }, { ref: "bbbbbb222222", text: "B" }, { ref: "cccccc333333", text: "C" }];
  fs.writeFileSync(path.join(dir, "depots", "2026-10-03.md"), collect.render("2026-10-03", list, ""));
  collect.appendRegistry(path.join(dir, "references.txt"), list.map((d) => d.ref));
  return {
    root, dir,
    write: (data) => fs.writeFileSync(path.join(dir, "synthese.json"), JSON.stringify(data)),
    read: () => JSON.parse(fs.readFileSync(path.join(dir, "synthese.json"), "utf8")),
    files: () => fs.readdirSync(path.join(dir, "depots")).sort(),
    refs: () => [...checker.boxRefs(path.join(dir, "depots")).keys()].sort()
  };
}
const point = (sources, id) => ({ id: id || "p1", categorie: "Idée", titre: "T", texte: "X", sources });

check("synthèse : aucune source inventée, dépôts en attente listés, écartés seulement pour un motif admis, registre tenu", () => {
  const box = sandbox();
  const data = { version: 1, date: "2026-10-04", remiseAZero: "", points: [point(["aaaaaa111111"])], ecartes: [{ ref: "bbbbbb222222", motif: "personne-visee" }] };
  box.write(data);
  equal(checker.run(box.root), [], "état valide");
  equal(checker.pending(data, checker.boxRefs(path.join(box.dir, "depots"))), ["cccccc333333"], "en attente");
  box.write(Object.assign({}, data, { points: [point(["aaaaaa111111", "dddddd444444"])] }));
  assert(checker.run(box.root).some((e) => /dddddd444444 absente de pandore\/depots/.test(e)), "une source inventée doit être refusée");
  const motif = checker.checkSynthesis(Object.assign({}, data, { ecartes: [{ ref: "cccccc333333", motif: "trop-critique" }] }));
  assert(motif.some((e) => /motif/.test(e)), "motif non admis accepté");
  const both = checker.checkSynthesis(Object.assign({}, data, { ecartes: [{ ref: "aaaaaa111111", motif: "inexploitable" }] }));
  assert(both.some((e) => /à la fois écarté et source/.test(e)), "un dépôt ne peut être à la fois écarté et synthétisé");
  fs.writeFileSync(path.join(box.dir, "references.txt"), collect.REGISTRY_HEADER + "\naaaaaa111111\n");
  assert(checker.run(box.root).some((e) => /bbbbbb222222 absente du registre/.test(e)), "un dépôt publié doit figurer au registre");
  fs.mkdirSync(path.join(box.dir, "notes"));
  fs.writeFileSync(path.join(box.dir, "notes", "x.md"), "{{ site }}");
  assert(checker.run(box.root).some((e) => /notes\/x\.md/.test(e)), "un .md posé ailleurs dans pandore/ doit être contrôlé aussi");
});

check("remise à zéro : retire seulement les dépôts traités, garde ceux arrivés après, la synthèse reste affichée", () => {
  const box = sandbox();
  const data = { version: 1, date: "2026-10-04", remiseAZero: "", points: [point(["aaaaaa111111"])], ecartes: [{ ref: "bbbbbb222222", motif: "inexploitable" }] };
  box.write(data);
  const dry = reset.reset(box.root, { simulation: true, day: "2026-10-05" });
  equal([dry.ok, dry.removed.sort(), dry.kept], [true, ["aaaaaa111111", "bbbbbb222222"], ["cccccc333333"]], "simulation");
  equal(box.refs(), ["aaaaaa111111", "bbbbbb222222", "cccccc333333"], "la simulation ne doit rien écrire");
  const r = reset.reset(box.root, { day: "2026-10-05" });
  assert(r.ok, "remise à zéro refusée : " + r.error);
  equal(box.refs(), ["cccccc333333"], "seul le dépôt non traité reste");
  const after = box.read();
  equal([after.remiseAZero, after.points.length, after.points[0].titre], ["2026-10-05", 1, "T"], "la synthèse reste intacte et datée");
  equal(collect.registryRefs(path.join(box.dir, "references.txt")).sort(), ["aaaaaa111111", "bbbbbb222222", "cccccc333333"], "le registre n'est jamais réduit");
  equal(checker.run(box.root), [], "état valide après remise à zéro");
  equal(checker.pending(after, checker.boxRefs(path.join(box.dir, "depots"))), ["cccccc333333"], "le dépôt gardé attend la prochaine synthèse");
  assert(collect.knownRefs(path.join(box.dir, "depots"), path.join(box.dir, "references.txt")).has("aaaaaa111111"),
    "un dépôt retiré reste connu : la collecte ne le republiera pas");
  const again = reset.reset(box.root, { day: "2026-10-06" });
  assert(!again.ok && /déjà remise à zéro/.test(again.error), "seconde remise à zéro sans nouvelle synthèse : " + JSON.stringify(again));
});

check("remise à zéro : fichier vidé supprimé ; refus sans synthèse, sur une synthèse invalide, ou sans dépôt couvert", () => {
  const box = sandbox([{ ref: "aaaaaa111111", text: "Seul" }]);
  box.write({ version: 1, date: "", remiseAZero: "", points: [] });
  assert(/aucune synthèse/.test(reset.reset(box.root, { day: "2026-10-05" }).error), "sans synthèse publiée");
  box.write({ version: 1, date: "2026-10-04", remiseAZero: "", points: [point(["aaaaaa111111", "eeeeee555555"])] });
  assert(/ne passe pas le contrôle/.test(reset.reset(box.root, { day: "2026-10-05" }).error), "synthèse invalide");
  equal(box.files(), ["2026-10-03.md"], "rien n'est retiré d'un état invalide");
  box.write({ version: 1, date: "2026-10-04", remiseAZero: "", points: [point(["aaaaaa111111"])] });
  const r = reset.reset(box.root, { day: "2026-10-03" });     // horloge UTC encore « la veille » de la synthèse
  assert(r.ok && r.deletedFiles.length === 1, "le fichier vidé doit être supprimé : " + JSON.stringify(r));
  equal(box.files(), [], "plus aucun dépôt");
  equal(box.read().remiseAZero, "2026-10-04", "la remise à zéro n'est jamais datée avant la synthèse");
  equal(checker.run(box.root), [], "état valide");
  const empty = sandbox([{ ref: "aaaaaa111111", text: "A" }]);
  empty.write({ version: 1, date: "2026-10-04", remiseAZero: "", points: [] });
  assert(/ne couvre aucun dépôt/.test(reset.reset(empty.root, { day: "2026-10-05" }).error), "rien à retirer");
});

check("après remise à zéro : synthèse inventée ou datée à l'envers refusée ; la synthèse suivante remplace l'ancienne", () => {
  const box = sandbox();
  box.write({ version: 1, date: "2026-10-04", remiseAZero: "", points: [point(["aaaaaa111111", "bbbbbb222222", "cccccc333333"])] });
  assert(reset.reset(box.root, { day: "2026-10-05" }).ok, "remise à zéro");
  const data = box.read();
  box.write(Object.assign({}, data, { points: [point(["aaaaaa111111", "ffffff666666"])] }));
  assert(checker.run(box.root).some((e) => /ffffff666666 absente du registre/.test(e)), "source inventée après remise à zéro");
  assert(checker.checkSynthesis(Object.assign({}, data, { remiseAZero: "2026-10-01" })).some((e) => /ne peut précéder/.test(e)), "date à l'envers");
  /* Une collecte arrive, puis une nouvelle synthèse qui oublierait de remplacer l'ancienne. */
  fs.writeFileSync(path.join(box.dir, "depots", "2026-10-06.md"), collect.render("2026-10-06", [{ ref: "999999aaaaaa", text: "Nouveau" }], ""));
  collect.appendRegistry(path.join(box.dir, "references.txt"), ["999999aaaaaa"]);
  box.write({ version: 1, date: "2026-10-07", remiseAZero: "", points: [point(["aaaaaa111111"]), point(["999999aaaaaa"], "p2")] });
  assert(checker.run(box.root).some((e) => /aaaaaa111111 absente de pandore\/depots/.test(e)), "l'ancienne synthèse doit être remplacée, pas prolongée");
  box.write({ version: 1, date: "2026-10-07", remiseAZero: "", points: [point(["999999aaaaaa"], "p2")] });
  equal(checker.run(box.root), [], "nouvelle synthèse valide");
});

check("dépôt Git : pandore/synthese.json est conforme, et la collecte est câblée chaque jour", () => {
  equal(checker.run(), [], "le fichier publié doit passer le contrôle");
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/pandore.yml"), "utf8");
  assert(/schedule:\s*\n\s*- cron:/.test(wf) && /node tools\/pandore-collect\.js/.test(wf), "tâche quotidienne absente");
  assert(/contents: write/.test(wf), "la tâche doit pouvoir écrire dans le dépôt");
  assert(/secrets\.BRAINSTO_IDEAS_SECRET/.test(wf) && !/BRAINSTO_IDEAS_SECRET:[ \t]*["']?[A-Za-z0-9]/.test(wf.replace(/\$\{\{[^}]*\}\}/g, "")),
    "le secret doit venir des secrets GitHub, jamais du fichier");
});

if (failures.length) {
  failures.forEach((f) => console.error("✗ " + f));
  console.error(failures.length + " échec(s), " + passed + " réussi(s)");
  process.exit(1);
}
console.log("pandore : " + passed + " contrôles OK");
