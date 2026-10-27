import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/shared/game';
import { championStats } from '../src/shared/champions';
import { STEP } from '../src/shared/balance';
import { AttackEffects, attackWindup } from '../src/client/attack-effects';
import type { ChampionId } from '../src/shared/types';

function duel(champion: ChampionId) {
  const game = new Game(null, [champion, 'zed']);
  game.start(0);
  game.state.players[1].pos = { x: 700, y: 700 };
  return game;
}

test('basic attack effects capture both endpoints only when damage lands for each champion', () => {
  for (const champion of ['zed', 'singed', 'ahri', 'leblanc', 'yasuo', 'ezreal'] as const) {
    const game = duel(champion),
      [p, enemy] = game.state.players;
    game.input(0, { action: 'attack' });
    game.step();
    const impactAt = p.windupUntil;
    assert.notEqual(attackWindup(p, game.state.time), null);
    assert.equal(game.state.effects.filter((e) => e.kind === 'attack').length, 0);
    while (game.state.time < impactAt) game.step();
    const effect = game.state.effects.find((e) => e.kind === 'attack')!;
    assert.ok(effect?.from);
    assert.deepEqual(effect.from, p.pos);
    assert.deepEqual(effect.pos, enemy.pos);
    assert.ok(Math.abs(effect.at - impactAt) < STEP + 0.0001);
    assert.equal(p.stats.attacksHit, 1);
    assert.equal(attackWindup(p, game.state.time), null);
    const snapshot = structuredClone(effect);
    p.pos.x += 200;
    enemy.pos.y += 200;
    assert.deepEqual(effect, snapshot);
  }
});

test('Stop cancels the attack visual without creating a projectile impact or damage', () => {
  for (const champion of ['zed', 'singed', 'ahri', 'leblanc', 'yasuo', 'ezreal'] as const) {
    const game = duel(champion),
      p = game.state.players[0];
    game.input(0, { action: 'attack' });
    game.step();
    const stats = championStats(champion);
    assert.ok(attackWindup(p, game.state.time + stats.windup / stats.attackSpeed / 2)! > 0);
    game.input(0, { action: 'stop' });
    assert.equal(attackWindup(p, game.state.time), null);
    for (let i = 0; i < 60; i++) game.step();
    assert.equal(p.stats.attacksHit, 0);
    assert.equal(p.stats.damageDealt, 0);
    assert.ok(game.state.effects.every((e) => e.kind !== 'attack'));
  }
});

test('attack follow-through expires, leaves gameplay positions unchanged and ignores Fling impacts', () => {
  const game = duel('singed'),
    p = game.state.players[0];
  const effects = new AttackEffects({} as CanvasRenderingContext2D);
  game.input(0, { action: 'attack' });
  while (p.stats.attacksHit === 0) game.step();
  const before = structuredClone(game.state);
  const pose = effects.pose(p, p.pos, game.state.effects, game.state.time);
  assert.ok(pose.pos.x > p.pos.x);
  assert.deepEqual(structuredClone(game.state), before);
  assert.deepEqual(effects.pose(p, p.pos, game.state.effects, game.state.time + 0.3), {
    pos: p.pos,
    facing: p.facing,
  });
  const fling = { ...game.state.effects.find((e) => e.kind === 'attack')! };
  delete fling.from;
  assert.equal(effects.impact(fling, p, game.state.time, '#90c7b6'), false);
  assert.deepEqual(effects.pose(p, p.pos, [fling], game.state.time), { pos: p.pos, facing: p.facing });
});
