/* BrainstO. — tests de la coquille PWA (service-worker.js et index.html).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/service-worker.test.js
 *
 * Le service worker tourne dans un contexte vm avec un faux `self`, de faux
 * `caches` (CacheStorage en mémoire, ordre de création conservé), un faux
 * `fetch` et une fausse `Response`. Questions posées (SPEC §24) :
 *  - l'application installée démarre-t-elle depuis sa coquille même quand le
 *    réseau est connecté mais muet (lie-fi) ou répond une erreur (503) ?
 *  - le HTML et les scripts viennent-ils toujours du MÊME cache versionné ?
 *  - la purge à l'activation épargne-t-elle les caches d'une autre application
 *    de la même origine (GitHub Pages) ?
 * Puis index.html : garde de démarrage avant le premier script, textes,
 * politique de référent, et empreinte de la garde dans la CSP si elle existe.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SW_SOURCE = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SW_URL = "https://exemple.github.io/brainsto/service-worker.js";
const SCOPE = "https://exemple.github.io/brainsto/";

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

async function test(name, fn) {
  try { await fn(); passed += 1; }
  catch (e) { failures.push(name + " : " + e.message); }
}

/* ------------------------------------------------------------ Faux web --- */

function FakeResponse(body, init) {
  this.body = String(body == null ? "" : body);
  this.status = (init && init.status) || 200;
  this.ok = this.status >= 200 && this.status < 300;
  this.type = (init && init.type) || "basic";
}
FakeResponse.prototype.clone = function () { return new FakeResponse(this.body, this); };
FakeResponse.prototype.text = function () { return Promise.resolve(this.body); };

function FakeRequest(url, init) {
  this.url = new URL(typeof url === "string" ? url : url.url, SW_URL).href;
  this.method = (init && init.method) || "GET";
  this.mode = (init && init.mode) || "cors";
  this.cache = (init && init.cache) || "default";
}

function makeCaches() {
  const stores = new Map();
  const log = { puts: [], deletes: [] };
  const keyOf = (req) => new URL(typeof req === "string" ? req : req.url, SW_URL).href;
  function cacheOf(name) {
    const map = stores.get(name);
    return {
      match: (req) => Promise.resolve(map.has(keyOf(req)) ? map.get(keyOf(req)).clone() : undefined),
      put: (req, res) => { log.puts.push({ cache: name, url: keyOf(req), status: res.status }); map.set(keyOf(req), res); return Promise.resolve(); },
      keys: () => Promise.resolve(Array.from(map.keys()))
    };
  }
  return {
    log,
    seed(name, files) {
      if (!stores.has(name)) { stores.set(name, new Map()); }
      Object.keys(files).forEach((file) => stores.get(name).set(keyOf(file), new FakeResponse(files[file])));
    },
    api: {
      open: (name) => { if (!stores.has(name)) { stores.set(name, new Map()); } return Promise.resolve(cacheOf(name)); },
      match: (req) => {
        for (const map of stores.values()) { if (map.has(keyOf(req))) { return Promise.resolve(map.get(keyOf(req)).clone()); } }
        return Promise.resolve(undefined);
      },
      keys: () => Promise.resolve(Array.from(stores.keys())),
      has: (name) => Promise.resolve(stores.has(name)),
      delete: (name) => { log.deletes.push(name); return Promise.resolve(stores.delete(name)); }
    }
  };
}

/* network(request) -> Promise<FakeResponse> ; chaque appel est journalisé. */
function boot(network) {
  const handlers = {};
  const caches = makeCaches();
  const calls = [];
  const state = { claimed: false };
  const self = {
    location: new URL(SW_URL),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { claim: () => { state.claimed = true; return Promise.resolve(); } },
    skipWaiting: () => {}
  };
  const sandbox = {
    self, caches: caches.api, URL, Promise, console, setTimeout, clearTimeout,
    Request: FakeRequest, Response: FakeResponse,
    fetch: (req) => { calls.push(new URL(typeof req === "string" ? req : req.url, SW_URL).href); return network(req); }
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox, { filename: "service-worker.js" });
  const version = vm.runInContext("CACHE_VERSION", sandbox);
  return { handlers, caches, calls, state, version };
}

function within(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve, reject) => setTimeout(() => reject(new Error(label + " : aucune réponse après " + ms + " ms")), ms))
  ]);
}

function fetchEvent(sw, url, mode) {
  const event = { request: new FakeRequest(url, { mode: mode || "no-cors" }), response: null };
  event.respondWith = (p) => { event.response = p; };
  sw.handlers.fetch(event);
  return event;
}

const never = () => new Promise(() => {});
const SHELL = (sw) => ({ "./": "coquille " + sw.version, "index.html": "coquille " + sw.version, "js/app.js": "scripts " + sw.version });

/* ------------------------------------------------------------- Tests SW --- */

async function run() {
  await test("BL-007 lie-fi : la navigation est servie par la coquille sans attendre le réseau", async () => {
    const sw = boot(never);
    sw.caches.seed(sw.version, SHELL(sw));
    const event = fetchEvent(sw, SCOPE, "navigate");
    assert(event.response, "la navigation n'est pas prise en charge");
    const res = await within(event.response, 300, "navigation en lie-fi");
    assert(await res.text() === "coquille " + sw.version, "la navigation ne sert pas la coquille du cache versionné");
  });

  await test("BL-007 HTTP 503 : coquille servie, rien mis en cache", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("Service Unavailable", { status: 503 })));
    sw.caches.seed(sw.version, SHELL(sw));
    const res = await within(fetchEvent(sw, SCOPE + "index.html", "navigate").response, 300, "navigation 503");
    assert(res.status === 200 && await res.text() === "coquille " + sw.version, "une page 503 remplace la coquille");
    await new Promise((r) => setTimeout(r, 20));
    assert(sw.caches.log.puts.length === 0, "une réponse de navigation a été mise en cache : " + JSON.stringify(sw.caches.log.puts));
  });

  await test("BL-007 adresse de l'application avec paramètres (lien partagé) : coquille", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("réseau", { status: 200 })));
    sw.caches.seed(sw.version, SHELL(sw));
    const res = await within(fetchEvent(sw, SCOPE + "?fbclid=abc", "navigate").response, 300, "navigation avec paramètres");
    assert(await res.text() === "coquille " + sw.version, "la coquille n'est pas servie pour ./?fbclid=…");
  });

  await test("BL-007 HTML et scripts viennent du MÊME cache versionné (jamais d'un autre cache)", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("réseau v-suivante", { status: 200 })));
    sw.caches.seed("brainsto-v0.0.1", { "./": "coquille ancienne", "index.html": "coquille ancienne", "js/app.js": "scripts anciens" });
    sw.caches.seed(sw.version, SHELL(sw));
    const html = await within(fetchEvent(sw, SCOPE, "navigate").response, 300, "navigation");
    const js = await within(fetchEvent(sw, SCOPE + "js/app.js").response, 300, "script");
    assert(await html.text() === "coquille " + sw.version, "HTML pris ailleurs que dans " + sw.version);
    assert(await js.text() === "scripts " + sw.version, "scripts pris ailleurs que dans " + sw.version);
  });

  await test("BL-007 appareil neuf (aucune coquille) : la navigation passe par le réseau, sans mise en cache", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("Service Unavailable", { status: 503 })));
    const res = await within(fetchEvent(sw, SCOPE, "navigate").response, 300, "navigation sans coquille");
    assert(res.status === 503 && sw.calls.length === 1, "sans coquille, la navigation doit aller au réseau");
    await new Promise((r) => setTimeout(r, 20));
    assert(sw.caches.log.puts.length === 0, "une réponse non OK a été mise en cache");
  });

  await test("BL-007 hors ligne (réseau refusé) sans coquille dans le cache versionné : erreur réseau propagée", async () => {
    const sw = boot(() => Promise.reject(new TypeError("Failed to fetch")));
    /* Rejet ou absence de réponse : dans les deux cas le navigateur voit une erreur réseau. */
    const res = await within(fetchEvent(sw, SCOPE, "navigate").response, 300, "navigation hors ligne").catch(() => null);
    assert(!res, "une réponse a été inventée sans coquille");
  });

  await test("BL-007 autre page de la portée (document du dépôt) : réseau d'abord, inchangé", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("guide", { status: 200 })));
    sw.caches.seed(sw.version, SHELL(sw));
    const res = await within(fetchEvent(sw, SCOPE + "docs/guide.html", "navigate").response, 300, "autre page");
    assert(await res.text() === "guide", "une autre page de la portée est remplacée par la coquille");
  });

  await test("BL-007 ressource statique : jamais de mise en cache d'une réponse non OK", async () => {
    const sw = boot(() => Promise.resolve(new FakeResponse("introuvable", { status: 404 })));
    const res = await within(fetchEvent(sw, SCOPE + "assets/icons/inconnu.png").response, 300, "ressource");
    assert(res.status === 404, "la réponse du réseau n'est pas rendue telle quelle");
    await new Promise((r) => setTimeout(r, 20));
    assert(sw.caches.log.puts.length === 0, "une réponse 404 a été mise en cache");
  });

  await test("Pandore : la synthèse vient du RÉSEAU d'abord (jamais du cache versionné), copie hors ligne à part, ancien cache purgé", async () => {
    let online = true;
    const sw = boot(() => online ? Promise.resolve(new FakeResponse("{\"points\":[1]}", { status: 200 })) : Promise.reject(new TypeError("Failed to fetch")));
    sw.caches.seed(sw.version, Object.assign(SHELL(sw), { "pandore/synthese.json": "{\"points\":[\"ancienne\"]}" }));
    sw.caches.seed("brainsto-idees-v1", { "idees/reformulees.json": "{}" });
    const fresh = await within(fetchEvent(sw, SCOPE + "pandore/synthese.json").response, 300, "synthèse en ligne");
    assert(await fresh.text() === "{\"points\":[1]}", "la synthèse a été servie depuis le cache versionné");
    await new Promise((r) => setTimeout(r, 20));
    assert(sw.caches.log.puts.some((p) => p.cache === "brainsto-pandore-v1"), "pas de copie hors ligne : " + JSON.stringify(sw.caches.log.puts));
    online = false;
    const offline = await within(fetchEvent(sw, SCOPE + "pandore/synthese.json").response, 300, "synthèse hors ligne");
    assert(await offline.text() === "{\"points\":[1]}", "hors ligne, la dernière copie reçue doit servir");
    let waited = null;
    sw.handlers.activate({ waitUntil: (p) => { waited = p; } });
    await within(waited, 300, "activation");
    const keys = await sw.caches.api.keys();
    assert(keys.indexOf("brainsto-pandore-v1") >= 0, "la copie de la synthèse ne doit pas être purgée à la mise à jour");
    assert(keys.indexOf("brainsto-idees-v1") < 0, "l'ancien cache d'avant Pandore doit être purgé : " + JSON.stringify(keys));
  });

  await test("BL-051 purge : seuls les anciens caches « brainsto- » sont supprimés", async () => {
    const sw = boot(never);
    sw.caches.seed("autre-application-v7", { "/autre/index.html": "autre" });
    sw.caches.seed("brainsto-v0.0.1", { "index.html": "ancienne" });
    sw.caches.seed(sw.version, SHELL(sw));
    let waited = null;
    sw.handlers.activate({ waitUntil: (p) => { waited = p; } });
    await within(waited, 300, "activation");
    const keys = await sw.caches.api.keys();
    assert(keys.indexOf("autre-application-v7") >= 0, "le cache d'une autre application a été supprimé");
    assert(keys.indexOf("brainsto-v0.0.1") < 0, "l'ancien cache de BrainstO. n'a pas été purgé");
    assert(keys.indexOf(sw.version) >= 0, "le cache courant a été supprimé");
    assert(sw.state.claimed, "clients.claim() n'est plus appelé");
  });

  /* ------------------------------------------------------- index.html --- */

  const head = HTML.slice(0, HTML.indexOf("</head>"));
  const inline = [];
  HTML.replace(/<script>([\s\S]*?)<\/script>/g, (m, code) => { inline.push(code); return m; });
  /* Deux scripts en ligne : le thème, dans <head>, puis la garde, dans <body>. La garde se reconnaît à son texte. */
  const GUARD = inline.find((code) => code.indexOf("trop ancien") >= 0) || "";
  const THEME = inline.find((code) => code.indexOf("brainsto.theme") >= 0) || "";

  function runGuard(globals) {
    const appended = [];
    const make = (tag) => ({ tag, style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } });
    const sandbox = Object.assign({
      document: { body: { appendChild: (el) => appended.push(el) }, createElement: make, createTextNode: (t) => ({ text: t }), querySelector: () => null },
      window: { addEventListener: () => {} }
    }, globals || {});
    vm.runInNewContext(GUARD, sandbox);
    return appended;
  }
  const textOf = (el) => el.children.map((c) => c.text || "").join("");
  const OLD = "Ce navigateur est trop ancien pour BrainstO. Ouvrez l'adresse dans un navigateur récent (Chrome, Safari, Firefox ou Samsung Internet).";

  await test("BL-052 garde de démarrage en ligne AVANT le premier script", async () => {
    assert(GUARD, "aucune garde en ligne dans index.html");
    const guardAt = HTML.indexOf(GUARD);
    const firstSrc = HTML.indexOf("<script src=");
    assert(guardAt > HTML.indexOf("<body") && guardAt < firstSrc, "la garde doit précéder le premier <script src>");
  });

  await test("BL-052 la garde ne bloque pas un navigateur récent et ne teste aucune API qui a un repli", async () => {
    assert(runGuard().length === 0, "la garde affiche un bandeau sur un navigateur complet");
    ["indexedDB", "localStorage", "sessionStorage", "randomUUID", "crypto", "serviceWorker", "fetch", "AbortController"].forEach((api) => {
      assert(GUARD.indexOf(api) < 0, "la garde teste " + api + ", qui a un repli ou une garde dans le code");
    });
  });

  await test("BL-052 navigateur trop ancien : bandeau plein écran, texte exact", async () => {
    [{ Promise: undefined }, { Object: { keys: Object.keys } }].forEach((missing) => {
      const banner = runGuard(missing);
      assert(banner.length === 1, "aucun bandeau quand il manque " + Object.keys(missing)[0]);
      assert(textOf(banner[0]) === OLD, "texte du bandeau : " + JSON.stringify(textOf(banner[0])));
      assert(/position:\s*fixed/.test(banner[0].style.cssText || banner[0].attrs.style || ""), "le bandeau n'est pas plein écran");
    });
  });

  /* ------------------------------------------------------------ Thème --- */

  function runTheme(opts) {
    const o = opts || {};
    const store = Object.assign({}, o.store || {});
    const listeners = [];
    const query = { matches: !!o.systemDark, addEventListener: (type, fn) => { listeners.push(fn); } };
    const html = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const metas = [{ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }, { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }];
    const win = {
      document: { documentElement: html, querySelectorAll: () => metas },
      matchMedia: () => query,
      localStorage: o.noStorage ? null : {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
      }
    };
    vm.runInNewContext(THEME, { window: win, JSON });
    return { win, html, metas, store, query, flip: (dark) => { query.matches = dark; listeners.forEach((fn) => fn()); } };
  }

  await test("Thème : script en ligne dans <head>, AVANT les feuilles de style (aucune image dans le mauvais thème)", async () => {
    assert(THEME, "aucun script de thème en ligne dans index.html");
    const at = HTML.indexOf(THEME);
    assert(at < HTML.indexOf("</head>") && at < HTML.indexOf('<link rel="stylesheet"'), "le script de thème doit précéder les feuilles de style, dans <head>");
    assert(/html\[data-theme=dark\]\{background:#0f0d0b\}/.test(head), "le fond d'avant feuille de style doit suivre data-theme, pas le téléphone");
  });

  await test("Thème : Auto suit le téléphone, y compris quand il change en cours d'ouverture", async () => {
    const t = runTheme({ systemDark: false });
    assert(t.html.attrs["data-theme"] === "light", "Auto sur un téléphone en clair : " + t.html.attrs["data-theme"]);
    t.flip(true);
    assert(t.html.attrs["data-theme"] === "dark", "le téléphone passe en sombre, l'application ne suit pas");
    assert(t.metas.every((m) => m.attrs.content === "#0f0d0b"), "la barre du navigateur (theme-color) ne suit pas");
    assert(t.win.Theme.get() === "auto", "choix par défaut : " + t.win.Theme.get());
  });

  await test("Thème : un choix imposé tient contre le téléphone, et se retient", async () => {
    const t = runTheme({ systemDark: false });
    t.win.Theme.set("dark");
    assert(t.html.attrs["data-theme"] === "dark", "Sombre choisi sur un téléphone en clair : " + t.html.attrs["data-theme"]);
    assert(t.store["brainsto.theme"] === '"dark"', "le choix n'est pas enregistré : " + JSON.stringify(t.store));
    t.flip(false);
    assert(t.html.attrs["data-theme"] === "dark", "un changement du téléphone a écrasé le choix");
    const again = runTheme({ systemDark: true, store: { "brainsto.theme": '"light"' } });
    assert(again.html.attrs["data-theme"] === "light", "Clair retenu, rouvert sur un téléphone en sombre : " + again.html.attrs["data-theme"]);
    assert(again.metas.every((m) => m.attrs.content === "#f2ede4"), "theme-color ne suit pas le choix retenu");
    again.win.Theme.set("auto");
    assert(!("brainsto.theme" in again.store), "revenir à Auto doit effacer la clé, pas l'écrire");
    assert(again.html.attrs["data-theme"] === "dark", "retour à Auto : le téléphone est en sombre");
  });

  await test("Thème : valeur inconnue ou stockage indisponible, repli sur Auto sans exception", async () => {
    const odd = runTheme({ systemDark: true, store: { "brainsto.theme": "{pas du json" } });
    assert(odd.win.Theme.get() === "auto" && odd.html.attrs["data-theme"] === "dark", "valeur illisible : " + odd.win.Theme.get());
    const none = runTheme({ systemDark: false, noStorage: true });
    assert(none.win.Theme.set("dark") === "dark" && none.html.attrs["data-theme"] === "dark", "sans stockage, le choix doit au moins valoir pour l'ouverture");
    assert(none.win.Theme.set("violet") === "auto", "valeur inconnue acceptée");
  });

  await test("BL-052 <noscript> dit quoi faire", async () => {
    const m = /<noscript>([\s\S]*?)<\/noscript>/.exec(HTML);
    assert(m && m[1].trim() === "BrainstO. a besoin de JavaScript. Activez-le ou ouvrez l'adresse dans un navigateur récent.",
      "texte du <noscript> : " + JSON.stringify(m && m[1].trim()));
  });

  await test("Textes de la coquille sans tiret cadratin", async () => {
    const visible = HTML.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(visible.indexOf("—") < 0, "tiret cadratin dans un texte de index.html");
  });

  await test("BL-053 politique de référent : aucune adresse envoyée aux autres sites", async () => {
    assert(/<meta name="referrer" content="no-referrer">/.test(head), "meta referrer no-referrer absente du <head>");
  });

  await test("BL-054 si une CSP existe : placée avant toute ressource, empreinte de chaque script en ligne", async () => {
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(head);
    if (!m) { return; }
    const at = HTML.indexOf(m[0]);
    ["<link", "<style", "<script"].forEach((tag) => { assert(at < HTML.indexOf(tag), "la CSP doit précéder " + tag); });
    const scriptSrc = (/(?:^|;)\s*script-src([^;]*)/.exec(m[1]) || [])[1] || "";
    inline.forEach((code) => {
      const hash = "'sha256-" + crypto.createHash("sha256").update(code, "utf8").digest("base64") + "'";
      assert(scriptSrc.indexOf(hash) >= 0, "empreinte d'un script en ligne absente de script-src (mettre à jour " + hash + ")");
    });
    const connect = (/(?:^|;)\s*connect-src([^;]*)/.exec(m[1]) || [])[1] || "";
    ["'self'", "https:", "http://localhost:*", "http://127.0.0.1:*"].forEach((src) => {
      assert(connect.indexOf(src) >= 0, "connect-src doit accepter " + src + " (adresse du backend libre, serveur local de test)");
    });
  });

  console.log(failures.length
    ? "✗ " + failures.length + " échec(s) :\n  - " + failures.join("\n  - ")
    : "✓ " + passed + " tests réussis sur " + passed + ".");
  process.exit(failures.length ? 1 : 0);
}

run();
