import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { createApplication } from '../src/server/app';
import type { ClientMessage, ServerMessage } from '../src/shared/types';

class Client {
  messages: ServerMessage[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', (raw) => this.messages.push(JSON.parse(raw.toString())));
  }
  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }
  async wait<T extends ServerMessage['type']>(
    type: T,
    predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ) {
    const until = Date.now() + 6000;
    while (Date.now() < until) {
      const index = this.messages.findIndex(
        (m) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>),
      );
      if (index >= 0) return this.messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error(`Timed out waiting for ${type}`);
  }
}

test('two sockets complete a duel and rematch; room limits, stale input and disconnects are enforced', async () => {
  const app = await createApplication();
  const clients: Client[] = [];
  try {
    await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
    const address = app.server.address();
    assert.ok(address && typeof address !== 'string');
    const connect = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
      const client = new Client(socket);
      clients.push(client);
      await new Promise<void>((done, reject) => {
        socket.once('open', done);
        socket.once('error', reject);
      });
      return client;
    };
    const a = await connect(),
      b = await connect(),
      c = await connect();
    a.send({ type: 'create' });
    const { code } = await a.wait('joined');
    b.send({ type: 'join', code });
    assert.equal((await b.wait('joined')).player, 1);
    c.send({ type: 'join', code });
    assert.match((await c.wait('error')).message, /two players/);
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.wait('state', (m) => m.room.game.phase === 'active');
    await b.wait('state', (m) => m.room.game.phase === 'active');
    a.send({ type: 'input', seq: 2, input: { action: 'move', point: { x: 800, y: 700 } } });
    a.send({ type: 'input', seq: 1, input: { action: 'move', point: { x: 100, y: 700 } } });
    const moved = await a.wait('state', (m) => m.ack === 2 && m.room.game.players[0].pos.x > 510);
    assert.ok(moved.room.game.players[0].destination!.x === 800);
    a.socket.send('{broken');
    assert.match((await a.wait('error')).message, /Invalid/);
    const room = app.rooms.get(code)!;
    room.game.state.players[1].hp = 1;
    room.game.state.players[1].mark = { owner: 0, expires: 0, stored: 0 };
    const resultA = await a.wait('state', (m) => m.room.game.phase === 'finished');
    const resultB = await b.wait('state', (m) => m.room.game.phase === 'finished');
    assert.equal(resultA.room.game.winner, 0);
    assert.equal(resultB.room.game.winner, 0);
    a.messages = [];
    b.messages = [];
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    const reset = await b.wait('state', (m) => m.room.game.phase === 'countdown');
    assert.equal(reset.room.game.players[1].hp, 2337);
    assert.equal(reset.room.game.time, 0);
    b.socket.close();
    await a.wait('state', (m) => !m.room.connected[1] && m.room.game.phase === 'waiting');
    a.send({ type: 'leave' });
    await a.wait('left');
    assert.equal(app.rooms.size, 0);
    a.send({ type: 'practice' });
    const practice = await a.wait('joined');
    const solo = await a.wait('state', (m) => m.room.mode === 'practice' && m.room.game.phase === 'active');
    assert.equal(solo.room.connected[1], false);
    c.send({ type: 'join', code: practice.code });
    assert.match((await c.wait('error')).message, /solo practice/);
    a.send({ type: 'input', seq: 1, input: { action: 'cast', spell: 'q', point: { x: 1450, y: 700 } } });
    const hit = await a.wait('state', (m) => m.room.mode === 'practice' && m.room.game.players[1].hp < 2337);
    assert.deepEqual(hit.room.game.players[1].pos, { x: 1450, y: 700 });
    a.messages = [];
    a.send({ type: 'reset-practice' });
    const fresh = await a.wait(
      'state',
      (m) => m.room.mode === 'practice' && m.room.game.players[0].cooldowns.q === 0,
    );
    assert.equal(fresh.room.game.players[1].hp, 2337);
    const practiceRoom = app.rooms.get(practice.code)!;
    practiceRoom.game.state.players[1].hp = 0;
    await a.wait('state', (m) => m.room.game.phase === 'finished');
    a.messages = [];
    a.send({ type: 'reset-practice' });
    await a.wait('state', (m) => m.room.game.phase === 'active' && m.room.game.players[1].hp === 2337);
    a.send({ type: 'leave' });
    await a.wait('left');
    assert.equal(app.rooms.size, 0);
  } finally {
    clients.forEach((client) => client.socket.terminate());
    await app.close();
  }
});
