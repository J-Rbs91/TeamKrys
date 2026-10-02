/* BrainstO. — lien d'invitation : fabrication et lecture du lien (js/utils.js), puis parcours dans js/app.js.
 *
 *     node tests/invite.test.js
 *
 * Ce qui est protégé :
 *   1. le lien porte l'adresse du script dans le FRAGMENT, et seulement une adresse de script Google (ou un serveur
 *      local de test) : un lien vers un autre serveur est refusé ;
 *   2. le lien se retrouve dans un message entier collé, et l'écran de connexion l'accepte à la place de l'adresse ;
 *   3. ouvrir le lien sur un appareil neuf montre l'écran de connexion ; rien n'est enregistré avant la validation ;
 *   4. un appareil déjà dans l'équipe rentre à l'accueil ; un appareil d'une AUTRE équipe ne change d'équipe que
 *      s'il valide ; un lien abîmé ne change rien ;
 *   5. Réglages fabrique le lien de l'équipe de l'appareil, jamais en mode local, et sait si l'équipe a un code.
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
const KEYS = globalThis.CONFIG.KEYS;

const TEAM = "https://script.google.com/macros/s/AKfycbx_EQUIPE-1/exec";
const OTHER = "https://script.google.com/a/macros/acme.fr/s/AUTRE_2/exec";
const BASE = "https://j-rbs91.github.io/TeamKrys/";
const ME = { id: "u-moi", name: "Moi" };
const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log("✓ " + name); }
  catch (error) { failures.push(name); console.error("✗ " + name + "\n  " + (error && error.message)); }
}
function assert(c, m) { if (!c) { throw new Error(m || "assertion échouée"); } }
async function settle() { for (let i = 0; i < 6; i += 1) { await new Promise((r) => setImmediate(r)); } }

/* Les vraies fonctions de js/utils.js, chargées seules. */
function realUtils() {
  const ctx = vm.createContext({ window: {}, console, navigator: {}, document: {}, btoa, atob });
  ctx.self = ctx.window;
  vm.runInContext(UTILS_JS.code, ctx, { filename: UTILS_JS.file });
  return ctx.Utils || ctx.window.Utils;
}
const U = realUtils();
const tokenOf = (url) => U.inviteToken(url);

/* js/app.js tel quel, entouré de doublures ; Utils est le vrai, stockage en mémoire et SHA-256 de Node. */
function makeWorld(opts) {
  const store = new Map();
  Object.keys(opts.storage || {}).forEach((k) => store.set(k, JSON.stringify(opts.storage[k])));
  const w = { toasts: [], requests: [], hashes: [] };
  const Utils = Object.assign(realUtils(), {
    storage: {
      get(key, fallback) { if (!store.has(key)) { return fallback; } try { return JSON.parse(store.get(key)); } catch (e) { return fallback; } },
      set(key, value) { store.set(key, JSON.stringify(value)); return true; },
      remove(key) { store.delete(key); },
      available() { return true; }
    },
    sha256Hex: (text) => Promise.resolve(sha(text))
  });
  const Sync = {
    connection: { url: "", token: "", localMode: false, unlocked: false },
    setConnection(patch) { Object.assign(Sync.connection, patch || {}); },
    isConnected() { return !!Sync.connection.url && !Sync.connection.localMode && Sync.connection.unlocked; },
    supports() { return false; }, start() {}, stop() {}, now() { return Promise.resolve(); }, flush() { return false; },
    setHooks() {}, subscribe() {}, boot() { return Promise.resolve(); },
    makeAction(type, payload, actor) { return { type, payload, actorId: actor.id }; },
    dispatch() { return Promise.resolve({ ok: true }); }
  };
  const Api = {
    getRevision(url, token) { w.requests.push({ url, token }); return Promise.resolve({ ok: true, revision: 3 }); },
    isAuthError: () => false, isNetworkError: () => false
  };
  const UI = {
    local: { sheet: null, modal: null, quote: null },
    init() {}, force() {}, render() {}, refreshStatus() {}, showUpdateBanner() {},
    set(patch) { Object.assign(UI.local, patch || {}); },
    toast(text, kind) { w.toasts.push({ text, kind: kind || "info" }); },
    onboardingActive() { return false; }, closeOnboarding() {}, replayOnboarding() {}
  };
  const Store = { view: null, base: null, queue: [], setBase() {}, setQueue() {} };
  const DB = { clearQueue() { return Promise.resolve(); }, clearState() { return Promise.resolve(); } };
  const location = { hash: opts.hash || "#/", href: BASE + (opts.hash || "#/") };
  const remember = (hash) => { location.hash = hash; location.href = BASE + hash; w.hashes.push(hash); };
  const sandbox = {
    Utils, Sync, Api, UI, DB,
    window: {
      location,
      history: { state: null, pushState(s, t, h) { remember(h); }, replaceState(s, t, h) { sandbox.window.history.state = s; remember(h); }, go() {} },
      addEventListener() {}
    },
    document: { readyState: "complete", hidden: false, addEventListener() {} },
    navigator: {}, setInterval: () => 0, clearInterval() {}, console
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CONFIG_JS.code, ctx, { filename: CONFIG_JS.file });
  vm.runInContext(STATE_JS.code, ctx, { filename: STATE_JS.file });
  ctx.Store = Store;
  vm.runInContext(APP_JS.code, ctx, { filename: APP_JS.file });
  return Object.assign(w, { App: ctx.App, Sync, location, get: (k) => (store.has(k) ? JSON.parse(store.get(k)) : null) });
}

(async () => {
  await check("lien : adresse du script dans le fragment, aller-retour exact, paramètres et index.html retirés", () => {
    const link = U.inviteLink(BASE + "index.html?fbclid=abc#/settings", TEAM);
    assert(link.indexOf(BASE + "#/invitation/") === 0, "forme du lien : " + link);
    assert(link.split("#")[0] === BASE, "rien de l'adresse du script avant le fragment : " + link);
    assert(U.inviteUrl(link.split("#/invitation/")[1]) === TEAM, "aller-retour");
    assert(/^[A-Za-z0-9_-]+$/.test(tokenOf(TEAM)), "jeton sans caractère à échapper dans un message");
  });

  await check("lien : seules les adresses de script Google (et un serveur local de test) sont acceptées", () => {
    ["https://script.google.com/macros/s/X/exec", "https://script.google.com/a/macros/acme.fr/s/X/exec",
      "https://script.google.com/a/acme.fr/macros/s/X/exec", "http://localhost:8765/exec"]
      .forEach((u) => assert(U.inviteTarget(u) === u, "refusée à tort : " + u));
    ["https://script.google.com.evil.io/macros/s/X/exec", "http://script.google.com/macros/s/X/exec",
      "https://evil.example/exec", "https://script.google.com/macros/s/X/exec?redirect=evil", "javascript:alert(1)"]
      .forEach((u) => assert(U.inviteTarget(u) === "" && U.inviteToken(u) === "", "acceptée à tort : " + u));
    const forged = Buffer.from("https://evil.example/exec").toString("base64").replace(/=+$/, "");
    assert(U.inviteUrl(forged) === "" && U.inviteUrl("@@@") === "" && U.inviteUrl("") === "", "jeton forgé ou abîmé accepté");
  });

  await check("lien : retrouvé dans un message entier collé ; un lien forgé dans un message est ignoré", () => {
    const link = U.inviteLink(BASE, TEAM);
    const message = "Bonjour,\nVoici le lien :\n" + link + "\nCode d'accès : 1234";
    assert(U.inviteTokenIn(message) === tokenOf(TEAM), "jeton non retrouvé dans le message");
    const forged = BASE + "#/invitation/" + Buffer.from("https://evil.example/exec").toString("base64");
    assert(U.inviteTokenIn("voir " + forged) === "", "un lien vers un autre serveur ne doit pas être retenu");
  });

  await check("appareil neuf : l'écran de connexion s'ouvre en mode invitation, rien n'est enregistré avant validation", async () => {
    const w = makeWorld({ hash: "#/invitation/" + tokenOf(TEAM) });
    await settle();
    assert(w.App.gate() === "connection", "porte : " + w.App.gate());
    const inv = w.App.invitation();
    assert(inv && inv.url === TEAM && inv.sameTeam === false, "invitation lue : " + JSON.stringify(inv));
    assert(w.get(KEYS.apiUrl) === null && w.requests.length === 0, "rien ne doit partir ni s'enregistrer avant la validation");
    w.App.saveConnection(inv.url, "");
    await settle();
    assert(w.get(KEYS.apiUrl) === TEAM, "adresse enregistrée : " + w.get(KEYS.apiUrl));
    assert(w.App.route.name === "topics" && w.location.hash === "#/", "après avoir rejoint, retour à l'accueil : " + w.location.hash);
  });

  await check("appareil déjà dans l'équipe : retour à l'accueil, rien ne change ; lien abîmé : accueil et message", async () => {
    const w = makeWorld({ hash: "#/invitation/" + tokenOf(TEAM), storage: { [KEYS.apiUrl]: TEAM, [KEYS.user]: ME } });
    await settle();
    assert(w.App.route.name === "topics" && w.location.hash === "#/", "route : " + w.App.route.name);
    assert(w.toasts.some((t) => /déjà partie de cette équipe/.test(t.text)), "message attendu : " + JSON.stringify(w.toasts));
    assert(w.get(KEYS.apiUrl) === TEAM && w.requests.length === 0, "rien ne doit changer");
    const b = makeWorld({ hash: "#/invitation/AAAA", storage: { [KEYS.apiUrl]: TEAM, [KEYS.user]: ME } });
    await settle();
    assert(b.App.route.name === "topics" && b.toasts.some((t) => /incomplet/.test(t.text)), "lien abîmé : " + JSON.stringify(b.toasts));
  });

  await check("appareil d'une autre équipe : connexion demandée, l'équipe ne change que si la personne valide", async () => {
    const w = makeWorld({ hash: "#/invitation/" + tokenOf(OTHER), storage: { [KEYS.apiUrl]: TEAM, [KEYS.user]: ME } });
    await settle();
    assert(w.App.gate() === "connection" && w.App.invitation().url === OTHER, "porte : " + w.App.gate());
    assert(w.get(KEYS.apiUrl) === TEAM, "l'équipe a changé sans validation");
    w.App.go("#/");
    assert(w.App.gate() === null && w.get(KEYS.apiUrl) === TEAM, "« Garder mon équipe actuelle » doit tout laisser en l'état");
    const v = makeWorld({ hash: "#/invitation/" + tokenOf(OTHER), storage: { [KEYS.apiUrl]: TEAM, [KEYS.user]: ME } });
    await settle();
    v.App.saveConnection(v.App.invitation().url, "");
    await settle();
    assert(v.get(KEYS.apiUrl) === OTHER && v.App.route.name === "topics", "après validation : " + v.get(KEYS.apiUrl));
  });

  await check("champ d'adresse : le lien entier, ou tout le message, vaut l'adresse qu'il porte", async () => {
    const w = makeWorld({});
    const message = "Bonjour,\n" + U.inviteLink(BASE, TEAM) + "\nCode d'accès : ";
    w.App.saveConnection(message, "");
    await settle();
    assert(w.get(KEYS.apiUrl) === TEAM && w.requests[0].url === TEAM, "adresse retenue : " + w.get(KEYS.apiUrl));
  });

  await check("Réglages : lien de l'équipe de l'appareil, jamais en mode local ; présence d'un code connue sans le code", async () => {
    const w = makeWorld({ storage: { [KEYS.apiUrl]: TEAM, [KEYS.user]: ME, [KEYS.lockVerifier]: sha(globalThis.CONFIG.verifierInput("secret")),
      [KEYS.session]: { at: Date.now(), verifier: sha(globalThis.CONFIG.verifierInput("secret")), token: "t" } } });
    await settle();
    const link = w.App.inviteLink();
    assert(link.indexOf(BASE + "#/invitation/") === 0 && U.inviteUrl(link.split("#/invitation/")[1]) === TEAM, "lien : " + link);
    assert(w.App.teamHasCode() === true, "l'équipe a un code");
    assert(link.indexOf("secret") < 0, "le code ne doit jamais entrer dans le lien");
    const free = makeWorld({ storage: { [KEYS.apiUrl]: TEAM, [KEYS.user]: ME } });
    await settle();
    assert(free.App.teamHasCode() === false, "équipe sans code");
    const local = makeWorld({ storage: { [KEYS.localMode]: true, [KEYS.user]: ME } });
    await settle();
    assert(local.App.inviteLink() === "", "aucun lien en mode local");
  });

  console.log("");
  if (failures.length) {
    console.error("✗ " + failures.length + " échec(s), " + passed + " réussi(s)");
    process.exit(1);
  }
  console.log("✓ invite : " + passed + " tests réussis.");
})();
