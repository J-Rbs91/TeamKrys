/* BrainstO. : non-régression du confort produit de l'Interface 4 (lot WP-19).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-product.test.js
 *
 * Charge js/config.js, js/utils.js, js/state.js, js/product-view.js, js/ui.js et js/product-ui.js
 * dans un contexte vm, sur un DOM minimal (même modèle que tests/ui-stale-release.test.js). Le
 * chemin est le vrai : js/ui.js rend l'écran, js/product-ui.js regroupe les cartes ensuite.
 *
 * Contrôles :
 *  - BL-060, BL-061 : la recherche (accents, casse, espaces) et le tri par instants de l'accueil
 *    donnent la même liste que ProductView.visibleTopics, donc que le regroupement de product-ui ;
 *  - BL-062 : « Créer une proposition » depuis un message : titre coupé à une frontière de mot,
 *    description = texte complet ;
 *  - BL-064 : « Imprimer » gardé (window.print absent ou qui lève) ;
 *  - BL-065 : sans copie locale (révision 0), « Contenu pas encore disponible sur cet appareil » ;
 *  - BL-066 : pastille d'état dans la barre de la synthèse ;
 *  - BL-068 : aucune écriture du marqueur « vu » quand rien n'a changé.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SOURCES = ["js/config.js", "js/utils.js", "js/state.js", "js/product-view.js", "js/ui.js", "js/product-ui.js"].map((file) => ({
  file, code: fs.readFileSync(path.join(ROOT, file), "utf8"),
}));

let passed = 0;
const failures = [];
const queue = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function same(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) { throw new Error((message || "valeurs différentes") + " : " + a + " au lieu de " + b); }
}

/* Les contrôles s'exécutent l'un après l'autre. */
function check(name, fn) { queue.push({ name, fn }); }

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

/* Parcours des nœuds de texte, pour le TreeWalker que js/product-ui.js utilise sur l'onboarding. */
FakeDocument.prototype.createTreeWalker = function (rootNode) {
  const texts = [];
  (function collect(node) {
    node.childNodes.forEach((child) => { if (child.nodeType === 3) { texts.push(child); } else { collect(child); } });
  })(rootNode);
  let i = 0;
  return { nextNode() { return texts[i++] || null; } };
};

/* Comme un vrai navigateur : un textarea n'a pas d'attribut `value`, son texte par défaut est son contenu. */
Object.defineProperty(FakeElement.prototype, "value", {
  configurable: true,
  get() {
    if (this._value !== undefined) { return this._value; }
    return this.localName === "textarea" ? this.textContent : (this.getAttribute("value") || "");
  },
  set(v) { this._value = String(v); },
});

/* ----------------------------------------------------------- Démarrage --- */

const ME = "p-alice";
const T0 = "2026-10-01T08:00:00.000Z";
const TOPICS = { name: "topics", raw: "#/" };
const MEETING = { name: "meeting", raw: "#/meeting" };
const topicRoute = (id) => ({ name: "topic", topicId: id, raw: "#/topic/" + id });
const SEEN_KEY = "brainsto.seenTopics.v1";

function mkTopic(id, title, over) {
  return Object.assign({
    id, title, description: "", status: "open",
    createdBy: { id: "p-bob", name: "Bob" },
    createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-20T08:00:00.000Z",
    messages: [], proposals: [], conclusions: [], conclusionVotes: {},
  }, over || {});
}

/* options : topics, route, revision, lastSyncAt, code (état de Sync), print ("absent" | "throws"). */
function boot(options) {
  options = options || {};
  const document = new FakeDocument();
  ["app", "overlay-root", "toast-root", "onboarding-root"].forEach((id) => {
    const node = document.createElement("div");
    node.setAttribute("id", id);
    document.body.appendChild(node);
  });
  const writes = [];
  const local = storage();
  const realSet = local.setItem;
  local.setItem = (k, v) => { writes.push(k); realSet(k, v); };
  const printCalls = { count: 0 };
  const sandbox = {
    console, document, Node: FakeNode, Element: FakeElement, HTMLElement: FakeElement, NodeFilter: { SHOW_TEXT: 4 },
    navigator: { onLine: true, userAgent: "node-test", language: "fr-FR" },
    location: { hash: "#/", href: "http://localhost/", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "" },
    history: { state: null, length: 1, pushState() {}, replaceState() {}, back() {} },
    localStorage: local, sessionStorage: storage(),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    innerWidth: 390, innerHeight: 800, pageYOffset: 0, scrollTo() {},
    addEventListener() {}, removeEventListener() {},
    crypto: require("crypto").webcrypto, TextEncoder,
  };
  if (options.print === "throws") { sandbox.print = () => { throw new Error("impression refusée"); }; }
  else if (options.print !== "absent") { sandbox.print = () => { printCalls.count += 1; }; }
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  SOURCES.forEach((s) => vm.runInContext(s.code, ctx, { filename: s.file }));

  const revision = options.revision === undefined ? 12 : options.revision;
  const shaped = ctx.Core.ensureShape({ revision, participants: [{ id: ME, name: "Alice" }], topics: [] });
  shaped.topics = options.topics || [];
  const status = {
    code: options.code || "idle", label: "À jour", pending: 0, error: null,
    lastSyncAt: options.lastSyncAt === undefined ? T0 : options.lastSyncAt, revision,
  };
  ctx.Sync = lenient({
    connection: { url: "https://exemple.invalid/exec", token: "", localMode: options.code === "local", unlocked: true },
    status: () => Object.assign({}, status),
    now() {},
    staleCount: () => 0,
    releaseStale: () => Promise.resolve(0),
  });
  ctx.Store = lenient({ view: shaped, base: shaped, version: 1, queue: [], pendingMessageIds: () => ({}) });
  ctx.App = lenient({
    user: { id: ME, name: "Alice" },
    route: options.route || TOPICS,
    gate: () => null,
    ownsMessage: () => false,
    ownsItem: () => false,
    onboardingWanted: () => false,
    onboardingState: () => "vue",
    connectionConfigured: () => true,
    actions: lenient({}),
  });
  ctx.UI.init();

  return {
    ctx, doc: document, status, writes, printCalls, store: local,
    app: () => document.getElementById("app"),
    toasts: () => document.getElementById("toast-root"),
    go(route) { ctx.App.route = route; ctx.UI.force(); },
    search(query) { ctx.UI.set({ search: query }); ctx.UI.force(); },
  };
}

/* ======================================================= Accueil : BL-060, BL-061 ==== */

const keyOf = (node) => node.getAttribute("data-key") || "";

/* Les cartes telles que l'écran les montre : rangées par js/product-ui.js dans leur groupe de
 * maturité, ou « en vrac » si les deux listes (celle de js/ui.js et celle de product-ui) ne
 * comptent pas le même nombre de cartes. */
function cardsOf(t) {
  const grid = t.app().querySelector(".topics-grid");
  const flat = grid ? grid.children.filter((c) => c.localName === "button" && c.classes().has("card")) : [];
  const sections = t.app().querySelectorAll(".product-topic-group").map((s) => ({
    status: s.getAttribute("data-topic-status"),
    keys: s.querySelectorAll("button.card").map(keyOf),
  }));
  return { flat, sections, grouped: [].concat.apply([], sections.map((s) => s.keys)) };
}

function eightTopics() {
  return [
    mkTopic("t1", "Préparer la réunion de rentrée", { description: "Ordre du jour", updatedAt: "2026-09-20T08:00:00.000Z" }),
    mkTopic("t2", "Commande   du samedi (urgent) [x]", { updatedAt: "2026-09-19T08:00:00.000Z" }),
    mkTopic("t3", "Café du matin", { status: "ready", description: "À l'étage", updatedAt: "2026-09-18T08:00:00.000Z" }),
    mkTopic("t4", "Cœur de l'équipe", { updatedAt: "2026-09-17T08:00:00.000Z" }),
    mkTopic("t5", "Horaires d'ouverture du samedi", { status: "ready", updatedAt: "2026-09-16T08:00:00.000Z" }),
    mkTopic("t6", "Budget du trimestre", { status: "closed", updatedAt: "2026-09-15T08:00:00.000Z" }),
    mkTopic("t7", "Ancien projet", { status: "archived", updatedAt: "2026-09-14T08:00:00.000Z" }),
    mkTopic("t8", "Ambiance de l'équipe", { updatedAt: "2026-09-13T08:00:00.000Z" }),
  ];
}

check("BL-060 : l'accueil retrouve « reunion », « CAFÉ », « commande du samedi » ; cartes et regroupement d'accord", () => {
  const t = boot({ topics: eightTopics() });
  const cases = [
    ["reunion", ["topic-t1"]], ["REUNION", ["topic-t1"]], ["réunion", ["topic-t1"]],
    ["commande du samedi", ["topic-t2"]], ["  commande    du   samedi ", ["topic-t2"]],
    ["cafe", ["topic-t3"]], ["CAFÉ", ["topic-t3"]], ["etage", ["topic-t3"]], ["coeur", ["topic-t4"]],
    ["(urgent)", ["topic-t2"]], ["[x]", ["topic-t2"]],
  ];
  cases.forEach((item) => {
    t.search(item[0]);
    const c = cardsOf(t);
    same(c.grouped, item[1], "recherche « " + item[0] + " »");
    assert(c.flat.length === 0, "recherche « " + item[0] + " » : " + c.flat.length + " carte(s) hors regroupement (les deux listes divergent)");
    assert(t.app().textContent.indexOf("Aucun sujet ne correspond") < 0, "recherche « " + item[0] + " » : message d'absence affiché à tort");
  });
  t.search("zzz");
  assert(t.app().textContent.indexOf("Aucun sujet ne correspond à « zzz ».") >= 0, "message d'absence attendu : « " + t.app().textContent + " »");
  assert(cardsOf(t).grouped.length === 0 && cardsOf(t).flat.length === 0, "aucune carte attendue pour « zzz »");
});

check("BL-060, BL-061 : pour chaque saisie, chaque groupe montre exactement ProductView.visibleTopics, dans le même ordre", () => {
  const t = boot({ topics: eightTopics() });
  ["", "samedi", "equipe", "  SAMEDI  "].forEach((query) => {
    t.search(query);
    const c = cardsOf(t);
    const want = t.ctx.ProductView.visibleTopics(t.ctx.Store.view.topics, query, false);
    assert(want.length > 0, "la saisie « " + query + " » doit trouver des sujets");
    assert(c.flat.length === 0, "saisie « " + query + " » : cartes hors regroupement");
    ["ready", "open", "closed"].forEach((status) => {
      const section = c.sections.filter((s) => s.status === status)[0];
      same(section ? section.keys : [],
        want.filter((x) => x.status === status).map((x) => "topic-" + x.id),
        "saisie « " + query + " », groupe " + status);
    });
  });
});

check("BL-061 : l'accueil classe par instants (fuseau), une date illisible passe en dernier", () => {
  const t = boot({ topics: [
    mkTopic("a", "Sujet A", { updatedAt: "2026-09-30T10:00:00+02:00" }),
    mkTopic("b", "Sujet B", { updatedAt: "2026-09-30T09:00:00Z" }),
    mkTopic("c", "Sujet C", { updatedAt: "pas une date" }),
    mkTopic("d", "Sujet D", { updatedAt: "2026-10-01T00:00:00Z" }),
  ] });
  t.go(TOPICS);
  const c = cardsOf(t);
  same(c.grouped, ["topic-d", "topic-b", "topic-a", "topic-c"], "ordre de l'accueil");
  assert(c.flat.length === 0, "cartes hors regroupement");
});

/* ================================================ Proposition depuis un message : BL-062 ==== */

function fromMessage(t, text) {
  t.go(topicRoute("t1"));
  t.ctx.UI.set({ sheet: null, modal: { type: "createProposal", topicId: "t1", fromText: text } });
  const title = t.doc.querySelector('[data-draft="newProposal:t1:title"]');
  const desc = t.doc.querySelector('[data-draft="newProposal:t1:desc"]');
  assert(title && desc, "fenêtre « Nouvelle proposition » introuvable");
  const got = { title: title.value, desc: desc.value };
  t.ctx.UI.set({ sheet: null, modal: null });
  return got;
}

check("BL-062 : message long, titre coupé à une frontière de mot avec « … », description = texte complet", () => {
  const t = boot({ topics: [mkTopic("t1", "Sujet 1")] });
  const words = [];
  for (let i = 0; i < 70; i += 1) { words.push("mot" + i); }
  const LONG = words.join(" ");
  assert(LONG.length > 347, "le message de test doit dépasser 347 caractères");
  const got = fromMessage(t, LONG);
  assert(got.title.length <= 200, "titre trop long : " + got.title.length);
  assert(got.title.length >= 190, "titre coupé trop tôt : " + got.title.length);
  assert(got.title.slice(-1) === "…", "le titre coupé doit finir par « … » : « " + got.title.slice(-12) + " »");
  const core = got.title.slice(0, -1);
  assert(LONG.indexOf(core) === 0, "le titre doit être le début du message");
  assert(LONG.charAt(core.length) === " ", "la coupe doit tomber sur une frontière de mot (suite : « " + LONG.slice(core.length, core.length + 8) + " »)");
  assert(core.slice(-1) !== " ", "pas d'espace avant « … »");
  assert(got.desc === LONG, "la description doit être le texte complet (" + got.desc.length + " caractères)");
});

check("BL-062 : message court : titre = texte, description vide ; une ligne, sauts de ligne gardés en description", () => {
  const t = boot({ topics: [mkTopic("t1", "Sujet 1")] });
  const short = fromMessage(t, "On manque de monde le samedi matin.");
  same(short, { title: "On manque de monde le samedi matin.", desc: "" }, "message court");
  const exact = "ab ".repeat(66) + "ab";   // 200 caractères : tient tel quel
  assert(exact.length === 200, "test mal calibré");
  same(fromMessage(t, exact), { title: exact, desc: "" }, "200 caractères");
  const over = exact + "c";                 // 201 : coupé
  const cut = fromMessage(t, over);
  assert(cut.title.length <= 200 && cut.title.slice(-1) === "…" && cut.desc === over, "201 caractères : " + JSON.stringify(cut.title.slice(-8)));
  const lines = "Idée :\n- une équipe\n- deux équipes";
  same(fromMessage(t, lines), { title: "Idée : - une équipe - deux équipes", desc: lines }, "message sur plusieurs lignes");
});

check("BL-062 : un seul mot géant ou un emoji à la coupe : coupe brute, jamais une moitié de caractère", () => {
  const t = boot({ topics: [mkTopic("t1", "Sujet 1")] });
  const giant = "x".repeat(300);
  const a = fromMessage(t, giant);
  assert(a.title === "x".repeat(199) + "…" && a.desc === giant, "mot géant : " + a.title.length);
  const emoji = "a".repeat(198) + "😀" + "b".repeat(50);
  const b = fromMessage(t, emoji);
  assert(b.title.length <= 200 && b.title.slice(-1) === "…", "emoji : titre " + b.title.length);
  assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(b.title), "moitié de paire UTF-16 dans le titre");
  assert(b.desc === emoji, "description complète attendue");
});

/* ========================================================= Imprimer : BL-064 ==== */

const PRINT_MESSAGE = "Impression indisponible ici : affichez la synthèse à l'écran ou ouvrez-la dans votre navigateur.";

function pressPrint(t) {
  t.go(MEETING);
  const button = t.app().querySelectorAll(".topbar-actions button").filter((b) => b.textContent.indexOf("Imprimer") >= 0)[0];
  assert(button, "bouton « Imprimer » introuvable");
  button.click();
}

check("BL-064 : window.print existe : appelé une fois, aucun message", () => {
  const t = boot({ route: MEETING });
  pressPrint(t);
  assert(t.printCalls.count === 1, "window.print appelé " + t.printCalls.count + " fois");
  assert(t.toasts().textContent.indexOf("Impression indisponible") < 0, "message d'indisponibilité affiché à tort");
});

check("BL-064 : window.print absent (WebView) : message clair, aucune exception, l'écran reste la synthèse", () => {
  const t = boot({ route: MEETING, print: "absent" });
  pressPrint(t);
  assert(t.toasts().textContent.indexOf(PRINT_MESSAGE) >= 0, "message attendu : « " + t.toasts().textContent + " »");
  assert(t.app().textContent.indexOf("Synthèse imprimable") >= 0, "l'écran doit rester la synthèse");
});

check("BL-064 : window.print qui lève : même message, aucune exception", () => {
  const t = boot({ route: MEETING, print: "throws" });
  pressPrint(t);
  assert(t.toasts().textContent.indexOf(PRINT_MESSAGE) >= 0, "message attendu : « " + t.toasts().textContent + " »");
});

/* ======================================================= Introuvable : BL-065 ==== */

const WAITING = "Contenu pas encore disponible sur cet appareil";

check("BL-065 : sans copie locale (révision 0, rien reçu), « pas encore disponible » au lieu d'« Introuvable »", () => {
  const t = boot({ revision: 0, lastSyncAt: null, route: topicRoute("inconnu") });
  [topicRoute("inconnu"), { name: "proposals", topicId: "inconnu", raw: "#/topic/inconnu/proposals" },
    { name: "conclusion", topicId: "inconnu", raw: "#/topic/inconnu/conclusion" },
    { name: "branch", topicId: "inconnu", messageId: "m1", raw: "#/topic/inconnu/branch/m1" }].forEach((route) => {
    t.go(route);
    const text = t.app().textContent;
    assert(text.indexOf(WAITING) >= 0, route.name + " : texte attendu absent : « " + text + " »");
    ["Introuvable", "n'existe plus", "supprimé", "archivé"].forEach((word) => {
      assert(text.indexOf(word) < 0, route.name + " : « " + word + " » ne doit pas s'afficher sans copie locale : « " + text + " »");
    });
  });
  t.go(topicRoute("inconnu"));
  assert(t.doc.title === "Pas encore disponible - BrainstO.", "titre du document : « " + t.doc.title + " »");
});

check("BL-065 : une fois l'espace reçu, un sujet absent reste « Introuvable » ; en mode local aussi", () => {
  const received = boot({ revision: 12, lastSyncAt: T0, route: topicRoute("inconnu") });
  received.go(topicRoute("inconnu"));
  let text = received.app().textContent;
  assert(text.indexOf("Introuvable") >= 0 && text.indexOf("Ce contenu n'existe plus") >= 0, "écran habituel attendu : « " + text + " »");
  assert(text.indexOf(WAITING) < 0, "« pas encore disponible » à tort après réception");
  assert(received.doc.title === "Introuvable - BrainstO.", "titre du document : « " + received.doc.title + " »");
  const local = boot({ revision: 0, lastSyncAt: null, code: "local", route: topicRoute("inconnu") });
  local.go(topicRoute("inconnu"));
  text = local.app().textContent;
  assert(text.indexOf("Introuvable") >= 0 && text.indexOf(WAITING) < 0, "mode local : écran habituel attendu : « " + text + " »");
});

/* ================================================== Synthèse : pastille, BL-066 ==== */

check("BL-066 : la synthèse montre la pastille d'état, hors de la barre déjà pleine, retirée de l'impression", () => {
  const t = boot({ route: MEETING });
  t.go(MEETING);
  const pills = t.app().querySelectorAll(".status-pill");
  assert(pills.length === 1, "une pastille attendue sur la synthèse : " + pills.length);
  assert(t.app().querySelectorAll(".topbar .status-pill").length === 0,
    "pas de pastille dans la barre : elle porte déjà « Imprimer » (le titre y est réduit à « Ré… » à 390 px)");
  assert(t.app().querySelectorAll(".no-print .status-pill").length === 1, "la pastille doit se trouver dans une zone no-print");
  assert(t.app().querySelectorAll('[role="status"]').length === 1, "une seule région role=status par écran");
  assert(pills[0].textContent.indexOf("À jour") >= 0, "libellé de l'état attendu : « " + pills[0].textContent + " »");
  t.status.code = "offline";
  t.status.label = "Hors ligne";
  t.ctx.UI.refreshStatus();
  assert(pills[0].classes().has("status-offline"), "la pastille doit suivre l'état en place");
  const imprimer = t.app().querySelectorAll(".topbar-actions button").filter((b) => b.textContent.indexOf("Imprimer") >= 0)[0];
  assert(imprimer && imprimer.classes().has("no-print"), "le bouton Imprimer reste marqué no-print");
  const css = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");
  assert(/@media print\s*\{[^}]*\.no-print[^}]*display:\s*none/.test(css), "css/app.css doit masquer .no-print à l'impression");
});

/* ============================================ Marqueur « vu » sans écriture inutile : BL-068 ==== */

check("BL-068 : un rendu sans changement n'écrit plus le marqueur « vu » ; un vrai changement l'écrit une fois", () => {
  const t = boot({ topics: [mkTopic("t1", "Sujet 1")], route: topicRoute("t1") });
  const seenWrites = () => t.writes.filter((k) => k === SEEN_KEY).length;
  t.ctx.UI.force();
  const first = seenWrites();
  assert(first >= 1, "le marqueur « vu » doit exister après la consultation (sinon ce contrôle ne prouve rien)");
  t.ctx.UI.force(); t.ctx.UI.force(); t.ctx.UI.force();
  assert(seenWrites() === first, "écritures sur trois rendus identiques : " + (seenWrites() - first));
  const topic = t.ctx.Store.view.topics[0];
  topic.status = "ready";
  topic.updatedAt = "2026-10-01T09:00:00.000Z";
  t.ctx.UI.force();
  assert(seenWrites() === first + 1, "un changement doit être enregistré une fois : " + (seenWrites() - first));
  assert(JSON.parse(t.store.getItem(SEEN_KEY)).topics.t1.status === "ready", "le marqueur doit refléter le changement");
  t.ctx.UI.force();
  assert(seenWrites() === first + 1, "puis plus aucune écriture");
});

/* ------------------------------------------------------------- Bilan --- */

(async () => {
  for (const item of queue) {
    try { await item.fn(); passed += 1; }
    catch (error) { failures.push({ name: item.name, error }); }
  }
  if (failures.length) {
    failures.forEach((f) => { console.error("ÉCHEC : " + f.name + "\n  " + (f.error && f.error.message)); });
    console.error("ui-product : " + failures.length + " échec(s) sur " + (passed + failures.length));
    process.exit(1);
  }
  console.log("ui-product : " + passed + " contrôles OK");
})();
