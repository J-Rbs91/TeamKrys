/* BrainstO. : non-régression du lot « Interface 2 » (gestion du focus).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-focus.test.js
 *
 * Charge js/config.js, js/utils.js, js/state.js, js/product-view.js, js/ui.js et js/motion.js
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
/* js/motion.js enveloppe UI.render comme en production : chaque contrôle de focus ci-dessous vérifie AUSSI que la
 * couche de mouvement ne déplace jamais le focus. Ce DOM n'a pas `Element.prototype.animate` : la couche y tourne
 * sans rien animer, ce qui laisse visibles les deux seules choses qu'elle fait sans mouvement (calque maintenu,
 * message désigné). */
const SOURCES = ["js/config.js", "js/utils.js", "js/state.js", "js/product-view.js", "js/ui.js", "js/motion.js"].map((file) => ({
  file, code: fs.readFileSync(path.join(ROOT, file), "utf8"),
}));

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

/* Un contrôle peut être asynchrone (lecture d'un fichier) : sa promesse est retenue, et le rapport l'attend. */
const pending = [];
function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      pending.push(result.then(() => { passed += 1; }, (error) => { failures.push({ name, error }); }));
      return;
    }
    passed += 1;
  } catch (error) { failures.push({ name, error }); }
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
  get firstElementChild() { return this.children[0] || null; }
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
const SYSTEM = { name: "system", raw: "#/settings/system" };
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
        message("m2", "Deuxième", { [ME]: R[2] }),
        message("m3", "Troisième", { [BOB]: R[2] }),
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

  const gone = rowOf(t, "m2").querySelector('[data-key="reaction-' + t.R[2] + '"]');
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

/* ================================================= Épingler pour l'équipe ==== */

check("Détails du sujet : « Épingler pour toute l'équipe » envoie l'épingle et le dit ; désactivé avec sa raison sur un serveur trop ancien", () => {
  const t = boot();
  const sent = [];
  t.ctx.App.actions.setTopicPin = (topicId, pinned) => { sent.push(topicId + ":" + pinned); };
  t.go(topicRoute("t1"));
  t.app().querySelector('[data-key="topic-info"]').click();
  const pin = () => dialog(t).querySelector('[data-key="topic-pin"]');
  assert(pin() && /toute l'équipe/.test(pin().textContent) && pin().getAttribute("aria-pressed") === "false", "commande d'épingle absente ou muette sur sa portée");
  pin().click();
  assert(JSON.stringify(sent) === '["t1:true"]', "épingle : " + JSON.stringify(sent));
  assert(t.toasts().querySelectorAll(".toast").some((n) => /pour toute l'équipe/.test(n.textContent)), "aucun bandeau ne confirme la portée de l'épingle");

  const old = boot();
  old.ctx.Sync.supports = (name) => name === "since";      // serveur qui répond, sans « pins »
  old.go(topicRoute("t1"));
  old.app().querySelector('[data-key="topic-info"]').click();
  const off = dialog(old).querySelector('[data-key="topic-pin"]');
  assert(off && off.disabled, "sur un serveur sans « pins », la commande doit être désactivée");
  assert(/mis à jour/.test(dialog(old).textContent), "la raison de l'indisponibilité n'est pas dite");
});

/* ================================================================ Pandore ==== */

const pandoreRoute = { name: "pandore", topicId: null, raw: "#/pandore" };
const tick = () => new Promise((r) => setImmediate(r));

check("Pandore : entrée depuis l'accueil ; dépôt anonyme, champ vidé, avertissement public ; vide refusé ; plus aucun « boîte à idées »", () => {
  const t = boot();
  t.go(TOPICS);
  const entry = t.app().querySelector('nav.tabbar [data-key="tab-pandore"]');
  assert(entry && /Pandore/.test(entry.textContent), "aucun onglet « Pandore » dans la barre de navigation");
  const sent = [];
  t.ctx.App.actions.submitIdea = (text) => { sent.push(text); return Promise.resolve({ ok: true }); };
  t.go(pandoreRoute);
  const text = t.app().textContent;
  assert(/GitHub public/.test(text) && /aucun nom/.test(text), "l'avertissement de publication publique manque");
  assert(/plainte/.test(text) && /synthèse automatique/i.test(text), "l'écran doit dire que tout peut s'y déposer, et parler de synthèse");
  assert(!/reformul|bo[iî]te à idées/i.test(text), "vocabulaire d'avant Pandore à l'écran : " + text);
  const area = () => t.app().querySelector('[data-draft="pandore:new"]');
  const submit = () => t.app().querySelector('[data-key="pandore-submit"]');
  assert(submit() && submit().textContent === "Déposer anonymement" && !submit().disabled, "bouton de dépôt");
  submit().click();
  assert(sent.length === 0 && area().getAttribute("aria-invalid") === "true", "un dépôt vide est parti, ou le refus n'est pas relié au champ");
  area().value = "  La réunion du lundi déborde  ";
  submit().click();
  assert(JSON.stringify(sent) === '["La réunion du lundi déborde"]', "dépôt : " + JSON.stringify(sent));
  assert(area().value === "", "le champ doit être vidé après le dépôt");
});

check("Pandore : mode local et serveur trop ancien désactivent le dépôt avec leur raison", () => {
  const local = boot();
  local.ctx.Sync.connection = { url: "", localMode: true, unlocked: true };
  local.go(pandoreRoute);
  assert(local.app().querySelector('[data-key="pandore-submit"]').disabled && /mode local/.test(local.app().textContent), "mode local");
  const old = boot();
  old.ctx.Sync.supports = (name) => name === "since";
  old.go(pandoreRoute);
  assert(old.app().querySelector('[data-key="pandore-submit"]').disabled && /mis à jour/.test(old.app().textContent), "serveur sans « ideas »");
});

check("synthèse automatique : lue dans pandore/synthese.json, classée comme l'IA l'a choisi, en TEXTE (jamais en HTML) ; erreur avec « Réessayer »", async () => {
  const t = boot();
  let calls = 0;
  t.ctx.fetch = (url, opts) => {
    calls += 1;
    assert(url === "pandore/synthese.json" && opts && opts.cache === "no-store", "lecture : " + url + " " + JSON.stringify(opts));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: 1, date: "2026-10-03", remiseAZero: "",
      classement: "Par nature", resume: "Deux sujets reviennent.", points: [
        { id: "p1", categorie: "Plaintes", titre: "<img src=x onerror=alert(1)>", texte: "<b>gras</b>", sources: ["bbbbbb", "cccccc"] },
        { id: "p2", categorie: "Idées", titre: "Afficher le planning le jeudi", texte: "Proposition : …", sources: ["aaaaaa"] },
        { id: "p3", categorie: "Plaintes", titre: "Pauses écourtées", texte: "Constat : …", sources: ["dddddd"] },
        { id: "p4", titre: "", texte: "sans titre" }
      ] }) });
  };
  t.go(pandoreRoute);
  await tick(); await tick();
  const cards = t.app().querySelectorAll(".pandore-card");
  assert(cards.length === 3, cards.length + " carte(s), 3 attendues (le point sans titre est écarté)");
  const groups = t.app().querySelectorAll("h2.pandore-group");
  assert(groups.length === 2 && groups[0].textContent === "Plaintes" && groups[1].textContent === "Idées",
    "catégories dans l'ordre de l'IA, chacune une fois : " + Array.prototype.map.call(groups, (g) => g.textContent).join(", "));
  const titles = Array.prototype.map.call(cards, (c) => c.querySelector(".card-title").textContent);
  assert(JSON.stringify(titles) === JSON.stringify(["<img src=x onerror=alert(1)>", "Pauses écourtées", "Afficher le planning le jeudi"]),
    "les points d'une catégorie sont regroupés sous elle : " + JSON.stringify(titles));
  assert(!t.app().querySelector("img") && !t.app().querySelector("b"), "du HTML venu du fichier a été interprété");
  const text = t.app().textContent;
  assert(/2 dépôts d'origine/.test(cards[0].textContent) && /du 03\/10\/2026/.test(text), "métadonnées");
  assert(/Deux sujets reviennent\./.test(text) && /Classement choisi par l'IA : Par nature/.test(text), "résumé et axe de classement");
  assert(!t.app().querySelector('[data-key="pandore-reset-note"]'), "pas de remise à zéro : aucune note");
  t.go(pandoreRoute);
  assert(calls === 1, "un rendu de plus ne doit pas relire le fichier (" + calls + " lectures)");

  /* Sans catégorie : une liste simple, sans titre de groupe. */
  const flat = boot();
  flat.ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: 1, date: "2026-10-03",
    points: [{ id: "p1", titre: "Un", texte: "x", sources: ["aaaaaa"] }, { id: "p2", titre: "Deux", texte: "y", sources: ["bbbbbb"] }] }) });
  flat.go(pandoreRoute);
  await tick(); await tick();
  assert(flat.app().querySelectorAll(".pandore-card").length === 2 && !flat.app().querySelector("h2.pandore-group"), "liste sans catégorie");

  /* Remise à zéro : la synthèse reste affichée, avec la date. */
  const z = boot();
  z.ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: 1, date: "2026-10-03",
    remiseAZero: "2026-10-05", points: [{ id: "p1", titre: "Gardé", texte: "Toujours là", sources: ["aaaaaa"] }] }) });
  z.go(pandoreRoute);
  await tick(); await tick();
  const note = z.app().querySelector('[data-key="pandore-reset-note"]');
  assert(z.app().querySelectorAll(".pandore-card").length === 1, "après remise à zéro, la synthèse doit rester affichée");
  assert(note && /Remise à zéro le 05\/10\/2026/.test(note.textContent) && /prochaine synthèse/.test(note.textContent), "note de remise à zéro : " + (note && note.textContent));

  const e = boot();
  e.ctx.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  e.go(pandoreRoute);
  await tick();
  assert(/Impossible de charger la synthèse/.test(e.app().textContent) && e.app().querySelector('[data-key="pandore-retry"]'), "erreur muette");
});

/* ===================================================== Étoile retirée ==== */

check("l'étoile décorative (sparkle) n'existe plus nulle part", () => {
  ["js/ui.js", "js/utils.js", "js/product-ui.js", "js/uxer-ui.js", "js/app.js"].forEach((file) => {
    assert(fs.readFileSync(path.join(ROOT, file), "utf8").indexOf("sparkle") < 0, "icône « sparkle » encore présente dans " + file);
  });
});

/* ===================================================== Réaction retirée ==== */

check("« Je m'engage » (💪) n'est plus proposée, et celles déjà posées ne s'affichent plus ; les autres restent", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  t.ctx.Core.findMessage(t.ctx.Core.findTopic(t.ctx.Store.view, "t1"), "m3").reactions["p-carla"] = "💪";
  t.ctx.UI.force();
  assert(!t.app().querySelector('[data-key="reaction-💪"]'), "une réaction 💪 existante ne doit plus s'afficher");
  assert(rowOf(t, "m3").querySelector('[data-key="reaction-' + t.R[2] + '"]'), "les autres réactions restent affichées");
  t.ctx.UI.set({ sheet: { type: "message", topicId: "t1", messageId: "m1" } });
  const offered = t.overlay().querySelectorAll(".emoji-btn").map((b) => b.getAttribute("data-key"));
  assert(offered.length === 4 && offered.indexOf("emoji-💪") < 0, "réactions proposées : " + JSON.stringify(offered));
  assert(!/Je m'engage/.test(t.overlay().textContent), "le libellé « Je m'engage » ne doit plus apparaître");
});

/* ================================================ Propositions repliées ==== */

check("propositions : statut, Modifier et Retirer mon vote repliés sous « Statut et actions » ; le volet ouvert le reste après un rendu", () => {
  const t = boot();
  t.go(proposalsRoute("t1"));
  t.app().querySelector('[data-key="vote-p1-for"]').click();
  const more = () => t.app().querySelector("details.proposal-more");
  assert(more() && !more().hasAttribute("open"), "le volet doit être replié par défaut");
  assert(more().querySelector("select") && more().querySelector('[data-key="vote-p1-remove"]'), "statut et retrait du vote dans le volet");
  assert(more().querySelector("summary").textContent === "Statut et actions", "libellé du volet");
  assert(!t.app().querySelector(".vote-actions").closest("details"), "les boutons de vote restent visibles, hors du volet");
  const d = more();
  d.open = true;
  d.dispatchEvent({ type: "toggle", target: d });
  t.app().querySelector('[data-key="vote-p1-against"]').click();   // un vote redessine tout l'écran
  assert(more() !== d && more().hasAttribute("open"), "après un rendu, le volet ouvert doit le rester");
});

/* ================================================== Réglages regroupés ==== */

check("Réglages, niveau 1 : nom, Réunion, invitation, présentation, puis l'entrée Système ; rien de la connexion ni de la synchronisation", () => {
  const t = boot();
  let went = null;
  t.ctx.App.go = (hash) => { went = hash; };
  t.ctx.App.inviteLink = () => "http://localhost/#/invitation/abc";
  t.go(SETTINGS);
  const text = t.app().textContent;
  ["Votre nom", "Réunion", "Ouvrir la synthèse", "Inviter des collaborateurs", "Revoir la présentation", "Système"].forEach((needle) => {
    assert(text.indexOf(needle) >= 0, "niveau 1 : « " + needle + " » absent");
  });
  ["Synchroniser maintenant", "Code d'espace", "Actions en attente", "Se déconnecter", "Modifier l'adresse"].forEach((needle) => {
    assert(text.indexOf(needle) < 0, "niveau 1 : « " + needle + " » relève du niveau Système");
  });
  ["sync-now", "edit-connection", "logout", "release-stale"].forEach((key) => {
    assert(!t.app().querySelector('[data-key="' + key + '"]'), "niveau 1 : bouton " + key + " présent");
  });
  assert(!t.app().querySelector("details.diag-more"), "niveau 1 : pas de diagnostic technique");
  assert(t.app().querySelectorAll(".status-pill").length === 1, "niveau 1 : une seule pastille, dans la barre de titre");
  const cards = t.app().querySelectorAll(".content > .card");
  assert(cards.length && cards[cards.length - 1].getAttribute("data-key") === "system-entry", "l'entrée Système vient en dernier");
  t.app().querySelector('[data-key="open-meeting"]').click();
  assert(went === "#/meeting", "Ouvrir la synthèse : " + went);
  t.app().querySelector('[data-key="open-system"]').click();
  assert(went === "#/settings/system", "entrée Système : " + went);
  assert(!dialog(t), "entrer dans Système ne demande aucune confirmation : ce n'est pas une action");
});

check("Système, niveau 2 : retour vers Réglages, sans barre de navigation ; code d'espace visible ; diagnostic replié, dernière erreur toujours visible", () => {
  const t = boot();
  let up = 0;
  t.ctx.App.remonter = () => { up += 1; };
  t.go(SYSTEM);
  const text = t.app().textContent;
  assert(!t.app().querySelector("nav.tabbar"), "Système est un écran de second niveau : pas de barre de navigation");
  const back = t.app().querySelector('[data-key="back"]');
  assert(back && back.getAttribute("aria-label") === "Retour vers Réglages", "bouton retour vers Réglages attendu");
  back.click();
  assert(up === 1, "le retour doit passer par App.remonter");
  assert(text.indexOf("Votre nom") < 0 && text.indexOf("Inviter des collaborateurs") < 0, "le niveau 2 ne répète pas le niveau 1");
  const more = t.app().querySelector("details.diag-more");
  assert(more && !more.hasAttribute("open"), "diagnostic technique replié par défaut");
  assert(/Stockage local/.test(more.textContent) && /Révision/.test(more.textContent) && /Version/.test(more.textContent), "lignes techniques dans le volet");
  const outside = (needle) => t.app().querySelectorAll(".diag-row").some((r) => r.textContent.indexOf(needle) === 0 && !r.closest("details"));
  assert(outside("Code d'espace"), "le code d'espace reste visible (comparer deux téléphones)");
  assert(outside("Actions en attente"), "les actions en attente restent visibles");
  assert(text.indexOf("Synchroniser maintenant") >= 0, "la synchronisation manuelle est au niveau 2");
  more.open = true;
  more.dispatchEvent({ type: "toggle", target: more });
  t.ctx.UI.force();
  assert(t.app().querySelector("details.diag-more").hasAttribute("open"), "le volet ouvert le reste après un rendu");
  assert(!dialog(t), "ouvrir le diagnostic ne demande aucune confirmation : il ne change rien");
  const e = boot();
  e.ctx.Sync.status = () => ({ code: "error", label: "Erreur", pending: 1, error: "Réponse illisible du serveur", lastSyncAt: null, revision: 3 });
  e.ctx.Sync.diagnostics = () => ({ revision: 3, updatedAt: null, lastSyncAt: null, lastFlushAt: null, intervalMs: 6000, failures: 2,
    pending: [], persistent: true, durability: "durable", status: { code: "error", label: "Erreur", pending: 1, error: "Réponse illisible du serveur" } });
  e.go(SYSTEM);
  assert(e.app().querySelectorAll(".diag-row").some((r) => /^Dernière erreur/.test(r.textContent) && !r.closest("details")), "la dernière erreur ne doit jamais être repliée");
});

check("Système : chaque action demande confirmation ; Annuler n'exécute rien ; Confirmer exécute une seule fois", () => {
  const cases = [
    { key: "sync-now", title: "Synchroniser maintenant", hook: (t, hit) => { t.ctx.Sync.now = hit; } },
    { key: "edit-connection", title: "Modifier l'adresse ou le code", hook: (t, hit) => { t.ctx.App.editConnection = hit; } },
    /* La déconnexion garde sa propre confirmation (BL-031) : c'est App.logout qui ferme et réinitialise. */
    { key: "logout", title: "Se déconnecter de l'équipe", hook: (t, hit) => { t.ctx.App.logout = hit; }, keepsOpen: true },
  ];
  cases.forEach((c) => {
    const t = boot();
    let calls = 0;
    c.hook(t, () => { calls += 1; });
    t.go(SYSTEM);
    t.app().querySelector('[data-key="' + c.key + '"]').click();
    assert(calls === 0, c.key + " : exécuté sans confirmation");
    assert(dialog(t) && dialog(t).textContent.indexOf(c.title) >= 0, c.key + " : confirmation « " + c.title + " » attendue");
    assert(dialog(t).contains(t.active()), c.key + " : le focus doit entrer dans la confirmation");
    const cancel = dialog(t).querySelectorAll("button").filter((b) => b.textContent === "Annuler")[0];
    assert(cancel, c.key + " : bouton Annuler absent");
    cancel.click();
    assert(calls === 0 && !dialog(t), c.key + " : Annuler doit fermer sans rien exécuter");
    t.app().querySelector('[data-key="' + c.key + '"]').click();
    const buttons = dialog(t).querySelectorAll("button").filter((b) => b.textContent !== "Annuler" && b.getAttribute("data-key") !== "close-overlay");
    assert(buttons.length >= 1, c.key + " : bouton de confirmation absent");
    buttons[buttons.length - 1].click();
    assert(calls === 1, c.key + " : Confirmer doit exécuter une fois (" + calls + ")");
    assert(c.keepsOpen || !dialog(t), c.key + " : la confirmation se ferme après exécution");
  });
});

/* ================================================== Barre de navigation ==== */

check("barre de navigation : quatre onglets sur les écrans de premier niveau, l'onglet courant signalé ; absente dans un sujet", () => {
  const t = boot();
  const screens = [[TOPICS, "topics"], [{ name: "meeting", raw: "#/meeting" }, "meeting"], [pandoreRoute, "pandore"], [SETTINGS, "settings"]];
  screens.forEach(([route, tab]) => {
    t.go(route);
    const nav = t.app().querySelector("nav.tabbar");
    assert(nav && nav.getAttribute("aria-label") === "Navigation principale", "barre absente sur " + route.raw);
    const items = nav.querySelectorAll(".tabbar-item");
    assert(items.length === 4 && items.map((b) => b.textContent).join(",") === "Sujets,Réunion,Pandore,Réglages", "onglets : " + items.map((b) => b.textContent));
    const current = nav.querySelectorAll('[aria-current="page"]');
    assert(current.length === 1 && current[0].getAttribute("data-key") === "tab-" + tab, "onglet courant sur " + route.raw);
    assert(!t.app().querySelector('[data-key="back"]'), "un onglet n'a pas de bouton retour : " + route.raw);
  });
  t.go(topicRoute("t1"));
  assert(!t.app().querySelector("nav.tabbar"), "dans un sujet, la barre doit disparaître");
  assert(t.app().querySelector('[data-key="back"]'), "dans un sujet, le bouton retour reste");
  let went = null;
  t.go(TOPICS);
  t.ctx.App.go = (hash) => { went = hash; };
  t.app().querySelector('[data-key="tab-pandore"]').click();
  assert(went === "#/pandore", "l'onglet Pandore mène à #/pandore : " + went);
  went = null;
  t.app().querySelector('[data-key="tab-topics"]').click();
  assert(went === null, "toucher l'onglet courant ne navigue pas");
});

check("Pandore : section à part, présentée comme une zone d'expression libre et anonyme", () => {
  const t = boot();
  t.go(pandoreRoute);
  assert(/Expression libre et anonyme/.test(t.app().querySelector(".topbar").textContent), "sous-titre de Pandore");
  assert(!t.app().querySelector('[data-key="back"]'), "Pandore n'est pas un écran enfant des sujets");
});

/* ============================================================= Invitation ==== */

const INVITED = "https://script.google.com/macros/s/AKfycb_INVITE/exec";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function invited(t, configured) {
  const joined = [];
  Object.assign(t.ctx.App, {
    gate: () => "connection",
    invitation: () => ({ url: INVITED, token: "x", sameTeam: false }),
    connectionConfigured: () => !!configured,
    saveConnection: (url, code) => { joined.push([url, code]); }
  });
  t.go(TOPICS);
  return joined;
}

check("invitation : « Rejoindre l'équipe » ne demande que le code ; l'adresse vient du lien et n'est jamais affichée", () => {
  const t = boot();
  const joined = invited(t, false);
  const card = t.app().querySelector('[data-key="invite-card"]');
  assert(card, "écran d'invitation absent");
  assert(!t.app().querySelector('[data-draft="setup:url"]'), "le champ d'adresse ne doit pas apparaître : l'adresse vient du lien");
  assert(t.app().textContent.indexOf(INVITED) < 0, "l'adresse du script ne doit jamais s'afficher");
  assert(/Code d'espace de l'équipe : [0-9A-F]{4}-[0-9A-F]{4}/.test(card.textContent), "code d'espace pour comparer");
  t.app().querySelector('[data-draft="setup:code"]').value = "1234";
  t.app().querySelector('[data-key="invite-join"]').click();
  assert(JSON.stringify(joined) === JSON.stringify([[INVITED, "1234"]]), "rejoindre : " + JSON.stringify(joined));
  assert(/Rejoindre l'équipe/.test(t.app().querySelector('[data-key="invite-join"]').textContent), "libellé du bouton");
  assert(t.app().querySelector('[data-key="invite-install"]'), "consignes d'installation absentes dans le navigateur");
});

check("invitation : sur iPhone, consignes Safari et « Copier l'invitation » ; dans l'application installée, aucune consigne", () => {
  const t = boot();
  t.ctx.navigator.userAgent = IPHONE;
  invited(t, false);
  const install = t.app().querySelector('[data-key="invite-install"]');
  assert(install && /Sur l'écran d'accueil/.test(install.textContent) && /Coller l'invitation/.test(install.textContent), "consignes iPhone");
  assert(t.app().querySelector('[data-key="invite-copy"]'), "« Copier l'invitation » absent sur iPhone");
  const app = boot();
  app.ctx.matchMedia = (q) => ({ matches: /standalone/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  invited(app, false);
  assert(!app.app().querySelector('[data-key="invite-install"]'), "dans l'application installée, pas de consigne d'installation");
});

check("invitation : un appareil d'une autre équipe est prévenu, et peut garder son équipe", () => {
  const t = boot();
  invited(t, true);
  const text = t.app().textContent;
  assert(/autre équipe/.test(text) && /remplace l'équipe actuelle/.test(text), "avertissement de changement d'équipe");
  assert(/Changer d'équipe/.test(t.app().querySelector('[data-key="invite-join"]').textContent), "libellé explicite");
  const keep = t.app().querySelector('[data-key="invite-dismiss"]');
  let went = null;
  t.ctx.App.go = (hash) => { went = hash; };
  keep.click();
  assert(/Garder mon équipe actuelle/.test(keep.textContent) && went === "#/", "garder son équipe : " + went);
});

check("connexion : lien abîmé signalé ; « Coller l'invitation » présent si le presse-papiers se lit", () => {
  const t = boot();
  Object.assign(t.ctx.App, { gate: () => "connection", invitation: () => ({ url: "", token: "AAAA", sameTeam: false }), connectionConfigured: () => false });
  t.go(TOPICS);
  assert(t.app().querySelector('[data-key="invite-broken"]'), "lien abîmé non signalé");
  assert(t.app().querySelector('[data-draft="setup:url"]'), "le champ d'adresse doit rester disponible");
  assert(!t.app().querySelector('[data-key="invite-paste"]'), "sans lecture du presse-papiers, pas de bouton");
  const c = boot();
  c.ctx.navigator.clipboard = { readText: () => Promise.resolve("") };
  Object.assign(c.ctx.App, { gate: () => "connection", connectionConfigured: () => false });
  c.go(TOPICS);
  assert(c.app().querySelector('[data-key="invite-paste"]'), "« Coller l'invitation » absent");
});

check("Réglages : « Inviter des collaborateurs » est un seul bouton Partager ; la feuille du téléphone fait le reste, sinon le message est copié", async () => {
  const LINK = "https://j-rbs91.github.io/TeamKrys/#/invitation/abc";
  const t = boot();
  const shared = [];
  t.ctx.navigator.share = (data) => { shared.push(data); return Promise.resolve(); };
  Object.assign(t.ctx.App, { inviteLink: () => LINK, teamHasCode: () => true });
  t.go(SETTINGS);
  const card = t.app().querySelector('[data-key="invite-settings"]');
  assert(card, "carte d'invitation absente");
  assert(card.querySelectorAll("button").length === 1 && card.querySelectorAll("a").length === 0, "un seul bouton, aucune liste de canaux");
  assert(!/SMS|WhatsApp|Mail/.test(card.textContent), "inutile de nommer les façons de partager : " + card.textContent);
  t.app().querySelector('[data-key="invite-share"]').click();
  await new Promise((r) => setImmediate(r));
  assert(shared.length === 1 && shared[0].text.indexOf(LINK) >= 0 && /Code d'accès : $/.test(shared[0].text), "message partagé : " + JSON.stringify(shared));
  /* Sans feuille de partage : le message est copié. */
  const c = boot();
  const copied = [];
  c.ctx.navigator.clipboard = { writeText: (text) => { copied.push(text); return Promise.resolve(); } };
  Object.assign(c.ctx.App, { inviteLink: () => LINK, teamHasCode: () => false });
  c.go(SETTINGS);
  c.app().querySelector('[data-key="invite-share"]').click();
  await new Promise((r) => setImmediate(r));
  assert(copied.length === 1 && copied[0].indexOf(LINK) >= 0 && !/Code d'accès/.test(copied[0]), "repli copie, sans ligne du code pour une équipe sans code : " + JSON.stringify(copied));
  /* Partage annulé par la personne : rien de plus. */
  const a = boot();
  const copiedA = [];
  a.ctx.navigator.share = () => Promise.reject(Object.assign(new Error("annulé"), { name: "AbortError" }));
  a.ctx.navigator.clipboard = { writeText: (text) => { copiedA.push(text); return Promise.resolve(); } };
  Object.assign(a.ctx.App, { inviteLink: () => LINK, teamHasCode: () => false });
  a.go(SETTINGS);
  a.app().querySelector('[data-key="invite-share"]').click();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert(copiedA.length === 0, "un partage annulé ne doit rien copier");
  const local = boot();
  Object.assign(local.ctx.App, { inviteLink: () => "" });
  local.go(SETTINGS);
  assert(!local.app().querySelector('[data-key="invite-settings"]'), "pas d'invitation sans équipe (mode local)");
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

/* ==================================================== Couche de mouvement ==== */

check("mouvement : un rendu de données pendant qu'une feuille est ouverte ne rejoue pas son entrée", async () => {
  const t = boot();
  t.go(topicRoute("t1"));
  bubble(t, "m1").click();
  await tick();
  const first = t.overlay().querySelector(".overlay");
  assert(first && !first.classList.contains("is-settled"), "à l'ouverture, la feuille doit jouer son entrée");
  t.receive("Message reçu, feuille ouverte");
  await tick();
  const again = t.overlay().querySelector(".overlay");
  assert(again && again !== first, "le rendu doit avoir reconstruit le calque");
  assert(again.classList.contains("is-settled"), "le calque reconstruit doit être marqué is-settled (sinon il remonte sous les yeux)");
  t.escape();
  await tick();
  bubble(t, "m2").click();
  await tick();
  assert(!t.overlay().querySelector(".overlay").classList.contains("is-settled"), "une nouvelle ouverture rejoue son entrée");
});

check("mouvement : la bulle dont la feuille est ouverte est désignée, elle seule, et le reste tant que la feuille l'est", async () => {
  const t = boot();
  t.go(topicRoute("t1"));
  bubble(t, "m2").click();
  await tick();
  assert(bubble(t, "m2").classList.contains("is-targeted"), "la bulle visée doit porter is-targeted");
  assert(t.app().querySelectorAll(".bubble.is-targeted").length === 1, "une seule bulle désignée");
  t.receive("Message reçu, feuille ouverte");
  await tick();
  assert(bubble(t, "m2").classList.contains("is-targeted"), "la désignation survit au rendu de données");
  t.escape();
  await tick();
  assert(!t.app().querySelector(".bubble.is-targeted"), "feuille fermée : plus aucune bulle désignée");
});

/* ======================================================= Demande WP-10 ==== */

check("Système : le libellé court de la pastille secondaire reste lisible au lecteur d'écran", () => {
  const t = boot();
  t.go(SYSTEM);
  const pills = t.app().querySelectorAll(".status-pill");
  assert(pills.length === 2, "Système doit garder ses deux pastilles");
  assert(pills[0].querySelector(".status-short").getAttribute("aria-hidden") === "true", "pastille principale : le court doit rester masqué (la région parle)");
  assert(pills[1].querySelector(".status-short").getAttribute("aria-hidden") === null, "pastille secondaire : libellé court masqué au lecteur d'écran");
  assert(pills[1].querySelector(".status-long").getAttribute("aria-hidden") === null, "pastille secondaire : libellé long masqué au lecteur d'écran");
});

/* ------------------------------------------------------------ Rapport --- */

Promise.all(pending).then(() => {
  if (failures.length) {
    failures.forEach(({ name, error }) => {
      console.error("✗ " + name + "\n  " + error.message);
    });
    console.error("\nui-focus : " + passed + " contrôle(s) OK, " + failures.length + " en échec.");
    process.exit(1);
  }
  console.log("ui-focus : " + passed + " contrôles OK");
});
