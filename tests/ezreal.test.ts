import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { STEP } from '../src/shared/balance';
import { EZREAL_PASSIVE as P, EZREAL_SPELLS as S, EZREAL_STATS } from '../src/shared/ezreal-balance';
import { CHAMPIONS, attackSpeed, championStats } from '../src/shared/champions';
import { parseMessage } from '../src/shared/protocol';
import { validRelayData } from '../src/shared/signaling';
import { HostedMatch } from '../src/shared/hosted-match';
import { GameConnection } from '../src/client/connection';
import { Killcam } from '../src/client/killcam';
import type { ChampionId, PlayerId, RoomState, ServerMessage, Vec } from '../src/shared/types';

function duel(gap = 500, other: ChampionId = 'zed') {
  const game = new Game(null, ['ezreal', other]);
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
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`);
}
const physical = (raw: number, champion: ChampionId = 'zed') =>
  (raw * 100) / (100 + championStats(champion).armor);
const magic = (raw: number, champion: ChampionId = 'zed') => (raw * 100) / (100 + championStats(champion).mr);

test('Ezreal is accepted by every entry point and guest relay, malformed names are rejected', () => {
  for (const type of ['create', 'join', 'practice', 'select-champion']) {
    assert.ok(parseMessage(JSON.stringify({ type, champion: 'ezreal', code: 'ABC123' })));
    for (const champion of ['Ezreal', {}, ['ezreal'], null])
      assert.equal(parseMessage(JSON.stringify({ type, champion, code: 'ABC123' })), null);
  }
  assert.ok(validRelayData(1, { type: 'hello', champion: 'ezreal' }));
  assert.ok(validRelayData(1, { type: 'select-champion', champion: 'ezreal' }));
});

test('Mystic Shot deals physical damage once, refunds only champion spells and counts no basic attack', () => {
  const game = duel(),
    [p] = game.state.players;
  p.cooldowns.w = p.cooldowns.e = p.cooldowns.r = p.cooldowns.d = 10;
  assert.ok(cast(game, 'q'));
  advance(game, 0.2);
  assert.equal(game.state.ezrealMissiles.length, 0);
  advance(game, 0.5);
  near(p.stats.damageDealt, physical(S.q.damage));
  near(p.cooldowns.q, S.q.cooldown - S.q.refund);
  for (const key of ['w', 'e', 'r'] as const) near(p.cooldowns[key], 10 - S.q.refund);
  assert.equal(p.cooldowns.d, 10);
  assert.equal(p.stats.attacksHit, 0);
  assert.equal(p.stats.shurikensThrown, 0);
  assert.equal(p.ezreal!.stacks, 1);
  assert.equal(game.state.ezrealMissiles.length, 0);
});

test('missed, out-of-range and untargetable Mystic Shots neither damage nor refund cooldowns', () => {
  for (const mode of ['miss', 'range', 'untargetable']) {
    const game = duel(mode === 'range' ? 1400 : 500),
      [p, enemy] = game.state.players;
    if (mode === 'untargetable') enemy.untargetableUntil = 10;
    cast(game, 'q', 0, mode === 'miss' ? { x: 700, y: 100 } : enemy.pos);
    advance(game, 1.2);
    assert.equal(p.stats.damageDealt, 0);
    assert.equal(p.ezreal!.stacks, 0);
    assert.equal(p.cooldowns.q, S.q.cooldown);
    assert.equal(game.state.ezrealMissiles.length, 0);
  }
});

test('Flux application is harmless; Q, E, R or an attack detonate it once with magic damage', () => {
  for (const trigger of ['q', 'e', 'r', 'attack'] as const) {
    const game = duel(),
      [p, enemy] = game.state.players;
    cast(game, 'w');
    advance(game, 0.6);
    assert.ok(enemy.flux);
    assert.equal(p.stats.damageDealt, 0);
    assert.equal(p.ezreal!.stacks, 0);
    if (trigger === 'attack') game.input(0, { action: 'attack' });
    else cast(game, trigger, 0, trigger === 'e' ? { x: 950, y: 700 } : enemy.pos);
    advance(game, trigger === 'r' ? 1.4 : 0.6);
    assert.equal(enemy.flux, null);
    const damage =
      trigger === 'attack'
        ? physical(EZREAL_STATS.ad)
        : trigger === 'q'
          ? physical(S.q.damage)
          : magic(S[trigger].damage);
    near(p.stats.damageDealt, magic(S.w.damage) + damage);
    assert.equal(p.ezreal!.stacks, trigger === 'attack' ? 1 : 2);
    game.input(0, { action: 'stop' });
    advance(game, 0.5);
    near(p.stats.damageDealt, magic(S.w.damage) + damage);
  }
});

test('Flux expires, refreshes without detonating and stays independent in a mirror', () => {
  const game = duel(500, 'ezreal'),
    [p, enemy] = game.state.players;
  cast(game, 'w');
  cast(game, 'w', 1);
  advance(game, 0.6);
  assert.equal(enemy.flux?.owner, 0);
  assert.equal(p.flux?.owner, 1);
  const expiry = enemy.flux!.expires;
  p.cooldowns.w = 0;
  cast(game, 'w');
  advance(game, 0.6);
  assert.ok(enemy.flux!.expires > expiry);
  assert.equal(p.stats.damageDealt, 0);
  cast(game, 'q');
  advance(game, 0.6);
  assert.equal(enemy.flux, null);
  assert.ok(p.flux);
  assert.equal(p.ezreal!.stacks, 2);
  assert.equal(enemy.ezreal!.stacks, 0);
  advance(game, S.w.duration);
  assert.equal(p.flux, null);
  assert.equal(enemy.stats.damageDealt, 0);
});

test('Arcane Shift blinks after its windup, clamps range and launches a homing bolt', () => {
  const game = duel(800),
    [p, enemy] = game.state.players;
  cast(game, 'e');
  advance(game, 0.1);
  assert.equal(p.pos.x, 700);
  advance(game, 0.2);
  near(p.pos.x, 700 + S.e.range);
  assert.equal(game.state.ezrealMissiles[0]?.kind, 'e');
  enemy.pos.y += 100;
  advance(game, 0.4);
  near(p.stats.damageDealt, magic(S.e.damage));
  assert.equal(p.ezreal!.stacks, 1);
  p.cooldowns.e = 0;
  enemy.pos.x = 1700;
  cast(game, 'e', 0, { x: -1000, y: 700 });
  advance(game, 0.3);
  near(p.pos.x, 700);
  assert.equal(game.state.ezrealMissiles.length, 0);
});

test('Arcane Shift works with no target, obeys arena edges and loses its bolt to stealth or untargetability', () => {
  const empty = duel(1400),
    p = empty.state.players[0];
  p.pos = { x: 100, y: 100 };
  cast(empty, 'e', 0, { x: -500, y: 100 });
  advance(empty, 0.5);
  assert.deepEqual(p.pos, { x: 65, y: 100 });
  assert.equal(empty.state.ezrealMissiles.length, 0);
  for (const hidden of [false, true]) {
    const game = duel(800, 'leblanc'),
      [caster, enemy] = game.state.players;
    cast(game, 'e');
    advance(game, 0.3);
    if (hidden) enemy.leblanc!.invisibleUntil = 10;
    else enemy.untargetableUntil = 10;
    advance(game, 0.5);
    assert.equal(caster.stats.damageDealt, 0);
    assert.equal(game.state.ezrealMissiles.length, 0);
  }
});

test('roots and adhesive block E and Flash, including grounding acquired during E windup', () => {
  for (const grounded of [false, true]) {
    const game = duel(500, 'singed'),
      p = game.state.players[0];
    if (grounded) {
      cast(game, 'w', 1, p.pos);
      advance(game, 0.4);
    } else p.rootUntil = 10;
    assert.equal(cast(game, 'e'), false);
    assert.equal(cast(game, 'd'), false);
    assert.equal(p.cooldowns.e, 0);
    assert.ok(cast(game, 'q'));
  }
  const game = duel(),
    p = game.state.players[0];
  cast(game, 'e');
  p.rootUntil = 10;
  advance(game, 0.5);
  assert.equal(p.pos.x, 700);
  assert.equal(p.stats.damageDealt, 0);
});

test('Trueshot Barrage winds up for one second, crosses the arena and hits only once', () => {
  const game = duel(1400),
    [p] = game.state.players;
  cast(game, 'r');
  advance(game, 0.9);
  assert.equal(game.state.ezrealMissiles.length, 0);
  assert.equal(p.stats.damageDealt, 0);
  advance(game, 0.7);
  near(p.stats.damageDealt, magic(S.r.damage));
  assert.ok(game.state.ezrealMissiles.length);
  advance(game, 1.5);
  near(p.stats.damageDealt, magic(S.r.damage));
  assert.equal(game.state.ezrealMissiles.length, 0);
  assert.equal(p.cooldowns.r, 10);
});

test('Flash during casts preserves R origin, but Q launches from the new position', () => {
  for (const key of ['q', 'r'] as const) {
    const game = duel(),
      p = game.state.players[0];
    cast(game, key);
    advance(game, 0.1);
    cast(game, 'd', 0, { x: 700, y: 200 });
    while (!game.state.ezrealMissiles.length) game.step();
    const missile = game.state.ezrealMissiles[0];
    if (key === 'r') near(missile.pos.y, 700);
    else {
      assert.ok(missile.pos.y < 350);
      assert.ok(missile.velocity.y > 0);
    }
    assert.equal(p.pos.y, 300);
  }
});

test('Flash is immediate at every stage of R and preserves its launch time, position and direction', () => {
  for (const delay of [0, 0.45, 0.9]) {
    const game = duel(),
      [p, enemy] = game.state.players;
    const origin = { ...p.pos };
    assert.ok(cast(game, 'r'));
    const stamp = p.castUntil;
    advance(game, delay);
    assert.ok(cast(game, 'd', 0, { x: 700, y: 100 }));
    assert.equal(p.pos.y, 300);
    assert.equal(p.castUntil, stamp);
    assert.deepEqual(p.ezreal!.casting!.origin, origin);
    assert.equal(p.ezreal!.casting!.facing, 0);
    assert.equal(game.state.ezrealMissiles.length, 0);
    const blink = game.state.effects.find((e) => e.kind === 'flash')!;
    assert.equal(blink.at, game.state.time);
    assert.deepEqual(blink.from, origin);
    assert.deepEqual(blink.pos, p.pos);
    while (game.state.time < stamp) game.step();
    assert.ok(game.state.time - stamp < STEP + 0.00001);
    const missile = game.state.ezrealMissiles[0];
    assert.ok(missile);
    assert.equal(missile.kind, 'r');
    near(missile.pos.y, origin.y);
    assert.deepEqual(missile.velocity, { x: 1, y: 0 });
    assert.equal(p.ezreal!.casting, null);
    advance(game, 0.5);
    near(p.stats.damageDealt, magic(S.r.damage));
    assert.ok(enemy.hp < championStats(enemy.champion).hp);
  }
});

test('all champions emit the same Flash event with immutable departure and arrival points', () => {
  for (const champion of CHAMPIONS) {
    const game = new Game(null, [champion, 'zed']);
    game.start(0);
    const p = game.state.players[0],
      from = { ...p.pos };
    assert.ok(cast(game, 'd', 0, { x: 900, y: 700 }));
    const effect = game.state.effects.find((e) => e.kind === 'flash')!;
    assert.ok(effect, champion);
    assert.deepEqual(effect.from, from);
    assert.deepEqual(effect.pos, p.pos);
    assert.equal(game.state.effects.filter((e) => e.kind === 'blink').length, 0);
    const snapshot = structuredClone(effect);
    p.pos.x += 100;
    assert.deepEqual(effect, snapshot);
    game.start(0);
    assert.equal(game.state.effects.length, 0);
  }
});

test('Arcane Shift emits its own endpoint animation only when the blink succeeds', () => {
  for (const interrupted of [false, true]) {
    const game = duel(),
      p = game.state.players[0],
      from = { ...p.pos };
    cast(game, 'e', 0, { x: 950, y: 400 });
    advance(game, 0.1);
    assert.equal(game.state.effects.length, 0);
    if (interrupted) p.rootUntil = 10;
    advance(game, 0.2);
    const shift = game.state.effects.find((e) => e.kind === 'arcane-shift');
    assert.equal(!!shift, !interrupted);
    if (shift) {
      assert.deepEqual(shift.from, from);
      assert.deepEqual(shift.pos, p.pos);
      assert.ok(shift.at >= S.e.cast && shift.at < S.e.cast + STEP + 0.00001);
    }
    assert.equal(game.state.effects.filter((e) => e.kind === 'flash' || e.kind === 'blink').length, 0);
  }
});

test('Charm interrupts R windup and stops its charging visual', () => {
  const game = duel(500, 'ahri'),
    p = game.state.players[0];
  cast(game, 'r');
  cast(game, 'e', 1);
  advance(game, 0.3);
  p.cooldowns.q = 0.5;
  advance(game, 0.2);
  // Charm reaches Ezreal before R completes.
  advance(game, 0.2);
  assert.ok(p.charm);
  assert.equal(p.ezreal!.casting, null);
  assert.equal(cast(game, 'q'), false);
  advance(game, 1);
  assert.equal(p.stats.damageDealt, 0);
  assert.equal(game.state.ezrealMissiles.length, 0);
});

test('Wind Wall blocks Q/W/E/R and ranged attacks, granting no refund, mark or passive stacks', () => {
  for (const key of ['q', 'w', 'e', 'r', 'attack'] as const) {
    const game = duel(500, 'yasuo'),
      [p, enemy] = game.state.players;
    cast(game, 'w', 1, p.pos);
    advance(game, 0.3);
    if (key === 'attack') game.input(0, { action: 'attack' });
    else cast(game, key, 0, key === 'e' ? p.pos : enemy.pos);
    advance(game, key === 'r' ? 1.5 : 0.6);
    assert.equal(p.stats.damageDealt, 0, key);
    assert.equal(enemy.flux, null, key);
    assert.equal(p.ezreal!.stacks, 0, key);
    assert.equal(enemy.yasuo!.flow, 0);
    assert.equal(enemy.stats.yasuo!.projectilesBlocked, 1, key);
    if (key === 'q') near(p.cooldowns.q, 0.3 + S.q.cooldown);
  }
});

test('Rising Spell Force caps, refreshes, expires and accelerates attacks without counting attacks as spells', () => {
  const game = duel(),
    [p] = game.state.players;
  for (let i = 0; i < 7; i++) {
    p.cooldowns.q = 0;
    cast(game, 'q');
    advance(game, 0.5);
    assert.equal(p.ezreal!.stacks, Math.min(i + 1, P.stacks));
  }
  near(attackSpeed(p, game.state.time), EZREAL_STATS.attackSpeed + P.ratio * 0.5);
  game.input(0, { action: 'attack' });
  game.step();
  near(p.windupUntil - game.state.time, EZREAL_STATS.windup / attackSpeed(p, game.state.time));
  advance(game, 0.2);
  game.input(0, { action: 'stop' });
  assert.equal(p.stats.attacksHit, 1);
  assert.equal(p.ezreal!.stacks, 5);
  advance(game, P.duration);
  assert.equal(p.ezreal!.stacks, 0);
  near(attackSpeed(p, game.state.time), EZREAL_STATS.attackSpeed);
});

test('shared spell buffer holds W behind Q windup and Stop cancels the waiting spell', () => {
  for (const stop of [false, true]) {
    const game = duel(),
      p = game.state.players[0];
    cast(game, 'q');
    assert.ok(cast(game, 'w'));
    if (stop) game.input(0, { action: 'stop' });
    advance(game, 0.9);
    assert.equal(!!game.state.players[1].flux, !stop);
    assert.equal(p.ezreal!.casting, null);
  }
});

test('practice and rematches serialize and reset Ezreal state, pending casts and replay snapshots', () => {
  const messages: ServerMessage[] = [];
  const host = new HostedMatch(
    'practice',
    'ABC123',
    (_, message) => messages.push(structuredClone(message)),
    'ezreal',
  );
  host.handle(0, {
    type: 'input',
    seq: 1,
    input: { action: 'cast', spell: 'w', point: { x: 1450, y: 700 } },
  });
  for (let i = 0; i < 40; i++) host.step();
  host.broadcast();
  const snapshot = messages.at(-1)!;
  assert.ok(snapshot.type === 'state');
  assert.ok(snapshot.room.game.players[1].flux);
  const replay = new Killcam();
  replay.record(snapshot.room.game, 0);
  const finished = structuredClone(snapshot.room.game);
  finished.time += 1;
  finished.phase = 'finished';
  finished.players[1].hp = 0;
  replay.record(finished, 100);
  assert.ok(replay.sample(100)!.state.players[1].flux);
  host.handle(0, { type: 'reset-practice' });
  assert.equal(host.game.state.players[0].champion, 'ezreal');
  assert.equal(host.game.state.players[0].hp, EZREAL_STATS.hp);
  assert.equal(host.game.state.players[1].flux, null);
  assert.equal(host.game.state.players[0].ezreal!.stacks, 0);
  assert.ok(snapshot.room.game.players[1].flux);
  const game = duel(500, 'ezreal');
  cast(game, 'r');
  game.start(0);
  advance(game, 2);
  assert.equal(game.state.ezrealMissiles.length, 0);
  for (const p of game.state.players) {
    assert.equal(p.champion, 'ezreal');
    assert.equal(p.ezreal!.casting, null);
    assert.equal(p.stats.damageDealt, 0);
    assert.equal(p.flux, null);
  }
});

test('connection rejects older snapshots and malformed Ezreal passive state before rendering', () => {
  class Connection extends GameConnection {
    send() {}
    accept(message: ServerMessage) {
      this.receive(message);
    }
  }
  const connection = new Connection(),
    game = duel();
  const room: RoomState = {
    code: 'ABC123',
    mode: 'duel',
    connected: [true, true],
    ready: [true, true],
    game: game.state,
  };
  for (const stacks of [null, -1, 6, 0.5, '1']) {
    const bad = JSON.parse(JSON.stringify(room));
    bad.game.players[0].ezreal.stacks = stacks;
    connection.accept({ type: 'state', room: bad, ack: 0 });
    assert.equal(connection.room, null);
  }
  const old = JSON.parse(JSON.stringify(room));
  delete old.game.ezrealMissiles;
  connection.accept({ type: 'state', room: old, ack: 0 });
  assert.equal(connection.room, null);
  connection.accept({ type: 'state', room, ack: 0 });
  assert.equal(connection.room, room);
});

test('Ezreal guest combat survives serialization and rematches reset both mirror picks', () => {
  const snapshots: RoomState[] = [];
  const match = new HostedMatch(
    'duel',
    'ABC123',
    (_, message) => {
      if (message.type === 'state') snapshots.push(structuredClone(message.room));
    },
    'ezreal',
  );
  assert.ok(match.join('zed'));
  match.handle(0, { type: 'ready' });
  match.handle(1, { type: 'select-champion', champion: 'ezreal' });
  assert.deepEqual(snapshots.at(-1)!.ready, [false, false]);
  match.handle(0, { type: 'ready' });
  match.handle(1, { type: 'ready' });
  for (let i = 0; i < 181; i++) match.step();
  match.game.state.players[1].pos = { x: 1000, y: 700 };
  match.handle(1, {
    type: 'input',
    seq: 1,
    input: { action: 'cast', spell: 'w', point: { x: 500, y: 700 } },
  });
  for (let i = 0; i < 20; i++) match.step();
  match.broadcast();
  assert.equal(snapshots.at(-1)!.game.ezrealMissiles[0].owner, 1);
  for (let i = 0; i < 20; i++) match.step();
  match.broadcast();
  assert.equal(snapshots.at(-1)!.game.players[0].flux?.owner, 1);
  match.game.state.players[0].hp = 0;
  match.step();
  match.handle(0, { type: 'ready' });
  match.handle(1, { type: 'ready' });
  assert.equal(match.game.state.phase, 'countdown');
  for (const p of match.game.state.players) {
    assert.equal(p.champion, 'ezreal');
    assert.equal(p.ezreal!.stacks, 0);
    assert.equal(p.flux, null);
  }
  assert.equal(match.game.state.ezrealMissiles.length, 0);
  match.leave();
  assert.ok(match.join('ezreal'));
  assert.equal(match.game.state.players[1].champion, 'ezreal');
});

test('Ezreal damage respects Singed potion defenses, Yasuo shield and actual HP removed', () => {
  const game = duel(500, 'singed'),
    [p, enemy] = game.state.players;
  cast(game, 'r', 1);
  cast(game, 'w');
  advance(game, 0.6);
  cast(game, 'q');
  advance(game, 0.6);
  const stats = championStats(enemy.champion);
  near(
    p.stats.damageDealt,
    (S.w.damage * 100) / (100 + stats.mr + 85) + (S.q.damage * 100) / (100 + stats.armor + 85),
  );
  const shielded = duel(500, 'yasuo'),
    [ezreal, yasuo] = shielded.state.players;
  yasuo.yasuo!.flow = 100;
  cast(shielded, 'q');
  advance(shielded, 0.6);
  assert.equal(ezreal.stats.damageDealt, 0);
  assert.ok(yasuo.stats.yasuo!.shieldAbsorbed > 0);
  assert.equal(ezreal.ezreal!.stacks, 1);
  const lethal = duel(),
    caster = lethal.state.players[0];
  lethal.state.players[1].hp = 1;
  cast(lethal, 'q');
  advance(lethal, 0.6);
  assert.equal(lethal.state.winner, 0);
  near(caster.stats.damageDealt, 1 + championStats('zed').hpRegen * lethal.state.time);
});
