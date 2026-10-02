/* BrainstO. - nouveautes : jamais mes propres actions (SPEC §11, ROADMAP P3.1).
 *
 * Execution : node tests/news-own-activity.test.js
 *
 * Charge les vrais js/state.js, js/product-view.js et js/product-ui.js. Seul le DOM est
 * remplace par un arbre minimal (l'accueil = une carte par sujet). Le « serveur » est
 * simule par Store.setBase (un etat avec d'autres horodatages que ceux de l'appareil),
 * l'action en attente par Store.addToQueue. Aucun reseau : fetch, XMLHttpRequest,
 * sendBeacon et Sync.dispatch sont des pieges qui comptent leurs appels, le test exige zero.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const { Core, Store } = require("../js/state.js");
const ProductView = require("../js/product-view.js");
const UI_SOURCE = fs.readFileSync(path.join(ROOT, "js/product-ui.js"), "utf8");
const SEEN_KEY = "brainsto.seenTopics.v1";

let passed = 0;
const failures = [];
let networkCalls = 0;

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push(name + " -> " + (error && error.message)); }
}
function assert(condition, message) { if (!condition) { throw new Error(message || "assertion echouee"); } }
function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || "valeurs differentes") + " : " + JSON.stringify(actual) + " au lieu de " + JSON.stringify(expected));
  }
}

/* ------------------------------------------------------------ DOM minimal --- */

function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.children = [];
  this.parentNode = null;
  this.className = "";
  this.textContent = "";
  this.attrs = {};
}
Object.defineProperty(El.prototype, "classList", {
  get: function () {
    const names = this.className.split(/\s+/);
    return { contains: function (name) { return names.indexOf(name) >= 0; } };
  }
});
Object.defineProperty(El.prototype, "firstChild", { get: function () { return this.children[0] || null; } });
El.prototype.setAttribute = function (key, value) { this.attrs[key] = String(value); };
El.prototype.getAttribute = function (key) {
  return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
};
El.prototype.detach = function () {
  if (this.parentNode) {
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
};
El.prototype.appendChild = function (node) {
  node.detach();
  node.parentNode = this;
  this.children.push(node);
  return node;
};
El.prototype.insertBefore = function (node, ref) {
  if (!ref) { return this.appendChild(node); }
  node.detach();
  node.parentNode = this;
  this.children.splice(this.children.indexOf(ref), 0, node);
  return node;
};
function matchesPart(el, part) {
  return part.charAt(0) === "." ? el.classList.contains(part.slice(1)) : el.tagName === part.toUpperCase();
}
function descendants(el, out) {
  el.children.forEach(function (child) { out.push(child); descendants(child, out); });
  return out;
}
/* Sous-ensemble suffisant : « .classe », « balise » et la descendance « a b ». */
El.prototype.querySelectorAll = function (selector) {
  const parts = selector.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return descendants(this, []).filter(function (el) {
    if (!matchesPart(el, last)) { return false; }
    let node = el.parentNode;
    let i = parts.length - 2;
    while (i >= 0 && node) {
      if (matchesPart(node, parts[i])) { i -= 1; }
      node = node.parentNode;
    }
    return i < 0;
  });
};
El.prototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };

function div(className, text) {
  const node = new El("div");
  node.className = className;
  if (text) { node.textContent = text; }
  return node;
}

/* L'accueil de ui.js : une carte par sujet, dans l'ordre d'activite, puis le bouton d'ajout.
 * Un espace vide n'a pas de .topics-grid (ui.js affiche un etat vide). */
function buildHome(view) {
  const visible = ProductView.visibleTopics(view.topics, "", false);
  if (!visible.length) { return div("empty"); }
  const grid = div("topics-grid");
  visible.forEach(function (topic) {
    const card = new El("button");
    card.className = "card";
    card.appendChild(div("card-title", topic.title));
    const foot = div("card-foot");
    foot.appendChild(div("row-wrap"));
    card.appendChild(foot);
    grid.appendChild(card);
  });
  const add = new El("button");
  add.className = "btn btn-block";
  grid.appendChild(add);
  return grid;
}

/* ------------------------------------------------------------ Appareil --- */

const ME = "u-moi-7f3a";

function device(options) {
  options = options || {};
  const dev = { storage: {}, ownItems: [], sandbox: null };
  const body = new El("body");
  const trap = function () { networkCalls += 1; throw new Error("acces reseau interdit"); };
  const App = {
    user: { id: ME, name: "Moi" },
    route: { name: "topics", topicId: null },
    gate: function () { return false; },
    /* Meme contrat que App.ownsItem de js/app.js (lecture seule de la preuve locale). */
    ownsItem: function (id, authorId) {
      if (authorId && authorId === App.user.id) { return true; }
      return dev.ownItems.indexOf(id) >= 0;
    }
  };
  const Utils = {
    storage: {
      get: function (key, fallback) {
        return Object.prototype.hasOwnProperty.call(dev.storage, key) ? JSON.parse(dev.storage[key]) : fallback;
      },
      set: function (key, value) { dev.storage[key] = JSON.stringify(value); return true; },
      remove: function (key) { delete dev.storage[key]; return true; }
    }
  };
  const connection = options.local
    ? { url: "", localMode: true, unlocked: true }
    : { url: "https://exemple.invalid/exec", localMode: false, unlocked: true };
  const UI = {
    local: {},
    render: function () {
      body.children = [];
      if (App.route.name === "topics") { body.appendChild(buildHome(Store.view)); }
    }
  };
  const sandbox = {
    document: {
      body: body,
      createElement: function (tag) { return new El(tag); },
      getElementById: function () { return null; },
      querySelector: function (selector) { return body.querySelector(selector); },
      querySelectorAll: function (selector) { return body.querySelectorAll(selector); }
    },
    App: App, Utils: Utils, UI: UI, Store: Store, Core: Core, ProductView: ProductView,
    Sync: { connection: connection, dispatch: trap },
    fetch: trap, XMLHttpRequest: trap, navigator: { sendBeacon: trap }
  };
  vm.createContext(sandbox);
  vm.runInContext(UI_SOURCE, sandbox, { filename: "js/product-ui.js" });
  dev.sandbox = sandbox;
  dev.App = App;

  /* Un rendu complet sur un ecran (le vrai UI.render, enveloppe par product-ui.js). */
  dev.go = function (name, topicId) {
    App.route = { name: name, topicId: topicId || null };
    sandbox.UI.render();
  };
  dev.badge = function (title) {
    const card = body.querySelectorAll(".card").filter(function (c) {
      return c.querySelector(".card-title").textContent === title;
    })[0];
    if (!card) { throw new Error("carte introuvable : " + title); }
    const badge = card.querySelector(".product-unread");
    return badge ? badge.textContent : null;
  };
  /* « J'ouvre le sujet, puis je reviens a l'accueil » : il est vu. */
  dev.acknowledge = function (topicId) { dev.go("topic", topicId); dev.go("topics"); };
  dev.seen = function () { return dev.storage[SEEN_KEY] ? JSON.parse(dev.storage[SEEN_KEY]) : null; };
  return dev;
}

/* ------------------------------------------------------------ Donnees --- */

let revision = 100;
function stamp(n) { return new Date(Date.UTC(2026, 9, 1, 8, 0, n)).toISOString(); }

function message(id, authorId, extra) {
  return Object.assign({
    id: id, authorId: authorId, authorName: authorId ? "Auteur" : "Anonyme", text: "Texte " + id,
    createdAt: stamp(1), updatedAt: stamp(1), reactions: {}, anon: !authorId, quoteId: null
  }, extra || {});
}
function proposal(id, authorId, extra) {
  return Object.assign({
    id: id, title: "Proposition " + id, description: "", authorId: authorId, authorName: "Auteur",
    createdAt: stamp(1), status: "voting", votes: {}
  }, extra || {});
}
function conclusion(id, authorId, extra) {
  return Object.assign({
    id: id, text: "Formulation " + id, source: "manual", authorId: authorId, authorName: "Auteur",
    createdAt: stamp(1), updatedAt: stamp(1)
  }, extra || {});
}
function topic(id, title, extra) {
  return Object.assign({
    id: id, title: title, description: "", status: "open", createdBy: { id: "u-bob", name: "Bob" },
    createdAt: stamp(1), updatedAt: stamp(1), messages: [], proposals: [], conclusions: [], conclusionVotes: {}
  }, extra || {});
}
/* Deux sujets animes par d'autres que moi. */
function baseTopics() {
  return [
    topic("tA", "Formation caisse", { messages: [message("m-bob", "u-bob")] }),
    topic("tB", "Budget des fournitures", {
      messages: [message("m-chloe", "u-chloe")],
      proposals: [proposal("p1", "u-bob", { votes: { "u-chloe": "for" } })],
      conclusions: [conclusion("c1", "u-bob"), conclusion("c2", "u-bob")],
      conclusionVotes: { "u-chloe": "c1" }
    })
  ];
}
/* L'etat tel que le serveur le renvoie : une revision de plus, ses propres horodatages. */
function server(topics) {
  revision += 1;
  Store.setBase({ revision: revision, updatedAt: stamp(revision), participants: [], topics: topics, processedActionIds: [] });
  Store.setQueue([]);
}
let sequence = 0;
function pending(type, actorId, payload, ts) {
  sequence += 1;
  Store.addToQueue({
    seq: sequence,
    action: { id: "a" + sequence, type: type, ts: ts, actorId: actorId, actorName: actorId ? "Moi" : "Anonyme", payload: payload }
  });
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

/* ------------------------------------------------------------ BL-014 --- */

check("BL-014 : mon message confirme apres avoir quitte le sujet n'est pas « Mis a jour »", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");                      // ligne de base
  dev.acknowledge("tA");                 // j'ai ouvert le sujet
  dev.ownItems.push("m-mine");           // App.actions.createMessage inscrit l'id AVANT l'envoi
  pending("CREATE_MESSAGE", ME, { topicId: "tA", messageId: "m-mine", text: "Mon message", quoteId: null, anon: false }, stamp(10));
  dev.go("topic", "tA");                 // rendu optimiste : le sujet est revu avec mon message en attente
  dev.go("topics");                      // je repars AVANT la confirmation du serveur
  equal(dev.badge("Formation caisse"), null, "pastille avec mon message en attente");

  const confirmed = baseTopics();        // le serveur confirme avec SON horodatage, pas celui de l'appareil
  confirmed[0].messages.push(message("m-mine", ME, { createdAt: stamp(13), updatedAt: stamp(13) }));
  confirmed[0].updatedAt = stamp(13);
  server(confirmed);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "pastille apres confirmation du serveur");
});

check("BL-014 : mon message qui entre dans la vue apres mon depart n'est pas « +1 message »", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");
  dev.acknowledge("tA");
  dev.ownItems.push("m-mine");
  pending("CREATE_MESSAGE", ME, { topicId: "tA", messageId: "m-mine", text: "Mon message", quoteId: null, anon: false }, stamp(10));
  dev.go("topics");                      // la file n'a rejoint la vue qu'apres mon depart
  equal(dev.badge("Formation caisse"), null, "pastille quand mon message n'etait pas dans l'empreinte vue");
});

check("BL-014 : mon sujet cree n'a aucune pastille, en attente comme apres confirmation", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");
  pending("CREATE_TOPIC", ME, { topicId: "tNew", title: "Mon sujet", description: "", anon: false }, stamp(20));
  dev.go("topics");
  equal(dev.badge("Mon sujet"), null, "pastille sur mon sujet en attente");

  const confirmed = baseTopics();
  confirmed.push(topic("tNew", "Mon sujet", { createdBy: { id: ME, name: "Moi" }, createdAt: stamp(23), updatedAt: stamp(23) }));
  server(confirmed);
  dev.go("topics");
  equal(dev.badge("Mon sujet"), null, "pastille sur mon sujet apres confirmation");

  /* Sujet anonyme : createdBy.id est vide, seule la preuve locale le reconnait. */
  dev.ownItems.push("tAnon");
  const anonymous = clone(confirmed);
  anonymous.push(topic("tAnon", "Mon sujet anonyme", { createdBy: { id: "", name: "Anonyme" }, createdAt: stamp(24), updatedAt: stamp(24) }));
  server(anonymous);
  dev.go("topics");
  equal(dev.badge("Mon sujet anonyme"), null, "pastille sur mon sujet anonyme");
  const reconfirmed = clone(anonymous);
  reconfirmed[3].updatedAt = stamp(26);
  reconfirmed[3].messages.push(message("m-first", "u-bob", { createdAt: stamp(26), updatedAt: stamp(26) }));
  server(reconfirmed);
  dev.go("topics");
  equal(dev.badge("Mon sujet anonyme"), "+1 message", "le message d'un autre sur mon sujet reste signale");
});

check("BL-014 : le message d'un autre apres le mien est signale « +1 message », puis vu", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");
  dev.acknowledge("tA");
  dev.ownItems.push("m-mine");
  pending("CREATE_MESSAGE", ME, { topicId: "tA", messageId: "m-mine", text: "Mon message", quoteId: null, anon: false }, stamp(10));
  dev.go("topic", "tA");
  dev.go("topics");
  const confirmed = baseTopics();
  confirmed[0].messages.push(message("m-mine", ME, { createdAt: stamp(13), updatedAt: stamp(13) }));
  confirmed[0].updatedAt = stamp(13);
  server(confirmed);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "mon message seul");

  const later = clone(confirmed);
  later[0].messages.push(message("m-bob2", "u-bob", { createdAt: stamp(30), updatedAt: stamp(30) }));
  later[0].updatedAt = stamp(30);
  server(later);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), "+1 message", "un message d'autrui apres le mien");
  dev.acknowledge("tA");
  equal(dev.badge("Formation caisse"), null, "apres ouverture du sujet");
});

check("BL-014 : mon message anonyme est reconnu par la preuve locale, celui d'un autre non", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");
  dev.acknowledge("tA");
  dev.ownItems.push("m-anon-moi");       // la preuve locale : l'identifiant d'auteur n'existe plus dans les donnees
  pending("CREATE_MESSAGE", "", { topicId: "tA", messageId: "m-anon-moi", text: "Anonyme de moi", quoteId: null, anon: true }, stamp(10));
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "mon message anonyme en attente");

  const confirmed = baseTopics();
  confirmed[0].messages.push(message("m-anon-moi", "", { createdAt: stamp(14), updatedAt: stamp(14) }));
  confirmed[0].updatedAt = stamp(14);
  server(confirmed);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "mon message anonyme confirme");

  const other = clone(confirmed);
  other[0].messages.push(message("m-anon-autre", "", { createdAt: stamp(31), updatedAt: stamp(31) }));
  other[0].updatedAt = stamp(31);
  server(other);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), "+1 message", "un message anonyme d'un autre");
});

check("BL-014 : mes propositions, formulations, votes, reactions et soutiens ne sont jamais des nouveautes", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");
  dev.acknowledge("tB");

  const mine = baseTopics();
  mine[1].proposals.push(proposal("p-moi", ME, { createdAt: stamp(40) }));
  mine[1].conclusions.push(conclusion("c-moi", ME, { createdAt: stamp(41), updatedAt: stamp(41) }));
  mine[1].proposals[0].votes[ME] = "against";
  mine[1].messages[0].reactions[ME] = "👌";
  mine[1].conclusionVotes[ME] = "c2";
  mine[1].updatedAt = stamp(42);
  server(mine);
  dev.go("topics");
  equal(dev.badge("Budget des fournitures"), null, "mes propres contributions, apres confirmation");
});

check("BL-014 : ce que font les autres reste signale (votes, soutien deplace, reaction, statut)", () => {
  const dev = device();
  server(baseTopics());
  dev.go("topics");
  dev.acknowledge("tB");
  const label = function () { return dev.badge("Budget des fournitures"); };
  let current = baseTopics();
  const step = function (mutate, at) {
    mutate(current);
    current[1].updatedAt = stamp(at);
    server(clone(current));
    dev.go("topics");
  };

  step(function (t) { t[1].proposals[0].votes["u-bob"] = "for"; }, 50);
  equal(label(), "Votes mis à jour", "un nouveau vote d'un autre");
  dev.acknowledge("tB");
  step(function (t) { t[1].proposals[0].votes["u-chloe"] = "against"; }, 51);
  equal(label(), "Mis à jour", "un vote d'un autre qui change de valeur (meme nombre de votes : signalement general, comme avant)");
  dev.acknowledge("tB");
  step(function (t) { t[1].conclusionVotes["u-chloe"] = "c2"; }, 52);
  equal(label(), "Mis à jour", "le soutien d'un autre deplace d'une formulation a l'autre (meme nombre de soutiens : signalement general, comme avant)");
  dev.acknowledge("tB");
  step(function (t) { t[1].messages[0].reactions["u-bob"] = "💪"; }, 53);
  equal(label(), "Mis à jour", "la reaction d'un autre");
  dev.acknowledge("tB");
  step(function (t) { t[1].status = "ready"; }, 54);
  equal(label(), "Mis à jour", "le statut change par un autre");
  dev.acknowledge("tB");
  equal(label(), null, "apres ouverture du sujet");
});

check("BL-014 : un marqueur enregistre avant ce correctif se lit comme avant", () => {
  const dev = device();
  server(baseTopics());
  const legacy = { v: 1, initialized: true, topics: {} };
  Store.view.topics.forEach(function (t) { legacy.topics[t.id] = ProductView.topicFingerprint(t); });
  dev.storage[SEEN_KEY] = JSON.stringify(legacy);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "sujet inchange");
  const later = baseTopics();
  later[0].messages.push(message("m-bob2", "u-bob", { createdAt: stamp(30), updatedAt: stamp(30) }));
  later[0].updatedAt = stamp(30);
  server(later);
  dev.go("topics");
  equal(dev.badge("Formation caisse"), "+1 message", "message d'un autre, ancien marqueur");
  dev.acknowledge("tA");
  equal(dev.badge("Formation caisse"), null, "apres ouverture");
  assert(dev.seen().topics.tA.o, "le marqueur est reecrit avec l'empreinte « sans moi »");
});

check("BL-014 : une nouvelle identite (reconnexion) ne fabrique pas de fausses pastilles", () => {
  const dev = device();
  const topics = baseTopics();
  topics[0].messages.push(message("m-ancien", ME, { createdAt: stamp(5), updatedAt: stamp(5) }));
  server(topics);
  dev.go("topics");
  dev.acknowledge("tA");
  dev.App.user = { id: "u-nouvelle-identite", name: "Moi" };   // la deconnexion a efface l'identite et la preuve locale
  dev.ownItems.length = 0;
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "sujet inchange apres changement d'identite");
});

check("BL-014 : le marqueur ne garde ni texte, ni identifiant d'auteur, et rien ne part au reseau", () => {
  const dev = device();
  const topics = baseTopics();
  topics[0].messages.push(message("m-moi", ME, { text: "Texte secret de mon message" }));
  topics[1].proposals[0].votes[ME] = "for";
  dev.ownItems.push("m-moi");
  server(topics);
  dev.go("topics");
  dev.acknowledge("tA");
  dev.acknowledge("tB");
  const raw = dev.storage[SEEN_KEY];
  assert(raw && raw.length > 10, "marqueur absent");
  ["u-bob", "u-chloe", ME, "Texte secret", "Formation caisse"].forEach(function (needle) {
    assert(raw.indexOf(needle) < 0, "le marqueur contient « " + needle + " » : " + raw);
  });
});

/* ------------------------------------------------------------ BL-067 --- */

check("BL-067 : premier demarrage connecte, l'etat vide de depart n'est pas la ligne de base", () => {
  const dev = device();
  Store.setBase(Core.emptyState());      // rien recu du serveur : revision 0
  Store.setQueue([]);
  dev.go("topics");
  equal(dev.seen(), null, "aucune ligne de base ne doit etre enregistree sur l'etat vide de depart");

  server(baseTopics());                  // premier rapatriement : l'espace de l'equipe arrive d'un coup
  dev.go("topics");
  equal(dev.badge("Formation caisse"), null, "sujet existant, premier rapatriement");
  equal(dev.badge("Budget des fournitures"), null, "sujet existant, premier rapatriement");
  assert(dev.seen() && dev.seen().initialized === true, "ligne de base enregistree au premier rapatriement");

  const later = baseTopics();
  later.push(topic("tNew", "Sujet d'un collegue", { createdAt: stamp(60), updatedAt: stamp(60) }));
  server(later);
  dev.go("topics");
  equal(dev.badge("Sujet d'un collegue"), "Nouveau sujet", "un sujet cree ensuite par un collegue");
  equal(dev.badge("Formation caisse"), null, "les sujets d'avant restent muets");
});

check("BL-067 : un espace vide deja synchronise garde sa ligne de base (le premier sujet d'un collegue est signale)", () => {
  const dev = device();
  server([]);                            // revision > 0, aucun sujet
  dev.go("topics");
  assert(dev.seen() && dev.seen().initialized === true, "ligne de base vide enregistree");
  equal(Object.keys(dev.seen().topics).length, 0, "ligne de base vide");
  server([topic("tFirst", "Premier sujet", { createdAt: stamp(70), updatedAt: stamp(70) })]);
  dev.go("topics");
  equal(dev.badge("Premier sujet"), "Nouveau sujet", "premier sujet d'un collegue");
});

check("BL-067 : en mode local la ligne de base vide est enregistree comme avant", () => {
  const dev = device({ local: true });
  Store.setBase(Core.emptyState());
  Store.setQueue([]);
  dev.go("topics");
  assert(dev.seen() && dev.seen().initialized === true, "ligne de base du mode local");
});

/* ------------------------------------------------------------ Regles pures --- */

check("Regles : sans preuve locale, l'empreinte garde exactement sa forme historique", () => {
  const fp = ProductView.topicFingerprint(baseTopics()[1]);
  equal(Object.keys(fp).sort().join(","),
    "consensus,consensusVotes,messages,proposalVotes,proposals,status,updatedAt", "forme de l'empreinte");
  const t = baseTopics()[1];
  const same = ProductView.topicActivity(t, fp, true);
  equal(same.changed, false, "meme etat, sans preuve locale");
});

check("Regles : l'empreinte « sans moi » ne compte que ce qui ne vient pas de cet appareil", () => {
  const t = baseTopics()[1];
  t.messages.push(message("m-moi", ME));
  t.messages.push(message("m-anon-moi", ""));
  t.proposals.push(proposal("p-moi", ME, { votes: { [ME]: "for" } }));
  t.conclusions.push(conclusion("c-moi", ME));
  t.conclusionVotes[ME] = "c1";
  const mine = { id: ME, owns: function (id, authorId) { return authorId === ME || id === "m-anon-moi"; } };
  const fp = ProductView.topicFingerprint(t, mine);
  equal(fp.messages, 3, "tous les messages (historique)");
  equal(fp.o.messages, 1, "messages des autres");
  equal(fp.o.proposals, 1, "propositions des autres");
  equal(fp.o.proposalVotes, 1, "votes des autres");
  equal(fp.o.consensus, 2, "formulations des autres");
  equal(fp.o.consensusVotes, 1, "soutiens des autres");
});

/* ------------------------------------------------------------ Bilan --- */

check("Aucun acces reseau pendant tous les scenarios", () => {
  equal(networkCalls, 0, "appels reseau");
});

if (failures.length) {
  console.error("\nECHECS news-own-activity :");
  failures.forEach(function (failure) { console.error("- " + failure); });
  console.error("\n" + passed + " test(s) reussi(s), " + failures.length + " echec(s).");
  process.exit(1);
}
console.log("news-own-activity : " + passed + " test(s) reussi(s).");
