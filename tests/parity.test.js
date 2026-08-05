/* BrainstO. — tests de non-régression et de PARITÉ client / serveur.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/parity.test.js
 *
 * Ces tests couvrent action par action la logique que le backend Google Apps
 * Script doit reproduire à l'identique (ensureShape / validateAction /
 * applyAction), ainsi que les vecteurs de hachage partagés : le script Apps
 * Script expose une fonction runSelfTest() qui vérifie EXACTEMENT les mêmes
 * valeurs de référence (piège des octets signés de Utilities.computeDigest).
 */
"use strict";

require("../js/config.js");
const Utils = require("../js/utils.js");
const { Core } = require("../js/state.js");

const NOW = "2026-01-01T10:00:00.000Z";
const LATER = "2026-01-01T11:00:00.000Z";

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(
        () => { passed += 1; },
        (error) => { failures.push(name + " → " + (error && error.message)); }
      );
    }
    passed += 1;
  } catch (error) {
    failures.push(name + " → " + (error && error.message));
  }
  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) { throw new Error((message || "valeurs différentes") + " : " + a + " ≠ " + b); }
}

function action(type, payload, actor) {
  return {
    id: "act-" + Math.random().toString(36).slice(2),
    type: type,
    actorId: actor && actor.id !== undefined ? actor.id : "p1",
    actorName: actor && actor.name !== undefined ? actor.name : "Alice",
    ts: NOW,
    payload: payload || {}
  };
}

function apply(state, type, payload, actor, now) {
  const result = Core.reduce(state, action(type, payload, actor), now || NOW);
  assert(result.ok, "action refusée : " + type + " → " + result.error);
  return state;
}

/* Un état de départ complet : un sujet, deux messages, une proposition, une conclusion. */
function seed() {
  const state = Core.emptyState();
  apply(state, "REGISTER_PARTICIPANT", { participantId: "p1", name: "Alice" });
  apply(state, "REGISTER_PARTICIPANT", { participantId: "p2", name: "Bruno" }, { id: "p2", name: "Bruno" });
  apply(state, "CREATE_TOPIC", { topicId: "t1", title: "Réassort du rayon", description: "Trop de ruptures." });
  apply(state, "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Il manque du stock le samedi." });
  apply(state, "CREATE_MESSAGE", { topicId: "t1", messageId: "m2", text: "D'accord avec toi.", quoteId: "m1" },
    { id: "p2", name: "Bruno" });
  apply(state, "CREATE_PROPOSAL", { topicId: "t1", proposalId: "pr1", title: "Commander le jeudi", description: "" });
  apply(state, "ADD_CONCLUSION", { topicId: "t1", conclusionId: "c1", text: "On avance la commande." });
  return state;
}

const tests = [];

/* ------------------------------------------------------------- Hachage --- */

tests.push(() => check("SHA-256 : vecteur de référence public", async () => {
  /* Vecteur standard : le condensat commence par 0xba (> 127). Un backend qui
   * oublie de convertir les octets SIGNÉS d'Utilities.computeDigest échoue ici. */
  const hex = await Utils.sha256Hex("abc");
  equal(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256(abc)");
}));

tests.push(() => check("SHA-256 : accents et UTF-8", async () => {
  /* Le backend doit encoder la chaîne en UTF-8 (Utilities.Charset.UTF_8). */
  const hex = await Utils.sha256Hex("réunion");
  equal(hex, "8c85d3fa84b7926e2e0664129cefa7ea17401086243561611c56ee5016908ea1", "SHA-256(réunion)");
  assert(/^[0-9a-f]{64}$/.test(hex), "hexadécimal minuscule sur 64 caractères attendu");
}));

tests.push(() => check("Jeton serveur et vérificateur local sont DIFFÉRENTS", async () => {
  /* « vecteur-de-test » n'est pas un code d'accès : c'est une entrée de test. */
  const token = await Utils.sha256Hex(CONFIG.serverTokenInput("vecteur-de-test"));
  const verifier = await Utils.sha256Hex(CONFIG.verifierInput("vecteur-de-test"));
  assert(token !== verifier, "le vérificateur ne doit jamais valoir le jeton serveur");
  assert(/^[0-9a-f]{64}$/.test(token) && /^[0-9a-f]{64}$/.test(verifier), "format hexadécimal attendu");
}));

/* --------------------------------------------------------- ensureShape --- */

tests.push(() => check("ensureShape : ne plante pas sur des données absentes", () => {
  const state = Core.ensureShape(null);
  equal(state.topics, []);
  equal(state.participants, []);
  equal(state.revision, 0);
}));

tests.push(() => check("ensureShape : migration douce d'un ancien JSON", () => {
  const state = Core.ensureShape({
    topics: [{
      id: "t1", title: "Ancien sujet",
      messages: [{ id: "m1", text: "Bonjour", authorName: "Alice", authorId: "p1" }],
      proposals: [{ id: "pr1", title: "Idée", votes: { p1: "pour" } }],
      conclusions: [{ id: "c1", text: "Fait" }],
      conclusionVotes: { p1: "c-inexistante" }
    }]
  });
  const topic = state.topics[0];
  equal(topic.status, "open", "statut recréé");
  equal(topic.createdBy, { id: "", name: "Anonyme" }, "createdBy recréé");
  equal(topic.messages[0].reactions, {}, "réactions recréées");
  equal(topic.messages[0].anon, false);
  equal(topic.messages[0].quoteId, null);
  equal(topic.proposals[0].status, "voting", "statut de proposition recréé");
  equal(topic.proposals[0].votes, {}, "vote invalide écarté");
  equal(topic.conclusions[0].source, "manual");
  equal(topic.conclusionVotes, {}, "vote vers une conclusion disparue écarté");
}));

tests.push(() => check("ensureShape : citation orpheline neutralisée", () => {
  const state = Core.ensureShape({
    topics: [{ id: "t1", title: "T", messages: [{ id: "m1", text: "a", quoteId: "disparu" }] }]
  });
  equal(state.topics[0].messages[0].quoteId, null);
}));

tests.push(() => check("ensureShape : réaction non autorisée écartée", () => {
  const state = Core.ensureShape({
    topics: [{ id: "t1", title: "T", messages: [{ id: "m1", text: "a", reactions: { p1: "🔥", p2: "👌" } }] }]
  });
  equal(state.topics[0].messages[0].reactions, { p2: "👌" });
}));

/* ---------------------------------------------------------- Participants --- */

tests.push(() => check("REGISTER_PARTICIPANT puis UPDATE_PARTICIPANT propage le nom", () => {
  const state = seed();
  apply(state, "UPDATE_PARTICIPANT", { participantId: "p1", name: "Alice D." });
  equal(state.participants[0].name, "Alice D.");
  equal(Core.findTopic(state, "t1").messages[0].authorName, "Alice D.");
  equal(Core.findTopic(state, "t1").proposals[0].authorName, "Alice D.");
  equal(Core.findTopic(state, "t1").conclusions[0].authorName, "Alice D.");
}));

tests.push(() => check("UPDATE_PARTICIPANT ne touche pas les messages anonymes", () => {
  const state = seed();
  apply(state, "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: true });
  apply(state, "UPDATE_PARTICIPANT", { participantId: "p1", name: "Alice D." });
  const message = Core.findMessage(Core.findTopic(state, "t1"), "m1");
  equal(message.authorName, "Anonyme");
  equal(message.authorId, "");
}));

/* ---------------------------------------------------------------- Sujets --- */

tests.push(() => check("CREATE_TOPIC anonyme n'enregistre aucune identité", () => {
  const state = Core.emptyState();
  apply(state, "CREATE_TOPIC", { topicId: "t9", title: "Sujet", anon: true });
  equal(state.topics[0].createdBy, { id: "", name: "Anonyme" });
}));

tests.push(() => check("CREATE_TOPIC refuse un titre vide et un doublon", () => {
  const state = seed();
  assert(!Core.validateAction(state, action("CREATE_TOPIC", { topicId: "t2", title: "  " })).ok, "titre vide accepté");
  assert(!Core.validateAction(state, action("CREATE_TOPIC", { topicId: "t1", title: "Bis" })).ok, "doublon accepté");
}));

tests.push(() => check("CHANGE_TOPIC_STATUS n'accepte que les statuts connus", () => {
  const state = seed();
  apply(state, "CHANGE_TOPIC_STATUS", { topicId: "t1", status: "archived" });
  equal(Core.findTopic(state, "t1").status, "archived");
  assert(!Core.validateAction(state, action("CHANGE_TOPIC_STATUS", { topicId: "t1", status: "zzz" })).ok);
}));

tests.push(() => check("UPDATE_TOPIC tronque aux limites de saisie", () => {
  const state = seed();
  apply(state, "UPDATE_TOPIC", { topicId: "t1", title: "x".repeat(400), description: "y".repeat(4000) });
  const topic = Core.findTopic(state, "t1");
  equal(topic.title.length, Core.LIMITS.topicTitle);
  equal(topic.description.length, Core.LIMITS.topicDescription);
}));

/* -------------------------------------------------------------- Messages --- */

tests.push(() => check("CREATE_MESSAGE avec citation valide", () => {
  const state = seed();
  equal(Core.findMessage(Core.findTopic(state, "t1"), "m2").quoteId, "m1");
  assert(!Core.validateAction(state, action("CREATE_MESSAGE", { topicId: "t1", messageId: "m3", text: "a", quoteId: "zz" })).ok,
    "citation inexistante acceptée");
}));

tests.push(() => check("CREATE_MESSAGE anonyme efface l'identité", () => {
  const state = seed();
  apply(state, "CREATE_MESSAGE", { topicId: "t1", messageId: "m5", text: "Discret", anon: true },
    { id: "", name: "Anonyme" });
  const message = Core.findMessage(Core.findTopic(state, "t1"), "m5");
  equal(message.authorId, "");
  equal(message.authorName, "Anonyme");
  equal(message.anon, true);
}));

tests.push(() => check("SET_MESSAGE_SIGNATURE : anonyme puis re-signature", () => {
  const state = seed();
  apply(state, "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: true });
  let message = Core.findMessage(Core.findTopic(state, "t1"), "m1");
  equal(message.authorId, "");
  equal(message.authorName, "Anonyme");
  apply(state, "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: false });
  message = Core.findMessage(Core.findTopic(state, "t1"), "m1");
  equal(message.authorId, "p1");
  equal(message.authorName, "Alice");
}));

tests.push(() => check("UPDATE_MESSAGE verrouillé par la réaction d'un AUTRE", () => {
  const state = seed();
  /* Ma propre réaction ne verrouille pas. */
  apply(state, "SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "👌" });
  assert(Core.validateAction(state, action("UPDATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "v2" })).ok,
    "ma réaction ne doit pas verrouiller");
  /* La réaction de quelqu'un d'autre verrouille. */
  apply(state, "SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "💪" }, { id: "p2", name: "Bruno" });
  const check1 = Core.validateAction(state, action("UPDATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "v3" }));
  assert(!check1.ok, "le verrou n'a pas fonctionné");
  /* La signature reste modifiable malgré le verrou. */
  assert(Core.validateAction(state, action("SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: true })).ok,
    "la signature doit rester modifiable");
}));

tests.push(() => check("SET_REACTION : une par personne, re-clic = retrait", () => {
  const state = seed();
  apply(state, "SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "👌" });
  equal(Core.findMessage(Core.findTopic(state, "t1"), "m1").reactions, { p1: "👌" });
  apply(state, "SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "💪" });
  equal(Core.findMessage(Core.findTopic(state, "t1"), "m1").reactions, { p1: "💪" }, "une seule réaction par personne");
  apply(state, "SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "💪" });
  equal(Core.findMessage(Core.findTopic(state, "t1"), "m1").reactions, {}, "re-clic = retrait");
}));

tests.push(() => check("SET_REACTION refuse un emoji hors liste", () => {
  const state = seed();
  assert(!Core.validateAction(state, action("SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "🔥" })).ok);
  Core.REACTIONS.forEach((emoji) => {
    assert(Core.validateAction(state, action("SET_REACTION", { topicId: "t1", messageId: "m1", emoji: emoji })).ok,
      "emoji autorisé refusé : " + emoji);
  });
  equal(Core.REACTIONS, ["👌", "💪", "🤏", "👎", "💩"]);
  /* « 🤞 » a été retiré du jeu : il doit désormais être refusé comme n'importe
   * quelle valeur inconnue. Le backend doit appliquer la même liste. */
  assert(!Core.validateAction(state, action("SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "🤞" })).ok);
}));

tests.push(() => check("Une réaction retirée du jeu est ignorée à la lecture", () => {
  /* Cas réel de transition : un appareil resté sur une version antérieure a
   * écrit « 🤞 » dans le JSON. On l'ignore silencieusement — surtout pas de
   * conversion vers une autre réaction, qui trahirait l'avis de la personne. */
  const migrated = Core.ensureShape({
    topics: [{
      id: "t1", title: "Sujet",
      messages: [{ id: "m1", text: "Bonjour", reactions: { p1: "🤞", p2: "👌" } }]
    }]
  });
  const reactions = migrated.topics[0].messages[0].reactions;
  equal(reactions, { p2: "👌" });
}));

/* ---------------------------------------------------------- Propositions --- */

tests.push(() => check("SET_VOTE : un vote par personne, re-clic = retrait", () => {
  const state = seed();
  apply(state, "SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "for" });
  equal(Core.findProposal(Core.findTopic(state, "t1"), "pr1").votes, { p1: "for" });
  apply(state, "SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "against" });
  equal(Core.findProposal(Core.findTopic(state, "t1"), "pr1").votes, { p1: "against" });
  apply(state, "SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "against" });
  equal(Core.findProposal(Core.findTopic(state, "t1"), "pr1").votes, {});
  assert(!Core.validateAction(state, action("SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "peut-être" })).ok);
}));

tests.push(() => check("REMOVE_VOTE retire uniquement mon vote", () => {
  const state = seed();
  apply(state, "SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "for" });
  apply(state, "SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "for" }, { id: "p2", name: "Bruno" });
  apply(state, "REMOVE_VOTE", { topicId: "t1", proposalId: "pr1" });
  equal(Core.findProposal(Core.findTopic(state, "t1"), "pr1").votes, { p2: "for" });
}));

tests.push(() => check("CHANGE_PROPOSAL_STATUS : les 5 statuts", () => {
  const state = seed();
  equal(Core.PROPOSAL_STATUSES, ["voting", "selected", "debate", "implemented", "rejected"]);
  Core.PROPOSAL_STATUSES.forEach((status) => {
    apply(state, "CHANGE_PROPOSAL_STATUS", { topicId: "t1", proposalId: "pr1", status: status });
    equal(Core.findProposal(Core.findTopic(state, "t1"), "pr1").status, status);
  });
  assert(!Core.validateAction(state, action("CHANGE_PROPOSAL_STATUS", { topicId: "t1", proposalId: "pr1", status: "x" })).ok);
}));

tests.push(() => check("Indicateur de vote : tous les cas", () => {
  const summary = (votes) => Core.voteSummary({ votes: votes });
  equal(summary({}).label, "Aucun vote");
  equal(summary({ a: "abstain", b: "abstain" }).label, "Avis partagés", "que des abstentions");
  equal(summary({ a: "for", b: "for" }).label, "Consensus favorable", "aucun contre");
  equal(summary({ a: "for", b: "abstain" }).label, "Consensus favorable");
  equal(summary({ a: "for", b: "against" }).label, "Avis partagés", "pour == contre");
  equal(summary({ a: "for", b: "for", c: "against" }).label, "Majorité favorable");
  equal(summary({ a: "against", b: "against", c: "for" }).label, "Majorité défavorable");
  /* Pourcentage favorable calculé HORS abstentions. */
  equal(summary({ a: "for", b: "against", c: "abstain", d: "abstain" }).favorablePercent, 50);
  equal(summary({ a: "for", b: "for", c: "against", d: "abstain" }).favorablePercent, 67);
  equal(summary({ a: "abstain" }).favorablePercent, 0);
}));

/* ----------------------------------------------------------- Conclusions --- */

tests.push(() => check("SET_CONCLUSION_VOTE : choix unique, le vote se déplace", () => {
  const state = seed();
  apply(state, "ADD_CONCLUSION", { topicId: "t1", conclusionId: "c2", text: "Autre piste." });
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c1" });
  equal(Core.findTopic(state, "t1").conclusionVotes, { p1: "c1" });
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" });
  equal(Core.findTopic(state, "t1").conclusionVotes, { p1: "c2" }, "un seul vote par personne");
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" });
  equal(Core.findTopic(state, "t1").conclusionVotes, {}, "re-clic = retrait");
}));

tests.push(() => check("DELETE_CONCLUSION retire aussi les votes qui la visaient", () => {
  const state = seed();
  apply(state, "ADD_CONCLUSION", { topicId: "t1", conclusionId: "c2", text: "Autre piste." });
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c1" });
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" }, { id: "p2", name: "Bruno" });
  apply(state, "DELETE_CONCLUSION", { topicId: "t1", conclusionId: "c1" });
  const topic = Core.findTopic(state, "t1");
  equal(topic.conclusions.length, 1);
  equal(topic.conclusionVotes, { p2: "c2" });
}));

tests.push(() => check("REMOVE_CONCLUSION_VOTE et UPDATE_CONCLUSION_ITEM", () => {
  const state = seed();
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c1" });
  apply(state, "REMOVE_CONCLUSION_VOTE", { topicId: "t1" });
  equal(Core.findTopic(state, "t1").conclusionVotes, {});
  apply(state, "UPDATE_CONCLUSION_ITEM", { topicId: "t1", conclusionId: "c1", text: "Version corrigée." }, undefined, LATER);
  const conclusion = Core.findConclusion(Core.findTopic(state, "t1"), "c1");
  equal(conclusion.text, "Version corrigée.");
  equal(conclusion.updatedAt, LATER);
}));

tests.push(() => check("conclusionScores : comptage et tête de liste", () => {
  const state = seed();
  apply(state, "ADD_CONCLUSION", { topicId: "t1", conclusionId: "c2", text: "Autre." });
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" });
  apply(state, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" }, { id: "p2", name: "Bruno" });
  const result = Core.conclusionScores(Core.findTopic(state, "t1"));
  equal(result.scores, { c1: 0, c2: 2 });
  equal(result.best, 2);
}));

/* ------------------------------------------------------- Cas transverses --- */

tests.push(() => check("Toutes les actions du modèle sont validées et appliquées", () => {
  const covered = {};
  const state = Core.emptyState();
  const run = (type, payload, actor) => { apply(state, type, payload, actor); covered[type] = true; };

  run("REGISTER_PARTICIPANT", { participantId: "p1", name: "Alice" });
  run("UPDATE_PARTICIPANT", { participantId: "p1", name: "Alice B." });
  run("CREATE_TOPIC", { topicId: "t1", title: "Sujet", description: "d" });
  run("UPDATE_TOPIC", { topicId: "t1", title: "Sujet 2", description: "d2" });
  run("CHANGE_TOPIC_STATUS", { topicId: "t1", status: "ready" });
  run("CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Bonjour" });
  run("UPDATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Bonjour à tous" });
  run("SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: true });
  run("SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "🤏" });
  run("CREATE_PROPOSAL", { topicId: "t1", proposalId: "pr1", title: "Idée" });
  run("UPDATE_PROPOSAL", { topicId: "t1", proposalId: "pr1", title: "Idée 2", description: "x" });
  run("CHANGE_PROPOSAL_STATUS", { topicId: "t1", proposalId: "pr1", status: "selected" });
  run("SET_VOTE", { topicId: "t1", proposalId: "pr1", value: "for" });
  run("REMOVE_VOTE", { topicId: "t1", proposalId: "pr1" });
  run("ADD_CONCLUSION", { topicId: "t1", conclusionId: "c1", text: "Conclusion" });
  run("UPDATE_CONCLUSION_ITEM", { topicId: "t1", conclusionId: "c1", text: "Conclusion 2" });
  run("SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c1" });
  run("REMOVE_CONCLUSION_VOTE", { topicId: "t1" });
  run("DELETE_CONCLUSION", { topicId: "t1", conclusionId: "c1" });

  Core.ACTION_TYPES.forEach((type) => {
    assert(covered[type], "action non couverte par les tests : " + type);
  });
  equal(Core.ACTION_TYPES.length, 19, "le modèle compte 19 actions");
}));

tests.push(() => check("Une action portant sur un objet disparu est refusée proprement", () => {
  const state = seed();
  ["UPDATE_TOPIC", "CHANGE_TOPIC_STATUS", "CREATE_MESSAGE", "SET_REACTION", "SET_VOTE"].forEach((type) => {
    const result = Core.validateAction(state, action(type, { topicId: "inconnu", title: "x", status: "open", messageId: "m1", text: "t", emoji: "👌", proposalId: "pr1", value: "for" }));
    assert(!result.ok, type + " aurait dû être refusée");
    assert(typeof result.error === "string" && result.error.length > 0, "message d'erreur manquant");
  });
}));

tests.push(() => check("Le rejeu d'un état complet est stable (ensureShape idempotent)", () => {
  const state = seed();
  const once = Core.ensureShape(JSON.parse(JSON.stringify(state)));
  const twice = Core.ensureShape(JSON.parse(JSON.stringify(once)));
  equal(once, twice, "ensureShape doit être idempotent");
}));

tests.push(() => check("Limites de saisie conformes à la spécification", () => {
  equal(Core.LIMITS, {
    name: 50, topicTitle: 150, topicDescription: 3000, message: 3000,
    proposalTitle: 200, proposalDescription: 3000, conclusion: 5000
  });
}));

/* ==========================================================================
 *        PARITÉ RÉELLE : le backend Apps Script passe les mêmes vecteurs
 * ==========================================================================
 *
 * Jusqu'ici la parité client/serveur reposait sur une relecture à l'œil et sur
 * un runSelfTest() qu'il fallait penser à lancer dans l'éditeur Apps Script.
 * apps-script/Code.gs étant désormais versionné, on peut faire mieux : le
 * charger ici dans un contexte isolé, avec des doublures des services Google,
 * et lui faire passer EXACTEMENT les mêmes vecteurs qu'au frontend.
 *
 * Une divergence entre js/state.js et Code.gs fait donc échouer
 * « node tests/parity.test.js », au lieu de se découvrir en réunion.
 */

const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");

const BACKEND_PATH = require("path").join(__dirname, "..", "apps-script", "Code.gs");
const BACKEND_SOURCE = fs.readFileSync(BACKEND_PATH, "utf8");

function loadBackend() {
  const logs = [];
  const sandbox = {
    console: { log: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) },
    JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseInt, Error,

    /* ⚠️ La doublure reproduit le piège : Utilities.computeDigest renvoie des
     * octets SIGNÉS (-128..127). Un backend qui oublie la conversion produit
     * ici le même hexadécimal erroné qu'en production. */
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (algo, text) => Array.from(
        crypto.createHash("sha256").update(String(text), "utf8").digest()
      ).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: () => "2026-01-01-0000"
    },

    PropertiesService: { getScriptProperties: () => ({
      getProperty: () => null, setProperty: () => null, deleteProperty: () => null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => null }) },
    DriveApp: {},
    LockService: {},
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (t) => ({ setMimeType: () => t }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(BACKEND_SOURCE, sandbox, { filename: "Code.gs" });
  return sandbox;
}

const GS = loadBackend();

/* Le script est maintenant versionné : le dépôt ne doit JAMAIS porter le code
 * d'accès de l'équipe. Ce test remplace la vigilance humaine. */
tests.push(() => check("SÉCURITÉ : aucun code d'accès commité dans Code.gs", () => {
  assert(GS.ACCESS_CODE === "",
    "ACCESS_CODE doit rester vide dans le dépôt — il se renseigne dans l'éditeur Apps Script");
  assert(GS.DATA_FILE_ID === "",
    "DATA_FILE_ID pointe vers un Drive précis : à renseigner dans l'éditeur, pas ici");
  assert(GS.PW_SALT === CONFIG.PW_SALT, "le sel doit être identique des deux côtés");
}));

tests.push(() => check("PARITÉ : le backend calcule les mêmes hachages", () => {
  equal(GS.sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "octets signés mal convertis côté Apps Script");
  equal(GS.sha256Hex("réunion"),
    "8c85d3fa84b7926e2e0664129cefa7ea17401086243561611c56ee5016908ea1",
    "encodage UTF-8 incorrect côté Apps Script");
  equal(GS.serverTokenInput("x"), CONFIG.serverTokenInput("x"), "entrée du jeton serveur");
  equal(GS.verifierInput("x"), CONFIG.verifierInput("x"), "entrée du vérificateur");
}));

tests.push(() => check("PARITÉ : mêmes constantes métier", () => {
  equal(GS.REACTIONS, Core.REACTIONS, "liste des réactions");
  equal(GS.TOPIC_STATUSES, Core.TOPIC_STATUSES, "statuts de sujet");
  equal(GS.PROPOSAL_STATUSES, Core.PROPOSAL_STATUSES, "statuts de proposition");
  equal(GS.VOTE_VALUES, Core.VOTE_VALUES, "valeurs de vote");
  equal(GS.ACTION_TYPES, Core.ACTION_TYPES, "liste des actions");
  equal(GS.LIMITS, Core.LIMITS, "limites de saisie");
  equal(GS.ANON_NAME, Core.ANON_NAME, "nom anonyme");
}));

tests.push(() => check("PARITÉ : ensureShape rend le même état", () => {
  const corpus = [
    null, {}, { topics: "pas un tableau" },
    seed(),
    /* JSON malmené : champs manquants, types faux, citation orpheline,
     * réaction retirée du jeu, vote vers une conclusion supprimée. */
    { revision: "7", updatedAt: null, participants: [{ id: " u1 ", name: "  Marie  " }, { name: "sans id" }],
      topics: [{ id: "t1", title: "", status: "inconnu", messages: [
        { id: "m1", text: "a", reactions: { u1: "🤞", u2: "👌" }, quoteId: "disparu" },
        { id: "m2", text: "b", anon: true, authorId: "u1", authorName: "Marie" },
        { notAnId: true }
      ], proposals: [{ id: "p1", votes: { u1: "peut-être", u2: "for" } }],
        conclusions: [{ id: "c1", text: "ok" }],
        conclusionVotes: { u1: "c1", u2: "supprimée" } }],
      processedActionIds: ["a1", "", "a2"] }
  ];
  corpus.forEach((input, index) => {
    const front = Core.ensureShape(JSON.parse(JSON.stringify(input)));
    const back = GS.ensureShape(JSON.parse(JSON.stringify(input)));
    equal(back, front, "ensureShape diverge sur le cas #" + index);
  });
}));

tests.push(() => check("PARITÉ : validateAction et applyAction, action par action", () => {
  const NOW_GS = "2026-02-02T09:00:00.000Z";

  /* Un scénario qui traverse les 19 types d'actions, valides et refusées. */
  const script = [
    ["REGISTER_PARTICIPANT", { participantId: "u1", name: "Marie" }],
    ["REGISTER_PARTICIPANT", { participantId: "u2", name: "Alex" }],
    ["REGISTER_PARTICIPANT", { participantId: "u3", name: "" }],              // refus
    ["CREATE_TOPIC", { topicId: "t1", title: "Rayon solaire" }],
    ["CREATE_TOPIC", { topicId: "t1", title: "Doublon" }],                     // refus
    ["CREATE_TOPIC", { topicId: "t2", title: "Anonyme", anon: true }],
    ["UPDATE_TOPIC", { topicId: "t1", title: "Rayon solaire 2", description: "d" }],
    ["UPDATE_TOPIC", { topicId: "absent", title: "x" }],                       // refus
    ["CHANGE_TOPIC_STATUS", { topicId: "t1", status: "ready" }],
    ["CHANGE_TOPIC_STATUS", { topicId: "t1", status: "n_importe_quoi" }],      // refus
    ["CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Premier" }],
    ["CREATE_MESSAGE", { topicId: "t1", messageId: "m2", text: "Cité", quoteId: "m1" }],
    ["CREATE_MESSAGE", { topicId: "t1", messageId: "m3", text: "", }],         // refus
    ["CREATE_MESSAGE", { topicId: "t1", messageId: "m4", text: "Anonyme", anon: true }],
    ["SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "👌" }],
    ["SET_REACTION", { topicId: "t1", messageId: "m1", emoji: "🤞" }],         // refus
    ["UPDATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Corrigé" }],
    ["SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m4", anon: false }],
    ["SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m4", anon: true }],
    ["CREATE_PROPOSAL", { topicId: "t1", proposalId: "p1", title: "Proposition" }],
    ["UPDATE_PROPOSAL", { topicId: "t1", proposalId: "p1", title: "Proposition 2", description: "d" }],
    ["CHANGE_PROPOSAL_STATUS", { topicId: "t1", proposalId: "p1", status: "selected" }],
    ["SET_VOTE", { topicId: "t1", proposalId: "p1", value: "for" }],
    ["SET_VOTE", { topicId: "t1", proposalId: "p1", value: "for" }],           // retire le vote
    ["SET_VOTE", { topicId: "t1", proposalId: "p1", value: "abstain" }],
    ["REMOVE_VOTE", { topicId: "t1", proposalId: "p1" }],
    ["ADD_CONCLUSION", { topicId: "t1", conclusionId: "c1", text: "Conclusion A" }],
    ["ADD_CONCLUSION", { topicId: "t1", conclusionId: "c2", text: "Conclusion B" }],
    ["UPDATE_CONCLUSION_ITEM", { topicId: "t1", conclusionId: "c1", text: "Conclusion A+" }],
    ["SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c1" }],
    ["SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" }],            // déplace le vote
    ["REMOVE_CONCLUSION_VOTE", { topicId: "t1" }],
    ["SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: "c2" }],
    ["DELETE_CONCLUSION", { topicId: "t1", conclusionId: "c2" }],              // retire aussi le vote
    ["UPDATE_PARTICIPANT", { participantId: "u1", name: "Marie L." }],         // propage le renommage
    ["ACTION_INVENTÉE", { topicId: "t1" }]                                     // refus
  ];

  const front = Core.emptyState();
  const back = GS.emptyState();

  script.forEach(([type, payload], index) => {
    const action = { id: "a" + index, type, actorId: "u1", actorName: "Marie", ts: NOW_GS, payload };

    const frontVerdict = Core.validateAction(front, action);
    const backVerdict = GS.validateAction(back, action);
    equal(backVerdict, frontVerdict,
      "verdict divergent sur #" + index + " " + type);

    if (frontVerdict.ok) {
      Core.applyAction(front, action, NOW_GS);
      GS.applyAction(back, action, NOW_GS);
      equal(back, front, "état divergent après #" + index + " " + type);
    }
  });

  /* Le scénario doit vraiment avoir exercé les deux issues. */
  assert(front.topics.length === 2 && front.topics[0].messages.length === 3,
    "le scénario de parité n'a pas produit l'état attendu");
}));

tests.push(() => check("PARITÉ : l'état allégé ne perd que processedActionIds", () => {
  const state = GS.ensureShape(seed());
  state.processedActionIds = ["a1", "a2"];
  const lean = GS.leanState(state);
  assert(lean.processedActionIds === undefined, "processedActionIds ne doit pas être envoyé");
  /* Ce que reçoit le client doit redonner le même état après ensureShape,
   * aux identifiants traités près — sinon l'allègement perdrait des données. */
  const rebuilt = Core.ensureShape(JSON.parse(JSON.stringify(lean)));
  const expected = Core.ensureShape(JSON.parse(JSON.stringify(state)));
  expected.processedActionIds = [];
  equal(rebuilt, expected, "l'allègement de l'état perd des données");
}));

/* ------------------------------------------------------------ Exécution --- */

(async function run() {
  for (const test of tests) { await test(); }
  const total = passed + failures.length;
  if (failures.length) {
    console.error("\n" + failures.length + " test(s) en échec sur " + total + " :\n");
    failures.forEach((f) => console.error("  ✗ " + f));
    process.exit(1);
  }
  console.log("✓ " + passed + " tests réussis sur " + total + ".");
})();
