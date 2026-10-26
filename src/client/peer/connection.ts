import { GameConnection } from '../connection';
import type { ChampionId, ClientMessage, PlayerId, ServerMessage } from '../../shared/types';
import { RELAY_VERSION, type SignalMessage } from '../../shared/signaling';
import type { HostCommand } from './host-worker';
import { Signaling } from './signaling';
import { isChampion } from '../../shared/protocol';

const HOST_UNREACHABLE =
  'Could not connect to the host. Keep their tab open, then try again or switch networks.';

export class PeerConnection extends GameConnection {
  private signaling: Signaling | null = null;
  private worker: Worker | null = null;
  private session = '';
  private timeout = 0;
  private heartbeat = 0;
  private stage = '';
  private code = '';
  private champion: ChampionId = 'zed';
  private guestJoined = false;

  constructor() {
    super();
    queueMicrotask(() => {
      this.online = true;
      this.emit('connection', true);
    });
    window.addEventListener('pagehide', () => this.dispose());
  }

  send(message: ClientMessage) {
    if (message.type === 'leave') {
      this.dispose();
      this.receive({ type: 'left' });
    } else if (message.type === 'create' || message.type === 'join' || message.type === 'practice') {
      if (this.signaling || this.worker || this.timeout) return;
      const champion = message.champion ?? 'zed';
      if (!isChampion(champion)) return;
      this.champion = champion;
      this.progress(message.type === 'practice' ? 'Starting practice…' : 'Contacting room service…');
      this.timeout = window.setTimeout(
        () =>
          this.fail(
            this.stage === 'Contacting room service…'
              ? 'The room service did not respond. Check your connection and try again.'
              : HOST_UNREACHABLE,
          ),
        25_000,
      );
      try {
        if (message.type === 'practice') {
          this.player = 0;
          this.startHost('practice', 'SOLO00');
        } else this.connect(message.type === 'join' ? message.code : undefined);
      } catch {
        this.fail('Could not start the connection. Try an up-to-date browser.');
      }
    } else if (this.worker) this.post({ type: 'message', player: 0, message });
    else this.relay(message);
  }

  private connect(code?: string) {
    const signaling = new Signaling();
    this.signaling = signaling;
    signaling.addEventListener('message', (event) => {
      if (this.signaling !== signaling) return;
      try {
        this.onSignal((event as CustomEvent<SignalMessage>).detail);
      } catch {
        this.fail('Could not establish the connection. Please try again.');
      }
    });
    signaling.addEventListener('error', (event) => {
      if (this.signaling === signaling) this.fail((event as CustomEvent<string>).detail);
    });
    void signaling.open(code);
  }

  private onSignal(message: SignalMessage) {
    if (message.type === 'error') {
      this.fail(message.message);
      return;
    }
    if (message.type === 'welcome') {
      if (message.version !== RELAY_VERSION) {
        this.fail('The room service needs an update. Please try again after deployment.');
        return;
      }
      this.player = message.player;
      this.code = this.signaling!.code;
      if (this.player === 0) this.startHost('duel', this.code);
      else this.progress('Connecting to host…');
    }
    if (message.type === 'peer') {
      this.session = message.session;
      this.guestJoined = false;
      if (this.player === 1) {
        this.progress('Waiting for host…');
        this.relay({ type: 'hello', champion: this.champion });
      }
    }
    if (message.type === 'peer-left' && message.session === this.session) {
      this.session = '';
      this.guestJoined = false;
      this.post({ type: 'leave' });
    }
    if (message.type !== 'relay' || message.session !== this.session || message.from === this.player) return;
    if (this.player === 0) {
      if (!this.guestJoined) {
        const hello = message.data as { type?: string; champion?: unknown } | null;
        if (hello?.type !== 'hello' || !isChampion(hello.champion)) return;
        this.guestJoined = true;
        this.post({ type: 'join', champion: hello.champion });
      } else this.post({ type: 'message', player: 1, message: message.data });
    } else this.acceptRemote(message.data);
  }

  private relay(data: unknown, snapshot = false) {
    if (this.session) this.signaling?.relay(this.session, data, snapshot);
  }

  private startHost(mode: 'duel' | 'practice', code: string) {
    this.code = code;
    const worker = new Worker(new URL('./host-worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }: MessageEvent<{ player: PlayerId; message: ServerMessage }>) => {
      if (this.worker !== worker) return;
      if (data.player === 0) this.accept(data.message);
      else this.relay(data.message, data.message.type === 'state');
    };
    worker.onerror = () => this.fail('The host stopped. Please create a new duel.');
    this.post({ type: 'start', mode, code, champion: this.champion });
  }

  private acceptRemote(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const message = value as ServerMessage;
    if (message.type === 'joined') {
      if (message.code !== this.code || message.player !== 1) return;
    } else if (message.type === 'state') {
      const room = message.room;
      if (room?.code !== this.code || room.mode !== 'duel' || room.game?.players?.length !== 2) return;
      if (
        !room.game.players.every(
          (p, id) =>
            p?.id === id &&
            p.stats &&
            ['shurikensThrown', 'shurikensHit', 'attacksHit', 'damageDealt'].every((key) =>
              Number.isFinite(p.stats[key as keyof typeof p.stats]),
            ),
        )
      )
        return;
    } else if (message.type !== 'pong' && message.type !== 'error') return;
    this.accept(message);
  }

  private accept(message: ServerMessage) {
    if (message.type === 'state') {
      window.clearTimeout(this.timeout);
      this.timeout = 0;
    }
    if (message.type === 'joined') {
      window.clearInterval(this.heartbeat);
      this.heartbeat = window.setInterval(() => this.send({ type: 'ping', sent: performance.now() }), 2000);
    }
    this.receive(message);
  }
  private post(command: HostCommand) {
    this.worker?.postMessage(command);
  }
  private progress(message: string) {
    this.stage = message;
    this.emit('connecting', message);
  }
  private fail(message: string) {
    const connecting = !this.room;
    this.dispose();
    this.receive({ type: 'left' });
    this.emit('error', message);
    if (connecting) this.emit('connection-failed', message);
  }
  private dispose() {
    window.clearTimeout(this.timeout);
    window.clearInterval(this.heartbeat);
    this.timeout = 0;
    this.signaling?.close();
    this.signaling = null;
    this.worker?.terminate();
    this.worker = null;
    this.room = null;
    this.guestJoined = false;
    this.session = '';
  }
}
