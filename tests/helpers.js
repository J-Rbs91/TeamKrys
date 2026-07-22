/**
 * Micro-framework de test sans dépendance (Node 18+).
 */
'use strict';

var tests = [];
var only = [];

function test(name, fn) { tests.push({ name: name, fn: fn }); }
function testOnly(name, fn) { only.push({ name: name, fn: fn }); }

function assert(cond, message) {
  if (!cond) throw new Error(message || 'Assertion échouée');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'Valeurs différentes') +
      ' — attendu ' + JSON.stringify(expected) + ', obtenu ' + JSON.stringify(actual));
  }
}

async function assertRejects(promise, message) {
  var threw = false;
  try { await promise; } catch (e) { threw = true; }
  assert(threw, message || 'Une exception était attendue mais rien n\'a été levé');
}

async function run() {
  var toRun = only.length ? only : tests;
  var passed = 0;
  var failed = 0;
  for (var i = 0; i < toRun.length; i++) {
    var t = toRun[i];
    try {
      await t.fn();
      passed++;
      process.stdout.write('  ✓ ' + t.name + '\n');
    } catch (e) {
      failed++;
      process.stdout.write('  ✗ ' + t.name + '\n      ' + (e && e.message) + '\n');
    }
  }
  process.stdout.write('\n' + passed + ' réussis, ' + failed + ' échoués\n');
  return failed;
}

module.exports = { test: test, testOnly: testOnly, assert: assert, assertEqual: assertEqual, assertRejects: assertRejects, run: run };
