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
  try { fn(); passed += 1; }
  catch (error) { failures.push(name + " → " + (error && error.message)); }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) { throw new Error((message || "valeurs différentes") + " : " + a + " ≠ " + b); }
}

function topic(id, status, updatedAt, extra) {
  return Object.assign({
    id, status, updatedAt,
    title: id, description: "",
    messages: [], proposals: [], conclusions: [], conclusionVotes: {}
  }, extra || {});
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

check("Accueil : recherche et archives gardent le contrat historique", () => {
  const topics = [
    topic("ready", "ready", "2026-08-28T12:00:00Z", { title: "Commande jeudi" }),
    topic("open", "open", "2026-08-30T12:00:00Z", { description: "Stock samedi" }),
    topic("archive", "archived", "2026-08-31T12:00:00Z", { title: "Commande ancienne" })
  ];
  equal(ProductView.visibleTopics(topics, "commande", false).map((x) => x.id), ["ready"]);
  equal(ProductView.visibleTopics(topics, "commande", true).map((x) => x.id), ["archive", "ready"]);
});

check("Accueil : un ancien statut inconnu reste visible en discussion", () => {
  const groups = ProductView.groupTopics([topic("legacy", "unexpected", "2026-08-30T12:00:00Z")]);
  equal(groups.open.map((x) => x.id), ["legacy"]);
});

check("Vote : faible participation reste explicitement mesurable", () => {
  equal(ProductView.voteParticipation({ votes: { p1: "for" } }, 10), {
    voters: 1, total: 10, percent: 10, complete: false
  });
});

check("Vote : le tableau de participants peut servir de dénominateur", () => {
  equal(ProductView.voteParticipation({ votes: { p1: "for", p2: "abstain" } }, [
    { id: "p1" }, { id: "p2" }, { id: "p3" }
  ]), { voters: 2, total: 3, percent: 67, complete: false });
});

check("Vote : sans effectif connu, aucun faux pourcentage de participation", () => {
  const participation = ProductView.voteParticipation({ votes: { p1: "for" } }, 0);
  assert(participation.voters === 1);
  assert(participation.total === 0);
  assert(participation.percent === null);
  assert(participation.complete === false);
});

check("Vote : Consensus n'est jamais un verdict automatique de proposition", () => {
  const proposal = { votes: { p1: "for", p2: "abstain", p3: "abstain" } };
  assert(ProductView.voteLabel(proposal) === "Avis exprimés favorables");
  assert(ProductView.voteLabel(proposal).indexOf("Consensus") < 0);
  assert(ProductView.voteAriaLabel(proposal, 10).indexOf("3 sur 10 participants ont voté") >= 0);
});

check("Vote : le pourcentage favorable exclut les abstentions", () => {
  const counts = ProductView.voteCounts({ votes: {
    p1: "for", p2: "against", p3: "abstain", p4: "abstain"
  } });
  assert(counts.favorablePercent === 50, "les abstentions ont contaminé le pourcentage favorable");
});

check("Nouveautés : la première baseline n'invente rien", () => {
  const t = topic("t1", "open", "2026-08-30T12:00:00Z", { messages: [{ id: "m1" }] });
  const activity = ProductView.topicActivity(t, null, false);
  assert(activity.changed === false);
});

check("Nouveautés : un sujet créé après la baseline est signalé", () => {
  const activity = ProductView.topicActivity(topic("t2", "open", "2026-08-30T12:00:00Z"), null, true);
  equal({ changed: activity.changed, label: activity.label }, { changed: true, label: "Nouveau sujet" });
});

check("Nouveautés : messages, votes et Consensus ont des signaux distincts", () => {
  const base = topic("t1", "open", "2026-08-30T12:00:00Z");
  const seen = ProductView.topicFingerprint(base);

  const withMessage = topic("t1", "open", "2026-08-30T13:00:00Z", { messages: [{ id: "m1" }] });
  assert(ProductView.topicActivity(withMessage, seen, true).label === "+1 message");

  const withVote = topic("t1", "open", "2026-08-30T13:00:00Z", {
    proposals: [{ id: "p1", votes: { u1: "for" } }]
  });
  const seenProposal = ProductView.topicFingerprint(topic("t1", "open", "2026-08-30T12:00:00Z", {
    proposals: [{ id: "p1", votes: {} }]
  }));
  assert(ProductView.topicActivity(withVote, seenProposal, true).label === "Votes mis à jour");

  const withConsensus = topic("t1", "open", "2026-08-30T13:00:00Z", {
    conclusions: [{ id: "c1" }]
  });
  assert(ProductView.topicActivity(withConsensus, seen, true).label === "Consensus mis à jour");
});

check("Propositions : seuls les statuts de maturation restent proposés", () => {
  equal(ProductView.PROPOSAL_STATUS_SELECTABLE, ["voting", "debate", "rejected"]);
  assert(ProductView.isProposalStatusSelectable("selected") === false);
  assert(ProductView.isProposalStatusSelectable("implemented") === false);
  assert(ProductView.PROPOSAL_LEGACY_LABELS.selected.indexOf("ancien statut") >= 0);
  assert(ProductView.PROPOSAL_LEGACY_LABELS.implemented.indexOf("ancien statut") >= 0);
});

if (failures.length) {
  console.error("\nÉCHECS product-view :");
  failures.forEach((failure) => console.error("- " + failure));
  console.error("\n" + passed + " test(s) réussi(s), " + failures.length + " échec(s).");
  process.exit(1);
}

console.log("product-view : " + passed + " test(s) réussi(s).");
