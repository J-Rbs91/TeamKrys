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
const reset = require("../tools/reset-ideas.js");

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

/* Un dépôt jouet : une collecte de trois idées (boîte + registre), et une reformulation à écrire. */
function sandbox(ideas) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idees-"));
  const dir = path.join(root, "idees");
  fs.mkdirSync(path.join(dir, "boite"), { recursive: true });
  const list = ideas || [{ ref: "aaaaaa111111", text: "A" }, { ref: "bbbbbb222222", text: "B" }, { ref: "cccccc333333", text: "C" }];
  fs.writeFileSync(path.join(dir, "boite", "2026-10-03.md"), collect.render("2026-10-03", list, ""));
  collect.appendRegistry(path.join(dir, "references.txt"), list.map((i) => i.ref));
  return {
    root, dir,
    write: (data) => fs.writeFileSync(path.join(dir, "reformulees.json"), JSON.stringify(data)),
    read: () => JSON.parse(fs.readFileSync(path.join(dir, "reformulees.json"), "utf8")),
    box: () => fs.readdirSync(path.join(dir, "boite")).sort(),
    boxRefs: () => [...checker.boxRefs(path.join(dir, "boite")).keys()].sort()
  };
}
const idea = (sources, id) => ({ id: id || "r-1", titre: "T", texte: "X", date: "2026-10-04", sources });

check("publication IA : aucune source inventée, idées en attente listées, écartées seulement pour un motif admis", () => {
  const box = sandbox();
  const data = { version: 1, misAJour: "2026-10-04", idees: [idea(["aaaaaa111111"])], ecartees: [{ ref: "bbbbbb222222", motif: "personne-visee" }] };
  box.write(data);
  equal(checker.run(box.root), [], "état valide");
  equal(checker.pending(data, checker.boxRefs(path.join(box.dir, "boite"))), ["cccccc333333"], "en attente");
  box.write(Object.assign({}, data, { idees: [idea(["aaaaaa111111", "dddddd444444"])] }));
  assert(checker.run(box.root).some((e) => /dddddd444444 absente de idees\/boite/.test(e)), "une source inventée doit être refusée");
  const motif = checker.checkReformulated(Object.assign({}, data, { ecartees: [{ ref: "cccccc333333", motif: "hors-sujet" }] }));
  assert(motif.some((e) => /motif/.test(e)), "motif non admis accepté");
  const both = checker.checkReformulated(Object.assign({}, data, { ecartees: [{ ref: "aaaaaa111111", motif: "inexploitable" }] }));
  assert(both.some((e) => /à la fois écartée et source/.test(e)), "une idée ne peut être à la fois écartée et reformulée");
  fs.writeFileSync(path.join(box.dir, "references.txt"), collect.REGISTRY_HEADER + "\naaaaaa111111\n");
  assert(checker.run(box.root).some((e) => /bbbbbb222222 absente du registre/.test(e)), "une idée de la boîte doit figurer au registre");
});

check("réinitialisation : retire seulement les idées traitées, garde celles arrivées après, le rapport reste affiché", () => {
  const box = sandbox();
  const data = { version: 1, misAJour: "2026-10-04", idees: [idea(["aaaaaa111111"])], ecartees: [{ ref: "bbbbbb222222", motif: "inexploitable" }] };
  box.write(data);
  const dry = reset.reset(box.root, { simulation: true, day: "2026-10-05" });
  equal([dry.ok, dry.removed.sort(), dry.kept], [true, ["aaaaaa111111", "bbbbbb222222"], ["cccccc333333"]], "simulation");
  equal(box.boxRefs(), ["aaaaaa111111", "bbbbbb222222", "cccccc333333"], "la simulation ne doit rien écrire");
  const r = reset.reset(box.root, { day: "2026-10-05" });
  assert(r.ok, "réinitialisation refusée : " + r.error);
  equal(box.boxRefs(), ["cccccc333333"], "seule l'idée non traitée reste");
  const after = box.read();
  equal([after.boiteReinitialisee, after.idees.length, after.idees[0].titre], ["2026-10-05", 1, "T"], "le rapport reste intact et daté");
  equal(collect.registryRefs(path.join(box.dir, "references.txt")).sort(), ["aaaaaa111111", "bbbbbb222222", "cccccc333333"], "le registre n'est jamais réduit");
  equal(checker.run(box.root), [], "état valide après réinitialisation");
  equal(checker.pending(after, checker.boxRefs(path.join(box.dir, "boite"))), ["cccccc333333"], "l'idée gardée attend la prochaine reformulation");
  assert(collect.knownRefs(path.join(box.dir, "boite"), path.join(box.dir, "references.txt")).has("aaaaaa111111"),
    "une idée retirée reste connue : la collecte ne la republiera pas");
  const again = reset.reset(box.root, { day: "2026-10-06" });
  assert(!again.ok && /déjà réinitialisée/.test(again.error), "seconde réinitialisation sans nouvelle reformulation : " + JSON.stringify(again));
});

check("réinitialisation : fichier vidé supprimé ; refus sans reformulation, sur un rapport invalide, ou sans idée couverte", () => {
  const box = sandbox([{ ref: "aaaaaa111111", text: "Seule" }]);
  box.write({ version: 1, misAJour: "", idees: [] });
  assert(/aucune reformulation/.test(reset.reset(box.root, { day: "2026-10-05" }).error), "sans reformulation publiée");
  box.write({ version: 1, misAJour: "2026-10-04", idees: [idea(["aaaaaa111111", "eeeeee555555"])] });
  assert(/ne passe pas le contrôle/.test(reset.reset(box.root, { day: "2026-10-05" }).error), "rapport invalide");
  equal(box.box(), ["2026-10-03.md"], "rien n'est retiré d'un état invalide");
  box.write({ version: 1, misAJour: "2026-10-04", idees: [idea(["aaaaaa111111"])] });
  const r = reset.reset(box.root, { day: "2026-10-03" });     // horloge UTC encore « la veille » du rapport
  assert(r.ok && r.deletedFiles.length === 1, "le fichier vidé doit être supprimé : " + JSON.stringify(r));
  equal(box.box(), [], "boîte vide");
  equal(box.read().boiteReinitialisee, "2026-10-04", "la date de réinitialisation ne précède jamais celle du rapport");
  equal(checker.run(box.root), [], "état valide");
  const empty = sandbox([{ ref: "aaaaaa111111", text: "A" }]);
  empty.write({ version: 1, misAJour: "2026-10-04", idees: [] });
  assert(/ne couvre aucune idée/.test(reset.reset(empty.root, { day: "2026-10-05" }).error), "rien à retirer");
});

check("après réinitialisation : un rapport incomplet, inventé ou daté à l'envers est refusé ; la reformulation suivante repart de la boîte", () => {
  const box = sandbox();
  box.write({ version: 1, misAJour: "2026-10-04", idees: [idea(["aaaaaa111111", "bbbbbb222222", "cccccc333333"])] });
  assert(reset.reset(box.root, { day: "2026-10-05" }).ok, "réinitialisation");
  const data = box.read();
  box.write(Object.assign({}, data, { idees: [idea(["aaaaaa111111", "ffffff666666"])] }));
  assert(checker.run(box.root).some((e) => /ffffff666666 absente du registre/.test(e)), "source inventée après réinitialisation");
  assert(checker.checkReformulated(Object.assign({}, data, { boiteReinitialisee: "2026-10-01" })).some((e) => /ne peut précéder/.test(e)), "date à l'envers");
  /* Une collecte arrive, puis une nouvelle reformulation qui oublierait de remplacer l'ancien rapport. */
  fs.writeFileSync(path.join(box.dir, "boite", "2026-10-06.md"), collect.render("2026-10-06", [{ ref: "999999aaaaaa", text: "Nouvelle" }], ""));
  collect.appendRegistry(path.join(box.dir, "references.txt"), ["999999aaaaaa"]);
  box.write({ version: 1, misAJour: "2026-10-07", boiteReinitialisee: "", idees: [idea(["aaaaaa111111"]), idea(["999999aaaaaa"], "r-2")] });
  assert(checker.run(box.root).some((e) => /aaaaaa111111 absente de idees\/boite/.test(e)), "l'ancien rapport doit être remplacé, pas prolongé");
  box.write({ version: 1, misAJour: "2026-10-07", boiteReinitialisee: "", idees: [idea(["999999aaaaaa"], "r-2")] });
  equal(checker.run(box.root), [], "nouveau rapport valide");
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
