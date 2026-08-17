/* BrainstO. — garde-fous du contrat de navigation arrière.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/navigation.test.js
 *
 * ⚠️ PORTÉE. Le geste retour ne se lit pas dans du code : il se constate sur un
 * téléphone, et il se compte. Ces contrôles ne prouvent donc pas le
 * comportement — ils protègent les deux conditions STRUCTURELLES sans
 * lesquelles il se défait au prochain écran ajouté (voir docs/NAVIGATION.md,
 * section « Ce qui empêche le défaut de revenir ») :
 *
 *   1. la profondeur de chaque écran est déclarée en un seul endroit ;
 *   2. toute navigation interne passe par ce seul point.
 *
 * Un écran ajouté sans parent déclaré, ou un lien qui écrirait `location.hash`
 * dans son coin, rétablirait le défaut sans qu'aucun test fonctionnel ne
 * bronche. Ce sont exactement les deux choses qu'on attrape ici.
 *
 * La recette manuelle, elle, est dans docs/CHECKLIST_TEST.md.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const UI = fs.readFileSync(path.join(ROOT, "js/ui.js"), "utf8");

/* Les contrôles textuels lisent le code, pas ce qui en est dit : un commentaire
 * qui cite `location.hash =` pour l'interdire n'est pas une infraction. */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const APP_CODE = sansCommentaires(APP);
const UI_CODE = sansCommentaires(UI);

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion échouée"); }
}

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push({ name, error }); }
}

/* Noms d'écrans que le routeur sait produire, lus dans parseRoute. */
function nomsDeRoutes() {
  const bloc = APP.slice(APP.indexOf("function parseRoute"), APP.indexOf("Contrat du geste retour"));
  return [...new Set([...bloc.matchAll(/name:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]))];
}

/* Écrans dont le parent est déclaré dans la table PARENT. */
function nomsDeclares() {
  const debut = APP.indexOf("var PARENT = {");
  const bloc = APP.slice(debut, APP.indexOf("};", debut));
  return [...new Set([...bloc.matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]))]
    .filter((nom) => nom !== "PARENT");
}

check("chaque écran du routeur a un parent déclaré", () => {
  const manquants = nomsDeRoutes().filter((nom) => !nomsDeclares().includes(nom));
  assert(
    manquants.length === 0,
    "écran(s) sans profondeur déclarée dans PARENT : " + manquants.join(", ") +
    " — le geste retour y rejouera la chronologie des visites",
  );
});

check("aucun écran déclaré n'est orphelin du routeur", () => {
  const inutiles = nomsDeclares().filter((nom) => !nomsDeRoutes().includes(nom));
  assert(
    inutiles.length === 0,
    "entrée(s) de PARENT sans écran correspondant : " + inutiles.join(", "),
  );
});

check("un seul écran est racine", () => {
  const debut = APP.indexOf("var PARENT = {");
  const bloc = APP.slice(debut, APP.indexOf("};", debut));
  const racines = [...bloc.matchAll(/^\s*([a-zA-Z]+)\s*:\s*null/gm)].map((m) => m[1]);
  assert(
    racines.length === 1,
    "il faut exactement une racine, trouvé : " + (racines.join(", ") || "aucune"),
  );
});

check("aucune navigation n'écrit l'adresse directement", () => {
  /* `location.hash = …` contourne le point de passage unique : c'est le seul
   * endroit où le défaut peut réapparaître, et il se cherche ainsi. */
  const fautifs = [];
  for (const [nom, source] of [["js/app.js", APP_CODE], ["js/ui.js", UI_CODE]]) {
    if (/(?:window\.)?location\.hash\s*=[^=]/.test(source)) { fautifs.push(nom); }
  }
  assert(
    fautifs.length === 0,
    "écriture directe de location.hash dans : " + fautifs.join(", ") +
    " — passer par App.go, qui compare les profondeurs",
  );
});

check("les boutons retour de l'interface remontent d'un niveau", () => {
  /* Un bouton retour qui appellerait App.go empilerait une entrée au lieu d'en
   * consommer une : remonter à la liste rendrait la sortie plus lointaine. */
  const fautifs = [...UI_CODE.matchAll(/back:\s*function\s*\(\)\s*\{\s*App\.go\(/g)];
  assert(
    fautifs.length === 0,
    fautifs.length + " bouton(s) retour naviguent au lieu de dépiler — utiliser App.remonter",
  );
});

check("les couches sont comptées au seul endroit où elles changent", () => {
  const appels = [...UI_CODE.matchAll(/App\.ajusterCouches\(/g)].length;
  assert(appels === 1, "App.ajusterCouches appelé " + appels + " fois — attendu une seule, dans UI.set");
  assert(
    /UI\.set = function[\s\S]{0,400}App\.ajusterCouches\(/.test(UI_CODE),
    "l'appel n'est pas dans UI.set : une couche ouverte hors de ce chemin n'entrera pas dans l'historique",
  );
});

check("la trace repart de zéro à chaque chargement", () => {
  /* Sans ce marquage, une remontée depuis une adresse partagée dépilerait des
   * entrées qui ne nous appartiennent pas, et sortirait de l'application. */
  assert(
    /App\.route = parseRoute\(window\.location\.hash\);[\s\S]{0,600}remplacer\(App\.route\.raw\);/.test(APP_CODE),
    "le démarrage ne remplace pas l'entrée courante pour marquer le fond de pile",
  );
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
