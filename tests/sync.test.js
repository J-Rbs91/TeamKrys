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
 * reste couverte par la recette manuelle (docs/CHECKLIST_TEST.md) ; ses PANNES
 * (ouverture muette ou refusée, connexion fermée, quota, base partagée par deux
 * onglets) sont jouées sur une fausse IndexedDB minimale (makeIDB).
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
    down: false,
    /* Pannes injectées au niveau HTTP (client « realApi » seulement, voir makeFetch). */
    faults: [], http: { GET: 0, POST: 0 }, beacons: []
  };

  function envelope(payload) {
    return Object.assign({ ok: true, features }, payload);
  }

  /* Contrat de Code.gs (WP-01) : un rejet de validation porte code « invalid »,
   * définitif. options.legacy : backend d'AVANT, qui refusait sans aucun code. */
  function refusal(id, error) {
    return options.legacy ? { id, ok: false, error } : { id, ok: false, code: "invalid", error };
  }

  function applyOne(action) {
    /* Refus décidé par le SERVEUR seul : c'est le cas réel où la validation
     * optimiste du client passe (sa vue est encore à jour) mais où l'état
     * serveur a changé entre-temps. */
    if (srv.rejectWhen && srv.rejectWhen(action)) {
      return refusal(action.id, "Refus simulé côté serveur.");
    }
    if (srv.data.processedActionIds.indexOf(action.id) >= 0) {
      return { id: action.id, ok: true, duplicate: true };
    }
    const verdict = Core.validateAction(srv.data, action);
    if (!verdict.ok) { return refusal(action.id, verdict.error); }
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
      if (result.ok === false) { const e = new Error(result.error); e.kind = "server"; e.code = result.code || null; throw e; }
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

/* Faux `fetch` devant le faux backend : le VRAI js/api.js lit ses réponses
 * (statut, corps, JSON). Une panne de srv.faults ({ method, kind, times }) vaut
 * pour la prochaine requête de cette méthode :
 *   html200    page d'erreur HTML en 200, rien d'exécuté
 *   garbage    JSON tronqué en 200, rien d'exécuté
 *   lateGarbage  exécutée, puis réponse illisible (le verdict se perd)
 *   lock, drive  exception de Code.gs : { ok:false, code:"retry" }, rien d'exécuté
 *   legacyFail exception d'un backend d'AVANT : { ok:false } sans code
 *   oddCode    code inconnu de ce client
 *   status500  statut 500
 *   hang       en-têtes reçus, corps qui n'arrive jamais
 *   noResults  lot : seule la 1re action exécutée, réponse ok SANS results
 *   holes      lot : 2e action en retry (non exécutée), verdict de la 3e absent
 *   auth       refus d'authentification : { ok:false, code:"auth" }, rien d'exécuté */
function makeFetch(srv) {
  return function (url, init) {
    const method = (init && init.method) || "GET";
    srv.http[method] = (srv.http[method] || 0) + 1;
    const i = srv.faults.findIndex((f) => f.method === method && f.times > 0);
    const kind = i >= 0 ? srv.faults[i].kind : null;
    if (i >= 0) { srv.faults[i].times -= 1; }
    const reply = (status, text) => Promise.resolve({
      ok: status >= 200 && status < 300, status,
      text: () => (kind === "hang" ? new Promise(() => {}) : Promise.resolve(text))
    });
    const failure = { lock: "Lock timeout: another process was holding the lock for too long.",
      drive: "Service error: Drive" };
    if (kind === "html200") { return reply(200, "<!DOCTYPE html><html><body>Erreur du script</body></html>"); }
    if (kind === "garbage") { return reply(200, "{\"ok\":true,\"revision\":"); }
    if (kind === "status500") { return reply(500, "<html>500</html>"); }
    if (kind === "hang") { return reply(200, ""); }
    if (failure[kind]) { return reply(200, JSON.stringify({ ok: false, code: "retry", error: failure[kind] })); }
    if (kind === "legacyFail") { return reply(200, JSON.stringify({ ok: false, error: "Service error: Drive" })); }
    if (kind === "oddCode") { return reply(200, JSON.stringify({ ok: false, code: "quota", error: "Quota dépassé." })); }
    if (kind === "auth") { return reply(200, JSON.stringify({ ok: false, code: "auth", error: "Code d'accès refusé." })); }

    const query = new URL(url).searchParams;
    let body = init && init.body ? JSON.parse(init.body) : null;
    let payload;
    try {
      if (method === "POST" && kind === "noResults") {
        srv.post(body[0]);
        payload = { ok: true, features: srv.features, revision: srv.data.revision, state: lean(srv.data) };
      } else if (method === "POST" && kind === "holes") {
        payload = srv.post([body[0]]);
        srv.post([body[2]]);
        payload = Object.assign({}, payload, { revision: srv.data.revision, state: lean(srv.data), results: [
          payload.results[0], { id: body[1].id, ok: false, code: "retry", error: "Service error: Drive" }] });
      } else if (method === "POST") {
        payload = srv.post(body);
      } else if (query.get("mode") === "revision") {
        payload = srv.revision();
      } else {
        payload = srv.state(query.get("since"));
      }
    } catch (e) {
      if (e.kind === "network") { return Promise.reject(new TypeError("Failed to fetch")); }
      payload = { ok: false, error: e.message, code: e.code || undefined };
    }
    if (kind === "lateGarbage") { return reply(200, "{\"ok\":tr"); }
    return reply(200, JSON.stringify(payload));
  };
}

/* Horloge VIRTUELLE : les délais ne s'écoulent que lorsqu'on les fait avancer, dans
 * l'ordre, les promesses se déroulant entre deux échéances. Cinq minutes de boucle
 * se jouent ainsi en une fraction de seconde, et de façon déterministe. */
function makeClock() {
  let now = 0;
  let seq = 0;
  const waiting = new Map();
  const turn = () => new Promise((resolve) => setTimeout(resolve, 1));
  return {
    now: () => now,
    setTimeout(fn, ms) { seq += 1; waiting.set(seq, { at: now + (ms || 0), fn }); return seq; },
    clearTimeout(handle) { waiting.delete(handle); },
    async advance(ms) {
      const end = now + ms;
      for (let guard = 0; guard < 20000; guard++) {
        await turn();
        let next = null;
        waiting.forEach((timer, handle) => {
          if (timer.at <= end && (!next || timer.at < next.timer.at)) { next = { handle, timer }; }
        });
        if (!next) { now = end; await turn(); return; }
        waiting.delete(next.handle);
        now = Math.max(now, next.timer.at);
        next.timer.fn();
      }
      throw new Error("horloge virtuelle : trop d'échéances");
    }
  };
}

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
  /* options.timers : horloge accélérée. Chaque délai demandé est noté, puis
   * écoulé cent fois plus vite : on vérifie un délai de plusieurs secondes sans
   * l'attendre. */
  if (options.timers) {
    sandbox.setTimeout = (fn, ms) => { options.timers.push(ms || 0); return setTimeout(fn, (ms || 0) / 100); };
  }
  /* options.clock : horloge virtuelle (makeClock), pour jouer des minutes sans les attendre. */
  if (options.clock) { sandbox.setTimeout = options.clock.setTimeout; sandbox.clearTimeout = options.clock.clearTimeout; }

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
      server.beacons.push(body);
      try { server.post(body); } catch (e) { /* muet, par construction */ }
      return true;
    }
  };

  /* options.realApi : le VRAI js/api.js (classement des réponses, délais) sur le
   * faux fetch de makeFetch, au lieu de la doublure ci-dessus. */
  const files = ["js/state.js", "js/database.js", "js/sync.js"];
  if (options.realApi) {
    delete sandbox.Api;
    sandbox.fetch = makeFetch(server);
    sandbox.AbortController = AbortController;
    files.unshift("js/api.js");
  }
  files.forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  });

  const Sync = ctx.Sync;
  Sync.setHooks({ onMessage: (text, kind) => messages.push(kind + ": " + text) });
  Sync.setConnection({ url: "https://exemple/exec", token: "", localMode: false, unlocked: true });

  return { name, Sync, Store: ctx.Store, DB: ctx.DB, Api: ctx.Api, messages,
    user: { id: "u-" + name, name: name } };
}

/* Laisse les promesses et les micro-tâches se dérouler. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

/* ---------------------------------------------- Fausse IndexedDB --- */

/* Juste ce qu'emploie database.js, avec ce qui compte ici : clé auto-incrémentée
 * acquise à la fin de la transaction, données partagées par plusieurs clients
 * (deux onglets du même appareil, ou deux lancements successifs), et pannes à
 * la demande : ouverture muette ou refusée, connexion fermée par le système
 * (transaction() lève InvalidStateError), quota dépassé à l'écriture. */
function makeIDB() {
  const data = {};
  const conns = [];
  const faults = { openHang: 0, openFail: 0, txThrow: 0, addQuota: 0 };
  const later = (fn) => setTimeout(fn, 0);
  const fault = (name) => { const e = new Error(name); e.name = name; return e; };
  const request = () => ({ result: undefined, onsuccess: null });

  function transaction() {
    const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
    const steps = [];              // appliquées à la validation, dans l'ordre
    tx.objectStore = (name) => {
      const s = data[name];
      return {
        add(value) {
          if (faults.addQuota > 0) { faults.addQuota -= 1; throw fault("QuotaExceededError"); }
          const r = request();
          steps.push(() => {
            s.auto += 1;
            s.rows.set(s.auto, Object.assign({}, value, { [s.keyPath]: s.auto }));
            r.result = s.auto; if (r.onsuccess) { r.onsuccess(); }
          });
          return r;
        },
        put(value) { steps.push(() => { s.rows.set(value[s.keyPath], value); }); return request(); },
        get(key) {
          const r = request();
          steps.push(() => { r.result = s.rows.get(key); if (r.onsuccess) { r.onsuccess(); } });
          return r;
        },
        delete(key) { steps.push(() => { s.rows.delete(key); }); return request(); },
        clear() { steps.push(() => { s.rows.clear(); }); return request(); },
        openCursor() {
          const r = request();
          steps.push(() => new Promise((done) => {
            const keys = [...s.rows.keys()].sort((a, b) => a - b);
            let i = 0;
            const next = () => {
              if (i >= keys.length) { r.result = null; if (r.onsuccess) { r.onsuccess(); } done(); return; }
              const key = keys[i++];
              r.result = { key, value: s.rows.get(key), continue: () => later(next) };
              if (r.onsuccess) { r.onsuccess(); }
            };
            next();
          }));
          return r;
        }
      };
    };
    later(async () => {
      for (const step of steps) { await step(); }
      if (tx.oncomplete) { tx.oncomplete(); }
    });
    return tx;
  }

  return {
    faults,
    open() {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      if (faults.openHang > 0) { faults.openHang -= 1; return req; }      // muette, pour toujours
      later(() => {
        if (faults.openFail > 0) {
          faults.openFail -= 1; req.error = fault("UnknownError");
          if (req.onerror) { req.onerror(); }
          return;
        }
        const db = {
          closed: false, onclose: null, onversionchange: null,
          objectStoreNames: { contains: (n) => !!data[n] },
          createObjectStore(n, o) { data[n] = { keyPath: o.keyPath, auto: 0, rows: new Map() }; },
          close() { db.closed = true; },
          transaction() {
            if (db.closed) { throw fault("InvalidStateError"); }
            if (faults.txThrow > 0) { faults.txThrow -= 1; throw fault("InvalidStateError"); }
            return transaction();
          }
        };
        conns.push(db);
        req.result = db;
        if (!data.queue && req.onupgradeneeded) { req.onupgradeneeded(); }
        if (req.onsuccess) { req.onsuccess(); }
      });
      return req;
    },
    /* Ce que fait le système (iOS au retour d'arrière-plan) : fermer les
     * connexions sous les pieds de l'application, sans prévenir. */
    closeAll() { conns.forEach((db) => { db.closed = true; }); },
    rows(name) { return data[name] ? [...data[name].rows.values()] : []; }
  };
}

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

  /* --------------------------------------- Pannes d'IndexedDB (§22) --- */

  /* ⚠️ RÉGRESSION (BL-002). Quand la base refusait d'écrire (connexion fermée par
   * le système, quota), l'action était RETIRÉE de la file et jamais envoyée,
   * réseau sain : le message disparaissait, composeur déjà vidé. */
  await check("base qui refuse d'écrire (connexion perdue, puis quota) : l'action reste en file et part", async () => {
    const srv = makeServer();
    const idb = makeIDB();
    const A = makeClient("A", srv, { indexedDB: idb });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    srv.down = true;                       // l'envoi traîne : on voit ce que garde la file
    idb.faults.txThrow = 2;                // connexion perdue, et encore après la réouverture
    const r1 = await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "base fermée" }, A.user));
    idb.faults.addQuota = 1;               // puis disque plein
    const r2 = await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m2", text: "quota" }, A.user));
    await settle();

    assert(r1.ok && r2.ok, "l'action est refusée pour un échec du stockage local");
    assert(A.Sync.pendingCount() === 2, "action retirée de la file : " + A.Sync.pendingCount() + " en attente au lieu de 2");
    assert(A.Store.queue.every((e) => e.seq !== null), "l'action gardée en mémoire n'est pas envoyable");
    const shown = Core.findTopic(A.Store.view, "t1");
    assert(Core.findMessage(shown, "m1") && Core.findMessage(shown, "m2"), "le message a disparu de l'écran");
    const warnings = A.messages.filter((m) => m.indexOf("Enregistrement sur cet appareil impossible") >= 0);
    assert(warnings.length === 1, warnings.length + " avertissement(s) au lieu d'un seul");

    srv.down = false;
    await A.Sync.now(); await settle(); await A.Sync.now(); await settle();
    const texts = Core.findTopic(srv.data, "t1").messages.map((m) => m.text).join(" | ");
    assert(texts === "base fermée | quota", "le serveur a reçu : [" + texts + "]");
    assert(A.Sync.pendingCount() === 0, "la file ne se vide pas après l'acquittement");
    assert(idb.rows("queue").length === 0, "une action acquittée reste en base");
  });

  await check("connexion fermée par le système : la base est rouverte, l'action suivante y est écrite", async () => {
    const srv = makeServer();
    const idb = makeIDB();
    const A = makeClient("A", srv, { indexedDB: idb });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    srv.down = true;
    idb.closeAll();
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "après fermeture" }, A.user));
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m2", text: "la suivante" }, A.user));
    await settle();

    const saved = idb.rows("queue").map((r) => r.action.payload.messageId).join(",");
    assert(saved === "m1,m2", "file en base après la fermeture : [" + saved + "] au lieu de [m1,m2]");
    assert(A.messages.every((m) => m.indexOf("appareil") < 0), "avertissement de stockage affiché alors que la base a été rouverte");

    srv.down = false;
    await A.Sync.now(); await settle();
    assert(Core.findMessage(Core.findTopic(srv.data, "t1"), "m2"), "l'action suivante n'est pas arrivée");
    assert(A.Sync.pendingCount() === 0 && idb.rows("queue").length === 0, "la file ne se vide pas");
  });

  /* BL-021 : une ouverture qui ne répond jamais (iOS 14.6, vues intégrées)
   * laissait l'écran blanc indéfiniment, Sync.boot n'aboutissant jamais. */
  await check("ouverture de la base muette : le démarrage aboutit en 5 s au plus, en repli mémoire", async () => {
    const srv = makeServer();
    const idb = makeIDB();
    idb.faults.openHang = 1;
    const timers = [];
    const A = makeClient("A", srv, { indexedDB: idb, timers });
    const booted = await Promise.race([
      A.Sync.boot().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 1500))
    ]);
    assert(booted, "le démarrage attend indéfiniment une base qui ne répond pas (écran blanc)");
    assert(timers.length > 0 && Math.max(...timers) <= 5000, "délai d'ouverture demandé : " + Math.max(...timers) + " ms");
    assert(A.DB.isPersistent() === false, "le repli mémoire n'est pas actif");
    assert(A.messages.some((m) => m.indexOf("Stockage") >= 0), "aucun message honnête sur le stockage");

    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    assert(Core.findTopic(srv.data, "t1"), "rien ne part après une ouverture muette");
  });

  /* ⚠️ BL-021 (SYN-018) : après une ouverture ratée, la file d'hier restait
   * invisible pour la session et partait PLUS TARD, après la décision du jour,
   * qu'elle écrasait. */
  await check("ouverture ratée puis rétablie : la décision d'hier part AVANT celle d'aujourd'hui", async () => {
    const srv = makeServer();
    const idb = makeIDB();
    const vote = (client, value) => client.Sync.dispatch(client.Sync.makeAction("SET_VOTE",
      { topicId: "t1", proposalId: "p1", value }, client.user));

    /* Hier, hors ligne : « pour », écrit en base, puis l'application est fermée. */
    const A1 = makeClient("A", srv, { indexedDB: idb });
    await A1.Sync.boot(); await settle();
    await say(A1, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await say(A1, { topicId: "t1", proposalId: "p1", title: "Proposition" }, "CREATE_PROPOSAL");
    srv.down = true;
    await vote(A1, "for"); await settle();
    A1.Sync.stop();
    assert(idb.rows("queue").length === 1, "le scénario ne teste rien : le vote d'hier n'est pas en base");

    /* Aujourd'hui : l'ouverture échoue une fois, et l'on vote « contre » aussitôt. */
    srv.down = false;
    idb.faults.openFail = 1;
    const A2 = makeClient("A", srv, { indexedDB: idb });
    await A2.Sync.boot(); await settle();
    A2.Store.setBase(lean(srv.data));
    await vote(A2, "against");
    await settle(); await A2.Sync.now(); await settle(); await A2.Sync.now(); await settle();
    A2.Sync.stop();

    /* Plus tard, la base répond normalement. */
    const A3 = makeClient("A", srv, { indexedDB: idb });
    await A3.Sync.boot(); await settle(); await A3.Sync.now(); await settle();

    const final = Core.findTopic(srv.data, "t1").proposals[0].votes["u-A"];
    assert(final === "against", "vote final = " + final + " (voulu : against) : la décision d'hier a écrasé celle du jour");
    assert(A3.Sync.pendingCount() === 0 && idb.rows("queue").length === 0, "la file ne se vide pas");
  });

  /* BL-006 : un onglet resté ouvert ne relisait jamais la base, et affichait
   * « À jour » au-dessus d'une action laissée par un autre onglet. */
  await check("une action laissée en base par un autre onglet part au cycle suivant", async () => {
    const srv = makeServer();
    const idb = makeIDB();
    const A = makeClient("A", srv, { indexedDB: idb });     // l'onglet qui sera fermé
    const B = makeClient("B", srv, { indexedDB: idb });     // l'onglet resté ouvert
    await A.Sync.boot(); await B.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    await B.Sync.now(); await settle();

    srv.down = true;
    await A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
      { topicId: "t1", messageId: "m1", text: "laissé par A" }, A.user));
    await settle();
    A.Sync.stop();
    assert(idb.rows("queue").length === 1, "le scénario ne teste rien : rien en base");

    await B.Sync.now(); await settle();
    const label = B.Sync.status().label;
    assert(B.Sync.pendingCount() === 1 && label === "En attente (1)",
      "B ignore l'action laissée en base : indicateur « " + label + " »");

    srv.down = false;
    await B.Sync.now(); await settle();
    assert(Core.findMessage(Core.findTopic(srv.data, "t1"), "m1"), "B n'envoie pas l'action de l'autre onglet");
    assert(B.Sync.pendingCount() === 0 && B.Sync.status().label === "À jour", "B ne revient pas à « À jour »");
    assert(idb.rows("queue").length === 0, "l'entrée acquittée reste en base");
  });

  /* BL-001 (WP-08) : une action ne quitte la file que sur un verdict CERTAIN
   * (appliquée, doublon reconnu, refus « invalid »). Ces tests passent par le
   * VRAI js/api.js (client « realApi ») : c'est son classement des réponses qui
   * jetait l'action (page HTML, JSON tronqué, exception de Code.gs). */
  const copies = (srv, id) => {
    const topic = Core.findTopic(srv.data, "t1");
    return topic ? topic.messages.filter((m) => m.id === id).length : 0;
  };
  const refusedMsg = (client) => client.messages.filter((m) => /refus/i.test(m));
  async function connected(srv) {
    const A = makeClient("A", srv, { indexedDB: false, realApi: true });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    return A;
  }
  const write = (A, id, text) => A.Sync.dispatch(A.Sync.makeAction("CREATE_MESSAGE",
    { topicId: "t1", messageId: id, text: text || "Bonjour l'équipe" }, A.user));

  await check("api.js : page HTML, JSON illisible, retry ou code inconnu ne sont jamais un refus", async () => {
    const srv = makeServer();
    const A = makeClient("A", srv, { indexedDB: false, realApi: true });
    const got = {};
    for (const kind of ["html200", "garbage", "lock", "oddCode", "legacyFail", "status500"]) {
      srv.faults.push({ method: "POST", kind, times: 1 });
      got[kind] = await A.Api.postAction("https://exemple/exec", "", { id: "x" })
        .then(() => "ok", (e) => e.kind + "/" + e.code);
    }
    srv.rejectWhen = () => true;
    got.invalid = await A.Api.postAction("https://exemple/exec", "", A.Sync.makeAction("CREATE_TOPIC",
      { topicId: "t9", title: "Refusé" }, A.user)).then(() => "ok", (e) => e.kind + "/" + e.code);
    const want = { html200: "unknown/null", garbage: "unknown/null", lock: "unknown/retry", oddCode: "unknown/quota",
      legacyFail: "server/null", status500: "unknown/null", invalid: "server/invalid" };
    const wrong = Object.keys(want).filter((k) => got[k] !== want[k]).map((k) => k + "=" + got[k] + " (voulu " + want[k] + ")");
    assert(!wrong.length, "classement : " + wrong.join(", "));
  });

  await check("réponse sans verdict (HTML, JSON tronqué, verrou, Drive, code inconnu, 500) : action gardée, puis appliquée une fois", async () => {
    const problems = [];
    for (const kind of ["html200", "garbage", "lock", "drive", "oddCode", "status500", "lateGarbage"]) {
      const srv = makeServer();
      const A = await connected(srv);
      srv.faults.push({ method: "POST", kind, times: 1 });
      await write(A, "m1"); await settle();
      const kept = A.Sync.pendingCount() === 1;
      await A.Sync.now(); await settle();
      const n = copies(srv, "m1");
      if (!kept) { problems.push(kind + " : retirée de la file après la 1re réponse"); }
      if (n !== 1) { problems.push(kind + " : appliquée " + n + " fois"); }
      if (A.Sync.pendingCount() !== 0) { problems.push(kind + " : file non vidée après la reprise"); }
      if (refusedMsg(A).length) { problems.push(kind + " : annoncée refusée (" + refusedMsg(A)[0] + ")"); }
    }
    assert(!problems.length, problems.join(" ; "));
  });

  await check("panne serveur répétée : « Erreur (n) » dès le 2e échec, message unique, recul, jamais « À jour » avant l'application", async () => {
    const srv = makeServer();
    const A = await connected(srv);
    const seen = [];
    A.Sync.subscribe((s) => seen.push({ code: s.code, label: s.label, applied: copies(srv, "m1") > 0 }));
    srv.faults.push({ method: "POST", kind: "lock", times: 1 }, { method: "POST", kind: "status500", times: 1 },
      { method: "POST", kind: "drive", times: 2 });
    await write(A, "m1"); await settle();
    let st = A.Sync.status();
    assert(st.pending === 1 && st.label === "En attente (1)", "1er échec : « " + st.label + " », file " + st.pending);
    await A.Sync.now(); await settle();
    st = A.Sync.status();
    assert(st.code === "error" && st.label === "Erreur (1)" && st.pending === 1,
      "2e échec : indicateur « " + st.label + " » (" + st.code + "), file " + st.pending);
    assert(A.Sync.diagnostics().intervalMs > CONFIG.POLL_ACTIVE_MS, "aucun recul après des échecs serveur");
    await A.Sync.now(); await settle();
    await A.Sync.now(); await settle();
    assert(A.Sync.status().label === "Erreur (1)", "4e échec : « " + A.Sync.status().label + " »");
    const warn = A.messages.filter((m) => m.indexOf("Le serveur ne répond pas correctement : vos actions sont gardées et repartiront") >= 0);
    assert(warn.length === 1, "message de panne affiché " + warn.length + " fois (voulu : 1)");
    assert(!refusedMsg(A).length, "une panne annoncée comme un refus : " + refusedMsg(A)[0]);
    await A.Sync.now(); await settle();
    assert(copies(srv, "m1") === 1 && A.Sync.pendingCount() === 0 && A.Sync.status().label === "À jour",
      "après la panne : serveur " + copies(srv, "m1") + ", file " + A.Sync.pendingCount() + ", « " + A.Sync.status().label + " »");
    assert(!seen.some((s) => s.code === "idle" && !s.applied), "« À jour » affiché avant l'application serveur");
  });

  await check("backend d'avant (refus sans code) : 3 tentatives espacées, puis retrait avec le texte saisi", async () => {
    const srv = makeServer({ legacy: true });
    const A = await connected(srv);
    srv.rejectWhen = (action) => action.payload && action.payload.text === "perdu à moitié";
    const posts0 = srv.http.POST;
    await write(A, "m1", "perdu à moitié"); await settle();
    assert(A.Sync.pendingCount() === 1, "retirée dès le 1er refus sans code");
    assert(A.Sync.diagnostics().intervalMs > CONFIG.POLL_ACTIVE_MS, "tentatives non espacées : aucun recul");
    await A.Sync.now(); await settle();
    assert(A.Sync.pendingCount() === 1, "retirée au 2e refus sans code");
    await A.Sync.now(); await settle();
    assert(A.Sync.pendingCount() === 0, "toujours en file après 3 refus sans code");
    assert(srv.http.POST - posts0 === 3, (srv.http.POST - posts0) + " envois (voulu : 3)");
    const said = refusedMsg(A);
    assert(said.length === 1 && said[0].indexOf("Action refusée : Refus simulé côté serveur. Texte : « perdu à moitié »") >= 0,
      "message de retrait : " + JSON.stringify(said));
    assert(A.Sync.status().label === "À jour", "indicateur après retrait : « " + A.Sync.status().label + " »");
  });

  await check("refus définitif (invalid) : retrait au 1er envoi, le message reprend le texte saisi", async () => {
    const srv = makeServer();
    const A = await connected(srv);
    srv.rejectWhen = (action) => action.payload && action.payload.text === "Texte refusé";
    const posts0 = srv.http.POST;
    await write(A, "m1", "Texte refusé"); await settle();
    const said = refusedMsg(A);
    assert(A.Sync.pendingCount() === 0 && srv.http.POST - posts0 === 1, "refus définitif gardé en file");
    assert(said.length === 1 && said[0] === "error: Action refusée : Refus simulé côté serveur. Texte : « Texte refusé »",
      "message : " + JSON.stringify(said));
  });

  await check("lot sans results, lot à trous, lot refusé en bloc : rien n'est retiré sans verdict, chaque action appliquée une fois", async () => {
    const problems = [];
    for (const [kind, times] of [["noResults", 1], ["holes", 1], ["html200", 4]]) {
      const srv = makeServer({ features: MODERN });
      const A = await connected(srv);
      srv.faults.push({ method: "POST", kind, times });
      ["m1", "m2", "m3"].forEach((id) => { write(A, id, "texte " + id); });
      await settle(); await A.Sync.now(); await settle();
      const left = A.Store.queue.map((e) => e.action.payload.messageId).join(",");
      if (kind === "holes" && left !== "m2,m3") { problems.push("lot à trous : file après réponse = [" + left + "] (voulu m2,m3)"); }
      for (let i = 0; i < 5 && A.Sync.pendingCount(); i++) { await A.Sync.now(); await settle(); }
      const n = ["m1", "m2", "m3"].map((id) => copies(srv, id));
      if (n.join() !== "1,1,1") { problems.push(kind + " : applications " + n.join("/")); }
      if (A.Sync.pendingCount()) { problems.push(kind + " : file " + A.Sync.pendingCount()); }
      if (refusedMsg(A).length) { problems.push(kind + " : « " + refusedMsg(A)[0] + " »"); }
      A.Sync.stop();
    }
    assert(!problems.length, problems.join(" ; "));
  });

  /* BL-022 : le délai couvrait fetch mais pas la lecture du corps. */
  await check("corps de réponse qui ne finit jamais : cycle libéré après le délai, envoi et sondage suivants partent", async () => {
    const srv = makeServer();
    const timers = [];
    const A = makeClient("A", srv, { indexedDB: false, realApi: true, timers });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    const within = (p, ms) => Promise.race([p.then(() => "libéré"), new Promise((r) => setTimeout(() => r("bloqué"), ms))]);

    srv.faults.push({ method: "GET", kind: "hang", times: 1 });
    const gets = srv.http.GET;
    assert(await within(A.Sync.now(), 3000) === "libéré", "lecture : le cycle reste bloqué (« " + A.Sync.status().label + " »)");
    await A.Sync.now(); await settle();
    assert(srv.http.GET >= gets + 2 && A.Sync.status().code === "idle",
      "lecture : sondages " + (srv.http.GET - gets) + ", indicateur « " + A.Sync.status().label + " »");

    srv.faults.push({ method: "POST", kind: "hang", times: 1 });
    await write(A, "m1"); await settle();
    await new Promise((r) => setTimeout(r, 900));      // 55 s d'écriture, à l'horloge accélérée
    await within(A.Sync.now(), 3000); await settle();
    assert(copies(srv, "m1") === 1 && A.Sync.pendingCount() === 0,
      "écriture : serveur " + copies(srv, "m1") + ", file " + A.Sync.pendingCount() + ", « " + A.Sync.status().label + " »");
  });

  /* BL-023 : au-delà de 64 Kio, le navigateur refuse l'envoi de secours en bloc. */
  await check("envoi de secours : plus long début de file sous 60 000 octets, rien de trop gros, rien retiré", async () => {
    const srv = makeServer({ features: MODERN });
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    const text = "é".repeat(1000) + "a".repeat(1250);            // 3 250 octets en UTF-8
    for (let i = 0; i < 20; i++) { write(A, "g" + i, text); }
    await settle();
    srv.beacons.length = 0;
    const handed = A.Sync.flush();
    const sent = srv.beacons[0] || [];
    const all = A.Store.queue.map((e) => e.action);
    const size = (list) => Buffer.byteLength(JSON.stringify(list), "utf8");
    assert(A.Sync.pendingCount() === 20, "l'envoi de secours a retiré des actions de la file");
    A.Sync.stop();
    assert(handed === true && srv.beacons.length === 1 && Array.isArray(sent), "aucun envoi de secours parti");
    assert(sent.length >= 15 && sent.length < 20 && size(sent) <= 60000 && size(all.slice(0, sent.length + 1)) > 60000,
      sent.length + " actions, " + size(sent) + " octets : pas le plus long début de file sous 60 000 octets");
    assert(sent.every((a, i) => a.id === all[i].id), "ordre de la file non respecté");

    const srv2 = makeServer({ features: MODERN });
    const B = makeClient("B", srv2, { indexedDB: false });
    await B.Sync.boot(); await settle();
    await say(B, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    srv2.down = true;
    write(B, "big", "é".repeat(36000)); await settle();         // 72 000 octets
    srv2.beacons.length = 0;
    const big = B.Sync.flush();
    B.Sync.stop();
    assert(big === false && srv2.beacons.length === 0 && B.Sync.pendingCount() === 1,
      "action de 72 000 octets : flush=" + big + ", envois=" + srv2.beacons.length + ", file=" + B.Sync.pendingCount());
  });

  /* ------------------------ Refus d'authentification, actions anciennes (WP-13) --- */

  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const refuseAuth = (srv) => srv.faults.push(
    { method: "GET", kind: "auth", times: Infinity }, { method: "POST", kind: "auth", times: Infinity });
  const requests = (srv) => srv.http.GET + srv.http.POST;

  /* BL-024 : le serveur se met à exiger un code que cet appareil n'a pas. Rien n'est
   * reverrouillé, mais la boucle martelait le serveur (1 140 requêtes refusées par
   * heure) et prévenait l'utilisateur à chaque tour (un message toutes les 3 s). */
  await check("refus d'authentification pendant 5 min : au plus 10 requêtes, une seule notification, reprise au succès", async () => {
    const srv = makeServer({ features: MODERN });
    const clock = makeClock();
    const A = makeClient("A", srv, { indexedDB: false, realApi: true, clock });
    let alerts = 0;
    A.Sync.setHooks({ onAuthError: () => { alerts += 1; } });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    refuseAuth(srv);
    const before = requests(srv);
    A.Sync.start();
    await clock.advance(5 * MINUTE);
    const sent = requests(srv) - before;
    assert(sent <= 10, sent + " requêtes refusées en 5 min (" + sent * 12 + " par heure) : voulu 10 au plus");
    assert(alerts === 1, alerts + " notifications d'accès refusé (voulu : 1 pour toute la série)");
    const wait = A.Sync.diagnostics().intervalMs;
    assert(wait >= 30000 && wait <= CONFIG.POLL_BACKOFF_MAX_MS, "recul de " + wait + " ms après 5 min de refus (voulu : jusqu'à 60 s)");

    /* Le serveur accepte de nouveau : la boucle reprend d'elle-même, au rythme normal. */
    srv.faults.length = 0;
    await clock.advance(CONFIG.POLL_BACKOFF_MAX_MS + 1000);
    assert(A.Sync.status().code === "idle", "pas de reprise au succès : « " + A.Sync.status().label + " »");
    assert(A.Sync.diagnostics().intervalMs <= CONFIG.POLL_IDLE_MS, "rythme encore reculé après le succès : " + A.Sync.diagnostics().intervalMs + " ms");

    /* Un NOUVEAU refus est une nouvelle transition : une nouvelle notification, et une seule. */
    refuseAuth(srv);
    await clock.advance(10000);
    assert(alerts === 2, alerts + " notifications après un second refus (voulu : 2 en tout)");
    await clock.advance(2 * MINUTE);
    assert(alerts === 2, "notification répétée pendant la même série (" + alerts + ")");

    /* Un nouveau jeton (Sync.setConnection) remet la série à zéro, rythme compris. */
    A.Sync.setConnection({ token: "autre-jeton" });
    assert(A.Sync.diagnostics().intervalMs <= CONFIG.POLL_IDLE_MS, "le recul survit à un nouveau jeton");
    await A.Sync.now();
    assert(alerts === 3, alerts + " notifications après un nouveau jeton refusé (voulu : 3 en tout)");
    A.Sync.stop();
  });

  await check("refus d'authentification avec une action en file : elle reste, au plus 10 requêtes, partie une fois l'accès rétabli", async () => {
    const srv = makeServer({ features: MODERN });
    const clock = makeClock();
    const A = makeClient("A", srv, { indexedDB: false, realApi: true, clock });
    let alerts = 0;
    A.Sync.setHooks({ onAuthError: () => { alerts += 1; } });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    refuseAuth(srv);
    const before = requests(srv);
    await write(A, "m1");
    A.Sync.start();
    await clock.advance(5 * MINUTE);
    const sent = requests(srv) - before;
    assert(sent <= 10, sent + " requêtes refusées en 5 min avec une action en file (voulu : 10 au plus)");
    assert(alerts === 1, alerts + " notifications (voulu : 1)");
    assert(A.Sync.pendingCount() === 1 && copies(srv, "m1") === 0, "l'action refusée pour l'authentification a quitté la file");

    srv.faults.length = 0;
    await clock.advance(CONFIG.POLL_BACKOFF_MAX_MS + 1000);
    assert(copies(srv, "m1") === 1 && A.Sync.pendingCount() === 0,
      "après le retour de l'accès : serveur " + copies(srv, "m1") + ", file " + A.Sync.pendingCount());
    A.Sync.stop();
  });

  /* BL-004, complément (D7) : le serveur ne garde que 5 000 identifiants d'actions
   * traitées. Une action restée en file plus de 30 jours ne repart donc jamais en
   * silence : elle reste en file (rien n'est perdu), compte dans l'indicateur, et ne
   * part que sur « Envoyer quand même ». */
  const aged = (A, id, days) => {
    const action = A.Sync.makeAction("CREATE_MESSAGE", { topicId: "t1", messageId: id, text: "texte " + id }, A.user);
    if (days === null) { delete action.ts; } else { action.ts = new Date(Date.now() - days * DAY).toISOString(); }
    return A.Sync.dispatch(action);
  };
  const order = (srv) => Core.findTopic(srv.data, "t1").messages.map((m) => m.id).join(",");
  const staleNotes = (client) => client.messages.filter((m) => m.indexOf("de plus de 30 jours") >= 0);

  await check("action en file depuis plus de 30 jours : retenue, comptée, envoyée après releaseStale ; récente ou non datée : envoyée normalement", async () => {
    assert(CONFIG.STALE_ACTION_MS === 30 * DAY, "seuil des actions retenues : " + CONFIG.STALE_ACTION_MS + " ms (voulu : 30 jours)");
    const srv = makeServer({ features: MODERN });
    const A = makeClient("A", srv, { indexedDB: false });
    await A.Sync.boot(); await settle();
    await say(A, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");

    /* 29 jours, ou sans date : rien d'ancien, tout part. */
    await aged(A, "r29", 29); await aged(A, "n0", null); await settle();
    await A.Sync.now(); await settle();
    assert(order(srv) === "r29,n0" && A.Sync.pendingCount() === 0,
      "actions récentes ou non datées : serveur [" + order(srv) + "], file " + A.Sync.pendingCount());
    assert(A.Sync.staleCount() === 0 && !staleNotes(A).length, "une action récente est tenue pour ancienne");

    /* 31 jours, et une récente derrière : l'ordre de la file fait foi, les deux attendent. */
    const posted = srv.calls.actionsPosted;
    await aged(A, "v31", 31); await aged(A, "r0", 0); await settle();
    await A.Sync.now(); await settle(); await A.Sync.now(); await settle();
    assert(srv.calls.actionsPosted === posted, "une action de 31 jours est partie toute seule");
    assert(A.Sync.pendingCount() === 2 && A.Sync.staleCount() === 1,
      "file " + A.Sync.pendingCount() + ", retenues " + A.Sync.staleCount() + " (voulu 2 et 1)");
    const status = A.Sync.status();
    assert(status.code === "pending" && status.label === "En attente (2)", "indicateur : « " + status.label + " » (" + status.code + ")");
    assert(A.Sync.flush() === false && srv.beacons.length === 0, "l'envoi de secours emporte une action retenue");
    assert(Core.findMessage(Core.findTopic(A.Store.view, "t1"), "v31"), "l'action retenue a disparu de l'écran de son auteur");
    const told = staleNotes(A);
    assert(told.length === 1 && told[0] === "error: 1 action de plus de 30 jours attend : ouvrez Réglages pour l'envoyer.",
      "message : " + JSON.stringify(told));

    /* « Envoyer quand même » : libérées, envoyées dans l'ordre, une seule fois. */
    const freed = await A.Sync.releaseStale(); await settle();
    assert(freed === 1, "releaseStale a libéré " + freed + " action(s) (voulu 1)");
    assert(order(srv) === "r29,n0,v31,r0" && A.Sync.pendingCount() === 0 && A.Sync.staleCount() === 0,
      "après libération : serveur [" + order(srv) + "], file " + A.Sync.pendingCount());
    assert(await A.Sync.releaseStale() === 0, "releaseStale libère encore quelque chose sur une file vide");
  });

  await check("redémarrage : une action ancienne relue en base reste retenue, le message n'est dit qu'une fois, la base la garde", async () => {
    const srv = makeServer({ features: MODERN });
    const idb = makeIDB();
    const A1 = makeClient("A", srv, { indexedDB: idb });
    await A1.Sync.boot(); await settle();
    await say(A1, { topicId: "t1", title: "Sujet" }, "CREATE_TOPIC");
    srv.down = true;
    await aged(A1, "v40", 40); await settle();
    A1.Sync.stop();
    assert(idb.rows("queue").length === 1, "le scénario ne teste rien : l'action ancienne n'est pas en base");

    srv.down = false;
    const A2 = makeClient("A", srv, { indexedDB: idb });
    await A2.Sync.boot(); await settle();
    await A2.Sync.now(); await settle(); await A2.Sync.now(); await settle();
    assert(A2.Sync.pendingCount() === 1 && A2.Sync.staleCount() === 1 && copies(srv, "v40") === 0,
      "après redémarrage : file " + A2.Sync.pendingCount() + ", retenues " + A2.Sync.staleCount() + ", serveur " + copies(srv, "v40"));
    assert(A2.Sync.status().label === "En attente (1)", "indicateur : « " + A2.Sync.status().label + " »");
    assert(staleNotes(A2).length === 1, "message dit " + staleNotes(A2).length + " fois (voulu : 1)");
    assert(idb.rows("queue").length === 1, "l'entrée retenue a quitté la base");

    await A2.Sync.releaseStale(); await settle();
    assert(copies(srv, "v40") === 1 && A2.Sync.pendingCount() === 0 && idb.rows("queue").length === 0,
      "après libération : serveur " + copies(srv, "v40") + ", file " + A2.Sync.pendingCount() + ", base " + idb.rows("queue").length);
    A2.Sync.stop();
  });

  /* Le serveur attend le verrou 45 s (waitLock de Code.gs) : s'il est dépassé, sa réponse
   * « retry » doit arriver AVANT que le client ne coupe, sinon la panne se lit comme une coupure. */
  await check("le délai d'écriture dépasse l'attente du verrou serveur (45 s)", () => {
    assert(CONFIG.WRITE_TIMEOUT_MS > 45000, "délai d'écriture " + CONFIG.WRITE_TIMEOUT_MS + " ms : la réponse d'un verrou dépassé arrive après la coupure");
  });

  console.log(failures.length
    ? "✗ " + failures.length + " échec(s) :\n  - " + failures.join("\n  - ")
    : "✓ " + passed + " tests réussis sur " + passed + ".");
  process.exit(failures.length ? 1 : 0);
}

run();
