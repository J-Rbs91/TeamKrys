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

/* options.features : capacités annoncées. Un tableau vide reproduit le backend
 * d'AVANT (protocole en deux temps, une action par POST) — c'est ce qui prouve
 * qu'un client à jour continue de fonctionner contre un script pas encore
 * redéployé. */
function makeServer(options) {
  options = options || {};
  const features = options.features || [];
  const srv = {
    data: Core.emptyState(), features,
    calls: { revision: 0, state: 0, post: 0, actionsPosted: 0 },
    down: false
  };

  function envelope(payload) {
    return Object.assign({ ok: true, features }, payload);
  }

  function applyOne(action) {
    /* Refus décidé par le SERVEUR seul : c'est le cas réel où la validation
     * optimiste du client passe (sa vue est encore à jour) mais où l'état
     * serveur a changé entre-temps. */
    if (srv.rejectWhen && srv.rejectWhen(action)) {
      return { id: action.id, ok: false, error: "Refus simulé côté serveur." };
    }
    if (srv.data.processedActionIds.indexOf(action.id) >= 0) {
      return { id: action.id, ok: true, duplicate: true };
    }
    const verdict = Core.validateAction(srv.data, action);
    if (!verdict.ok) { return { id: action.id, ok: false, error: verdict.error }; }
    Core.applyAction(srv.data, action, new Date().toISOString());
    srv.data.revision += 1;
    srv.data.processedActionIds.push(action.id);
    return { id: action.id, ok: true };
  }

  srv.post = function (body) {
    srv.calls.post += 1;
    if (srv.down) { const e = new Error("Connexion impossible."); e.kind = "network"; throw e; }
    const actions = Array.isArray(body) ? body : [body];
    srv.calls.actionsPosted += actions.length;

    if (!Array.isArray(body)) {
      /* Chemin d'origine : un refus métier est une erreur de la requête. */
      const result = applyOne(body);
      if (result.ok === false) { const e = new Error(result.error); e.kind = "server"; throw e; }
      return envelope({ revision: srv.data.revision, state: lean(srv.data), duplicate: !!result.duplicate });
    }

    const results = actions.map(applyOne);
    return envelope({ revision: srv.data.revision, state: lean(srv.data), results });
  };

  srv.revision = function () {
    srv.calls.revision += 1;
    if (srv.down) { const e = new Error("Connexion impossible."); e.kind = "network"; throw e; }
    return envelope({ revision: srv.data.revision, updatedAt: srv.data.updatedAt });
  };

  srv.state = function (since) {
    srv.calls.state += 1;
    if (srv.down) { const e = new Error("Connexion impossible."); e.kind = "network"; throw e; }
    if (features.indexOf("since") >= 0 && since !== undefined && since !== null && since !== "") {
      const known = parseInt(since, 10);
      if (!isNaN(known) && known === srv.data.revision) {
        return envelope({ unchanged: true, revision: known });
      }
    }
    return envelope({ revision: srv.data.revision, state: lean(srv.data) });
  };
  return srv;
}

/* L'état envoyé au client n'emporte pas processedActionIds (capacité « lean »). */
function lean(state) {
  return {
    revision: state.revision, updatedAt: state.updatedAt,
    participants: clone(state.participants), topics: clone(state.topics)
  };
}

const MODERN = ["since", "batch", "lean"];

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
    /* La réponse est CALCULÉE à l'appel et LIVRÉE plus tard : c'est la seule
     * façon de reproduire une lecture partie avant une écriture et revenue
     * après elle, donc porteuse d'un état déjà périmé. */
    getState: () => {
      let payload;
      try { payload = server.state(); } catch (e) { return Promise.reject(e); }
      if (!server.readDelay) { return Promise.resolve(payload); }
      return new Promise((resolve) => setTimeout(() => resolve(payload), server.readDelay));
    },
    getStateSince: (url, token, since) => {
      try { return Promise.resolve(server.state(since)); } catch (e) { return Promise.reject(e); }
    },
    postAction: (url, token, action) => {
      try { return Promise.resolve(server.post(action)); } catch (e) { return Promise.reject(e); }
    },
    postActions: (url, token, actions) => {
      try { return Promise.resolve(server.post(actions)); } catch (e) { return Promise.reject(e); }
    },
    /* Le beacon du navigateur : le document peut mourir juste après, la requête
     * part quand même — et son émetteur n'apprendra JAMAIS ce qu'elle a donné.
     * On reproduit les deux traits : appliqué côté serveur, muet côté client. */
    beacon: (url, token, body) => {
      if (server.refuseBeacon) { return false; }
      try { server.post(body); } catch (e) { /* muet, par construction */ }
      return true;
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

  /* ------------------------------------- Négociation de capacités --- */

  /* Le frontend (GitHub Pages) et le backend (Apps Script) se déploient
   * séparément, et les téléphones gardent longtemps une version en cache. Les
   * deux sens de désaccord doivent donc marcher. */

  await check("client à jour + backend PAS ENCORE redéployé : rien ne casse", async () => {
    const srv = makeServer({ features: [] });
    const B = makeClient("B", srv, { indexedDB: false });
    const A = makeClient("A", srv, { indexedDB: false });
    await B.Sync.boot(); await A.Sync.boot(); await settle();

    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await say(B, { topicId: "t1", messageId: "m1", text: "Salut A" });
    await A.Sync.now(); await settle();

    assert(A.Sync.supports("since") === false, "capacité déduite d'un serveur qui n'annonce rien");
    assert(A.Sync.supports("batch") === false, "capacité déduite d'un serveur qui n'annonce rien");
    const topic = Core.findTopic(A.Store.view, "t1");
    assert(topic && Core.findMessage(topic, "m1"), "A ne voit pas le message de B");
  });

  await check("backend à jour : la lecture ne coûte plus qu'un aller-retour", async () => {
    const srv = makeServer({ features: MODERN });
    const B = makeClient("B", srv, { indexedDB: false });
    const A = makeClient("A", srv, { indexedDB: false });
    await B.Sync.boot(); await A.Sync.boot(); await settle();
    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await A.Sync.now(); await settle();
    assert(A.Sync.supports("since"), "la capacité « since » n'a pas été apprise");

    /* B écrit ; A doit tout recevoir en UNE requête. */
    await say(B, { topicId: "t1", messageId: "m1", text: "Salut A" });
    const before = { revision: srv.calls.revision, state: srv.calls.state };
    await A.Sync.now(); await settle();

    assert(srv.calls.revision === before.revision,
      "mode=revision est encore appelé alors que « since » est disponible");
    assert(srv.calls.state === before.state + 1,
      "la réception a coûté " + (srv.calls.state - before.state) + " requêtes au lieu d'une");
    const topic = Core.findTopic(A.Store.view, "t1");
    assert(Core.findMessage(topic, "m1"), "A ne voit pas le message de B");

    /* Et un tour sans rien de neuf reste une seule requête, minuscule. */
    const idle = srv.calls.state;
    await A.Sync.now(); await settle();
    assert(srv.calls.state === idle + 1, "un tour au repos devrait coûter une requête");
  });

  await check("backend à jour : cinq réactions partent en un seul envoi", async () => {
    const srv = makeServer({ features: MODERN });
    const B = makeClient("B", srv, { indexedDB: false });
    const A = makeClient("A", srv, { indexedDB: false });
    await B.Sync.boot(); await A.Sync.boot(); await settle();
    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await say(B, { topicId: "t1", messageId: "m1", text: "x" });
    await A.Sync.now(); await settle();

    const before = srv.calls.post;
    /* Cinq réactions enchaînées, sans laisser la file se vider entre-temps. */
    for (const emoji of ["👌", "💪", "🤏", "👎", "💩"]) {
      A.Sync.dispatch(A.Sync.makeAction("SET_REACTION",
        { topicId: "t1", messageId: "m1", emoji }, A.user));
    }
    await settle();
    await A.Sync.now(); await settle();

    const posts = srv.calls.post - before;
    assert(posts === 1, "les cinq réactions ont coûté " + posts + " allers-retours au lieu d'un");
    assert(A.Sync.pendingCount() === 0, "la file n'est pas vidée après l'envoi groupé");
    assert(srv.calls.actionsPosted >= 5, "des actions ont été perdues en route");
  });

  await check("envoi groupé : une action refusée n'emporte pas les valides", async () => {
    const srv = makeServer({ features: MODERN });
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    /* Trois actions d'un coup, dont une que le SERVEUR refuse — cas réel d'un
     * état modifié ailleurs entre la validation optimiste et l'envoi. Le refus
     * arrive au milieu du lot : c'est la position qui compte. */
    srv.rejectWhen = (action) => action.payload && action.payload.text === "perdu";
    A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "ok1", text: "avant" }, A.user));
    A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "ko", text: "perdu" }, A.user));
    A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "ok2", text: "après" }, A.user));
    await settle();
    await A.Sync.now(); await settle();

    const topic = Core.findTopic(A.Store.view, "t1");
    assert(Core.findMessage(topic, "ok1"), "le message d'avant le refus a été perdu");
    assert(Core.findMessage(topic, "ok2"), "le message d'APRÈS le refus a été perdu");
    assert(A.Sync.pendingCount() === 0, "la file reste bloquée par l'action refusée");
    assert(A.messages.some((m) => m.indexOf("refusée") >= 0), "le refus n'est pas expliqué");
  });

  await check("l'ordre de la file est respecté malgré le groupage", async () => {
    const srv = makeServer({ features: MODERN });
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    /* Le sujet et ses messages partent dans le même lot : si l'ordre n'était
     * pas tenu, le serveur refuserait les messages d'un sujet pas encore créé. */
    A.Sync.dispatch(A.Sync.makeAction("CREATE_TOPIC", { topicId: "t9", title: "Ordre" }, A.user));
    for (let i = 0; i < 4; i++) {
      A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
        { topicId: "t9", messageId: "m" + i, text: "message " + i }, A.user));
    }
    await settle();
    await A.Sync.now(); await settle();

    const topic = Core.findTopic(A.Store.view, "t9");
    assert(topic, "le sujet du lot n'a pas été créé");
    assert(topic.messages.length === 4, "seulement " + topic.messages.length + " messages sur 4");
    assert(topic.messages.map((m) => m.text).join("|") === "message 0|message 1|message 2|message 3",
      "l'ordre des messages n'est pas tenu");
    assert(A.messages.every((m) => m.indexOf("refusée") < 0), "une action a été refusée à tort");
  });

  /* ------------------------------------------- Survie à la fermeture --- */

  /* ⚠️ RÉGRESSION HISTORIQUE — le scénario du 5 août.
   *
   * Marine écrit un message avec du réseau, l'envoi n'aboutit pas du premier
   * coup (Apps Script sérialise tout derrière un LockService : dépasser le
   * délai est ordinaire, pas exceptionnel), puis elle range son téléphone. La
   * page meurt. Or le SEUL mécanisme qui rejouait l'action était la boucle
   * d'interrogation — qui meurt avec la page. Le message est resté deux jours
   * dans la file, invisible de tous, et n'est parti qu'à la réouverture de
   * l'application. Il doit maintenant partir AVANT que la page disparaisse. */
  await check("le message part même si la page meurt juste après l'envoi", async () => {
    const srv = makeServer();
    const B = makeClient("B", srv, { indexedDB: false });
    const A = makeClient("A", srv, { indexedDB: false });
    await B.Sync.boot(); await A.Sync.boot(); await settle();
    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    /* L'envoi ordinaire n'aboutit pas : requête coupée, serveur qui traîne. */
    srv.down = true;
    await B.Sync.dispatch(B.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "Test hihi" }, B.user));
    await settle();
    assert(B.Sync.pendingCount() === 1, "l'action devrait rester en file après un envoi manqué");

    /* Le réseau, lui, va très bien : c'est la page qui s'en va. */
    srv.down = false;
    const handed = B.Sync.flush();          // ce que fait « pagehide »
    B.Sync.stop();                          // …et la page cesse d'exister
    await settle();

    assert(handed === true, "l'envoi de secours n'a pas été pris en charge");
    await A.Sync.now(); await settle();
    const topic = Core.findTopic(A.Store.view, "t1");
    assert(topic && Core.findMessage(topic, "m1"),
      "A ne reçoit toujours pas le message écrit avant la fermeture");
  });

  /* Un beacon n'a pas de réponse : l'action reste en file, faute de preuve
   * qu'elle est passée. Elle repart donc au démarrage suivant, et c'est la
   * déduplication serveur qui doit empêcher le message d'apparaître en double. */
  await check("le doublon d'un envoi de secours est absorbé, la file se vide", async () => {
    const srv = makeServer();
    const B = makeClient("B", srv, { indexedDB: false });
    await B.Sync.boot(); await settle();
    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    srv.down = true;
    await B.Sync.dispatch(B.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "Test hihi" }, B.user));
    await settle();
    srv.down = false;
    B.Sync.flush();
    await settle();

    /* Retour de l'application : la file contient encore l'action, non confirmée. */
    assert(B.Sync.pendingCount() === 1, "la file ne devrait pas se vider sans confirmation");
    await B.Sync.now(); await settle();

    assert(B.Sync.pendingCount() === 0, "la file reste bloquée après le retour");
    const topic = Core.findTopic(B.Store.view, "t1");
    assert(topic.messages.length === 1,
      "le message apparaît en " + topic.messages.length + " exemplaires");
    assert(B.messages.every((m) => m.indexOf("refusée") < 0),
      "le doublon a été présenté comme un refus à l'utilisateur");
  });

  /* La fenêtre la plus étroite, et la plus vicieuse : entre l'affichage du
   * message et son écriture en base, l'action n'est encore NULLE PART. Une page
   * qui meurt pile là l'emporte sans laisser de trace — ni chez les autres, ni
   * en file au redémarrage. */
  await check("une action pas encore écrite en base part quand même à la fermeture", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    const B = makeClient("B", srv, { indexedDB: false });
    await A.Sync.boot(); await B.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    /* On n'attend PAS dispatch : la clé de file n'est pas encore attribuée. */
    A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "juste avant de fermer" }, A.user));
    assert(A.Store.queue.length === 1 && A.Store.queue[0].seq === null,
      "le scénario ne teste rien : la clé est déjà attribuée");

    assert(A.Sync.flush() === true, "l'action sans clé de file n'a pas été envoyée");
    await settle();

    await B.Sync.now(); await settle();
    const topic = Core.findTopic(B.Store.view, "t1");
    assert(topic && Core.findMessage(topic, "m1"), "le message écrit juste avant la fermeture est perdu");
  });

  await check("rien à envoyer : la page qui se ferme ne réveille pas le serveur", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    const posts = srv.calls.post;
    assert(A.Sync.flush() === false, "un envoi de secours part alors que la file est vide");
    assert(srv.calls.post === posts, "le serveur a été appelé pour rien");
  });

  /* Couper une écriture ne l'annule pas côté serveur : ça ne fait que nous en
   * cacher l'issue, et fabriquer un doublon. Elle doit donc avoir plus de temps
   * qu'une lecture, qui est rejouée au tour suivant sans rien risquer. */
  await check("une écriture a plus de temps qu'une lecture", () => {
    assert(CONFIG.WRITE_TIMEOUT_MS > CONFIG.REQUEST_TIMEOUT_MS,
      "l'écriture est coupée aussi tôt que la lecture");
  });

  /* ⚠️ Une réponse de lecture décrit l'état du serveur au moment où elle a été
   * CALCULÉE. Partie avant une écriture et revenue après elle, l'appliquer
   * remet l'état d'avant : le message qu'on vient d'écrire disparaît de son
   * propre écran. Vu de l'utilisateur, c'est « l'application a perdu mon
   * message » — le défaut le plus inquiétant qui soit dans une messagerie. */
  await check("un message envoyé ne disparaît pas sous une lecture plus vieille", async () => {
    const srv = makeServer({ features: [] });
    const A = makeClient("A", srv, { indexedDB: false });
    const B = makeClient("B", srv, { indexedDB: false });
    await A.Sync.boot(); await B.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    /* B écrit : A est alors en retard d'une révision, donc sa prochaine lecture
     * téléchargera vraiment l'état. */
    await B.Sync.now(); await settle();
    await say(B, { topicId: "t1", messageId: "mb", text: "de B" });

    srv.readDelay = 60;
    const reading = A.Sync.now();                       // lecture EN VOL
    await new Promise((resolve) => setTimeout(resolve, 10));

    /* …pendant laquelle A écrit, et son envoi aboutit. */
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "ma", text: "de A" }, A.user));
    await settle();

    await reading; await settle();
    srv.readDelay = 0;

    let topic = Core.findTopic(A.Store.view, "t1");
    assert(Core.findMessage(topic, "ma"), "le message que A vient d'écrire a disparu de son écran");

    /* La lecture périmée a été jetée, pas appliquée : le message de B arrive au
     * tour suivant. Rien n'est perdu, c'est au plus un tour de boucle. */
    await A.Sync.now(); await settle();
    topic = Core.findTopic(A.Store.view, "t1");
    assert(Core.findMessage(topic, "ma"), "le message de A n'a pas survécu au tour suivant");
    assert(Core.findMessage(topic, "mb"), "le message de B n'est jamais arrivé");
  });

  /* Tant qu'un message n'est pas parti, il n'a pas d'heure : celle du serveur
   * n'existe pas encore, et celle de l'appareil n'est pas celle que les autres
   * verront. L'interface doit pouvoir le dire. */
  await check("un message encore en file est signalé comme tel", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    srv.down = true;
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "en attente" }, A.user));
    await settle();
    assert(A.Store.pendingMessageIds()["m1"] === true, "le message en file n'est pas repéré");

    srv.down = false;
    await A.Sync.now(); await settle();
    assert(A.Store.pendingMessageIds()["m1"] === undefined,
      "le message reste marqué « en envoi » après sa remise");
  });

  await check("backend à jour : l'état reçu ne porte plus processedActionIds", async () => {
    const srv = makeServer({ features: MODERN });
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    assert(A.Store.base.processedActionIds.length === 0,
      "le client reçoit encore les identifiants de déduplication");
    assert(Core.findTopic(A.Store.view, "t1"), "l'allègement a fait perdre le sujet");
  });

  console.log(failures.length
    ? "✗ " + failures.length + " échec(s) :\n  - " + failures.join("\n  - ")
    : "✓ " + passed + " tests réussis sur " + passed + ".");
  process.exit(failures.length ? 1 : 0);
}

run();
