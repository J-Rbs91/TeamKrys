"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

function read(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

var index = read("index.html");
var css = read("css/uxer.css");
var js = read("js/uxer-ui.js");
var worker = read("service-worker.js");

assert(index.indexOf('href="css/uxer.css"') >= 0, "index.html doit charger css/uxer.css");
assert(index.indexOf('src="js/uxer-ui.js"') >= 0, "index.html doit charger js/uxer-ui.js");
assert(index.indexOf('src="js/product-ui.js"') < index.indexOf('src="js/uxer-ui.js"'),
  "UXER doit enrichir le DOM après la doctrine produit");
assert(index.indexOf('src="js/uxer-ui.js"') < index.indexOf('src="js/app.js"'),
  "UXER doit envelopper UI.render avant App.start");

assert(worker.indexOf('"css/uxer.css"') >= 0, "la PWA doit précacher la feuille UXER");
assert(worker.indexOf('"js/uxer-ui.js"') >= 0, "la PWA doit précacher la couche UXER");

assert(js.indexOf("Discussion") >= 0 && js.indexOf("Propositions") >= 0 && js.indexOf("Consensus") >= 0,
  "le parcours du sujet doit exposer ses trois étapes");
assert(js.indexOf("document.startViewTransition") >= 0,
  "les transitions de contexte doivent utiliser View Transitions en amélioration progressive");
assert(js.indexOf("renderFallback") >= 0 && css.indexOf("ux-route-fallback-forward") >= 0,
  "un mouvement de route doit subsister sans View Transitions");
assert(js.indexOf("prefers-reduced-motion: reduce") >= 0,
  "le JS doit éviter View Transitions quand le mouvement est réduit");
assert(css.indexOf("prefers-reduced-motion: reduce") >= 0,
  "la feuille UXER doit définir un repli reduced-motion");
assert(css.indexOf(".ux-card-action") >= 0 && js.indexOf("Ouvrir") >= 0,
  "les cartes de sujet doivent porter un signifiant persistant");
assert(css.indexOf(".ux-bubble-cue") >= 0 && js.indexOf("ux-bubble-cue") >= 0,
  "les bulles actionnables doivent porter un signifiant persistant");
assert(js.indexOf('meta.appendChild(cue)') >= 0,
  "le signifiant d'actions du message doit rester dans la ligne de métadonnées");

assert(!/https?:\/\//.test(css), "la couche UXER ne doit pas charger de ressource distante");
assert(!/https?:\/\//.test(js), "la couche UXER ne doit pas charger de ressource distante");

console.log("UXER integration: OK");
