import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChampionSelection } from '../src/client/champion-selection';
import { HostedMatch } from '../src/shared/hosted-match';
import { CHAMPIONS } from '../src/shared/champions';
import { validRelayData } from '../src/shared/signaling';
import type { RoomState } from '../src/shared/types';

test('delayed snapshots do not undo the guest pick or overwrite the host pick', () => {
  const host = new ChampionSelection();
  const guest = new ChampionSelection();
  guest.choose('ahri');
  host.choose('singed');
  assert.equal(guest.reconcile('zed', 'waiting'), 'ahri');
  assert.equal(host.reconcile('singed', 'waiting'), 'singed');
  assert.equal(host.pending, null);
  assert.equal(guest.pending, 'ahri');
  guest.choose('singed');
  assert.equal(guest.reconcile('ahri', 'waiting'), 'singed');
  assert.equal(guest.pending, 'singed');
  assert.equal(guest.reconcile('singed', 'waiting'), 'singed');
  assert.equal(guest.pending, null);
});

test('unconfirmed picks clear when leaving or when the authoritative match locks selection', () => {
  const pick = new ChampionSelection();
  pick.choose('ahri');
  assert.equal(pick.reconcile('zed', 'finished'), 'ahri');
  pick.clear();
  assert.equal(pick.reconcile('zed', 'waiting'), 'zed');
  pick.choose('singed');
  assert.equal(pick.reconcile('ahri', 'countdown'), 'ahri');
  assert.equal(pick.pending, null);
});

test('relayed guest picks affect only the guest slot, including mirror picks and spoofed player IDs', () => {
  const snapshots: (RoomState | undefined)[] = [];
  const match = new HostedMatch('duel', 'ABC123', (player, message) => {
    if (message.type === 'state') snapshots[player] = structuredClone(message.room);
  });
  match.join();
  for (const hostChampion of CHAMPIONS) {
    match.handle(0, { type: 'select-champion', champion: hostChampion });
    for (const guestChampion of CHAMPIONS) {
      const message = { type: 'select-champion', champion: guestChampion, player: 0 };
      assert.ok(validRelayData(1, message));
      match.handle(1, message);
      for (const snapshot of snapshots) {
        assert.deepEqual(
          snapshot!.game.players.map((p) => p.champion),
          [hostChampion, guestChampion],
        );
      }
      match.handle(0, { type: 'select-champion', champion: hostChampion });
      assert.equal(match.game.state.players[1].champion, guestChampion);
    }
  }
});
