import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HostedMatch } from '../src/shared/hosted-match';
import type { PlayerId, ServerMessage } from '../src/shared/types';

function host(mode: 'duel' | 'practice' = 'duel') {
  const messages: { player: PlayerId; message: ServerMessage }[] = [];
  const match = new HostedMatch(mode, 'ABC123', (player, message) =>
    messages.push(structuredClone({ player, message })),
  );
  return { match, messages };
}

function start(match: HostedMatch) {
  assert.equal(match.join(), true);
  match.handle(0, { type: 'ready' });
  match.handle(1, { type: 'ready' });
  for (let i = 0; i < 181; i++) match.step();
  assert.equal(match.game.state.phase, 'active');
}

test('browser host owns the match, synchronizes both players and resets after a guest leaves', () => {
  const { match, messages } = host();
  start(match);
  assert.equal(match.join(), false);
  match.handle(1, { type: 'input', seq: 2, input: { action: 'move', point: { x: 1400, y: 700 } } });
  match.handle(1, { type: 'input', seq: 1, input: { action: 'move', point: { x: 2200, y: 700 } } });
  match.step();
  assert.equal(match.game.state.players[1].destination?.x, 1400);
  match.broadcast();
  const states = messages.filter((entry) => entry.message.type === 'state').slice(-2);
  assert.deepEqual(
    states[0].message.type === 'state' && states[0].message.room,
    states[1].message.type === 'state' && states[1].message.room,
  );
  match.leave();
  assert.equal(match.game.state.phase, 'waiting');
  assert.deepEqual(match.connected, [true, false]);
  assert.equal(match.join(), true);
});

test('browser guest cannot reset practice, forge player identity or execute malformed input', () => {
  const { match } = host();
  start(match);
  match.handle(1, { type: 'reset-practice' });
  assert.equal(match.game.state.phase, 'active');
  match.handle(1, { type: 'input', seq: 0, player: 0, input: { action: 'move', point: { x: 100, y: 700 } } });
  match.handle(1, { type: 'input', seq: 1, input: { action: 'move', point: { x: Infinity, y: 700 } } });
  match.handle(1, {
    type: 'input',
    seq: 2,
    input: { action: 'cast', spell: 'fake', point: { x: 100, y: 700 } },
  });
  match.step();
  assert.equal(match.game.state.players[0].destination, null);
  assert.equal(match.game.state.players[1].destination?.x, 100);
});

test('browser practice starts without a peer and resets all match state', () => {
  const { match } = host('practice');
  assert.equal(match.join(), false);
  assert.equal(match.game.state.phase, 'active');
  match.handle(0, {
    type: 'input',
    seq: 0,
    input: { action: 'cast', spell: 'q', point: { x: 1450, y: 700 } },
  });
  for (let i = 0; i < 60; i++) match.step();
  assert.ok(match.game.state.players[1].hp < 2337);
  match.handle(0, { type: 'reset-practice' });
  assert.equal(match.game.state.players[1].hp, 2337);
  assert.equal(match.game.state.players[0].cooldowns.q, 0);
});

test('both browser players must ready again for a rematch', () => {
  const { match } = host();
  start(match);
  match.game.state.players[1].hp = 0;
  match.step();
  assert.equal(match.game.state.winner, 0);
  match.handle(0, { type: 'ready' });
  assert.equal(match.game.state.phase, 'finished');
  match.handle(1, { type: 'ready' });
  assert.equal(match.game.state.phase, 'countdown');
  assert.equal(match.game.state.players[1].hp, 2337);
  assert.equal(match.game.state.time, 0);
});
