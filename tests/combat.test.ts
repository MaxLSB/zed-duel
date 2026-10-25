import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { PASSIVE, SPELLS, STATS, STEP } from '../src/shared/balance';
import { parseMessage } from '../src/shared/protocol';
import type { Effect, PlayerId } from '../src/shared/types';

function duel(gap = 300) {
  const game = new Game();
  game.start(0);
  game.state.players[0].pos = { x: 500, y: 700 };
  game.state.players[1].pos = { x: 500 + gap, y: 700 };
  return game;
}
function advance(game: Game, seconds: number): Effect[] {
  const effects = new Map<number, Effect>();
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) {
    game.step();
    for (const effect of game.state.effects) effects.set(effect.id, effect);
  }
  return [...effects.values()];
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.0001, `${a} ≠ ${b}`);
const hits = (effects: Effect[]) => effects.filter((e) => e.kind === 'hit');

test('a stationary practice opponent cannot act or be pushed by body collision', () => {
  const game = new Game(1);
  game.start(0);
  game.state.players[0].pos = { x: 1800, y: 700 };
  const dummy = game.state.players[1];
  const position = { ...dummy.pos };
  assert.equal(game.input(1, { action: 'attack' }), false);
  assert.equal(game.input(1, { action: 'move', point: { x: 500, y: 500 } }), false);
  game.input(0, { action: 'move', point: position });
  advance(game, 2);
  assert.deepEqual(dummy.pos, position);
  assert.equal(game.state.players[0].hp, STATS.hp);
});
function cast(
  game: Game,
  spell: keyof typeof SPELLS,
  id: PlayerId = 0,
  point = game.state.players[1 - id].pos,
) {
  return game.input(id, { action: 'cast', spell, point: { ...point }, target: (1 - id) as PlayerId });
}

test('max-rank Q uses base damage and armor and has a real cooldown', () => {
  const game = duel();
  assert.equal(cast(game, 'q'), true);
  assert.equal(cast(game, 'q'), false);
  near(hits(advance(game, 0.6))[0].amount!, 240 / 2.119);
  assert.equal(game.state.players[0].cooldowns.q, 2);
});

test('Q passes through an opponent, damages once and expires at full range', () => {
  const game = duel();
  const enemy = game.state.players[1];
  enemy.mark = { owner: 0, expires: 3, stored: 0 };
  cast(game, 'q');
  const damage = hits(advance(game, 0.6));
  assert.equal(damage.length, 1);
  assert.equal(game.state.projectiles.length, 1);
  const projectile = game.state.projectiles[0];
  assert.ok(projectile.pos.x > enemy.pos.x + STATS.radius);
  assert.ok(projectile.remaining > 0);
  advance(game, 0.3);
  assert.equal(enemy.mark.stored, SPELLS.q.damage);
  assert.equal(game.state.projectiles.length, 0);
  near(projectile.pos.x, 500 + SPELLS.q.range);
});

test('Q misses off-axis targets and cannot hit during the cast delay', () => {
  const game = duel();
  cast(game, 'q', 0, { x: 500, y: 100 });
  assert.equal(hits(advance(game, 1)).length, 0);
  const second = duel();
  cast(second, 'q');
  assert.equal(hits(advance(second, 0.2)).length, 0);
});

test('two Q origins each deal full damage', () => {
  const game = duel(500);
  cast(game, 'w', 0, { x: 800, y: 700 });
  advance(game, 0.3);
  cast(game, 'q');
  const damage = hits(advance(game, 0.65));
  assert.equal(damage.length, 2);
  damage.forEach((e) => near(e.amount!, 240 / 2.119));
  assert.equal(game.state.projectiles.length, 2);
  for (const projectile of game.state.projectiles) assert.ok(projectile.pos.x > game.state.players[1].pos.x);
  advance(game, 0.2);
  assert.equal(game.state.projectiles.length, 0);
});

test('overlapping E applies one damage instance, enhanced slow, and W reduction', () => {
  const game = duel(220);
  cast(game, 'w', 0, { x: 720, y: 700 });
  advance(game, 0.2);
  const p = game.state.players[0];
  cast(game, 'e');
  const damage = hits(game.state.effects);
  assert.equal(damage.length, 1);
  near(damage[0].amount!, 160 / 2.119);
  near(game.state.players[1].slow, 0.6);
  near(p.cooldowns.w, 16 / 3 - 3);
});

test('W swap is single-use, waits for travel, and the shadow expires', () => {
  const game = duel(1000),
    p = game.state.players[0];
  cast(game, 'w', 0, { x: 1100, y: 700 });
  cast(game, 'w');
  assert.equal(p.pos.x, 500);
  advance(game, 0.3);
  near(p.pos.x, 1100);
  near(p.shadows[0].pos.x, 500);
  assert.equal(cast(game, 'w'), false);
  advance(game, 5);
  assert.equal(p.shadows.length, 0);
});

test('R grants untargetability, marks, and allows return immediately after landing', () => {
  const game = duel(500),
    p = game.state.players[0],
    enemy = game.state.players[1];
  cast(game, 'r');
  assert.equal(cast(game, 'r'), false);
  advance(game, 0.96);
  assert.equal(enemy.mark?.owner, 0);
  assert.equal(p.shadows[0].kind, 'r');
  near(p.cooldowns.r, 10);
  assert.equal(cast(game, 'r'), true);
  near(p.pos.x, 500);
  assert.equal(cast(game, 'r'), false);
});

test('R blocks incoming attacks, projectiles, slashes and targeting until reappearance', () => {
  const game = duel(300),
    p = game.state.players[0];
  cast(game, 'r');
  assert.deepEqual(p.ultimate, { started: 0, origin: { x: 500, y: 700 }, target: 1, attackAfter: true });
  assert.equal(cast(game, 'r', 1), false);
  cast(game, 'q', 1, { x: 500, y: 700 });
  cast(game, 'e', 1);
  game.input(1, { action: 'attack' });
  advance(game, 0.7);
  assert.equal(p.hp, STATS.hp);
  assert.ok(p.ultimate);
  advance(game, 0.4);
  assert.equal(p.ultimate, null);
  assert.equal(cast(game, 'e', 1), true);
  assert.ok(p.hp < STATS.hp);
});

test('cancelled R clears its approach animation and restores targetability', () => {
  const game = duel(500),
    p = game.state.players[0];
  p.pos.x = 100;
  game.state.players[1].pos.x = 600;
  cast(game, 'r');
  game.state.players[1].pos.x = 2330;
  advance(game, 0.65);
  assert.equal(p.ultimate, null);
  assert.ok(p.untargetableUntil <= game.state.time);
  assert.equal(p.shadows.length, 0);
  near(p.pos.x, 100);
});

test('Death Mark stores pre-mitigation damage', () => {
  const game = duel(220),
    enemy = game.state.players[1];
  enemy.mark = { owner: 0, expires: 0.5, stored: 0 };
  cast(game, 'e');
  near(enemy.mark.stored, 160);
  const damage = hits(advance(game, 0.55));
  assert.ok(damage.some((e) => Math.abs(e.amount! - (120.8 + 160 * 0.55) / 2.119) < 0.0001));
  assert.equal(enemy.mark, null);
});

test('passive triggers below half HP, deals magic damage, and observes its lockout', () => {
  const game = duel(220),
    enemy = game.state.players[1];
  enemy.hp = 1000;
  game.input(0, { action: 'attack' });
  const effects = advance(game, 2.5);
  assert.equal(effects.filter((e) => e.kind === 'passive').length, 1);
  assert.ok(hits(effects).some((e) => Math.abs(e.amount! - (STATS.hp * PASSIVE.ratio) / 1.6385) < 0.0001));
});

test('passive does not trigger above its threshold', () => {
  const game = duel(220);
  game.state.players[1].hp = STATS.hp / 2 + 100;
  game.input(0, { action: 'attack' });
  assert.equal(advance(game, 0.4).filter((e) => e.kind === 'passive').length, 0);
});

test('repeated attack orders do not interrupt an attack windup', () => {
  const game = duel(220);
  for (let i = 0; i < 24; i++) {
    game.input(0, { action: 'attack' });
    game.step();
  }
  assert.equal(hits(game.state.effects).length, 1);
});

test('Flash and movement are disabled during R', () => {
  const game = duel(300);
  cast(game, 'r');
  assert.equal(cast(game, 'd'), false);
  assert.equal(game.input(0, { action: 'move', point: { x: 100, y: 100 } }), false);
});

test('simultaneous lethal E casts can resolve as a draw', () => {
  const game = duel(220);
  game.state.players.forEach((p) => {
    p.hp = 10;
  });
  cast(game, 'e', 0);
  cast(game, 'e', 1);
  game.step();
  assert.equal(game.state.winner, 'draw');
});

test('invalid targets do not spend cooldowns; repeated spells have no resource limit', () => {
  const game = duel(1200),
    p = game.state.players[0];
  assert.equal(game.input(0, { action: 'cast', spell: 'r', point: p.pos }), false);
  assert.equal(p.cooldowns.r, 0);
  for (let i = 0; i < 30; i++) {
    assert.equal(cast(game, 'e'), true);
    assert.equal(cast(game, 'e'), false);
    advance(game, 1.1);
  }
});

test('Flash preserves maximum range and clamps to arena bounds', () => {
  const game = duel(1500),
    p = game.state.players[0];
  cast(game, 'd', 0, { x: -200, y: 700 });
  near(p.pos.x, 100);
  near(p.cooldowns.d, 10);
  advance(game, 9.9);
  assert.equal(cast(game, 'd'), true);
  near(p.cooldowns.d, 10);
  advance(game, 0.12);
  assert.ok(p.cooldowns.d >= 20);
  const second = duel();
  second.state.players[0].pos.x = 100;
  cast(second, 'd', 0, { x: -1000, y: 700 });
  near(second.state.players[0].pos.x, 65);
});

test('simultaneous damage resolves as a draw; a rematch resets all combat state', () => {
  const game = duel();
  for (const p of game.state.players) {
    p.hp = 10;
    p.mark = { owner: (1 - p.id) as PlayerId, expires: 0, stored: 0 };
  }
  game.step();
  assert.equal(game.state.winner, 'draw');
  assert.equal(game.state.phase, 'finished');
  game.start();
  assert.equal(game.state.phase, 'countdown');
  assert.equal(game.state.winner, null);
  assert.deepEqual(game.state.players[0].cooldowns, { q: 0, w: 0, e: 0, r: 0, d: 0 });
  assert.equal(game.state.players[0].mark, null);
  assert.equal(game.state.players[0].ultimate, null);
  assert.equal(game.state.players[0].hp, 2337);
});

test('protocol rejects malformed, unbounded, and non-finite inputs', () => {
  for (const raw of [
    '{"type":"input","seq":1,"input":{"action":"cast","spell":"f","point":{"x":500,"y":700}}}',
    '{',
    'null',
    '{"type":"join","code":"abc"}',
    '{"type":"input","seq":1,"input":{"action":"cast","spell":"x","point":{"x":1,"y":1}}}',
    '{"type":"input","seq":1,"input":{"action":"move","point":{"x":1e999,"y":0}}}',
  ])
    assert.equal(parseMessage(raw), null);
  assert.ok(parseMessage('{"type":"input","seq":4,"input":{"action":"stop"}}'));
});

test('attack-move acquires an opponent along its route without clicking the opponent', () => {
  const game = duel(500);
  const p = game.state.players[0];
  game.input(0, { action: 'attack-move', point: { x: 1500, y: 700 } });
  assert.ok(hits(advance(game, 1.2)).length > 0);
  assert.equal(p.attacking, true);
  assert.equal(p.attackMove, null);
  assert.ok(p.pos.x < 1000);
});

test('attack-move reaches empty ground and ignores an untargetable opponent', () => {
  const game = duel(300);
  const [p, enemy] = game.state.players;
  enemy.untargetableUntil = 5;
  game.input(0, { action: 'attack-move', point: { x: 800, y: 700 } });
  assert.equal(hits(advance(game, 1)).length, 0);
  near(p.pos.x, 800);
  game.input(0, { action: 'move', point: { x: 500, y: 300 } });
  assert.equal(p.attackMove, null);
});

test('stop cancels attack-move, movement and pending basic attacks until a new order', () => {
  const game = duel(200);
  const p = game.state.players[0];
  game.input(0, { action: 'attack-move', point: { x: 1000, y: 700 } });
  game.step();
  assert.ok(p.windupUntil > 0);
  game.input(0, { action: 'stop' });
  const pos = { ...p.pos };
  assert.equal(hits(advance(game, 1)).length, 0);
  assert.deepEqual(p.pos, pos);
  assert.equal(p.attackMove, null);
  assert.equal(p.attacking, false);
  game.input(0, { action: 'move', point: { x: 300, y: 300 } });
  advance(game, 0.2);
  game.input(0, { action: 'stop' });
  const stopped = { ...p.pos };
  advance(game, 0.5);
  assert.deepEqual(p.pos, stopped);
});

test('attack-move protocol requires a finite bounded destination', () => {
  const message = (point: unknown) =>
    JSON.stringify({ type: 'input', seq: 0, input: { action: 'attack-move', point } });
  assert.ok(parseMessage(message({ x: 1000, y: 700 })));
  assert.equal(parseMessage(message(undefined)), null);
  assert.equal(parseMessage(message({ x: 1e8, y: 0 })), null);
});

test('match stats count player and shadow projectiles once, including misses', () => {
  const game = duel(500);
  const p = game.state.players[0];
  cast(game, 'w', 0, { x: 800, y: 700 });
  advance(game, 0.3);
  cast(game, 'q');
  advance(game, 0.9);
  assert.equal(p.stats.shurikensThrown, 2);
  assert.equal(p.stats.shurikensHit, 2);
  near(p.stats.damageDealt, (2 * SPELLS.q.damage) / 2.119);
  advance(game, 1.2);
  cast(game, 'q', 0, { x: 500, y: 100 });
  advance(game, 0.9);
  assert.equal(p.stats.shurikensThrown, 4);
  assert.equal(p.stats.shurikensHit, 2);
  game.start(0);
  assert.deepEqual(game.state.players[0].stats, {
    shurikensThrown: 0,
    shurikensHit: 0,
    attacksHit: 0,
    damageDealt: 0,
  });
});

test('damage stats exclude overkill and count a successful basic attack once', () => {
  const game = duel(200);
  const [p, enemy] = game.state.players;
  enemy.hp = 10;
  game.input(0, { action: 'attack' });
  advance(game, 0.5);
  assert.equal(game.state.phase, 'finished');
  assert.equal(p.stats.attacksHit, 1);
  assert.ok(p.stats.damageDealt >= 10 && p.stats.damageDealt < 11);
});

test('S during ultimate cancels the automatic attack after landing', () => {
  const game = duel(500);
  const p = game.state.players[0];
  cast(game, 'r');
  advance(game, 0.3);
  assert.equal(game.input(0, { action: 'stop' }), true);
  advance(game, 1);
  assert.equal(p.ultimate, null);
  assert.equal(p.attacking, false);
  assert.equal(p.destination, null);
  assert.equal(p.stats.attacksHit, 0);
  const pos = { ...p.pos };
  advance(game, 0.5);
  assert.deepEqual(p.pos, pos);
  game.input(0, { action: 'attack' });
  advance(game, 0.3);
  assert.equal(p.stats.attacksHit, 1);
});

test('player, W and R slashes deal damage and charge Death Mark only once per E', () => {
  const game = duel(220);
  const [p, enemy] = game.state.players;
  cast(game, 'w', 0, { ...enemy.pos });
  advance(game, 0.1);
  cast(game, 'r');
  advance(game, 0.96);
  game.input(0, { action: 'stop' });
  assert.equal(p.shadows.length, 2);
  assert.ok(enemy.mark);
  const before = p.stats.damageDealt;
  const stored = enemy.mark.stored;
  const lastId = Math.max(0, ...game.state.effects.map((effect) => effect.id));
  cast(game, 'e');
  const effects = game.state.effects.filter((effect) => effect.id > lastId);
  assert.equal(effects.filter((effect) => effect.kind === 'slash').length, 3);
  assert.equal(hits(effects).length, 1);
  near(p.stats.damageDealt - before, SPELLS.e.damage / 2.119);
  near(enemy.mark.stored - stored, SPELLS.e.damage);
});

test('a travelling shadow cannot deal E damage again after the player already hit', () => {
  const game = duel(220);
  const p = game.state.players[0];
  cast(game, 'w');
  cast(game, 'e');
  const effects = advance(game, 0.2);
  assert.equal(effects.filter((effect) => effect.kind === 'slash').length, 2);
  assert.equal(hits(effects).length, 1);
  near(p.stats.damageDealt, SPELLS.e.damage / 2.119);
});
