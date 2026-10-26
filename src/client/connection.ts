import type { MovementPrediction } from './movement-prediction';
import type { ClientMessage, Input, PlayerId, RoomState, ServerMessage } from '../shared/types';

export abstract class GameConnection extends EventTarget {
  prediction: MovementPrediction | null = null;
  private seq = 0;
  private incompatibleServer = false;
  player: PlayerId = 0;
  room: RoomState | null = null;
  latency = 0;
  online = false;

  abstract send(message: ClientMessage): void;

  input(input: Input) {
    const seq = ++this.seq;
    this.prediction?.input(seq, input);
    this.send({ type: 'input', seq, input });
  }
  protected emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  protected receive(message: ServerMessage) {
    if (message.type === 'joined') {
      this.player = message.player;
      this.seq = 0;
      this.prediction?.clear();
      this.emit('joined', message);
    }
    if (message.type === 'state') {
      // Old Node servers or peer hosts lack champion fields. Reject their
      // snapshots before they reach the renderer and explain how to update.
      const game = message.room.game;
      if (
        !Array.isArray(game.zones) ||
        !game.players.every((p) => p.champion === 'zed' || p.champion === 'singed')
      ) {
        this.room = null;
        if (!this.incompatibleServer) this.emit('incompatible-server', null);
        this.incompatibleServer = true;
        return;
      }
      this.incompatibleServer = false;
      this.prediction?.update(game, this.player, message.ack, this.latency);
      this.room = message.room;
      this.emit('state', message.room);
    }
    if (message.type === 'error') this.emit('error', message.message);
    if (message.type === 'left') {
      this.prediction?.clear();
      this.room = null;
      this.emit('left', null);
    }
    if (message.type === 'pong') {
      this.latency = Math.round(performance.now() - message.sent);
      this.emit('latency', this.latency);
    }
  }
}
