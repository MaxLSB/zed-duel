import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { STEP } from '../src/shared/balance';
import { championStats } from '../src/shared/champions';
import { LEBLANC_SPELLS as S, LEBLANC_STATS, LEBLANC_PASSIVE as P } from '../src/shared/leblanc-balance';
import { parseMessage } from '../src/shared/protocol';
import { validRelayData } from '../src/shared/signaling';
import { HostedMatch } from '../src/shared/hosted-match';
import { GameConnection } from '../src/client/connection';
import type { ChampionId, PlayerId, ServerMessage, Vec } from '../src/shared/types';

function duel(gap = 500, other: ChampionId = 'zed') {
  const game = new Game(null, ['leblanc', other]);
  game.start(0);
  game.state.players[0].pos = { x: 700, y: 700 };
  game.state.players[1].pos = { x: 700 + gap, y: 700 };
  return game;
}
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.step();
}
function cast(game: Game, spell: keyof typeof S, point?: Vec, id: PlayerId = 0) {
  return game.input(id, {
    action: 'cast',
    spell,
    point: point ?? { ...game.state.players[1 - id].pos },
    target: (1 - id) as PlayerId,
  });
}
function near(a: number, b: number) {
  assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`);
}
const magic = (raw: number, champion: ChampionId = 'zed') => (raw * 100) / (100 + championStats(champion).mr);

test('LeBlanc entry points, relay and snapshots accept valid picks and reject old builds', () => {
  for (const type of ['create', 'join', 'practice', 'select-champion']) {
    assert.ok(parseMessage(JSON.stringify({ type, code: 'ABC123', champion: 'leblanc' })));
    assert.equal(parseMessage(JSON.stringify({ type, code: 'ABC123', champion: 'LeBlanc' })), null);
  }
  assert.ok(validRelayData(1, { type: 'hello', champion: 'leblanc' }));
  class Connection extends GameConnection {
    send() {}
    accept(message: ServerMessage) {
      this.receive(message);
    }
  }
  const connection = new Connection();
  const message: ServerMessage = {
    type: 'state',
    ack: 0,
    room: {
      mode: 'duel',
      code: 'ABC123',
      connected: [true, true],
      ready: [false, false],
      game: duel().state,
    },
  };
  connection.accept(message);
  assert.equal(connection.room?.game.players[0].champion, 'leblanc');
  const old = structuredClone(message);
  Reflect.deleteProperty(old.room.game, 'leblancMissiles');
  connection.accept(old);
  assert.equal(connection.room, null);
});

test('Sigil detonates once on another ability, not on attacks; damage respects both defenses', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  assert.ok(cast(game, 'q'));
  advance(game, 0.6);
  near(p.stats.damageDealt, magic(S.q.damage));
  assert.equal(enemy.sigils.length, 1);
  game.input(0, { action: 'attack' });
  advance(game, 0.35);
  game.input(0, { action: 'stop' });
  assert.equal(p.stats.attacksHit, 1);
  assert.equal(enemy.sigils.length, 1);
  assert.ok(cast(game, 'e'));
  advance(game, 0.6);
  near(
    p.stats.damageDealt,
    magic(S.q.damage + S.q.markDamage + S.e.damage) +
      (LEBLANC_STATS.ad * 100) / (100 + championStats('zed').armor),
  );
  assert.equal(enemy.sigils.length, 0);
  advance(game, 1.6);
  assert.ok(enemy.rootUntil > game.state.time);
  near(
    p.stats.damageDealt,
    magic(S.q.damage + S.q.markDamage + S.e.damage + S.e.rootDamage) +
      (LEBLANC_STATS.ad * 100) / (100 + championStats('zed').armor),
  );
});

test('Sigil approaches before spending cooldown; stop cancels; missing and untargetable targets fail', () => {
  const game = duel(1100),
    [p, enemy] = game.state.players;
  assert.equal(game.input(0, { action: 'cast', spell: 'q', point: enemy.pos }), false);
  assert.ok(cast(game, 'q'));
  assert.equal(p.cooldowns.q, 0);
  advance(game, 0.3);
  game.input(0, { action: 'stop' });
  advance(game, 1);
  assert.equal(p.cooldowns.q, 0);
  assert.ok(cast(game, 'q'));
  advance(game, 1.5);
  assert.ok(p.stats.damageDealt > 0);
  p.cooldowns.q = 0;
  enemy.untargetableUntil = 100;
  assert.equal(cast(game, 'q'), false);
});

test('Sigils expire; Q missiles fizzle on untargetability and E can miss', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  cast(game, 'q');
  advance(game, 0.3);
  enemy.untargetableUntil = 1;
  advance(game, 0.2);
  assert.equal(p.stats.damageDealt, 0);
  assert.equal(game.state.leblancMissiles.length, 0);
  advance(game, 1.6);
  cast(game, 'q');
  advance(game, 0.6);
  assert.equal(enemy.sigils.length, 1);
  advance(game, S.q.duration);
  assert.equal(enemy.sigils.length, 0);
  const before = p.stats.damageDealt;
  cast(game, 'e', { x: 700, y: 150 });
  advance(game, 1);
  near(p.stats.damageDealt, before);
  assert.equal(game.state.chains.length, 0);
});

test('Distortion travels, deals landing damage once and returns without dealing more damage', () => {
  const game = duel(),
    [p] = game.state.players;
  const start = { ...p.pos };
  cast(game, 'w');
  assert.deepEqual(p.pos, start);
  assert.ok(p.leblanc!.dash);
  advance(game, 0.2);
  assert.ok(p.pos.x > start.x && p.pos.x < 1200);
  assert.equal(p.stats.damageDealt, 0);
  advance(game, 0.45);
  near(p.stats.damageDealt, magic(S.w.damage));
  const cooldown = p.cooldowns.w;
  assert.ok(cast(game, 'w'));
  assert.deepEqual(p.pos, start);
  assert.equal(p.cooldowns.w, cooldown);
  assert.equal(p.leblanc!.returns.w, null);
  near(p.stats.damageDealt, magic(S.w.damage));
});

test('Mimic requires a basic cast, copies Q and E damage, and detonates their marks', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  assert.equal(cast(game, 'r'), false);
  assert.equal(p.cooldowns.r, 0);
  cast(game, 'q');
  advance(game, 0.6);
  cast(game, 'r');
  advance(game, 0.6);
  near(p.stats.damageDealt, magic(S.q.damage + S.q.markDamage + S.r.damage));
  assert.equal(enemy.sigils[0].mimic, true);
  cast(game, 'e');
  advance(game, 0.6);
  near(p.stats.damageDealt, magic(S.q.damage + S.q.markDamage + S.r.damage + S.r.followup + S.e.damage));
  p.cooldowns.r = 0;
  cast(game, 'r');
  advance(game, 0.6);
  assert.equal(game.state.chains.length, 2);
  advance(game, 1.6);
  near(
    p.stats.damageDealt,
    magic(S.q.damage + S.q.markDamage + S.r.damage * 2 + S.r.followup * 2 + S.e.damage + S.e.rootDamage),
  );
  assert.equal(game.state.chains.length, 0);
});

test('W and mimicked W retain independent return pads even after a different basic spell', () => {
  const game = duel(1300),
    [p] = game.state.players;
  const start = { ...p.pos };
  cast(game, 'w', { x: 1000, y: 700 });
  advance(game, 0.5);
  const middle = { ...p.pos };
  cast(game, 'r', { x: 1300, y: 700 });
  advance(game, 0.5);
  cast(game, 'e', { x: 1300, y: 100 });
  advance(game, 0.3);
  assert.equal(p.leblanc!.lastSpell, 'e');
  assert.ok(cast(game, 'w'));
  assert.deepEqual(p.pos, start);
  assert.ok(cast(game, 'r'));
  assert.deepEqual(p.pos, middle);
  assert.equal(p.leblanc!.lastSpell, 'e');
  assert.equal(p.leblanc!.returns.w, null);
  assert.equal(p.leblanc!.returns.r, null);
});

test('Return availability outlives W cooldown and expires without becoming a stale buffered dash', () => {
  const game = duel(1200),
    [p] = game.state.players;
  cast(game, 'w', { x: 800, y: 700 });
  advance(game, 3.7);
  assert.ok(cast(game, 'w'));
  near(p.pos.x, 700);
  cast(game, 'w', { x: 800, y: 700 });
  advance(game, 3.98);
  p.castUntil = game.state.time + 0.2;
  cast(game, 'w');
  advance(game, 0.3);
  assert.equal(p.leblanc!.returns.w, null);
  assert.equal(p.leblanc!.dash, null);
  near(p.pos.x, 800);
});

test('Chains break on separation or untargetability and root only after the full tether delay', () => {
  for (const escape of ['distance', 'untargetable'] as const) {
    const game = duel(),
      [p, enemy] = game.state.players;
    cast(game, 'e');
    advance(game, 0.6);
    assert.equal(game.state.chains.length, 1);
    assert.equal(enemy.rootUntil, 0);
    if (escape === 'distance') enemy.pos.x = 2300;
    else enemy.untargetableUntil = 5;
    advance(game, 2);
    assert.equal(game.state.chains.length, 0);
    assert.equal(enemy.rootUntil, 0);
    near(p.stats.damageDealt, magic(S.e.damage));
  }
});

test('Roots and adhesive block dash, Mimic dash, return and Flash but permit spellcasting', () => {
  const game = duel(500, 'singed'),
    [p] = game.state.players;
  cast(game, 'w', { x: 800, y: 700 });
  advance(game, 0.5);
  p.rootUntil = 10;
  for (const key of ['w', 'r', 'd'] as const) assert.equal(cast(game, key), false);
  assert.ok(cast(game, 'q'));
  advance(game, 0.3);
  p.rootUntil = 0;
  game.state.zones.push({ id: 999, owner: 1, kind: 'adhesive', pos: { ...p.pos }, created: 0, expires: 20 });
  assert.equal(cast(game, 'w'), false);
  assert.equal(cast(game, 'd'), false);
  assert.ok(cast(game, 'e'));
});

test('Charm interrupts Distortion before impact and cancels a pending Sigil', () => {
  for (const spell of ['w', 'q'] as const) {
    const game = duel(300, 'ahri'),
      [p] = game.state.players;
    cast(game, 'e', undefined, 1);
    advance(game, 0.3);
    cast(game, spell);
    advance(game, 0.3);
    assert.ok(p.charm);
    assert.equal(p.leblanc!.dash, null);
    assert.equal(p.stats.damageDealt, 0);
    assert.equal(cast(game, 'd'), false);
  }
});

test('Mirror Image triggers from damage, breaks targeting, allows area hits, expires and has a cooldown', () => {
  const game = duel(200),
    [p, enemy] = game.state.players;
  p.hp = LEBLANC_STATS.hp * P.threshold - 10;
  game.input(1, { action: 'attack' });
  cast(game, 'e', undefined, 1);
  assert.ok(p.leblanc!.clone);
  assert.ok(p.leblanc!.invisibleUntil > 0);
  assert.equal(enemy.attacking, false);
  assert.equal(game.input(1, { action: 'attack' }), false);
  assert.equal(cast(game, 'r', undefined, 1), false);
  assert.ok(game.input(0, { action: 'move', point: { x: 700, y: 800 } }));
  const clone = structuredClone(p.leblanc!.clone);
  const hp = p.hp;
  enemy.cooldowns.e = 0;
  cast(game, 'e', undefined, 1);
  assert.ok(p.hp < hp, 'area damage still hits invisibility');
  assert.deepEqual(p.leblanc!.clone, clone);
  advance(game, 0.2);
  assert.notDeepEqual(p.leblanc!.clone!.pos, clone.pos);
  cast(game, 'q');
  assert.equal(p.leblanc!.invisibleUntil, 0);
  advance(game, 8);
  assert.equal(p.leblanc!.clone, null);
  assert.ok(p.passiveAt > game.state.time);
});

test('LeBlanc mirror resets clear returns, clones, chains, marks and missiles and preserve both picks', () => {
  const game = duel(500, 'leblanc');
  cast(game, 'q');
  advance(game, 0.6);
  cast(game, 'e');
  advance(game, 0.6);
  cast(game, 'w');
  advance(game, 0.5);
  game.start(0);
  assert.deepEqual(game.state.leblancMissiles, []);
  assert.deepEqual(game.state.chains, []);
  for (const p of game.state.players) {
    assert.equal(p.champion, 'leblanc');
    assert.equal(p.hp, LEBLANC_STATS.hp);
    assert.equal(p.leblanc!.lastSpell, null);
    assert.equal(p.leblanc!.returns.w, null);
    assert.equal(p.leblanc!.clone, null);
    assert.equal(p.leblanc!.dash, null);
    assert.deepEqual(p.sigils, []);
  }
  advance(game, 3);
  assert.equal(game.state.players[0].stats.damageDealt, 0);
});

test('Browser host serializes LeBlanc guest combat and preserves picks through rematch', () => {
  const messages: ServerMessage[] = [];
  const match = new HostedMatch(
    'duel',
    'ABC123',
    (_, message) => messages.push(structuredClone(message)),
    'ahri',
  );
  assert.ok(match.join('leblanc'));
  match.handle(0, { type: 'ready' });
  match.handle(1, { type: 'ready' });
  for (let i = 0; i < 181; i++) match.step();
  match.game.state.players[1].pos = { x: 1000, y: 700 };
  match.handle(1, {
    type: 'input',
    seq: 1,
    input: { action: 'cast', spell: 'q', target: 0, point: { x: 500, y: 700 } },
  });
  for (let i = 0; i < 18; i++) match.step();
  match.broadcast();
  const snapshot = messages.at(-1)!;
  assert.ok(snapshot.type === 'state');
  assert.equal(snapshot.room.game.leblancMissiles[0].kind, 'sigil');
  advance(match.game, 0.5);
  assert.equal(match.game.state.players[0].sigils.length, 1);
  match.game.state.players[0].hp = 0;
  match.step();
  match.handle(0, { type: 'ready' });
  match.handle(1, { type: 'ready' });
  assert.equal(match.game.state.players[1].champion, 'leblanc');
  assert.equal(match.game.state.players[1].leblanc!.lastSpell, null);
});

test('Mimicked Distortion deals its enhanced damage and both dashes clamp to maximum range', () => {
  const game = duel(500),
    [p, enemy] = game.state.players;
  cast(game, 'w', { x: 700, y: 50 });
  advance(game, 0.7);
  near(p.pos.y, 100);
  enemy.pos = { x: 700, y: 700 };
  cast(game, 'r', { x: 700, y: 1300 });
  advance(game, 0.7);
  near(p.stats.damageDealt, magic(S.r.dashDamage));
  assert.ok(p.leblanc!.returns.w);
  assert.ok(p.leblanc!.returns.r);
});

test('Flash preserves Mirror Image stealth; basic attacks reveal it and lethal hits do not spawn clones', () => {
  const game = duel(200),
    [p] = game.state.players;
  p.hp = 900;
  cast(game, 'e', undefined, 1);
  const until = p.leblanc!.invisibleUntil;
  cast(game, 'd', { x: 700, y: 750 });
  assert.equal(p.leblanc!.invisibleUntil, until);
  game.input(0, { action: 'attack' });
  game.step();
  assert.equal(p.leblanc!.invisibleUntil, 0);
  const lethal = duel(200);
  lethal.state.players[0].hp = 1;
  cast(lethal, 'e', undefined, 1);
  assert.equal(lethal.state.players[0].hp, 0);
  assert.equal(lethal.state.players[0].leblanc!.clone, null);
});
