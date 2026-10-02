/* BrainstO. : non-régression de « Envoyer quand même » (Réglages, actions de plus de 30 jours)
 * et de la ligne fixe « stockage refusé » de l'écran de connexion.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-stale-release.test.js
 *
 * Charge js/config.js, js/utils.js, js/state.js, js/product-view.js et js/ui.js dans un contexte
 * vm, sur un DOM minimal (même modèle que tests/ui-status-anon.test.js). Sync est une doublure
 * SANS Proxy tolérant : une méthode absente le reste vraiment (repli d'un ancien sync.js).
 *
 * Contrôles :
 *  - BL-004 (Réglages > Système) : bloc absent à zéro ; présent à 1 et à 2 avec les bons accords,
 *    sans contenu d'action ; l'appui ouvre une confirmation, Annuler n'envoie rien, Confirmer
 *    appelle Sync.releaseStale() UNE fois, annonce le résultat par un toast et met l'écran à
 *    jour ; refus de l'envoi annoncé ; aucune erreur sans staleCount ;
 *  - niveau 1 (Réglages) : un simple rappel qui renvoie à Système, sans bouton d'envoi ;
 *  - ligne fixe de stockage refusé sur l'écran de connexion, texte repris d'App (jamais recopié).
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
const queue = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

/* Les contrôles s'exécutent l'un après l'autre : certains attendent une promesse. */
function check(name, fn) { queue.push({ name, fn }); }

const flush = () => new Promise((resolve) => setImmediate(resolve));

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

/* ----------------------------------------------------------- Démarrage --- */

const ME = "p-alice";
const T0 = "2026-10-01T08:00:00.000Z";
const SETTINGS = { name: "settings", raw: "#/settings" };
const SYSTEM = { name: "system", raw: "#/settings/system" };

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

  const shaped = ctx.Core.ensureShape({ revision: 12, participants: [{ id: ME, name: "Alice" }], topics: [] });
  const state = { stale: options.stale || 0, releaseCalls: 0, pending: options.pending || [] };
  const status = { code: "idle", label: "À jour", pending: 0, error: null, lastSyncAt: T0, revision: 12 };

  const Sync = {
    connection: { url: "https://exemple.invalid/exec", token: "", localMode: false, unlocked: true },
    status: () => Object.assign({}, status),
    diagnostics: () => ({
      revision: 12, updatedAt: null, lastSyncAt: T0, lastFlushAt: null, intervalMs: 6000, failures: 0,
      pending: state.pending, persistent: true, durability: "durable", status: Object.assign({}, status),
    }),
    now() {},
  };
  if (options.withStale !== false) {
    Sync.staleCount = () => state.stale;
    Sync.releaseStale = () => {
      state.releaseCalls += 1;
      if (options.reject) { return Promise.reject(new Error("refus")); }
      const released = state.stale;
      state.stale = 0;
      return Promise.resolve(released);
    };
  }
  ctx.Sync = Sync;
  ctx.Store = lenient({ view: shaped, base: shaped, version: 1, queue: [], pendingMessageIds: () => ({}) });
  ctx.App = lenient({
    user: { id: ME, name: "Alice" },
    route: SETTINGS,
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
    ctx, doc: document, state,
    app: () => document.getElementById("app"),
    toasts: () => document.getElementById("toast-root"),
    overlay: () => document.getElementById("overlay-root"),
    go(route) { ctx.App.gate = () => null; ctx.App.route = route; ctx.UI.force(); },
    gate(name) { ctx.App.gate = () => name; ctx.UI.force(); },
  };
}

const release = (t) => t.app().querySelector('[data-key="release-stale"]');
const confirmButton = (t) => t.overlay().querySelector('[data-key="confirm-system"]');

/* Le bouton « Envoyer quand même » ouvre la confirmation ; c'est elle qui envoie. */
function releaseAndConfirm(t) {
  release(t).click();
  const button = confirmButton(t);
  assert(button, "la confirmation doit s'ouvrir avant tout envoi");
  button.click();
}

/* ============================================= Réglages > Système : BL-004 ==== */


check("aucune action retenue : ni texte ni bouton, l'écran des Réglages reste complet", () => {
  const t = boot({ stale: 0 });
  t.go(SYSTEM);
  const text = t.app().textContent;
  assert(text.indexOf("30 jours") < 0, "texte d'action retenue affiché à zéro : « " + text + " »");
  assert(!release(t), "bouton « Envoyer quand même » présent à zéro");
  assert(text.indexOf("Synchroniser maintenant") >= 0 && text.indexOf("Actions en attente") >= 0,
    "les blocs existants de Système doivent rester");
});

check("1 action retenue : texte au singulier, bouton nommé et tactile, aucun contenu d'action", () => {
  const t = boot({ stale: 1, pending: [{ type: "CREATE_MESSAGE", payload: { text: "CONTENU-SECRET" } }] });
  t.go(SYSTEM);
  const text = t.app().textContent;
  assert(text.indexOf("1 action de plus de 30 jours attend sur cet appareil.") >= 0,
    "texte attendu absent : « " + text + " »");
  assert(text.indexOf("attendent") < 0, "accord du pluriel à tort pour une seule action");
  assert(text.indexOf("CONTENU-SECRET") < 0, "le contenu d'une action ne doit jamais s'afficher");
  const button = release(t);
  assert(button, "bouton « Envoyer quand même » absent");
  assert(button.textContent.indexOf("Envoyer quand même") >= 0, "libellé visible : « " + button.textContent + " »");
  const name = button.getAttribute("aria-label");
  assert(name && name.indexOf("Envoyer quand même") === 0, "nom accessible explicite attendu, reprenant le libellé visible : « " + name + " »");
  assert(button.getAttribute("type") === "button", "type=button attendu");
  assert(button.classes().has("btn") && button.classes().has("btn-block"), "classes tactiles existantes (btn, btn-block) attendues");
});

check("2 actions retenues : texte au pluriel", () => {
  const t = boot({ stale: 2 });
  t.go(SYSTEM);
  const text = t.app().textContent;
  assert(text.indexOf("2 actions de plus de 30 jours attendent sur cet appareil.") >= 0, "texte attendu absent : « " + text + " »");
  assert(text.indexOf("attend sur") < 0, "accord du singulier à tort pour deux actions");
  assert(release(t).getAttribute("aria-label").indexOf("les actions") >= 0, "nom accessible au pluriel attendu");
});

check("l'appui appelle releaseStale une seule fois, annonce le résultat et met l'écran à jour", async () => {
  const t = boot({ stale: 2 });
  t.go(SYSTEM);
  releaseAndConfirm(t);
  assert(t.state.releaseCalls === 1, "releaseStale appelé " + t.state.releaseCalls + " fois");
  await flush();
  assert(t.toasts().textContent.indexOf("2 actions vont partir.") >= 0, "annonce absente : « " + t.toasts().textContent + " »");
  assert(!release(t), "le bloc doit disparaître une fois les actions libérées");
  assert(t.app().textContent.indexOf("de plus de 30 jours") < 0, "le texte doit disparaître avec le bloc");
  assert(t.state.releaseCalls === 1, "aucun second appel pendant la mise à jour de l'écran");
});

check("une seule action libérée : annonce au singulier ; rien à libérer : annonce neutre", async () => {
  const one = boot({ stale: 1 });
  one.go(SYSTEM);
  releaseAndConfirm(one);
  await flush();
  assert(one.toasts().textContent.indexOf("1 action va partir.") >= 0, "annonce : « " + one.toasts().textContent + " »");
  const none = boot({ stale: 1 });
  none.go(SYSTEM);
  none.state.stale = 0;   // vidée entre-temps (autre onglet, envoi réussi) : releaseStale rend 0
  releaseAndConfirm(none);
  await flush();
  assert(none.toasts().textContent.indexOf("Plus aucune action n'attend.") >= 0, "annonce : « " + none.toasts().textContent + " »");
});

check("envoi refusé : message d'erreur, les actions restent, le bloc reste", async () => {
  const t = boot({ stale: 1, reject: true });
  t.go(SYSTEM);
  releaseAndConfirm(t);
  await flush();
  assert(t.toasts().textContent.indexOf("L'envoi n'a pas pu être lancé") >= 0, "annonce d'erreur absente : « " + t.toasts().textContent + " »");
  assert(release(t), "le bloc doit rester : l'action attend toujours");
  assert(t.toasts().querySelectorAll(".error").length === 1, "le message doit être un toast d'erreur");
});

check("ancien sync.js en cache (sans staleCount ni releaseStale) : aucun bloc, aucune erreur", () => {
  const t = boot({ stale: 3, withStale: false });
  t.go(SYSTEM);
  assert(typeof t.ctx.Sync.staleCount === "undefined", "la doublure doit être sans staleCount");
  assert(!release(t) && t.app().textContent.indexOf("30 jours") < 0, "aucun bloc attendu sans staleCount");
  assert(t.app().textContent.indexOf("Synchroniser maintenant") >= 0, "Système doit s'afficher");
  /* staleCount sans releaseStale : pas de bouton qui ne ferait rien. */
  const half = boot({ stale: 2 });
  delete half.ctx.Sync.releaseStale;
  half.go(SYSTEM);
  assert(!release(half), "pas de bouton sans releaseStale");
});


check("confirmation : Annuler n'envoie rien, l'action reste retenue", () => {
  const t = boot({ stale: 2 });
  t.go(SYSTEM);
  release(t).click();
  assert(t.state.releaseCalls === 0, "aucun envoi avant la confirmation");
  const text = t.overlay().textContent;
  assert(text.indexOf("Envoyer les actions retenues") >= 0, "titre de la confirmation : « " + text + " »");
  assert(text.indexOf("plus de 30 jours") >= 0, "la confirmation doit dire l'effet : « " + text + " »");
  const cancel = t.overlay().querySelectorAll("button").filter((b) => b.textContent === "Annuler")[0];
  assert(cancel, "bouton Annuler absent");
  cancel.click();
  assert(t.state.releaseCalls === 0, "Annuler ne doit rien envoyer");
  assert(!confirmButton(t), "la confirmation doit se fermer");
  assert(release(t), "le bloc doit rester : rien n'a été envoyé");
});

check("niveau 1 : rappel qui renvoie à Système, sans bouton d'envoi ni compte détaillé", () => {
  const none = boot({ stale: 0 });
  none.go(SETTINGS);
  assert(none.app().textContent.indexOf("30 jours") < 0, "aucun rappel à zéro");
  const one = boot({ stale: 1 });
  one.go(SETTINGS);
  const text = one.app().textContent;
  assert(text.indexOf("1 action de plus de 30 jours attend : elle s'envoie depuis Système.") >= 0, "rappel au singulier : « " + text + " »");
  assert(!release(one), "le bouton d'envoi n'est pas au niveau 1");
  assert(text.indexOf("Synchroniser maintenant") < 0, "la synchronisation n'est pas au niveau 1");
  const two = boot({ stale: 2 });
  two.go(SETTINGS);
  assert(two.app().textContent.indexOf("2 actions de plus de 30 jours attendent : elles s'envoient depuis Système.") >= 0, "rappel au pluriel");
  const old = boot({ stale: 3, withStale: false });
  old.go(SETTINGS);
  assert(old.app().textContent.indexOf("30 jours") < 0, "ancien sync.js : aucun rappel, aucune erreur");
});

/* ========================================== Connexion : stockage refusé ==== */

check("écran de connexion : ligne fixe quand le navigateur refuse le stockage (texte repris d'App)", () => {
  const MSG = "Ce navigateur refuse d'enregistrer des données sur l'appareil : ouvrez BrainstO. dans votre navigateur habituel.";
  const noteOf = (t) => t.app().querySelectorAll(".note").filter((n) => n.textContent === MSG);
  const t = boot();
  t.ctx.App.storageMessage = () => MSG;
  t.gate("connection");
  assert(noteOf(t).length === 1, "ligne fixe attendue une fois sur l'écran de connexion : « " + t.app().textContent + " »");
  assert(t.toasts().textContent === "", "la ligne fixe ne passe pas par un toast");
  t.ctx.App.storageMessage = () => "";
  t.gate("connection");
  assert(noteOf(t).length === 0, "stockage sain : aucune ligne");
  delete t.ctx.App.storageMessage;   // ancien js/app.js sans l'export
  t.gate("connection");
  assert(noteOf(t).length === 0, "App sans storageMessage : aucune ligne, aucune erreur");
  /* Le texte vient d'App : jamais recopié dans js/ui.js, et exporté sans modifier la constante. */
  const ui = SOURCES.filter((s) => s.file === "js/ui.js")[0].code;
  assert(ui.indexOf("refuse d'enregistrer") < 0, "le texte du stockage refusé est recopié dans js/ui.js");
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert(/App\.storageMessage = function \(\) \{ return storageRefused \? STORAGE_REFUSED : ""; \};/.test(app),
    "js/app.js doit exporter App.storageMessage sur STORAGE_REFUSED");
  assert((app.match(/refuse d'enregistrer des données sur l'appareil/g) || []).length === 1,
    "le texte de STORAGE_REFUSED ne doit exister qu'une fois dans js/app.js");
});

/* ------------------------------------------------------------- Bilan --- */

(async () => {
  for (const item of queue) {
    try { await item.fn(); passed += 1; }
    catch (error) { failures.push({ name: item.name, error }); }
  }
  if (failures.length) {
    failures.forEach((f) => { console.error("ÉCHEC : " + f.name + "\n  " + (f.error && f.error.message)); });
    console.error("ui-stale-release : " + failures.length + " échec(s) sur " + (passed + failures.length));
    process.exit(1);
  }
  console.log("ui-stale-release : " + passed + " contrôles OK");
})();
