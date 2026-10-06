/* BrainstO. : non-régression du lot « Interface 3 » (formulaires accessibles, titres d'écran,
 * dates du sujet, mouvement réduit).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-a11y-forms.test.js
 *
 * Charge js/config.js, js/utils.js, js/state.js, js/product-view.js, js/ui.js et js/uxer-ui.js
 * dans un contexte vm, sur un DOM minimal écrit ici (même modèle que tests/ui-status-anon.test.js,
 * pas de jsdom). Store, Sync et App sont des doublures.
 *
 * Contrôles :
 *  - BL-009 : chaque champ (connexion, verrou, nom, réglages, composeur, recherche, consensus,
 *    fenêtres et feuille) a un nom accessible non vide, JAMAIS le seul placeholder ; chaque
 *    libellé est relié à son champ (for/id, identifiants uniques) ; « Votre nom » (Nouveau
 *    sujet) porte sa description d'anonymat ; une erreur de saisie est reliée au champ
 *    (aria-invalid, aria-describedby) et s'efface à la frappe ;
 *  - BL-034 : titre du document par écran, un seul titre de niveau 1 par écran, zone principale,
 *    bouton-titre du sujet nommé par son texte visible ;
 *  - BL-033 : carte du sujet (dernière activité en relatif court) et feuille d'informations
 *    (création ET dernière activité, avec libellés) ;
 *  - BL-035 : « Aller au message cité » ne défile pas en mode lissé si le mouvement est réduit.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SOURCES = ["js/config.js", "js/utils.js", "js/state.js", "js/product-view.js", "js/ui.js", "js/uxer-ui.js"].map((file) => ({
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
const T0 = "2026-09-10T10:00:00.000Z";
const HOUR = 3600000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

function msg(id, extra) {
  return Object.assign({
    id, text: "Texte " + id, authorId: BOB, authorName: "Bruno", anon: false,
    quoteId: null, reactions: {}, createdAt: T0, updatedAt: T0,
  }, extra);
}

function topicOf(id, extra) {
  return Object.assign({
    id, title: "Sujet " + id, description: "", status: "open", anon: false,
    createdBy: { id: BOB, name: "Bruno" }, createdAt: T0, updatedAt: T0,
    messages: [], proposals: [], conclusions: [], conclusionVotes: {},
  }, extra);
}

const TOPICS = { name: "topics", raw: "#/" };
const topicRoute = (id) => ({ name: "topic", topicId: id, raw: "#/topic/" + id });
const proposalsRoute = (id) => ({ name: "proposals", topicId: id, raw: "#/topic/" + id + "/proposals" });
const conclusionRoute = (id) => ({ name: "conclusion", topicId: id, raw: "#/topic/" + id + "/conclusion" });
const SETTINGS = { name: "settings", raw: "#/settings" };
const MEETING = { name: "meeting", raw: "#/meeting" };

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

  const topics = options.topics || [
    topicOf("t1", { messages: [msg("m1"), msg("m2", { authorId: ME, authorName: "Alice", quoteId: "m1" })] }),
    topicOf("t3", {
      conclusions: [{ id: "c1", text: "Cap A", authorId: ME, authorName: "Alice", createdAt: T0, updatedAt: T0, source: "manual" }],
    }),
  ];
  const shaped = ctx.Core.ensureShape({
    revision: 12, participants: [{ id: ME, name: "Alice" }, { id: BOB, name: "Bruno" }], topics,
  });
  const status = { code: "idle", label: "À jour", pending: 0, error: null, lastSyncAt: T0, revision: 12 };

  ctx.Sync = lenient({
    connection: { url: "https://exemple.invalid/exec", token: "", localMode: false, unlocked: true },
    status: () => Object.assign({}, status),
    diagnostics: () => ({
      revision: 12, updatedAt: null, lastSyncAt: T0, lastFlushAt: null, intervalMs: 6000, failures: 0,
      pending: [], persistent: true, durability: "durable", status: Object.assign({}, status),
    }),
  });
  ctx.Store = lenient({ view: shaped, base: shaped, version: 1, queue: [], pendingMessageIds: () => ({}) });
  ctx.App = lenient({
    user: { id: ME, name: "Alice" },
    route: TOPICS,
    gate: () => null,
    ownsMessage: (m) => !m.anon && m.authorId === ME,
    ownsItem: (id, authorId) => authorId === ME,
    onboardingWanted: () => false,
    onboardingState: () => "vue",
    connectionConfigured: () => true,
    actions: lenient({}),
  });
  ctx.UI.init();

  return {
    ctx, doc: document,
    app: () => document.getElementById("app"),
    overlay: () => document.getElementById("overlay-root"),
    toasts: () => document.getElementById("toast-root"),
    go(route) { ctx.App.gate = () => null; ctx.App.route = route; ctx.UI.force(); },
    gate(name) { ctx.App.gate = () => name; ctx.UI.force(); },
    set(patch) { ctx.UI.set(patch); },
  };
}

/* ------------------------------------------------------------- Outils --- */

function accessibleText(node) {
  if (node.nodeType === 3) { return node.data; }
  if (node.namespaceURI !== HTML_NS || node.getAttribute("aria-hidden") === "true") { return ""; }
  return node.childNodes.map(accessibleText).join("");
}

const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;

function controlsIn(root) {
  return root.querySelectorAll("input, textarea, select")
    .filter((n) => !/^(hidden|button|submit|checkbox|radio)$/.test(n.getAttribute("type") || ""));
}

/* Nom accessible, SANS le placeholder (jamais un nom : il disparaît à la saisie) :
 * aria-labelledby, aria-label, libellé relié par for/id, libellé qui enveloppe. */
function nameOf(doc, control) {
  const by = control.getAttribute("aria-labelledby");
  if (by) {
    const text = by.split(/\s+/).map((id) => doc.getElementById(id)).filter(Boolean)
      .map(accessibleText).join(" ").trim();
    if (text) { return text; }
  }
  const aria = control.getAttribute("aria-label");
  if (aria && aria.trim()) { return aria.trim(); }
  const id = control.getAttribute("id");
  if (id) {
    const labels = doc.querySelectorAll("label").filter((l) => l.getAttribute("for") === id);
    if (labels.length) { return accessibleText(labels[0]).trim(); }
  }
  const wrap = control.closest("label");
  return wrap ? accessibleText(wrap).trim() : "";
}

function describedText(doc, control) {
  return (control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)
    .map((id) => { const n = doc.getElementById(id); return n ? n.textContent : ""; }).join(" ");
}

function assertNamed(t, root, where) {
  const controls = controlsIn(root);
  assert(controls.length > 0, where + " : aucun champ trouvé (le contrôle ne vérifierait rien)");
  controls.forEach((c) => {
    assert(nameOf(t.doc, c), where + " : champ sans nom accessible : <" + c.localName + " " +
      (c.getAttribute("data-draft") || c.getAttribute("data-key") || "") + ">");
  });
  root.querySelectorAll("label").forEach((l) => {
    const target = l.getAttribute("for");
    assert(target, where + " : libellé « " + l.textContent + " » sans attribut for");
    const node = t.doc.getElementById(target);
    assert(node && FIELD.test(node.tagName), where + " : for=\"" + target + "\" ne désigne aucun champ");
  });
  const ids = [];
  walk(t.doc.documentElement, (n) => { const id = n.getAttribute("id"); if (id) { ids.push(id); } });
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert(!dup.length, where + " : identifiants en double : " + dup.join(", "));
}

function manyTopics() {
  const list = [
    topicOf("t1", { messages: [msg("m1"), msg("m2", { authorId: ME, authorName: "Alice", quoteId: "m1" })] }),
    topicOf("t3", {
      conclusions: [{ id: "c1", text: "Cap A", authorId: ME, authorName: "Alice", createdAt: T0, updatedAt: T0, source: "manual" }],
    }),
  ];
  for (let i = 0; i < 8; i++) { list.push(topicOf("s" + i)); }
  return list;
}

/* ============================================================ BL-009 ==== */

check("BL-009 connexion, verrou et nom : champs nommés par un libellé relié, jamais par le placeholder", () => {
  ["connection", "lock", "name"].forEach((gate) => {
    const t = boot();
    t.gate(gate);
    assertNamed(t, t.app(), "écran « " + gate + " »");
  });
});

check("BL-009 sujets (recherche), discussion (composeur), consensus et réglages : champs nommés", () => {
  const t = boot({ topics: manyTopics() });
  [["sujets", TOPICS], ["discussion", topicRoute("t1")], ["consensus", conclusionRoute("t3")],
    ["réglages", SETTINGS], ["propositions", proposalsRoute("t1")]].forEach(([name, route]) => {
    t.go(route);
    if (name === "propositions") { return; }   // aucun champ sans proposition : seulement le titre d'écran
    assertNamed(t, t.app(), "écran « " + name + " »");
  });
});

check("BL-009 fenêtres et feuille (nouveau sujet, modifier le sujet, le message, le consensus, proposition, statut) : champs nommés", () => {
  const t = boot();
  [
    ["Nouveau sujet", TOPICS, { modal: { type: "createTopic" } }],
    ["Modifier le sujet", topicRoute("t1"), { modal: { type: "editTopic", topicId: "t1" } }],
    ["Modifier le message", topicRoute("t1"), { modal: { type: "editMessage", topicId: "t1", messageId: "m1" } }],
    ["Nouvelle proposition", topicRoute("t1"), { modal: { type: "createProposal", topicId: "t1" } }],
    ["Modifier la formulation", conclusionRoute("t3"), { modal: { type: "editConclusion", topicId: "t3", conclusionId: "c1" } }],
    ["Feuille d'informations", topicRoute("t1"), { sheet: { type: "topicInfo", topicId: "t1" } }],
  ].forEach(([name, route, layer]) => {
    t.set({ sheet: null, modal: null });
    t.go(route);
    t.set(layer);
    assertNamed(t, t.overlay(), "« " + name + " »");
  });
});

check("Nouveau sujet : plus de champ nom (épure) ; l'anonymat se choisit avec l'interrupteur, le nom signé est celui de l'appareil", () => {
  const t = boot();
  const created = [];
  t.ctx.App.actions.createTopic = (title, desc, name) => { created.push({ title, name }); };
  t.go(TOPICS);
  t.set({ modal: { type: "createTopic" } });
  const sw = () => t.overlay().querySelector('[data-key="newTopic-anon"]');
  const create = () => t.overlay().querySelectorAll("button").find((b) => b.textContent === "Créer").click();
  assert(!t.overlay().querySelector('[data-draft="newTopic:name"]'), "le champ « Votre nom » doit disparaître");
  assert(sw() && sw().getAttribute("role") === "switch" && sw().getAttribute("aria-checked") === "false", "interrupteur absent ou allumé au départ");
  assert(sw().textContent === "Publier en anonyme", "libellé de l'interrupteur : « " + sw().textContent + " »");
  assert(describedText(t.doc, sw()).indexOf("Signé : " + t.ctx.App.user.name) >= 0, "l'état signé n'est pas exposé : « " + describedText(t.doc, sw()) + " »");

  t.overlay().querySelector('[data-draft="newTopic:title"]').value = "Sujet";
  create();
  assert(created.length === 1 && created[0].name === t.ctx.App.user.name, "création signée : nom transmis « " + (created[0] && created[0].name) + " »");

  t.set({ modal: { type: "createTopic" } });
  sw().click();
  assert(sw().getAttribute("aria-checked") === "true" && /Anonyme/.test(describedText(t.doc, sw())), "l'interrupteur ne s'allume pas");
  t.overlay().querySelector('[data-draft="newTopic:title"]').value = "Sujet";
  create();
  assert(created.length === 2 && created[1].name === "", "création anonyme : nom transmis « " + (created[1] && created[1].name) + " »");

  /* Signé sans nom connu : refus, jamais d'anonymat par accident. */
  t.ctx.App.user.name = "";
  t.set({ modal: { type: "createTopic" } });
  t.overlay().querySelector('[data-draft="newTopic:title"]').value = "Sujet";
  create();
  assert(created.length === 2, "un sujet signé sans nom est parti (anonyme par accident)");
});

check("BL-009 erreur de saisie : aria-invalid et message relié au champ, focus au champ, effacés à la frappe", () => {
  const t = boot();
  t.go(TOPICS);
  t.set({ modal: { type: "createTopic" } });
  const input = t.overlay().querySelector('input[data-draft="newTopic:title"]');
  const create = t.overlay().querySelectorAll("button").filter((b) => b.textContent === "Créer")[0];
  assert(input && create, "titre ou bouton Créer absent");
  create.click();
  assert(input.getAttribute("aria-invalid") === "true", "aria-invalid absent après un titre vide");
  const message = "Le titre du sujet est obligatoire.";
  assert(describedText(t.doc, input).indexOf(message) >= 0,
    "le message n'est pas relié au champ : « " + describedText(t.doc, input) + " »");
  assert(t.doc.activeElement === input, "le focus doit aller au champ en erreur");
  assert(t.toasts().textContent.indexOf(message) >= 0, "le toast d'annonce doit rester");
  create.click();
  create.click();
  assert(t.overlay().querySelectorAll(".field-error").length === 1, "un seul message d'erreur par champ");
  input.dispatchEvent({ type: "input", target: input });
  assert(!input.hasAttribute("aria-invalid"), "aria-invalid doit tomber à la frappe");
  assert(t.overlay().querySelectorAll(".field-error").length === 0, "le message doit disparaître à la frappe");
  assert(!input.hasAttribute("aria-describedby"), "aria-describedby ne doit garder que ce qui existait avant l'erreur");
});

check("BL-009 UI.fieldError relie un refus venu de js/app.js au champ", () => {
  const t = boot();
  t.gate("connection");
  t.ctx.UI.fieldError("setup:url", "Collez l'adresse de l'équipe.");
  const input = t.app().querySelector('input[data-draft="setup:url"]');
  assert(input.getAttribute("aria-invalid") === "true", "aria-invalid absent");
  const text = describedText(t.doc, input);
  assert(text.indexOf("Collez l'adresse de l'équipe.") >= 0, "message non relié : « " + text + " »");
  t.ctx.UI.fieldError("absent:cle", "sans effet");   // aucune exception
});

/* ============================================================ BL-034 ==== */

const SCREEN_CASES = [
  { name: "connexion", title: "Connexion", show: (t) => t.gate("connection") },
  { name: "nom", title: "Votre nom", show: (t) => t.gate("name") },
  { name: "verrou", title: "Espace verrouillé", show: (t) => t.gate("lock") },
  { name: "sujets", title: "Sujets", show: (t) => t.go(TOPICS) },
  { name: "discussion", title: "Sujet t1", show: (t) => t.go(topicRoute("t1")) },
  { name: "propositions", title: "Propositions : Sujet t1", show: (t) => t.go(proposalsRoute("t1")) },
  { name: "consensus", title: "Consensus : Sujet t3", show: (t) => t.go(conclusionRoute("t3")) },
  { name: "réglages", title: "Réglages", show: (t) => t.go(SETTINGS) },
  { name: "synthèse", title: "Synthèse de réunion", show: (t) => t.go(MEETING) },
  { name: "introuvable", title: "Introuvable", show: (t) => t.go(topicRoute("absent")) },
];

check("BL-034 titre du document par écran (« Titre - BrainstO. »), tous distincts", () => {
  const t = boot();
  const seen = {};
  SCREEN_CASES.forEach((c) => {
    c.show(t);
    const want = c.title + " - " + t.ctx.CONFIG.APP_NAME;
    assert(t.doc.title === want, "écran « " + c.name + " » : document.title « " + t.doc.title + " », attendu « " + want + " »");
    assert(!seen[t.doc.title], "titre en double : " + t.doc.title);
    seen[t.doc.title] = true;
  });
});

check("BL-034 un seul titre de niveau 1 par écran, et une zone principale", () => {
  const t = boot();
  SCREEN_CASES.forEach((c) => {
    c.show(t);
    const heads = t.app().querySelectorAll("h1, [role=heading]")
      .filter((n) => n.localName === "h1" || n.getAttribute("aria-level") === "1");
    assert(heads.length === 1, "écran « " + c.name + " » : " + heads.length + " titre(s) de niveau 1, attendu 1");
    assert(accessibleText(heads[0]).trim() !== "", "écran « " + c.name + " » : titre de niveau 1 sans texte");
    assert(t.app().getAttribute("role") === "main", "écran « " + c.name + " » : #app doit être la zone principale");
  });
  /* Connexion de première fois : pas de barre du haut, le nom de l'application est le titre. */
  const first = boot();
  first.ctx.App.connectionConfigured = () => false;
  first.gate("connection");
  const heads = first.app().querySelectorAll("h1, [role=heading]")
    .filter((n) => n.localName === "h1" || n.getAttribute("aria-level") === "1");
  assert(heads.length === 1 && heads[0].textContent === first.ctx.CONFIG.APP_NAME,
    "connexion de première fois : titre de niveau 1 attendu = nom de l'application (" + heads.length + ")");
});

check("BL-034 bouton-titre du sujet : nom = texte visible (le titre seul, épure), la consigne en description", () => {
  const t = boot();
  t.go(topicRoute("t1"));
  const button = t.app().querySelector(".topbar-titles > button");
  assert(button, "bouton-titre absent");
  assert(!button.hasAttribute("aria-label"),
    "aria-label remplace le titre visible : « " + button.getAttribute("aria-label") + " »");
  const name = accessibleText(button);
  ["Sujet t1"].forEach((part) => {
    assert(name.indexOf(part) >= 0, "le nom accessible doit contenir « " + part + " » : « " + name + " »");
  });
  assert(describedText(t.doc, button).indexOf("Voir les détails du sujet") >= 0,
    "description absente : « " + describedText(t.doc, button) + " »");
  const heading = t.app().querySelector(".topbar-titles");
  assert(heading.getAttribute("role") === "heading" && accessibleText(heading).indexOf("Sujet t1") >= 0,
    "le titre du sujet doit être annoncé comme titre de niveau 1");
});

/* ============================================================ BL-033 ==== */

check("BL-033 carte du sujet : dernière activité en relatif court", () => {
  const cases = [
    [30 * 1000, "Actif à l'instant"],
    [5 * 60000, "Actif il y a 5 min"],
    [2 * HOUR + 600000, "Actif il y a 2 h"],
    [26 * HOUR, "Actif il y a 1 jour"],
    [73 * HOUR, "Actif il y a 3 jours"],
  ];
  const old = "2026-09-10T12:00:00.000Z";
  const topics = cases.map((c, i) => topicOf("a" + i, { updatedAt: ago(c[0]) }));
  topics.push(topicOf("old", { updatedAt: old }));
  topics.push(topicOf("bad", { updatedAt: "pas une date" }));
  const t = boot({ topics });
  t.go(TOPICS);
  cases.forEach((c, i) => {
    const card = t.app().querySelector('[data-key="topic-a' + i + '"]');
    assert(card, "carte a" + i + " absente");
    assert(card.textContent.indexOf(c[1]) >= 0, "carte a" + i + " : « " + card.textContent + " », attendu « " + c[1] + " »");
  });
  const date = t.ctx.Utils.formatDateTime(old).split(" à ")[0];
  const oldCard = t.app().querySelector('[data-key="topic-old"]');
  assert(oldCard.textContent.indexOf("Actif le " + date) >= 0, "carte ancienne : « " + oldCard.textContent + " », attendu « Actif le " + date + " »");
  assert(t.app().querySelector('[data-key="topic-bad"]').textContent.indexOf("Actif") < 0, "une date illisible ne doit rien afficher");
});

check("BL-033 feuille d'informations : création ET dernière activité, avec libellés", () => {
  const created = "2026-09-10T10:00:00.000Z";
  const updated = "2026-10-01T20:54:00.000Z";
  const t = boot({
    topics: [
      topicOf("t1", { createdAt: created, updatedAt: updated, messages: [msg("m1")] }),
      topicOf("t2", { createdAt: created, updatedAt: updated, createdBy: { id: "", name: "Anonyme" } }),
    ],
  });
  const U = t.ctx.Utils;
  t.go(topicRoute("t1"));
  t.set({ sheet: { type: "topicInfo", topicId: "t1" } });
  let text = t.overlay().textContent;
  assert(text.indexOf("Créé le " + U.formatDateTime(created)) >= 0, "date de création libellée absente : « " + text + " »");
  assert(text.indexOf("Dernière activité le " + U.formatDateTime(updated)) >= 0, "dernière activité absente : « " + text + " »");
  assert(text.indexOf("Bruno") >= 0, "l'auteur doit rester affiché");
  t.set({ sheet: null });
  t.go(topicRoute("t2"));
  t.set({ sheet: { type: "topicInfo", topicId: "t2" } });
  text = t.overlay().textContent;
  assert(text.indexOf("Anonyme") >= 0 && text.indexOf("Bruno") < 0, "sujet anonyme : aucun nom ajouté : « " + text + " »");
  assert(text.indexOf("Dernière activité le") >= 0, "sujet anonyme : dernière activité absente");
});

/* ============================================================ BL-035 ==== */

check("BL-035 mouvement réduit : le défilement vers le message cité n'est pas lissé", () => {
  const run = (matchMedia) => {
    const t = boot();
    t.go(topicRoute("t1"));
    t.ctx.matchMedia = matchMedia;   // après le rendu : la couche UXER lit aussi la préférence
    const node = t.app().querySelector('[data-message-id="m1"]');
    const calls = [];
    node.scrollIntoView = (options) => { calls.push(options); };
    t.ctx.UI.scrollToMessage("m1");
    assert(calls.length === 1, "scrollIntoView appelé " + calls.length + " fois");
    return calls[0];
  };
  const reduce = run((query) => ({ matches: /prefers-reduced-motion: reduce/.test(query) }));
  assert(reduce.behavior === "auto", "mouvement réduit : behavior « " + reduce.behavior + " », attendu « auto »");
  assert(reduce.block === "center", "le message doit rester centré");
  const normal = run(() => ({ matches: false }));
  assert(normal.behavior === "smooth", "sans préférence : behavior « " + normal.behavior + " », attendu « smooth »");
  const broken = run(() => { throw new Error("matchMedia indisponible"); });
  assert(broken.behavior === "smooth", "matchMedia qui lève : défilement lissé conservé, sans exception");
});

check("BL-009 js/app.js relie chaque refus de saisie à son champ (setup:url, setup:code, lock:code, nom) sans retirer le toast", () => {
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  [
    /refuse\("setup:url", "Collez l'adresse de l'équipe\."\)/,
    /refuse\("setup:url", "L'adresse doit commencer par https:\/\/"\)/,
    /refuse\("setup:code", "Code d'accès refusé par le serveur\."\)/,
    /refuse\("lock:code", "Saisissez le code d'accès\."\)/,
    /refuse\("lock:code", "Code d'accès incorrect\."\)/,
    /refuse\(silent \? "settings:name" : "setup:name", "Le nom est obligatoire\."\)/,
  ].forEach((re) => { assert(re.test(app), "js/app.js : refus non relié au champ : " + re); });
  /* L'aide garde le toast et tolère un js/ui.js sans fieldError (ancien fichier en cache). */
  const helper = /function refuse\(key, message\) \{([\s\S]*?)\n  \}/.exec(app);
  assert(helper, "aide refuse() absente de js/app.js");
  assert(/typeof UI\.fieldError === "function"/.test(helper[1]), "refuse() doit tester UI.fieldError");
  assert(/UI\.toast\(message, "error"\)/.test(helper[1]), "refuse() doit garder le toast d'erreur");
});

/* ------------------------------------------------------------- Bilan --- */

if (failures.length) {
  failures.forEach((f) => { console.error("ÉCHEC : " + f.name + "\n  " + (f.error && f.error.message)); });
  console.error("ui-a11y-forms : " + failures.length + " échec(s) sur " + (passed + failures.length));
  process.exit(1);
}
console.log("ui-a11y-forms : " + passed + " contrôles OK");
