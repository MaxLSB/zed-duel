import type { ClientMessage, Input, PlayerId, RoomState, ServerMessage } from '../shared/types';

export class Connection extends EventTarget {
  private socket: WebSocket;
  private seq = 0;
  private heartbeat: number;
  player: PlayerId = 0;
  room: RoomState | null = null;
  latency = 0;
  online = false;

  constructor() {
    super();
    this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.socket.addEventListener('open', () => {
      this.online = true;
      this.emit('connection', true);
    });
    this.socket.addEventListener('message', (event) => this.receive(JSON.parse(event.data) as ServerMessage));
    this.socket.addEventListener('close', () => {
      this.online = false;
      this.room = null;
      window.clearInterval(this.heartbeat);
      this.emit('connection', false);
    });
    this.heartbeat = window.setInterval(() => this.send({ type: 'ping', sent: performance.now() }), 2000);
  }

  send(message: ClientMessage) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  input(input: Input) {
    this.send({ type: 'input', seq: ++this.seq, input });
  }
  private emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  private receive(message: ServerMessage) {
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
