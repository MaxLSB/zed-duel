import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { Room, type Peer } from '../src/server/room';
import { HostedMatch } from '../src/shared/hosted-match';
import { Player } from '../src/shared/player';
import type { ChampionId, PlayerId, RoomState, ServerMessage } from '../src/shared/types';

for (const transport of ['node', 'pages'] as const) {
  test(`${transport}: both players can change champions between rounds in the same room`, () => {
    const snapshots: (RoomState | undefined)[] = [];
    const publish = (id: PlayerId, message: ServerMessage) => {
      if (message.type === 'state') snapshots[id] = structuredClone(message.room);
    };
    const room = new Room();
    const peers = [0, 1].map(
      (id) =>
        ({
          socket: {
            readyState: WebSocket.OPEN,
            bufferedAmount: 0,
            send: (raw: string) => publish(id as PlayerId, JSON.parse(raw)),
          } as unknown as WebSocket,
          room: null,
          id: id as PlayerId,
          seq: -1,
          alive: true,
        }) satisfies Peer,
    );
    const hosted = new HostedMatch('duel', 'ABC123', publish, 'singed');
    if (transport === 'node') {
      room.join(peers[0], 'singed');
      room.join(peers[1], 'zed');
    } else hosted.join('zed');
    const match = transport === 'node' ? room : hosted;
    const ready = (id: PlayerId) =>
      transport === 'node' ? room.setReady(peers[id]) : hosted.handle(id, { type: 'ready' });
    const select = (id: PlayerId, champion: ChampionId) =>
      transport === 'node'
        ? room.selectChampion(peers[id], champion)
        : hosted.handle(id, { type: 'select-champion', champion });
    const code = snapshots[0]!.code;
    ready(0);
    ready(1);

    for (const picks of [
      ['ahri', 'singed'],
      ['zed', 'ahri'],
      ['singed', 'zed'],
    ] as const) {
      for (let i = 0; i < 182; i++) match.step();
      assert.equal(match.game.state.phase, 'active');
      match.game.input(0, { action: 'cast', spell: 'q', point: { x: 1900, y: 700 } });
      for (let i = 0; i < 20; i++) match.step();
      match.game.state.players[1].hp = 0;
      match.step();
      assert.equal(match.game.state.phase, 'finished');
      ready(0);
      select(1, picks[1]);
      assert.equal(match.game.state.phase, 'waiting');
      assert.deepEqual(snapshots[0]!.ready, [false, false]);
      ready(1);
      select(0, picks[0]);
      for (const snapshot of snapshots) {
        assert.ok(snapshot);
        assert.equal(snapshot.code, code);
        assert.deepEqual(snapshot.connected, [true, true]);
        assert.deepEqual(snapshot.ready, [false, false]);
        assert.deepEqual(
          snapshot.game.players,
          picks.map((pick, id) => structuredClone(new Player(id as PlayerId, pick))),
        );
        assert.equal(snapshot.game.winner, null);
        assert.equal(snapshot.game.time, 0);
        assert.deepEqual(snapshot.game.zones, []);
        assert.deepEqual(snapshot.game.projectiles, []);
        assert.deepEqual(snapshot.game.ahriMissiles, []);
        assert.deepEqual(snapshot.game.effects, []);
      }
      ready(0);
      assert.equal(match.game.state.phase, 'waiting');
      ready(1);
      assert.equal(match.game.state.phase, 'countdown');
      select(0, picks[1]);
      assert.deepEqual(
        match.game.state.players.map((p) => p.champion),
        picks,
      );
      assert.deepEqual(
        match.game.state.players,
        picks.map((pick, id) => new Player(id as PlayerId, pick)),
      );
    }
  });
}
