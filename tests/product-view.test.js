/* BrainstO. — contrats produit purs de la roadmap.
 *
 * Exécution :
 *     node tests/product-view.test.js
 */
"use strict";

const ProductView = require("../js/product-view.js");

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(name + " → " + (error && error.message));
  }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) { throw new Error((message || "valeurs différentes") + " : " + a + " ≠ " + b); }
}

function topic(id, status, updatedAt) {
  return { id, status, updatedAt };
}

check("Accueil : la maturité crée quatre groupes explicites", () => {
  const groups = ProductView.groupTopics([
    topic("o1", "open", "2026-08-30T12:00:00Z"),
    topic("r1", "ready", "2026-08-28T12:00:00Z"),
    topic("c1", "closed", "2026-08-29T12:00:00Z"),
    topic("a1", "archived", "2026-08-30T13:00:00Z")
  ]);

  equal(groups.ready.map((x) => x.id), ["r1"]);
  equal(groups.open.map((x) => x.id), ["o1"]);
  equal(groups.closed.map((x) => x.id), ["c1"]);
  equal(groups.archived.map((x) => x.id), ["a1"]);
});

check("Accueil : l'activité récente trie uniquement à l'intérieur d'un groupe", () => {
  const groups = ProductView.groupTopics([
    topic("ancien-ready", "ready", "2026-08-20T12:00:00Z"),
    topic("recent-open", "open", "2026-08-30T12:00:00Z"),
    topic("recent-ready", "ready", "2026-08-29T12:00:00Z"),
    topic("ancien-open", "open", "2026-08-10T12:00:00Z")
  ]);

  equal(groups.ready.map((x) => x.id), ["recent-ready", "ancien-ready"]);
  equal(groups.open.map((x) => x.id), ["recent-open", "ancien-open"]);
});

check("Accueil : un ancien statut inconnu reste visible en discussion", () => {
  const groups = ProductView.groupTopics([
    topic("legacy", "unexpected", "2026-08-30T12:00:00Z")
  ]);

  equal(groups.open.map((x) => x.id), ["legacy"]);
});

check("Vote : faible participation reste explicitement mesurable", () => {
  const proposal = { votes: { p1: "for" } };
  const participation = ProductView.voteParticipation(proposal, 10);

  equal(participation, {
    voters: 1,
    total: 10,
    percent: 10,
    complete: false
  });
});

check("Vote : le tableau de participants peut servir de dénominateur", () => {
  const proposal = { votes: { p1: "for", p2: "abstain" } };
  const participation = ProductView.voteParticipation(proposal, [
    { id: "p1" }, { id: "p2" }, { id: "p3" }
  ]);

  equal(participation, {
    voters: 2,
    total: 3,
    percent: 67,
    complete: false
  });
});

check("Vote : sans effectif connu, aucun faux pourcentage de participation", () => {
  const participation = ProductView.voteParticipation({ votes: { p1: "for" } }, 0);
  assert(participation.voters === 1, "le vote existant doit rester compté");
  assert(participation.total === 0, "effectif connu attendu à zéro");
  assert(participation.percent === null, "aucun pourcentage ne doit être inventé");
  assert(participation.complete === false, "on ne peut pas déclarer la participation complète");
});

if (failures.length) {
  console.error("\nÉCHECS product-view :");
  failures.forEach((failure) => console.error("- " + failure));
  console.error("\n" + passed + " test(s) réussi(s), " + failures.length + " échec(s).");
  process.exit(1);
}

console.log("product-view : " + passed + " test(s) réussi(s).");
