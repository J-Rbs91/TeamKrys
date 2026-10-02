/* BrainstO. — choix envoyés d'après l'état AFFICHÉ (idempotence) et reverrouillage d'un
 * appareil connecté sans code.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/app-idempotent.test.js
 *
 * js/app.js est chargé TEL QUEL dans un contexte `vm`, entouré de doublures : Sync (liste
 * des fonctions annoncées par le serveur réglable), Api (faux serveur), UI, Store, DB,
 * Utils. js/config.js et js/state.js sont les vrais : chaque action envoyée est validée
 * puis appliquée par le vrai noyau.
 *
 * Ce qui est protégé :
 *   1. §4, §7, §9, §19, §22 : quand le serveur annonce "idempotent", l'appui décide d'après
 *      la vue AFFICHÉE (Store.view, optimiste) : bouton non enfoncé → SET_* marqué
 *      set:true ; bouton enfoncé → REMOVE_VOTE, REMOVE_CONCLUSION_VOTE ou SET_REACTION
 *      {emoji:"", set:true}. Rejouée, l'action ne change plus rien.
 *   2. Ancien serveur, ou aucune réponse encore reçue (liste vide) : l'envoi reste
 *      EXACTEMENT l'ancien (bascule non marquée, mêmes clés).
 *   3. §5 : la garde de réaction (pas de réaction à son propre message anonyme) tient
 *      dans tous les cas ; retirer une ancienne réaction reste permis.
 *   4. §21 : un appareil connecté SANS code que le serveur refuse désormais affiche
 *      l'écran de verrouillage et arrête la synchronisation, file intacte ; le code de
 *      l'équipe, validé par le serveur, le déverrouille.
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
const STATE_EXPORTS = require(path.join(ROOT, "js/state.js"));
const CONFIG = globalThis.CONFIG;
const Core = globalThis.Core || STATE_EXPORTS.Core || STATE_EXPORTS;
const KEYS = CONFIG.KEYS;

const URL_EXEC = "https://script.google.com/macros/s/EXEMPLE/exec";
const CODE = "code-de-l-equipe";
const ME = { id: "u-moi", name: "Moi" };
const OTHER = { id: "u-autre", name: "Autre" };
const NOW = "2026-10-01T09:00:00.000Z";

const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const TEAM_VERIFIER = sha(CONFIG.verifierInput(CODE));
const TEAM_TOKEN = sha(CONFIG.serverTokenInput(CODE));

const FEATURES_NEW = ["since", "batch", "lean", "idempotent"];
const FEATURES_OLD = ["since", "batch", "lean"];

const MSG_RELOCK = "Code d'accès refusé par le serveur : saisissez le nouveau code de l'équipe.";
const MSG_WRONG = "Code d'accès incorrect.";
const MSG_ACCEPTED = "Nouveau code accepté.";
const MSG_OWN_ANON = "Vous ne pouvez pas réagir à votre propre message anonyme.";

/* Toutes les promesses des doublures sont déjà réglées : quelques tours suffisent. */
async function settle() {
  for (let i = 0; i < 6; i += 1) { await new Promise((resolve) => setImmediate(resolve)); }
}

const apiError = (kind, message) => Object.assign(new Error(message), { kind, code: kind === "auth" ? "auth" : null });
/* Faux serveur qui exige un code : n'accepte que le jeton du code de l'équipe. */
const serverAccepting = (goodToken) => (url, token) => (token === goodToken
  ? Promise.resolve({ ok: true, revision: 7 })
  : Promise.reject(apiError("auth", "Accès refusé par le serveur.")));
const serverOffline = () => Promise.reject(apiError("network", "Connexion impossible. Vérifiez votre réseau."));

/* ------------------------------------------------------------ États --- */

let seq = 0;
function act(state, actor, type, payload) {
  const action = { id: "prep-" + (seq += 1), type, actorId: actor.id, actorName: actor.name, ts: NOW, payload };
  const result = Core.reduce(state, action, NOW);
  if (!result.ok) { throw new Error("préparation refusée (" + type + ") : " + result.error); }
  return state;
}

/* Sujet t1 : message m1 d'une autre personne, message anonyme m2 écrit sur cet appareil,
 * proposition p1, formulations de consensus c1 et c2. */
function baseState() {
  const s = Core.emptyState();
  act(s, OTHER, "CREATE_TOPIC", { topicId: "t1", title: "Sujet", description: "", anon: false });
  act(s, OTHER, "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "à réagir", quoteId: null, anon: false });
  act(s, { id: "", name: Core.ANON_NAME }, "CREATE_MESSAGE", { topicId: "t1", messageId: "m2", text: "le mien, anonyme", quoteId: null, anon: true });
  act(s, OTHER, "CREATE_PROPOSAL", { topicId: "t1", proposalId: "p1", title: "Proposition", description: "" });
  act(s, OTHER, "ADD_CONCLUSION", { topicId: "t1", conclusionId: "c1", text: "Cap 1" });
  act(s, OTHER, "ADD_CONCLUSION", { topicId: "t1", conclusionId: "c2", text: "Cap 2" });
  return s;
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const topicOf = (s) => Core.findTopic(s, "t1");
const myVote = (s) => Core.findProposal(topicOf(s), "p1").votes[ME.id];
const myReaction = (s) => Core.findMessage(topicOf(s), "m1").reactions[ME.id];
const myChoice = (s) => topicOf(s).conclusionVotes[ME.id];

/* Ce que l'écran montre déjà comme « mon choix » (bouton enfoncé). */
const shown = {
  nothing: () => baseState(),
  vote: (value) => () => act(baseState(), ME, "SET_VOTE", { topicId: "t1", proposalId: "p1", value }),
  reaction: (emoji) => () => act(baseState(), ME, "SET_REACTION", { topicId: "t1", messageId: "m1", emoji }),
  choice: (cid) => () => act(baseState(), ME, "SET_CONCLUSION_VOTE", { topicId: "t1", conclusionId: cid })
};

/* ------------------------------------------------------------ Monde --- */

const NO_CODE = { [KEYS.apiUrl]: URL_EXEC, [KEYS.user]: ME };   // connecté en accès libre
const QUEUED = { key: 1, action: { id: "A-1", type: "CREATE_MESSAGE", payload: { text: "écrit avant le refus" } } };

function makeWorld(options) {
  const opts = options || {};
  const store = new Map();
  Object.keys(opts.storage || {}).forEach((key) => store.set(key, JSON.stringify(opts.storage[key])));
  const w = {
    toasts: [], requests: [], dispatched: [], stops: 0, queueCleared: 0,
    features: (opts.features || []).slice(), server: opts.server || serverOffline
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
    /* Comme js/sync.js : vide tant que le serveur n'a pas répondu. */
    supports(name) { return w.features.indexOf(name) >= 0; },
    start() {},
    stop() { w.stops += 1; },
    now() { return Promise.resolve(); },
    flush() { return false; },
    setHooks(hooks) { Sync.hooks = hooks; },
    subscribe() {},
    boot() { return Promise.resolve(); },
    makeAction(type, payload, actor) {
      return {
        id: Utils.uid(), type, actorId: actor && actor.id ? actor.id : "",
        actorName: actor && actor.name ? actor.name : "", ts: NOW, payload: payload || {}
      };
    },
    dispatch(action) { w.dispatched.push(action); return Promise.resolve({ ok: true }); }
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
    view: opts.view || null, base: opts.base || opts.view || null, queue: (opts.queue || []).slice(),
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

/* ------------------------------------------------------------ Tests --- */

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

async function check(name, fn) {
  try { await fn(); passed += 1; console.log("✓ " + name); }
  catch (error) { failures.push({ name, error }); }
}

const describe = (action) => JSON.stringify({ type: action.type, payload: action.payload });

function assertSent(w, expected, context) {
  assert(w.dispatched.length === 1, context + " : " + w.dispatched.length + " action(s) envoyée(s) au lieu d'une");
  const sent = w.dispatched[0];
  assert(
    describe(sent) === JSON.stringify(expected) && sent.actorId === ME.id,
    context + " : envoyé " + describe(sent) + " (acteur " + sent.actorId + "), attendu " + JSON.stringify(expected)
  );
  return sent;
}

const MODES = [
  { name: "serveur qui annonce « idempotent »", features: FEATURES_NEW, marked: true },
  { name: "ancien serveur (sans « idempotent »)", features: FEATURES_OLD, marked: false },
  { name: "avant la première réponse du serveur (liste vide)", features: [], marked: false }
];

const P_VOTE = { topicId: "t1", proposalId: "p1" };
const CASES = [
  { what: "vote, aucun vote affiché, appui sur « Pour »", view: shown.nothing,
    tap: (A) => A.setVote("t1", "p1", "for"), intent: (s) => myVote(s) === "for",
    marked: { type: "SET_VOTE", payload: { topicId: "t1", proposalId: "p1", value: "for", set: true } },
    old: { type: "SET_VOTE", payload: { topicId: "t1", proposalId: "p1", value: "for" } } },
  { what: "vote, « Contre » affiché, appui sur « Pour »", view: shown.vote("against"),
    tap: (A) => A.setVote("t1", "p1", "for"), intent: (s) => myVote(s) === "for",
    marked: { type: "SET_VOTE", payload: { topicId: "t1", proposalId: "p1", value: "for", set: true } },
    old: { type: "SET_VOTE", payload: { topicId: "t1", proposalId: "p1", value: "for" } } },
  { what: "vote, « Pour » affiché (enfoncé), appui sur « Pour »", view: shown.vote("for"),
    tap: (A) => A.setVote("t1", "p1", "for"), intent: (s) => myVote(s) === undefined,
    marked: { type: "REMOVE_VOTE", payload: P_VOTE },
    old: { type: "SET_VOTE", payload: { topicId: "t1", proposalId: "p1", value: "for" } } },
  { what: "réaction, aucune affichée, appui sur 👌", view: shown.nothing,
    tap: (A) => A.setReaction("t1", "m1", "👌"), intent: (s) => myReaction(s) === "👌",
    marked: { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "👌", set: true } },
    old: { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "👌" } } },
  { what: "réaction, 💪 affichée, appui sur 👌", view: shown.reaction("💪"),
    tap: (A) => A.setReaction("t1", "m1", "👌"), intent: (s) => myReaction(s) === "👌",
    marked: { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "👌", set: true } },
    old: { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "👌" } } },
  { what: "réaction, 👌 affichée (enfoncée), appui sur 👌", view: shown.reaction("👌"),
    tap: (A) => A.setReaction("t1", "m1", "👌"), intent: (s) => myReaction(s) === undefined,
    marked: { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "", set: true } },
    old: { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "👌" } } },
  { what: "soutien, aucun affiché, appui sur « Choisir » c1", view: shown.nothing,
    tap: (A) => A.setConclusionVote("t1", "c1"), intent: (s) => myChoice(s) === "c1",
    marked: { type: "SET_CONCLUSION_VOTE", payload: { topicId: "t1", conclusionId: "c1", set: true } },
    old: { type: "SET_CONCLUSION_VOTE", payload: { topicId: "t1", conclusionId: "c1" } } },
  { what: "soutien, c2 affiché, appui sur « Choisir » c1", view: shown.choice("c2"),
    tap: (A) => A.setConclusionVote("t1", "c1"), intent: (s) => myChoice(s) === "c1",
    marked: { type: "SET_CONCLUSION_VOTE", payload: { topicId: "t1", conclusionId: "c1", set: true } },
    old: { type: "SET_CONCLUSION_VOTE", payload: { topicId: "t1", conclusionId: "c1" } } },
  { what: "soutien, c1 affiché (« Mon choix »), appui sur c1", view: shown.choice("c1"),
    tap: (A) => A.setConclusionVote("t1", "c1"), intent: (s) => myChoice(s) === undefined,
    marked: { type: "REMOVE_CONCLUSION_VOTE", payload: { topicId: "t1" } },
    old: { type: "SET_CONCLUSION_VOTE", payload: { topicId: "t1", conclusionId: "c1" } } }
];

(async () => {
  for (const mode of MODES) {
    await check("forme envoyée, " + mode.name + (mode.marked
      ? " : SET marqué ou retrait explicite d'après l'état affiché ; rejouée, l'action ne change rien"
      : " : envoi actuel À L'IDENTIQUE (bascule non marquée, mêmes clés)"), async () => {
      for (const c of CASES) {
        const view = c.view();
        const w = makeWorld({ storage: NO_CODE, features: mode.features, view });
        c.tap(w.App.actions);
        await settle();
        const sent = assertSent(w, mode.marked ? c.marked : c.old, c.what);
        /* Le vrai noyau accepte l'action et l'applique sur la vue affichée. */
        const once = clone(view);
        const r1 = Core.reduce(once, sent, NOW);
        assert(r1.ok, c.what + " : action refusée par le noyau (" + r1.error + ")");
        if (mode.marked) {
          assert(c.intent(once), c.what + " : l'état obtenu ne correspond pas à l'intention");
          const twice = clone(once);
          const r2 = Core.reduce(twice, sent, NOW);
          assert(r2.ok && JSON.stringify(twice) === JSON.stringify(once),
            c.what + " : rejouée (réponse perdue, rejeu de la file), l'action marquée change l'état");
        }
      }
    });
  }

  await check("l'état AFFICHÉ décide (vue optimiste), pas le dernier état connu du serveur", async () => {
    /* Serveur : aucun vote ; écran : « Pour » (vote encore en file) → retrait. */
    let w = makeWorld({ storage: NO_CODE, features: FEATURES_NEW, view: shown.vote("for")(), base: baseState() });
    w.App.actions.setVote("t1", "p1", "for");
    assertSent(w, { type: "REMOVE_VOTE", payload: P_VOTE }, "écran « Pour », serveur sans vote");
    /* Serveur : « Pour » ; écran : aucun vote (retrait encore en file) → affecter. */
    w = makeWorld({ storage: NO_CODE, features: FEATURES_NEW, view: baseState(), base: shown.vote("for")() });
    w.App.actions.setVote("t1", "p1", "for");
    assertSent(w, { type: "SET_VOTE", payload: { topicId: "t1", proposalId: "p1", value: "for", set: true } },
      "écran sans vote, serveur « Pour »");
    /* Même règle pour le soutien et la réaction. */
    w = makeWorld({ storage: NO_CODE, features: FEATURES_NEW, view: shown.choice("c1")(), base: baseState() });
    w.App.actions.setConclusionVote("t1", "c1");
    assertSent(w, { type: "REMOVE_CONCLUSION_VOTE", payload: { topicId: "t1" } }, "écran c1, serveur sans soutien");
    w = makeWorld({ storage: NO_CODE, features: FEATURES_NEW, view: baseState(), base: shown.reaction("👌")() });
    w.App.actions.setReaction("t1", "m1", "👌");
    assertSent(w, { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m1", emoji: "👌", set: true } },
      "écran sans réaction, serveur 👌");
  });

  await check("« Retirer mon vote » envoie REMOVE_VOTE, à l'identique, dans tous les cas", async () => {
    for (const mode of MODES) {
      const w = makeWorld({ storage: NO_CODE, features: mode.features, view: shown.vote("for")() });
      w.App.actions.removeVote("t1", "p1");
      assertSent(w, { type: "REMOVE_VOTE", payload: P_VOTE }, mode.name);
    }
  });

  await check("boîte à idées : une idée part SANS auteur (acteur vide et « Anonyme »), avec un identifiant d'idée ; épingler envoie une affectation", async () => {
    const w = makeWorld({ storage: NO_CODE, features: FEATURES_NEW, view: baseState() });
    w.App.actions.submitIdea("Moins de réunions le lundi");
    assert(w.dispatched.length === 1, "une action attendue, " + w.dispatched.length + " envoyée(s)");
    const sent = w.dispatched[0];
    assert(sent.type === "SUBMIT_IDEA" && sent.actorId === "" && sent.actorName === "Anonyme",
      "l'idée doit partir sans auteur : " + JSON.stringify({ type: sent.type, actorId: sent.actorId, actorName: sent.actorName }));
    assert(typeof sent.payload.ideaId === "string" && sent.payload.ideaId && sent.payload.text === "Moins de réunions le lundi",
      "charge de l'idée : " + JSON.stringify(sent.payload));
    /* Le texte de l'idée peut contenir n'importe quoi (« Moins » contient « Moi ») : on cherche l'identité partout SAUF
     * dans le texte, et la charge ne porte que l'identifiant d'idée et le texte. */
    const withoutText = JSON.stringify(Object.assign({}, sent, { payload: Object.assign({}, sent.payload, { text: "" }) }));
    assert(withoutText.indexOf(ME.id) < 0 && withoutText.indexOf(ME.name) < 0, "une identité a fuité dans l'action : " + withoutText);
    assert(JSON.stringify(Object.keys(sent.payload).sort()) === JSON.stringify(["ideaId", "text"]), "charge inattendue : " + JSON.stringify(sent.payload));
    w.App.actions.setTopicPin("t1", true);
    assert(JSON.stringify(w.dispatched[1].payload) === JSON.stringify({ topicId: "t1", pinned: true }), "épingle : " + JSON.stringify(w.dispatched[1].payload));
  });

  await check("§5 garde de réaction intacte : rien n'est envoyé pour réagir à son propre message anonyme ; retirer une ancienne réaction reste permis", async () => {
    for (const mode of MODES) {
      const storage = Object.assign({}, NO_CODE, { [KEYS.ownItems]: ["m2"] });
      let w = makeWorld({ storage, features: mode.features, view: baseState() });
      w.App.actions.setReaction("t1", "m2", "👌");
      assert(w.dispatched.length === 0, mode.name + " : réaction à son propre message anonyme envoyée : " + w.dispatched.map(describe).join(", "));
      assert(w.lastToast().text === MSG_OWN_ANON, mode.name + " : message attendu, reçu « " + w.lastToast().text + " »");
      /* Réaction posée avant la règle (données antérieures) : la retirer ôte l'identifiant. */
      const legacy = baseState();
      Core.findMessage(topicOf(legacy), "m2").reactions[ME.id] = "💪";
      w = makeWorld({ storage, features: mode.features, view: legacy });
      w.App.actions.setReaction("t1", "m2", "💪");
      assertSent(w, mode.marked
        ? { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m2", emoji: "", set: true } }
        : { type: "SET_REACTION", payload: { topicId: "t1", messageId: "m2", emoji: "💪" } }, mode.name + ", retrait");
    }
  });

  await check("§21 appareil connecté sans code que le serveur refuse : écran de verrouillage, synchronisation arrêtée, file intacte", async () => {
    const w = makeWorld({ storage: NO_CODE, queue: [QUEUED], server: serverAccepting(TEAM_TOKEN) });
    assert(w.App.gate() === null && !w.App.needsUnlock() && w.Sync.isConnected(), "départ : accès libre attendu");
    w.Sync.hooks.onAuthError();
    await settle();
    assert(w.App.gate() === "lock" && w.App.needsUnlock(), "écran de verrouillage non affiché : gate=" + w.App.gate());
    assert(!w.Sync.isConnected() && w.Sync.connection.token === "", "la synchronisation reste branchée");
    assert(w.stops >= 1, "la boucle de synchronisation n'est pas arrêtée");
    assert(w.toasts.filter((t) => t.text === MSG_RELOCK).length === 1, "message de refus : " + JSON.stringify(w.toasts));
    assert(w.Store.queue.length === 1 && w.Store.queue[0] === QUEUED && w.queueCleared === 0, "la file d'actions a été touchée");
    assert(w.requests.length === 0 && w.get(KEYS.lockVerifier) === null, "requête ou vérificateur inattendu");
  });

  await check("§21 sur cet écran, un code faux ne déverrouille pas ; le code de l'équipe, validé par le serveur, déverrouille", async () => {
    const w = makeWorld({ storage: NO_CODE, queue: [QUEUED], server: serverAccepting(TEAM_TOKEN) });
    w.Sync.hooks.onAuthError();
    await settle();
    w.App.unlock("code-faux");
    await settle();
    assert(w.App.needsUnlock() && w.lastToast().text === MSG_WRONG, "code faux : « " + w.lastToast().text + " », gate=" + w.App.gate());
    w.App.unlock(CODE);
    await settle();
    assert(!w.App.needsUnlock() && w.App.gate() === null, "le code de l'équipe ne déverrouille pas : gate=" + w.App.gate());
    assert(w.get(KEYS.lockVerifier) === TEAM_VERIFIER && w.Sync.connection.token === TEAM_TOKEN && w.Sync.isConnected(),
      "vérificateur ou jeton non posé");
    assert(w.lastToast().text === MSG_ACCEPTED, "message attendu « " + MSG_ACCEPTED + " », reçu « " + w.lastToast().text + " »");
    assert(w.Store.queue.length === 1 && w.Store.queue[0] === QUEUED && w.queueCleared === 0, "la file d'actions a été touchée");
  });

  await check("mode local : App.relock ne verrouille rien (aucun serveur, aucun code)", async () => {
    const w = makeWorld({ storage: { [KEYS.localMode]: true, [KEYS.user]: ME } });
    w.App.relock();
    await settle();
    assert(w.App.gate() === null && !w.App.needsUnlock() && w.stops === 0, "mode local verrouillé : gate=" + w.App.gate());
  });

  if (failures.length) {
    failures.forEach((f) => console.error("✗ " + f.name + "\n    " + (f.error && f.error.message ? f.error.message : f.error)));
    console.error("\n" + failures.length + " test(s) en échec sur " + (passed + failures.length) + ".");
    process.exit(1);
  }
  console.log("\n✓ " + passed + " tests réussis sur " + passed + ".");
})();
