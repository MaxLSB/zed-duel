import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Killcam } from '../src/client/killcam';
import { matchSummary } from '../src/client/match-summary';
import { Game } from '../src/shared/game';
import type { GameState } from '../src/shared/types';

function snapshot(time: number, phase: GameState['phase'] = 'active') {
  const game = new Game();
  game.start(0);
  game.state.time = time;
  game.state.phase = phase;
  if (phase === 'finished') {
    game.state.players[1].hp = 0;
    game.state.winner = 0;
  }
  return game.state;
}

test('killcam replays only the final three seconds and reaches the actual kill', () => {
  const replay = new Killcam();
  for (let i = 0; i < 200; i++) replay.record(snapshot(i / 20), 0);
  const final = snapshot(10, 'finished');
  replay.record(final, 1000);
  assert.equal(replay.sample(1000)!.time, 7);
  const between = replay.sample(1100)!;
  assert.ok(between.state.time <= between.time && between.next.time > between.time);
  assert.ok(between.alpha > 0 && between.alpha < 1);
  assert.equal(replay.sample(3000)!.time, 8.5);
  assert.equal(replay.sample(5000)!.state, final);
  assert.equal(replay.sample(5500)!.state.players[1].hp, 0);
  assert.equal(replay.sample(5700), null);
  replay.record(final, 6000);
  assert.equal(replay.active, false);
});

test('skip, resets and disconnects discard playback without replaying old rounds', () => {
  const replay = new Killcam();
  replay.record(snapshot(0));
  replay.record(snapshot(1, 'finished'), 0);
  assert.equal(replay.active, true);
  replay.skip();
  replay.record(snapshot(1, 'finished'), 1000);
  assert.equal(replay.sample(1000), null);
  replay.record(snapshot(0), 2000);
  replay.record(snapshot(0.5, 'finished'), 2500);
  assert.equal(replay.sample(2500)!.time, 0);
  replay.record(snapshot(0, 'waiting'), 2600);
  assert.equal(replay.active, false);
  replay.record(snapshot(3, 'finished'), 3000);
  assert.equal(replay.active, false);
  replay.clear();
  assert.equal(replay.sample(4000), null);
});

test('match summary uses each player perspective and handles zero shots', () => {
  const state = snapshot(65, 'finished');
  state.players[0].stats = { shurikensThrown: 5, shurikensHit: 3, attacksHit: 2, damageDealt: 500.4 };
  const html = matchSummary(state, 0, false);
  assert.match(html, /01:05/);
  assert.match(html, /Shurikens hit<\/th><td>3<\/td><td>0/);
  assert.match(html, /Shurikens missed<\/th><td>2<\/td><td>0/);
  assert.match(html, /Accuracy<\/th><td>60%<\/td><td>—/);
  assert.match(matchSummary(state, 1, false), /Shurikens hit<\/th><td>0<\/td><td>3/);
});
