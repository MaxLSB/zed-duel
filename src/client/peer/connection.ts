import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { GameConnection } from '../connection';
import type { ChampionId, ClientMessage, PlayerId, ServerMessage } from '../../shared/types';
import { isChampion } from '../../shared/protocol';
import type { HostCommand } from './host-worker';
import { peerId, peerOptions, roomCode } from './options';

export class PeerConnection extends GameConnection {
  private peer: Peer | null = null;
  private channel: DataConnection | null = null;
  private worker: Worker | null = null;
  private timeout = 0;
  private heartbeat = 0;
  private code = '';

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
      return;
    }
    if (message.type === 'create' || message.type === 'join' || message.type === 'practice') {
      if (this.peer || this.worker) return;
      const champion = message.champion ?? 'zed';
      if (!isChampion(champion)) return;
      if (message.type === 'practice') this.startHost('practice', roomCode(), champion);
      else {
        this.emit('connecting', null);
        if (message.type === 'create') this.createHost(champion);
        else if (message.type === 'join') this.join(message.code, champion);
      }
      return;
    }
    if (this.worker) this.post({ type: 'message', player: 0, message });
    else if (this.channel?.open) this.channel.send(message);
  }

  private startHost(mode: 'duel' | 'practice', code: string, champion: ChampionId) {
    this.code = code;
    const worker = new Worker(new URL('./host-worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }: MessageEvent<{ player: PlayerId; message: ServerMessage }>) => {
      if (this.worker !== worker) return;
      if (data.player === 0) this.accept(data.message);
      else if (
        this.channel?.open &&
        (data.message.type !== 'state' || this.channel.dataChannel.bufferedAmount < 256_000)
      )
        this.channel.send(data.message);
    };
    worker.onerror = () => this.fail('The host stopped. Please create a new duel.');
    this.post({ type: 'start', mode, code, champion });
  }

  private createHost(champion: ChampionId, attempt = 0) {
    this.code = roomCode();
    const peer = this.openPeer(peerId(this.code));
    if (!peer) return;
    peer.once('open', () => {
      if (this.peer === peer) this.startHost('duel', this.code, champion);
    });
    peer.on('connection', (channel) => {
      if (this.peer !== peer) {
        channel.close();
        return;
      }
      if (this.channel || !this.worker || channel.metadata?.protocol !== 1) {
        channel.on('open', () => {
          channel.send({ type: 'error', message: 'This room already has two players.' });
          setTimeout(() => channel.close(), 200);
        });
        return;
      }
      this.attach(channel, true);
    });
    peer.on('error', (error) => {
      if (this.peer !== peer) return;
      if (error.type === 'unavailable-id' && !this.worker && attempt < 3) {
        this.peer = null;
        peer.destroy();
        this.createHost(champion, attempt + 1);
      } else this.peerError(error.type);
    });
  }

  private join(code: string, champion: ChampionId) {
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.fail('Check the room code.');
      return;
    }
    this.code = code;
    const peer = this.openPeer(`zed-guest-${crypto.randomUUID()}`);
    if (!peer) return;
    peer.once('open', () => {
      if (this.peer === peer)
        this.attach(
          peer.connect(peerId(code), {
            reliable: true,
            serialization: 'json',
            metadata: { protocol: 1, champion },
          }),
          false,
        );
    });
    peer.on('connection', (channel) => channel.close());
    peer.on('error', (error) => {
      if (this.peer === peer) this.peerError(error.type);
    });
  }

  private openPeer(id: string) {
    try {
      const peer = new Peer(id, peerOptions());
      this.peer = peer;
      window.clearTimeout(this.timeout);
      this.timeout = window.setTimeout(
        () =>
          this.fail(
            'Could not connect. Keep the host tab open and try again; your network may require a relay.',
          ),
        25000,
      );
      peer.on('disconnected', () => {
        if (this.peer === peer && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch {
            this.emit('error', 'The connection service is unavailable.');
          }
        }
      });
      return peer;
    } catch {
      this.fail('Could not start multiplayer. Check the connection service configuration.');
      return null;
    }
  }

  private attach(channel: DataConnection, host: boolean) {
    this.channel = channel;
    const opening = window.setTimeout(() => {
      if (this.channel === channel && !channel.open) {
        this.channel = null;
        channel.close();
        if (!host) this.fail('Could not connect to the host. Try again or use another network.');
      }
    }, 25000);
    channel.on('open', () => {
      window.clearTimeout(opening);
      if (this.channel !== channel) return;
      if (host) {
        const champion = channel.metadata?.champion ?? 'zed';
        if (!isChampion(champion)) {
          channel.send({ type: 'error', message: 'Invalid champion selection.' });
          channel.close();
          return;
        }
        this.post({ type: 'join', champion });
      }
    });
    channel.on('data', (value) => {
      if (this.channel !== channel) return;
      if (host) this.post({ type: 'message', player: 1, message: value });
      else this.acceptRemote(value);
    });
    channel.on('close', () => {
      window.clearTimeout(opening);
      if (this.channel !== channel) return;
      this.channel = null;
      if (host) this.post({ type: 'leave' });
      else this.fail('The host disconnected. Join a new duel to play again.');
    });
    channel.on('error', () => {
      if (this.channel !== channel) return;
      channel.close();
    });
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
            p.id === id &&
            p.stats &&
            ['shurikensThrown', 'shurikensHit', 'attacksHit', 'damageDealt'].every((key) =>
              Number.isFinite(p.stats[key as keyof typeof p.stats]),
            ),
        )
      )
        return;
    } else if (message.type !== 'pong' && message.type !== 'error') return;
    if (message.type === 'error' && !this.room) {
      this.fail(String(message.message));
      return;
    }
    this.accept(message);
  }

  private accept(message: ServerMessage) {
    if (message.type === 'joined') {
      window.clearTimeout(this.timeout);
      window.clearInterval(this.heartbeat);
      this.heartbeat = window.setInterval(() => this.send({ type: 'ping', sent: performance.now() }), 2000);
    }
    this.receive(message);
  }

  private peerError(type: string) {
    if (this.channel?.open) {
      this.emit('error', 'The connection service is unavailable; this duel can continue.');
      return;
    }
    this.fail(
      type === 'peer-unavailable'
        ? 'Room not found. Check the code and keep the host tab open.'
        : 'Could not connect to multiplayer. Try again in a moment.',
    );
  }

  private post(command: HostCommand) {
    this.worker?.postMessage(command);
  }

  private fail(message: string) {
    this.dispose();
    this.receive({ type: 'left' });
    this.emit('error', message);
  }

  private dispose() {
    window.clearTimeout(this.timeout);
    window.clearInterval(this.heartbeat);
    const channel = this.channel,
      peer = this.peer;
    this.channel = null;
    this.peer = null;
    this.worker?.terminate();
    this.worker = null;
    channel?.close();
    peer?.destroy();
    this.room = null;
  }
}
