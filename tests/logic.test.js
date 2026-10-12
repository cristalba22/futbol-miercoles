'use strict';
const assert = require('node:assert/strict');
const logic = require('../logic.js');

function test(name, fn) {
  try { fn(); console.log('✓ ' + name); }
  catch (error) { console.error('✗ ' + name); throw error; }
}

const names = ['Fede', 'Tomi', 'Nico', 'Pablo', 'Juan', 'Lucho', 'Mati', 'Santi', 'Eze', 'Facu', 'Lean', 'Rama', 'Gabi', 'Nacho'];
const simpleRoster = names.join('\n');
const roleRoster = ['Fede ARQ', 'Tomi ARQ', 'Nico DEF', 'Pablo DEF', 'Juan DEF', 'Lucho DEF'].concat(names.slice(6)).join('\n');

test('limpia numeración y viñetas copiadas de WhatsApp', () => {
  const players = logic.parsePlayers('1. FEDE ARQ\n2) NICO DEF\n✅ MARTIN\n- LUCAS\nSUPLENTES:');
  assert.deepEqual(players.map(p => p.name), ['FEDE', 'NICO', 'MARTIN', 'LUCAS']);
  assert.equal(players[0].role, 'ARQ');
  assert.equal(players[1].role, 'DEF');
  assert.equal(players[2].role, null);
});

test('acepta catorce nombres sin ningún puesto', () => {
  const validation = logic.validateRoster(logic.parsePlayers(simpleRoster));
  assert.equal(validation.valid, true);
  assert.equal(validation.counts.ARQ, 0);
  assert.equal(validation.counts.DEF, 0);
});

test('acepta roles parciales sin bloquear el sorteo', () => {
  const text = simpleRoster.replace('Fede', 'Fede ARQ').replace('Nico', 'Nico DEF');
  const validation = logic.validateRoster(logic.parsePlayers(text));
  assert.equal(validation.valid, true);
  assert(validation.warnings.some(message => message.includes('un solo ARQ')));
});

test('deja los jugadores posteriores al número catorce como suplentes', () => {
  const validation = logic.validateRoster(logic.parsePlayers(simpleRoster + '\nPedro\nCarlos DEF'));
  assert.equal(validation.valid, true);
  assert.equal(validation.starters.length, 14);
  assert.deepEqual(validation.substitutes.map(p => p.name), ['Pedro', 'Carlos']);
});

test('rechaza menos de catorce y nombres duplicados', () => {
  const validation = logic.validateRoster(logic.parsePlayers('Fede\nfede\nNico'));
  assert.equal(validation.valid, false);
  assert(validation.errors.some(message => message.includes('Faltan 11')));
  assert(validation.errors.some(message => message.includes('más de una vez')));
});

test('con roles completos reparte un arquero y dos defensores por lado', () => {
  const players = logic.parsePlayers(roleRoster);
  for (let seed = 1; seed <= 30; seed += 1) {
    let state = seed;
    const random = () => ((state = state * 16807 % 2147483647) - 1) / 2147483646;
    const draw = logic.chooseTeams(players, [], random);
    assert.equal(draw.teamA.length, 7);
    assert.equal(draw.teamB.length, 7);
    assert.equal(logic.countByRole(draw.teamA).ARQ, 1);
    assert.equal(logic.countByRole(draw.teamB).ARQ, 1);
    assert.equal(logic.countByRole(draw.teamA).DEF, 2);
    assert.equal(logic.countByRole(draw.teamB).DEF, 2);
  }
});

test('sin ningún rol igualmente sortea siempre siete contra siete', () => {
  const draw = logic.chooseTeams(logic.parsePlayers(simpleRoster), []);
  assert.equal(draw.teamA.length, 7);
  assert.equal(draw.teamB.length, 7);
});

test('calcula el próximo miércoles incluyendo hoy si corresponde', () => {
  assert.equal(logic.nextWednesdayISO(new Date(2026, 9, 12)), '2026-10-14');
  assert.equal(logic.nextWednesdayISO(new Date(2026, 9, 14)), '2026-10-14');
});

console.log('\nTodas las pruebas pasaron.');
