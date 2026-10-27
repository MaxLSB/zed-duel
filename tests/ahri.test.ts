import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { STEP, STATS } from '../src/shared/balance';
import { AHRI_SPELLS as S, AHRI_STATS, AHRI_PASSIVE } from '../src/shared/ahri-balance';
import { SINGED_STATS } from '../src/shared/singed-balance';
import { parseMessage } from '../src/shared/protocol';
import { validRelayData } from '../src/shared/signaling';
import { matchSummary } from '../src/client/match-summary';
import type { ChampionId, PlayerId, Vec } from '../src/shared/types';

function duel(gap = 500, other: ChampionId = 'zed') {
  const game = new Game(null, ['ahri', other]);
  game.start(0);
  game.state.players[0].pos = { x: 700, y: 700 };
  game.state.players[1].pos = { x: 700 + gap, y: 700 };
  return game;
}
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.step();
}
function cast(game: Game, spell: keyof typeof S, id: PlayerId = 0, point?: Vec) {
  return game.input(id, {
    action: 'cast',
    spell,
    point: point ?? { ...game.state.players[1 - id].pos },
    target: (1 - id) as PlayerId,
  });
}
function near(a: number, b: number, epsilon = 0.0001) {
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
}

test('Ahri protocol accepts all entry points and relay hello; malformed champions remain rejected', () => {
  for (const type of ['create', 'join', 'practice', 'select-champion']) {
    assert.ok(parseMessage(JSON.stringify({ type, champion: 'ahri', code: 'ABC123' })));
    for (const champion of ['Ahri', null, {}, ['ahri']])
      assert.equal(parseMessage(JSON.stringify({ type, champion, code: 'ABC123' })), null);
  }
  assert.ok(validRelayData(1, { type: 'hello', champion: 'ahri' }));
});

test('orb hits once per pass with magic outbound and true return damage, including potion defenses', () => {
  for (const other of ['zed', 'singed'] as const) {
    const game = duel(500, other),
      [p, enemy] = game.state.players;
    if (other === 'singed') cast(game, 'r', 1);
    cast(game, 'q');
    advance(game, 0.6);
    const mr = other === 'zed' ? STATS.mr : SINGED_STATS.mr + 85;
    near(p.stats.damageDealt, (S.q.damage * 100) / (100 + mr));
    advance(game, 1);
    near(p.stats.damageDealt, (S.q.damage * 100) / (100 + mr) + S.q.damage);
    assert.equal(game.state.ahriMissiles.length, 0);
    assert.equal(p.stats.shurikensThrown, 0);
    assert.equal(p.stats.shurikensHit, 0);
    assert.ok(enemy.hp > 0);
  }
});

test('returning orb follows Ahri after Flash, can miss, and cannot hit untargetable enemies', () => {
  const game = duel(400),
    [p, enemy] = game.state.players;
  cast(game, 'q');
  advance(game, 0.65);
  const outbound = p.stats.damageDealt;
  cast(game, 'd', 0, { x: 700, y: 200 });
  advance(game, 1);
  near(p.stats.damageDealt, outbound);
  assert.equal(game.state.ahriMissiles.length, 0);
  p.cooldowns.q = 0;
  enemy.untargetableUntil = 100;
  cast(game, 'q');
  advance(game, 2);
  near(p.stats.damageDealt, outbound);
});

test('Fox-Fire uses reduced repeat damage and grants decaying movement speed without a target', () => {
  const game = duel(),
    [p] = game.state.players;
  cast(game, 'w');
  advance(game, 1);
  near(p.stats.damageDealt, (S.w.damage * (1 + 2 * S.w.repeat) * 100) / (100 + STATS.mr));
  assert.equal(p.ahri!.fires, 0);
  const empty = duel(1400),
    a = empty.state.players[0];
  cast(empty, 'w');
  empty.input(0, { action: 'move', point: { x: 100, y: 700 } });
  const before = a.pos.x;
  empty.step();
  assert.ok(before - a.pos.x > AHRI_STATS.speed * STEP);
  advance(empty, 2.6);
  assert.equal(a.ahri!.fires, 0);
  assert.equal(a.stats.damageDealt, 0);
});

test('Charm cancels attacks and buffered casts, forces movement, blocks inputs, then expires', () => {
  const game = duel(500),
    [p, enemy] = game.state.players;
  game.input(1, { action: 'attack' });
  enemy.cooldowns.q = 0.55;
  cast(game, 'e');
  advance(game, 0.35);
  assert.ok(cast(game, 'q', 1));
  advance(game, 0.25);
  assert.ok(enemy.charm);
  assert.equal(enemy.attacking, false);
  assert.equal(enemy.windupUntil, 0);
  assert.equal(cast(game, 'd', 1), false);
  assert.equal(cast(game, 'r', 1), false);
  assert.equal(game.input(1, { action: 'stop' }), false);
  assert.equal(game.input(1, { action: 'move', point: { x: 2200, y: 700 } }), false);
  const x = enemy.pos.x;
  advance(game, 0.2);
  near(x - enemy.pos.x, STATS.speed * (1 - S.e.slow) * 0.2);
  assert.equal(enemy.stats.shurikensThrown, 0);
  advance(game, 2);
  assert.equal(enemy.charm, null);
  assert.ok(game.input(1, { action: 'move', point: { x: 2200, y: 700 } }));
  assert.equal(p.shadows.length, 0);
});

test('Charm is a dodgeable projectile and does not hit Death Mark untargetability', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  cast(game, 'e', 0, { x: 700, y: 100 });
  advance(game, 1);
  assert.equal(p.stats.damageDealt, 0);
  p.cooldowns.e = 0;
  enemy.untargetableUntil = 10;
  cast(game, 'e');
  advance(game, 1);
  assert.equal(enemy.charm, null);
  assert.equal(p.stats.damageDealt, 0);
});

test('Spirit Rush is a finite dash, fires a bolt, allows only three casts and enforces recast timing', () => {
  const game = duel(800),
    [p] = game.state.players;
  assert.ok(cast(game, 'r', 0, { x: 1200, y: 700 }));
  assert.equal(p.pos.x, 700);
  advance(game, 0.1);
  assert.ok(p.pos.x > 700 && p.pos.x < 1200);
  assert.equal(cast(game, 'r'), false);
  assert.ok(cast(game, 'w')); // W can be used in flight.
  advance(game, 0.6);
  assert.equal(p.pos.x, 1200);
  assert.equal(p.ahri!.dash, null);
  assert.ok(p.stats.damageDealt >= (S.r.damage * 100) / (100 + STATS.mr));
  advance(game, 0.31);
  assert.ok(cast(game, 'r', 0, { x: 1200, y: 1100 }));
  advance(game, 1.01);
  assert.ok(cast(game, 'r', 0, { x: 700, y: 1100 }));
  advance(game, 1.01);
  assert.equal(p.ahri!.rushCharges, 0);
  assert.equal(cast(game, 'r'), false);
  advance(game, 9.5);
  assert.ok(cast(game, 'r'));
  assert.equal(p.ahri!.rushCharges, 2);
});

test('unused Spirit Rush charges expire and do not reset the cooldown or open a fourth dash', () => {
  const game = duel(1400),
    p = game.state.players[0];
  cast(game, 'r', 0, { x: 700, y: 200 });
  advance(game, 15.1);
  assert.equal(p.ahri!.rushCharges, 0);
  assert.equal(cast(game, 'r'), false);
  advance(game, 10);
  assert.ok(cast(game, 'r'));
});

test('Singed grounding and roots block Spirit Rush and Flash but allow orb casts', () => {
  const game = duel(500, 'singed'),
    p = game.state.players[0];
  cast(game, 'w', 1, p.pos);
  advance(game, 0.4);
  assert.equal(cast(game, 'r'), false);
  assert.equal(cast(game, 'd'), false);
  assert.equal(p.cooldowns.r, 0);
  assert.ok(cast(game, 'q'));
  advance(game, 3);
  p.rootUntil = game.state.time + 2;
  assert.equal(cast(game, 'r'), false);
});

test('Charm interrupts Spirit Rush', () => {
  const game = duel(500, 'ahri'),
    [p, enemy] = game.state.players;
  cast(game, 'e');
  advance(game, 0.4);
  cast(game, 'r', 1, { x: 700, y: 700 });
  advance(game, 0.1);
  assert.ok(enemy.charm);
  assert.equal(enemy.ahri!.dash, null);
  assert.ok(p.stats.damageDealt > 0);
});

test('ranged attacks and champion kills do not grant Essence Theft stacks or healing', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  p.hp = 1000;
  enemy.hp = 1;
  game.input(0, { action: 'attack' });
  advance(game, 0.3);
  assert.equal(game.state.winner, 0);
  assert.equal(p.stats.attacksHit, 1);
  assert.equal(p.ahri!.essenceHits, 0);
  near(p.hp, 1000 + AHRI_STATS.hpRegen * game.state.time);
  near(p.stats.damageDealt, 1 + STATS.hpRegen * game.state.time);
});

test('three connecting casts heal once; orb passes and fox-fires each count only once per cast', () => {
  for (const grievous of [false, true]) {
    const game = duel(),
      [p] = game.state.players;
    p.hp = 1000;
    if (grievous) p.grievousUntil = 100;
    const factor = grievous ? 0.6 : 1;
    cast(game, 'q');
    advance(game, 1.6);
    assert.equal(p.ahri!.essenceHits, 1);
    cast(game, 'w');
    advance(game, 1);
    assert.equal(p.ahri!.essenceHits, 2);
    near(p.hp, 1000 + AHRI_STATS.hpRegen * game.state.time * factor);
    cast(game, 'e');
    advance(game, 0.7);
    assert.equal(p.ahri!.essenceHits, 0);
    near(p.hp, 1000 + AHRI_STATS.hpRegen * game.state.time * factor + AHRI_PASSIVE.heal * factor);
    cast(game, 'q');
    advance(game, 1.6);
    assert.equal(p.ahri!.essenceHits, 1);
    near(p.hp, 1000 + AHRI_STATS.hpRegen * game.state.time * factor + AHRI_PASSIVE.heal * factor);
  }
});

test('missed spells grant no stacks; each Spirit Rush dash can count and healing caps at max HP', () => {
  const game = duel(),
    [p] = game.state.players;
  cast(game, 'q', 0, { x: 700, y: 100 });
  advance(game, 1.6);
  assert.equal(p.ahri!.essenceHits, 0);
  for (let i = 0; i < 3; i++) {
    cast(game, 'r', 0, { ...p.pos });
    advance(game, 1.1);
    assert.equal(p.ahri!.essenceHits, (i + 1) % AHRI_PASSIVE.hits);
  }
  assert.equal(p.hp, AHRI_STATS.hp);
  assert.equal(game.state.effects.filter((e) => e.kind === 'passive').length, 1);
});

test('orb return can earn the cast stack if outbound misses; mirror counters are independent', () => {
  const game = duel(500, 'ahri'),
    [p, enemy] = game.state.players;
  enemy.untargetableUntil = 0.7;
  cast(game, 'q');
  advance(game, 0.7);
  assert.equal(p.ahri!.essenceHits, 0);
  advance(game, 0.8);
  assert.equal(p.ahri!.essenceHits, 1);
  assert.equal(enemy.ahri!.essenceHits, 0);
  cast(game, 'w', 1);
  advance(game, 1);
  assert.equal(enemy.ahri!.essenceHits, 1);
  assert.equal(p.ahri!.essenceHits, 1);
});

test('Ahri mirror resets all missiles, dashes, crowd control and stats; summary omits shurikens', () => {
  const game = duel(500, 'ahri');
  cast(game, 'w');
  cast(game, 'e');
  advance(game, 0.6);
  assert.ok(game.state.players[1].charm);
  assert.doesNotMatch(matchSummary(game.state, 0, false), /Shurikens/);
  game.start(0);
  assert.deepEqual(game.state.ahriMissiles, []);
  for (const p of game.state.players) {
    assert.equal(p.champion, 'ahri');
    assert.equal(p.hp, AHRI_STATS.hp);
    assert.equal(p.charm, null);
    assert.equal(p.ahri!.rushCharges, 0);
    assert.equal(p.ahri!.dash, null);
    assert.equal(p.ahri!.fires, 0);
    assert.equal(p.ahri!.essenceHits, 0);
    assert.equal(p.stats.damageDealt, 0);
  }
  advance(game, 2);
  assert.equal(game.state.ahriMissiles.length, 0);
  game.state.players[0].pos = { x: 700, y: 700 };
  game.state.players[1].pos = { x: 1200, y: 700 };
  cast(game, 'w');
  advance(game, 1);
  assert.equal(game.state.players[0].ahri!.essenceHits, 1);
});

test('Spirit Rush starts a full ten-second cooldown after the final dash lands or is interrupted', () => {
  for (const interrupted of [false, true]) {
    const game = duel(1400),
      p = game.state.players[0];
    cast(game, 'r', 0, { x: 700, y: 200 });
    advance(game, 1.1);
    cast(game, 'r', 0, { x: 700, y: 700 });
    advance(game, 1.1);
    const started = game.state.time;
    cast(game, 'r', 0, { x: 700, y: 200 });
    assert.equal(p.ahri!.rushCharges, 0);
    assert.ok(p.cooldowns.r > started + 10);
    advance(game, 0.1);
    assert.ok(p.ahri!.dash);
    assert.ok(p.ahri!.rushUntil > game.state.time);
    if (interrupted) p.ahri!.dash = null;
    while (p.ahri!.dash) game.step();
    if (interrupted) game.step();
    assert.ok(Math.abs(p.cooldowns.r - game.state.time - 10) < STEP);
    advance(game, 9.4);
    assert.equal(cast(game, 'r'), false);
    advance(game, 0.7);
    assert.ok(cast(game, 'r'));
  }
});
