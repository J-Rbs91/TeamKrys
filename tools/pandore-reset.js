#!/usr/bin/env node
/* BrainstO. — remise à zéro de Pandore, SUR DEMANDE, après publication d'une synthèse automatique.
 *
 *     node tools/pandore-reset.js --simulation    ce qui serait retiré, sans rien écrire
 *     node tools/pandore-reset.js                 retire
 *
 * Retire de pandore/depots/ chaque dépôt que la synthèse courante (pandore/synthese.json) a traité, synthétisé ou
 * écarté, et supprime les fichiers devenus vides. Puis date la remise à zéro (`remiseAZero`) : la synthèse reste
 * affichée dans l'application, telle quelle, jusqu'à la suivante.
 *
 * Invariants :
 *   - un dépôt que la synthèse ne couvre pas RESTE (arrivé après la synthèse) ;
 *   - le registre pandore/references.txt n'est jamais touché : il garde la trace de tout ce qui a été publié ;
 *   - rien n'est fait si la synthèse n'est pas valide, déjà remise à zéro, ou ne couvre aucun dépôt présent.
 * Le script n'appelle pas git : vérifier que la synthèse est publiée, committer et pousser restent des étapes de la
 * procédure (.claude/skills/pandore/SKILL.md). Rien n'est effacé de l'historique Git. */
"use strict";

const fs = require("fs");
const path = require("path");
const collect = require("./pandore-collect.js");
const checker = require("./pandore-check.js");

const ROOT = path.join(__dirname, "..");

function today() { return new Date().toISOString().slice(0, 10); }

/* Calcule (et, sauf simulation, applique) la remise à zéro. Rend { ok, error?, removed, kept, deletedFiles, rewrittenFiles }. */
function reset(root, options) {
  const opts = options || {};
  const dir = path.join(root || ROOT, "pandore");
  const boxDir = path.join(dir, "depots");
  const file = path.join(dir, "synthese.json");
  const refuse = (error) => ({ ok: false, error, removed: [], kept: [], deletedFiles: [], rewrittenFiles: [] });

  const errors = checker.run(root || ROOT);
  if (errors.length) { return refuse("Pandore ne passe pas le contrôle, rien n'est retiré :\n  " + errors.join("\n  ")); }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!data.date) { return refuse("aucune synthèse publiée : rien ne peut être retiré."); }
  if (data.remiseAZero) { return refuse("déjà remise à zéro le " + data.remiseAZero + " ; une nouvelle synthèse doit précéder."); }

  const covered = new Set();
  data.points.forEach((p) => p.sources.forEach((r) => covered.add(r)));
  (data.ecartes || []).forEach((e) => covered.add(e.ref));

  const result = { ok: true, removed: [], kept: [], deletedFiles: [], rewrittenFiles: [] };
  const writes = [];
  (fs.existsSync(boxDir) ? fs.readdirSync(boxDir) : []).filter((f) => f.endsWith(".md")).sort().forEach((name) => {
    const target = path.join(boxDir, name);
    const box = collect.parseBox(fs.readFileSync(target, "utf8"));
    const keep = box.blocks.filter((b) => !covered.has(b.ref));
    box.blocks.filter((b) => covered.has(b.ref)).forEach((b) => result.removed.push(b.ref));
    keep.forEach((b) => result.kept.push(b.ref));
    if (keep.length === box.blocks.length) { return; }
    if (keep.length) {
      result.rewrittenFiles.push(name);
      writes.push(() => fs.writeFileSync(target, collect.serializeBox(box.header, keep)));
    } else {
      result.deletedFiles.push(name);
      writes.push(() => fs.unlinkSync(target));
    }
  });
  if (!result.removed.length) { return refuse("la synthèse ne couvre aucun dépôt présent : rien à retirer."); }

  /* La remise à zéro suit toujours la synthèse. Une horloge en UTC peut pourtant être encore « la veille » d'une
   * synthèse datée à l'heure de Paris, autour de minuit : la date ne recule jamais sous celle de la synthèse. */
  const day = opts.day || today();
  const stamp = day < data.date ? data.date : day;
  if (opts.simulation) { return result; }
  writes.forEach((w) => w());
  data.remiseAZero = stamp;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  const after = checker.run(root || ROOT);
  if (after.length) { return Object.assign(result, { ok: false, error: "contrôle en échec APRÈS remise à zéro :\n  " + after.join("\n  ") }); }
  return result;
}

module.exports = { reset };

if (require.main === module) {
  const simulation = process.argv.includes("--simulation");
  const r = reset(ROOT, { simulation });
  if (!r.ok) {
    console.error("✗ Remise à zéro refusée : " + r.error);
    process.exit(1);
  }
  const verb = simulation ? "seraient retirés" : "retirés";
  console.log(r.removed.length + " dépôt(s) " + verb + " de pandore/depots/.");
  if (r.deletedFiles.length) { console.log("Fichiers " + (simulation ? "à supprimer" : "supprimés") + " : " + r.deletedFiles.join(", ")); }
  if (r.rewrittenFiles.length) { console.log("Fichiers " + (simulation ? "à réécrire" : "réécrits") + " : " + r.rewrittenFiles.join(", ")); }
  console.log(r.kept.length + " dépôt(s) gardé(s) : arrivés après la synthèse, ils attendent la suivante.");
  if (simulation) { console.log("Simulation : rien n'a été écrit."); }
}
