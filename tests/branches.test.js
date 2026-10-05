/* BrainstO. : exploration d'un message (« branche »), côté application.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/branches.test.js
 *
 * js/app.js est chargé TEL QUEL dans un contexte `vm`, entouré de doublures (Sync avec liste de capacités réglable,
 * UI, Store, DB, historique du navigateur) ; js/config.js, js/utils.js et js/state.js sont les vrais. Même modèle que
 * tests/startup-robust.test.js.
 *
 * Une exploration n'est PAS un objet : c'est l'attribut `branchRootId` d'un message (js/state.js). Ce fichier protège
 * ce que l'application en fait :
 *   1. la route #/topic/{sujet}/branch/{message}, enfant du sujet : descendre empile, le retour dépile ; arrivée
 *      directe par l'adresse : le retour ramène au sujet sans faire grandir la pile ; ouverte depuis la feuille
 *      d'actions, elle REMPLACE la couche (le retour ne rouvre pas la feuille) ;
 *   2. la capacité serveur « branches » : mode local oui ; serveur qui a répondu = sa réponse, retenue sur l'appareil ;
 *      ouverture hors ligne = la dernière réponse retenue ; effacée à la déconnexion et au changement de serveur ;
 *   3. la charge utile de CREATE_MESSAGE : SANS exploration, exactement celle d'avant (aucune clé de plus) ; avec, le
 *      champ branchRootId ; et un message d'exploration n'entre JAMAIS dans la file si la capacité n'est pas établie
 *      (un serveur antérieur l'accepterait et perdrait le rattachement en silence) ;
 *   4. anonymat : publier en anonyme dans une exploration part sans identifiant, comme dans le fil principal.
 * Le modèle et la parité frontend / Apps Script sont dans tests/parity.test.js ; la file, la reprise et l'ancien
 * backend dans tests/sync.test.js ; l'interface dans tests/ui-focus.test.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const read = (file) => ({ file, code: fs.readFileSync(path.join(ROOT, file), "utf8") });
const SOURCES = ["js/config.js", "js/utils.js", "js/state.js"].map(read);
const APP_JS = read("js/app.js");

require(path.join(ROOT, "js/config.js"));
const KEYS = globalThis.CONFIG.KEYS;
const URL_EXEC = "https://script.google.com/macros/s/EXEMPLE/exec";
const ME = { id: "u-moi", name: "Moi" };

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
function assert(condition, message) { if (!condition) { throw new Error(message); } }

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; } catch (error) { failures.push({ name, error }); }
}

/* ------------------------------------------------------------ Doublures --- */

function makeHistory() {
  const h = { state: null, pushed: [], replaced: [], went: [] };
  h.pushState = (state, title, url) => { h.state = state; h.pushed.push({ state, url }); };
  h.replaceState = (state, title, url) => { h.state = state; h.replaced.push({ state, url }); };
  h.go = (n) => { h.went.push(n); };
  return h;
}

/* options : { hash, features (null = le serveur n'a pas encore répondu), localMode, stored: {clé: valeur} } */
function makeWorld(options) {
  const opts = options || {};
  const w = { toasts: [], dispatched: [], mem: new Map(), history: makeHistory() };
  w.mem.set(KEYS.apiUrl, JSON.stringify(opts.localMode ? "" : URL_EXEC));
  w.mem.set(KEYS.user, JSON.stringify(ME));
  if (opts.localMode) { w.mem.set(KEYS.localMode, "true"); }
  Object.keys(opts.stored || {}).forEach((key) => w.mem.set(key, JSON.stringify(opts.stored[key])));
  let features = opts.features === undefined ? null : opts.features;

  const Sync = {
    connection: { url: "", token: "", localMode: false, unlocked: false },
    setConnection(patch) { Object.assign(Sync.connection, patch || {}); },
    isConnected() { return !!Sync.connection.url && !Sync.connection.localMode; },
    supports(name) { return Array.isArray(features) && features.indexOf(name) >= 0; },
    start() {}, stop() {}, now() { return Promise.resolve(); }, flush() { return false; },
    setHooks() {}, subscribe() {}, boot() { return Promise.resolve(); },
    diagnostics() { return { pending: [] }; },
    makeAction(type, payload, actor) { return { type, payload, actorId: actor.id, actorName: actor.name }; },
    dispatch(action) { w.dispatched.push(action); return Promise.resolve({ ok: true }); }
  };
  const UI = {
    local: { sheet: null, modal: null, quote: null },
    init() {}, force() {}, render() {}, refreshStatus() {}, showUpdateBanner() {},
    set(patch) { Object.assign(UI.local, patch || {}); },
    toast(text, kind) { w.toasts.push({ text, kind: kind || "info" }); },
    onboardingActive() { return false; }, closeOnboarding() {}, replayOnboarding() {}
  };
  const Store = { view: null, base: null, queue: [], setBase(s) { Store.base = s; }, setQueue(q) { Store.queue = q; } };
  const DB = { clearQueue() { return Promise.resolve(); }, clearState() { return Promise.resolve(); } };
  const Api = {
    getRevision() { return Promise.resolve({ ok: true, revision: 1 }); },
    isAuthError: () => false, isNetworkError: () => false
  };
  const storage = {
    getItem: (key) => (w.mem.has(key) ? w.mem.get(key) : null),
    setItem: (key, value) => { w.mem.set(key, String(value)); },
    removeItem: (key) => { w.mem.delete(key); }
  };
  const sandbox = {
    Api, Sync, UI, DB, TextEncoder, console, localStorage: storage, crypto: crypto.webcrypto,
    setInterval: () => 0, clearInterval() {},
    window: { location: { hash: opts.hash || "#/" }, history: w.history, addEventListener() {} },
    document: { readyState: "complete", hidden: false, addEventListener() {} },
    navigator: {}
  };
  const ctx = vm.createContext(sandbox);
  SOURCES.forEach((s) => vm.runInContext(s.code, ctx, { filename: s.file }));
  ctx.Store = Store;
  vm.runInContext(APP_JS.code, ctx, { filename: APP_JS.file });   // App.start() au chargement
  if (opts.localMode) { Sync.connection.localMode = true; }

  return Object.assign(w, {
    App: ctx.App, Sync, UI, ctx,
    setFeatures(list) { features = list; },
    stored(key) { return w.mem.has(key) ? JSON.parse(w.mem.get(key)) : undefined; },
    lastPayload() { const a = w.dispatched[w.dispatched.length - 1]; return a ? a.payload : null; }
  });
}

/* ---------------------------------------------------------- Navigation --- */

(async function run() {
  await test("route : #/topic/{sujet}/branch/{message} est l'exploration, enfant du sujet (adresse incomplète = le sujet)", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    w.App.go("#/topic/t1/branch/m1");
    const r = w.App.route;
    assert(r.name === "branch" && r.topicId === "t1" && r.messageId === "m1" && r.raw === "#/topic/t1/branch/m1",
      "route lue : " + JSON.stringify(r));
    w.App.go("#/topic/t1/branch");
    assert(w.App.route.name === "topic" && w.App.route.topicId === "t1", "sans message source, c'est le sujet : " + JSON.stringify(w.App.route));
  });

  await test("sujet → exploration empile ; le retour dépile, jusqu'au sujet", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    w.App.go("#/topic/t1");
    w.App.go("#/topic/t1/branch/m1");
    const urls = w.history.pushed.map((p) => p.url);
    assert(urls.join(",") === "#/topic/t1,#/topic/t1/branch/m1", "chaque descente doit empiler : " + urls.join(","));
    assert(w.history.pushed[1].state.tkIndex === 2, "profondeur 2 sous la racine : " + JSON.stringify(w.history.pushed[1].state));
    w.App.remonter();
    assert(w.history.went.join(",") === "-1", "le retour doit DÉPILER une entrée, pas en empiler : " + JSON.stringify(w.history));
    assert(w.App.route.name === "topic" && w.App.route.topicId === "t1", "retour vers le sujet : " + JSON.stringify(w.App.route));
  });

  await test("arrivée directe sur l'adresse d'une exploration (rechargement, lien) : le retour remplace par le sujet", async () => {
    const w = makeWorld({ features: ["since", "branches"], hash: "#/topic/t1/branch/m1" });
    await settle();
    assert(w.App.route.name === "branch", "démarrage sur l'exploration : " + JSON.stringify(w.App.route));
    assert(w.history.replaced[0] && w.history.replaced[0].url === "#/topic/t1/branch/m1", "le démarrage pose l'entrée courante");
    w.App.remonter();
    assert(w.history.went.length === 0, "rien sous nous : ne pas sortir de l'application");
    assert(w.history.replaced[w.history.replaced.length - 1].url === "#/topic/t1", "le parent de repli est le sujet : " + JSON.stringify(w.history.replaced));
    assert(w.App.route.name === "topic", "écran du sujet : " + JSON.stringify(w.App.route));
  });

  await test("« Explorer » depuis la feuille d'actions : l'exploration REMPLACE la couche, le retour ramène au sujet", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    w.App.go("#/topic/t1");
    /* Ce que fait UI.set à l'ouverture d'une feuille : une couche, donc une entrée. */
    w.UI.local.sheet = { type: "message", topicId: "t1", messageId: "m1" };
    w.App.ajusterCouches(0, 1);
    const pushedBefore = w.history.pushed.length;
    w.App.go("#/topic/t1/branch/m1");
    assert(w.history.pushed.length === pushedBefore, "ouvrir l'exploration depuis la feuille ne doit pas empiler : " + JSON.stringify(w.history.pushed));
    assert(w.history.replaced[w.history.replaced.length - 1].url === "#/topic/t1/branch/m1", "l'entrée de la feuille est remplacée");
    assert(w.UI.local.sheet === null, "la feuille est fermée par la navigation");
    w.App.remonter();
    assert(w.App.route.name === "topic" && w.history.went.join(",") === "-1", "un seul retour ramène au sujet : " + JSON.stringify(w.history.went));
  });

  /* ---------------------------------------------------------- Capacité --- */

  await test("capacité : mode local → disponible", async () => {
    const w = makeWorld({ localMode: true, features: [] });
    await settle();
    assert(w.App.branchesAvailable() === true, "en mode local, le noyau de l'appareil range lui-même");
    assert(w.App.branchesOutdatedServer() === false, "pas de serveur à mettre à jour en mode local");
  });

  await test("capacité : la réponse du serveur fait foi, et elle est retenue sur l'appareil", async () => {
    const w = makeWorld({ features: ["since", "batch", "lean", "branches"] });
    await settle();
    assert(w.App.branchesAvailable() === true, "serveur à jour : disponible");
    assert(w.stored(KEYS.branchesCapability) === true, "réponse non retenue");
    w.setFeatures(["since", "batch", "lean"]);
    assert(w.App.branchesAvailable() === false, "serveur antérieur : indisponible");
    assert(w.App.branchesOutdatedServer() === true, "serveur antérieur : il faut le mettre à jour");
    assert(w.stored(KEYS.branchesCapability) === false, "la réponse négative doit remplacer l'ancienne");
  });

  await test("capacité : ouverture hors ligne (aucune réponse encore) → la dernière réponse retenue, sinon non", async () => {
    const known = makeWorld({ features: null, stored: { [KEYS.branchesCapability]: true } });
    await settle();
    assert(known.App.branchesAvailable() === true, "dernière réponse « oui » retenue : disponible hors ligne");
    assert(known.App.branchesOutdatedServer() === false, "sans réponse, on ne déclare pas le serveur périmé");
    const unknown = makeWorld({ features: null });
    await settle();
    assert(unknown.App.branchesAvailable() === false, "rien de connu : indisponible (jamais présumé)");
    const old = makeWorld({ features: [] });
    await settle();
    assert(old.App.branchesAvailable() === false, "très ancien serveur (aucune capacité annoncée) : indisponible");
  });

  await test("capacité : effacée à la déconnexion (l'appareil oublie le serveur)", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    w.App.branchesAvailable();
    assert(w.stored(KEYS.branchesCapability) === true, "contrôle sans objet : rien de retenu");
    w.App.logout();
    await settle();
    assert(w.stored(KEYS.branchesCapability) === undefined, "la capacité retenue survit à la déconnexion");
  });

  /* ------------------------------------------------------- Charge utile --- */

  await test("CREATE_MESSAGE du fil principal : exactement la charge d'avant, aucune clé de plus", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    await w.App.actions.createMessage("t1", "Bonjour", null, false);
    const keys = Object.keys(w.lastPayload()).sort().join(",");
    assert(keys === "anon,messageId,quoteId,text,topicId", "un serveur antérieur doit recevoir la même charge qu'avant : " + keys);
  });

  await test("CREATE_MESSAGE d'exploration : branchRootId envoyé, distinct de quoteId", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    await w.App.actions.createMessage("t1", "Et les livraisons ?", "b0", false, "m1");
    const p = w.lastPayload();
    assert(p.branchRootId === "m1" && p.quoteId === "b0", "rattachement et citation : " + JSON.stringify(p));
  });

  await test("serveur antérieur : un message d'exploration n'entre JAMAIS dans la file, le texte n'est pas perdu", async () => {
    const w = makeWorld({ features: ["since", "batch", "lean"] });
    await settle();
    const own = JSON.stringify(w.stored(KEYS.ownItems) || []);
    const result = await w.App.actions.createMessage("t1", "Réponse", null, false, "m1");
    assert(w.dispatched.length === 0, "action envoyée à un serveur qui perdrait le rattachement : " + JSON.stringify(w.dispatched));
    assert(result && result.ok === false, "le composeur doit garder le texte (résultat ok:false) : " + JSON.stringify(result));
    assert(w.toasts.some((t) => t.kind === "error" && /mise à jour du serveur/.test(t.text)), "la raison doit être dite : " + JSON.stringify(w.toasts));
    assert(JSON.stringify(w.stored(KEYS.ownItems) || []) === own, "aucun élément « à moi » ne doit être retenu pour un message jamais parti");
  });

  await test("anonymat : publier en anonyme dans une exploration part sans identifiant", async () => {
    const w = makeWorld({ features: ["since", "branches"] });
    await settle();
    await w.App.actions.createMessage("t1", "Anonyme", null, true, "m1");
    const action = w.dispatched[w.dispatched.length - 1];
    assert(action.actorId === "" && action.payload.anon === true && action.payload.branchRootId === "m1",
      "identité dans une action anonyme : " + JSON.stringify(action));
  });

  if (failures.length) {
    failures.forEach(({ name, error }) => console.error("✗ " + name + "\n  " + error.message));
    console.error("\nbranches : " + passed + " test(s) OK, " + failures.length + " en échec.");
    process.exit(1);
  }
  console.log("✓ branches : " + passed + " tests OK.");
})();
