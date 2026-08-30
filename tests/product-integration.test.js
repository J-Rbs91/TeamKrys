/* BrainstO. — garde-fous statiques de l'intégration produit.
 *
 * Exécution : node tests/product-integration.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push(name + " → " + error.message); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const html = read("index.html");
const sw = read("service-worker.js");
const config = read("js/config.js");
const ui = read("js/product-ui.js");
const backend = read("apps-script/Code.gs");

check("Chargement : product-view précède product-ui, qui précède app", () => {
  const view = html.indexOf('src="js/product-view.js"');
  const baseUi = html.indexOf('src="js/ui.js"');
  const productUi = html.indexOf('src="js/product-ui.js"');
  const app = html.indexOf('src="js/app.js"');
  assert(view >= 0 && baseUi > view && productUi > baseUi && app > productUi,
    "ordre des scripts produit incorrect");
});

check("Styles : la feuille produit est chargée après le thème principal", () => {
  const base = html.indexOf('href="css/app.css"');
  const product = html.indexOf('href="css/product.css"');
  assert(base >= 0 && product > base, "css/product.css doit compléter app.css");
});

check("PWA : toute la couche produit fait partie de la coquille critique", () => {
  assert(sw.includes('"css/product.css"'), "product.css absent du précache");
  assert(sw.includes('"js/product-view.js"'), "product-view absent du précache");
  assert(sw.includes('"js/product-ui.js"'), "product-ui absent du précache");
});

check("Version : application et cache annoncent ensemble la 1.12.0", () => {
  assert(config.includes('APP_VERSION: "1.12.0"'), "APP_VERSION non alignée");
  assert(sw.includes('CACHE_VERSION = "brainsto-v1.12.0"'), "CACHE_VERSION non alignée");
});

check("Consensus : aucun renommage global aveugle du contenu utilisateur", () => {
  assert(!ui.includes("document.body.innerHTML"), "remplacement global HTML interdit");
  assert(!ui.includes("replaceAll(\"Conclusion\""), "remplacement global du mot Conclusion interdit");
  assert(ui.includes('route.name !== "conclusion"'), "renommage Consensus non borné à son écran");
});

check("Réactions : la couche produit ne modifie pas le jeu métier", () => {
  assert(!ui.includes("REACTIONS ="), "la présentation redéfinit les réactions");
  assert(backend.includes('var REACTIONS = ["👌", "💪", "🤏", "👎", "💩"]'),
    "le backend ne porte pas le jeu de réactions attendu");
});

check("Frontière produit : aucun modèle de réunion ou de compte rendu ajouté", () => {
  assert(!backend.includes("CREATE_MEETING"), "une entité réunion a été ajoutée");
  assert(!backend.includes("MEETING_DATE"), "une date de réunion a été ajoutée");
  assert(!backend.includes("MINUTES"), "un compte rendu a été ajouté");
});

check("Backend : aucun secret ne peut être versionné dans les constantes", () => {
  assert(/var ACCESS_CODE = "";/.test(backend), "ACCESS_CODE doit rester vide");
  assert(/var DATA_FILE_ID = "";/.test(backend), "DATA_FILE_ID doit rester vide");
});

check("Statuts : les valeurs historiques restent internes mais ne sont plus proposées", () => {
  assert(ui.includes("isProposalStatusSelectable"), "filtre des statuts absent");
  assert(ui.includes("PROPOSAL_LEGACY_LABELS"), "compatibilité historique absente");
});

check("Nouveautés : une baseline vide est persistée", () => {
  assert(ui.includes("record = { v: 1, initialized: true, topics: {} };"),
    "la consultation d'un espace vide n'établit pas de baseline");
});

if (failures.length) {
  console.error("\nÉCHECS product-integration :");
  failures.forEach((failure) => console.error("- " + failure));
  process.exit(1);
}
console.log("product-integration : " + passed + " test(s) réussi(s).");
