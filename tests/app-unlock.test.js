/* BrainstO. — garde-fous du verrou (code d'équipe changé) et de la preuve locale d'anonymat.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/app-unlock.test.js
 *
 * js/app.js est chargé TEL QUEL dans un contexte `vm`, entouré de doublures : Sync,
 * Api (faux serveur), UI, Store, DB, Utils (stockage en mémoire, SHA-256 de Node).
 * js/config.js (entrées des condensats, clés de stockage) et js/state.js (recherche
 * des messages) sont les vrais.
 *
 * Ce qui est protégé :
 *   1. §17, §22 : quand l'équipe change son code, le NOUVEAU code saisi sur l'écran de
 *      verrouillage est vérifié auprès du serveur (jeton dérivé ; une sonde avec un
 *      jeton fabriqué, puis la vérification : deux requêtes par tentative). Accepté :
 *      vérificateur et jeton remplacés, déverrouillage, file d'actions intacte. Refusé
 *      ou invérifiable (hors ligne) : rien ne change. Un serveur SANS code d'accès
 *      (qui accepte tout jeton) ne prouve rien : le verrou local reste seul juge.
 *      L'ancien code déverrouille toujours localement, sans requête.
 *   2. §5 : « Rendre anonyme » inscrit le message dans la preuve locale AVANT l'envoi.
 *   3. §5 : pas de réaction à son propre message anonyme (la clé de la réaction serait
 *      l'identifiant de l'auteur, dans les données partagées).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const read = (file) => ({ file, code: fs.readFileSync(path.join(ROOT, file), "utf8") });
const CONFIG_JS = read("js/config.js");
const STATE_JS = read("js/state.js");
const APP_JS = read("js/app.js");

require(path.join(ROOT, "js/config.js"));
const CONFIG = globalThis.CONFIG;
const KEYS = CONFIG.KEYS;

const URL_EXEC = "https://script.google.com/macros/s/EXEMPLE/exec";
const OLD_CODE = "ancien-code-equipe";
const NEW_CODE = "nouveau-code-equipe";
const ME = { id: "u-moi", name: "Moi" };

const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const OLD_VERIFIER = sha(CONFIG.verifierInput(OLD_CODE));
const OLD_TOKEN = sha(CONFIG.serverTokenInput(OLD_CODE));
const NEW_VERIFIER = sha(CONFIG.verifierInput(NEW_CODE));
const NEW_TOKEN = sha(CONFIG.serverTokenInput(NEW_CODE));

const MSG_WRONG = "Code d'accès incorrect.";
const MSG_OFFLINE = "Code d'accès incorrect, ou nouveau code impossible à vérifier sans connexion.";
const MSG_ACCEPTED = "Nouveau code accepté.";
const MSG_RELOCK = "Code d'accès refusé par le serveur : saisissez le nouveau code de l'équipe.";
const MSG_OWN_ANON = "Vous ne pouvez pas réagir à votre propre message anonyme.";

/* Toutes les promesses des doublures sont déjà réglées : quelques tours suffisent. */
async function settle() {
  for (let i = 0; i < 6; i += 1) { await new Promise((resolve) => setImmediate(resolve)); }
}

const apiError = (kind, message) => Object.assign(new Error(message), { kind, code: kind === "auth" ? "auth" : null });
/* Faux serveur : n'accepte que le jeton du code en vigueur. */
const serverAccepting = (goodToken) => (url, token) => (token === goodToken
  ? Promise.resolve({ ok: true, revision: 7 })
  : Promise.reject(apiError("auth", "Accès refusé par le serveur.")));
const serverOffline = () => Promise.reject(apiError("network", "Connexion impossible. Vérifiez votre réseau."));

/* ------------------------------------------------------------ Monde --- */

function makeWorld(options) {
  const opts = options || {};
  const store = opts.storageMap || new Map();
  Object.keys(opts.storage || {}).forEach((key) => store.set(key, JSON.stringify(opts.storage[key])));
  const w = {
    toasts: [], requests: [], dispatched: [], queueCleared: 0, starts: 0, storage: store,
    server: opts.server || serverOffline
  };
  let uid = 0;

  const Utils = {
    storage: {
      get(key, fallback) {
        if (!store.has(key)) { return fallback; }
        try { return JSON.parse(store.get(key)); } catch (e) { return fallback; }
      },
      set(key, value) { store.set(key, JSON.stringify(value)); return true; },
      remove(key) { store.delete(key); },
      available() { return true; }
    },
    uid: () => "id-" + (uid += 1),
    trim: (value) => String(value == null ? "" : value).trim(),
    limit: (value, max) => String(value == null ? "" : value).trim().slice(0, max),
    sha256Hex: (text) => Promise.resolve(sha(text))
  };
  const Sync = {
    connection: { url: "", token: "", localMode: false, unlocked: false },
    hooks: {},
    setConnection(patch) { Object.assign(Sync.connection, patch || {}); },
    isConnected() { return !!Sync.connection.url && !Sync.connection.localMode && Sync.connection.unlocked; },
    supports() { return false; },
    start() { w.starts += 1; },
    stop() {},
    now() { return Promise.resolve(); },
    flush() { return false; },
    setHooks(hooks) { Sync.hooks = hooks; },
    subscribe() {},
    boot() { return Promise.resolve(); },
    makeAction(type, payload, actor) { return { type, payload, actorId: actor.id }; },
    dispatch(action) {
      /* On photographie la preuve locale AU MOMENT de l'envoi. */
      w.dispatched.push({ action, ownItems: Utils.storage.get(KEYS.ownItems, []) });
      return Promise.resolve({ ok: true });
    }
  };
  const Api = {
    getRevision(url, token) { w.requests.push({ url, token }); return w.server(url, token); },
    isAuthError: (error) => !!error && error.kind === "auth",
    isNetworkError: (error) => !!error && error.kind === "network"
  };
  const UI = {
    local: { sheet: null, modal: null, quote: null },
    init() {}, force() {}, render() {}, refreshStatus() {}, showUpdateBanner() {},
    set(patch) { Object.assign(UI.local, patch || {}); },
    toast(text, kind) { w.toasts.push({ text, kind: kind || "info" }); },
    onboardingActive() { return false; }, closeOnboarding() {}, replayOnboarding() {}
  };
  const Store = {
    view: opts.view || null, base: opts.view || null, queue: (opts.queue || []).slice(),
    setBase(state) { Store.base = state; }, setQueue(queue) { Store.queue = queue; }
  };
  const DB = {
    clearQueue() { w.queueCleared += 1; return Promise.resolve(); },
    clearState() { return Promise.resolve(); }
  };
  const sandbox = {
    Utils, Sync, Api, UI, DB,
    window: {
      location: { hash: "#/" },
      history: { state: null, pushState() {}, replaceState(state) { sandbox.window.history.state = state; }, go() {} },
      addEventListener() {}
    },
    document: { readyState: "complete", hidden: false, addEventListener() {} },
    navigator: {},
    setInterval: () => 0, clearInterval() {}, console
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CONFIG_JS.code, ctx, { filename: CONFIG_JS.file });
  vm.runInContext(STATE_JS.code, ctx, { filename: STATE_JS.file });
  ctx.Store = Store;   // state.js pose le vrai Store : on garde la doublure
  vm.runInContext(APP_JS.code, ctx, { filename: APP_JS.file });   // App.start() au chargement
  return Object.assign(w, {
    App: ctx.App, Sync, Store, UI,
    get: (key) => Utils.storage.get(key, null),
    lastToast: () => w.toasts[w.toasts.length - 1] || { text: "", kind: "" }
  });
}

const QUEUED = { key: 1, action: { id: "A-1", type: "CREATE_MESSAGE", payload: { text: "écrit avant le changement de code" } } };

/* Appareil connecté avec l'ANCIEN code, session expirée : écran de verrouillage. */
function lockedWorld(server) {
  return makeWorld({
    storage: { [KEYS.apiUrl]: URL_EXEC, [KEYS.lockVerifier]: OLD_VERIFIER, [KEYS.user]: ME },
    queue: [QUEUED],
    server
  });
}

function assertNothingChanged(w) {
  assert(w.App.needsUnlock(), "l'espace a été déverrouillé sans réponse positive du serveur");
  assert(w.get(KEYS.lockVerifier) === OLD_VERIFIER, "le vérificateur local a changé");
  assert(w.get(KEYS.session) === null, "une session a été écrite");
  assert(w.Sync.connection.token === "" && w.Sync.connection.unlocked === false, "le jeton de connexion a changé");
  assertQueueIntact(w);
}

function assertQueueIntact(w) {
  assert(
    w.Store.queue.length === 1 && w.Store.queue[0] === QUEUED && w.queueCleared === 0,
    "la file d'actions a été touchée : " + JSON.stringify(w.Store.queue) + ", effacements=" + w.queueCleared
  );
}

/* Sujet t1 dont les messages sont fournis. */
function viewWith(messages) {
  return { topics: [{ id: "t1", title: "Sujet", status: "open", messages, proposals: [], conclusions: [] }], participants: [] };
}

/* Appareil en mode local (aucun verrou), éventuellement avec une preuve locale. */
function localWorld(view, ownItems) {
  const storage = { [KEYS.localMode]: true, [KEYS.user]: ME };
  if (ownItems) { storage[KEYS.ownItems] = ownItems; }
  return makeWorld({ storage, view });
}

/* ------------------------------------------------------------ Tests --- */

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

async function check(name, fn) {
  try { await fn(); passed += 1; }
  catch (error) { failures.push({ name, error }); }
}

(async () => {
  await check("ancien code : déverrouillage local, sans requête au serveur", async () => {
    const w = lockedWorld(serverAccepting(NEW_TOKEN));
    assert(w.App.needsUnlock() && w.App.gate() === "lock", "le monde de départ doit être verrouillé");
    w.App.unlock(OLD_CODE);
    await settle();
    assert(!w.App.needsUnlock(), "l'ancien code ne déverrouille plus");
    assert(w.requests.length === 0, "l'ancien code a déclenché une requête : " + JSON.stringify(w.requests));
    assert(w.Sync.connection.token === OLD_TOKEN && w.Sync.connection.unlocked === true, "jeton de l'ancien code non posé");
    const session = w.get(KEYS.session);
    assert(session && session.v === OLD_VERIFIER && session.t === OLD_TOKEN, "session non démarrée");
    assertQueueIntact(w);
  });

  await check("nouveau code accepté par le serveur : déverrouillé, vérificateur et jeton remplacés, file intacte", async () => {
    const w = lockedWorld(serverAccepting(NEW_TOKEN));
    w.App.unlock(NEW_CODE);
    await settle();
    assert(
      w.requests.length === 2 && w.requests.every((r) => r.url === URL_EXEC) &&
      w.requests[0].token !== NEW_TOKEN && w.requests[0].token !== OLD_TOKEN && w.requests[1].token === NEW_TOKEN,
      "attendu une sonde (jeton fabriqué) puis UNE vérification avec le jeton dérivé du code saisi : " + JSON.stringify(w.requests)
    );
    assert(!w.App.needsUnlock(), "le nouveau code accepté par le serveur ne déverrouille pas ; toasts=" + JSON.stringify(w.toasts));
    assert(w.get(KEYS.lockVerifier) === NEW_VERIFIER, "vérificateur local non remplacé");
    assert(
      w.Sync.connection.token === NEW_TOKEN && w.Sync.connection.unlocked === true && w.Sync.connection.url === URL_EXEC,
      "connexion non mise à jour : " + JSON.stringify(w.Sync.connection)
    );
    const session = w.get(KEYS.session);
    assert(session && session.v === NEW_VERIFIER && session.t === NEW_TOKEN, "session non démarrée avec le nouveau jeton");
    assertQueueIntact(w);
    assert(w.toasts.some((t) => t.text === MSG_ACCEPTED), "pas de « " + MSG_ACCEPTED + " » : " + JSON.stringify(w.toasts));
    assert(w.starts >= 1, "la synchronisation ne repart pas");
    const stored = Array.from(w.storage.values()).join(" ");
    assert(stored.indexOf(NEW_CODE) < 0 && stored.indexOf(OLD_CODE) < 0, "un code en clair est stocké sur l'appareil");
    /* Le vérificateur a bien changé : au verrou suivant, le nouveau code suffit localement. */
    w.App.relock();
    w.App.unlock(NEW_CODE);
    await settle();
    assert(!w.App.needsUnlock() && w.requests.length === 2, "le nouveau code n'est pas devenu le code local");
  });

  await check("code faux : refusé par le serveur, rien ne change", async () => {
    const w = lockedWorld(serverAccepting(NEW_TOKEN));
    w.App.unlock("pas-le-bon-code");
    await settle();
    assert(w.requests.length === 2, "attendu une sonde puis une vérification : " + w.requests.length);
    assert(w.lastToast().text === MSG_WRONG && w.lastToast().kind === "error", "message attendu « " + MSG_WRONG + " », reçu " + JSON.stringify(w.toasts));
    assertNothingChanged(w);
  });

  await check("serveur SANS code d'accès (accepte tout jeton) : un code inventé ne déverrouille pas, le verrou local tient", async () => {
    const w = lockedWorld((url, token) => Promise.resolve({ ok: true, revision: 3 }));
    w.App.unlock("un-code-invente");
    await settle();
    assert(w.requests.length === 1, "attendu la seule sonde, sans vérification du jeton saisi : " + JSON.stringify(w.requests));
    assert(w.lastToast().text === MSG_WRONG && w.lastToast().kind === "error", "message attendu « " + MSG_WRONG + " », reçu " + JSON.stringify(w.toasts));
    assertNothingChanged(w);
    w.App.unlock(NEW_CODE);
    await settle();
    assertNothingChanged(w);
    w.App.unlock(OLD_CODE);
    await settle();
    assert(!w.App.needsUnlock(), "l'ancien code (vérificateur local) ne déverrouille plus");
    assertQueueIntact(w);
  });

  await check("hors ligne ou réponse illisible : message honnête, rien ne change", async () => {
    const w = lockedWorld(serverOffline);
    w.App.unlock(NEW_CODE);
    await settle();
    assert(w.requests.length === 1, "attendu la seule sonde (rien d'autre n'est tenté hors ligne) : " + w.requests.length);
    assert(w.lastToast().text === MSG_OFFLINE && w.lastToast().kind === "error", "message attendu « " + MSG_OFFLINE + " », reçu " + JSON.stringify(w.toasts));
    assertNothingChanged(w);
    const w2 = lockedWorld(() => Promise.reject(apiError("server", "Réponse illisible du serveur.")));
    w2.App.unlock(NEW_CODE);
    await settle();
    assert(w2.lastToast().text === MSG_OFFLINE, "erreur serveur : message attendu « " + MSG_OFFLINE + " », reçu " + JSON.stringify(w2.toasts));
    assertNothingChanged(w2);
    /* Seul `ok: true` vaut acceptation : une réponse résolue sans lui ne déverrouille pas. */
    const w3 = lockedWorld(() => Promise.resolve({ ok: false }));
    w3.App.unlock(NEW_CODE);
    await settle();
    assert(w3.lastToast().text === MSG_OFFLINE, "réponse sans ok : message attendu « " + MSG_OFFLINE + " », reçu " + JSON.stringify(w3.toasts));
    assertNothingChanged(w3);
  });

  await check("une réponse arrivée après « Se déconnecter » ne réinstalle rien", async () => {
    let release = null;
    /* La sonde (jeton fabriqué) est refusée tout de suite ; seule la vérification du code saisi reste en vol. */
    const w = lockedWorld((url, token) => (token === NEW_TOKEN
      ? new Promise((resolve) => { release = () => resolve({ ok: true, revision: 1 }); })
      : Promise.reject(apiError("auth", "Accès refusé par le serveur."))));
    w.App.unlock(NEW_CODE);
    await settle();
    assert(typeof release === "function", "la vérification auprès du serveur n'est pas partie");
    w.App.logout();
    await settle();
    release();
    await settle();
    assert(w.get(KEYS.lockVerifier) === null && w.get(KEYS.session) === null, "vérificateur ou session réinstallé après la déconnexion");
    assert(w.Sync.connection.token === "" && w.Sync.connection.unlocked === false, "jeton réinstallé après la déconnexion");
    assert(!w.toasts.some((t) => t.text === MSG_ACCEPTED), "« " + MSG_ACCEPTED + " » annoncé après la déconnexion");
  });

  await check("deux appuis : une requête par appui au plus, une seule annonce", async () => {
    const releases = [];
    const w = lockedWorld((url, token) => (token === NEW_TOKEN
      ? new Promise((resolve) => { releases.push(() => resolve({ ok: true })); })
      : Promise.reject(apiError("auth", "Accès refusé par le serveur."))));
    w.App.unlock(NEW_CODE);
    w.App.unlock(NEW_CODE);
    await settle();
    releases.forEach((go) => go());
    await settle();
    assert(w.requests.length <= 4, "plus d'une sonde et d'une vérification par appui : " + w.requests.length);
    assert(!w.App.needsUnlock(), "non déverrouillé");
    assert(w.toasts.filter((t) => t.text === MSG_ACCEPTED).length === 1, "annonce répétée : " + JSON.stringify(w.toasts));
    assertQueueIntact(w);
  });

  await check("refus du serveur en cours de session : reverrouillage qui invite à saisir le nouveau code", async () => {
    const w = lockedWorld(serverAccepting(NEW_TOKEN));
    w.App.unlock(OLD_CODE);
    await settle();
    assert(!w.App.needsUnlock(), "préalable : l'ancien code déverrouille");
    w.Sync.hooks.onAuthError();
    await settle();
    assert(w.App.needsUnlock(), "pas de reverrouillage sur refus du serveur");
    assert(w.lastToast().text === MSG_RELOCK, "message attendu « " + MSG_RELOCK + " », reçu " + JSON.stringify(w.toasts));
    assertQueueIntact(w);
  });

  await check("« Rendre anonyme » inscrit le message dans la preuve locale AVANT l'envoi (§5)", async () => {
    const message = { id: "m4", authorId: ME.id, authorName: ME.name, anon: false, text: "Signé", reactions: {} };
    const view = viewWith([message]);
    const w = localWorld(view);
    assert(w.App.ownsMessage(message), "préalable : message signé reconnu par son authorId");
    w.App.actions.setMessageSignature("t1", "m4", true);
    await settle();
    const sent = w.dispatched.find((d) => d.action.type === "SET_MESSAGE_SIGNATURE");
    assert(sent && sent.action.payload.anon === true, "SET_MESSAGE_SIGNATURE anonyme non envoyé");
    assert(sent.ownItems.indexOf("m4") >= 0, "au moment de l'envoi, le message n'est pas dans la preuve locale : " + JSON.stringify(sent.ownItems));
    /* Le serveur efface l'auteur : l'appareil doit rester maître du message. */
    Object.assign(message, { authorId: "", authorName: "Anonyme", anon: true });
    assert(w.App.ownsMessage(message), "après anonymisation, l'appareil ne peut plus modifier ni signer");
    const reloaded = makeWorld({ storageMap: w.storage, view });
    assert(reloaded.App.ownsMessage(message), "après rechargement, la preuve locale est perdue");
  });

  await check("pas de réaction à son propre message anonyme (§5) ; les autres réactions partent", async () => {
    const mine = { id: "m5", authorId: "", authorName: "Anonyme", anon: true, text: "Le mien", reactions: { "u-autre": "👍" } };
    const other = { id: "m6", authorId: "", authorName: "Anonyme", anon: true, text: "D'un autre", reactions: {} };
    const signed = { id: "m7", authorId: ME.id, authorName: ME.name, anon: false, text: "Signé", reactions: {} };
    const w = localWorld(viewWith([mine, other, signed]), ["m5"]);
    w.App.actions.setReaction("t1", "m5", "👌");
    await settle();
    const sentIds = () => w.dispatched.filter((d) => d.action.type === "SET_REACTION").map((d) => d.action.payload.messageId);
    assert(sentIds().length === 0, "une réaction à mon propre message anonyme est partie : sa clé serait mon identifiant");
    assert(w.lastToast().text === MSG_OWN_ANON && w.lastToast().kind === "error", "message attendu « " + MSG_OWN_ANON + " », reçu " + JSON.stringify(w.toasts));
    w.App.actions.setReaction("t1", "m6", "👌");
    w.App.actions.setReaction("t1", "m7", "👌");
    await settle();
    assert(JSON.stringify(sentIds()) === JSON.stringify(["m6", "m7"]), "réactions permises bloquées : " + JSON.stringify(sentIds()));
    /* Données antérieures : retirer ma réaction déjà posée ôte mon identifiant, c'est permis. */
    mine.reactions[ME.id] = "👌";
    w.App.actions.setReaction("t1", "m5", "👌");
    await settle();
    assert(JSON.stringify(sentIds()) === JSON.stringify(["m6", "m7", "m5"]), "le retrait de ma réaction est bloqué : " + JSON.stringify(sentIds()));
    w.App.actions.setReaction("t1", "m5", "💪");
    await settle();
    assert(sentIds().length === 3, "remplacer ma réaction sur mon message anonyme est passé");
  });

  /* ---------------------------------------------------------- Rapport --- */

  if (failures.length) {
    failures.forEach(({ name, error }) => {
      console.error("✗ " + name + "\n  " + error.message);
    });
    console.error("\n" + passed + " test(s) OK, " + failures.length + " en échec.");
    process.exit(1);
  }
  console.log("✓ " + passed + " test(s) OK.");
})();
