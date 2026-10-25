import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { Game } from '../shared/game';
import type { ChampionId, Input, PlayerId, ServerMessage } from '../shared/types';

export interface Peer {
  socket: WebSocket;
  room: Room | null;
  id: PlayerId;
  seq: number;
  alive: boolean;
}
export function send(peer: Peer, message: ServerMessage) {
  if (peer.socket.readyState === WebSocket.OPEN && peer.socket.bufferedAmount < 256_000)
    peer.socket.send(JSON.stringify(message));
}

export class Room {
  readonly code = randomBytes(3).toString('hex').toUpperCase();
  readonly game: Game;
  readonly peers: [Peer | null, Peer | null] = [null, null];
  ready: [boolean, boolean] = [false, false];
  private inputs: { player: PlayerId; input: Input }[] = [];

  constructor(readonly mode: 'duel' | 'practice' = 'duel') {
    this.game = new Game(mode === 'practice' ? 1 : null);
  }

  resetPractice() {
    if (this.mode !== 'practice') return;
    this.inputs = [];
    this.ready = [false, false];
    this.game.start(0);
    this.game.state.players[0].pos = { x: 950, y: 700 };
    this.game.state.players[1].pos = { x: 1450, y: 700 };
    this.broadcast();
  }

  join(peer: Peer, champion: ChampionId = 'zed'): boolean {
    if (this.mode === 'practice' && this.peers.some(Boolean)) return false;
    const slot = this.peers.findIndex((p) => p === null);
    if (slot < 0) return false;
    peer.room = this;
    peer.id = slot as PlayerId;
    peer.seq = -1;
    this.peers[slot] = peer;
    this.game.selectChampion(peer.id, champion);
    send(peer, { type: 'joined', code: this.code, player: peer.id });
    if (this.mode === 'practice') this.resetPractice();
    this.broadcast();
    return true;
  }

  leave(peer: Peer) {
    this.peers[peer.id] = null;
    peer.room = null;
    this.ready = [false, false];
    this.inputs = [];
    this.game.disconnect();
    this.game.selectChampion(peer.id, 'zed');
    this.broadcast();
  }

  selectChampion(peer: Peer, champion: ChampionId) {
    if (this.mode !== 'duel' || this.game.state.phase !== 'waiting') return;
    if (!this.game.selectChampion(peer.id, champion)) return;
    this.ready = [false, false];
    this.inputs = [];
    this.broadcast();
  }

  setReady(peer: Peer) {
    if (['active', 'countdown'].includes(this.game.state.phase)) return;
    this.ready[peer.id] = true;
    if (this.peers.every(Boolean) && this.ready.every(Boolean)) {
      this.game.start();
      this.ready = [false, false];
      this.inputs = [];
    }
    this.broadcast();
  }

  enqueue(peer: Peer, seq: number, input: Input) {
    if (seq <= peer.seq || this.game.state.phase !== 'active') return;
    peer.seq = seq;
    if (this.inputs.length < 128) this.inputs.push({ player: peer.id, input });
  }

  step() {
    for (const command of this.inputs) this.game.input(command.player, command.input);
    this.inputs = [];
    this.game.step();
  }

  broadcast() {
    const room = {
      mode: this.mode,
      code: this.code,
      connected: this.peers.map(Boolean) as [boolean, boolean],
      ready: this.ready,
      game: this.game.state,
    };
    this.peers.forEach((peer) => {
      if (peer) send(peer, { type: 'state', room, ack: peer.seq });
    });
  }
}
