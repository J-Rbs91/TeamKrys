/* BrainstO. — tests de la boucle de synchronisation.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/sync.test.js
 *
 * Ces tests montent DEUX clients complets (state.js + database.js + sync.js,
 * chacun dans son contexte isolé) face à un faux backend qui reproduit le
 * contrat du script Apps Script : révision incrémentée à chaque écriture,
 * déduplication par identifiant d'action, état complet renvoyé.
 *
 * Ils répondent à une seule question, celle qui compte : « l'utilisateur A
 * voit-il le message de l'utilisateur B ? »
 *
 * ⚠️ PORTÉE. Node n'a pas d'IndexedDB : database.js y bascule toujours sur son
 * repli mémoire. C'est délibéré — c'est exactement ce chemin qui était cassé,
 * et c'est celui qu'empruntent en vrai les fenêtres in-app des messageries et
 * la navigation privée. La branche IndexedDB elle-même, faute de moteur ici,
 * reste couverte par la recette manuelle (docs/CHECKLIST_TEST.md).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
require(path.join(ROOT, "js/config.js"));
const Utils = require(path.join(ROOT, "js/utils.js"));
const { Core } = require(path.join(ROOT, "js/state.js"));
const CONFIG = globalThis.CONFIG;

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

async function check(name, fn) {
  try { await fn(); passed += 1; }
  catch (error) { failures.push(name + " → " + (error && error.message)); }
}

/* ------------------------------------------------------- Faux backend --- */

function makeServer() {
  const srv = { data: Core.emptyState(), calls: { revision: 0, state: 0, post: 0 }, down: false };

  srv.post = function (action) {
    srv.calls.post += 1;
    if (srv.down) { const e = new Error("Connexion impossible."); e.kind = "network"; throw e; }
    if (srv.data.processedActionIds.indexOf(action.id) >= 0) {
      return { ok: true, duplicate: true, revision: srv.data.revision, state: clone(srv.data) };
    }
    const verdict = Core.validateAction(srv.data, action);
    if (!verdict.ok) { const e = new Error(verdict.error); e.kind = "server"; throw e; }
    Core.applyAction(srv.data, action, new Date().toISOString());
    srv.data.revision += 1;
    srv.data.processedActionIds.push(action.id);
    return { ok: true, revision: srv.data.revision, state: clone(srv.data) };
  };

  srv.revision = function () {
    srv.calls.revision += 1;
    if (srv.down) { const e = new Error("Connexion impossible."); e.kind = "network"; throw e; }
    return { ok: true, revision: srv.data.revision, updatedAt: srv.data.updatedAt };
  };

  srv.state = function () { srv.calls.state += 1; return { ok: true, state: clone(srv.data) }; };
  return srv;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

/* ------------------------------------------- Un client complet, isolé --- */

/* options.indexedDB === false : le module database.js ne trouve aucun
 * indexedDB dans son « root » et bascule sur son repli mémoire. */
function makeClient(name, server, options) {
  options = options || {};
  const sandbox = {
    CONFIG, Utils, console, JSON, Math, Date, Promise, Error, Object, Array, String,
    setTimeout, clearTimeout,
    document: { hidden: false },
    navigator: { onLine: true }
  };
  const ctx = vm.createContext(sandbox);
  sandbox.globalThis = sandbox;
  if (options.indexedDB !== false) { sandbox.indexedDB = options.indexedDB; }

  const messages = [];
  sandbox.Api = {
    isNetworkError: (e) => !!e && e.kind === "network",
    isAuthError: (e) => !!e && e.kind === "auth",
    getRevision: () => { try { return Promise.resolve(server.revision()); } catch (e) { return Promise.reject(e); } },
    getState: () => Promise.resolve(server.state()),
    postAction: (url, token, action) => {
      try { return Promise.resolve(server.post(action)); } catch (e) { return Promise.reject(e); }
    }
  };

  ["js/state.js", "js/database.js", "js/sync.js"].forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  });

  const Sync = ctx.Sync;
  Sync.setHooks({ onMessage: (text, kind) => messages.push(kind + ": " + text) });
  Sync.setConnection({ url: "https://exemple/exec", token: "", localMode: false, unlocked: true });

  return { name, Sync, Store: ctx.Store, DB: ctx.DB, messages,
    user: { id: "u-" + name, name: name } };
}

/* Laisse les promesses et les micro-tâches se dérouler. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

async function say(client, payload, type) {
  await client.Sync.dispatch(client.Sync.makeAction(type || "CREATE_MESSAGE", payload, client.user));
  await settle();
  await client.Sync.now();
  await settle();
}

/* ------------------------------------------------------------- Tests --- */

async function run() {

  await check("le message de B parvient à A (aller-retour complet)", async () => {
    const srv = makeServer();
    const B = makeClient("B", srv, { indexedDB: false });
    const A = makeClient("A", srv, { indexedDB: false });
    await B.Sync.boot(); await A.Sync.boot(); await settle();

    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await say(B, { topicId: "t1", messageId: "m1", text: "Salut A" });
    await A.Sync.now(); await settle();

    const topic = Core.findTopic(A.Store.view, "t1");
    assert(topic, "A ne voit pas le sujet de B");
    assert(Core.findMessage(topic, "m1"), "A ne voit pas le message de B");
  });

  /* ⚠️ RÉGRESSION HISTORIQUE. Le repli mémoire de database.js rendait ses
   * valeurs encore emballées dans { value: … } là où la branche IndexedDB les
   * déballait. « saved.seq » valait donc undefined, l'action restait marquée
   * « pas encore prête » et n'était JAMAIS envoyée : son auteur voyait son
   * propre message, personne d'autre ne le recevait, et le compteur restait
   * bloqué sur « En attente (n) » indéfiniment. */
  await check("le message de B parvient à A même sans IndexedDB", async () => {
    const srv = makeServer();
    const B = makeClient("B", srv, { indexedDB: false });
    const A = makeClient("A", srv, { indexedDB: false });
    await B.Sync.boot(); await A.Sync.boot(); await settle();

    assert(B.DB.isPersistent() === false, "le repli mémoire n'est pas actif");
    assert(B.messages.some((m) => m.indexOf("Stockage") >= 0),
      "l'indisponibilité du stockage n'est pas signalée à l'utilisateur");

    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await say(B, { topicId: "t1", messageId: "m1", text: "Salut A" });
    await A.Sync.now(); await settle();

    assert(srv.calls.post === 2, "les actions ne sont pas parties (POST = " + srv.calls.post + ")");
    assert(B.Sync.pendingCount() === 0, "la file de B reste bloquée");
    const topic = Core.findTopic(A.Store.view, "t1");
    assert(topic && Core.findMessage(topic, "m1"), "A ne voit pas le message de B");
  });

  await check("deux personnes qui écrivent en même temps ne s'écrasent pas", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    const B = makeClient("B", srv, { indexedDB: false });
    await A.Sync.boot(); await B.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await B.Sync.now(); await settle();

    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE", { topicId: "t1", messageId: "ma", text: "de A" }, A.user));
    await B.Sync.dispatch(B.Sync.makeAction("CREATE_MESSAGE", { topicId: "t1", messageId: "mb", text: "de B" }, B.user));
    await settle();
    await Promise.all([A.Sync.now(), B.Sync.now()]);
    await settle();
    await A.Sync.now(); await B.Sync.now(); await settle();

    [A, B].forEach(function (client) {
      const topic = Core.findTopic(client.Store.view, "t1");
      assert(Core.findMessage(topic, "ma"), client.name + " ne voit pas le message de A");
      assert(Core.findMessage(topic, "mb"), client.name + " ne voit pas le message de B");
    });
  });

  /* « Synchroniser maintenant » ne doit pas retélécharger un état identique :
   * c'était un aller-retour complet ET un rendu intégral du DOM à chaque
   * retour d'onglet, ce qui faisait perdre le défilement du fil. */
  await check("une synchronisation forcée sans changement ne retélécharge rien", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    const stateCalls = srv.calls.state;
    const version = A.Store.version;
    await A.Sync.now(); await settle();

    assert(srv.calls.state === stateCalls, "l'état complet a été retéléchargé pour rien");
    assert(A.Store.version === version, "un rendu complet a été déclenché sans changement");
  });

  await check("une action refusée par le serveur quitte la file", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    /* Message dans un sujet qui n'existe pas côté serveur : refus MÉTIER. */
    A.Store.setBase({ revision: 1, updatedAt: new Date().toISOString(),
      topics: [{ id: "fantome", title: "Sujet" }], participants: [] });
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "fantome", messageId: "m1", text: "perdu" }, A.user));
    await settle(); await A.Sync.now(); await settle();

    assert(A.Sync.pendingCount() === 0, "l'action refusée bloque la file");
    assert(A.messages.some((m) => m.indexOf("refusée") >= 0), "le refus n'est pas expliqué");
  });

  /* Une panne réseau conserve la file ET fait reculer le rythme d'appel, au
   * lieu de marteler le serveur toutes les deux secondes. */
  await check("une panne réseau conserve la file et fait reculer le rythme", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    srv.down = true;
    const calm = A.Sync.diagnostics().intervalMs;
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "hors ligne" }, A.user));
    await settle();
    await A.Sync.now(); await settle();
    await A.Sync.now(); await settle();

    assert(A.Sync.pendingCount() === 1, "la file a été vidée à tort par une panne réseau");
    assert(A.Sync.diagnostics().intervalMs > calm, "le rythme d'appel ne recule pas après un échec");

    srv.down = false;
    await A.Sync.now(); await settle();
    assert(A.Sync.pendingCount() === 0, "la file ne repart pas au retour du réseau");
    assert(A.Sync.diagnostics().failures === 0, "le compteur d'échecs n'est pas remis à zéro");
  });

  await check("Sync.stop() coupe aussi un cycle déjà en vol", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    A.Sync.start();
    A.Sync.stop();
    await settle(); await settle();
    const calls = srv.calls.revision;
    await new Promise((resolve) => setTimeout(resolve, CONFIG.POLL_ACTIVE_MS + 400));
    assert(srv.calls.revision === calls,
      "la boucle continue d'interroger le serveur après Sync.stop()");
  });

  await check("le rythme s'adapte à l'activité", async () => {
    assert(CONFIG.POLL_ACTIVE_MS < CONFIG.POLL_IDLE_MS, "régime nerveux plus lent que le repos");
    assert(CONFIG.POLL_IDLE_MS < CONFIG.POLL_HIDDEN_MS, "repos plus lent qu'en arrière-plan");
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    assert(A.Sync.diagnostics().intervalMs === CONFIG.POLL_ACTIVE_MS,
      "le rythme ne se resserre pas juste après une activité");
  });

  await check("l'empreinte d'espace distingue deux scripts et ne fuit pas l'adresse", () => {
    const a = Utils.fingerprint("https://script.google.com/macros/s/AAA/exec");
    const b = Utils.fingerprint("https://script.google.com/macros/s/BBB/exec");
    assert(a !== b, "deux adresses différentes donnent la même empreinte");
    assert(a === Utils.fingerprint("https://script.google.com/macros/s/AAA/exec"), "empreinte instable");
    assert(a.length === 9 && a.indexOf("script") < 0, "l'empreinte laisse filtrer l'adresse");
  });

  console.log(failures.length
    ? "✗ " + failures.length + " échec(s) :\n  - " + failures.join("\n  - ")
    : "✓ " + passed + " tests réussis sur " + passed + ".");
  process.exit(failures.length ? 1 : 0);
}

run();
