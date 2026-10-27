import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { STEP } from '../src/shared/balance';
import { AHRI_STATS } from '../src/shared/ahri-balance';
import { CHAMPIONS } from '../src/shared/champions';
import { matchSummary } from '../src/client/match-summary';
import { HostedMatch } from '../src/shared/hosted-match';
import type { ChampionId, PlayerId, ServerMessage, Vec } from '../src/shared/types';

function duel(champion: ChampionId, gap = 500, other: ChampionId = 'zed') {
  const game = new Game(null, [champion, other]);
  game.start(0);
  game.state.players[0].pos = { x: 700, y: 700 };
  game.state.players[1].pos = { x: 700 + gap, y: 700 };
  return game;
}
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.step();
}
function cast(game: Game, spell: 'q' | 'w' | 'e' | 'r', point?: Vec, id: PlayerId = 0) {
  return game.input(id, {
    action: 'cast',
    spell,
    point: point ?? { ...game.state.players[1 - id].pos },
    target: (1 - id) as PlayerId,
  });
}
function near(a: number, b: number, tolerance = 0.001) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}

test('Ahri recap counts both orb passes, fired and missed Charms, flames and Rush bolts independently', () => {
  const game = duel('ahri'),
    stats = game.state.players[0].stats.ahri!;
  cast(game, 'q');
  advance(game, 1.6);
  assert.equal(stats.orbsThrown, 1);
  assert.equal(stats.orbOutHits, 1);
  assert.equal(stats.orbReturnHits, 1);
  cast(game, 'e', { x: 700, y: 100 });
  advance(game, 1);
  assert.equal(stats.charmsThrown, 1);
  assert.equal(stats.charmsHit, 0);
  game.state.players[0].cooldowns.e = 0;
  cast(game, 'e');
  advance(game, 0.6);
  assert.equal(stats.charmsThrown, 2);
  assert.equal(stats.charmsHit, 1);
  cast(game, 'w');
  advance(game, 1);
  assert.equal(stats.fireHits, 3);
  cast(game, 'r', { ...game.state.players[0].pos });
  advance(game, 0.7);
  assert.equal(stats.rushHits, 1);
});

test('interrupted Ahri and LeBlanc windups do not count as fired skillshots', () => {
  for (const champion of ['ahri', 'leblanc'] as const) {
    const game = duel(champion, 300, 'ahri');
    cast(game, 'e', undefined, 1);
    advance(game, 0.3);
    cast(game, 'e');
    advance(game, 0.3);
    assert.ok(game.state.players[0].charm);
    const stats = game.state.players[0].stats;
    assert.equal(champion === 'ahri' ? stats.ahri!.charmsThrown : stats.leblanc!.chainsThrown, 0);
  }
});

test('Essence healing records only actual restoration, including reduction and health cap', () => {
  for (const missing of [0, 10, 1000]) {
    for (const reduced of [false, true]) {
      const game = duel('ahri'),
        p = game.state.players[0];
      p.hp = AHRI_STATS.hp - missing;
      p.ahri!.essenceHits = 2;
      p.grievousUntil = reduced ? 100 : 0;
      cast(game, 'w');
      while (p.ahri!.essenceHits === 2) game.step();
      near(
        p.stats.ahri!.healing,
        Math.min(
          60 * (reduced ? 0.6 : 1),
          Math.max(0, missing - AHRI_STATS.hpRegen * game.state.time * (reduced ? 0.6 : 1)),
        ),
      );
    }
  }
});

test('Singed poison damage is actual damage; overlapping clouds and expiry do not multiply uptime', () => {
  const game = duel('singed', 200),
    [p, enemy] = game.state.players;
  cast(game, 'q');
  advance(game, 1);
  near(p.stats.singed!.poisonDamage, p.stats.damageDealt);
  near(p.stats.singed!.poisonSeconds, game.state.time - STEP);
  cast(game, 'q');
  enemy.pos = { x: 2100, y: 700 };
  const until = enemy.poison!.until;
  advance(game, 3);
  near(p.stats.singed!.poisonSeconds, until - STEP);
  const uptime = p.stats.singed!.poisonSeconds;
  advance(game, 1);
  near(p.stats.singed!.poisonSeconds, uptime);
  const lethal = duel('singed', 200),
    [killer, victim] = lethal.state.players;
  victim.hp = 1;
  cast(lethal, 'q');
  lethal.step();
  near(killer.stats.singed!.poisonDamage, 1 + 3.61 * STEP);
  assert.equal(lethal.state.phase, 'finished');
});

test('Singed recap counts completed Flings, adhesive roots and elapsed potion time', () => {
  const game = duel('singed', 150),
    [p, enemy] = game.state.players;
  cast(game, 'w', { x: enemy.pos.x - 550, y: 700 });
  advance(game, 0.4);
  cast(game, 'e');
  advance(game, 0.3);
  assert.equal(p.stats.singed!.flingsHit, 1);
  assert.equal(p.stats.singed!.adhesiveRoots, 0);
  game.input(0, { action: 'stop' });
  advance(game, 0.7);
  assert.equal(p.stats.singed!.adhesiveRoots, 1);
  cast(game, 'r');
  advance(game, 2);
  near(p.stats.singed!.potionSeconds, 2);
  advance(game, 10);
  near(p.stats.singed!.potionSeconds, 10);
  const cancelled = duel('singed', 150);
  cast(cancelled, 'e');
  cancelled.state.players[1].untargetableUntil = 5;
  advance(cancelled, 0.3);
  assert.equal(cancelled.state.players[0].stats.singed!.flingsHit, 0);
});

test('LeBlanc recap counts sigils, both chain variants and roots; Mimic followups are not double counted', () => {
  const game = duel('leblanc'),
    [p] = game.state.players,
    stats = p.stats.leblanc!;
  cast(game, 'q');
  advance(game, 0.6);
  cast(game, 'r');
  advance(game, 0.6);
  assert.equal(stats.sigilsDetonated, 1);
  assert.equal(stats.mimicHits, 1);
  cast(game, 'e');
  advance(game, 0.6);
  assert.equal(stats.sigilsDetonated, 2);
  assert.equal(stats.chainsHit, 1);
  assert.equal(stats.chainRoots, 0);
  p.cooldowns.r = 0;
  cast(game, 'r');
  advance(game, 2.2);
  assert.equal(stats.chainsThrown, 2);
  assert.equal(stats.chainsHit, 2);
  assert.equal(stats.chainRoots, 2);
  assert.equal(stats.mimicHits, 2);
  p.cooldowns.e = 0;
  cast(game, 'e', { x: 700, y: 100 });
  advance(game, 1);
  assert.equal(stats.chainsThrown, 3);
  assert.equal(stats.chainsHit, 2);
});

test('LeBlanc dash impacts and returns count separately; broken tethers grant no roots', () => {
  const game = duel('leblanc'),
    [p, enemy] = game.state.players,
    stats = p.stats.leblanc!;
  cast(game, 'w');
  advance(game, 0.7);
  assert.equal(stats.distortionHits, 1);
  cast(game, 'r', { ...p.pos });
  advance(game, 0.3);
  assert.equal(stats.distortionHits, 2);
  assert.equal(stats.mimicHits, 1);
  cast(game, 'w');
  cast(game, 'r');
  assert.equal(stats.returnsUsed, 2);
  assert.equal(stats.distortionHits, 2);
  cast(game, 'e');
  advance(game, 0.4);
  enemy.pos = { x: 150, y: 150 };
  advance(game, 2);
  assert.equal(stats.chainsHit, 1);
  assert.equal(stats.chainRoots, 0);
});

test('every matchup uses the same generic recap, including mirrors and practice', () => {
  const rowLabels = ['Damage dealt', 'Damage taken', 'Basic attacks hit', 'Health remaining'];
  for (const a of CHAMPIONS)
    for (const b of CHAMPIONS) {
      const game = duel(a, 500, b);
      for (const me of [0, 1] as const) {
        for (const practice of [false, true]) {
          const html = matchSummary(game.state, me, practice);
          assert.deepEqual(
            [...html.matchAll(/scope="row">([^<]+)/g)].map((m) => m[1]),
            rowLabels,
          );
          assert.ok(html.includes('<th scope="col">You</th>'));
          assert.ok(html.includes(`<th scope="col">${practice ? 'Dummy' : 'Opponent'}</th>`));
          assert.ok(!/NaN|undefined|Infinity|recap-champion/.test(html));
          assert.equal((html.match(/<table\b/g) ?? []).length, 1);
        }
      }
    }
  const malformed = duel('ahri', 500, 'singed');
  Object.assign(malformed.state.players[0].stats, {
    damageDealt: '<img src=x onerror=alert(1)>',
    attacksHit: NaN,
  });
  malformed.state.players[1].hp = Infinity;
  const safe = matchSummary(malformed.state, 0, false);
  assert.ok(!/NaN|undefined|Infinity|<img/.test(safe));
  assert.ok(safe.includes('—'));
});

test('recap compares shared stats from each player perspective', () => {
  const game = duel('leblanc', 500, 'ahri');
  const [leblanc, ahri] = game.state.players;
  leblanc.stats.damageDealt = 1200.4;
  ahri.stats.damageDealt = 750;
  leblanc.stats.attacksHit = 8;
  ahri.stats.attacksHit = 3;
  leblanc.hp = 427.8;
  ahri.hp = 0;
  const host = matchSummary(game.state, 0, false);
  assert.match(host, /Damage dealt<\/th><td>1,200<\/td><td>750/);
  assert.match(host, /Damage taken<\/th><td>750<\/td><td>1,200/);
  assert.match(host, /Basic attacks hit<\/th><td>8<\/td><td>3/);
  assert.match(host, /Health remaining<\/th><td>428<\/td><td>0/);
  const guest = matchSummary(game.state, 1, false);
  assert.match(guest, /Damage dealt<\/th><td>750<\/td><td>1,200/);
  assert.match(guest, /Damage taken<\/th><td>1,200<\/td><td>750/);
  assert.match(guest, /Basic attacks hit<\/th><td>3<\/td><td>8/);
  assert.match(guest, /Health remaining<\/th><td>0<\/td><td>428/);
});

test('browser host snapshots include champion stats and reset them for the next round', () => {
  const snapshots: ServerMessage[] = [];
  const host = new HostedMatch(
    'practice',
    'ABC123',
    (_, message) => snapshots.push(structuredClone(message)),
    'leblanc',
  );
  host.handle(0, {
    type: 'input',
    seq: 1,
    input: { action: 'cast', spell: 'e', point: { x: 1450, y: 700 } },
  });
  for (let i = 0; i < 130; i++) host.step();
  host.broadcast();
  const last = snapshots.at(-1)!;
  assert.ok(last.type === 'state');
  assert.equal(last.room.game.players[0].stats.leblanc!.chainsHit, 1);
  assert.equal(last.room.game.players[0].stats.leblanc!.chainRoots, 1);
  host.handle(0, { type: 'reset-practice' });
  assert.ok(Object.values(host.game.state.players[0].stats.leblanc!).every((n) => n === 0));
  assert.equal(last.room.game.players[0].stats.leblanc!.chainRoots, 1);
  for (const champion of ['ahri', 'singed'] as const) {
    const game = duel(champion, 200);
    cast(game, 'q');
    advance(game, 1.5);
    const old = game.state.players[0].stats[champion]!;
    assert.ok(Object.values(old).some((n) => n > 0));
    game.start(0);
    assert.ok(Object.values(game.state.players[0].stats[champion]!).every((n) => n === 0));
    advance(game, 1);
    assert.ok(Object.values(game.state.players[0].stats[champion]!).every((n) => n === 0));
  }
});
