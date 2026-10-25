import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { SPELLS, STEP } from '../src/shared/balance';
import type { SpellKey } from '../src/shared/balance';
import type { Vec } from '../src/shared/types';

function duel(gap = 500) {
  const game = new Game();
  game.start(0);
  game.state.players[0].pos = { x: 500, y: 700 };
  game.state.players[1].pos = { x: 500 + gap, y: 700 };
  return game;
}
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.step();
}
function cast(game: Game, spell: SpellKey, point: Vec = game.state.players[1].pos) {
  return game.input(0, { action: 'cast', spell, point, target: 1 });
}

test('Q then W queues W through the cast and retains the original aim', () => {
  const game = duel();
  const p = game.state.players[0];
  const aim = { x: 800, y: 400 };
  cast(game, 'q');
  assert.equal(cast(game, 'w', aim), true);
  aim.x = 2200;
  assert.equal(p.cooldowns.w, 0);
  advance(game, 0.2);
  assert.equal(p.shadows.length, 0);
  advance(game, 0.05);
  assert.equal(p.shadows.length, 1);
  assert.deepEqual(p.shadows[0].pos, { x: 800, y: 400 });
  assert.ok(p.shadows[0].created >= SPELLS.q.cast);
  assert.ok(p.shadows[0].created <= SPELLS.q.cast + STEP);
});

test('instant E and Flash remain immediate and do not discard a waiting W', () => {
  const game = duel();
  const p = game.state.players[0];
  cast(game, 'q');
  cast(game, 'w', { x: 800, y: 700 });
  assert.equal(cast(game, 'e'), true);
  assert.equal(p.cooldowns.e, SPELLS.e.cooldown);
  assert.equal(cast(game, 'd', { x: 500, y: 300 }), true);
  assert.equal(p.pos.y, 300);
  advance(game, 0.25);
  assert.equal(p.shadows.length, 1);
});

test('only the latest waiting spell executes; early cooldown inputs never bypass cooldowns', () => {
  const game = duel();
  const p = game.state.players[0];
  p.cooldowns.q = 0.2;
  p.cooldowns.w = 0.2;
  assert.equal(cast(game, 'q'), true);
  assert.equal(cast(game, 'w'), true);
  advance(game, 0.15);
  assert.equal(p.shadows.length, 0);
  advance(game, 0.1);
  assert.equal(p.shadows.length, 1);
  assert.equal(p.stats.shurikensThrown, 0);
  assert.equal(cast(game, 'w'), true);
  assert.equal(cast(game, 'q'), true);
  assert.equal(cast(game, 'q'), false);
});

test('inputs more than 250 ms early are discarded instead of firing much later', () => {
  const game = duel();
  game.state.players[0].cooldowns.q = 0.5;
  assert.equal(cast(game, 'q'), false);
  advance(game, 1);
  assert.equal(game.state.players[0].stats.shurikensThrown, 0);
});

test('late ultimate follow-up casts start after landing, from the landing position', () => {
  const game = duel();
  const p = game.state.players[0];
  cast(game, 'r');
  assert.equal(cast(game, 'q'), false);
  advance(game, 0.75);
  assert.equal(cast(game, 'q'), true);
  assert.equal(p.cooldowns.q, 0);
  advance(game, 0.25);
  assert.equal(p.ultimate, null);
  assert.ok(p.cooldowns.q >= SPELLS.r.delay + SPELLS.r.dash + SPELLS.q.cooldown);
  assert.ok(p.castUntil >= 1.17);
  advance(game, 0.25);
  assert.ok(game.state.projectiles.some((q) => q.origin === 0 && q.velocity.x < 0));
});

test('S, movement and attack orders cancel a buffered spell', () => {
  for (const input of [
    { action: 'stop' },
    { action: 'move', point: { x: 300, y: 400 } },
    { action: 'attack' },
  ] as const) {
    const game = duel();
    cast(game, 'q');
    cast(game, 'w');
    game.input(0, input);
    advance(game, 0.3);
    assert.equal(game.state.players[0].shadows.length, 0);
    assert.equal(game.state.players[0].cooldowns.w, 0);
  }
});

test('stale shadow swaps and extended lockouts expire without becoming new casts', () => {
  const game = duel();
  cast(game, 'w');
  const p = game.state.players[0];
  assert.equal(cast(game, 'w'), true);
  p.shadows[0].expires = 0.1;
  advance(game, 0.4);
  assert.equal(p.shadows.length, 0);
  assert.equal(p.pos.x, 500);
  p.cooldowns.q = game.state.time + 0.15;
  cast(game, 'q');
  p.castUntil = game.state.time + 0.5;
  advance(game, 0.8);
  assert.equal(p.stats.shurikensThrown, 0);
});

test('death, rematch and disconnect clear waiting spells', () => {
  for (const reset of ['death', 'start', 'disconnect']) {
    const game = duel();
    cast(game, 'q');
    cast(game, 'w');
    if (reset === 'death') game.state.players[1].hp = 0;
    if (reset === 'start') game.start(0);
    if (reset === 'disconnect') game.disconnect();
    advance(game, 0.5);
    assert.equal(game.state.players[0].shadows.length, 0);
  }
});

test('out-of-range R follows a moving target and casts once in range', () => {
  const game = duel(1100);
  const [p, enemy] = game.state.players;
  assert.equal(cast(game, 'r'), true);
  assert.equal(p.cooldowns.r, 0);
  advance(game, 0.2);
  assert.ok(p.pos.x > 500);
  enemy.pos.y = 1000;
  advance(game, 0.1);
  assert.equal(p.destination?.y, 1000);
  assert.equal(p.cooldowns.r, 0);
  advance(game, 1.5);
  assert.ok(p.ultimate);
  assert.ok(p.cooldowns.r > 10);
  advance(game, 1);
  assert.equal(enemy.mark?.owner, 0);
  assert.equal(p.shadows.filter((s) => s.kind === 'r').length, 1);
});

test('S and new move commands cancel the R approach without spending R', () => {
  for (const input of [{ action: 'stop' }, { action: 'move', point: { x: 300, y: 300 } }] as const) {
    const game = duel(1100);
    cast(game, 'r');
    advance(game, 0.2);
    game.input(0, input);
    advance(game, 3);
    assert.equal(game.state.players[0].cooldowns.r, 0);
    assert.equal(game.state.players[0].ultimate, null);
  }
});

test('R approach cancels when the target becomes untargetable and resets between rounds', () => {
  const game = duel(1100);
  cast(game, 'r');
  game.state.players[1].untargetableUntil = 1;
  advance(game, 0.1);
  assert.equal(game.state.players[0].destination, null);
  advance(game, 1.1);
  assert.equal(game.state.players[0].cooldowns.r, 0);
  cast(game, 'r');
  game.start(0);
  advance(game, 2);
  assert.equal(game.state.players[0].destination, null);
});

test('Flash into range preserves a previously ordered R', () => {
  const game = duel(1000);
  cast(game, 'r');
  cast(game, 'd');
  game.step();
  assert.ok(game.state.players[0].ultimate);
  assert.ok(game.state.players[0].cooldowns.r > 0);
});

test('R return buffered just before landing swaps on the landing tick', () => {
  const game = duel();
  const p = game.state.players[0];
  cast(game, 'r');
  advance(game, 0.8);
  assert.equal(cast(game, 'r'), true);
  const landing = SPELLS.r.delay + SPELLS.r.dash;
  while (game.state.time < landing - STEP) game.step();
  assert.equal(p.shadows[0].swapped, false);
  while (p.ultimate) game.step();
  assert.ok(game.state.time <= landing + STEP);
  assert.equal(p.shadows[0].swapped, true);
  assert.equal(p.pos.x, 500);
  assert.equal(game.state.players[1].mark?.owner, 0);
  assert.equal(p.cooldowns.r, SPELLS.r.cooldown);
});
