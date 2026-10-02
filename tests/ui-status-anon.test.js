/* BrainstO. : non-régression du lot « Interface 1 » (pastille d'état, anonymat à
 * l'écran, textes visibles).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-status-anon.test.js
 *
 * Charge js/config.js, js/utils.js, js/state.js et js/ui.js dans un contexte vm,
 * sur un DOM minimal écrit ici (pas de jsdom). Store, Sync et App sont des
 * doublures : l'état de synchronisation et les données se pilotent à la main.
 *
 * Contrôles :
 *  - §12 : libellé long par code d'état, une seule région role=status par écran,
 *    annonces limitées aux transitions utiles (jamais les sondages) ;
 *  - §5 : ma bulle anonyme verrouillée est identique à la bulle anonyme d'un
 *    collègue (structure et texte accessible) ; la feuille de MON message
 *    anonyme ne propose pas de réaction ;
 *  - textes : « consensus » dans les noms accessibles et les toasts de js/ui.js,
 *    absence de données sur l'appareil, accords de l'avertissement de déconnexion.
 *
 * ⚠️ PORTÉE. Les titres visibles de l'écran Consensus sont réécrits à l'exécution
 * par js/product-ui.js (non chargé ici) : ce test ne vérifie que ce que js/ui.js
 * produit lui-même.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SOURCES = ["js/config.js", "js/utils.js", "js/state.js", "js/ui.js"].map((file) => ({
  file, code: fs.readFileSync(path.join(ROOT, file), "utf8"),
}));

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push({ name, error }); }
}

/* ------------------------------------------------------------ DOM minimal --- */

const HTML_NS = "http://www.w3.org/1999/xhtml";

function walk(node, fn) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 1) { fn(child); walk(child, fn); }
  });
}

/* Découpe « #app .status-pill » en composés, sans couper dans [attr="a b"]. */
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
    if (rest[0] === ":") { return false; }   // pseudo-classes : hors du DOM de test
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
  /* `textWrites` compte les écritures : une région d'annonce réécrite, même à
   * l'identique, peut être relue par un lecteur d'écran. */
  set textContent(value) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    this.textWrites = (this.textWrites || 0) + 1;
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
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) { this.ownerDocument.activeElement = this.ownerDocument.body; } }
  click() {
    if (this.disabled) { return; }
    this.dispatchEvent({ type: "click", target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
  }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  scrollIntoView() {}
  setSelectionRange() {}
}

class FakeDocument extends FakeNode {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.documentElement = this.appendChild(this.createElement("html"));
    this.head = this.documentElement.appendChild(this.createElement("head"));
    this.body = this.documentElement.appendChild(this.createElement("body"));
    this.activeElement = this.body;
    this.visibilityState = "visible";
    this.hidden = false;
    this.title = "";
  }
  createElement(tag) { return new FakeElement(this, tag); }
  createElementNS(ns, tag) { return new FakeElement(this, tag, ns); }
  createTextNode(text) { return new FakeText(this, text); }
  createDocumentFragment() { const f = new FakeElement(this, "fragment"); f.isFragment = true; return f; }
  getElementById(id) { return this.querySelector("#" + id); }
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

/* Doublure tolérante : une méthode non décrite répond « rien » au lieu de lever. */
function lenient(target) {
  return new Proxy(target, {
    get(t, k) { return k in t ? t[k] : (typeof k === "string" ? function () { return undefined; } : undefined); },
  });
}

/* ------------------------------------------------------------- Données --- */

const ME = "p-alice";
const BOB = "p-bruno";
const T0 = "2026-10-01T08:00:00.000Z";

function message(id, extra) {
  return Object.assign({
    id, text: "Même texte", authorId: "", authorName: "Anonyme", anon: true,
    quoteId: null, reactions: {}, createdAt: T0, updatedAt: T0,
  }, extra);
}

function topic(id, messages, extra) {
  return Object.assign({
    id, title: "Sujet " + id, description: "", status: "open", anon: false,
    createdBy: { id: BOB, name: "Bruno" }, createdAt: T0, updatedAt: T0,
    messages, proposals: [], conclusions: [], conclusionVotes: {},
  }, extra);
}

const IDLE = { code: "idle", label: "À jour", pending: 0 };
const SYNCING = { code: "syncing", label: "Sync…", pending: 0 };

/* ----------------------------------------------------------- Démarrage --- */

function boot(options) {
  options = options || {};
  const document = new FakeDocument();
  ["app", "overlay-root", "toast-root", "onboarding-root"].forEach((id) => {
    const node = document.createElement("div");
    node.setAttribute("id", id);
    document.body.appendChild(node);
  });
  const sandbox = {
    console, document, Node: FakeNode, Element: FakeElement, HTMLElement: FakeElement,
    navigator: { onLine: true, userAgent: "node-test", language: "fr-FR" },
    location: { hash: "#/", href: "http://localhost/", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "" },
    history: { state: null, length: 1, pushState() {}, replaceState() {}, back() {} },
    localStorage: storage(), sessionStorage: storage(),
    /* Minuteries muettes : rien ne doit tourner après la fin du test. */
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    innerWidth: 390, innerHeight: 800, pageYOffset: 0, scrollTo() {}, print() {},
    addEventListener() {}, removeEventListener() {},
    crypto: require("crypto").webcrypto, TextEncoder,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  SOURCES.forEach((s) => vm.runInContext(s.code, ctx, { filename: s.file }));

  const R = ctx.Core.REACTIONS;
  const raw = {
    revision: 12,
    participants: [{ id: ME, name: "Alice" }, { id: BOB, name: "Bruno" }],
    topics: [
      /* m1 : MON message anonyme (preuve locale), verrouillé par la réaction de Bruno. */
      topic("t1", [message("m1", { reactions: { [BOB]: R[0] } })]),
      /* m2 : l'anonyme d'un collègue, même texte, même heure, même réaction. */
      topic("t2", [message("m2", { reactions: { [BOB]: R[0] } })]),
      /* m3 : mon message SIGNÉ, verrouillé ; deux formulations de consensus, dont une à moi. */
      topic("t3", [message("m3", { anon: false, authorId: ME, authorName: "Alice", reactions: { [BOB]: R[0] } })], {
        conclusions: [
          { id: "c1", text: "Cap A", authorId: ME, authorName: "Alice", createdAt: T0, updatedAt: T0, source: "manual" },
          { id: "c2", text: "Cap B", authorId: BOB, authorName: "Bruno", createdAt: T0, updatedAt: T0, source: "manual" },
        ],
      }),
    ],
  };
  const shaped = ctx.Core.ensureShape(options.empty ? { revision: 0, participants: [], topics: [] } : raw);
  const owned = new Set(["m1"]);

  const st = { status: Object.assign({ error: null, lastSyncAt: T0, revision: options.empty ? 0 : 12 }, IDLE), pending: [] };
  ctx.Sync = lenient({
    connection: { url: "https://exemple.invalid/exec", token: "", localMode: false, unlocked: true },
    status: () => Object.assign({}, st.status),
    diagnostics: () => ({
      revision: st.status.revision, updatedAt: null, lastSyncAt: st.status.lastSyncAt, lastFlushAt: null,
      intervalMs: 6000, failures: 0, pending: st.pending, persistent: true, durability: "durable",
      status: Object.assign({}, st.status),
    }),
  });
  ctx.Store = lenient({ view: shaped, base: shaped, version: 1, queue: [], pendingMessageIds: () => ({}) });
  ctx.App = lenient({
    user: { id: ME, name: "Alice" },
    route: { name: "topics", raw: "#/" },
    gate: () => null,
    ownsMessage: (m) => owned.has(m.id) || (!m.anon && m.authorId === ME),
    ownsItem: (id, authorId) => owned.has(id) || authorId === ME,
    onboardingWanted: () => false,
    onboardingState: () => "vue",
    connectionConfigured: () => true,
    actions: lenient({}),
  });
  ctx.UI.init();

  return {
    ctx, doc: document, st,
    app: () => document.getElementById("app"),
    overlay: () => document.getElementById("overlay-root"),
    toasts: () => document.getElementById("toast-root"),
    go(route) { ctx.App.route = route; ctx.UI.force(); },
    status(s) { st.status = Object.assign({ error: null, lastSyncAt: st.status.lastSyncAt, revision: st.status.revision }, s); ctx.UI.refreshStatus(); },
    set(patch) { ctx.UI.set(patch); },
  };
}

const TOPICS = { name: "topics", raw: "#/" };
const topicRoute = (id) => ({ name: "topic", topicId: id, raw: "#/topic/" + id });
const conclusionRoute = (id) => ({ name: "conclusion", topicId: id, raw: "#/topic/" + id + "/conclusion" });
const SETTINGS = { name: "settings", raw: "#/settings" };
const SYSTEM = { name: "system", raw: "#/settings/system" };

function accessibleText(node) {
  if (node.nodeType === 3) { return node.data; }
  if (node.namespaceURI !== HTML_NS || node.getAttribute("aria-hidden") === "true") { return ""; }
  return node.childNodes.map(accessibleText).join("");
}

function serialize(node, depth) {
  depth = depth || 0;
  const pad = "  ".repeat(depth);
  if (node.nodeType === 3) { return pad + "#text " + JSON.stringify(node.data); }
  const attrs = [...node.attrs.entries()].filter(([k]) => k !== "data-message-id").sort()
    .map(([k, v]) => k + "=" + JSON.stringify(v)).join(" ");
  return [pad + "<" + node.localName + (attrs ? " " + attrs : "") + ">"]
    .concat(node.childNodes.map((c) => serialize(c, depth + 1))).join("\n");
}

function firstDifference(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) { return "ligne " + (i + 1) + " : « " + (la[i] || "") + " » ≠ « " + (lb[i] || "") + " »"; }
  }
  return "";
}

function rowOf(t, messageId) {
  const bubble = t.app().querySelector('.bubble[data-message-id="' + messageId + '"]');
  assert(bubble, "bulle " + messageId + " absente");
  return bubble.closest(".msg-row") || bubble.parentNode;
}

/* Textes, noms accessibles, info-bulles et indications qui disent « conclusion ». */
function conclusionLeaks(root, withText) {
  const found = [];
  if (withText) {
    (function texts(node) {
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3 && /conclusion/i.test(c.data)) { found.push(c.data); }
        if (c.nodeType === 1) { texts(c); }
      });
    })(root);
  }
  walk(root, (n) => {
    ["aria-label", "title", "placeholder"].forEach((a) => {
      const v = n.getAttribute(a);
      if (v && /conclusion/i.test(v)) { found.push("[" + a + "] " + v); }
    });
  });
  return found;
}

/* ============================================================ BL-008 ==== */

check("BL-008 libellé long de §12 pour chaque code d'état, libellé court intact, visibles en aria-hidden", () => {
  const t = boot();
  t.go(TOPICS);
  const cases = [
    [IDLE, "À jour"],
    [SYNCING, "Synchronisation"],
    [{ code: "pending", label: "En attente (2)", pending: 2 }, "En attente (2)"],
    [{ code: "offline", label: "Hors ligne", pending: 0 }, "Hors ligne"],
    [{ code: "offline", label: "Hors ligne (3)", pending: 3 }, "Hors ligne (3)"],
    [{ code: "error", label: "Erreur", pending: 0 }, "Erreur"],
    [{ code: "error", label: "Erreur (2)", pending: 2 }, "Erreur (2)"],
    [{ code: "local", label: "Local", pending: 0 }, "Mode local"],
  ];
  cases.forEach(([s, long]) => {
    t.status(s);
    const pill = t.app().querySelector(".status-pill");
    assert(pill && pill.classes().has("status-" + s.code), "pastille absente ou sans la classe status-" + s.code);
    const longNode = pill.querySelector(".status-long");
    assert(longNode && longNode.textContent === long,
      "code " + s.code + " : libellé long « " + (longNode && longNode.textContent) + " », attendu « " + long + " »");
    assert(longNode.classes().has("status-label"), "le libellé long doit garder la classe .status-label (sélecteur des recettes)");
    const shortNode = pill.querySelector(".status-short");
    assert(shortNode && shortNode.textContent === s.label, "code " + s.code + " : libellé court attendu « " + s.label + " »");
    [".status-dot", ".status-short", ".status-long"].forEach((sel) => {
      assert(pill.querySelector(sel).getAttribute("aria-hidden") === "true", sel + " doit être aria-hidden");
    });
    assert(pill.querySelector(".status-announce.visually-hidden"), "région d'annonce masquée visuellement absente");
  });
  t.go(TOPICS);   // une pastille NEUVE porte directement le libellé long
  assert(t.app().querySelector(".status-long").textContent === "Mode local", "pastille recréée sans le libellé long");
});

check("BL-008 une seule région role=status par écran, Réglages et Système compris", () => {
  const t = boot();
  [TOPICS, topicRoute("t1"), conclusionRoute("t3"), SETTINGS, SYSTEM].forEach((route) => {
    t.go(route);
    const regions = t.doc.querySelectorAll("[role=status]");
    assert(regions.length === 1, route.raw + " : " + regions.length + " régions role=status");
    assert(t.doc.querySelectorAll(".status-announce").length === 1, route.raw + " : une seule région d'annonce attendue");
  });
  /* Système garde ses deux pastilles (barre de titre, carte Synchronisation) ; Réglages n'en a plus qu'une. */
  assert(t.app().querySelectorAll(".status-pill").length === 2, "Système doit garder ses deux pastilles");
  t.go(SETTINGS);
  assert(t.app().querySelectorAll(".status-pill").length === 1, "Réglages : une seule pastille, dans la barre de titre");
});

check("BL-008 la région n'annonce que les transitions utiles, jamais les sondages À jour / Synchronisation", () => {
  const t = boot();
  t.status(IDLE);
  t.go(TOPICS);
  const node = t.app().querySelector(".status-announce");
  assert(node && node.textContent === "À jour", "annonce initiale « " + (node && node.textContent) + " »");
  const writes = node.textWrites || 0;
  for (let i = 0; i < 11; i++) { t.status(SYNCING); t.status(IDLE); }
  assert(t.app().querySelector(".status-announce") === node, "la région a été recréée par un simple rafraîchissement");
  assert(node.textContent === "À jour" && (node.textWrites || 0) === writes,
    "22 changements de sondage ont touché la région (" + ((node.textWrites || 0) - writes) + " écritures)");
  const steps = [
    [{ code: "offline", label: "Hors ligne (1)", pending: 1 }, "Hors ligne (1)"],
    [IDLE, "À jour"],
    [{ code: "pending", label: "En attente (2)", pending: 2 }, "En attente (2)"],
    [SYNCING, "En attente (2)"],
    [{ code: "pending", label: "En attente (1)", pending: 1 }, "En attente (1)"],
    [IDLE, "À jour"],
    [SYNCING, "À jour"],
    [{ code: "error", label: "Erreur (1)", pending: 1 }, "Erreur (1)"],
    [SYNCING, "Erreur (1)"],
    [{ code: "error", label: "Erreur (1)", pending: 1 }, "Erreur (1)"],
    [IDLE, "À jour"],
    [{ code: "local", label: "Local", pending: 0 }, "Mode local"],
    [IDLE, "À jour"],
  ];
  steps.forEach(([s, want], i) => {
    t.status(s);
    assert(node.textContent === want, "étape " + (i + 1) + " (" + s.code + ") : annonce « " + node.textContent + " », attendu « " + want + " »");
  });
  t.status(SYNCING);
  t.go(TOPICS);   // re-rendu complet pendant un sondage : l'annonce reste celle du dernier état utile
  const again = t.app().querySelector(".status-announce");
  assert(again.textContent === "À jour", "après re-rendu pendant un sondage : « " + again.textContent + " »");
  assert(t.app().querySelector(".status-long").textContent === "Synchronisation", "le libellé visible suit, lui, l'état réel");
});

check("BL-008 premier rendu pendant une synchronisation : une seule bascule vers « À jour », puis silence", () => {
  const t = boot();
  t.status(SYNCING);
  t.go(TOPICS);
  const node = t.app().querySelector(".status-announce");
  assert(node && node.textContent === "Synchronisation", "annonce initiale « " + (node && node.textContent) + " »");
  t.status(IDLE);
  assert(node.textContent === "À jour", "la fin de la première synchronisation doit être dite");
  const writes = node.textWrites || 0;
  for (let i = 0; i < 5; i++) { t.status(SYNCING); t.status(IDLE); }
  assert((node.textWrites || 0) === writes, "les sondages suivants ne doivent plus rien annoncer");
});

/* ============================================================ BL-013 ==== */

check("BL-013 ma bulle anonyme verrouillée est identique à la bulle anonyme d'un collègue", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const mine = rowOf(t, "m1");
  t.go(topicRoute("t2"));
  const other = rowOf(t, "m2");
  const a = serialize(mine);
  const b = serialize(other);
  assert(a === b, "structures différentes, " + firstDifference(a, b));
  const ta = accessibleText(mine.querySelector(".bubble"));
  const tb = accessibleText(other.querySelector(".bubble"));
  assert(ta === tb, "textes accessibles différents : « " + ta + " » ≠ « " + tb + " »");
  assert(!/verrouill/i.test(ta), "le nom accessible de ma bulle anonyme dit « verrouillé »");
  assert(mine.querySelectorAll(".bubble-meta svg").length === 0, "cadenas dans la bulle de mon message anonyme");
});

check("BL-013 un message SIGNÉ verrouillé garde son cadenas et sa mention", () => {
  const t = boot();
  t.go(topicRoute("t3"));
  const row = rowOf(t, "m3");
  assert(row.querySelectorAll(".bubble-meta svg").length === 1, "le cadenas du message signé a disparu");
  assert(/verrouillé/.test(accessibleText(row.querySelector(".bubble"))), "la mention « verrouillé » du message signé a disparu");
});

/* ============================================================ BL-019 ==== */

check("BL-019 la feuille de MON message anonyme ne propose aucune réaction ; « Modifier » désactivé avec sa raison", () => {
  const t = boot();
  /* Réactions PROPOSÉES : toutes sauf « Je m'engage » (💪), retirée de l'interface mais gardée dans le modèle. */
  const R = t.ctx.Core.REACTIONS.filter((e) => e !== "💪");
  t.go(topicRoute("t1"));
  t.set({ sheet: { type: "message", topicId: "t1", messageId: "m1" } });
  assert(t.overlay().querySelector(".sheet"), "feuille du message non rendue");
  assert(t.overlay().querySelectorAll(".emoji-btn").length === 0,
    t.overlay().querySelectorAll(".emoji-btn").length + " réactions proposées sur mon propre message anonyme");
  const labels = t.overlay().querySelectorAll(".sheet-actions button").map((b) => b.textContent);
  assert(labels.includes("Signer avec mon nom"), "la signature doit rester possible : " + JSON.stringify(labels));
  const edit = t.overlay().querySelectorAll(".sheet-actions button").find((b) => /^Modifier/.test(b.textContent));
  assert(edit, "« Modifier » absent : " + JSON.stringify(labels));
  assert(edit.disabled, "« Modifier » doit être désactivé sur un message verrouillé");
  assert(/réagi/.test(edit.textContent), "raison du verrou illisible : « " + edit.textContent + " »");
  t.set({ sheet: { type: "message", topicId: "t2", messageId: "m2" } });
  assert(t.overlay().querySelectorAll(".emoji-btn").length === R.length, "l'anonyme d'un collègue doit garder ses " + R.length + " réactions");
  t.set({ sheet: { type: "message", topicId: "t3", messageId: "m3" } });
  assert(t.overlay().querySelectorAll(".emoji-btn").length === R.length, "mon message signé doit garder ses " + R.length + " réactions");
});

/* ===================================== Lever l'anonymat se confirme ==== */

check("« Signer avec mon nom » se confirme AVANT l'envoi ; « Rendre anonyme » part tout de suite et le dit", () => {
  const t = boot();
  const sent = [];
  t.ctx.App.actions.setMessageSignature = (topicId, messageId, anon) => { sent.push(messageId + ":" + (anon ? "anonyme" : "signé")); };
  const actionBtn = (label) => t.overlay().querySelectorAll("button").find((b) => b.textContent === label);
  t.go(topicRoute("t1"));
  t.set({ sheet: { type: "message", topicId: "t1", messageId: "m1" } });
  actionBtn("Signer avec mon nom").click();
  assert(sent.length === 0, "le nom est parti sans confirmation : " + JSON.stringify(sent));
  const dlg = t.overlay().querySelector(".modal");
  assert(dlg && /pour toute l'équipe/.test(dlg.textContent), "fenêtre de confirmation absente ou muette sur l'effet");
  actionBtn("Annuler").click();
  assert(sent.length === 0 && !t.overlay().querySelector(".modal"), "Annuler a envoyé ou laissé la fenêtre");
  t.set({ sheet: { type: "message", topicId: "t1", messageId: "m1" } });
  actionBtn("Signer avec mon nom").click();
  actionBtn("Signer").click();
  assert(JSON.stringify(sent) === '["m1:signé"]', "après confirmation : " + JSON.stringify(sent));

  t.go(topicRoute("t3"));
  t.set({ sheet: { type: "message", topicId: "t3", messageId: "m3" } });
  actionBtn("Rendre anonyme").click();
  assert(sent[1] === "m3:anonyme" && !t.overlay().querySelector(".modal"), "« Rendre anonyme » doit partir sans fenêtre : " + JSON.stringify(sent));
  const toasts = t.toasts().querySelectorAll(".toast").map((n) => n.textContent);
  assert(toasts.includes("Message rendu anonyme."), "aucun retour après « Rendre anonyme » : " + JSON.stringify(toasts));
});

/* ============================================================ BL-029 ==== */

check("BL-029 accueil, cartes, noms accessibles et toasts du consensus : jamais « conclusion »", () => {
  const t = boot();
  t.go(TOPICS);
  let leaks = conclusionLeaks(t.app(), true);
  assert(!leaks.length, "accueil : " + JSON.stringify(leaks));
  const chip = t.app().querySelectorAll(".legend-chip").find((n) => /formulation/.test(n.getAttribute("title") || ""));
  assert(chip && chip.getAttribute("title") === "2 formulations", "info-bulle du compteur de consensus : « " + (chip && chip.getAttribute("title")) + " »");

  t.go(conclusionRoute("t3"));
  /* Le placeholder « Nouvelle conclusion… » est un texte VISIBLE que product-ui.js
   * réécrit (et retrouve par ce texte exact) : hors de ce test, comme les titres. */
  leaks = conclusionLeaks(t.app(), false).filter((x) => x.indexOf("[placeholder]") !== 0);
  assert(!leaks.length, "écran Consensus (noms accessibles) : " + JSON.stringify(leaks));
  const names = t.app().querySelectorAll("button").map((b) => b.getAttribute("aria-label")).filter(Boolean);
  assert(names.includes("Modifier la formulation du consensus") && names.includes("Supprimer la formulation du consensus"),
    "noms accessibles : " + JSON.stringify(names));
  const add = t.app().querySelectorAll("button").find((b) => b.textContent === "Ajouter");
  assert(add, "bouton « Ajouter » introuvable");
  add.click();
  t.set({ modal: { type: "editConclusion", topicId: "t3", conclusionId: "c1" } });
  const area = t.overlay().querySelector("textarea");
  area.value = "";
  t.overlay().querySelectorAll("button").find((b) => b.textContent === "Enregistrer").click();
  const toasts = t.toasts().querySelectorAll(".toast").map((n) => n.textContent);
  assert(toasts.length === 2 && toasts.every((x) => x === "La formulation du consensus est vide."), "toasts : " + JSON.stringify(toasts));

  const e = boot({ empty: true });
  e.go(TOPICS);
  leaks = conclusionLeaks(e.app(), true);
  assert(!leaks.length, "accueil vide : " + JSON.stringify(leaks));
  assert(/consensus/.test(e.app().textContent), "l'état vide de l'accueil doit parler de consensus");
});

/* ============================================================ BL-030 ==== */

check("BL-030 révision 0, jamais synchronisé, mode connecté : « Pas encore de données sur cet appareil »", () => {
  const t = boot({ empty: true });
  t.status({ code: "offline", label: "Hors ligne", pending: 0, revision: 0, lastSyncAt: null });
  t.go(TOPICS);
  const empty = t.app().querySelector(".empty");
  assert(empty, "état vide absent");
  const text = empty.textContent;
  const title = empty.querySelector(".empty-title");
  assert(title && title.textContent === "Pas encore de données sur cet appareil" && text.includes("Elles s'afficheront à la prochaine connexion."),
    "texte affiché : « " + text + " »");
  assert(!/Aucun sujet pour l'instant/.test(text) && !empty.querySelector("button"), "l'invitation à créer un premier sujet est fausse ici");

  t.status({ code: "idle", label: "À jour", pending: 0, revision: 0, lastSyncAt: T0 });
  t.go(TOPICS);   // équipe réellement vide, confirmée par le serveur
  assert(/Aucun sujet pour l'instant/.test(t.app().querySelector(".empty").textContent), "équipe vide confirmée : texte d'origine attendu");

  t.ctx.Sync.connection.localMode = true;
  t.status({ code: "local", label: "Local", pending: 0, revision: 0, lastSyncAt: null });
  t.go(TOPICS);   // mode local : rien à recevoir
  assert(/Aucun sujet pour l'instant/.test(t.app().querySelector(".empty").textContent), "mode local : texte d'origine attendu");
});

/* ============================================================ BL-031 ==== */

check("BL-031 avertissement de déconnexion accordé au singulier et au pluriel", () => {
  const t = boot();
  t.go(SYSTEM)   // la déconnexion vit au niveau Système;
  t.st.pending = [{ type: "ADD_MESSAGE" }];
  t.set({ modal: { type: "logout" } });
  let text = t.overlay().textContent;
  assert(text.includes("1 action attend d'être envoyée et sera perdue."), "singulier : « " + text + " »");
  t.set({ modal: null });
  t.st.pending = [{ type: "ADD_MESSAGE" }, { type: "SET_VOTE" }, { type: "ADD_TOPIC" }];
  t.set({ modal: { type: "logout" } });
  text = t.overlay().textContent;
  assert(text.includes("3 actions attendent d'être envoyées et seront perdues."), "pluriel : « " + text + " »");
  assert(!/serant/.test(text), "« serant » : faute d'accord");
});

/* ------------------------------------------------------------- Bilan --- */

if (failures.length) {
  failures.forEach(({ name, error }) => {
    console.error("ÉCHEC " + name + "\n      " + (error && error.message ? error.message : error));
  });
  console.error(failures.length + " échec(s), " + passed + " contrôle(s) réussi(s)");
  process.exit(1);
}
console.log("ui-status-anon : " + passed + " contrôles OK");
