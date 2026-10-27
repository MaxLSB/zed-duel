import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { STEP } from '../src/shared/balance';
import { championStats } from '../src/shared/champions';
import { YASUO_SPELLS as S, YASUO_PASSIVE as P } from '../src/shared/yasuo-balance';
import { blockedByWindWall } from '../src/shared/wind-wall';
import { parseMessage } from '../src/shared/protocol';
import { validRelayData } from '../src/shared/signaling';
import { HostedMatch } from '../src/shared/hosted-match';
import { GameConnection } from '../src/client/connection';
import { matchSummary } from '../src/client/match-summary';
import type { ChampionId, PlayerId, ServerMessage, Vec } from '../src/shared/types';

function duel(gap = 350, other: ChampionId = 'zed') {
  const game = new Game(null, ['yasuo', other]);
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
const physical = (raw: number) => (raw * 100) / (100 + championStats('zed').armor);
function readyTornado(game: Game) {
  assert.ok(cast(game, 'q'));
  advance(game, 0.9);
  assert.ok(cast(game, 'q'));
  advance(game, 0.9);
  assert.equal(game.state.players[0].yasuo!.stacks, 2);
}

test('Yasuo picks work through protocol and relay; incompatible snapshots are rejected', () => {
  for (const type of ['create', 'join', 'practice', 'select-champion'])
    assert.ok(parseMessage(JSON.stringify({ type, code: 'ABC123', champion: 'yasuo' })));
  assert.ok(validRelayData(1, { type: 'hello', champion: 'yasuo' }));
  assert.equal(validRelayData(1, { type: 'hello', champion: 'Yasuo' }), false);
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
  assert.equal(connection.room?.game.players[0].champion, 'yasuo');
  for (const field of ['windWalls', 'tornadoes']) {
    const old = structuredClone(message);
    Reflect.deleteProperty(old.room.game, field);
    connection.accept(old);
    assert.equal(connection.room, null);
  }
  const malformed = structuredClone(message);
  malformed.room.game.players[0].yasuo = null;
  connection.accept(malformed);
  assert.equal(connection.room, null);
});

test('Steel Tempest stacks only on hits, expires, and third cast launches one damaging knockup', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  cast(game, 'q', { x: 700, y: 100 });
  advance(game, 0.9);
  assert.equal(p.yasuo!.stacks, 0);
  readyTornado(game);
  near(p.stats.damageDealt, physical(2 * S.q.damage));
  assert.ok(cast(game, 'q'));
  assert.equal(p.yasuo!.stacks, 0);
  advance(game, 0.25);
  assert.equal(game.state.tornadoes.length, 1);
  advance(game, 0.3);
  assert.ok(enemy.airborne);
  assert.equal(p.stats.yasuo!.knockups, 1);
  near(p.stats.damageDealt, physical(3 * S.q.damage));
  advance(game, 1);
  assert.equal(enemy.airborne, null);
  assert.equal(game.state.tornadoes.length, 0);
  cast(game, 'q');
  advance(game, 0.3);
  assert.equal(p.yasuo!.stacks, 1);
  advance(game, S.q.duration);
  assert.equal(p.yasuo!.stacks, 0);
});

test('Q misses outside its line/range and cannot hit untargetable targets', () => {
  for (const mode of ['range', 'axis', 'untargetable']) {
    const game = duel(mode === 'range' ? 600 : 350),
      [p, enemy] = game.state.players;
    if (mode === 'untargetable') enemy.untargetableUntil = 10;
    cast(game, 'q', mode === 'axis' ? { x: 700, y: 100 } : undefined);
    advance(game, 0.4);
    assert.equal(p.stats.damageDealt, 0);
    assert.equal(p.yasuo!.stacks, 0);
  }
});

test('Flow builds from actual walking and dashing, not idle time, blocked movement or Flash', () => {
  const game = duel(1000),
    [p] = game.state.players;
  advance(game, 1);
  assert.equal(p.yasuo!.flow, 0);
  game.input(0, { action: 'move', point: { x: 700, y: 1100 } });
  advance(game, 1);
  near(p.yasuo!.flow, (championStats('yasuo').speed / P.distance) * P.maxFlow);
  const before = p.yasuo!.flow;
  p.rootUntil = game.state.time + 2;
  advance(game, 1);
  near(p.yasuo!.flow, before);
  p.rootUntil = 0;
  cast(game, 'd', { x: 1100, y: 1100 });
  near(p.yasuo!.flow, before);
  const dash = duel(),
    actor = dash.state.players[0];
  cast(dash, 'e');
  advance(dash, 0.6);
  near(actor.yasuo!.flow, (S.e.range / P.distance) * P.maxFlow);
});

test('full Flow shields incoming damage after resistance, records absorption and expires', () => {
  const game = duel(200),
    [p, enemy] = game.state.players;
  p.yasuo!.flow = 100;
  cast(game, 'e', undefined, 1);
  assert.equal(p.hp, championStats('yasuo').hp);
  assert.equal(p.yasuo!.flow, 0);
  assert.ok(p.yasuo!.shield < P.shield && p.yasuo!.shield > 0);
  assert.equal(enemy.stats.damageDealt, 0);
  const shield = p.yasuo!.shield;
  near(p.stats.yasuo!.shieldAbsorbed, P.shield - shield);
  advance(game, 1.1);
  assert.equal(p.yasuo!.shield, 0);
  enemy.cooldowns.e = 0;
  cast(game, 'e', undefined, 1);
  assert.ok(enemy.stats.damageDealt > 0);
  near(p.stats.yasuo!.shieldAbsorbed, P.shield - shield);
});

test('Wind Wall destroys Zed, Ahri and LeBlanc missiles without damage, marks or crowd control', () => {
  for (const [champion, spell] of [
    ['zed', 'q'],
    ['ahri', 'q'],
    ['ahri', 'e'],
    ['ahri', 'w'],
    ['ahri', 'r'],
    ['leblanc', 'q'],
    ['leblanc', 'e'],
  ] as const) {
    const game = duel(500, champion),
      [p, enemy] = game.state.players;
    cast(game, 'w');
    cast(game, spell, champion === 'ahri' && spell === 'r' ? { ...enemy.pos } : undefined, 1);
    advance(game, 1.5);
    assert.equal(enemy.stats.damageDealt, 0, `${champion} ${spell}`);
    assert.ok(p.stats.yasuo!.projectilesBlocked > 0, `${champion} ${spell} did not reach wall`);
    assert.equal(p.charm, null);
    assert.deepEqual(p.sigils, []);
    assert.deepEqual(game.state.chains, []);
    assert.deepEqual(game.state.projectiles, []);
    assert.deepEqual(game.state.ahriMissiles, []);
    assert.deepEqual(game.state.leblancMissiles, []);
  }
});

test('Wind Wall blocks returning true-damage orbs, hostile tornadoes and ranged basic attacks', () => {
  const game = duel(500, 'ahri'),
    [p, enemy] = game.state.players;
  cast(game, 'w');
  game.state.ahriMissiles.push({
    id: 100,
    castId: 100,
    owner: 1,
    kind: 'orb',
    pos: { x: 850, y: 700 },
    velocity: { x: -1, y: 0 },
    remaining: 0,
    returning: true,
    hit: false,
    damage: 200,
    expires: 10,
  });
  enemy.pos = { x: 400, y: 700 };
  advance(game, 0.2);
  assert.equal(p.stats.yasuo!.projectilesBlocked, 1);
  assert.equal(enemy.stats.damageDealt, 0);
  enemy.pos = { x: 1200, y: 700 };
  game.input(1, { action: 'attack' });
  advance(game, 0.4);
  assert.equal(enemy.stats.attacksHit, 0);
  assert.equal(p.stats.yasuo!.projectilesBlocked, 2);
  const mirror = duel(500, 'yasuo');
  cast(mirror, 'w');
  const other = mirror.state.players[1];
  other.yasuo!.stacks = 2;
  other.yasuo!.stacksUntil = 10;
  cast(mirror, 'q', undefined, 1);
  advance(mirror, 1);
  assert.equal(mirror.state.players[0].airborne, null);
  assert.equal(other.stats.damageDealt, 0);
  assert.equal(mirror.state.players[0].stats.yasuo!.projectilesBlocked, 1);
});

test('Wind Wall respects ownership, width, expiry and swept collision; melee and area hits pass', () => {
  const game = duel(200),
    [p, enemy] = game.state.players;
  cast(game, 'w');
  assert.equal(blockedByWindWall(game.state, 0, { x: 600, y: 700 }, { x: 1000, y: 700 }, 10), false);
  assert.equal(blockedByWindWall(game.state, 1, { x: 600, y: 1100 }, { x: 1000, y: 1100 }, 10), false);
  assert.equal(blockedByWindWall(game.state, 1, { x: 1000, y: 700 }, { x: 600, y: 700 }, 10), true);
  cast(game, 'e', undefined, 1);
  assert.ok(enemy.stats.damageDealt > 0);
  game.input(1, { action: 'attack' });
  advance(game, 0.3);
  assert.equal(enemy.stats.attacksHit, 1);
  game.input(1, { action: 'stop' });
  advance(game, S.w.duration);
  assert.deepEqual(game.state.windWalls, []);
  const damage = enemy.stats.damageDealt;
  cast(game, 'q', undefined, 1);
  advance(game, 0.6);
  assert.ok(enemy.stats.damageDealt > damage);
  assert.ok(p.hp > 0);
});

test('Sweeping Blade travels through its target, deals magic damage once, and enforces per-target lockout', () => {
  const game = duel(),
    [p] = game.state.players;
  assert.ok(cast(game, 'e'));
  assert.equal(p.pos.x, 700);
  advance(game, 0.2);
  assert.ok(p.pos.x > 700 && p.pos.x < 1175);
  advance(game, 0.4);
  assert.equal(p.yasuo!.dash, null);
  near(p.stats.damageDealt, (S.e.damage * 100) / (100 + championStats('zed').mr));
  assert.equal(p.stats.yasuo!.dashesHit, 1);
  assert.equal(cast(game, 'e'), false);
  advance(game, S.e.lockout);
  assert.ok(cast(game, 'e'));
});

test('Q during E becomes a landing slash; empowered E-Q knocks up without launching a tornado', () => {
  for (const empowered of [false, true]) {
    const game = duel(),
      [p, enemy] = game.state.players;
    if (empowered) readyTornado(game);
    const before = p.stats.damageDealt;
    cast(game, 'e');
    assert.ok(cast(game, 'q'));
    assert.equal(cast(game, 'q'), false);
    advance(game, 0.6);
    near(
      p.stats.damageDealt - before,
      physical(S.q.damage) + (S.e.damage * 100) / (100 + championStats('zed').mr),
    );
    assert.deepEqual(game.state.tornadoes, []);
    assert.equal(!!enemy.airborne, empowered);
    assert.equal(p.yasuo!.stacks, empowered ? 0 : 1);
  }
});

test('E-Q-Flash resolves its slash at the blink destination, without E damage or Flow along the blink', () => {
  for (const empowered of [false, true]) {
    const game = duel(),
      [p, enemy] = game.state.players;
    if (empowered) readyTornado(game);
    const before = p.stats.damageDealt;
    assert.ok(cast(game, 'e'));
    advance(game, 0.1);
    assert.ok(cast(game, 'q'));
    const flow = p.yasuo!.flow;
    const lockout = p.yasuo!.dashTargetUntil;
    // The enemy moves off the original dash path, into the Flash combo's landing area.
    enemy.pos = { x: 1050, y: 1000 };
    assert.ok(cast(game, 'd', { ...enemy.pos }));
    const landing = { ...p.pos };
    assert.equal(p.yasuo!.dash, null);
    near(p.yasuo!.flow, flow);
    near(p.stats.damageDealt - before, physical(S.q.damage));
    assert.equal(p.stats.yasuo!.dashesHit, 0);
    assert.equal(!!enemy.airborne, empowered);
    assert.equal(p.yasuo!.dashTargetUntil, lockout);
    assert.equal(p.cooldowns.d, game.state.time + S.d.cooldown);
    assert.deepEqual(game.state.tornadoes, []);
    advance(game, 0.6);
    near(p.stats.damageDealt - before, physical(S.q.damage));
    // Normal body separation may push Yasuo away, but E must never resume toward its old endpoint.
    assert.ok(Math.abs(p.pos.y - landing.y) < 1);
    assert.equal(p.yasuo!.dash, null);
    assert.equal(cast(game, 'd'), false);
  }
});

test('E-Flash ends the dash; flashing away with a queued Q cannot damage the old landing area', () => {
  for (const slash of [false, true]) {
    const game = duel(),
      [p] = game.state.players;
    cast(game, 'e');
    advance(game, 0.1);
    if (slash) cast(game, 'q');
    assert.ok(cast(game, 'd', { x: 795, y: 1100 }));
    const landing = { ...p.pos };
    advance(game, 0.6);
    assert.deepEqual(p.pos, landing);
    assert.equal(p.yasuo!.dash, null);
    assert.equal(p.stats.damageDealt, 0);
    assert.equal(p.stats.yasuo!.tempestsCast, slash ? 1 : 0);
  }
});

test('E-Q-Flash preserves an already landed E hit without repeating it', () => {
  const game = duel(),
    [p] = game.state.players;
  cast(game, 'e');
  advance(game, 0.3);
  assert.equal(p.stats.yasuo!.dashesHit, 1);
  const damage = p.stats.damageDealt;
  cast(game, 'q');
  assert.ok(cast(game, 'd', { x: 1050, y: 850 }));
  advance(game, 0.6);
  assert.equal(p.stats.yasuo!.dashesHit, 1);
  near(p.stats.damageDealt - damage, physical(S.q.damage));
});

test('root and grounding still block Flash during an E-Q combo without spending Flash', () => {
  for (const rooted of [false, true]) {
    const game = duel(),
      [p] = game.state.players;
    cast(game, 'e');
    cast(game, 'q');
    if (rooted) p.rootUntil = 10;
    else
      game.state.zones.push({
        id: 1,
        owner: 1,
        kind: 'adhesive',
        pos: { ...p.pos },
        created: 0,
        expires: 10,
      });
    assert.equal(cast(game, 'd'), false);
    assert.equal(p.cooldowns.d, 0);
  }
});

test('invalid targets and displacement locks spend no cooldown; rooted Q remains available', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  for (const mode of ['missing', 'range', 'hidden', 'untargetable', 'root', 'ground']) {
    p.rootUntil = 0;
    enemy.untargetableUntil = 0;
    enemy.pos.x = 1050;
    game.state.zones = [];
    if (mode === 'range') enemy.pos.x = 1800;
    if (mode === 'hidden') {
      enemy.leblanc = {
        lastSpell: null,
        invisibleUntil: 10,
        clone: null,
        returns: { w: null, r: null },
        dash: null,
      };
    }
    if (mode === 'untargetable') enemy.untargetableUntil = 10;
    if (mode === 'root') p.rootUntil = 10;
    if (mode === 'ground')
      game.state.zones.push({ id: 1, owner: 1, kind: 'adhesive', pos: p.pos, created: 0, expires: 10 });
    assert.equal(
      game.input(0, {
        action: 'cast',
        spell: 'e',
        point: enemy.pos,
        target: mode === 'missing' ? undefined : 1,
      }),
      false,
      mode,
    );
    assert.equal(p.cooldowns.e, 0);
    enemy.leblanc = null;
  }
  assert.ok(cast(game, 'q'));
  assert.equal(cast(game, 'd'), false);
});

test('Charm cancels Yasuo Q windup and E dash; root cancels a queued dash slash', () => {
  for (const spell of ['q', 'e'] as const) {
    const game = duel(350, 'ahri'),
      [p] = game.state.players;
    cast(game, 'e', undefined, 1);
    advance(game, 0.35);
    cast(game, spell);
    advance(game, 0.3);
    assert.ok(p.charm);
    assert.equal(p.yasuo!.dash, null);
    assert.equal(p.stats.yasuo!.tempestsCast, 0);
    assert.equal(p.stats.damageDealt, 0);
  }
  const game = duel(),
    [p] = game.state.players;
  cast(game, 'e');
  cast(game, 'q');
  p.rootUntil = 10;
  advance(game, 0.6);
  assert.equal(p.yasuo!.dash, null);
  assert.equal(p.stats.damageDealt, 0);
});

test('Last Breath requires airborne target, suspends it, resets stacks, fills Flow and deals delayed damage', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  assert.equal(cast(game, 'r'), false);
  assert.equal(p.cooldowns.r, 0);
  readyTornado(game);
  cast(game, 'q');
  advance(game, 0.55);
  assert.ok(enemy.airborne);
  const before = p.stats.damageDealt;
  // Cursor is far from the opponent and no target ID is supplied.
  assert.ok(game.input(0, { action: 'cast', spell: 'r', point: { x: 2200, y: 100 } }));
  near(p.facing, Math.atan2(enemy.pos.y - p.pos.y, enemy.pos.x - p.pos.x));
  assert.equal(p.yasuo!.flow, 100);
  assert.equal(p.yasuo!.stacks, 0);
  assert.ok(p.pos.x > enemy.pos.x);
  assert.equal(cast(game, 'd'), false);
  assert.equal(cast(game, 'q'), false);
  advance(game, 0.5);
  near(p.facing, Math.atan2(enemy.pos.y - p.pos.y, enemy.pos.x - p.pos.x));
  near(p.stats.damageDealt, before);
  assert.ok(enemy.airborne);
  advance(game, 0.55);
  near(p.stats.damageDealt - before, physical(S.r.damage));
  assert.equal(enemy.airborne, null);
  assert.equal(p.stats.yasuo!.ultimatesHit, 1);
  assert.equal(cast(game, 'r'), false);
});

test('Last Breath rejects distant, rooted, grounded and expired airborne targets', () => {
  for (const mode of ['range', 'root', 'ground', 'expired']) {
    const game = duel(),
      [p, enemy] = game.state.players;
    enemy.airborne = {
      owner: 0,
      from: enemy.pos,
      to: enemy.pos,
      started: 0,
      ends: mode === 'expired' ? 0 : 10,
    };
    if (mode === 'range') {
      p.pos.x = 100;
      enemy.pos.x = 2200;
    }
    if (mode === 'root') p.rootUntil = 10;
    if (mode === 'ground')
      game.state.zones.push({ id: 1, owner: 1, kind: 'adhesive', pos: p.pos, created: 0, expires: 10 });
    assert.equal(game.input(0, { action: 'cast', spell: 'r', point: { x: 100, y: 100 } }), false, mode);
    assert.equal(p.cooldowns.r, 0);
  }
});

test('Yasuo knockups inside enemy adhesive do not credit a Singed root or crash', () => {
  const game = duel(350, 'yasuo'),
    enemy = game.state.players[1];
  // Grounding can outlive a previous pick in synthetic/replay fixtures; airborne ownership must be checked.
  game.state.zones.push({
    id: 1,
    owner: 0,
    kind: 'adhesive',
    pos: { ...enemy.pos },
    created: 0,
    expires: 20,
  });
  readyTornado(game);
  cast(game, 'q');
  advance(game, 2);
  assert.equal(enemy.rootUntil, 0);
});

test('Yasuo host snapshots preserve combat and recaps; practice resets clear every transient state', () => {
  const messages: ServerMessage[] = [];
  const host = new HostedMatch('practice', 'ABC123', (_, m) => messages.push(structuredClone(m)), 'yasuo');
  host.game.state.players[0].pos = { x: 1100, y: 700 };
  readyTornado(host.game);
  cast(host.game, 'w');
  cast(host.game, 'q');
  advance(host.game, 0.3);
  host.broadcast();
  const snapshot = messages.at(-1)!;
  assert.ok(snapshot.type === 'state');
  assert.equal(snapshot.room.game.windWalls.length, 1);
  assert.equal(snapshot.room.game.tornadoes.length, 1);
  assert.match(matchSummary(host.game.state, 0, true), /Tempests hit/);
  host.handle(0, { type: 'reset-practice' });
  const p = host.game.state.players[0];
  assert.equal(p.champion, 'yasuo');
  assert.deepEqual(host.game.state.windWalls, []);
  assert.deepEqual(host.game.state.tornadoes, []);
  assert.equal(p.yasuo!.flow, 0);
  assert.equal(p.yasuo!.dash, null);
  assert.equal(p.yasuo!.stacks, 0);
  assert.ok(Object.values(p.stats.yasuo!).every((v) => v === 0));
  advance(host.game, 2);
  assert.equal(p.stats.damageDealt, 0);
  const duelHost = new HostedMatch('duel', 'ABC123', () => {}, 'zed');
  assert.ok(duelHost.join('yasuo'));
  duelHost.handle(0, { type: 'ready' });
  duelHost.handle(1, { type: 'ready' });
  advance(duelHost.game, 3.1);
  duelHost.game.state.players[0].hp = 0;
  duelHost.step();
  duelHost.handle(0, { type: 'ready' });
  duelHost.handle(1, { type: 'ready' });
  assert.equal(duelHost.game.state.players[1].champion, 'yasuo');
  assert.equal(duelHost.game.state.players[1].yasuo!.flow, 0);
});
