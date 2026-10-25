import type { ClientMessage, Input, PlayerId, RoomState, ServerMessage } from '../shared/types';

export abstract class GameConnection extends EventTarget {
  private seq = 0;
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
