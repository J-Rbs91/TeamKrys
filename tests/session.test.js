/* BrainstO. — tests du verrou par inactivité.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/session.test.js
 *
 * Une seule question ici, mais c'est celle qui décide si l'application s'ouvre
 * sans code : `CONFIG.sessionUsable` accepte-t-elle la session enregistrée ?
 *
 * ⚠️ PORTÉE. La règle est testée à froid, sur des valeurs. Le câblage qui
 * l'entoure (écoute des gestes, écriture au passage en arrière-plan, contrôle
 * périodique) vit dans js/app.js, qui a besoin d'un vrai navigateur : il reste
 * couvert par la recette manuelle (docs/CHECKLIST_TEST.md).
 */
"use strict";

const path = require("path");

const ROOT = path.join(__dirname, "..");
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

const NOW = 1750000000000;          // horodatage figé : les tests ne dépendent pas de l'heure
const VERIFIER = "a".repeat(64);
const TOKEN = "b".repeat(64);

function session(overrides) {
  return Object.assign({ v: VERIFIER, t: TOKEN, at: NOW }, overrides || {});
}

/* --------------------------------------------------------- Cas nominal --- */

check("session fraîche : on entre sans code", () => {
  const usable = CONFIG.sessionUsable(session(), VERIFIER, NOW);
  assert(usable, "une session de l'instant doit être acceptée");
  assert(usable.token === TOKEN, "le jeton serveur doit être restitué");
});

check("59 minutes d'inactivité : toujours ouvert", () => {
  const at = NOW - (CONFIG.LOCK_IDLE_MS - 60 * 1000);
  assert(CONFIG.sessionUsable(session({ at }), VERIFIER, NOW),
    "sous l'heure, le code ne doit pas être redemandé");
});

check("juste sur la limite : encore ouvert", () => {
  const at = NOW - CONFIG.LOCK_IDLE_MS;
  assert(CONFIG.sessionUsable(session({ at }), VERIFIER, NOW),
    "l'égalité stricte ne doit pas verrouiller");
});

/* ------------------------------------------------------------- Refus --- */

check("plus d'une heure d'inactivité : code redemandé", () => {
  const at = NOW - (CONFIG.LOCK_IDLE_MS + 1000);
  assert(CONFIG.sessionUsable(session({ at }), VERIFIER, NOW) === null,
    "au-delà de l'heure, la session doit être refusée");
});

check("code changé depuis : la session ne vaut plus rien", () => {
  assert(CONFIG.sessionUsable(session(), "c".repeat(64), NOW) === null,
    "un vérificateur différent doit invalider la session");
});

check("aucun verrou sur cet appareil : rien à reprendre", () => {
  assert(CONFIG.sessionUsable(session(), null, NOW) === null,
    "sans vérificateur, aucune session ne doit être acceptée");
});

check("horodatage dans le futur : horloge suspecte, on refuse", () => {
  assert(CONFIG.sessionUsable(session({ at: NOW + 60 * 1000 }), VERIFIER, NOW) === null,
    "une date future ne doit jamais ouvrir l'application");
});

/* ⚠️ Ces cas ne sont pas théoriques : localStorage est partagé avec d'autres
 * versions de l'application et éditable à la main depuis la console. */
check("enregistrement absent ou abîmé : code redemandé", () => {
  const bad = [
    null, undefined, "", 0, [], "session",
    session({ v: undefined }),
    session({ t: undefined }),
    session({ t: 42 }),
    session({ at: "hier" }),
    session({ at: NaN }),
    session({ at: Infinity })
  ];
  bad.forEach((value, index) => {
    assert(CONFIG.sessionUsable(value, VERIFIER, NOW) === null,
      "entrée invalide n° " + index + " acceptée à tort");
  });
});

/* ---------------------------------------------------------- Réglages --- */

check("les délais du verrou restent cohérents", () => {
  assert(CONFIG.LOCK_IDLE_MS === 60 * 60 * 1000, "le verrou doit tomber à une heure");
  assert(CONFIG.SESSION_TOUCH_MS < CONFIG.LOCK_IDLE_MS,
    "écrire moins souvent que l'échéance n'aurait aucun sens");
  assert(CONFIG.IDLE_CHECK_MS < CONFIG.LOCK_IDLE_MS,
    "le contrôle périodique doit être plus fin que l'échéance");
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
