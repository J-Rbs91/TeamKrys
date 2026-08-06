/* BrainstO. — invariants de publication.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/release.test.js
 *
 * Ces tests ne regardent pas ce que fait l'application, mais si une version
 * publiée ATTEINDRA les appareils. C'est la panne la plus coûteuse du projet,
 * parce qu'elle est invisible depuis le poste de développement : le correctif
 * est en ligne, il fonctionne, et personne ne l'exécute.
 *
 * Trois façons connues de la provoquer, toutes vérifiées ici :
 *  - oublier d'incrémenter CACHE_VERSION avec APP_VERSION (l'ancienne coquille
 *    reste servie depuis le cache) ;
 *  - retirer skipWaiting() (la nouvelle version s'installe puis reste en
 *    attente ; recharger la page n'y change RIEN, indéfiniment) ;
 *  - ajouter un fichier à index.html sans l'ajouter à la liste précachée
 *    (l'application se casse hors ligne, et seulement hors ligne).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const SW = read("service-worker.js");
const INDEX = read("index.html");
require(path.join(ROOT, "js/config.js"));
const CONFIG = globalThis.CONFIG;

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push({ name, error }); }
}

/* ------------------------------------------------------------ Versions --- */

check("CACHE_VERSION suit APP_VERSION", () => {
  const found = (SW.match(/CACHE_VERSION = "([^"]+)"/) || [])[1];
  assert(found, "CACHE_VERSION introuvable dans service-worker.js");
  assert(found === "brainsto-v" + CONFIG.APP_VERSION,
    "CACHE_VERSION vaut « " + found + " » alors que APP_VERSION vaut « " +
    CONFIG.APP_VERSION + " » : les appareils garderont l'ancienne coquille");
});

/* ------------------------------------------------------- Prise en main --- */

check("le service worker s'active sans attendre un geste de l'utilisateur", () => {
  assert(/self\.skipWaiting\(\)/.test(SW),
    "sans skipWaiting(), la nouvelle version reste en attente derrière l'ancienne " +
    "et recharger la page ne l'exécute jamais");
  const install = SW.slice(SW.indexOf('addEventListener("install"'), SW.indexOf('addEventListener("activate"'));
  assert(/self\.skipWaiting\(\)/.test(install),
    "skipWaiting() doit être appelé à l'installation, pas ailleurs");
});

check("le service worker prend la main sur les pages déjà ouvertes", () => {
  assert(/clients\.claim\(\)/.test(SW), "clients.claim() manquant à l'activation");
});

check("les anciens caches sont supprimés à l'activation", () => {
  assert(/caches\.delete\(/.test(SW), "les caches précédents ne sont jamais supprimés");
});

/* ------------------------------------------------------------ Coquille --- */

/* ⚠️ Un fichier chargé par index.html mais absent de SHELL ne casse RIEN en
 * ligne : la panne n'apparaît que hors ligne, chez l'utilisateur, plus tard. */
check("tout ce que charge index.html est précaché", () => {
  const shell = (SW.match(/var SHELL = \[([\s\S]*?)\];/) || [])[1] || "";
  const cached = shell.match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  const referenced = [];
  const add = (re, group) => {
    let m;
    while ((m = re.exec(INDEX)) !== null) { referenced.push(m[group]); }
  };
  add(/<script[^>]+src="([^"]+)"/g, 1);
  add(/<link[^>]+href="([^"]+)"/g, 1);

  referenced
    .filter((href) => !/^https?:|^data:|^#/.test(href))
    .map((href) => href.replace(/^\.\//, ""))
    .forEach((href) => {
      assert(cached.indexOf(href) >= 0,
        "« " + href + " » est chargé par index.html mais absent de SHELL : " +
        "l'application se cassera hors ligne");
    });
});

check("les fichiers précachés existent bel et bien", () => {
  const shell = (SW.match(/var SHELL = \[([\s\S]*?)\];/) || [])[1] || "";
  const cached = shell.match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  cached.filter((p) => p !== "./").forEach((p) => {
    assert(fs.existsSync(path.join(ROOT, p)), "fichier précaché introuvable : " + p);
  });
});

check("aucun fichier js/ oublié dans la coquille", () => {
  const shell = (SW.match(/var SHELL = \[([\s\S]*?)\];/) || [])[1] || "";
  fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).forEach((f) => {
    assert(shell.indexOf("js/" + f) >= 0, "js/" + f + " n'est pas précaché");
  });
});

/* ------------------------------------------------------------ Rapport --- */

if (failures.length) {
  failures.forEach(({ name, error }) => {
    console.error("✗ " + name + "\n  " + error.message);
  });
  console.error("\n" + passed + " test(s) OK, " + failures.length + " en échec.");
  process.exit(1);
}
console.log("✓ " + passed + " test(s) OK.");
