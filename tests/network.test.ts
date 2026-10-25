import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SocketConnection as Connection } from '../src/client/socket-connection';
import { Game } from '../src/shared/game';
import type { RoomState } from '../src/shared/types';

test('old server snapshots show a restart message instead of reaching and crashing the renderer', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let socket: Socket;
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    constructor() {
      super();
      socket = this;
    }
    send() {}
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setInterval: () => 0, clearInterval: () => {} },
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { protocol: 'http:', host: 'localhost:3000' },
  });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: Socket });
  try {
    const connection = new Connection();
    const states: RoomState[] = [];
    let mismatches = 0;
    connection.addEventListener('state', (e) => states.push((e as CustomEvent<RoomState>).detail));
    connection.addEventListener('incompatible-server', () => mismatches++);
    const game = new Game(null, ['singed', 'zed']);
    game.start(0);
    const room: RoomState = {
      mode: 'practice',
      code: 'ABC123',
      connected: [true, false],
      ready: [false, false],
      game: game.state,
    };
    const receive = (room: unknown) =>
      socket.dispatchEvent(
        new MessageEvent('message', { data: JSON.stringify({ type: 'state', room, ack: 0 }) }),
      );
    const old = JSON.parse(JSON.stringify(room));
    delete old.game.zones;
    old.game.players.forEach((p: Record<string, unknown>) => {
      delete p.champion;
      delete p.singed;
    });
    receive(old);
    receive(old);
    assert.equal(mismatches, 1);
    assert.equal(states.length, 0);
    assert.equal(connection.room, null);
    receive(room);
    assert.equal(states.length, 1);
    assert.equal(connection.room!.game.players[0].champion, 'singed');
    assert.deepEqual(connection.room!.game.zones, []);
    // A mismatch after a valid snapshot also discards stale playable state.
    receive(old);
    assert.equal(mismatches, 2);
    assert.equal(connection.room, null);
  } finally {
    for (const [key, descriptor] of [
      ['window', originalWindow],
      ['location', originalLocation],
      ['WebSocket', originalSocket],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
