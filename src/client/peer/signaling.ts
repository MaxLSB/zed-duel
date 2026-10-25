import { RELAY_VERSION, type SignalMessage } from '../../shared/signaling';

export class Signaling extends EventTarget {
  private socket: WebSocket | null = null;
  private heartbeat = 0;
  private abort = new AbortController();
  code = '';

  async open(code?: string) {
    try {
      const base = import.meta.env.VITE_SIGNAL_URL;
      if (!base) throw new Error('Multiplayer is not configured yet. Practice is available.');
      const url = new URL(base);
      if (
        url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      )
        throw new Error('The room service requires HTTPS.');
      let token: string | undefined;
      if (!code) {
        const response = await fetch(new URL('/rooms', url), { method: 'POST', signal: this.abort.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Could not create a room.');
        code = result.code;
        token = result.token;
      }
      if (this.abort.signal.aborted) return;
      if (!code || !/^[A-Z0-9]{6}$/.test(code)) throw new Error('Check the room code.');
      this.code = code;
      url.pathname = `/rooms/${code}/socket`;
      url.search = '';
      url.searchParams.set('v', String(RELAY_VERSION));
      if (token) url.searchParams.set('host', token);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => {
        this.heartbeat = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, 30_000);
      };
      socket.onmessage = ({ data }) => {
        if (this.socket !== socket || data === 'pong') return;
        let message: SignalMessage;
        try {
          message = JSON.parse(data);
        } catch {
          return;
        }
        this.dispatchEvent(new CustomEvent('message', { detail: message }));
        if (
          message.type === 'relay' &&
          message.from === 0 &&
          (message.data as { type?: string })?.type === 'state'
        )
          this.send({ type: 'ack', session: message.session });
      };
      socket.onerror = () =>
        this.error('Could not reach the room service. Check your connection and try again.');
      socket.onclose = () => {
        if (this.socket === socket)
          this.error('The room connection closed. Please create or join a new duel.');
      };
    } catch (error) {
      if (!this.abort.signal.aborted)
        this.error(error instanceof Error ? error.message : 'Could not connect to the room service.');
    }
  }

  relay(session: string, data: unknown, snapshot = false) {
    if (snapshot && (this.socket?.bufferedAmount ?? 0) >= 256_000) return;
    this.send({ type: 'relay', session, data });
  }

  close() {
    this.abort.abort();
    window.clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private send(message: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      this.error('The room connection closed. Please try again.');
    }
  }
  private error(message: string) {
    if (!this.abort.signal.aborted) this.dispatchEvent(new CustomEvent('error', { detail: message }));
  }
}
