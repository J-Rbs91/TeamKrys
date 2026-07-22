/**
 * Tests du schéma et de la validation d'état.
 */
'use strict';

var h = require('./helpers');
var Schema = require('../js/teamkrys-schema.js');

h.test('l\'état vide initial est valide', function () {
  var state = Schema.createEmptyState('2026-07-22T00:00:00.000Z');
  var res = Schema.validateState(state);
  h.assert(res.valid, 'état vide valide : ' + res.errors.join(', '));
});

h.test('une version de schéma incompatible est signalée', function () {
  var state = Schema.createEmptyState('x');
  state.schemaVersion = 999;
  var res = Schema.validateState(state);
  h.assert(!res.valid, 'schemaVersion incompatible doit invalider');
});

h.test('un topic mal formé est signalé', function () {
  var state = Schema.createEmptyState('x');
  state.topics.push({ id: 't' }); // titre/description/messages manquants
  var res = Schema.validateState(state);
  h.assert(!res.valid, 'un topic incomplet doit invalider');
});

h.test('un état complet valide passe', function () {
  var state = Schema.createEmptyState('x');
  state.participants.push({ id: 'p1', displayName: 'Bob', firstSeenAt: 'x' });
  state.topics.push({
    id: 't1', title: 'T', description: 'D', createdBy: 'p1', createdAt: 'x',
    messages: [{ id: 'm', body: 'salut', authorId: 'p1', createdAt: 'x' }],
    proposals: [{
      id: 'pr', title: 'P', authorId: 'p1', createdAt: 'x',
      votes: [{ participantId: 'p1', value: 'up' }]
    }]
  });
  var res = Schema.validateState(state);
  h.assert(res.valid, 'état complet valide : ' + res.errors.join(', '));
});

module.exports = true;
