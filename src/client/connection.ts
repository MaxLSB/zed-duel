import { isChampion } from '../shared/protocol';
import { AHRI_PASSIVE } from '../shared/ahri-balance';
import type { ClientMessage, Input, PlayerId, RoomState, ServerMessage } from '../shared/types';

export abstract class GameConnection extends EventTarget {
  private seq = 0;
  private incompatibleServer = false;
  player: PlayerId = 0;
  room: RoomState | null = null;
  latency = 0;
  online = false;

  abstract send(message: ClientMessage): void;

  input(input: Input) {
    this.send({ type: 'input', seq: ++this.seq, input });
  }
  protected emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  protected receive(message: ServerMessage) {
    if (message.type === 'joined') {
      this.player = message.player;
      this.seq = 0;
      this.emit('joined', message);
    }
    if (message.type === 'state') {
      // Old Node servers or peer hosts lack champion fields. Reject their
      // snapshots before they reach the renderer and explain how to update.
      const game = message.room.game;
      if (
        !Array.isArray(game.zones) ||
        !Array.isArray(game.ahriMissiles) ||
        !Array.isArray(game.leblancMissiles) ||
        !Array.isArray(game.chains) ||
        !game.players.every(
          (p) =>
            isChampion(p.champion) &&
            Array.isArray(p.sigils) &&
            (p.champion !== 'leblanc' || (!!p.leblanc && !!p.leblanc.returns)) &&
            (p.champion !== 'ahri' ||
              (!!p.ahri &&
                Number.isInteger(p.ahri.essenceHits) &&
                p.ahri.essenceHits >= 0 &&
                p.ahri.essenceHits < AHRI_PASSIVE.hits)),
        )
      ) {
        this.room = null;
        if (!this.incompatibleServer) this.emit('incompatible-server', null);
        this.incompatibleServer = true;
        return;
      }
      this.incompatibleServer = false;
      this.room = message.room;
      this.emit('state', message.room);
    }
    if (message.type === 'error') this.emit('error', message.message);
    if (message.type === 'left') {
      this.room = null;
      this.emit('left', null);
    }
    if (message.type === 'pong') {
      this.latency = Math.round(performance.now() - message.sent);
      this.emit('latency', this.latency);
    }
  }
}
