/* BrainstO. — tests de la règle de présentation initiale.
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/onboarding.test.js
 *
 * Une seule question ici, et elle a deux faces : un nouvel arrivant voit-il la
 * présentation, et — bien plus important — les appareils DÉJÀ UTILISÉS y échappent-ils
 * au déploiement ? La seconde est la seule dont un défaut se voit par toute l'équipe
 * le même jour.
 *
 * ⚠️ PORTÉE. La règle est testée à froid, sur des valeurs. Le calque lui-même — le
 * dialogue, le piège de focus, l'annonce du changement d'étape, le repli quand
 * showModal() n'existe pas — a besoin d'un vrai navigateur : il reste couvert par la
 * recette manuelle (docs/CHECKLIST_TEST.md) et par docs/ONBOARDING.md.
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
const REV = CONFIG.ONBOARDING_REV;

/* Appareil réellement neuf : rien d'enregistré, aucun indice d'usage antérieur. */
const NEUF = { hasConnection: false, localMode: false, hasName: false, hasTopics: false };

function record(overrides) {
  return Object.assign({
    s: CONFIG.ONBOARDING_SCHEMA, rev: REV, at: NOW, step: 0,
    done: false, skipped: false, migrated: false
  }, overrides || {});
}

function due(saved, ctx) {
  return CONFIG.onboardingDue(saved, ctx || NEUF, REV, NOW);
}

/* --------------------------------------------------------- Cas nominal --- */

check("appareil neuf, rien enregistré : présentation due au premier panneau", () => {
  const plan = due(null);
  assert(plan, "un appareil neuf doit voir la présentation");
  assert(plan.reason === "first", "le motif doit être une première fois");
  assert(plan.step === 0, "on commence au début");
});

check("présentation terminée : jamais rejouée à révision égale", () => {
  assert(due(record({ done: true })) === null,
    "une présentation vue ne doit pas revenir");
});

check("présentation passée : jamais rejouée non plus", () => {
  assert(due(record({ done: true, skipped: true })) === null,
    "« Passer » vaut vue : la séquence ne doit pas réapparaître");
});

check("séquence interrompue : reprise à l'étape enregistrée", () => {
  const plan = due(record({ step: 2 }));
  assert(plan && plan.step === 2, "l'étape enregistrée doit être reprise");
});

/* ------------------------------------------------------- La migration --- */

/* ⚠️ Le cas le plus important du fichier. Sans cette branche, la mise à jour ferait
 * revoir la présentation à TOUS les utilisateurs existants le jour du déploiement. */

check("appareil déjà connecté à une équipe : aucune présentation", () => {
  const plan = due(null, { hasConnection: true, localMode: false, hasName: true, hasTopics: true });
  assert(plan && plan.reason === "migrate",
    "un appareil déjà connecté doit être reconnu comme ancien");
});

check("appareil déjà en mode local : aucune présentation", () => {
  const plan = due(null, { hasConnection: false, localMode: true, hasName: true, hasTopics: false });
  assert(plan && plan.reason === "migrate", "le mode local est un indice d'usage antérieur");
});

check("prénom déjà saisi, connexion perdue : aucune présentation", () => {
  const plan = due(null, { hasConnection: false, localMode: false, hasName: true, hasTopics: false });
  assert(plan && plan.reason === "migrate",
    "un prénom ne s'obtient qu'après avoir traversé les gates : l'appareil a servi");
});

check("la migration ne propose aucun panneau", () => {
  const plan = due(null, { hasConnection: true, localMode: false, hasName: true, hasTopics: false });
  assert(plan.step === undefined && plan.panels === undefined,
    "« migrate » ne doit rien donner à afficher — c'est tout son intérêt");
});

/* --------------------------------------------------------- Les segments --- */

check("espace vide : les cinq parties", () => {
  const plan = due(null, NEUF);
  assert(plan.segment === "full", "un espace vide relève du segment complet");
  assert(plan.panels.length === 5, "cinq panneaux, pas un de plus");
  assert(plan.panels.join(",") === "topics,debate,proposals,conclusion,meeting",
    "l'ordre doit suivre celui du cycle réel");
});

check("espace déjà peuplé : deux panneaux seulement", () => {
  const plan = due(null, { hasConnection: false, localMode: false, hasName: false, hasTopics: true });
  assert(plan.segment === "joining", "un espace peuplé relève du segment « arrivant »");
  assert(plan.panels.join(",") === "debate,conclusion",
    "on ne garde que ce qui ne se devine pas, et ce à quoi ça sert");
});

check("mode local : trois panneaux, ni votes ni réunion", () => {
  const plan = due(record({ step: 0 }), { localMode: true, hasTopics: false });
  assert(plan.segment === "local", "le mode local a son propre segment");
  assert(plan.panels.indexOf("proposals") < 0, "le vote n'a aucun sens seul");
  assert(plan.panels.indexOf("meeting") < 0, "la réunion non plus");
});

check("mode local ET espace peuplé : le mode local l'emporte", () => {
  const plan = due(record(), { localMode: true, hasTopics: true });
  assert(plan.segment === "local",
    "un espace local peuplé reste l'espace d'une seule personne");
});

check("le compteur ne promet jamais plus d'étapes qu'il n'en reste", () => {
  ["full", "joining", "local"].forEach((segment) => {
    const panels = CONFIG.ONBOARDING_PANELS[segment];
    assert(panels.length >= 1 && panels.length <= 5,
      "segment " + segment + " : au plus cinq écrans pédagogiques");
  });
});

check("segment changé pendant la séquence : on reprend au début, pas dans le vide", () => {
  /* Cinq panneaux entamés à l'étape 4, puis un collègue dépose le premier sujet :
   * le segment devient « arrivant », qui n'a que deux panneaux. */
  const plan = due(record({ step: 4 }), { hasTopics: true });
  assert(plan.step === 0, "une étape qui n'existe plus doit ramener au début");
  assert(plan.panels.length === 2, "et le nouveau segment doit s'appliquer");
});

/* ---------------------------------------------------------- Le rejeu --- */

check("révision incrémentée : la présentation revient au début", () => {
  const plan = CONFIG.onboardingDue(record({ done: true, rev: REV }), NEUF, REV + 1, NOW);
  assert(plan && plan.reason === "revision", "une révision plus récente doit rejouer");
  assert(plan.step === 0, "un rejeu repart du début");
});

check("révision enregistrée plus récente que la courante : aucun rejeu", () => {
  assert(CONFIG.onboardingDue(record({ done: true, rev: REV + 5 }), NEUF, REV, NOW) === null,
    "on ne rejoue pas en arrière : l'enregistrement vient d'une version plus récente");
});

check("APP_VERSION seule modifiée : aucun rejeu", () => {
  /* La règle ne lit JAMAIS APP_VERSION : c'est ce qui empêche un correctif de patch
   * de faire revoir la présentation à toute l'équipe. */
  const before = CONFIG.APP_VERSION;
  CONFIG.APP_VERSION = "99.0.0";
  try {
    assert(due(record({ done: true })) === null,
      "changer la version de l'application ne doit rien rejouer");
  } finally {
    CONFIG.APP_VERSION = before;
  }
});

/* ------------------------------------------------ Entrées inattendues --- */

/* ⚠️ Ces cas ne sont pas théoriques : localStorage est partagé avec d'autres
 * versions de l'application et éditable à la main depuis la console. */
check("enregistrement absent ou abîmé : présentation due, aucune exception", () => {
  const bad = [
    null, undefined, "", 0, [], "onboarding", true,
    record({ s: undefined }),
    record({ s: 99 }),
    record({ rev: "1" }),
    record({ rev: NaN }),
    record({ step: -1 }),
    record({ step: 1.5 }),
    record({ step: "2" }),
    record({ step: Infinity }),
    record({ at: "hier" }),
    record({ at: NaN }),
    record({ at: NOW + 60 * 1000 })   // horloge reculée ou enregistrement bricolé
  ];
  bad.forEach((value, index) => {
    const plan = due(value);
    assert(plan && plan.reason === "first" && plan.step === 0,
      "entrée invalide n° " + index + " mal traitée");
  });
});

check("enregistrement abîmé sur un appareil déjà utilisé : toujours aucune présentation", () => {
  const plan = CONFIG.onboardingDue("n'importe quoi", { hasConnection: true }, REV, NOW);
  assert(plan && plan.reason === "migrate",
    "un enregistrement illisible ne doit pas transformer un ancien appareil en neuf");
});

check("contexte absent : la fonction ne lève rien et suppose le pire", () => {
  const plan = CONFIG.onboardingDue(null, null, REV, NOW);
  assert(plan && plan.reason === "first" && plan.segment === "full",
    "sans contexte, on traite l'appareil comme neuf sur un espace vide");
});

check("révision non numérique : repli sur la révision du fichier", () => {
  assert(CONFIG.onboardingDue(record({ done: true }), NEUF, "deux", NOW) === null,
    "une révision invalide ne doit pas provoquer de rejeu");
});

check("la liste de panneaux rendue est une copie", () => {
  const plan = due(null);
  plan.panels.push("intrus");
  assert(CONFIG.ONBOARDING_PANELS.full.length === 5,
    "l'appelant ne doit pas pouvoir modifier la table de référence");
});

/* ---------------------------------------------------------- Réglages --- */

check("les réglages de la présentation restent cohérents", () => {
  assert(CONFIG.KEYS.onboarding === "brainsto.onboarding",
    "la clé doit suivre la convention brainsto.*");
  const keys = Object.keys(CONFIG.KEYS).map((k) => CONFIG.KEYS[k]);
  assert(keys.length === new Set(keys).size, "deux réglages ne doivent pas partager une clé");
  assert(typeof CONFIG.ONBOARDING_REV === "number" && CONFIG.ONBOARDING_REV >= 1,
    "la révision de séquence doit être un entier positif");
  assert(CONFIG.ONBOARDING_REV !== CONFIG.APP_VERSION,
    "la révision de séquence ne doit pas être la version de l'application");
});

/* --------------------------------------- Repli sous mouvement réduit --- */

/* ⚠️ L'invariance « état au repos = état final » est VÉRIFIÉE, pas supposée. Le mode
 * de panne à ne jamais produire est un panneau invisible : avec le blocage global de
 * `prefers-reduced-motion: reduce`, une animation d'apparition se termine
 * instantanément mais retombe sur son style de base. Si ce style porte `opacity: 0`,
 * la présentation ne s'affiche pas du tout — sans la moindre erreur.
 *
 * On lit donc la feuille de style, comme le fait déjà tests/qa/compat-scan.js, et on
 * exige que TOUTE animation de la séquence vive à l'intérieur d'un bloc
 * `no-preference`, et qu'aucune règle en dehors ne pose un état masqué. */

const fs = require("fs");
const CSS = fs.readFileSync(path.join(ROOT, "css/app.css"), "utf8");

/* Étendues des blocs `@media (prefers-reduced-motion: no-preference)`, par
 * comptage d'accolades — suffisant ici, et sans dépendance. */
function noPreferenceRanges(source) {
  const ranges = [];
  const marker = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g;
  let match;
  while ((match = marker.exec(source)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") { depth += 1; }
      else if (source[index] === "}") { depth -= 1; }
      index += 1;
    }
    ranges.push([match.index, index]);
  }
  return ranges;
}

const RANGES = noPreferenceRanges(CSS);

function inNoPreference(index) {
  return RANGES.some(function (range) { return index > range[0] && index < range[1]; });
}

check("le repli existe : au moins un bloc no-preference est présent", () => {
  assert(RANGES.length > 0, "sans bloc no-preference, aucune animation n'est repliable");
});

check("toute animation de la séquence vit dans un bloc no-preference", () => {
  ["onboard-rise", "onboard-step"].forEach((name) => {
    const marker = new RegExp("animation:\\s*" + name, "g");
    let match;
    let seen = 0;
    while ((match = marker.exec(CSS)) !== null) {
      seen += 1;
      assert(inNoPreference(match.index),
        "l'animation " + name + " est déclarée hors d'un bloc no-preference");
    }
    assert(seen > 0, "l'animation " + name + " n'est référencée nulle part");
  });
});

check("aucun état masqué au repos sur la séquence", () => {
  /* On isole les règles dont le sélecteur porte `.onboard`, hors blocs
   * no-preference, et on vérifie qu'aucune ne pose un état de départ d'animation. */
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  let checked = 0;
  while ((match = rule.exec(CSS)) !== null) {
    const selector = match[1];
    const body = match[2];
    if (selector.indexOf(".onboard") < 0) { continue; }
    if (inNoPreference(match.index)) { continue; }
    checked += 1;
    assert(!/opacity:\s*0(\.0*)?\s*[;}]/.test(body),
      "état masqué au repos sur « " + selector.trim().slice(0, 48) + " »");
    assert(!/transform:\s*translate/.test(body),
      "déplacement au repos sur « " + selector.trim().slice(0, 48) + " »");
  }
  assert(checked > 0, "aucune règle .onboard trouvée : le contrôle ne prouverait rien");
});

check("le voile ne se refond pas entre deux étapes", () => {
  /* Le fondu du voile est porté par la classe d'arrivée, pas par le dialogue nu :
   * s'il était sur `.onboard::backdrop`, il rejouerait à chaque changement d'étape. */
  assert(/\.onboard--enter::backdrop/.test(CSS),
    "le fondu du voile doit être porté par la classe d'arrivée");
  assert(!/(^|[^-])\.onboard::backdrop\s*\{[^}]*animation/.test(CSS),
    "aucune animation ne doit être posée sur le voile hors de l'arrivée");
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
