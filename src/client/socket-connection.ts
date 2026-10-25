import type { ClientMessage, ServerMessage } from '../shared/types';
import { GameConnection } from './connection';

export class SocketConnection extends GameConnection {
  private socket: WebSocket;
  private heartbeat: number;

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
}
