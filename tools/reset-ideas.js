#!/usr/bin/env node
/* BrainstO. — réinitialisation de la boîte à idées, SUR DEMANDE, après publication d'une reformulation.
 *
 *     node tools/reset-ideas.js --simulation    ce qui serait retiré, sans rien écrire
 *     node tools/reset-ideas.js                 retire
 *
 * Retire de idees/boite/ chaque idée brute que la reformulation courante (idees/reformulees.json) a traitée,
 * reformulée ou écartée, et supprime les fichiers devenus vides. Puis date la réinitialisation
 * (`boiteReinitialisee`) : la reformulation reste affichée dans l'application, telle quelle, jusqu'à la suivante.
 *
 * Invariants :
 *   - une idée que la reformulation ne couvre pas RESTE dans la boîte (arrivée après la reformulation) ;
 *   - le registre idees/references.txt n'est jamais touché : il garde la trace de tout ce qui a été publié ;
 *   - rien n'est fait si la reformulation n'est pas valide, déjà réinitialisée, ou ne couvre aucune idée présente.
 * Le script n'appelle pas git : vérifier que la reformulation est publiée, committer et pousser restent des étapes
 * de la procédure (.claude/skills/boite-a-idees/SKILL.md). Rien n'est effacé de l'historique Git. */
"use strict";

const fs = require("fs");
const path = require("path");
const collect = require("./collect-ideas.js");
const checker = require("./check-ideas.js");

const ROOT = path.join(__dirname, "..");

function today() { return new Date().toISOString().slice(0, 10); }

/* Calcule (et, sauf simulation, applique) la réinitialisation. Rend { ok, error?, removed, kept, deletedFiles, rewrittenFiles }. */
function reset(root, options) {
  const opts = options || {};
  const dir = path.join(root || ROOT, "idees");
  const boxDir = path.join(dir, "boite");
  const file = path.join(dir, "reformulees.json");
  const refuse = (error) => ({ ok: false, error, removed: [], kept: [], deletedFiles: [], rewrittenFiles: [] });

  const errors = checker.run(root || ROOT);
  if (errors.length) { return refuse("la boîte ne passe pas le contrôle, rien n'est retiré :\n  " + errors.join("\n  ")); }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!data.misAJour) { return refuse("aucune reformulation publiée : rien ne peut être retiré."); }
  if (data.boiteReinitialisee) { return refuse("boîte déjà réinitialisée le " + data.boiteReinitialisee + " ; une nouvelle reformulation doit précéder."); }

  const covered = new Set();
  data.idees.forEach((i) => i.sources.forEach((r) => covered.add(r)));
  (data.ecartees || []).forEach((e) => covered.add(e.ref));

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
  if (!result.removed.length) { return refuse("la reformulation ne couvre aucune idée présente dans la boîte : rien à retirer."); }

  /* La réinitialisation suit toujours la reformulation. Une horloge en UTC peut pourtant être encore « la veille »
   * d'une reformulation datée à l'heure de Paris, autour de minuit : la date ne recule jamais sous celle du rapport. */
  const day = opts.day || today();
  const stamp = day < data.misAJour ? data.misAJour : day;
  if (opts.simulation) { return result; }
  writes.forEach((w) => w());
  data.boiteReinitialisee = stamp;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  const after = checker.run(root || ROOT);
  if (after.length) { return Object.assign(result, { ok: false, error: "contrôle en échec APRÈS réinitialisation :\n  " + after.join("\n  ") }); }
  return result;
}

module.exports = { reset };

if (require.main === module) {
  const simulation = process.argv.includes("--simulation");
  const r = reset(ROOT, { simulation });
  if (!r.ok) {
    console.error("✗ Réinitialisation refusée : " + r.error);
    process.exit(1);
  }
  const verb = simulation ? "seraient retirées" : "retirées";
  console.log(r.removed.length + " idée(s) brute(s) " + verb + " de idees/boite/.");
  if (r.deletedFiles.length) { console.log("Fichiers " + (simulation ? "à supprimer" : "supprimés") + " : " + r.deletedFiles.join(", ")); }
  if (r.rewrittenFiles.length) { console.log("Fichiers " + (simulation ? "à réécrire" : "réécrits") + " : " + r.rewrittenFiles.join(", ")); }
  console.log(r.kept.length + " idée(s) gardée(s) : arrivées après la reformulation, elles attendent la suivante.");
  if (simulation) { console.log("Simulation : rien n'a été écrit."); }
}
