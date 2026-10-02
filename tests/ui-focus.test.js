/* BrainstO. : non-régression du lot « Interface 2 » (gestion du focus).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-focus.test.js
 *
 * Charge js/config.js, js/utils.js, js/state.js, js/product-view.js et js/ui.js
 * dans un contexte vm, sur un DOM minimal écrit ici (pas de jsdom), même modèle
 * que tests/ui-status-anon.test.js. Store, Sync et App sont des doublures ; les
 * actions modifient les données puis rendent, comme le fait le vrai dispatch.
 *
 * Le DOM de test imite ce qui compte pour le focus : un élément retiré du
 * document perd le focus (activeElement revient à <body>), un nœud non
 * focalisable (div sans tabindex), désactivé ou sous un ancêtre `inert` refuse
 * focus().
 *
 * Contrôles :
 *  - re-rendu (vote, retrait de vote, réaction, message reçu) : le focus revient
 *    sur l'élément équivalent (même data-key), sans jamais déranger une saisie ;
 *  - interrupteur Anonyme : le focus reste sur la commande, l'état est exposé (aria-checked) sous un libellé stable ;
 *    le nom affiché change, l'animation n'est posée que par le geste ; la zone d'écriture porte ses propres repères ;
 *  - feuilles et fenêtres : focus dans le calque à l'ouverture, fond inerte (ou
 *    aria-hidden sans `inert`), classe has-layer, Tab confiné ; à la fermeture
 *    (Fermer, Échap, fond), focus rendu au déclencheur et fond rétabli ;
 *  - pastille secondaire des Réglages lisible au lecteur d'écran.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SOURCES = ["js/config.js", "js/utils.js", "js/state.js", "js/product-view.js", "js/ui.js"].map((file) => ({
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

function message(id, text, reactions) {
  return {
    id, text, authorId: BOB, authorName: "Bruno", anon: false,
    quoteId: null, reactions: reactions || {}, createdAt: T0, updatedAt: T0,
  };
}

const TOPICS = { name: "topics", raw: "#/" };
const SETTINGS = { name: "settings", raw: "#/settings" };
const topicRoute = (id) => ({ name: "topic", topicId: id, raw: "#/topic/" + id });
const proposalsRoute = (id) => ({ name: "proposals", topicId: id, raw: "#/topic/" + id + "/proposals" });

/* ----------------------------------------------------------- Démarrage --- */

function boot(options) {
  options = options || {};
  const Element = options.noInert ? FakeElement : InertElement;
  const document = new FakeDocument(Element);
  ["app", "overlay-root", "onboarding-root", "toast-root"].forEach((id) => {
    const node = document.createElement("div");
    node.setAttribute("id", id);
    document.body.appendChild(node);
  });
  const sandbox = {
    console, document, Node: FakeNode, Element, HTMLElement: Element,
    navigator: { onLine: true, userAgent: "node-test", language: "fr-FR" },
    location: { hash: "#/", href: "http://localhost/", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "" },
    history: { state: null, length: 1, pushState() {}, replaceState() {}, back() {} },
    localStorage: storage(), sessionStorage: storage(),
    /* Minuteries muettes par défaut ; `timers` les retient pour qu'un test les déclenche (appui long). */
    setTimeout: options.timers ? (fn, ms) => { options.timers.push({ fn, ms, live: true }); return options.timers.length; } : () => 0,
    clearTimeout: options.timers ? (id) => { if (options.timers[id - 1]) { options.timers[id - 1].live = false; } } : () => {},
    setInterval: () => 0, clearInterval() {},
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
    revision: 3,
    participants: [{ id: ME, name: "Alice" }, { id: BOB, name: "Bruno" }],
    topics: [{
      id: "t1", title: "Livraisons du matin", description: "", status: "open", anon: false,
      createdBy: { id: BOB, name: "Bruno" }, createdAt: T0, updatedAt: T0,
      messages: [
        message("m1", "Premier", { [BOB]: R[0] }),
        /* m2 : ma seule réaction ; m3 : la même réaction, d'un autre, plus bas. */
        message("m2", "Deuxième", { [ME]: R[1] }),
        message("m3", "Troisième", { [BOB]: R[1] }),
      ],
      proposals: [{
        id: "p1", title: "Décaler la tournée", description: "", authorId: BOB, authorName: "Bruno",
        status: ctx.Core.PROPOSAL_STATUSES[0], votes: {}, createdAt: T0, updatedAt: T0,
      }],
      conclusions: [], conclusionVotes: {},
    }],
  };
  const view = ctx.Core.ensureShape(raw);
  const topic = () => ctx.Core.findTopic(view, "t1");
  const bump = () => { ctx.Store.version += 1; ctx.UI.render(); };

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
    route: TOPICS,
    gate: () => null,
    ownsMessage: (m) => !m.anon && m.authorId === ME,
    ownsItem: (id, authorId) => authorId === ME,
    onboardingWanted: () => false,
    onboardingState: () => "vue",
    connectionConfigured: () => true,
    actions: lenient({
      setVote(topicId, proposalId, value) { topic().proposals[0].votes[ME] = value; bump(); },
      removeVote() { delete topic().proposals[0].votes[ME]; bump(); },
      setReaction(topicId, messageId, emoji) {
        const m = ctx.Core.findMessage(topic(), messageId);
        if (m.reactions[ME] === emoji) { delete m.reactions[ME]; } else { m.reactions[ME] = emoji; }
        bump();
      },
    }),
  });
  ctx.UI.init();

  return {
    ctx, doc: document, R,
    app: () => document.getElementById("app"),
    overlay: () => document.getElementById("overlay-root"),
    toasts: () => document.getElementById("toast-root"),
    active: () => document.activeElement,
    go(route) { ctx.App.route = route; ctx.UI.force(); },
    /* Message reçu d'un collègue : nouvelles données, rendu complet. */
    receive(text) {
      topic().messages.push(message("r" + topic().messages.length, text));
      bump();
    },
    /* Ce que fait js/app.js sur Échap, et le geste retour du système. */
    escape() { ctx.UI.set({ sheet: null, modal: null }); },
  };
}

function describe(node) {
  if (!node) { return "rien"; }
  if (node.localName === "body") { return "<body>"; }
  return "<" + node.localName + (node.className ? "." + node.className.replace(/\s+/g, ".") : "") +
    (node.getAttribute("data-key") ? " data-key=" + node.getAttribute("data-key") : "") +
    (node.getAttribute("data-message-id") ? " data-message-id=" + node.getAttribute("data-message-id") : "") + ">";
}

function bubble(t, id) { return t.app().querySelector('.bubble[data-message-id="' + id + '"]'); }
function rowOf(t, id) { return bubble(t, id).closest(".msg-row"); }
function dialog(t) { return t.overlay().querySelector('[role="dialog"]'); }
function byText(root, selector, text) {
  return root.querySelectorAll(selector).find((n) => n.textContent.trim() === text) || null;
}

function assertBackgroundOpen(t) {
  assert(t.app().hasAttribute("inert"), "#app n'est pas inerte sous le calque");
  assert(t.doc.documentElement.classList.contains("has-layer"), "<html> n'a pas la classe has-layer");
  assert(!t.toasts().hasAttribute("inert") && !t.overlay().hasAttribute("inert"),
    "les toasts et le calque lui-même ne doivent pas être inertes");
}

function assertBackgroundClosed(t) {
  assert(!t.app().hasAttribute("inert"), "#app reste inerte après la fermeture");
  assert(!t.doc.documentElement.classList.contains("has-layer"), "<html> garde la classe has-layer");
}

/* ============================================================ BL-012 ==== */

check("BL-012 après un vote, le focus revient sur le même bouton (même data-key)", () => {
  const t = boot();
  t.go(proposalsRoute("t1"));
  const before = t.app().querySelector('[data-key="vote-p1-for"]');
  assert(before, "bouton de vote « Pour » sans clé data-key=vote-p1-for");
  before.focus();
  before.click();
  const now = t.active();
  assert(now !== before, "le vote n'a pas re-rendu l'écran : contrôle sans objet");
  assert(now.getAttribute("data-key") === "vote-p1-for", "focus après le vote sur " + describe(now));
  assert(now.getAttribute("aria-pressed") === "true", "le bouton focalisé n'est pas le bouton rendu après le vote");
  assert(t.doc.lastFocusOptions && t.doc.lastFocusOptions.preventScroll === true, "restitution sans preventScroll : la page sauterait");
});

check("BL-012 « Retirer mon vote » disparaît : le focus va au dernier bouton de vote de la même proposition", () => {
  const t = boot();
  t.go(proposalsRoute("t1"));
  t.app().querySelector('[data-key="vote-p1-against"]').click();
  const remove = t.app().querySelector('[data-key="vote-p1-remove"]');
  assert(remove, "bouton « Retirer mon vote » sans clé");
  remove.focus();
  remove.click();
  assert(!t.app().querySelector('[data-key="vote-p1-remove"]'), "le retrait n'a pas eu lieu");
  assert(t.active().getAttribute("data-key") === "vote-p1-abstain", "focus après le retrait sur " + describe(t.active()));
});

check("BL-012 message reçu : le focus posé sur une bulle y reste", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const before = bubble(t, "m1");
  before.focus();
  t.receive("Un collègue répond");
  const now = t.active();
  assert(now !== before, "aucun re-rendu : contrôle sans objet");
  assert(now === bubble(t, "m1"), "focus après réception sur " + describe(now));
});

check("BL-012 réaction : gardée, le focus reste sur elle ; retirée, il va à SA bulle (jamais à la même réaction plus bas)", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const keep = rowOf(t, "m1").querySelector('[data-key="reaction-' + t.R[0] + '"]');
  assert(keep, "réaction sans clé data-key");
  keep.focus();
  keep.click();
  let now = t.active();
  assert(now.getAttribute("data-key") === "reaction-" + t.R[0] && rowOf(t, "m1").contains(now),
    "réaction ajoutée : focus sur " + describe(now));
  assert(now.getAttribute("aria-pressed") === "true", "le bouton focalisé n'est pas la réaction mise à jour");

  const gone = rowOf(t, "m2").querySelector('[data-key="reaction-' + t.R[1] + '"]');
  gone.focus();
  gone.click();
  now = t.active();
  assert(!rowOf(t, "m2").querySelector(".reaction"), "la réaction n'a pas été retirée");
  assert(now === bubble(t, "m2"), "réaction retirée : focus sur " + describe(now) + " (attendu : la bulle m2)");
});

check("BL-012 une saisie en cours n'est jamais dérangée par un rendu", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const field = t.app().querySelector('[data-draft="composer:t1"]');
  field.focus();
  field.value = "Je propose que";
  t.receive("Message reçu pendant la frappe");
  const now = t.active();
  assert(now.getAttribute("data-draft") === "composer:t1", "le focus a quitté le champ en cours de saisie : " + describe(now));
  assert(now.value === "Je propose que", "la saisie a été perdue");
});

/* ============================================================ BL-010 ==== */

check("BL-010 interrupteur Anonyme : le focus reste sur la commande, l'état courant est exposé (aria-checked) et son libellé ne change pas", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const toggle = t.app().querySelector('[data-key="composer-anon"]');
  assert(toggle, "interrupteur sans clé data-key=composer-anon");
  assert(toggle.getAttribute("role") === "switch" && toggle.getAttribute("aria-checked") === "false",
    "un vrai interrupteur est attendu, éteint au départ : role=" + toggle.getAttribute("role") + ", aria-checked=" + toggle.getAttribute("aria-checked"));
  const label = toggle.querySelector(".sig-label").textContent;
  assert(label === "Publier en anonyme", "libellé de l'interrupteur : « " + label + " »");
  toggle.focus();
  toggle.click();
  let now = t.active();
  assert(t.ctx.UI.local.composerAnon === true, "la bascule n'a pas basculé");
  assert(now !== toggle && now.getAttribute("data-key") === "composer-anon", "focus après la bascule sur " + describe(now));
  assert(now.getAttribute("aria-checked") === "true", "interrupteur allumé : aria-checked=" + now.getAttribute("aria-checked"));
  assert(now.querySelector(".sig-label").textContent === label, "le libellé de l'interrupteur a changé avec son état : « " + now.querySelector(".sig-label").textContent + " »");
  let state = t.doc.getElementById(now.getAttribute("aria-describedby") || "-");
  assert(state && state.textContent === "Anonyme", "état non exposé par la commande : " + (state ? state.textContent : "aucune description"));

  now.click();
  now = t.active();
  assert(now.getAttribute("data-key") === "composer-anon", "second appui : focus sur " + describe(now));
  assert(now.getAttribute("aria-checked") === "false", "interrupteur éteint : aria-checked=" + now.getAttribute("aria-checked"));
  state = t.doc.getElementById(now.getAttribute("aria-describedby") || "-");
  assert(state && state.textContent === "Signé : Alice", "état signé non exposé : " + (state ? state.textContent : "aucune description"));
});

check("interrupteur Anonyme : le nom affiché devient « Anonyme », et l'animation n'est posée que par le geste, jamais par un rendu de plus", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const row = () => t.app().querySelector(".signature-toggle");
  assert(!row().classes().has("is-flip") && !row().classes().has("is-anon"), "état de départ : " + row().className);
  assert(t.doc.getElementById("composer-who").textContent === "Signé : Alice", "nom de départ : « " + t.doc.getElementById("composer-who").textContent + " »");
  t.app().querySelector('[data-key="composer-anon"]').click();
  assert(row().classes().has("is-anon") && row().classes().has("is-flip"), "après le geste : " + row().className);
  assert(t.doc.getElementById("composer-who").textContent === "Anonyme", "nom après la bascule : « " + t.doc.getElementById("composer-who").textContent + " »");
  t.ctx.UI.force();   // données reçues, nouveau rendu : l'état tient, l'animation ne se rejoue pas
  assert(row().classes().has("is-anon") && !row().classes().has("is-flip"), "rendu suivant : " + row().className);
  t.app().querySelector('[data-key="composer-anon"]').click();
  assert(!row().classes().has("is-anon") && row().classes().has("is-flip"), "retour au nom signé : " + row().className);
});

check("écriture anonyme : le champ, le composeur et l'envoi portent un repère qui n'est pas la teinte seule", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const field = () => t.app().querySelector('[data-draft="composer:t1"]');
  const send = () => t.app().querySelector('[data-key="send"]');
  assert(!t.app().querySelector(".composer").classes().has("is-anon") && !t.app().querySelector(".field-mark") && !t.app().querySelector(".send-mark"),
    "repère d'anonymat présent alors que la signature est active");
  assert(field().getAttribute("placeholder") === "Votre message…" && field().getAttribute("aria-label") === "Votre message" && send().getAttribute("aria-label") === "Envoyer",
    "textes signés : « " + field().getAttribute("placeholder") + " » / « " + field().getAttribute("aria-label") + " » / « " + send().getAttribute("aria-label") + " »");

  t.app().querySelector('[data-key="composer-anon"]').click();
  assert(t.app().querySelector(".composer").classes().has("is-anon"), "le composeur ne porte pas is-anon");
  const mark = t.app().querySelector(".composer-field .field-mark");
  assert(mark && mark.getAttribute("aria-hidden") === "true" && mark.querySelector(".icon-mask"), "masque absent à l'entrée du champ, ou lu au lecteur d'écran");
  assert(field().parentNode === mark.parentNode, "le repère n'est pas dans l'enveloppe du champ");
  assert(!field().contains(mark) && !mark.querySelector("textarea"), "le repère ne doit pas envelopper le champ");
  assert(field().getAttribute("placeholder") === "Message anonyme…", "indication du champ : « " + field().getAttribute("placeholder") + " »");
  assert(field().getAttribute("aria-label") === "Votre message anonyme", "nom du champ : « " + field().getAttribute("aria-label") + " »");
  assert(send().getAttribute("aria-label") === "Envoyer en anonyme", "nom de l'envoi : « " + send().getAttribute("aria-label") + " »");
  const badge = send().querySelector(".send-mark");
  assert(badge && badge.getAttribute("aria-hidden") === "true" && badge.querySelector(".icon-mask"), "pastille d'anonymat absente de l'envoi");

  t.app().querySelector('[data-key="composer-anon"]').click();
  assert(!t.app().querySelector(".composer").classes().has("is-anon") && !t.app().querySelector(".field-mark") && !t.app().querySelector(".send-mark"),
    "repères restés après le retour à la signature");
  assert(field().getAttribute("aria-label") === "Votre message" && send().getAttribute("aria-label") === "Envoyer", "noms non rétablis");
});

/* ======================== Le clavier reste ouvert pendant la frappe ==== */

/* Toucher, tel qu'un navigateur le fait : `mousedown` (dont le défaut donne le focus au bouton), puis le clic.
 * Si la commande annule ce défaut, le focus reste où il était — c'est ce qui garde le clavier virtuel ouvert. */
function tap(node) {
  let prevented = false;
  node.dispatchEvent({ type: "mousedown", target: node, currentTarget: node,
    preventDefault() { prevented = true; }, stopPropagation() {} });
  if (!prevented) { node.focus(); }
  node.click();
}

check("frappe en cours : toucher l'interrupteur, « Envoyer » ou « Annuler la citation » laisse le focus (donc le clavier) dans le champ", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const field = () => t.app().querySelector('[data-draft="composer:t1"]');

  field().focus();
  field().value = "Je ne suis pas sûr";
  tap(t.app().querySelector('[data-key="composer-anon"]'));
  assert(t.ctx.UI.local.composerAnon === true, "l'interrupteur n'a pas basculé");
  assert(t.active().getAttribute("data-draft") === "composer:t1", "interrupteur : le focus a quitté le champ, sur " + describe(t.active()));
  assert(field().value === "Je ne suis pas sûr", "interrupteur : la saisie a été perdue (« " + field().value + " »)");

  t.ctx.UI.set({ quote: { topicId: "t1", messageId: "m1" } });
  field().focus();
  tap(t.app().querySelector('[aria-label="Annuler la citation"]'));
  assert(!t.ctx.UI.local.quote, "la citation n'a pas été annulée");
  assert(t.active().getAttribute("data-draft") === "composer:t1", "citation : le focus a quitté le champ, sur " + describe(t.active()));

  const sent = [];
  t.ctx.App.actions.createMessage = (topicId, text) => { sent.push(text); t.ctx.UI.force(); };
  field().focus();
  tap(t.app().querySelector('[data-key="send"]'));
  assert(JSON.stringify(sent) === '["Je ne suis pas sûr"]', "envoi : " + JSON.stringify(sent));
  assert(t.active().getAttribute("data-draft") === "composer:t1" && field().value === "", "envoi : le focus doit rester dans le champ vidé, il est sur " + describe(t.active()));
});

check("sans frappe en cours, toucher l'interrupteur ne vole rien : il bascule, et au clavier physique le focus reste sur lui", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  t.doc.body.focus();
  tap(t.app().querySelector('[data-key="composer-anon"]'));
  assert(t.ctx.UI.local.composerAnon === true, "l'interrupteur n'a pas basculé");
  assert(t.active().getAttribute("data-key") === "composer-anon", "sans champ actif, le toucher garde le comportement d'un bouton : focus sur " + describe(t.active()));
});

/* ===================================================== Gestes sur les bulles ==== */

/* Un doigt, tel que le navigateur l'envoie : pointerdown, pointermove, pointerup sur le document (délégation). */
function finger(t, node, x, y) {
  const ev = (type, cx, cy) => ({ type, target: node, pointerId: 7, pointerType: "touch", isPrimary: true,
    clientX: cx, clientY: cy, cancelable: true, button: 0, preventDefault() {}, stopPropagation() {} });
  return {
    down() { t.doc.dispatchEvent(ev("pointerdown", x, y)); return this; },
    move(dx, dy) { t.doc.dispatchEvent(ev("pointermove", x + dx, y + dy)); return this; },
    up(dx, dy) { t.doc.dispatchEvent(ev("pointerup", x + (dx || 0), y + (dy || 0))); return this; },
    cancel() { t.doc.dispatchEvent(ev("pointercancel", x, y)); return this; },
  };
}
const fire = (timers) => { timers.filter((x) => x.live).forEach((x) => { x.live = false; x.fn(); }); };

check("au doigt : un simple toucher sur une bulle n'ouvre rien ; un appui long ouvre la feuille d'actions", () => {
  const timers = [];
  const t = boot({ timers });
  t.go(topicRoute("t1"));
  finger(t, bubble(t, "m1"), 120, 300).down().up();
  bubble(t, "m1").click();                     // le clic que le navigateur émet après un toucher
  fire(timers);
  assert(!dialog(t), "un simple toucher a ouvert la feuille");

  const f = finger(t, bubble(t, "m1"), 120, 300).down();
  assert(bubble(t, "m1").classList.contains("is-pressing"), "pas de retour visuel pendant l'appui");
  fire(timers);                                // 450 ms plus tard
  assert(dialog(t) && dialog(t).classList.contains("sheet"), "l'appui long n'a pas ouvert la feuille");
  f.up();
  /* Le doigt se lève au-dessus du fond de la feuille qui vient de s'ouvrir : le clic du navigateur tombe dessus. */
  /* Ordre du navigateur : la capture sur le document d'abord, puis la cible si rien n'a arrêté le clic. */
  const scrim = t.overlay().querySelector(".overlay");
  const click = { type: "click", target: scrim, currentTarget: scrim, stopped: false,
    preventDefault() {}, stopPropagation() { this.stopped = true; } };
  t.doc.dispatchEvent(click);
  if (!click.stopped) { scrim.dispatchEvent(click); }
  assert(dialog(t) && dialog(t).classList.contains("sheet"), "le clic du relâcher a refermé la feuille ouverte par l'appui long");
});

check("au doigt : un défilement vertical annule l'appui long ; au clavier et à la souris, le clic ouvre toujours la feuille", () => {
  const timers = [];
  const t = boot({ timers });
  t.go(topicRoute("t1"));
  finger(t, bubble(t, "m1"), 120, 300).down().move(2, 30);
  fire(timers);
  assert(!dialog(t), "un défilement a ouvert la feuille");

  const k = boot();                            // clavier (Entrée) ou lecteur d'écran : un clic sans geste
  k.go(topicRoute("t1"));
  bubble(k, "m1").click();
  assert(dialog(k) && dialog(k).classList.contains("sheet"), "le clic sans geste doit ouvrir la feuille");

  const m = boot();                            // souris : clic droit
  m.go(topicRoute("t1"));
  m.doc.dispatchEvent({ type: "contextmenu", target: bubble(m, "m1"), preventDefault() { this.prevented = true; } });
  assert(dialog(m) && dialog(m).classList.contains("sheet"), "le clic droit doit ouvrir la feuille");
});

check("glisser une bulle vers la droite active la citation et met le focus dans le champ ; pas depuis le bord de l'écran, pas en dessous du seuil", () => {
  const t = boot({ timers: [] });
  t.go(topicRoute("t1"));
  const f = finger(t, bubble(t, "m1"), 120, 300).down().move(40, 3);
  assert(t.app().querySelector(".swipe-cue"), "pas de repère de citation pendant le glisser");
  f.up(40, 3);
  assert(!t.ctx.UI.local.quote, "un glisser trop court a cité");
  assert(!t.app().querySelector(".swipe-cue"), "le repère reste après le relâcher");

  finger(t, bubble(t, "m1"), 10, 300).down().move(90, 0).up(90, 0);
  assert(!t.ctx.UI.local.quote, "un glisser parti du bord gauche (geste retour du système) a cité");

  finger(t, bubble(t, "m1"), 120, 300).down().move(30, 2).move(80, 4).up(80, 4);
  const q = t.ctx.UI.local.quote;
  assert(q && q.topicId === "t1" && q.messageId === "m1", "le glisser n'a pas activé la citation : " + JSON.stringify(q));
  assert(t.active().getAttribute("data-draft") === "composer:t1", "le focus doit aller au champ, il est sur " + describe(t.active()));
  assert(t.app().querySelector(".quote-preview"), "l'aperçu « En réponse à » n'apparaît pas");
});

check("feuille d'un message : « Copier le texte » ; indice des gestes affiché une fois, « Compris » le retire pour de bon", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  bubble(t, "m1").click();
  const labels = dialog(t).querySelectorAll(".sheet-actions button").map((b) => b.textContent);
  assert(labels.includes("Copier le texte") && labels.includes("Citer"), "actions : " + JSON.stringify(labels));
  t.escape();
  const hint = () => t.app().querySelector(".gesture-hint");
  assert(hint() && /Appui long/.test(hint().textContent) && /droite/.test(hint().textContent), "indice des gestes absent ou incomplet");
  t.app().querySelector('[data-key="gesture-hint-ok"]').click();
  assert(!hint(), "« Compris » n'a pas retiré l'indice");
  t.go(topicRoute("t1"));
  assert(!hint(), "l'indice revient après un nouveau rendu");
});

/* ============================================================ BL-011 ==== */

check("BL-011 ouverture d'une feuille : focus dans le calque, fond inerte, défilement verrouillé", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const trigger = bubble(t, "m1");
  trigger.focus();
  trigger.click();
  const dlg = dialog(t);
  assert(dlg && dlg.classList.contains("sheet"), "feuille du message non ouverte");
  assert(dlg.contains(t.active()), "focus hors du calque à l'ouverture : " + describe(t.active()));
  assert(dlg.getAttribute("aria-labelledby") && t.doc.getElementById(dlg.getAttribute("aria-labelledby")),
    "le dialogue focalisé n'est pas nommé par son titre");
  assertBackgroundOpen(t);
  t.app().querySelector('[data-key="send"]').focus();
  assert(dlg.contains(t.active()), "une commande du fond a pris le focus sous le calque");
});

check("BL-011 Tab reste dans le calque (après la dernière commande, retour à la première, et l'inverse)", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  bubble(t, "m1").click();
  const dlg = dialog(t);
  const items = dlg.querySelectorAll("button, input, select, textarea").filter((n) => !n.disabled);
  const first = items[0];
  const last = items[items.length - 1];
  assert(last.textContent === "Fermer", "dernière commande inattendue : " + describe(last));
  last.focus();
  assert(press(last, "Tab").defaultPrevented && t.active() === first, "Tab depuis « Fermer » sort du calque : " + describe(t.active()));
  assert(press(first, "Tab", true).defaultPrevented && t.active() === last, "Maj+Tab depuis la première commande sort du calque : " + describe(t.active()));
  dlg.focus();
  press(dlg, "Tab", true);
  assert(t.active() === last, "Maj+Tab depuis le dialogue sort du calque : " + describe(t.active()));
  const middle = items[1];
  middle.focus();
  assert(!press(middle, "Tab").defaultPrevented, "Tab au milieu du calque ne doit pas être intercepté");
});

check("BL-011 fermeture par « Fermer », par Échap et par le fond : focus rendu au déclencheur, fond rétabli", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const ways = {
    "Fermer": () => byText(dialog(t), "button", "Fermer").click(),
    "Échap": () => t.escape(),
    "fond": () => t.overlay().querySelector(".overlay").click(),
  };
  Object.keys(ways).forEach((way) => {
    const trigger = bubble(t, "m2");
    trigger.focus();
    trigger.click();
    assert(dialog(t), way + " : feuille non ouverte");
    ways[way]();
    assert(!dialog(t), way + " : la feuille ne s'est pas fermée");
    assert(t.active() === bubble(t, "m2"), way + " : focus rendu à " + describe(t.active()) + " au lieu de la bulle m2");
    assertBackgroundClosed(t);
  });
});

check("BL-011 fenêtre « Nouveau sujet » : focus dans la fenêtre, Échap rend le focus au bouton d'ajout", () => {
  const t = boot();
  t.go(TOPICS);
  const fab = t.app().querySelector('[data-key="create-topic"]');
  assert(fab, "bouton d'ajout de sujet sans clé");
  fab.focus();
  fab.click();
  const dlg = dialog(t);
  assert(dlg && dlg.classList.contains("modal"), "fenêtre non ouverte");
  assert(dlg.contains(t.active()), "focus hors de la fenêtre : " + describe(t.active()));
  assertBackgroundOpen(t);
  t.escape();
  assert(t.active().getAttribute("data-key") === "create-topic", "focus après Échap sur " + describe(t.active()));
  assertBackgroundClosed(t);
});

check("BL-011 feuille puis fenêtre (« Modifier le sujet ») : focus dans la fenêtre, puis retour au déclencheur d'origine", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const title = t.app().querySelector('[data-key="topic-info"]');
  assert(title, "titre de l'en-tête sans clé");
  title.focus();
  title.click();
  assert(dialog(t) && dialog(t).classList.contains("sheet"), "feuille d'informations non ouverte");
  byText(dialog(t), "button", "Modifier le sujet").click();
  const dlg = dialog(t);
  assert(dlg && dlg.classList.contains("modal"), "fenêtre de modification non ouverte");
  assert(dlg.contains(t.active()), "focus hors de la nouvelle fenêtre : " + describe(t.active()));
  assertBackgroundOpen(t);
  t.escape();
  assert(t.active().getAttribute("data-key") === "topic-info", "focus après fermeture sur " + describe(t.active()));
  assertBackgroundClosed(t);
});

check("statuts qui sortent un contenu du jeu (Écartée, Clôturé, Archivé) : confirmés AVANT l'envoi ; les autres partent tout de suite", () => {
  const t = boot();
  const sent = [];
  t.ctx.App.actions.changeProposalStatus = (topicId, proposalId, status) => { sent.push("proposition:" + status); };
  t.ctx.App.actions.changeTopicStatus = (topicId, status) => { sent.push("sujet:" + status); };
  const choose = (select, value) => { select.value = value; select.dispatchEvent({ type: "change", target: select }); };
  const button = (label) => dialog(t).querySelectorAll("button").find((b) => b.textContent === label);

  t.go(proposalsRoute("t1"));
  choose(t.app().querySelector('[data-key="proposal-p1-status"]'), "rejected");
  assert(sent.length === 0, "« Écartée » est parti sans confirmation : " + JSON.stringify(sent));
  assert(dialog(t) && /Écarter la proposition/.test(dialog(t).textContent), "fenêtre de confirmation absente");
  assert(/pour toute l'équipe/.test(dialog(t).textContent) && /rétablir/.test(dialog(t).textContent), "la fenêtre ne dit ni l'effet ni qu'il se rattrape");
  button("Annuler").click();
  assert(sent.length === 0 && !dialog(t), "Annuler a envoyé quelque chose ou laissé la fenêtre");
  choose(t.app().querySelector('[data-key="proposal-p1-status"]'), "rejected");
  button("Écarter").click();
  assert(JSON.stringify(sent) === '["proposition:rejected"]', "confirmation : " + JSON.stringify(sent));
  choose(t.app().querySelector('[data-key="proposal-p1-status"]'), "selected");
  assert(sent[1] === "proposition:selected" && !dialog(t), "« Retenue » doit partir sans fenêtre : " + JSON.stringify(sent));

  t.go(topicRoute("t1"));
  [["closed", "Clôturer"], ["archived", "Archiver"]].forEach(([status, label]) => {
    t.app().querySelector('[data-key="topic-info"]').click();
    choose(dialog(t).querySelector('[data-key="topic-status"]'), status);
    assert(sent.length === 2, status + " est parti sans confirmation : " + JSON.stringify(sent));
    assert(dialog(t) && dialog(t).classList.contains("modal") && button(label), status + " : fenêtre de confirmation absente");
    button(label).click();
    assert(sent[sent.length - 1] === "sujet:" + status, status + " : non envoyé après confirmation");
    sent.length = 2;
  });
  t.app().querySelector('[data-key="topic-info"]').click();
  choose(dialog(t).querySelector('[data-key="topic-status"]'), "ready");
  assert(sent[2] === "sujet:ready", "« Prêt pour la réunion » doit partir sans fenêtre : " + JSON.stringify(sent));
});

check("BL-011 un rendu pendant qu'une couche est ouverte garde le focus dans le calque", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  t.app().querySelector('[data-key="topic-info"]').click();
  const select = dialog(t).querySelector('[data-key="topic-status"]');
  assert(select, "sélecteur de statut du sujet sans clé");
  select.focus();
  t.receive("Message reçu, feuille ouverte");
  assert(t.active() !== select && t.active().getAttribute("data-key") === "topic-status", "focus après rendu sur " + describe(t.active()));
  assertBackgroundOpen(t);
  t.escape();

  bubble(t, "m1").click();
  const action = dialog(t).querySelector(".sheet-action");
  action.focus();
  t.receive("Encore un message");
  assert(dialog(t).contains(t.active()) && t.active().getAttribute("data-key") === action.getAttribute("data-key"),
    "focus après rendu sur " + describe(t.active()));
});

check("BL-011 sans `inert` (navigateurs anciens) : fond en aria-hidden pendant la couche, rétabli ensuite", () => {
  const t = boot({ noInert: true });
  t.go(topicRoute("t1"));
  bubble(t, "m1").focus();
  bubble(t, "m1").click();
  assert(t.app().getAttribute("aria-hidden") === "true", "repli aria-hidden absent sur #app");
  assert(t.toasts().getAttribute("aria-hidden") === null, "la région des toasts ne doit pas être masquée");
  assert(dialog(t).contains(t.active()), "focus hors du calque : " + describe(t.active()));
  t.escape();
  assert(t.app().getAttribute("aria-hidden") === null, "aria-hidden laissé sur #app après la fermeture");
  assert(t.active() === bubble(t, "m1"), "focus non rendu au déclencheur : " + describe(t.active()));
});

/* ======================================================= Demande WP-10 ==== */

check("Réglages : le libellé court de la pastille secondaire reste lisible au lecteur d'écran", () => {
  const t = boot();
  t.go(SETTINGS);
  const pills = t.app().querySelectorAll(".status-pill");
  assert(pills.length === 2, "Réglages doit garder ses deux pastilles");
  assert(pills[0].querySelector(".status-short").getAttribute("aria-hidden") === "true", "pastille principale : le court doit rester masqué (la région parle)");
  assert(pills[1].querySelector(".status-short").getAttribute("aria-hidden") === null, "pastille secondaire : libellé court masqué au lecteur d'écran");
  assert(pills[1].querySelector(".status-long").getAttribute("aria-hidden") === null, "pastille secondaire : libellé long masqué au lecteur d'écran");
});

/* ------------------------------------------------------------ Rapport --- */

if (failures.length) {
  failures.forEach(({ name, error }) => {
    console.error("✗ " + name + "\n  " + error.message);
  });
  console.error("\nui-focus : " + passed + " contrôle(s) OK, " + failures.length + " en échec.");
  process.exit(1);
}
console.log("ui-focus : " + passed + " contrôles OK");
