/* BrainstO. : garde-fous du démarrage sur plateformes appauvries (WebView, navigation privée,
 * contexte non sécurisé). Échec honnête plutôt que boutons muets, sans jamais bloquer une
 * fonction qui a un repli.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/startup-robust.test.js
 *
 * js/app.js et js/utils.js sont chargés TELS QUELS dans un contexte `vm`, avec les vrais
 * js/config.js et js/state.js ; Sync, Api (faux serveur), UI et DB sont des doublures. Le
 * navigateur est simulé : localStorage, crypto, navigator.serviceWorker, history.
 *
 * Ce qui est protégé :
 *   1. BL-055 (§24, §14) : navigator.serviceWorker est lu UNE fois sous try/catch et sa
 *      VALEUR est testée (absent, undefined, getter qui lève, register qui lève). Le bouton
 *      « Mettre à jour » agit sur l'enregistrement COURANT (relu au clic) ; rien en attente :
 *      rechargement simple.
 *   2. BL-056 (§16) : stockage refusé : UN message honnête au démarrage, la connexion n'est
 *      pas enregistrée (pas d'identité de plus à chaque rechargement), le mode local reste
 *      possible.
 *   3. BL-057 : sans crypto.subtle, Utils.sha256Hex REJETTE avec une erreur typée (plus de
 *      ReferenceError) ; connexion et déverrouillage disent quoi faire ; la connexion SANS
 *      code reste possible (aucun hachage nécessaire) ; aucun SHA-256 écrit à la main.
 *   4. BL-058 : history.pushState / replaceState qui lèvent : navigation sans historique.
 *   5. BL-028 : Utils.limit ne coupe jamais une paire de substitution UTF-16 (règle de Core.cut).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const read = (file) => ({ file, code: fs.readFileSync(path.join(ROOT, file), "utf8") });
const CONFIG_JS = read("js/config.js");
const UTILS_JS = read("js/utils.js");
const STATE_JS = read("js/state.js");
const APP_JS = read("js/app.js");

require(path.join(ROOT, "js/config.js"));
const CONFIG = globalThis.CONFIG;
const KEYS = CONFIG.KEYS;

const URL_EXEC = "https://script.google.com/macros/s/EXEMPLE/exec";
const ME = { id: "u-moi", name: "Moi" };
const MSG_STORAGE = "Ce navigateur refuse d'enregistrer des données sur l'appareil : ouvrez BrainstO. dans votre navigateur habituel.";
const MSG_CRYPTO = "Ce navigateur ne permet pas la connexion. Ouvrez BrainstO. dans Chrome ou Safari.";
const MSG_CONNECTED = "Connexion établie.";

const webcrypto = crypto.webcrypto || globalThis.crypto;
const nodeSha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

/* Un rejet de promesse que personne ne rattrape est exactement le « bouton muet » : on le compte. */
const unhandled = [];
process.on("unhandledRejection", (reason) => { unhandled.push(reason); });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => delay(50);
function assert(condition, message) { if (!condition) { throw new Error(message); } }

function domError(message) {
  const error = new Error(message);
  error.name = "SecurityError";
  return error;
}

/* ------------------------------------------------------- Doublures du navigateur --- */

function defineStorage(sandbox, mode, mem) {
  const refuse = () => { throw domError("The operation is insecure."); };
  if (mode === "getter-throws") {
    /* L'accès à window.localStorage lève : tout accès à l'objet lève. */
    sandbox.localStorage = new Proxy({}, { get() { throw domError("Access is denied for this document."); } });
  } else if (mode === "null") {
    sandbox.localStorage = null;
  } else if (mode === "throws") {
    sandbox.localStorage = { getItem: refuse, setItem: refuse, removeItem: refuse };
  } else {
    sandbox.localStorage = {
      getItem: (key) => (mem.has(key) ? mem.get(key) : null),
      setItem: (key, value) => { mem.set(key, String(value)); },
      removeItem: (key) => { mem.delete(key); }
    };
  }
}

function makeHistory(mode) {
  const h = { state: null, pushed: [], replaced: [], went: [] };
  h.pushState = function (state, title, url) {
    if (mode === "push-throws" || mode === "both-throw") {
      throw domError("A history state object with URL cannot be created in a document with origin 'null'.");
    }
    h.state = state;
    h.pushed.push({ state, url });
  };
  h.replaceState = function (state, title, url) {
    if (mode === "both-throw") { throw domError("The operation is insecure."); }
    h.state = state;
    h.replaced.push({ state, url });
  };
  h.go = function (n) { h.went.push(n); };
  return h;
}

function makeNavigator(spec) {
  if (spec === "undefined") { return { serviceWorker: undefined }; }
  if (spec === "throws") {
    const nav = {};
    Object.defineProperty(nav, "serviceWorker", {
      get() { throw domError("Access to service workers is denied in this document origin."); },
      enumerable: true, configurable: true
    });
    return nav;
  }
  if (spec && typeof spec === "object") { return { serviceWorker: spec }; }
  return {};
}

function fakeWorker(name, state) {
  const worker = {
    name, state: state || "installed", posted: [], listeners: {},
    postMessage(message) {
      if (worker.state === "redundant") { throw domError("ServiceWorker is in redundant state"); }
      worker.posted.push(message);
    },
    addEventListener(type, fn) { (worker.listeners[type] = worker.listeners[type] || []).push(fn); },
    emit(type) { (worker.listeners[type] || []).slice().forEach((fn) => fn({ type })); }
  };
  return worker;
}

function fakeRegistration(spec) {
  const registration = {
    waiting: (spec && spec.waiting) || null, installing: (spec && spec.installing) || null, listeners: {},
    addEventListener(type, fn) { (registration.listeners[type] = registration.listeners[type] || []).push(fn); },
    emit(type) { (registration.listeners[type] || []).slice().forEach((fn) => fn({ type })); }
  };
  return registration;
}

function fakeContainer(spec) {
  const container = {
    controller: "controller" in spec ? spec.controller : { name: "actif" },
    registers: [], listeners: {},
    register(url) {
      container.registers.push(url);
      if (spec.registerThrows) { throw new TypeError("register is not a function"); }
      return Promise.resolve(spec.registration);
    },
    getRegistration() {
      return spec.getRegistration ? spec.getRegistration() : Promise.resolve(spec.registration);
    },
    addEventListener(type, fn) { (container.listeners[type] = container.listeners[type] || []).push(fn); },
    emit(type) { (container.listeners[type] || []).slice().forEach((fn) => fn({ type })); }
  };
  return container;
}

/* ------------------------------------------------------------------- Monde --- */

const allToasts = [];

/* opts : storage ("ok" | "throws" | "getter-throws" | "null"), crypto ("subtle" par défaut |
 * "none" | "undefined"), history ("ok" | "push-throws" | "both-throw"), serviceWorker (voir
 * makeNavigator), stored (clés de stockage préremplies), server, noOnboardingRule. */
function makeWorld(options) {
  const opts = options || {};
  const w = {
    toasts: [], requests: [], connections: [], dispatched: [], banners: [], reloads: 0,
    mem: new Map(), history: makeHistory(opts.history || "ok"),
    server: opts.server || (() => Promise.resolve({ ok: true, revision: 1 }))
  };
  Object.keys(opts.stored || {}).forEach((key) => w.mem.set(key, JSON.stringify(opts.stored[key])));

  const Sync = {
    connection: { url: "", token: "", localMode: false, unlocked: false },
    hooks: {},
    setConnection(patch) { w.connections.push(Object.assign({}, patch)); Object.assign(Sync.connection, patch || {}); },
    isConnected() { return !!Sync.connection.url && !Sync.connection.localMode && Sync.connection.unlocked; },
    supports() { return false; },
    start() {}, stop() {}, now() { return Promise.resolve(); }, flush() { return false; },
    setHooks(hooks) { Sync.hooks = hooks; }, subscribe() {}, boot() { return Promise.resolve(); },
    makeAction(type, payload, actor) { return { type, payload, actorId: actor.id }; },
    dispatch(action) { w.dispatched.push(action); return Promise.resolve({ ok: true }); }
  };
  const Api = {
    getRevision(url, token) { w.requests.push({ url, token }); return w.server(url, token); },
    isAuthError: (error) => !!error && error.kind === "auth",
    isNetworkError: (error) => !!error && error.kind === "network"
  };
  const UI = {
    local: { sheet: null, modal: null, quote: null },
    init() {}, force() {}, render() {}, refreshStatus() {},
    showUpdateBanner(onUpdate) { w.banners.push(onUpdate); },
    set(patch) { Object.assign(UI.local, patch || {}); },
    toast(text, kind) {
      const toast = { text, kind: kind || "info" };
      w.toasts.push(toast);
      allToasts.push(toast);
    },
    onboardingActive() { return false; }, closeOnboarding() {}, replayOnboarding() {}
  };
  const Store = {
    view: null, base: null, queue: [],
    setBase(state) { Store.base = state; }, setQueue(queue) { Store.queue = queue; }
  };
  const DB = { clearQueue() { return Promise.resolve(); }, clearState() { return Promise.resolve(); } };

  const sandbox = {
    Api, Sync, UI, DB, TextEncoder, console,
    setInterval: () => 0, clearInterval() {},
    window: { location: { hash: "#/", reload() { w.reloads += 1; } }, history: w.history, addEventListener() {} },
    document: { readyState: "complete", hidden: false, addEventListener() {} },
    navigator: makeNavigator(opts.serviceWorker)
  };
  defineStorage(sandbox, opts.storage || "ok", w.mem);
  if (opts.crypto === "none") { sandbox.crypto = {}; }
  else if (opts.crypto !== "undefined") { sandbox.crypto = webcrypto; }

  const ctx = vm.createContext(sandbox);
  vm.runInContext(CONFIG_JS.code, ctx, { filename: CONFIG_JS.file });
  vm.runInContext(UTILS_JS.code, ctx, { filename: UTILS_JS.file });
  vm.runInContext(STATE_JS.code, ctx, { filename: STATE_JS.file });
  ctx.Store = Store;   // state.js pose le vrai Store : on garde la doublure
  if (opts.noOnboardingRule) { ctx.CONFIG.onboardingDue = undefined; }
  vm.runInContext(APP_JS.code, ctx, { filename: APP_JS.file });   // App.start() au chargement

  return Object.assign(w, {
    App: ctx.App, Utils: ctx.Utils, Core: ctx.Core, Sync, UI, ctx,
    lastToast: () => w.toasts[w.toasts.length - 1] || { text: "", kind: "" },
    count: (text) => w.toasts.filter((toast) => toast.text === text).length
  });
}

/* Utils seul, dans un contexte SANS require ni process (un navigateur), ou « façon Node ». */
function loadUtils(options) {
  const opts = options || {};
  const sandbox = { TextEncoder, console };
  if (opts.crypto === "none") { sandbox.crypto = {}; }
  else if (opts.crypto === "subtle") { sandbox.crypto = webcrypto; }
  if (opts.nodeLike) { sandbox.require = require; sandbox.process = process; }
  const ctx = vm.createContext(sandbox);
  vm.runInContext(UTILS_JS.code, ctx, { filename: UTILS_JS.file });
  return ctx.Utils;
}

const isWellFormed = (text) => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);

/* --------------------------------------------------------------- Exécuteur --- */

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

/* ======================================================= BL-055 : service worker === */

test("BL-055 navigator.serviceWorker dont la lecture lève : aucune exception au démarrage", async () => {
  const w = makeWorld({ serviceWorker: "throws" });
  await settle();
  assert(typeof w.Sync.hooks.onChange === "function", "le démarrage n'est pas allé à son terme");
});

test("BL-055 navigator.serviceWorker présent mais undefined : aucune exception", async () => {
  const w = makeWorld({ serviceWorker: "undefined" });
  await settle();
  assert(typeof w.Sync.hooks.onChange === "function", "le démarrage n'est pas allé à son terme");
});

test("BL-055 sans service worker (propriété absente) : rien d'enregistré, aucune exception", async () => {
  const w = makeWorld({});
  await settle();
  assert(w.banners.length === 0, "un bandeau a été posé sans service worker");
});

test("BL-055 register() qui lève de façon synchrone : aucune exception, aucun bandeau", async () => {
  const container = fakeContainer({ registerThrows: true });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  assert(container.registers.length === 1, "register n'a pas été essayé");
  assert(w.banners.length === 0, "un bandeau a été posé sans enregistrement");
});

test("BL-055 enregistrement normal : service-worker.js, un seul écouteur controllerchange, aucun bandeau", async () => {
  const registration = fakeRegistration({});
  const container = fakeContainer({ registration });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  assert(container.registers.length === 1 && container.registers[0] === "service-worker.js",
    "enregistrement attendu une fois : " + JSON.stringify(container.registers));
  assert((container.listeners.controllerchange || []).length === 1, "un seul écouteur controllerchange attendu");
  assert((registration.listeners.updatefound || []).length === 1, "un seul écouteur updatefound attendu");
  assert(w.banners.length === 0, "bandeau posé sans nouvelle version");
});

test("BL-055 première installation (aucun contrôleur) : pas de bandeau de mise à jour", async () => {
  const registration = fakeRegistration({ waiting: fakeWorker("v1", "installed") });
  const w = makeWorld({ serviceWorker: fakeContainer({ registration, controller: null }) });
  await settle();
  assert(w.banners.length === 0, "bandeau posé à la toute première installation");
});

test("BL-055 nouveau worker installé après le démarrage : bandeau, puis clic sur le worker en attente", async () => {
  const worker = fakeWorker("v2", "installing");
  const registration = fakeRegistration({});
  const container = fakeContainer({ registration });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  registration.installing = worker;
  registration.emit("updatefound");
  worker.state = "installed"; registration.installing = null; registration.waiting = worker;
  worker.emit("statechange");
  assert(w.banners.length === 1, "bandeau non posé");
  w.banners[0]();
  await settle();
  assert(worker.posted.length === 1 && worker.posted[0].type === "SKIP_WAITING",
    "SKIP_WAITING attendu : " + JSON.stringify(worker.posted));
});

test("BL-055 V5 : une version plus récente remplace celle qui attendait : le clic vise la version COURANTE", async () => {
  const v2 = fakeWorker("v2", "installing");
  const registration = fakeRegistration({ installing: v2 });
  const container = fakeContainer({ registration });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  /* v2 finit de s'installer : elle attend, le bandeau est posé. */
  v2.state = "installed"; registration.installing = null; registration.waiting = v2;
  v2.emit("statechange");
  assert(w.banners.length === 1, "bandeau non posé pour v2");
  /* v3 est publiée : v2 devient obsolète, v3 attend. Le bandeau, lui, reste celui de v2. */
  const v3 = fakeWorker("v3", "installed");
  v2.state = "redundant";
  registration.waiting = v3;
  w.banners[0]();
  await settle();
  assert(v3.posted.length === 1 && v3.posted[0].type === "SKIP_WAITING",
    "v3 n'a pas reçu SKIP_WAITING : " + JSON.stringify(v3.posted));
  assert(v2.posted.length === 0, "la version obsolète a été sollicitée");
  container.emit("controllerchange");
  assert(w.reloads === 1, "pas de rechargement après le changement de version : " + w.reloads);
});

test("BL-055 V4 : un autre onglet a déjà mis à jour (rien en attente) : le clic recharge simplement", async () => {
  const v2 = fakeWorker("v2", "installed");
  const registration = fakeRegistration({ waiting: v2 });
  const w = makeWorld({ serviceWorker: fakeContainer({ registration }) });
  await settle();
  assert(w.banners.length === 1, "bandeau non posé pour la version en attente");
  registration.waiting = null;   // un autre onglet a appliqué la mise à jour
  w.banners[0]();
  await settle();
  assert(w.reloads === 1, "rechargement simple attendu une fois : " + w.reloads);
  assert(v2.posted.length === 0, "message envoyé à un worker qui n'attend plus");
});

test("BL-055 l'enregistrement est RELU au clic (getRegistration) quand l'objet d'origine est périmé", async () => {
  const v2 = fakeWorker("v2", "installed");
  const v3 = fakeWorker("v3", "installed");
  const stale = fakeRegistration({ waiting: v2 });
  const fresh = fakeRegistration({ waiting: v3 });
  const container = fakeContainer({ registration: stale, getRegistration: () => Promise.resolve(fresh) });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  assert(w.banners.length === 1, "bandeau non posé");
  w.banners[0]();
  await settle();
  assert(v3.posted.length === 1 && v2.posted.length === 0,
    "le clic doit viser l'enregistrement courant : v3=" + v3.posted.length + " v2=" + v2.posted.length);
});

test("BL-055 getRegistration en échec : on se rabat sur l'enregistrement connu", async () => {
  const v2 = fakeWorker("v2", "installed");
  const registration = fakeRegistration({ waiting: v2 });
  const container = fakeContainer({ registration, getRegistration: () => Promise.reject(new Error("indisponible")) });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  w.banners[0]();
  await settle();
  assert(v2.posted.length === 1 && v2.posted[0].type === "SKIP_WAITING", "SKIP_WAITING attendu sur le worker connu");
  assert(w.reloads === 0, "rechargement inattendu");
});

test("BL-055 le worker en attente devient obsolète entre la lecture et l'envoi : rechargement simple", async () => {
  const v2 = fakeWorker("v2", "installed");
  const registration = fakeRegistration({ waiting: v2 });
  const w = makeWorld({ serviceWorker: fakeContainer({ registration }) });
  await settle();
  v2.state = "redundant";   // postMessage lèvera InvalidStateError
  w.banners[0]();
  await settle();
  assert(w.reloads === 1, "rechargement simple attendu une fois : " + w.reloads);
});

test("BL-055 controllerchange ne recharge que si la mise à jour a été demandée", async () => {
  const v2 = fakeWorker("v2", "installed");
  const registration = fakeRegistration({ waiting: v2 });
  const container = fakeContainer({ registration });
  const w = makeWorld({ serviceWorker: container });
  await settle();
  container.emit("controllerchange");
  assert(w.reloads === 0, "rechargement sans demande de l'utilisateur (boucle au premier chargement)");
  w.banners[0]();
  await settle();
  assert(v2.posted.length === 1, "SKIP_WAITING attendu");
  container.emit("controllerchange");
  assert(w.reloads === 1, "rechargement attendu après la demande : " + w.reloads);
});

/* ========================================================= BL-056 : stockage refusé === */

[["throws", "getItem et setItem lèvent"], ["getter-throws", "la lecture de window.localStorage lève"],
  ["null", "localStorage vaut null"]].forEach((pair) => {
  test("BL-056 stockage refusé (" + pair[1] + ") : UN message honnête au démarrage", async () => {
    const w = makeWorld({ storage: pair[0] });
    await settle();
    assert(w.count(MSG_STORAGE) === 1, "message attendu une fois, vu " + w.count(MSG_STORAGE) + " fois : " + JSON.stringify(w.toasts));
    assert(w.toasts[0].kind === "error", "le message doit être signalé comme une erreur");
  });
});

test("BL-056 stockage refusé : la connexion n'est pas enregistrée (aucune requête, aucune identité de plus)", async () => {
  const w = makeWorld({ storage: "throws" });
  await settle();
  w.App.saveConnection(URL_EXEC, "code-equipe");
  await settle();
  assert(w.requests.length === 0, "le serveur a été contacté : " + JSON.stringify(w.requests));
  assert(!w.connections.some((patch) => patch.url), "une adresse a été posée sur la connexion");
  assert(w.dispatched.length === 0, "une action (identité) a été envoyée");
  assert(w.lastToast().text === MSG_STORAGE && w.lastToast().kind === "error",
    "message attendu sur le bouton : " + JSON.stringify(w.lastToast()));
  assert(w.App.gate() === "connection", "l'écran de connexion doit rester : " + w.App.gate());
});

test("BL-056 stockage sain : aucun message, la connexion s'enregistre comme avant", async () => {
  const w = makeWorld({});
  await settle();
  assert(w.count(MSG_STORAGE) === 0, "message de stockage refusé sur un stockage sain");
  w.App.saveConnection(URL_EXEC, "code-equipe");
  await settle();
  assert(w.requests.length === 1 && w.requests[0].url === URL_EXEC, "une requête de vérification attendue");
  assert(w.requests[0].token === nodeSha(CONFIG.serverTokenInput("code-equipe")), "jeton dérivé inattendu");
  assert(JSON.parse(w.mem.get(KEYS.apiUrl)) === URL_EXEC, "adresse non enregistrée");
  assert(w.Sync.connection.url === URL_EXEC && w.Sync.connection.unlocked === true, "connexion non posée");
  assert(w.lastToast().text === MSG_CONNECTED, "toast attendu : " + JSON.stringify(w.lastToast()));
});

test("BL-056 stockage refusé : le mode local reste possible (une fonction avec repli n'est pas bloquée)", async () => {
  const w = makeWorld({ storage: "throws" });
  await settle();
  w.App.useLocalMode();
  assert(w.Sync.connection.localMode === true && w.Sync.connection.unlocked === true, "mode local non activé");
  assert(w.App.gate() === "name", "après le mode local, l'écran du nom est attendu : " + w.App.gate());
});

test("garde de chargement mixte conservée : un config.js ancien sans règle de présentation ne casse pas le démarrage", async () => {
  const w = makeWorld({ noOnboardingRule: true });
  await settle();
  assert(typeof w.Sync.hooks.onChange === "function", "le démarrage n'est pas allé à son terme");
});

/* ========================================================== BL-057 : crypto.subtle === */

test("BL-057 Utils.sha256Hex hors Node, sans crypto.subtle : promesse rejetée, erreur typée, aucune exception synchrone", async () => {
  for (const mode of [{ crypto: "none" }, {}]) {
    const Utils = loadUtils(mode);
    let promise;
    try { promise = Utils.sha256Hex("texte"); }
    catch (e) { throw new Error("levée synchrone (" + JSON.stringify(mode) + ") : " + e.message); }
    assert(promise && typeof promise.then === "function", "pas de promesse");
    let error = null;
    try { await promise; } catch (e) { error = e; }
    assert(error && error.code === "crypto-unavailable", "erreur non typée : " + (error && error.name + " " + error.message));
    assert(Utils.isCryptoUnavailable(error) === true, "isCryptoUnavailable doit reconnaître l'erreur");
    assert(error.message === MSG_CRYPTO, "message inattendu : " + error.message);
  }
});

test("BL-057 Utils.sha256Hex : mêmes condensats avec crypto.subtle et avec le repli Node (vecteurs inchangés)", async () => {
  const viaSubtle = loadUtils({ crypto: "subtle" });
  const viaNode = loadUtils({ crypto: "none", nodeLike: true });
  for (const text of ["abc", "", "Équipe é 😀", "probe|x"]) {
    assert((await viaSubtle.sha256Hex(text)) === nodeSha(text), "écart via crypto.subtle pour " + JSON.stringify(text));
    assert((await viaNode.sha256Hex(text)) === nodeSha(text), "écart via le repli Node pour " + JSON.stringify(text));
  }
});

test("BL-057 connexion avec un code, sans crypto.subtle : message honnête, rien d'enregistré, aucune requête", async () => {
  const w = makeWorld({ crypto: "none" });
  await settle();
  w.App.saveConnection(URL_EXEC, "code-equipe");
  await settle();
  assert(w.lastToast().text === MSG_CRYPTO && w.lastToast().kind === "error",
    "message attendu : " + JSON.stringify(w.lastToast()));
  assert(w.requests.length === 0, "le serveur a été contacté");
  assert(!w.connections.some((patch) => patch.url), "une adresse a été posée sur la connexion");
  assert(!w.mem.has(KEYS.apiUrl), "adresse enregistrée");
});

test("BL-057 connexion SANS code, sans crypto.subtle : fonctionne (aucun hachage nécessaire)", async () => {
  const w = makeWorld({ crypto: "none" });
  await settle();
  w.App.saveConnection(URL_EXEC, "");
  await settle();
  assert(w.requests.length === 1 && w.requests[0].token === "", "une requête sans jeton attendue : " + JSON.stringify(w.requests));
  assert(w.lastToast().text === MSG_CONNECTED, "toast attendu : " + JSON.stringify(w.lastToast()));
  assert(JSON.parse(w.mem.get(KEYS.apiUrl)) === URL_EXEC, "adresse non enregistrée");
});

test("BL-057 déverrouillage sans crypto.subtle : message honnête, l'appareil reste verrouillé, aucune requête", async () => {
  const w = makeWorld({
    crypto: "none",
    stored: { [KEYS.apiUrl]: URL_EXEC, [KEYS.lockVerifier]: "verificateur-de-test", [KEYS.user]: ME }
  });
  await settle();
  assert(w.App.needsUnlock(), "l'appareil devrait être verrouillé au départ");
  w.App.unlock("code-equipe");
  await settle();
  assert(w.lastToast().text === MSG_CRYPTO && w.lastToast().kind === "error",
    "message attendu : " + JSON.stringify(w.lastToast()));
  assert(w.App.needsUnlock(), "l'appareil a été déverrouillé");
  assert(w.requests.length === 0, "le serveur a été contacté");
});

test("BL-057 aucun SHA-256 écrit à la main dans les scripts (constantes d'initialisation absentes)", () => {
  fs.readdirSync(path.join(ROOT, "js")).filter((file) => /\.js$/.test(file)).forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, "js", file), "utf8").toLowerCase();
    assert(code.indexOf("0x6a09e667") < 0 && code.indexOf("0x428a2f98") < 0, "constantes SHA-256 dans js/" + file);
  });
});

/* ===================================================== BL-058 : pushState / replaceState === */

test("BL-058 pushState qui lève : la navigation et les feuilles continuent sans historique", async () => {
  const w = makeWorld({ history: "push-throws" });
  await settle();
  w.App.go("#/topic/t1");
  assert(w.App.route.name === "topic" && w.App.route.topicId === "t1", "écran non atteint : " + JSON.stringify(w.App.route));
  w.UI.local.sheet = { kind: "test" };
  w.App.ajusterCouches(0, 1);
  w.UI.local.sheet = null;
  w.App.ajusterCouches(1, 0);
  w.App.remonter();
  assert(w.App.route.name === "topics", "retour à la liste impossible : " + JSON.stringify(w.App.route));
  assert(w.history.pushed.length === 0, "aucune entrée ne pouvait être empilée");
});

test("BL-058 pushState ET replaceState lèvent : démarrage, navigation et retour intacts", async () => {
  const w = makeWorld({ history: "both-throw" });   // App.start appelle déjà replaceState
  await settle();
  w.App.go("#/settings");
  assert(w.App.route.name === "settings", "réglages non atteints : " + JSON.stringify(w.App.route));
  w.App.go("#/meeting");
  assert(w.App.route.name === "meeting", "synthèse non atteinte : " + JSON.stringify(w.App.route));
  w.App.remonter();
  assert(w.App.route.name === "settings", "retour aux réglages impossible : " + JSON.stringify(w.App.route));
  w.App.go("#/");
  assert(w.App.route.name === "topics", "retour à la liste impossible : " + JSON.stringify(w.App.route));
});

test("BL-058 historique sain : mêmes appels qu'avant (descendre empile, un écran frère remplace)", async () => {
  const w = makeWorld({});
  await settle();
  assert(w.history.replaced.length === 1 && w.history.replaced[0].url === "#/", "le démarrage doit poser l'entrée courante");
  w.App.go("#/topic/t1");
  assert(w.history.pushed.length === 1 && w.history.pushed[0].url === "#/topic/t1" && w.history.pushed[0].state.tkIndex === 1,
    "descendre doit empiler : " + JSON.stringify(w.history.pushed));
  w.App.go("#/topic/t2");
  assert(w.history.pushed.length === 1 && w.history.replaced.length === 2 && w.history.replaced[1].url === "#/topic/t2",
    "un écran frère doit remplacer : " + JSON.stringify(w.history.replaced));
});

/* ============================================ BL-028 : coupe sans demi-paire UTF-16 === */

test("BL-028 Utils.limit ne coupe jamais une paire de substitution (même règle que Core.cut)", () => {
  const w = makeWorld({});
  const smile = "😀";
  const cases = [
    { text: "a".repeat(149) + smile + "fin", max: 150, expected: "a".repeat(149) },
    { text: "a".repeat(148) + smile + "fin", max: 150, expected: "a".repeat(148) + smile },
    { text: smile.repeat(10), max: 5, expected: smile + smile },
    { text: smile.repeat(10), max: 1, expected: "" },
    { text: "abc", max: 10, expected: "abc" },
    { text: "  abc  ", max: 2, expected: "ab" },
    { text: "ab\ud83d", max: 10, expected: "ab" },
    { text: null, max: 5, expected: "" },
    { text: undefined, max: 5, expected: "" }
  ];
  cases.forEach((one) => {
    const got = w.Utils.limit(one.text, one.max);
    assert(got === one.expected, "Utils.limit(" + JSON.stringify(one.text) + ", " + one.max + ") = " +
      JSON.stringify(got) + ", attendu " + JSON.stringify(one.expected));
    assert(isWellFormed(got), "demi-paire laissée par Utils.limit(" + JSON.stringify(one.text) + ", " + one.max + ")");
  });
  ["", "a", smile, "a" + smile, smile + "a", smile + smile, "x".repeat(20) + smile, "ab\ud83d", "\ude00ab", "é" + smile + "é"]
    .forEach((text) => {
      for (let max = 0; max <= 24; max += 1) {
        assert(w.Utils.limit(text, max) === w.Core.cut(text, max),
          "écart avec Core.cut : " + JSON.stringify(text) + ", max " + max);
      }
    });
});

/* ======================================================================= Texte === */

test("textes visibles de ce lot : aucun tiret cadratin", () => {
  [MSG_STORAGE, MSG_CRYPTO].forEach((text) => assert(text.indexOf("—") < 0, "tiret cadratin dans : " + text));
  allToasts.forEach((toast) => assert(toast.text.indexOf("—") < 0, "tiret cadratin dans un message : " + toast.text));
});

async function main() {
  let failed = 0;
  for (const one of tests) {
    unhandled.length = 0;
    try {
      await one.fn();
      await delay(10);
      if (unhandled.length) {
        const reason = unhandled[0];
        throw new Error("rejet de promesse non rattrapé : " + String(reason && reason.message ? reason.message : reason));
      }
      console.log("  ✓ " + one.name);
    } catch (error) {
      failed += 1;
      console.log("  ✗ " + one.name + "\n      " + String(error && error.message ? error.message : error).split("\n").join("\n      "));
    }
  }
  if (failed) {
    console.log(failed + " test(s) en échec sur " + tests.length + ".");
    process.exit(1);
  }
  console.log("✓ " + tests.length + " test(s) OK.");
}

main();
