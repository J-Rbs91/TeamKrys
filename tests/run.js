#!/usr/bin/env node
/**
 * Point d'entrée des tests : charge chaque fichier *.test.js puis exécute la
 * suite. Aucune dépendance externe.
 */
'use strict';

var h = require('./helpers');

require('./crypto.test.js');
require('./no-plaintext.test.js');
require('./compat.test.js');
require('./schema.test.js');

h.run().then(function (failed) {
  process.exit(failed > 0 ? 1 : 0);
});
