/* BrainstO. : non-régression du lot « Brouillons conservés » (WP-20, BL-059).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/drafts.test.js
 *
 * Ce qui est protégé :
 *  - le texte en cours de saisie dans le composeur d'un sujet est écrit sur l'appareil (localStorage, clé
 *    dédiée de js/ui.js, après un court silence), relu au démarrage et restauré dans le composeur DU MÊME
 *    sujet, après déverrouillage, jamais affiché sur l'écran de verrouillage ;
 *  - il est effacé quand la publication est acceptée en file et à la déconnexion, PAS au reverrouillage
 *    d'inactivité ;
 *  - un refus LOCAL de publication (sujet supprimé entre-temps, texte refusé) ne vide plus le champ ;
 *  - il est borné (50 brouillons, 20 000 caractères, 4 000 par brouillon) ; un stockage refusé ou abîmé ne
 *    produit aucune erreur ;
 *  - jamais de champ de connexion, de code ou de nom, jamais de fenêtre « Modifier », jamais sur le réseau ;
 *  - le choix ANONYME (et lui seul) suit le brouillon, sans identité (REC-RUI-001, arbitrage WP-22 : remplace l'ancienne règle
 *    « jamais stocké ») : indicateur écrit seulement si anonyme, brouillon rétabli anonyme, jamais converti en signé, note près
 *    du composeur, effacé à l'envoi et à la déconnexion ;
 *  - js/app.js écrit les brouillons avant pagehide, le passage en arrière-plan et le rechargement d'une mise à
 *    jour, les efface à App.logout et rend le résultat de createMessage.
 *
 * js/ui.js est chargé dans le DOM minimal de tests/ui-focus.test.js, avec des doublures de Store, Sync et App
 * (les actions modifient les données puis rendent, comme le vrai dispatch). js/app.js est chargé tel quel,
 * entouré de doublures, sur le modèle de tests/app-unlock.test.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const read = (file) => ({ file, code: fs.readFileSync(path.join(ROOT, file), "utf8") });
const UI_SOURCES = ["js/config.js", "js/utils.js", "js/state.js", "js/product-view.js", "js/ui.js"].map(read);
const CONFIG_JS = read("js/config.js");
const STATE_JS = read("js/state.js");
const APP_JS = read("js/app.js");

require(path.join(ROOT, "js/config.js"));
const KEYS = globalThis.CONFIG.KEYS;

const KEY = "brainsto.drafts.v1";

let passed = 0;
const failures = [];
const queue = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function check(name, fn) { queue.push({ name, fn }); }

/* Toutes les promesses des doublures sont déjà réglées : quelques tours suffisent. */
async function settle() {
  for (let i = 0; i < 8; i += 1) { await new Promise((resolve) => setImmediate(resolve)); }
}

/* ------------------------------------------------------------ DOM minimal --- */

const HTML_NS = "http://www.w3.org/1999/xhtml";

function walk(node, fn) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 1) { fn(child); walk(child, fn); }
  });
}

function compounds(selector) {
  const out = [];
  let current = "";
  let depth = 0;
  for (const ch of selector.trim()) {
    if (ch === "[") { depth += 1; }
    if (ch === "]") { depth -= 1; }
    if (/\s/.test(ch) && depth === 0) {
      if (current && current !== ">") { out.push(current); }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current && current !== ">") { out.push(current); }
  return out;
}

function matchCompound(node, compound) {
  if (!node || node.nodeType !== 1) { return false; }
  let rest = compound;
  const tag = /^([a-zA-Z][\w-]*|\*)/.exec(rest);
  if (tag) {
    if (tag[1] !== "*" && node.localName !== tag[1].toLowerCase()) { return false; }
    rest = rest.slice(tag[0].length);
  }
  const part = /^(?:#([\w-]+)|\.([\w-]+)|\[([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\])/;
  while (rest.length) {
    if (rest[0] === ":") { return false; }
    const m = part.exec(rest);
    if (!m) { throw new Error("sélecteur non pris en charge par le DOM de test : " + compound); }
    if (m[1] !== undefined && node.getAttribute("id") !== m[1]) { return false; }
    if (m[2] !== undefined && !node.classes().has(m[2])) { return false; }
    if (m[3] !== undefined) {
      if (!node.hasAttribute(m[3])) { return false; }
      const want = m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : m[6]);
      if (want !== undefined && node.getAttribute(m[3]) !== want) { return false; }
    }
    rest = rest.slice(m[0].length);
  }
  return true;
}

function matches(node, selector) {
  return String(selector).split(",").some((one) => {
    const parts = compounds(one);
    if (!parts.length || !matchCompound(node, parts[parts.length - 1])) { return false; }
    let rest = parts.slice(0, -1);
    for (let n = node.parentNode; rest.length && n && n.nodeType === 1; n = n.parentNode) {
      if (matchCompound(n, rest[rest.length - 1])) { rest = rest.slice(0, -1); }
    }
    return rest.length === 0;
  });
}

class FakeNode {
  constructor(doc) {
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = {};
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get nextSibling() {
    const list = this.parentNode ? this.parentNode.childNodes : [];
    return list[list.indexOf(this) + 1] || null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) { n = n.parentNode; }
    return n.nodeType === 9;
  }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, ref) {
    if (child.isFragment) {
      child.childNodes.slice().forEach((c) => this.insertBefore(c, ref));
      return child;
    }
    if (child.parentNode) { child.parentNode.removeChild(child); }
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) { this.childNodes.push(child); } else { this.childNodes.splice(i, 0, child); }
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) { this.childNodes.splice(i, 1); child.parentNode = null; }
    return child;
  }
  replaceChild(next, old) { this.insertBefore(next, old); return this.removeChild(old); }
  remove() { if (this.parentNode) { this.parentNode.removeChild(this); } }
  contains(node) {
    for (let n = node; n; n = n.parentNode) { if (n === this) { return true; } }
    return false;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(value) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    if (value !== "" && value !== null && value !== undefined) {
      this.appendChild(this.ownerDocument.createTextNode(value));
    }
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatchEvent(event) {
    (this.listeners[event.type] || []).slice().forEach((fn) => fn.call(this, event));
    return true;
  }
  querySelectorAll(selector) {
    const out = [];
    walk(this, (n) => { if (matches(n, selector)) { out.push(n); } });
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeText extends FakeNode {
  constructor(doc, data) { super(doc); this.nodeType = 3; this.data = String(data); }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
}

function makeStyle() {
  return {
    setProperty(k, v) { this[k] = String(v); },
    removeProperty(k) { delete this[k]; },
    getPropertyValue(k) { return this[k] || ""; },
  };
}

function makeDataset(node) {
  const attr = (k) => "data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== "string") { return undefined; }
      const v = node.getAttribute(attr(k));
      return v === null ? undefined : v;
    },
    set(_, k, v) { node.setAttribute(attr(k), v); return true; },
    has(_, k) { return node.hasAttribute(attr(k)); },
    deleteProperty(_, k) { node.removeAttribute(attr(k)); return true; },
  });
}

const FOCUSABLE = new Set(["button", "input", "select", "textarea"]);

class FakeElement extends FakeNode {
  constructor(doc, tag, ns) {
    super(doc);
    this.nodeType = 1;
    this.namespaceURI = ns || HTML_NS;
    this.localName = String(tag).toLowerCase();
    this.tagName = this.namespaceURI === HTML_NS ? String(tag).toUpperCase() : String(tag);
    this.attrs = new Map();
    this.style = makeStyle();
    this.dataset = makeDataset(this);
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    const self = this;
    this.classList = {
      add(...names) { const s = self.classes(); names.forEach((n) => s.add(n)); self.className = [...s].join(" "); },
      remove(...names) { const s = self.classes(); names.forEach((n) => s.delete(n)); self.className = [...s].join(" "); },
      contains(name) { return self.classes().has(name); },
      toggle(name, force) {
        const on = force === undefined ? !self.classes().has(name) : !!force;
        if (on) { this.add(name); } else { this.remove(name); }
        return on;
      },
    };
  }
  classes() { return new Set(String(this.getAttribute("class") || "").split(/\s+/).filter(Boolean)); }
  get className() { return this.getAttribute("class") || ""; }
  set className(value) { this.setAttribute("class", value); }
  get id() { return this.getAttribute("id") || ""; }
  set id(value) { this.setAttribute("id", value); }
  get value() { return this._value !== undefined ? this._value : (this.getAttribute("value") || ""); }
  set value(v) { this._value = String(v); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { if (v) { this.setAttribute("disabled", ""); } else { this.removeAttribute("disabled"); } }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  matches(selector) { return matches(this, selector); }
  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) { if (matches(n, selector)) { return n; } }
    return null;
  }
  /* Règles du navigateur : rien hors du document, rien de désactivé, rien sous un
   * ancêtre inerte, et un div ne se focalise qu'avec un tabindex. */
  focus(options) {
    const doc = this.ownerDocument;
    if (!this.isConnected || this.disabled) { return; }
    if (!FOCUSABLE.has(this.localName) && !this.hasAttribute("tabindex")) { return; }
    if (doc.inertSupport && this.closest("[inert]")) { return; }
    doc.activeElement = this;
    doc.lastFocusOptions = options || null;
  }
  blur() { if (this.ownerDocument.activeElement === this) { this.ownerDocument.activeElement = this.ownerDocument.body; } }
  click() {
    if (this.disabled) { return; }
    this.dispatchEvent({ type: "click", target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
  }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  scrollIntoView() {}
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
}

/* Navigateur récent : `inert` existe et se reflète dans l'attribut. */
class InertElement extends FakeElement {
  get inert() { return this.hasAttribute("inert"); }
  set inert(v) { if (v) { this.setAttribute("inert", ""); } else { this.removeAttribute("inert"); } }
}

class FakeDocument extends FakeNode {
  constructor(ElementClass) {
    super(null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.ElementClass = ElementClass;
    this.inertSupport = ElementClass === InertElement;
    this.documentElement = this.appendChild(this.createElement("html"));
    this.head = this.documentElement.appendChild(this.createElement("head"));
    this.body = this.documentElement.appendChild(this.createElement("body"));
    this.activeElement = this.body;
    this.visibilityState = "visible";
    this.hidden = false;
    this.title = "";
  }
  /* Un élément retiré du document perd le focus : activeElement revient à <body>. */
  get activeElement() { const a = this._active; return a && a.isConnected ? a : this.body; }
  set activeElement(node) { this._active = node; }
  createElement(tag) { return new this.ElementClass(this, tag); }
  createElementNS(ns, tag) { return new this.ElementClass(this, tag, ns); }
  createTextNode(text) { return new FakeText(this, text); }
  createDocumentFragment() { const f = new this.ElementClass(this, "fragment"); f.isFragment = true; return f; }
  getElementById(id) { return this.querySelector("#" + id); }
}

/* Clavier : l'événement remonte de la cible à la racine, comme dans un navigateur. */
function press(node, key, shiftKey) {
  const event = {
    type: "keydown", key, shiftKey: !!shiftKey, target: node, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  };
  for (let n = node; n; n = n.parentNode) {
    event.currentTarget = n;
    (n.listeners.keydown || []).slice().forEach((fn) => fn.call(n, event));
  }
  return event;
}

function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] || null,
    get length() { return m.size; },
  };
}

function lenient(target) {
  return new Proxy(target, {
    get(t, k) { return k in t ? t[k] : (typeof k === "string" ? function () { return undefined; } : undefined); },
  });
}

/* ------------------------------------------------------------- Données --- */

const ME = "p-alice";
const BOB = "p-bruno";
const T0 = "2026-10-01T08:00:00.000Z";
const TEXT = "Un message pas encore envoyé, avec « accents »\net une seconde ligne.";

function message(id, text) {
  return {
    id, text, authorId: BOB, authorName: "Bruno", anon: false,
    quoteId: null, reactions: {}, createdAt: T0, updatedAt: T0,
  };
}

function topicOf(id) {
  return {
    id, title: "Sujet " + id, description: "Description initiale de " + id, status: "open", anon: false,
    createdBy: { id: BOB, name: "Bruno" }, createdAt: T0, updatedAt: T0,
    messages: [message(id + "-m1", "Premier message de " + id)],
    proposals: [], conclusions: [], conclusionVotes: {},
  };
}

const topicRoute = (id) => ({ name: "topic", topicId: id, raw: "#/topic/" + id });

function throwing() {
  const fail = () => { throw new Error("SecurityError : stockage refusé"); };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, get length() { return fail(); } };
}

/* Quota atteint : seule l'écriture des brouillons est refusée. */
function quotaOnDrafts() {
  const ls = storage();
  const set = ls.setItem;
  ls.setItem = (k, v) => {
    if (k === KEY) { throw new Error("QuotaExceededError"); }
    set(k, v);
  };
  return ls;
}

/* ----------------------------------------------------------- Démarrage --- */

/* Un « appareil » : un contexte neuf et un localStorage que l'on peut redonner à un autre démarrage
 * (`options.storage`) pour simuler un rechargement, une éviction ou la restauration d'un onglet. */
function boot(options) {
  options = options || {};
  const document = new FakeDocument(InertElement);
  ["app", "overlay-root", "onboarding-root", "toast-root"].forEach((id) => {
    const node = document.createElement("div");
    node.setAttribute("id", id);
    document.body.appendChild(node);
  });
  const ls = options.storage || storage();
  const timers = [];
  const calls = { fetch: 0, beacon: 0 };
  let seq = 0;
  const sandbox = {
    console, document, Node: FakeNode, Element: InertElement, HTMLElement: InertElement,
    navigator: { onLine: true, userAgent: "node-test", language: "fr-FR", sendBeacon() { calls.beacon += 1; return false; } },
    fetch() { calls.fetch += 1; return Promise.reject(new Error("réseau interdit")); },
    location: { hash: "#/", href: "http://localhost/", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "" },
    history: { state: null, length: 1, pushState() {}, replaceState() {}, back() {} },
    sessionStorage: storage(),
    setTimeout(fn, ms) { seq += 1; timers.push({ id: seq, fn, ms }); return seq; },
    clearTimeout(id) {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) { timers.splice(i, 1); }
    },
    setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    innerWidth: 390, innerHeight: 800, pageYOffset: 0, scrollTo() {}, print() {},
    addEventListener() {}, removeEventListener() {},
    crypto: crypto.webcrypto, TextEncoder,
  };
  if (options.brokenStorage === "getter") {
    Object.defineProperty(sandbox, "localStorage", { configurable: true, enumerable: true, get() { throw new Error("SecurityError"); } });
  } else {
    sandbox.localStorage = ls;
  }
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  UI_SOURCES.forEach((s) => vm.runInContext(s.code, ctx, { filename: s.file }));

  const ids = options.topics || ["t1", "t2"];
  const view = ctx.Core.ensureShape({
    revision: 3,
    participants: [{ id: ME, name: "Alice" }, { id: BOB, name: "Bruno" }],
    topics: ids.map(topicOf),
  });
  const world = { refuse: false, refusal: "Ce sujet n'existe plus.", gate: null, legacyApp: false, sent: [] };

  ctx.Sync = lenient({
    connection: { url: "https://exemple.invalid/exec", token: "", localMode: false, unlocked: true },
    status: () => ({ code: "idle", label: "À jour", pending: 0, error: null, lastSyncAt: T0, revision: 3 }),
    diagnostics: () => ({
      revision: 3, updatedAt: null, lastSyncAt: T0, lastFlushAt: null, intervalMs: 6000, failures: 0,
      pending: [], persistent: true, durability: "durable", status: { code: "idle", label: "À jour", pending: 0 },
    }),
  });
  ctx.Store = lenient({ view, base: view, version: 1, queue: [], pendingMessageIds: () => ({}) });
  ctx.App = lenient({
    user: { id: ME, name: "Alice" },
    route: topicRoute("t1"),
    gate: () => world.gate,
    ownsMessage: () => false,
    ownsItem: () => false,
    onboardingWanted: () => false,
    onboardingState: () => "vue",
    connectionConfigured: () => true,
    actions: lenient({
      /* Même ordre que js/app.js et Sync.dispatch : un refus de validation affiche son message et rend
       * {ok:false} sans rendu ; une action acceptée rend l'écran tout de suite (changed) puis {ok:true}. */
      createMessage(topicId, text, quoteId, anon) {
        const topic = ctx.Core.findTopic(view, topicId);
        let result;
        if (!topic || world.refuse) {
          ctx.UI.toast(world.refusal, "error");
          result = Promise.resolve({ ok: false, error: world.refusal });
        } else {
          topic.messages.push(message("n" + topic.messages.length, text));
          ctx.Store.version += 1;
          ctx.UI.render();
          result = Promise.resolve({ ok: true, error: null });
        }
        world.sent.push({ topicId, text, quoteId, anon });
        ctx.UI.set({ quote: null });
        return world.legacyApp ? undefined : result;
      },
    }),
  });
  ctx.UI.init();

  const draftTimers = () => timers.filter((x) => x.ms >= 300 && x.ms <= 1000);
  return {
    ctx, doc: document, world, ls, calls, view, draftTimers,
    app: () => document.getElementById("app"),
    overlay: () => document.getElementById("overlay-root"),
    toasts: () => document.getElementById("toast-root"),
    composer: (id) => document.getElementById("app").querySelector('[data-draft="composer:' + id + '"]'),
    go(route) { ctx.App.route = route; ctx.UI.force(); },
    /* Une frappe : le champ change, l'événement `input` remonte au document. */
    type(node, text) { node.value = text; document.dispatchEvent({ type: "input", target: node }); },
    /* Le silence de l'anti-rebond est écoulé. */
    fire() {
      const due = draftTimers();
      due.forEach((x) => { timers.splice(timers.indexOf(x), 1); x.fn(); });
      return due.length;
    },
    saved() {
      const text = ls.getItem(KEY);
      return text === null ? null : JSON.parse(text);
    },
    send() { document.getElementById("app").querySelector('[data-key="send"]').click(); },
  };
}

function typeAndSave(t, id, text) {
  t.go(topicRoute(id));
  t.type(t.composer(id), text);
  t.fire();
}

/* ====================================================== Saisie et reprise === */

check("BL-059 saisie : écrite sur l'appareil après un court silence, sous la clé dédiée, par sujet", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const box = t.composer("t1");
  assert(box, "composeur sans data-draft composer:t1");
  t.type(box, "a");
  t.type(box, TEXT);
  assert(t.ls.getItem(KEY) === null, "brouillon écrit avant le silence (anti-rebond)");
  assert(t.draftTimers().length === 1, "anti-rebond : " + t.draftTimers().length + " minuterie(s) de 300 à 1000 ms au lieu d'une seule");
  t.fire();
  const saved = t.saved();
  assert(saved && saved["composer:t1"] === TEXT, "brouillon non écrit sous " + KEY + " : " + t.ls.getItem(KEY));
  assert(Object.keys(saved).length === 1, "entrées inattendues : " + Object.keys(saved).join(", "));
});

check("BL-059 champ vidé exprès : le brouillon est retiré, il ne ressurgit pas", () => {
  const t = boot();
  typeAndSave(t, "t1", TEXT);
  assert(t.saved() && t.saved()["composer:t1"] === TEXT, "contrôle sans objet : brouillon non écrit");
  t.type(t.composer("t1"), "");
  t.fire();
  assert(t.saved() === null, "brouillon vidé encore stocké : " + t.ls.getItem(KEY));
});

check("BL-059 rechargement ou onglet restauré : le texte revient dans le composeur de CE sujet, pas d'un autre", () => {
  const a = boot();
  typeAndSave(a, "t1", TEXT);
  const b = boot({ storage: a.ls });
  b.go(topicRoute("t1"));
  assert(b.composer("t1").value === TEXT, "composeur du sujet t1 après rechargement : « " + b.composer("t1").value + " »");
  b.go(topicRoute("t2"));
  assert(b.composer("t2").value === "", "le brouillon de t1 est apparu dans t2 : « " + b.composer("t2").value + " »");
  b.go(topicRoute("t1"));
  assert(b.composer("t1").value === TEXT, "brouillon perdu en revenant sur t1");
});

check("BL-059 deux sujets : chacun garde son brouillon, restitué au bon endroit", () => {
  const a = boot();
  typeAndSave(a, "t1", "premier brouillon");
  typeAndSave(a, "t2", "second brouillon");
  const saved = a.saved();
  assert(saved && saved["composer:t1"] === "premier brouillon" && saved["composer:t2"] === "second brouillon", "stocké : " + a.ls.getItem(KEY));
  const b = boot({ storage: a.ls });
  b.go(topicRoute("t2"));
  assert(b.composer("t2").value === "second brouillon", "t2 : « " + b.composer("t2").value + " »");
  b.go(topicRoute("t1"));
  assert(b.composer("t1").value === "premier brouillon", "t1 : « " + b.composer("t1").value + " »");
});

check("BL-059 verrouillage : jamais affiché sur l'écran de verrou, restauré après déverrouillage, gardé au reverrouillage d'inactivité", () => {
  const a = boot();
  typeAndSave(a, "t1", TEXT);
  const hidden = (t, when) => {
    assert(!t.app().textContent.includes("Un message pas encore envoyé"), "texte du brouillon affiché " + when);
    const fields = t.doc.querySelectorAll("[data-draft]").filter((n) => String(n.getAttribute("data-draft")).indexOf("composer:") === 0);
    assert(fields.length === 0, "composeur affiché " + when);
  };
  /* Démarrage à froid sur un appareil verrouillé. */
  const b = boot({ storage: a.ls });
  b.world.gate = "lock";
  b.go(topicRoute("t1"));
  hidden(b, "sur l'écran de verrouillage (démarrage à froid)");
  b.world.gate = null;
  b.ctx.UI.force();
  assert(b.composer("t1").value === TEXT, "brouillon non restauré après le déverrouillage");
  /* Page vivante : une heure sans interaction reverrouille (App.relock : UI.set puis UI.force). */
  b.world.gate = "lock";
  b.ctx.UI.set({ sheet: null, modal: null });
  b.ctx.UI.force();
  hidden(b, "sur l'écran de verrouillage (reverrouillage d'inactivité)");
  const kept = JSON.parse(b.ls.getItem(KEY) || "null");
  assert(kept && kept["composer:t1"] === TEXT, "le reverrouillage d'inactivité a effacé le brouillon : " + b.ls.getItem(KEY));
  b.world.gate = null;
  b.ctx.UI.force();
  assert(b.composer("t1").value === TEXT, "brouillon non restauré après le reverrouillage d'inactivité");
});

/* ========================================================= Envoi (ajout A) === */

check("BL-059 envoi accepté en file : champ vidé ET brouillon durable effacé", async () => {
  const t = boot();
  typeAndSave(t, "t1", TEXT);
  assert(t.saved() && t.saved()["composer:t1"] === TEXT, "contrôle sans objet : brouillon non écrit");
  t.send();
  await settle();
  assert(t.world.sent.length === 1 && t.world.sent[0].text === TEXT.trim(), "message non envoyé : " + JSON.stringify(t.world.sent));
  assert(t.composer("t1").value === "", "champ non vidé après un envoi accepté : « " + t.composer("t1").value + " »");
  assert(t.saved() === null, "brouillon durable gardé après un envoi accepté : " + t.ls.getItem(KEY));
  t.fire();
  assert(t.saved() === null, "brouillon réécrit après l'envoi");
  const b = boot({ storage: t.ls });
  b.go(topicRoute("t1"));
  assert(b.composer("t1").value === "", "le message publié est revenu après un rechargement");
});

check("BL-059 envoi aussitôt après la frappe (silence pas encore écoulé) : rien n'est écrit ensuite", async () => {
  const t = boot();
  t.go(topicRoute("t1"));
  t.type(t.composer("t1"), TEXT);
  t.send();
  await settle();
  t.fire();
  assert(t.composer("t1").value === "", "champ non vidé");
  assert(t.saved() === null, "brouillon du message publié écrit : " + t.ls.getItem(KEY));
});

check("BL-059 texte saisi pendant l'envoi : la fin de l'envoi ne l'efface pas", async () => {
  const t = boot();
  typeAndSave(t, "t1", TEXT);
  t.send();
  t.type(t.composer("t1"), "la suite, déjà en cours");
  await settle();
  t.fire();
  assert(t.composer("t1").value === "la suite, déjà en cours", "saisie plus récente perdue : « " + t.composer("t1").value + " »");
  const saved = t.saved();
  assert(saved && saved["composer:t1"] === "la suite, déjà en cours", "brouillon plus récent perdu : " + t.ls.getItem(KEY));
});

check("BL-059 refus LOCAL (texte refusé) : le texte reste dans le champ et dans le brouillon, le message d'erreur s'affiche, la citation revient", async () => {
  const t = boot();
  t.world.refuse = true;
  t.go(topicRoute("t1"));
  t.ctx.UI.set({ quote: { topicId: "t1", messageId: "t1-m1" } });
  t.type(t.composer("t1"), TEXT);
  t.fire();
  t.send();
  await settle();
  assert(t.world.sent.length === 1, "envoi non tenté : contrôle sans objet");
  assert(t.composer("t1").value === TEXT, "champ vidé à tort après un refus : « " + t.composer("t1").value + " »");
  const saved = t.saved();
  assert(saved && saved["composer:t1"] === TEXT, "brouillon durable perdu après un refus : " + t.ls.getItem(KEY));
  assert(t.toasts().textContent.includes(t.world.refusal), "message d'erreur absent : « " + t.toasts().textContent + " »");
  assert(t.ctx.UI.local.quote && t.ctx.UI.local.quote.messageId === "t1-m1", "la citation a été perdue avec le refus");
  /* Le texte refusé survit aussi à un rechargement. */
  const b = boot({ storage: t.ls });
  b.go(topicRoute("t1"));
  assert(b.composer("t1").value === TEXT, "texte refusé non restauré après rechargement");
});

check("BL-059 refus LOCAL (sujet supprimé entre-temps) : le texte reste dans le brouillon durable, immédiatement", async () => {
  const t = boot();
  typeAndSave(t, "t1", TEXT);
  t.view.topics.splice(0, 1);
  t.send();
  await settle();
  assert(t.world.sent.length === 1, "envoi non tenté : contrôle sans objet");
  assert(t.toasts().textContent.includes(t.world.refusal), "message d'erreur absent");
  const saved = t.saved();
  assert(saved && saved["composer:t1"] === TEXT, "texte du sujet supprimé perdu : " + t.ls.getItem(KEY));
});

check("BL-059 ancien js/app.js (createMessage ne rend rien) : comportement d'avant, champ vidé et brouillon effacé", async () => {
  const t = boot();
  t.world.legacyApp = true;
  typeAndSave(t, "t1", TEXT);
  t.send();
  await settle();
  assert(t.composer("t1").value === "", "champ non vidé");
  assert(t.saved() === null, "brouillon gardé : " + t.ls.getItem(KEY));
});

/* ============================================================= Déconnexion === */

check("BL-059 déconnexion : UI.clearDrafts efface mémoire, champ et stockage, sans réécriture tardive", () => {
  const t = boot();
  typeAndSave(t, "t1", TEXT);
  t.type(t.composer("t1"), TEXT + " et la suite");
  assert(typeof t.ctx.UI.clearDrafts === "function", "UI.clearDrafts absent");
  t.ctx.UI.clearDrafts();
  assert(t.ls.getItem(KEY) === null, "clé gardée : " + t.ls.getItem(KEY));
  assert(t.composer("t1").value === "", "champ encore plein après l'effacement");
  t.fire();
  assert(t.ls.getItem(KEY) === null, "brouillon réécrit par une minuterie tardive");
  t.ctx.UI.force();
  assert(t.composer("t1").value === "", "le relais en mémoire a réinjecté le texte au rendu suivant");
  t.go(topicRoute("t2"));
  t.go(topicRoute("t1"));
  assert(t.composer("t1").value === "", "texte revenu en rouvrant le sujet");
  const b = boot({ storage: t.ls });
  b.go(topicRoute("t1"));
  assert(b.composer("t1").value === "", "texte restauré après la déconnexion");
});

/* =================================================================== Bornes === */

check("BL-059 bornes : au plus 50 brouillons, 20 000 caractères, 4 000 par brouillon, les plus récents gardés", () => {
  const ids = [];
  for (let i = 1; i <= 60; i += 1) { ids.push("t" + i); }
  const t = boot({ topics: ids });
  ids.forEach((id, i) => typeAndSave(t, id, "brouillon " + (i + 1)));
  const saved = t.saved();
  const keys = Object.keys(saved);
  assert(keys.length === 50, keys.length + " brouillons gardés au lieu de 50");
  assert(saved["composer:t60"] === "brouillon 60" && saved["composer:t11"] === "brouillon 11", "les plus récents ne sont pas tous gardés");
  assert(!("composer:t1" in saved) && !("composer:t10" in saved), "les plus anciens devaient partir en premier");

  const many = [];
  for (let i = 1; i <= 12; i += 1) { many.push("s" + i); }
  const big = boot({ topics: many });
  many.forEach((id) => typeAndSave(big, id, "é".repeat(3000)));
  const raw = big.ls.getItem(KEY);
  assert(raw.length <= 20000, "taille écrite : " + raw.length + " caractères (limite 20 000)");
  const bigSaved = JSON.parse(raw);
  assert("composer:s12" in bigSaved && !("composer:s1" in bigSaved), "les plus anciens devaient partir avant les plus récents");

  const huge = boot();
  typeAndSave(huge, "t1", "x".repeat(9000));
  assert(huge.saved()["composer:t1"].length <= 4000, "brouillon unique non plafonné : " + huge.saved()["composer:t1"].length);
});

/* ============================================ Stockage refusé ou abîmé === */

check("BL-059 stockage refusé (méthodes qui lèvent, accès qui lève, quota) : aucune erreur, comportement d'avant", async () => {
  const variants = [
    { brokenStorage: "methods", storage: throwing() },
    { brokenStorage: "getter" },
    { storage: quotaOnDrafts() },
  ];
  for (let i = 0; i < variants.length; i += 1) {
    const t = boot(variants[i]);
    assert(typeof t.ctx.UI.flushDrafts === "function" && typeof t.ctx.UI.clearDrafts === "function", "UI.flushDrafts ou UI.clearDrafts absent");
    t.go(topicRoute("t1"));
    t.type(t.composer("t1"), TEXT);
    t.fire();
    t.ctx.UI.flushDrafts();
    t.go(topicRoute("t2"));
    t.go(topicRoute("t1"));
    assert(t.composer("t1").value === TEXT, "variante " + i + " : le relais en mémoire doit rester (comportement d'avant)");
    t.send();
    await settle();
    assert(t.composer("t1").value === "", "variante " + i + " : champ non vidé après l'envoi");
    t.ctx.UI.clearDrafts();
  }
});

check("BL-059 contenu abîmé ou inattendu relu sans erreur ; aucun champ sensible n'est jamais réécrit", () => {
  ["pas du json", "[]", "null", "\"texte\"", "42", "{\"composer:t1\":42,\"composer:t2\":[\"x\"],\"composer:t3\":\"\"}"].forEach((raw) => {
    const ls = storage();
    ls.setItem(KEY, raw);
    const t = boot({ storage: ls });
    t.go(topicRoute("t1"));
    assert(t.composer("t1").value === "", "contenu « " + raw + " » restauré dans le composeur");
  });
  const ls = storage();
  ls.setItem(KEY, JSON.stringify({
    "setup:code": "SECRET-CODE", "lock:code": "SECRET-DEUX", "newTopic:title": "Titre", "composer:t1": "reste",
  }));
  const t = boot({ storage: ls });
  t.go(topicRoute("t1"));
  assert(t.composer("t1").value === "reste", "brouillon valide non restauré");
  typeAndSave(t, "t2", "nouveau");
  const raw = ls.getItem(KEY);
  assert(!/SECRET|Titre/.test(raw), "champ sensible réécrit : " + raw);
  assert(Object.keys(JSON.parse(raw)).sort().join() === "composer:t1,composer:t2", "clés écrites : " + raw);
});

/* ================================================ Ce qui n'est jamais gardé === */

check("BL-059 jamais gardés : connexion, code, nom, fenêtres « Modifier » (le préremplissage l'emporte toujours)", () => {
  const t = boot();
  ["connection", "lock", "name"].forEach((gate) => {
    t.world.gate = gate;
    t.ctx.UI.force();
    const fields = t.doc.querySelectorAll("[data-draft]");
    assert(fields.length > 0, "écran « " + gate + " » sans champ data-draft : contrôle sans objet");
    fields.forEach((node) => t.type(node, "saisie-" + node.getAttribute("data-draft")));
    t.fire();
    if (typeof t.ctx.UI.flushDrafts === "function") { t.ctx.UI.flushDrafts(); }
    assert(t.ls.getItem(KEY) === null, "écran « " + gate + " » : un champ a été écrit : " + t.ls.getItem(KEY));
  });
  t.world.gate = null;
  t.go(topicRoute("t1"));

  const cases = [
    { modal: { type: "editMessage", topicId: "t1", messageId: "t1-m1" }, key: "editMessage:t1-m1", original: "Premier message de t1" },
    { modal: { type: "editTopic", topicId: "t1" }, key: "editTopic:title:t1", original: "Sujet t1" },
    { modal: { type: "editTopic", topicId: "t1" }, key: "editTopic:desc:t1", original: "Description initiale de t1" },
  ];
  cases.forEach((spec) => {
    t.ctx.UI.set({ modal: spec.modal });
    let node = t.overlay().querySelector('[data-draft="' + spec.key + '"]');
    assert(node && node.value === spec.original, spec.key + " : préremplissage absent à l'ouverture (« " + (node && node.value) + " »)");
    t.type(node, "texte d'édition abandonné");
    t.fire();
    if (typeof t.ctx.UI.flushDrafts === "function") { t.ctx.UI.flushDrafts(); }
    assert(t.ls.getItem(KEY) === null, spec.key + " : un texte d'édition a été écrit : " + t.ls.getItem(KEY));
    t.ctx.UI.set({ modal: null });
    t.ctx.UI.set({ modal: spec.modal });
    node = t.overlay().querySelector('[data-draft="' + spec.key + '"]');
    assert(node.value === spec.original, spec.key + " : texte abandonné revenu à la réouverture (« " + node.value + " »)");
    t.ctx.UI.set({ modal: null });
    const b = boot({ storage: t.ls });
    b.go(topicRoute("t1"));
    b.ctx.UI.set({ modal: spec.modal });
    node = b.overlay().querySelector('[data-draft="' + spec.key + '"]');
    assert(node.value === spec.original, spec.key + " : prérempli de travers après un rechargement (« " + node.value + " »)");
  });
});

/* ======= Le choix anonyme suit le brouillon (REC-RUI-001, arbitrage WP-22 : REMPLACE l'ancienne règle « jamais stocké ») === */

const NOTE_ANON_TEXT = "Brouillon retrouvé sur cet appareil. Il sera publié en anonyme : vérifiez avant d'envoyer.";
const NOTE_CHECK_TEXT = "Brouillon retrouvé sur cet appareil. Vérifiez « Signé » ou « Anonyme » avant d'envoyer.";
/* Le nom que les autres verront, à gauche de l'interrupteur : « Signé : Prénom », ou « Anonyme » une fois la bascule actionnée. */
const WHO_ANON = "Anonyme";
const whoLine = (t) => t.doc.getElementById("composer-who").textContent;
const noteNodeOf = (t) => t.doc.getElementById("composer-restored");
const pressToggle = (t) => t.app().querySelector('[data-key="composer-anon"]').click();

/* Un appareil où le brouillon du sujet `id` a été écrit en mode ANONYME (le choix est fait comme la personne : une bascule). */
function anonDeviceFor(id) {
  const t = boot();
  t.go(topicRoute(id));
  pressToggle(t);
  assert(whoLine(t) === WHO_ANON, "contrôle sans objet : la bascule ne donne pas « " + WHO_ANON + " » (" + whoLine(t) + ")");
  t.type(t.composer(id), TEXT);
  t.fire();
  return t;
}

check("REC-RUI-001 stocké SEULEMENT quand le choix est anonyme, sans aucune identité ; absent pour un brouillon signé ; rien sur le réseau", () => {
  const a = anonDeviceFor("t1");
  const raw = a.ls.getItem(KEY);
  const saved = a.saved();
  assert(saved && saved["composer:t1"] === TEXT, "le texte n'est plus sous sa clé : " + raw);
  assert(JSON.stringify(saved.anon) === '["composer:t1"]', "indicateur anonyme absent ou mal formé : " + raw);
  Object.keys(saved).forEach((k) => {
    assert((k.indexOf("composer:") === 0 && typeof saved[k] === "string") || k === "anon", "entrée inattendue : " + k + " = " + JSON.stringify(saved[k]));
  });
  assert(!/Alice|p-alice|Bruno|p-bruno|authorName|authorId|userId/i.test(raw.replace(TEXT, "")), "une identité est écrite avec le brouillon : " + raw);
  const s = boot();                                   // même texte, choix SIGNÉ : aucun indicateur
  s.go(topicRoute("t1"));
  s.type(s.composer("t1"), TEXT);
  s.fire();
  assert(s.saved()["composer:t1"] === TEXT && !("anon" in s.saved()) && !/anon/.test(s.ls.getItem(KEY)), "indicateur écrit pour un brouillon signé : " + s.ls.getItem(KEY));
  a.ctx.UI.flushDrafts();
  a.ctx.UI.clearDrafts();
  assert(a.calls.fetch === 0 && a.calls.beacon === 0, "une requête est partie : fetch " + a.calls.fetch + ", sendBeacon " + a.calls.beacon);
});

check("REC-RUI-001 rechargement : le brouillon anonyme revient ANONYME, la note est lue près du composeur, l'envoi publie anonyme", async () => {
  const a = anonDeviceFor("t1");
  const b = boot({ storage: a.ls });
  assert(b.ctx.UI.local.composerAnon === false, "contrôle sans objet : le choix en mémoire démarre signé après un rechargement");
  b.go(topicRoute("t1"));
  assert(b.ctx.UI.local.composerAnon === true, "le brouillon anonyme n'a pas rétabli l'anonymat");
  assert(whoLine(b) === WHO_ANON, "la ligne dit : " + whoLine(b));
  assert(b.composer("t1").value === TEXT, "texte non restauré");
  const note = noteNodeOf(b);
  assert(note && note.textContent === NOTE_ANON_TEXT, "note absente ou autre : " + (note && note.textContent));
  assert(note.getAttribute("role") === "status", "la note n'est pas annoncée (role=status) à sa première apparition");
  assert(b.composer("t1").getAttribute("aria-describedby") === "composer-restored", "le champ ne porte pas la note en description");
  b.ctx.UI.force();                                   // arrivée de données : même choix, même note, pas de nouvelle annonce
  assert(whoLine(b) === WHO_ANON && noteNodeOf(b) && noteNodeOf(b).textContent === NOTE_ANON_TEXT, "un rendu de plus perd le choix ou la note");
  assert(noteNodeOf(b).getAttribute("role") !== "status", "la note est ré-annoncée à chaque rendu");
  assert(b.composer("t1").getAttribute("aria-describedby") === "composer-restored", "un rendu de plus perd la description du champ");
  b.send();
  await settle();
  assert(b.world.sent.length === 1 && b.world.sent[0].anon === true && b.world.sent[0].text === TEXT.trim(), "envoi non anonyme : " + JSON.stringify(b.world.sent));
});

check("REC-RUI-001 brouillon SANS indicateur (signé, ou écrit avant) : lisible sans erreur, restauré SIGNÉ avec la note de vérification, jamais converti", () => {
  [
    { "composer:t1": TEXT },                                                 // format de WP-20
    { "composer:t1": TEXT, anon: [] },
    { "composer:t1": TEXT, anon: "composer:t1" },                            // formes inattendues
    { "composer:t1": TEXT, anon: { "composer:t1": true } },
    { "composer:t1": TEXT, anon: ["composer:t2", 7, null, "autre:t1", "composer:"] },   // clés sans texte ou étrangères
  ].forEach((stored, i) => {
    const ls = storage();
    ls.setItem(KEY, JSON.stringify(stored));
    const b = boot({ storage: ls });
    b.go(topicRoute("t1"));
    assert(b.ctx.UI.local.composerAnon === false, "forme " + i + " : converti en anonyme sans indicateur valable");
    assert(whoLine(b) === "Signé : Alice", "forme " + i + " : la ligne dit « " + whoLine(b) + " »");
    assert(b.composer("t1").value === TEXT, "forme " + i + " : texte non restauré");
    assert(noteNodeOf(b) && noteNodeOf(b).textContent === NOTE_CHECK_TEXT, "forme " + i + " : note de vérification absente ou autre");
  });
});

check("REC-RUI-001 la note disparaît à la bascule (l'anonymat n'est plus rétabli de force), au champ vidé et à l'envoi ; le geste explicite est écrit", async () => {
  const fresh = () => { const b = boot({ storage: anonDeviceFor("t1").ls }); b.go(topicRoute("t1")); return b; };
  let b = fresh();
  assert(noteNodeOf(b), "contrôle sans objet : pas de note");
  pressToggle(b);                                     // « Signer » : un geste explicite de la personne
  assert(whoLine(b) === "Signé : Alice" && !noteNodeOf(b), "bascule : « " + whoLine(b) + " », note " + !!noteNodeOf(b));
  assert(!b.composer("t1").getAttribute("aria-describedby"), "le champ garde la description d'une note disparue");
  b.fire();
  assert(!("anon" in b.saved()), "bascule vers Signé : l'indicateur est resté écrit : " + b.ls.getItem(KEY));
  b.ctx.UI.force();
  assert(whoLine(b) === "Signé : Alice" && !noteNodeOf(b), "le rendu suivant rétablit l'anonymat malgré le geste de la personne");
  const c = boot({ storage: b.ls });                  // rechargement après ce choix explicite : signé, avec la note de vérification
  c.go(topicRoute("t1"));
  assert(whoLine(c) === "Signé : Alice" && noteNodeOf(c) && noteNodeOf(c).textContent === NOTE_CHECK_TEXT, "après un choix explicite « Signé » : « " + whoLine(c) + " »");
  b = fresh();                                        // champ vidé
  b.type(b.composer("t1"), "");
  assert(!noteNodeOf(b), "champ vidé : la note reste");
  b.fire();
  assert(b.saved() === null, "champ vidé : brouillon ou indicateur encore écrits : " + b.ls.getItem(KEY));
  b = fresh();                                        // envoi accepté
  b.send();
  await settle();
  assert(!noteNodeOf(b), "envoi : la note reste");
  assert(b.saved() === null, "envoi : brouillon ou indicateur encore écrits : " + b.ls.getItem(KEY));
  b.ctx.UI.force();
  assert(!noteNodeOf(b) && b.composer("t1").value === "", "envoi : le message ou la note reviennent au rendu suivant");
});

check("REC-RUI-001 refus LOCAL d'un envoi anonyme : le texte revient avec son indicateur, jamais signé après un rechargement", async () => {
  const t = boot();
  t.go(topicRoute("t1"));
  pressToggle(t);
  t.type(t.composer("t1"), TEXT);
  t.world.refuse = true;
  t.send();
  await settle();
  assert(t.composer("t1").value === TEXT, "texte non rendu au champ");
  const saved = t.saved();
  assert(saved && saved["composer:t1"] === TEXT && JSON.stringify(saved.anon) === '["composer:t1"]', "refus : texte ou indicateur non conservés : " + t.ls.getItem(KEY));
  const b = boot({ storage: t.ls });
  b.go(topicRoute("t1"));
  assert(whoLine(b) === WHO_ANON, "après rechargement : « " + whoLine(b) + " »");
});

check("REC-RUI-001 le choix est global, le brouillon est par sujet : un brouillon anonyme n'est jamais affiché « Signé » parce que le choix a été changé ailleurs", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  pressToggle(t);                                     // Anonyme, dans le sujet t1
  t.type(t.composer("t1"), TEXT);
  t.go(topicRoute("t2"));
  pressToggle(t);                                     // Signer, mais dans l'AUTRE sujet (sans texte)
  assert(whoLine(t) === "Signé : Alice", "contrôle sans objet : « " + whoLine(t) + " »");
  t.go(topicRoute("t1"));
  assert(whoLine(t) === WHO_ANON, "le brouillon anonyme revient signé dans son sujet : « " + whoLine(t) + " »");
  assert(noteNodeOf(t) && /anonyme/.test(noteNodeOf(t).textContent), "le retour à l'anonymat n'est pas expliqué par une note");
});

check("REC-RUI-001 déconnexion : l'indicateur et la note partent avec le brouillon (UI.clearDrafts), rien ne revient après un redémarrage", () => {
  const b = boot({ storage: anonDeviceFor("t1").ls });
  b.go(topicRoute("t1"));
  assert(noteNodeOf(b), "contrôle sans objet : pas de note");
  b.ctx.UI.clearDrafts();
  assert(b.ls.getItem(KEY) === null, "le stockage garde quelque chose : " + b.ls.getItem(KEY));
  assert(!noteNodeOf(b), "la note reste à l'écran");
  b.ctx.UI.force();
  assert(!noteNodeOf(b) && b.composer("t1").value === "", "le texte ou la note reviennent au rendu suivant");
  const c = boot({ storage: b.ls });
  c.go(topicRoute("t1"));
  assert(!noteNodeOf(c) && c.composer("t1").value === "" && whoLine(c) === "Signé : Alice", "après redémarrage : « " + whoLine(c) + " »");
});

check("REC-RUI-001 bornes : un indicateur ne survit jamais à son texte évincé", () => {
  const ids = Array.from({ length: 60 }, (_, i) => "s" + i);
  const t = boot({ topics: ids });
  t.ctx.UI.local.composerAnon = true;
  ids.forEach((id) => { t.go(topicRoute(id)); t.type(t.composer(id), "Texte " + id); t.fire(); });
  const saved = t.saved();
  const texts = Object.keys(saved).filter((k) => k !== "anon");
  assert(texts.length === 50, "50 brouillons attendus, " + texts.length + " écrits");
  assert(Array.isArray(saved.anon) && saved.anon.length === 50 && saved.anon.every((k) => texts.indexOf(k) >= 0), "indicateur sans texte, ou texte sans indicateur : " + JSON.stringify(saved.anon));
  assert(texts.indexOf("composer:s0") < 0 && saved.anon.indexOf("composer:s0") < 0, "le plus ancien brouillon (ou son indicateur) est resté");
});

check("BL-059 la clé vit dans js/ui.js seulement : jamais dans config.js ni dans le code du réseau", () => {
  const holders = fs.readdirSync(path.join(ROOT, "js")).filter((f) => /\.js$/.test(f))
    .filter((f) => read("js/" + f).code.indexOf("brainsto.drafts") >= 0);
  assert(holders.length === 1 && holders[0] === "ui.js", "fichiers qui portent la clé : " + holders.join(", "));
  const ui = read("js/ui.js").code;
  assert(ui.split('"' + KEY + '"').length === 2, "la clé " + KEY + " doit être définie une seule fois dans js/ui.js");
  assert(!/(Api|fetch|sendBeacon|XMLHttpRequest)[^\n]*DRAFTS_KEY|DRAFTS_KEY[^\n]*(Api|fetch|sendBeacon|XMLHttpRequest)/.test(ui), "la clé des brouillons approche le réseau");
});

/* ================================================ js/app.js (raccordements) === */

const URL_EXEC = "https://script.google.com/macros/s/EXEMPLE/exec";

function appWorld(opts) {
  opts = opts || {};
  const store = new Map();
  store.set(KEYS.apiUrl, JSON.stringify(URL_EXEC));
  store.set(KEYS.user, JSON.stringify({ id: "u-moi", name: "Moi" }));
  const w = { log: [], handlers: { window: {}, document: {} }, dispatched: [], banner: null };
  let uid = 0;
  const Utils = {
    storage: {
      get(key, fallback) {
        if (!store.has(key)) { return fallback; }
        try { return JSON.parse(store.get(key)); } catch (e) { return fallback; }
      },
      set(key, value) { store.set(key, JSON.stringify(value)); return true; },
      remove(key) { store.delete(key); },
      available() { return true; },
    },
    uid: () => "id-" + (uid += 1),
    trim: (value) => String(value == null ? "" : value).trim(),
    limit: (value, max) => String(value == null ? "" : value).trim().slice(0, max),
    sha256Hex: (text) => Promise.resolve(crypto.createHash("sha256").update(text, "utf8").digest("hex")),
  };
  const Sync = {
    connection: { url: "", token: "", localMode: false, unlocked: false },
    hooks: {},
    setConnection(patch) { Object.assign(Sync.connection, patch || {}); },
    isConnected() { return !!Sync.connection.url && !Sync.connection.localMode && Sync.connection.unlocked; },
    supports() { return false; },
    start() {}, stop() { w.log.push("sync.stop"); }, now() { return Promise.resolve(); },
    flush() { w.log.push("sync.flush"); return false; },
    setHooks(hooks) { Sync.hooks = hooks; }, subscribe() {}, boot() { return Promise.resolve(); },
    makeAction(type, payload, actor) { return { type, payload, actorId: actor.id }; },
    dispatch(action) {
      w.dispatched.push(action);
      return opts.dispatch ? opts.dispatch(action) : Promise.resolve({ ok: true, error: null });
    },
  };
  const UI = {
    local: { sheet: null, modal: null, quote: null },
    init() {}, force() {}, render() {}, refreshStatus() {},
    showUpdateBanner(fn) { w.banner = fn; },
    set(patch) { Object.assign(UI.local, patch || {}); },
    toast() {}, onboardingActive() { return false; }, closeOnboarding() {}, replayOnboarding() {},
  };
  if (opts.draftApi !== false) {
    UI.flushDrafts = () => { w.log.push("flush"); if (opts.flushThrows) { throw new Error("stockage refusé"); } };
    UI.clearDrafts = () => { w.log.push("clear"); if (opts.clearThrows) { throw new Error("stockage refusé"); } };
  }
  const Store = { view: null, base: null, queue: [], setBase(state) { Store.base = state; }, setQueue(q) { Store.queue = q; } };
  const DB = { clearQueue() { w.log.push("db.clearQueue"); return Promise.resolve(); }, clearState() { return Promise.resolve(); } };
  const waiting = { postMessage(m) { w.log.push("skip:" + m.type); } };
  const registration = { waiting, installing: null, addEventListener() {} };
  const sw = {
    controller: {}, handlers: {},
    register: () => Promise.resolve(registration),
    getRegistration: () => Promise.resolve(registration),
    addEventListener(type, fn) { sw.handlers[type] = fn; },
  };
  const on = (bucket) => (name, fn) => { (bucket[name] = bucket[name] || []).push(fn); };
  const sandbox = {
    Utils, Sync, UI, DB,
    Api: { getRevision() { return Promise.reject(new Error("réseau")); }, isAuthError: () => false, isNetworkError: () => true },
    window: {
      location: { hash: "#/", reload() { w.log.push("reload"); } },
      history: { state: null, pushState() {}, replaceState(state) { sandbox.window.history.state = state; }, go() {} },
      addEventListener: on(w.handlers.window),
    },
    document: { readyState: "complete", hidden: false, addEventListener: on(w.handlers.document) },
    navigator: { serviceWorker: sw },
    setInterval: () => 0, clearInterval() {}, console,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CONFIG_JS.code, ctx, { filename: CONFIG_JS.file });
  vm.runInContext(STATE_JS.code, ctx, { filename: STATE_JS.file });
  ctx.Store = Store;
  vm.runInContext(APP_JS.code, ctx, { filename: APP_JS.file });
  return Object.assign(w, { App: ctx.App, UI, Sync, sw, registration, waiting, document: sandbox.document, store });
}

check("BL-059 App.logout efface les brouillons, dès le début", async () => {
  const w = appWorld();
  await settle();
  w.log.length = 0;
  w.App.logout();
  assert(w.log.indexOf("clear") === 0, "UI.clearDrafts n'est pas le premier appel de la déconnexion : " + JSON.stringify(w.log));
  await settle();
});

check("REC-RUI-008 compteur de caractères : recalé sur le texte gardé après un rendu (pas « 0 / 150 » sous un champ plein)", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  t.ctx.UI.set({ modal: { type: "createTopic" } });
  const field = () => t.overlay().querySelector('[data-draft="newTopic:title"]');
  const counter = () => t.overlay().querySelector('[data-counter="newTopic:title"]');
  assert(field() && counter(), "contrôle sans objet : la fenêtre « Nouveau sujet » n'a pas son champ ou son compteur");
  t.type(field(), "Titre en cours");
  t.ctx.UI.force();                                   // des données arrivent : tout est reconstruit
  assert(field().value === "Titre en cours", "contrôle sans objet : le texte n'est pas gardé (« " + field().value + " »)");
  assert(counter().textContent === "14 / 150", "compteur après le rendu : « " + counter().textContent + " »");
});

check("REC-RUI-002 App.logout efface aussi le marqueur des nouveautés (condensat de l'identifiant publique) ; App.relock le garde", async () => {
  const SEEN = "brainsto.seenTopics.v1";
  const w = appWorld();
  await settle();
  w.store.set(SEEN, JSON.stringify({ v: 1, initialized: true, topics: { t1: { messages: 4, by: "1xprk0w", o: { messages: 3 } } } }));
  w.App.relock();                                     // reverrouillage d'inactivité : même personne après le code
  assert(w.store.has(SEEN), "App.relock a effacé le marqueur des nouveautés (même personne après le code)");
  w.App.logout();
  assert(!w.store.has(SEEN), "App.logout laisse le marqueur des nouveautés (de quoi désigner l'auteur d'un message anonyme) : " + w.store.get(SEEN));
  await settle();
});

check("REC-RUI-005 fenêtres « Modifier » (sujet, message, proposition, formulation) : fermées SEULEMENT si l'action est acceptée", async () => {
  const cases = [
    ["updateTopic", ["t1", "Titre", "Description"]],
    ["updateMessage", ["t1", "m1", "Texte"]],
    ["updateProposal", ["t1", "p1", "Titre", "Description"]],
    ["updateConclusion", ["t1", "c1", "Texte"]],
  ];
  const run = async (name, args, answer) => {
    const w = appWorld({ dispatch: () => Promise.resolve(answer) });
    await settle();
    w.UI.local.modal = { type: "editMessage", topicId: "t1" };
    w.App.actions[name].apply(null, args);
    await settle();
    return w.UI.local.modal;
  };
  for (const [name, args] of cases) {
    assert(await run(name, args, { ok: false, error: "Message verrouillé : quelqu'un y a déjà réagi." }) !== null, name + " : la fenêtre s'est fermée sur un refus, le texte rédigé est perdu");
    assert(await run(name, args, { ok: true, error: null }) === null, name + " : la fenêtre reste ouverte après une action acceptée");
    assert(await run(name, args, undefined) === null, name + " : résultat inconnu (ancien code en cache) : comportement d'avant, la fenêtre se ferme");
  }
});

check("BL-059 reverrouillage d'inactivité (App.relock) : les brouillons ne sont PAS effacés", async () => {
  const w = appWorld();
  await settle();
  w.log.length = 0;
  w.App.relock();
  assert(w.App.gate() === "lock", "contrôle sans objet : l'appareil n'est pas verrouillé (" + w.App.gate() + ")");
  assert(w.log.indexOf("clear") < 0, "App.relock a effacé les brouillons : " + JSON.stringify(w.log));
});

check("BL-059 pagehide et passage en arrière-plan : brouillons écrits tout de suite ; au retour, rien à écrire", async () => {
  const w = appWorld();
  await settle();
  w.log.length = 0;
  w.handlers.window.pagehide.forEach((fn) => fn());
  assert(w.log.indexOf("flush") >= 0, "pagehide n'écrit pas les brouillons : " + JSON.stringify(w.log));
  w.log.length = 0;
  w.document.hidden = true;
  w.handlers.document.visibilitychange.forEach((fn) => fn());
  assert(w.log.indexOf("flush") >= 0, "le passage en arrière-plan n'écrit pas les brouillons : " + JSON.stringify(w.log));
  w.log.length = 0;
  w.document.hidden = false;
  w.handlers.document.visibilitychange.forEach((fn) => fn());
  assert(w.log.indexOf("flush") < 0, "retour au premier plan : écriture inutile " + JSON.stringify(w.log));
});

check("BL-059 « Mettre à jour » : brouillons écrits AVANT SKIP_WAITING, avant le rechargement simple et avant celui du changement de worker", async () => {
  const w = appWorld();
  await settle();
  assert(typeof w.banner === "function", "contrôle sans objet : aucun bandeau de mise à jour");
  w.log.length = 0;
  w.banner();
  await settle();
  const flush = w.log.indexOf("flush");
  const skip = w.log.indexOf("skip:SKIP_WAITING");
  assert(flush >= 0 && skip >= 0 && flush < skip, "écriture avant SKIP_WAITING : " + JSON.stringify(w.log));
  w.log.length = 0;
  w.sw.handlers.controllerchange();
  assert(w.log.indexOf("flush") >= 0 && w.log.indexOf("flush") < w.log.indexOf("reload"), "écriture avant le rechargement du changement de worker : " + JSON.stringify(w.log));

  const v = appWorld();
  await settle();
  v.registration.waiting = null;
  v.log.length = 0;
  v.banner();
  await settle();
  assert(v.log.indexOf("flush") >= 0 && v.log.indexOf("flush") < v.log.indexOf("reload"), "écriture avant le rechargement simple : " + JSON.stringify(v.log));
});

check("BL-059 ancien js/ui.js (sans les fonctions de brouillon) ou stockage qui lève : aucune exception côté application", async () => {
  [{ draftApi: false }, { flushThrows: true, clearThrows: true }].forEach((opts) => {
    const w = appWorld(opts);
    w.handlers.window.pagehide.forEach((fn) => fn());
    w.document.hidden = true;
    w.handlers.document.visibilitychange.forEach((fn) => fn());
    w.document.hidden = false;
    w.App.logout();
  });
  const w = appWorld({ flushThrows: true });
  await settle();
  w.banner();
  await settle();
  assert(w.log.indexOf("skip:SKIP_WAITING") >= 0, "la mise à jour n'est pas partie malgré l'échec d'écriture : " + JSON.stringify(w.log));
  await settle();
});

check("BL-059 App.actions.createMessage rend le résultat de la publication (refus local compris) et retire la citation comme avant", async () => {
  const w = appWorld({ dispatch: () => Promise.resolve({ ok: false, error: "Ce sujet n'existe plus." }) });
  await settle();
  w.UI.local.quote = { topicId: "t1", messageId: "m1" };
  const out = w.App.actions.createMessage("t1", "texte", null, false);
  assert(out && typeof out.then === "function", "createMessage ne rend rien : l'interface ne peut pas savoir si la publication est refusée");
  const result = await out;
  assert(result && result.ok === false && result.error === "Ce sujet n'existe plus.", "résultat rendu : " + JSON.stringify(result));
  assert(w.dispatched.length === 1 && w.dispatched[0].type === "CREATE_MESSAGE", "action envoyée : " + JSON.stringify(w.dispatched));
  assert(w.UI.local.quote === null, "la citation n'est plus retirée comme avant");
});

/* ================================================================== Bilan === */

(async () => {
  for (const item of queue) {
    try { await item.fn(); passed += 1; } catch (error) { failures.push({ name: item.name, error }); }
  }
  if (failures.length) {
    failures.forEach((f) => console.error("ÉCHEC : " + f.name + "\n    " + String(f.error && f.error.message).split("\n").join("\n    ")));
    console.error(failures.length + " contrôle(s) en échec sur " + (passed + failures.length));
    process.exit(1);
  }
  console.log("drafts : " + passed + " contrôles OK");
})();
