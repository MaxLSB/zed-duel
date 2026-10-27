import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { STEP, STATS, SPELLS, PASSIVE } from '../src/shared/balance';
import { SINGED_SPELLS as S, SINGED_STATS, SINGED_PASSIVE } from '../src/shared/singed-balance';
import { potionBonus } from '../src/shared/champions';
import { parseMessage } from '../src/shared/protocol';
import { matchSummary } from '../src/client/match-summary';
import type { ChampionId, PlayerId, Vec } from '../src/shared/types';

function duel(gap = 200, other: ChampionId = 'zed') {
  const game = new Game(null, ['singed', other]);
  game.start(0);
  game.state.players[0].pos = { x: 900, y: 700 };
  game.state.players[1].pos = { x: 900 + gap, y: 700 };
  return game;
}
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.step();
}
function cast(
  game: Game,
  spell: keyof typeof S,
  id: PlayerId = 0,
  point?: Vec,
  target: PlayerId = (1 - id) as PlayerId,
) {
  return game.input(id, {
    action: 'cast',
    spell,
    point: point ?? { ...game.state.players[1 - id].pos },
    target,
  });
}
const near = (a: number, b: number, tolerance = 0.0001) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('legacy games still default to Zed; champion choices survive resets and cannot change during combat', () => {
  const legacy = new Game();
  assert.deepEqual(
    legacy.state.players.map((p) => p.champion),
    ['zed', 'zed'],
  );
  assert.equal(legacy.selectChampion(0, 'singed'), true);
  legacy.start(0);
  assert.equal(legacy.state.players[0].hp, SINGED_STATS.hp);
  assert.equal(legacy.selectChampion(0, 'zed'), false);
  cast(legacy, 'q');
  cast(legacy, 'r');
  advance(legacy, 1);
  legacy.state.players[1].rootUntil = 100;
  legacy.start(0);
  assert.deepEqual(
    legacy.state.players.map((p) => p.champion),
    ['singed', 'zed'],
  );
  assert.equal(legacy.state.zones.length, 0);
  assert.equal(legacy.state.players[0].singed!.poisonOn, false);
  assert.equal(legacy.state.players[0].singed!.insanityUntil, 0);
  assert.equal(legacy.state.players[1].rootUntil, 0);
  legacy.disconnect();
  assert.equal(legacy.state.players[0].champion, 'singed');
});

test('Poison Trail toggles, ticks once despite overlapping clouds, lingers and expires', () => {
  const game = duel(),
    [singed, enemy] = game.state.players;
  assert.equal(cast(game, 'q'), true);
  advance(game, 1);
  // Four ticks: the growing set of overlapping clouds never stacks damage.
  near(singed.stats.damageDealt, (4 * S.q.damage * 100) / (100 + STATS.mr));
  assert.ok(enemy.poison);
  assert.equal(game.state.projectiles.length, 0);
  assert.equal(cast(game, 'q'), true);
  const clouds = game.state.zones.length;
  enemy.pos = { x: 1800, y: 700 };
  const dealt = singed.stats.damageDealt;
  advance(game, 0.6);
  assert.ok(singed.stats.damageDealt > dealt);
  assert.equal(game.state.zones.length, clouds);
  advance(game, 4);
  assert.equal(enemy.poison, null);
  assert.equal(game.state.zones.length, 0);
  const ended = singed.stats.damageDealt;
  advance(game, 1);
  assert.equal(singed.stats.damageDealt, ended);
});

test('poison clouds stay behind movement and Flash rather than poisoning the whole blink path', () => {
  const game = duel(700),
    p = game.state.players[0];
  cast(game, 'q');
  game.step();
  const first = { ...game.state.zones[0].pos };
  cast(game, 'd', 0, { x: 100, y: 700 });
  advance(game, 0.3);
  assert.deepEqual(game.state.zones[0].pos, first);
  assert.ok(game.state.zones.at(-1)!.pos.x < first.x - 300);
  assert.ok(game.state.zones.every((z) => z.pos.x <= p.pos.x || z.pos.x === first.x));
});

test('unapplied poison cannot hit untargetable Zed; existing poison continues during Death Mark', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  enemy.untargetableUntil = 1;
  cast(game, 'q');
  advance(game, 0.5);
  assert.equal(p.stats.damageDealt, 0);
  enemy.untargetableUntil = 0;
  game.step();
  assert.ok(enemy.poison);
  const before = p.stats.damageDealt;
  assert.equal(cast(game, 'r', 1), true);
  advance(game, 0.3);
  assert.ok(p.stats.damageDealt > before);
});

test('adhesive has a landing delay, slows only inside, and blocks Flash and Zed movement spells', () => {
  const game = duel(400),
    [, enemy] = game.state.players;
  cast(game, 'w', 1, { x: 1800, y: 700 });
  advance(game, 0.3);
  cast(game, 'w');
  game.input(1, { action: 'move', point: { x: 1500, y: 700 } });
  const start = enemy.pos.x;
  advance(game, 0.1);
  near(enemy.pos.x - start, STATS.speed * 0.1);
  advance(game, 0.3);
  const slowed = enemy.pos.x;
  advance(game, 0.1);
  near(enemy.pos.x - slowed, STATS.speed * 0.3 * 0.1);
  const cooldowns = { ...enemy.cooldowns };
  assert.equal(cast(game, 'd', 1), false);
  assert.equal(cast(game, 'r', 1), false);
  assert.equal(cast(game, 'w', 1), false);
  assert.deepEqual(enemy.cooldowns, cooldowns);
  assert.equal(cast(game, 'q', 1), true);
  enemy.pos = { x: 2100, y: 700 };
  assert.equal(cast(game, 'd', 1), true);
});

test('grounding allows Zed to place a fresh shadow, but prevents returning through Death Mark', () => {
  const game = duel(),
    [, enemy] = game.state.players;
  cast(game, 'w');
  advance(game, 0.4);
  assert.equal(cast(game, 'w', 1), true);
  advance(game, 0.3);
  assert.equal(cast(game, 'w', 1), false);
  enemy.pos = { x: 1700, y: 700 };
  cast(game, 'r', 1);
  advance(game, 1.8);
  // Place fresh glue exactly on the returned Zed position.
  game.state.players[0].cooldowns.w = 0;
  cast(game, 'w');
  advance(game, 0.4);
  assert.ok(enemy.shadows.some((s) => s.kind === 'r'));
  assert.equal(cast(game, 'r', 1), false);
});

test('Fling approaches without spending cooldown, respects Stop, and requires a valid target', () => {
  const game = duel(600),
    [p, enemy] = game.state.players;
  assert.equal(game.input(0, { action: 'cast', spell: 'e', point: enemy.pos }), false);
  assert.equal(cast(game, 'e'), true);
  advance(game, 0.4);
  assert.ok(p.pos.x > 900);
  assert.equal(p.cooldowns.e, 0);
  game.input(0, { action: 'stop' });
  const pos = { ...p.pos };
  advance(game, 0.4);
  assert.deepEqual(p.pos, pos);
  assert.equal(p.cooldowns.e, 0);
  cast(game, 'e');
  advance(game, 1.6);
  assert.ok(p.stats.damageDealt > 0);
  assert.ok(p.cooldowns.e > game.state.time);
});

test('Fling commits at the edge of range even when the target runs away during windup', () => {
  const game = duel(S.e.range + SINGED_STATS.radius + STATS.radius),
    [p, enemy] = game.state.players;
  const start = { ...enemy.pos };
  game.input(1, { action: 'move', point: { x: 2200, y: 700 } });
  assert.equal(cast(game, 'e'), true);
  advance(game, 0.2);
  assert.ok(enemy.pos.x > start.x);
  assert.ok(enemy.pos.x - p.pos.x > S.e.range + SINGED_STATS.radius + STATS.radius);
  assert.equal(Boolean(enemy.airborne), false);
  advance(game, 0.1);
  assert.ok(enemy.airborne);
  assert.ok(enemy.airborne.from.x > start.x);
  assert.ok(p.cooldowns.e > game.state.time);
  near(p.stats.damageDealt, ((S.e.damage + STATS.hp * S.e.healthRatio) * 100) / (100 + STATS.mr));
  game.input(0, { action: 'stop' });
  const damage = p.stats.damageDealt;
  advance(game, 0.8);
  assert.equal(enemy.airborne, null);
  assert.ok(enemy.pos.x < p.pos.x);
  near(p.stats.damageDealt, damage);
});

test('Fling approach commits on reaching a fleeing target instead of repeatedly restarting the cast', () => {
  const game = duel(400),
    [p, enemy] = game.state.players;
  cast(game, 'r');
  game.input(1, { action: 'move', point: { x: 2300, y: 700 } });
  assert.equal(cast(game, 'e'), true);
  assert.equal(p.castUntil, 0);
  for (let i = 0; i < 180 && p.castUntil <= game.state.time; i++) game.step();
  assert.ok(p.castUntil > game.state.time);
  assert.ok(p.cooldowns.e <= game.state.time);
  const targetAtStart = enemy.pos.x;
  advance(game, 0.3);
  assert.ok(enemy.airborne);
  assert.ok(enemy.airborne.from.x > targetAtStart);
  assert.ok(p.stats.damageDealt > 0);
  assert.ok(p.cooldowns.e > game.state.time);
});

test('Fling deals magic and max-health damage, displaces over Singed, disables casts in flight and roots on his glue', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  const landing = { x: enemy.pos.x - S.e.distance, y: 700 };
  cast(game, 'w', 0, landing);
  advance(game, 0.4);
  cast(game, 'e');
  advance(game, 0.27);
  near(p.stats.damageDealt, ((S.e.damage + STATS.hp * S.e.healthRatio) * 100) / (100 + STATS.mr));
  assert.ok(enemy.airborne);
  assert.equal(cast(game, 'd', 1), false);
  assert.equal(cast(game, 'e', 1), false);
  game.input(0, { action: 'stop' });
  advance(game, 0.7);
  assert.equal(enemy.airborne, null);
  assert.deepEqual(enemy.pos, landing);
  assert.ok(enemy.pos.x < p.pos.x);
  assert.ok(enemy.rootUntil > game.state.time + 1.9);
  const before = { ...enemy.pos };
  game.input(1, { action: 'move', point: { x: 1500, y: 700 } });
  advance(game, 0.3);
  assert.deepEqual(enemy.pos, before);
  assert.equal(cast(game, 'd', 1), false);
  assert.equal(cast(game, 'q', 1), true);
});

test('Fling cancellation during windup spends no cooldown and Stop prevents follow-up attacks', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  cast(game, 'e');
  enemy.untargetableUntil = 1;
  advance(game, 0.3);
  assert.equal(p.cooldowns.e, 0);
  assert.equal(p.stats.damageDealt, 0);
  assert.equal(enemy.airborne, null);
  enemy.untargetableUntil = 0;
  cast(game, 'e');
  game.input(0, { action: 'stop' });
  advance(game, 1);
  assert.equal(p.attacking, false);
  assert.equal(p.stats.attacksHit, 0);
});

test('Fling can be buffered behind adhesive; new movement orders cancel the buffer', () => {
  for (const cancel of [false, true]) {
    const game = duel();
    cast(game, 'w');
    assert.equal(cast(game, 'e'), true);
    if (cancel) game.input(0, { action: 'stop' });
    advance(game, 0.55);
    assert.equal(!!game.state.players[1].airborne, !cancel);
  }
});

test('Insanity Potion lasts 10 seconds, then requires a full 10-second cooldown before recasting', () => {
  const game = duel(800),
    p = game.state.players[0];
  p.hp = 1000;
  assert.equal(game.input(0, { action: 'cast', spell: 'r', point: p.pos }), true);
  assert.equal(p.ultimate, null);
  assert.equal(p.shadows.length, 0);
  near(p.singed!.insanityUntil, 10);
  near(p.cooldowns.r, 20);
  advance(game, 1);
  near(p.hp, 1000 + SINGED_STATS.hpRegen + S.r.bonus / 5);
  assert.equal(potionBonus(p, game.state.time), 85);
  advance(game, 8.7);
  assert.equal(cast(game, 'r'), false);
  assert.equal(potionBonus(p, game.state.time), 85);
  advance(game, 0.4);
  assert.equal(potionBonus(p, game.state.time), 0);
  assert.equal(cast(game, 'r'), false);
  near(p.cooldowns.r - p.singed!.insanityUntil, 10);
  const hp = p.hp;
  advance(game, 0.2);
  near(p.hp - hp, SINGED_STATS.hpRegen * 0.2);
  advance(game, 9.3);
  assert.equal(cast(game, 'r'), true); // Queued within the wider 500ms window.
  advance(game, 0.3);
  assert.equal(potionBonus(p, game.state.time), 0);
  while (game.state.time < 20) game.step();
  near(p.singed!.insanityUntil, game.state.time + 10);
  near(p.cooldowns.r, game.state.time + 20);
  assert.equal(potionBonus(p, game.state.time), 85);
  advance(game, 10.1);
  assert.equal(potionBonus(p, game.state.time), 0);
});

test('potion adds real defenses and poison AP damage, and Grievous Wounds reduces regeneration', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  cast(game, 'r');
  cast(game, 'e', 1);
  near(enemy.stats.damageDealt, (SPELLS.e.damage * 100) / (100 + SINGED_STATS.armor + S.r.bonus));
  cast(game, 'q');
  game.step();
  near(p.stats.damageDealt, ((S.q.damage + S.r.bonus * S.q.ratio) * 100) / (100 + STATS.mr));
  assert.ok(enemy.grievousUntil > game.state.time);
  const hp = enemy.hp;
  game.step();
  near(enemy.hp - hp, STATS.hpRegen * (1 - S.r.grievous) * STEP);
});

test('Slipstream triggers at its expanded range and respects the boundary', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  enemy.pos = { x: p.pos.x + 476, y: p.pos.y };
  game.step();
  assert.equal(p.singed!.slipstreamUntil, 0);
  enemy.pos.x = p.pos.x + 475;
  game.step();
  assert.ok(p.singed!.slipstreamUntil > game.state.time);
});

test('Slipstream grants temporary speed and Singed does not inherit Zed attack passive', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  game.step();
  assert.ok(p.singed!.slipstreamUntil > game.state.time);
  const expiry = p.passiveAt;
  game.input(0, { action: 'move', point: { x: 400, y: 700 } });
  const x = p.pos.x;
  game.step();
  near(x - p.pos.x, SINGED_STATS.speed * (1 + SINGED_PASSIVE.speed) * STEP);
  advance(game, 2.1);
  assert.ok(p.singed!.slipstreamUntil < game.state.time);
  assert.equal(p.passiveAt, expiry);
  enemy.pos = { x: p.pos.x + 200, y: p.pos.y };
  enemy.hp = STATS.hp * 0.4;
  game.input(0, { action: 'attack' });
  advance(game, 0.3);
  near(p.stats.damageDealt, (SINGED_STATS.ad * 100) / (100 + STATS.armor));
});

test('Zed passive uses Singed max HP and defenses in a mixed duel', () => {
  const game = duel(),
    [p, enemy] = game.state.players;
  p.hp = SINGED_STATS.hp * 0.4;
  game.input(1, { action: 'attack' });
  advance(game, 0.25);
  near(
    enemy.stats.damageDealt,
    (STATS.ad * 100) / (100 + SINGED_STATS.armor) +
      (SINGED_STATS.hp * PASSIVE.ratio * 100) / (100 + SINGED_STATS.mr),
  );
});

test('mirror poison is independent, scores damage, can kill, and resets without old effects', () => {
  const game = duel(180, 'singed');
  cast(game, 'q', 0);
  cast(game, 'q', 1);
  advance(game, 0.3);
  assert.equal(game.state.players[0].poison?.owner, 1);
  assert.equal(game.state.players[1].poison?.owner, 0);
  assert.ok(game.state.players.every((p) => p.stats.damageDealt > 0));
  game.state.players[1].hp = 1;
  advance(game, 0.3);
  assert.equal(game.state.winner, 0);
  assert.equal(game.state.phase, 'finished');
  assert.doesNotMatch(matchSummary(game.state, 0, false), /Shurikens/);
  game.start(0);
  advance(game, 1);
  assert.ok(
    game.state.players.every(
      (p) => p.hp === SINGED_STATS.hp && p.stats.damageDealt === 0 && !p.poison && !p.airborne,
    ),
  );
  assert.equal(game.state.zones.length, 0);
});

test('champion protocol remains backward compatible and rejects unknown or malformed picks', () => {
  for (const type of ['create', 'practice', 'join', 'select-champion']) {
    const message = { type, code: 'ABC123', champion: 'singed' };
    assert.ok(parseMessage(JSON.stringify(message)));
    for (const champion of ['Singed', 'other', null, 0, {}, ['singed']])
      assert.equal(parseMessage(JSON.stringify({ ...message, champion })), null);
  }
  for (const type of ['create', 'practice', 'join'])
    assert.ok(parseMessage(JSON.stringify({ type, code: 'ABC123' })));
  assert.equal(parseMessage('{"type":"select-champion"}'), null);
});
