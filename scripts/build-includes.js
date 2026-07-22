#!/usr/bin/env node
/**
 * Génère les fichiers d'inclusion HTML pour Apps Script à partir des modules JS.
 *
 * Apps Script (HtmlService) ne peut inclure que des fichiers HTML. Chaque module
 * `js/<nom>.js` est donc enveloppé dans `apps-script/js_<nom>.html` sous forme
 * de <script>. La source canonique reste `js/*.js` (utilisée telle quelle par
 * les tests Node) : ce script évite toute duplication manuelle.
 *
 * Usage : node scripts/build-includes.js [--check]
 *   --check : ne réécrit rien, échoue si un include est absent/obsolète.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var JS_DIR = path.join(ROOT, 'js');
var OUT_DIR = path.join(ROOT, 'apps-script');

// Modules embarqués dans la page (le config en premier : dépendance).
var MODULES = [
  'teamkrys-config',
  'teamkrys-crypto',
  'teamkrys-schema',
  'teamkrys-participant',
  'teamkrys-app'
];

var GENERATED_HEADER =
  '<!-- FICHIER GÉNÉRÉ — ne pas éditer à la main.\n' +
  '     Source : js/%SRC%.js — régénérer avec `npm run build`. -->\n';

function wrap(name, source) {
  return GENERATED_HEADER.replace('%SRC%', name) +
    '<script>\n' + source.replace(/\s+$/, '') + '\n</script>\n';
}

function build(check) {
  var mismatches = [];
  MODULES.forEach(function (name) {
    var src = fs.readFileSync(path.join(JS_DIR, name + '.js'), 'utf8');
    var outPath = path.join(OUT_DIR, 'js_' + name + '.html');
    var content = wrap(name, src);
    if (check) {
      var existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
      if (existing !== content) mismatches.push('js_' + name + '.html');
    } else {
      fs.writeFileSync(outPath, content);
      process.stdout.write('écrit apps-script/js_' + name + '.html\n');
    }
  });
  if (check && mismatches.length) {
    process.stderr.write('Includes obsolètes : ' + mismatches.join(', ') +
      '\nExécutez `npm run build`.\n');
    process.exit(1);
  }
}

build(process.argv.indexOf('--check') !== -1);
