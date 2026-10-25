import { Game } from './game';
import { isChampion, parseMessage } from './protocol';
import type { ChampionId, ClientMessage, Input, PlayerId, RoomState, ServerMessage } from './types';

export class HostedMatch {
  readonly game: Game;
  readonly connected: [boolean, boolean] = [true, false];
  private ready: [boolean, boolean] = [false, false];
  private seq: [number, number] = [-1, -1];
  private inputs: { player: PlayerId; input: Input }[] = [];
  private rate = [
    { at: 0, count: 0 },
    { at: 0, count: 0 },
  ];

  constructor(
    readonly mode: 'duel' | 'practice',
    readonly code: string,
    private publish: (player: PlayerId, message: ServerMessage) => void,
    champion: ChampionId = 'zed',
  ) {
    this.game = new Game(mode === 'practice' ? 1 : null);
    this.game.selectChampion(0, isChampion(champion) ? champion : 'zed');
    this.publish(0, { type: 'joined', code, player: 0 });
    if (mode === 'practice') this.resetPractice();
    else this.broadcast();
  }

  join(champion: ChampionId = 'zed'): boolean {
    if (this.mode !== 'duel' || this.connected[1] || !isChampion(champion)) return false;
    this.connected[1] = true;
    this.seq[1] = -1;
    this.rate[1] = { at: 0, count: 0 };
    this.game.selectChampion(1, champion);
    this.publish(1, { type: 'joined', code: this.code, player: 1 });
    this.broadcast();
    return true;
  }

  leave() {
    this.connected[1] = false;
    this.ready = [false, false];
    this.inputs = [];
    this.game.disconnect();
    this.game.selectChampion(1, 'zed');
    this.broadcast();
  }

  handle(player: PlayerId, value: unknown, now = performance.now()) {
    if (!this.connected[player]) return;
    const rate = this.rate[player];
    if (now - rate.at >= 1000) {
      rate.at = now;
      rate.count = 0;
    }
    if (++rate.count > 150) return;
    let message: ClientMessage | null;
    try {
      const raw = JSON.stringify(value);
      message = raw.length <= 2048 ? parseMessage(raw) : null;
    } catch {
      return;
    }
    if (!message) return;
    if (
      message.type === 'select-champion' &&
      this.mode === 'duel' &&
      this.game.selectChampion(player, message.champion)
    ) {
      this.ready = [false, false];
      this.inputs = [];
      this.broadcast();
    }
    if (message.type === 'ping') this.publish(player, { type: 'pong', sent: message.sent });
    if (message.type === 'reset-practice' && player === 0 && this.mode === 'practice') this.resetPractice();
    if (
      message.type === 'ready' &&
      this.mode === 'duel' &&
      !['active', 'countdown'].includes(this.game.state.phase)
    ) {
      this.ready[player] = true;
      if (this.connected.every(Boolean) && this.ready.every(Boolean)) {
        this.game.start();
        this.ready = [false, false];
        this.inputs = [];
      }
      this.broadcast();
    }
    if (message.type === 'input' && this.game.state.phase === 'active' && message.seq > this.seq[player]) {
      this.seq[player] = message.seq;
      if (this.inputs.length < 128) this.inputs.push({ player, input: message.input });
    }
  }

  step() {
    for (const { player, input } of this.inputs) this.game.input(player, input);
    this.inputs = [];
    this.game.step();
  }

  broadcast() {
    const room: RoomState = {
      mode: this.mode,
      code: this.code,
      connected: this.connected,
      ready: this.ready,
      game: this.game.state,
    };
    for (const player of [0, 1] as const)
      if (this.connected[player]) this.publish(player, { type: 'state', room, ack: this.seq[player] });
  }

  private resetPractice() {
    this.inputs = [];
    this.ready = [false, false];
    this.game.start(0);
    this.game.state.players[0].pos = { x: 950, y: 700 };
    this.game.state.players[1].pos = { x: 1450, y: 700 };
    this.broadcast();
  }
}
