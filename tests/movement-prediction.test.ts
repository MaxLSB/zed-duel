import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MovementPrediction } from '../src/client/movement-prediction';
import { Game } from '../src/shared/game';
import { ARENA, STEP } from '../src/shared/balance';
import type { GameState } from '../src/shared/types';

function setup(champion: 'zed' | 'singed' = 'zed') {
  const game = new Game(null, ['zed', champion]);
  game.start(0);
  const state = structuredClone(game.state);
  const prediction = new MovementPrediction();
  prediction.update(structuredClone(state), 1, -1, 200, 1000);
  return { game, state, prediction };
}
const move = { action: 'move' as const, point: { x: 1400, y: 700 } };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

test('guest movement and Stop respond before acknowledgement without changing combat state', () => {
  const { state, prediction } = setup();
  const original = structuredClone(state);
  prediction.input(1, move, 1000);
  assert.ok(prediction.sample(1040)!.pos.x < 1890);
  prediction.input(2, { action: 'stop' }, 1040);
  close(prediction.sample(1045)!.pos.x, prediction.sample(1200)!.pos.x);
  assert.deepEqual(state, original);
});

test('reconciliation drops applied commands, replays newer turns and converges to host position', () => {
  const { state, prediction } = setup();
  prediction.input(1, move, 1000);
  prediction.input(2, { action: 'move', point: { x: 2200, y: 700 } }, 1030);
  const confirmed = structuredClone(state);
  confirmed.time = 0.2;
  confirmed.players[1].pos.x = 1880;
  confirmed.players[1].destination = move.point;
  prediction.update(confirmed, 1, 1, 100, 1100);
  assert.ok(prediction.sample(1200)!.pos.x > 1880, 'newer rightward command must survive an older ack');
  confirmed.players[1].pos.x = 1950;
  confirmed.players[1].destination = null;
  prediction.update(structuredClone(confirmed), 1, 2, 100, 1200);
  close(prediction.sample(1300)!.pos.x, 1950);
});

test('predicted movement uses champion speeds, slows, potion and adhesive from the real simulation', () => {
  for (const champion of ['zed', 'singed'] as const) {
    const { game, prediction } = setup(champion);
    const p = game.state.players[1];
    p.slowUntil = 10;
    p.slow = 0.2;
    if (p.singed) {
      p.singed.insanityUntil = 10;
      p.singed.slipstreamUntil = 10;
    }
    game.state.zones.push({ id: 1, kind: 'adhesive', owner: 0, pos: { ...p.pos }, created: 0, expires: 10 });
    game.input(1, move);
    prediction.update(structuredClone(game.state), 1, -1, 0, 1000);
    for (let i = 0; i < 6; i++) game.step(STEP);
    close(prediction.sample(1100)!.pos.x, game.state.players[1].pos.x);
  }
});

test('authoritative roots, casting, airborne and ultimate states override movement immediately', () => {
  const locks: ((state: GameState) => void)[] = [
    (s) => {
      s.players[1].rootUntil = 10;
    },
    (s) => {
      s.players[1].castUntil = 10;
    },
    (s) => {
      s.players[1].untargetableUntil = 10;
    },
    (s) => {
      s.players[1].ultimate = { started: 0, origin: { x: 1900, y: 700 }, target: 0, attackAfter: true };
    },
    (s) => {
      s.players[1].airborne = {
        owner: 0,
        from: { x: 1900, y: 700 },
        to: { x: 1500, y: 700 },
        started: 0,
        ends: 1,
      };
    },
  ];
  for (const lock of locks) {
    const { state, prediction } = setup();
    prediction.input(1, move, 1000);
    lock(state);
    state.players[1].pos.x = 1880;
    prediction.update(structuredClone(state), 1, -1, 200, 1050);
    close(prediction.sample(1100)!.pos.x, 1880);
  }
});

test('Flash and shadow swaps snap to confirmed positions without replaying earlier movement', () => {
  const { state, prediction } = setup();
  prediction.input(1, move, 1000);
  state.time = 0.1;
  state.players[1].pos.x = 1930;
  state.effects.push({ id: 1, kind: 'blink', owner: 1, pos: { x: 1930, y: 700 }, at: 0.1 });
  prediction.update(structuredClone(state), 1, 1, 200, 1050);
  close(prediction.sample(1050)!.pos.x, 1930);
  close(prediction.sample(1150)!.pos.x, 1930);
});

test('unconfirmed spells are not simulated, and long network stalls have bounded movement', () => {
  const { state, prediction } = setup();
  prediction.input(1, move, 1000);
  prediction.input(2, { action: 'cast', spell: 'd', point: { x: 1300, y: 700 } }, 1020);
  close(prediction.sample(1050)!.pos.x, prediction.sample(1200)!.pos.x);
  assert.equal(state.players[1].cooldowns.d, 0);
  const stalled = setup();
  stalled.state.players[1].destination = { x: 1000, y: 700 };
  stalled.prediction.update(structuredClone(stalled.state), 1, 0, 0, 1000);
  close(stalled.prediction.sample(1250)!.pos.x, stalled.prediction.sample(10000)!.pos.x);
});

test('prediction respects boundaries and attack range without inventing hits', () => {
  const { state, prediction } = setup();
  state.players[1].pos.x = ARENA.width - ARENA.margin - 1;
  prediction.update(structuredClone(state), 1, 0, 0, 1000);
  prediction.input(1, { action: 'move', point: { x: 9999, y: 700 } }, 1000);
  assert.equal(prediction.sample(1200)!.pos.x, ARENA.width - ARENA.margin);
  state.players[1].pos.x = 750;
  prediction.clear();
  prediction.update(structuredClone(state), 1, 0, 0, 1000);
  prediction.input(1, { action: 'attack' }, 1000);
  const x = prediction.sample(1200)!.pos.x;
  assert.ok(x >= 700);
  assert.equal(state.players[0].hp, 2337);
});

test('death, round changes and disconnects discard predicted commands', () => {
  const { state, prediction } = setup();
  prediction.input(1, move, 1000);
  state.phase = 'finished';
  state.players[1].hp = 0;
  prediction.update(structuredClone(state), 1, 0, 100, 1050);
  assert.equal(prediction.sample(1100), null);
  const fresh = setup().state;
  prediction.update(fresh, 1, 0, 100, 1200);
  close(prediction.sample(1250)!.pos.x, 1900);
  prediction.clear();
  assert.equal(prediction.sample(1300), null);
});

test('200 ms latency does not consume the allowance for uneven snapshot delivery', () => {
  const { state, prediction } = setup();
  state.players[1].destination = move.point;
  prediction.update(structuredClone(state), 1, 0, 200, 1000);
  const early = prediction.sample(1050)!.pos.x;
  const later = prediction.sample(1100)!.pos.x;
  assert.ok(early - later > 15, 'movement must continue between delayed snapshots');
  prediction.input(1, { action: 'stop' }, 1100);
  close(prediction.sample(1120)!.pos.x, later);
  close(prediction.sample(1250)!.pos.x, later);
});

test('instant slash and Singed toggles preserve predicted movement without predicting spell effects', () => {
  for (const [champion, spell] of [
    ['zed', 'e'],
    ['singed', 'q'],
    ['singed', 'r'],
  ] as const) {
    const { state, prediction } = setup(champion);
    prediction.input(1, move, 1000);
    const before = prediction.sample(1020)!.pos.x;
    prediction.input(2, { action: 'cast', spell, point: { x: 1400, y: 700 } }, 1020);
    assert.ok(prediction.sample(1100)!.pos.x < before - 20);
    assert.equal(state.effects.length, 0);
    assert.equal(state.players[1].cooldowns[spell], 0);
  }
});
