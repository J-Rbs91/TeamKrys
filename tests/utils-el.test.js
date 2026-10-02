/* BrainstO. — Utils.el : le contenu initial d'un champ doit arriver dans le champ.
 *
 * Exécution : node tests/utils-el.test.js
 *
 * Contexte : « Modifier le message », « Modifier le sujet » (description) et « Modifier la conclusion »
 * passaient `value:` à Utils.el, qui le posait en ATTRIBUT. Un <textarea> n'a pas d'attribut « value » :
 * le champ s'ouvrait vide dans un vrai navigateur, sans qu'aucun test ne le voie (un faux DOM qui ne
 * distingue pas attribut et propriété ne peut pas le voir). Ce test en reproduit la sémantique.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push(name + " → " + error.message); }
}
function assert(condition, message) { if (!condition) { throw new Error(message || "assertion échouée"); } }

/* Faux DOM fidèle sur le point qui compte : <input> reflète son attribut « value » tant que
 * l'utilisateur n'a rien saisi ; <textarea> NE LE FAIT PAS (son contenu est son texte ou la propriété). */
function makeNode(tag) {
  const attributes = {};
  let dirty = false;
  let current = "";
  const node = {
    tagName: String(tag).toUpperCase(), attributes, className: "", dataset: {}, style: {}, childNodes: [],
    setAttribute(key, value) { attributes[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(attributes, key) ? attributes[key] : null; },
    addEventListener() {},
    appendChild(child) { node.childNodes.push(child); return child; }
  };
  Object.defineProperty(node, "value", {
    get() {
      if (tag === "textarea") { return current; }
      return dirty ? current : (attributes.value !== undefined ? attributes.value : "");
    },
    set(next) { dirty = true; current = String(next); }
  });
  return node;
}

const sandbox = {
  document: { createElement: makeNode, createTextNode: (text) => ({ nodeType: 3, text: String(text) }) },
  console, JSON, Math, Date, Promise, Error, Object, Array, String
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/utils.js"), "utf8"), sandbox);
const Utils = sandbox.Utils || vm.runInContext("Utils", sandbox);

check("un textarea créé avec `value:` s'ouvre avec ce texte (Modifier le message)", () => {
  const field = Utils.el("textarea", { class: "textarea", value: "Texte à corriger", "data-draft": "editMessage:m1" });
  assert(field.value === "Texte à corriger", "contenu du champ : « " + field.value + " » au lieu du texte existant");
});

check("un textarea créé avec `value:` vide ou absent reste vide, sans erreur", () => {
  assert(Utils.el("textarea", { value: "" }).value === "", "valeur vide non respectée");
  assert(Utils.el("textarea", {}).value === "", "champ sans valeur non vide");
  assert(Utils.el("textarea", { value: undefined }).value === "", "valeur indéfinie non ignorée");
});

check("le texte multiligne, accentué ou à émojis arrive intact", () => {
  const text = "Première ligne\nDeuxième ligne : élève, œuvre, ça va 👍";
  assert(Utils.el("textarea", { value: text }).value === text, "texte altéré");
});

check("un input garde son comportement : l'attribut `value` donne le contenu initial", () => {
  const input = Utils.el("input", { type: "text", value: "Alice" });
  assert(input.value === "Alice", "contenu de l'input : « " + input.value + " »");
  assert(input.getAttribute("value") === "Alice", "l'attribut value de l'input n'est plus posé");
});

check("la sémantique du faux DOM est celle d'un navigateur (garde-fou du test lui-même)", () => {
  const raw = makeNode("textarea");
  raw.setAttribute("value", "abc");
  assert(raw.value === "", "le faux DOM reflète l'attribut d'un textarea : le test ne prouverait rien");
});

check("aucun textarea de l'interface n'est prérempli par un attribut hors Utils.el", () => {
  ["js/ui.js", "js/uxer-ui.js", "js/product-ui.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert(!/setAttribute\(\s*["']value["']/.test(source), file + " pose un attribut value à la main");
  });
});

if (failures.length) {
  console.error("utils-el : " + failures.length + " échec(s) sur " + (passed + failures.length));
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("utils-el : " + passed + " contrôle(s) OK");
