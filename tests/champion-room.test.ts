import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { Room } from '../src/server/room';
import type { Peer } from '../src/server/room';
import type { ServerMessage } from '../src/shared/types';

function peer() {
  const messages: ServerMessage[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: (raw: string) => messages.push(JSON.parse(raw)),
  } as unknown as WebSocket;
  const client: Peer = { socket, room: null, id: 0, seq: -1, alive: true };
  return { client, messages };
}

test('room broadcasts mixed picks, clears readiness on changes, locks picks in combat and preserves rematch choices', () => {
  const room = new Room(),
    a = peer(),
    b = peer();
  assert.ok(room.join(a.client, 'singed'));
  assert.ok(room.join(b.client));
  room.setReady(a.client);
  room.selectChampion(b.client, 'singed');
  assert.deepEqual(room.ready, [false, false]);
  room.selectChampion(b.client, 'zed');
  room.setReady(a.client);
  room.setReady(b.client);
  room.selectChampion(a.client, 'zed');
  assert.equal(room.game.state.players[0].champion, 'singed');
  for (let i = 0; i < 182; i++) room.step();
  room.enqueue(a.client, 1, { action: 'cast', spell: 'q', point: { x: 0, y: 0 } });
  room.step();
  room.broadcast();
  for (const p of [a, b]) {
    const last = p.messages.at(-1)!;
    assert.equal(last.type, 'state');
    if (last.type !== 'state') throw new Error('Missing state');
    assert.deepEqual(
      last.room.game.players.map((p) => p.champion),
      ['singed', 'zed'],
    );
    assert.equal(last.room.game.players[0].singed?.poisonOn, true);
    assert.ok(last.room.game.zones.length > 0);
  }
  room.game.state.players[1].hp = 0;
  room.step();
  room.setReady(a.client);
  room.setReady(b.client);
  assert.equal(room.game.state.phase, 'countdown');
  assert.deepEqual(
    room.game.state.players.map((p) => p.champion),
    ['singed', 'zed'],
  );
  assert.equal(room.game.state.players[0].singed?.poisonOn, false);
  assert.equal(room.game.state.zones.length, 0);
  room.leave(b.client);
  assert.equal(room.game.state.players[0].champion, 'singed');
  assert.equal(room.game.state.players[1].champion, 'zed');
  assert.equal(room.game.state.phase, 'waiting');
});

test('Singed practice resets spells and displaced dummy, and remains private', () => {
  const room = new Room('practice'),
    a = peer(),
    b = peer();
  room.join(a.client, 'singed');
  assert.equal(room.join(b.client, 'singed'), false);
  assert.equal(room.game.state.phase, 'active');
  room.selectChampion(a.client, 'zed');
  assert.equal(room.game.state.players[0].champion, 'singed');
  room.enqueue(a.client, 1, { action: 'cast', spell: 'q', point: { x: 1450, y: 700 } });
  room.enqueue(a.client, 2, { action: 'cast', spell: 'e', target: 1, point: { x: 1450, y: 700 } });
  for (let i = 0; i < 150; i++) room.step();
  assert.notEqual(room.game.state.players[1].pos.x, 1450);
  assert.ok(room.game.state.players[1].hp < 2337);
  assert.equal(room.game.state.players[1].stats.damageDealt, 0);
  room.resetPractice();
  const [singed, dummy] = room.game.state.players;
  assert.equal(singed.champion, 'singed');
  assert.equal(singed.hp, 2282);
  assert.deepEqual(dummy.pos, { x: 1450, y: 700 });
  assert.equal(dummy.hp, 2337);
  assert.equal(dummy.poison, null);
  assert.equal(dummy.airborne, null);
  assert.equal(dummy.rootUntil, 0);
  assert.equal(singed.singed!.poisonOn, false);
  assert.equal(room.game.state.zones.length, 0);
  assert.ok(Object.values(singed.cooldowns).every((cd) => cd === 0));
});
