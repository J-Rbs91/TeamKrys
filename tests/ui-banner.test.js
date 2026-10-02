/* BrainstO. : non-régression du bandeau de mise à jour (REC-UI-052, WCAG 4.1.3), lot WP-23.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/ui-banner.test.js
 *
 * Le code LIVRÉ de la section « Bandeau nouvelle version » de js/ui.js est extrait et exécuté dans un contexte vm, sur un
 * faux DOM minimal écrit ici (comme tests/ui-review.test.js : js/ui.js entier réclame toute la page). Contrôles :
 *  - le bandeau reste un bloc sans rôle : AUCUN second role="status" ni aria-live (une seule région d'état par écran) ;
 *  - son apparition est ANNONCÉE UNE FOIS par la région vive qui existe déjà (#toast-root : role="status" et
 *    aria-live="polite" dans index.html), dans un nœud masqué à l'écran : aucun toast visible en doublon ;
 *  - le nœud d'annonce est retiré au bout de quelques secondes ; un second appel pendant que le bandeau est posé n'annonce
 *    rien ; « Plus tard » puis une nouvelle apparition est annoncée de nouveau ; un retrait temporaire (présentation qui
 *    monte) ne provoque pas de seconde annonce ;
 *  - présentation en cours : rien n'est posé ni annoncé, l'apparition retardée est annoncée une fois ;
 *  - le bandeau reste atteignable au clavier : « Mettre à jour » (texte) et « Plus tard » (aria-label), deux vrais boutons ;
 *  - sans région vive (démarrage incomplet) : aucun plantage, le bandeau est posé.
 *
 * `UI_BANNER_ROOT` : racine alternative (par exemple une copie de HEAD) pour prouver que le test échoue sur l'ancien code. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.env.UI_BANNER_ROOT || path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const queue = [];
function check(name, fn) { queue.push({ name, fn }); }
function assert(condition, message) { if (!condition) { throw new Error(message); } }

const SENTENCE = "Une nouvelle version est disponible.";

/* Le code livré de la section du bandeau, jusqu'à `root.UI = UI;`. */
function bannerSection() {
  const src = read("js/ui.js");
  const head = /\/\* -+ Bandeau nouvelle version -+ \*\//.exec(src);
  assert(head, "js/ui.js : section « Bandeau nouvelle version » introuvable");
  const end = src.indexOf("\n  root.UI = UI;", head.index);
  assert(end > head.index, "js/ui.js : fin de la section du bandeau introuvable");
  return src.slice(head.index, end);
}

/* Un faux DOM : des nœuds, un corps, la région vive de la page et des minuteries qu'on déclenche à la main. */
function makeWorld(options) {
  const timers = [];
  const hasClass = (node, name) => String((node.attrs && node.attrs.class) || "").split(/\s+/).indexOf(name) >= 0;
  const make = (tag, attrs, kids) => {
    const node = { tag, attrs: attrs || {}, children: [], parentNode: null };
    node.appendChild = (child) => { child.parentNode = node; node.children.push(child); return child; };
    node.removeChild = (child) => {
      const i = node.children.indexOf(child);
      if (i >= 0) { node.children.splice(i, 1); }
      child.parentNode = null;
      return child;
    };
    node.remove = () => { if (node.parentNode) { node.parentNode.removeChild(node); } };
    (kids || []).forEach((kid) => { if (kid) { node.appendChild(kid); } });
    return node;
  };
  const all = (node, out) => { out = out || []; node.children.forEach((c) => { out.push(c); all(c, out); }); return out; };
  const body = make("body");
  const region = make("div", { id: "toast-root", class: "toast-root", role: "status", "aria-live": "polite" });
  const world = {
    body, region, all,
    announcements: () => region.children.filter((n) => hasClass(n, "visually-hidden")),
    toasts: () => region.children.filter((n) => hasClass(n, "toast")),
    banners: () => all(body).filter((n) => hasClass(n, "update-banner")),
    buttons: () => { const b = world.banners()[0]; return b ? b.children.filter((n) => n.tag === "button") : []; },
    elapse: () => { while (timers.length) { timers.shift().fn(); } }
  };
  const sandbox = {
    document: { body, querySelector: () => world.banners()[0] || null },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    el: (tag, attrs, kids) => make(tag, attrs, kids),
    icon: (name, size) => make("svg", { name, size }),
    __region: options && options.noRegion ? null : region
  };
  vm.createContext(sandbox);
  vm.runInContext("var UI = {}; var onboard = null; var pendingUpdate = null; var bannerUpdate = null; var toastRoot = __region;\n" +
    bannerSection() + "\nthis.__UI = UI;", sandbox);
  world.sandbox = sandbox;
  world.UI = sandbox.__UI;
  return world;
}

check("REC-UI-052 le bandeau est annoncé UNE fois par #toast-root (région vive existante), dans un nœud masqué, sans toast visible", () => {
  const w = makeWorld();
  w.UI.showUpdateBanner(() => {});
  assert(w.banners().length === 1, "un bandeau attendu, " + w.banners().length + " trouvé(s)");
  const said = w.announcements();
  assert(said.length === 1, "une annonce attendue dans la région vive, " + said.length + " trouvée(s) : un lecteur d'écran n'apprend rien du bandeau");
  assert(said[0].attrs.text === SENTENCE, "texte annoncé : " + said[0].attrs.text);
  assert(w.toasts().length === 0, "un toast visible double le bandeau");
  w.UI.showUpdateBanner(() => {});                       // déjà posé : ni second bandeau ni seconde annonce
  assert(w.banners().length === 1 && w.announcements().length === 1, "seconde annonce pour un bandeau déjà posé");
  w.elapse();                                            // quelques secondes plus tard : le nœud d'annonce est retiré
  assert(w.announcements().length === 0, "le nœud d'annonce reste dans la région vive");
  assert(w.banners().length === 1, "le bandeau a disparu avec l'annonce");
});

check("REC-UI-052 le bandeau reste un bloc sans rôle : aucun second role=status ni aria-live (une seule région d'état par écran)", () => {
  const w = makeWorld();
  w.UI.showUpdateBanner(() => {});
  const banner = w.banners()[0];
  [banner].concat(w.all(banner)).forEach((n) => {
    assert(n.attrs.role === undefined && n.attrs["aria-live"] === undefined, "role ou aria-live sur un nœud « " + n.tag + " » du bandeau");
  });
  w.announcements().forEach((n) => {
    assert(n.attrs.role === undefined && n.attrs["aria-live"] === undefined, "le nœud d'annonce ne doit pas être lui-même une région vive");
  });
  const region = /<div id="toast-root"[^>]*>/.exec(read("index.html"));
  assert(region && /role="status"/.test(region[0]) && /aria-live="polite"/.test(region[0]), "la région vive existante #toast-root a changé dans index.html : " + (region && region[0]));
  assert(!/role:\s*"status"|"aria-live"/.test(bannerSection()), "la section du bandeau crée une région vive (role status ou aria-live)");
});

check("REC-UI-052 le bandeau reste atteignable au clavier : « Mettre à jour » et « Plus tard » nommé, deux vrais boutons", () => {
  const w = makeWorld();
  w.UI.showUpdateBanner(() => {});
  const buttons = w.buttons();
  assert(buttons.length === 2, "deux boutons attendus, " + buttons.length + " trouvé(s)");
  buttons.forEach((b) => {
    assert(b.attrs.type === "button", "un bouton du bandeau n'est pas un vrai <button type=button>");
    assert(b.attrs.tabindex === undefined && b.attrs.tabIndex === undefined && b.attrs.disabled === undefined, "un bouton du bandeau sort de l'ordre de tabulation");
  });
  assert(buttons[0].attrs.text === "Mettre à jour", "premier bouton : " + buttons[0].attrs.text);
  assert(buttons[1].attrs["aria-label"] === "Plus tard", "le bouton fermer doit s'appeler « Plus tard » : " + buttons[1].attrs["aria-label"]);
  const span = w.banners()[0].children.filter((n) => n.tag === "span")[0];
  assert(span && span.attrs.text === SENTENCE, "le texte visible du bandeau n'est plus la phrase annoncée : " + (span && span.attrs.text));
});

check("REC-UI-052 « Plus tard » puis une nouvelle apparition : annoncée de nouveau ; « Mettre à jour » appelle le rappel", () => {
  const w = makeWorld();
  let updated = 0;
  w.UI.showUpdateBanner(() => { updated += 1; });
  w.buttons()[1].attrs.onclick();                        // « Plus tard »
  assert(w.banners().length === 0, "« Plus tard » ne retire pas le bandeau");
  w.elapse();
  w.UI.showUpdateBanner(() => { updated += 1; });
  assert(w.banners().length === 1 && w.announcements().length === 1, "une nouvelle apparition doit être annoncée de nouveau : " + w.announcements().length);
  w.buttons()[0].attrs.onclick();                        // « Mettre à jour »
  assert(updated === 1 && w.banners().length === 0, "« Mettre à jour » doit appeler le rappel une fois et retirer le bandeau");
});

check("REC-UI-052 présentation en cours : ni bandeau ni annonce ; posé après elle, annoncé une seule fois même après un retrait temporaire", () => {
  const w = makeWorld();
  const later = () => {};
  w.sandbox.onboard = {};                                // la présentation (onboarding) est montée
  w.UI.showUpdateBanner(later);
  assert(w.banners().length === 0 && w.announcements().length === 0, "bandeau ou annonce posés pendant la présentation");
  assert(w.sandbox.pendingUpdate === later, "le rappel du bandeau n'est pas gardé pour plus tard");
  w.sandbox.onboard = null;                              // la présentation se démonte : le bandeau est ressorti
  w.UI.showUpdateBanner(w.sandbox.pendingUpdate);
  assert(w.banners().length === 1 && w.announcements().length === 1, "l'apparition retardée doit être annoncée une fois : " + w.announcements().length);
  w.elapse();
  w.banners()[0].remove();                               // la présentation remonte et RETIRE le bandeau sans qu'on l'ait écarté
  w.UI.showUpdateBanner(later);                          // puis le pose de nouveau à son démontage
  assert(w.banners().length === 1 && w.announcements().length === 0, "un retrait temporaire ne doit pas provoquer de seconde annonce : " + w.announcements().length);
});

check("REC-UI-052 sans région vive (démarrage incomplet) : aucun plantage, le bandeau est posé", () => {
  const w = makeWorld({ noRegion: true });
  w.UI.showUpdateBanner(() => {});
  assert(w.banners().length === 1, "le bandeau n'est pas posé sans région vive");
});

const failures = [];
queue.forEach((c) => {
  try { c.fn(); } catch (e) { failures.push(c.name + "\n    " + (e && e.message || e)); }
});
if (failures.length) {
  console.error("ui-banner : " + failures.length + " échec(s) sur " + queue.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("ui-banner : " + queue.length + " contrôles OK");
