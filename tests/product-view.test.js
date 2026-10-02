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

check("Accueil : un sujet épinglé passe en tête dans « Épinglés », une seule fois ; l'archive prime sur l'épingle ; la synthèse suit", () => {
  const list = [
    topic("o1", "open", "2026-08-30T12:00:00Z"),
    topic("p-ancien", "closed", "2026-08-01T12:00:00Z", { pinned: true }),
    topic("p-recent", "open", "2026-08-29T12:00:00Z", { pinned: true }),
    topic("a1", "archived", "2026-08-30T13:00:00Z", { pinned: true }),
    topic("faux", "open", "2026-08-31T12:00:00Z", { pinned: "true" })
  ];
  const groups = ProductView.groupTopics(list);
  equal(ProductView.TOPIC_GROUP_ORDER[0], "pinned", "« Épinglés » doit ouvrir l'accueil");
  equal(ProductView.TOPIC_GROUP_LABELS.pinned, "Épinglés");
  equal(groups.pinned.map((x) => x.id), ["p-recent", "p-ancien"], "épinglés, les plus actifs d'abord");
  equal(groups.open.map((x) => x.id), ["faux", "o1"], "un épinglé quitte son groupe ; « true » en texte n'épingle pas");
  equal(groups.closed.map((x) => x.id), [], "le clôturé épinglé n'est compté qu'une fois");
  equal(groups.archived.map((x) => x.id), ["a1"], "archivé et épinglé : reste dans les archives");
  equal(ProductView.meetingTopics(list).map((x) => x.id), ["p-recent", "p-ancien", "faux", "o1"], "la synthèse ouvre aussi sur les épinglés");
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
  assert(ProductView.voteAriaLabel(proposal, 10).indexOf("3 participants sur 10 ont voté") >= 0);
});

check("Vote : le pourcentage favorable exclut les abstentions", () => {
  const counts = ProductView.voteCounts({ votes: {
    p1: "for", p2: "against", p3: "abstain", p4: "abstain"
  } });
  assert(counts.favorablePercent === 50, "les abstentions ont contaminé le pourcentage favorable");
});

/* ------------------------------------------ Lecture des votes (§8, §10, D4) --- */

function people(n) { return Array.from({ length: n }, (_, i) => ({ id: "u" + i, name: "P" + i })); }
function ballot(nFor, nAgainst, nAbstain, extra) {
  const votes = {};
  let i = 0;
  for (let k = 0; k < nFor; k += 1) { votes["u" + (i++)] = "for"; }
  for (let k = 0; k < nAgainst; k += 1) { votes["u" + (i++)] = "against"; }
  for (let k = 0; k < nAbstain; k += 1) { votes["u" + (i++)] = "abstain"; }
  return { id: "p", title: "P", status: "voting", votes: Object.assign(votes, extra || {}) };
}

/* [cas, proposition, participants, positions, pourcentage, participation, tendance] */
const READINGS = [
  ["0 votant sur 8", ballot(0, 0, 0), people(8),
    "0 pour · 0 contre · 0 abstention", null, "0 participant sur 8 a voté", "Aucun vote"],
  ["1 votant sur 8 (singulier)", ballot(1, 0, 0), people(8),
    "1 pour · 0 contre · 0 abstention", "100 % favorables sur 1 avis exprimé", "1 participant sur 8 a voté", "Avis exprimés favorables"],
  ["exemple de la spec : 6 sur 8", ballot(3, 1, 2), people(8),
    "3 pour · 1 contre · 2 abstentions", "75 % favorables sur 4 avis exprimés", "6 participants sur 8 ont voté", "Avis exprimés plutôt favorables"],
  ["3 sur 4", ballot(1, 1, 1), people(4),
    "1 pour · 1 contre · 1 abstention", "50 % favorables sur 2 avis exprimés", "3 participants sur 4 ont voté", "Avis partagés"],
  ["1 sur 4", ballot(0, 1, 0), people(4),
    "0 pour · 1 contre · 0 abstention", "0 % favorables sur 1 avis exprimé", "1 participant sur 4 a voté", "Avis exprimés plutôt défavorables"],
  ["0 sur 4", ballot(0, 0, 0), people(4),
    "0 pour · 0 contre · 0 abstention", null, "0 participant sur 4 a voté", "Aucun vote"],
  ["1 pour + 9 abstentions", ballot(1, 0, 9), people(10),
    "1 pour · 0 contre · 9 abstentions", "100 % favorables sur 1 avis exprimé", "10 participants sur 10 ont voté", "Avis exprimés favorables"],
  ["tout abstention", ballot(0, 0, 3), people(8),
    "0 pour · 0 contre · 3 abstentions", "Aucun avis exprimé", "3 participants sur 8 ont voté", "Abstentions uniquement"],
  ["unanimité", ballot(4, 0, 0), people(4),
    "4 pour · 0 contre · 0 abstention", "100 % favorables sur 4 avis exprimés", "4 participants sur 4 ont voté", "Avis exprimés favorables"],
  ["égalité", ballot(2, 2, 0), people(5),
    "2 pour · 2 contre · 0 abstention", "50 % favorables sur 4 avis exprimés", "4 participants sur 5 ont voté", "Avis partagés"],
  ["arrondi 2 pour 1 contre", ballot(2, 1, 0), people(8),
    "2 pour · 1 contre · 0 abstention", "67 % favorables sur 3 avis exprimés", "3 participants sur 8 ont voté", "Avis exprimés plutôt favorables"],
  ["votant absent du registre (10 connus, 11 votants)", ballot(10, 0, 0, { "inconnu-hors-registre": "for" }), people(10),
    "11 pour · 0 contre · 0 abstention", "100 % favorables sur 11 avis exprimés", "11 participants sur 11 ont voté", "Avis exprimés favorables"],
  ["votants inconnus : 3 votants pour 2 inscrits", { votes: { inconnu: "for", u0: "for", u1: "against" } }, people(2),
    "2 pour · 1 contre · 0 abstention", "67 % favorables sur 3 avis exprimés", "3 participants sur 3 ont voté", "Avis exprimés plutôt favorables"],
  ["aucun participant connu, aucun vote", ballot(0, 0, 0), [],
    "0 pour · 0 contre · 0 abstention", null, null, "Aucun vote"]
];

READINGS.forEach(([name, proposal, participants, positions, favorable, participation, label]) => {
  check("Lecture des votes : " + name, () => {
    const reading = ProductView.voteReading(proposal, participants);
    equal(reading.positions.join(" · "), positions, "positions");
    equal(reading.favorable, favorable, "pourcentage");
    equal(reading.participation, participation, "participation");
    equal(reading.label, label, "tendance");
    const parts = [positions, favorable, participation].filter(Boolean);
    equal(reading.text, parts.join(" · "), "ligne de la carte");
    equal(reading.line, label + " · " + parts.join(" · "), "ligne de la synthèse");
    equal(reading.aria, label + ". " + reading.positions.concat([favorable, participation].filter(Boolean)).join(". ") + ".", "nom accessible");
    equal(ProductView.voteAriaLabel(proposal, participants), reading.aria, "voteAriaLabel = même calcul");
    assert(reading.total >= reading.voters, "dénominateur inférieur au nombre de votants");
  });
});

check("Lecture des votes : chaînes exactes de la carte, de la synthèse et du nom accessible", () => {
  const spec = ProductView.voteReading(ballot(3, 1, 2), people(8));
  equal(spec.text, "3 pour · 1 contre · 2 abstentions · 75 % favorables sur 4 avis exprimés · 6 participants sur 8 ont voté");
  equal(spec.line, "Avis exprimés plutôt favorables · 3 pour · 1 contre · 2 abstentions · 75 % favorables sur 4 avis exprimés · 6 participants sur 8 ont voté");
  equal(spec.aria, "Avis exprimés plutôt favorables. 3 pour. 1 contre. 2 abstentions. 75 % favorables sur 4 avis exprimés. 6 participants sur 8 ont voté.");
  const lone = ProductView.voteReading(ballot(1, 0, 9), people(10));
  equal(lone.text, "1 pour · 0 contre · 9 abstentions · 100 % favorables sur 1 avis exprimé · 10 participants sur 10 ont voté");
  equal(lone.line, "Avis exprimés favorables · 1 pour · 0 contre · 9 abstentions · 100 % favorables sur 1 avis exprimé · 10 participants sur 10 ont voté");
  const blank = ProductView.voteReading(ballot(0, 0, 3), people(8));
  equal(blank.line, "Abstentions uniquement · 0 pour · 0 contre · 3 abstentions · Aucun avis exprimé · 3 participants sur 8 ont voté");
  const none = ProductView.voteReading(ballot(0, 0, 0), people(8));
  equal(none.text, "0 pour · 0 contre · 0 abstention · 0 participant sur 8 a voté");
  const stranger = ProductView.voteReading(ballot(10, 0, 0, { "inconnu-hors-registre": "for" }), people(10));
  equal(stranger.text, "11 pour · 0 contre · 0 abstention · 100 % favorables sur 11 avis exprimés · 11 participants sur 11 ont voté");
});

check("Lecture des votes : jamais « n / T », « abst. », tiret cadratin, pourcentage seul ni « Avis partagés » hors égalité", () => {
  READINGS.forEach(([name, proposal, participants]) => {
    const r = ProductView.voteReading(proposal, participants);
    [r.text, r.line, r.aria].forEach((s) => {
      assert(!/\d+ \/ \d+/.test(s), name + " : forme « n / T » : " + s);
      assert(s.indexOf("abst.") < 0 && s.indexOf("\u2014") < 0 && s.indexOf("Consensus") < 0, name + " : " + s);
      assert(s.indexOf("%") < 0 || /% favorables sur \d+ avis exprimés?/.test(s), name + " : pourcentage lu seul : " + s);
    });
    const c = r.counts;
    assert((r.label === "Avis partagés") === (c.for === c.against && c.for > 0), name + " : tendance incohérente " + r.label);
  });
});

check("Vote : participation, un votant inconnu agrandit le dénominateur sans changer le cas courant", () => {
  equal(ProductView.voteParticipation({ votes: { inconnu: "for", u0: "for", u1: "against" } }, people(2)),
    { voters: 3, total: 3, percent: 100, complete: true });
  equal(ProductView.voteParticipation({ votes: { u0: "for" } }, people(8)),
    { voters: 1, total: 8, percent: 13, complete: false });
  equal(ProductView.voteParticipation({ votes: { a: "for", b: "for" } }, 1).total, 2, "effectif numérique dépassé");
  equal(ProductView.voteParticipation({ votes: { __proto__x: "for", constructor: "for" } }, [{ id: "constructor" }]).total, 2,
    "identifiants homonymes d'Object.prototype");
});

check("Synthèse : sujets dans l'ordre de maturité de l'accueil, archivés exclus", () => {
  const ordered = ProductView.meetingTopics([
    topic("open-ancien", "open", "2026-08-10T12:00:00Z"),
    topic("pret-ancien", "ready", "2026-08-11T12:00:00Z"),
    topic("clos", "closed", "2026-08-31T12:00:00Z"),
    topic("archive", "archived", "2026-09-01T12:00:00Z"),
    topic("open-recent", "open", "2026-08-30T12:00:00Z"),
    topic("pret-recent", "ready", "2026-08-29T12:00:00Z"),
    topic("statut-inconnu", "unexpected", "2026-08-20T12:00:00Z")
  ]);
  equal(ordered.map((x) => x.id), ["pret-recent", "pret-ancien", "open-recent", "statut-inconnu", "open-ancien", "clos"]);
  equal(ProductView.meetingTopics(null), []);
});

/* La carte et la synthèse de js/ui.js, et l'enrichissement de js/product-ui.js, prennent
 * leurs textes dans ProductView.voteReading : un seul calcul (garde statique). */
check("Lecture des votes : la carte, la synthèse et la couche produit utilisent le même calcul", () => {
  const fs = require("fs");
  const path = require("path");
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const body = (src, name) => {
    const start = src.indexOf("function " + name + "(");
    assert(start >= 0, name + " introuvable");
    const next = src.indexOf("\n  function ", start + 1);
    return src.slice(start, next < 0 ? src.length : next);
  };
  const ui = read("js/ui.js");
  const card = body(ui, "proposalCard");
  const meeting = body(ui, "screenMeeting");
  assert(card.indexOf("ProductView.voteReading(") >= 0, "la carte ne lit pas ProductView.voteReading");
  ["reading.positions[0]", "reading.positions[1]", "reading.positions[2]", "reading.favorable", "reading.participation", "\"aria-label\": reading.aria"]
    .forEach((needle) => assert(card.indexOf(needle) >= 0, "carte : " + needle + " absent"));
  assert(card.indexOf("% favorables") < 0 && card.indexOf("summary.label") < 0, "la carte compose encore ses propres textes de vote");
  assert(meeting.indexOf("ProductView.voteReading(") >= 0 && meeting.indexOf("reading.line") >= 0, "la synthèse ne lit pas ProductView.voteReading");
  assert(meeting.indexOf("abst.") < 0 && meeting.indexOf("summary.label") < 0, "la synthèse compose encore ses propres textes de vote");
  assert(meeting.indexOf("ProductView.meetingTopics(") >= 0, "la synthèse ne suit pas l'ordre de maturité");
  const productUi = read("js/product-ui.js");
  const enhance = body(productUi, "enhanceProposals");
  assert(enhance.indexOf("ProductView.voteReading(") >= 0 && enhance.indexOf("reading.aria") >= 0, "product-ui ne lit pas ProductView.voteReading");
  assert(!/" \/ " \+/.test(productUi), "product-ui compose encore « n / T »");
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

/* ---------------------------------------------------------------------------
 * WP-19 : recherche tolérante (BL-060) et tri par instants (BL-061).
 * ------------------------------------------------------------------------- */

const SEARCH_TOPICS = [
  topic("a", "open", "2026-09-20T08:00:00Z", { title: "Préparer la réunion de rentrée", description: "Ordre du jour" }),
  topic("b", "open", "2026-09-19T08:00:00Z", { title: "Commande   du samedi (urgent) [x]" }),
  topic("c", "ready", "2026-09-18T08:00:00Z", { title: "Café du matin", description: "À l'étage" }),
  topic("d", "open", "2026-09-17T08:00:00Z", { title: "Cœur de l'équipe" }),
  topic("e", "archived", "2026-09-16T08:00:00Z", { title: "Vieille réunion annulée" })
];

const idsOf = (list) => list.map((item) => item.id);
const found = (query, showArchived) => idsOf(ProductView.visibleTopics(SEARCH_TOPICS, query, !!showArchived));

check("Recherche : la casse, les accents et les espaces multiples sont ignorés (BL-060)", () => {
  equal(found("reunion"), ["a"], "sans accent");
  equal(found("REUNION"), ["a"], "majuscules sans accent");
  equal(found("RÉUNION"), ["a"], "majuscules accentuées");
  equal(found("réunion"), ["a"], "avec accent (comportement d'avant)");
  equal(found("commande du samedi"), ["b"], "espaces multiples du titre");
  equal(found("  commande    du   samedi  "), ["b"], "espaces multiples de la saisie");
  equal(found("cafe"), ["c"], "cafe");
  equal(found("CAFÉ"), ["c"], "CAFÉ");
  equal(found("etage"), ["c"], "la description compte aussi");
  equal(found("rentree ordre"), ["a"], "titre et description sont joints par une espace");
  equal(found("coeur"), ["d"], "ligature œ");
  equal(found("CŒUR"), ["d"], "ligature Œ");
});

check("Recherche : caractères spéciaux littéraux, saisie vide sans filtre, archivés à la demande", () => {
  equal(found("(urgent)"), ["b"]);
  equal(found("[x]"), ["b"]);
  equal(found(".*"), []);
  equal(found("\\"), []);
  equal(found("+?"), []);
  equal(found("reunions"), []);
  equal(found(""), ["a", "b", "c", "d"]);
  equal(found("   "), ["a", "b", "c", "d"]);
  equal(found(null), ["a", "b", "c", "d"]);
  equal(found("reunion", true), ["a", "e"], "archivés affichables");
});

check("Recherche : normalizeSearch plie la casse, les accents, les ligatures et les espaces", () => {
  equal(ProductView.normalizeSearch("  É  l  È ve "), "e l e ve");
  equal(ProductView.normalizeSearch("Œuvre, Æther"), "oeuvre, aether");
  equal(ProductView.normalizeSearch("ÇA va"), "ca va");
  equal(ProductView.normalizeSearch("a\n\tb"), "a b");
  equal(ProductView.normalizeSearch(null), "");
  equal(ProductView.normalizeSearch(undefined), "");
});

check("Tri : par instants, date illisible en dernier, égalité = ordre d'entrée (BL-061)", () => {
  const list = [
    topic("invalide", "open", "pas une date"),
    topic("valide", "open", "2026-09-30T09:00:00Z"),
    topic("absent", "open", undefined),
    topic("vide", "open", ""),
    topic("nombre", "open", 1790000000000),
    topic("objet", "open", {})
  ];
  const order = idsOf(ProductView.groupTopics(list).open);
  equal(order, ["valide", "invalide", "absent", "vide", "nombre", "objet"]);
  equal(idsOf(ProductView.visibleTopics(list, "", false)), order, "même ordre pour l'accueil");
  equal(idsOf(ProductView.meetingTopics(list)), order, "même ordre pour la synthèse");
});

check("Tri : décalages horaires, millisecondes et date seule comparés comme des instants", () => {
  equal(idsOf(ProductView.groupTopics([
    topic("plus2h-0800Z", "open", "2026-09-30T10:00:00+02:00"),
    topic("z-0900Z", "open", "2026-09-30T09:00:00Z"),
    topic("moins5h-1000Z", "open", "2026-09-30T05:00:00-05:00")
  ]).open), ["moins5h-1000Z", "z-0900Z", "plus2h-0800Z"]);
  const same = [
    topic("p", "open", "2026-09-30T09:00:00Z"),
    topic("q", "open", "2026-09-30T11:00:00+02:00"),
    topic("r", "open", "2026-09-30T09:00:00.000Z")
  ];
  equal(idsOf(ProductView.groupTopics(same).open), ["p", "q", "r"], "instants égaux : ordre d'entrée");
  equal(idsOf(ProductView.groupTopics(same.slice().reverse()).open), ["r", "q", "p"], "idem à l'envers");
  equal(idsOf(ProductView.groupTopics([
    topic("s", "open", "2026-09-30T09:00:00Z"),
    topic("t", "open", "2026-09-30T09:00:00.500Z"),
    topic("u", "open", "2026-09-29T23:00:00Z"),
    topic("v", "open", "2026-09-30")
  ]).open), ["t", "s", "v", "u"], "millisecondes et date seule (minuit UTC)");
});

check("Une seule règle de recherche et de tri pour l'accueil, le regroupement et js/product-ui.js (BL-060, BL-061)", () => {
  const fs = require("fs");
  const path = require("path");
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const ui = read("js/ui.js");
  const from = ui.indexOf("function screenTopics()");
  assert(from > 0, "screenTopics introuvable dans js/ui.js");
  const to = ui.indexOf("\n  function ", from + 10);
  const body = ui.slice(from, to > 0 ? to : undefined);
  assert(body.indexOf("ProductView.visibleTopics(") >= 0, "l'accueil doit appeler ProductView.visibleTopics");
  assert(!/toLowerCase|localeCompare|\.sort\(/.test(body), "l'accueil ne doit plus filtrer ni trier lui-même");
  assert(read("js/product-ui.js").indexOf("ProductView.visibleTopics(") >= 0, "js/product-ui.js doit appeler ProductView.visibleTopics");
  assert(read("js/product-view.js").indexOf("localeCompare") < 0, "js/product-view.js : plus de tri par chaînes");
});

if (failures.length) {
  console.error("\nÉCHECS product-view :");
  failures.forEach((failure) => console.error("- " + failure));
  console.error("\n" + passed + " test(s) réussi(s), " + failures.length + " échec(s).");
  process.exit(1);
}

console.log("product-view : " + passed + " test(s) réussi(s).");
