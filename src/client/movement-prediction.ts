import { STEP, STATS } from '../shared/balance';
import { championStats } from '../shared/champions';
import { bounded, direction, distance } from '../shared/geometry';
import { movePlayer } from '../shared/movement';
import type { GameState, Input, PlayerId, PlayerState, Vec } from '../shared/types';

interface Command {
  seq: number;
  at: number;
  input: Input;
}
const MAX_LEAD = 250;
const CORRECTION_MS = 80;

export class MovementPrediction {
  private state: GameState | null = null;
  private player: PlayerId = 1;
  private received = 0;
  private delay = 0;
  private pending: Command[] = [];
  private correction: Vec = { x: 0, y: 0 };

  clear() {
    this.state = null;
    this.pending = [];
    this.correction = { x: 0, y: 0 };
  }

  input(seq: number, input: Input, now = performance.now()) {
    if (this.state?.phase !== 'active') return;
    if (this.pending.length >= 128) this.pending.shift();
    this.pending.push({ seq, input: structuredClone(input), at: now });
  }

  update(state: GameState, player: PlayerId, ack: number, latency: number, now = performance.now()) {
    const previous = this.sample(now);
    const old = this.state;
    const motion = (s: GameState | null) =>
      s?.effects.filter((e) => e.owner === player && ['blink', 'vanish', 'emerge'].includes(e.kind)).at(-1)
        ?.id ?? -1;
    const reset =
      !old ||
      old.phase !== 'active' ||
      state.phase !== 'active' ||
      state.time < old.time ||
      old.players[player].champion !== state.players[player].champion;
    const displaced = motion(state) > motion(old) || !!state.players[player].airborne;
    this.pending = reset ? [] : this.pending.filter((c) => c.seq > ack);
    this.state = state;
    this.player = player;
    this.received = now;
    this.delay = Number.isFinite(latency) ? Math.max(0, Math.min(latency, MAX_LEAD)) : 0;
    this.correction = { x: 0, y: 0 };
    const next = this.sample(now);
    if (
      !reset &&
      !displaced &&
      previous &&
      next &&
      distance(previous.pos, next.pos) < 100 &&
      !this.locked(state.players[player])
    ) {
      this.correction = { x: previous.pos.x - next.pos.x, y: previous.pos.y - next.pos.y };
    }
  }

  sample(now = performance.now()): { pos: Vec; facing: number } | null {
    if (!this.state || this.state.phase !== 'active') return null;
    const source = this.state.players[this.player];
    if (source.hp <= 0) return null;
    const p = structuredClone(source);
    const state = { ...this.state, players: [...this.state.players] as GameState['players'] };
    state.players[this.player] = p;
    if (!this.locked(p)) {
      // A snapshot describes inputs sent roughly one round trip earlier.
      let cursor = this.received - this.delay;
      const end = Math.min(now, this.received + MAX_LEAD);
      let barrier = false;
      const advance = (to: number) => {
        while (cursor < to) {
          const ms = Math.min(STEP * 1000, to - cursor);
          state.time += ms / 1000;
          if (!barrier) this.step(p, state, ms / 1000);
          cursor += ms;
        }
      };
      for (const command of this.pending) {
        if (command.at > end) break;
        advance(Math.max(cursor, command.at));
        if (command.input.action === 'cast') {
          const instant =
            p.champion === 'zed' ? command.input.spell === 'e' : ['q', 'r'].includes(command.input.spell);
          if (!instant) barrier = true;
        } else if (!barrier) this.apply(p, command.input);
      }
      advance(end);
    }
    const weight = Math.max(0, 1 - (now - this.received) / CORRECTION_MS);
    return {
      pos: bounded({ x: p.pos.x + this.correction.x * weight, y: p.pos.y + this.correction.y * weight }),
      facing: p.facing,
    };
  }

  private locked(p: PlayerState) {
    const now = this.state!.time;
    return (
      !!p.airborne || !!p.ultimate || p.untargetableUntil > now || p.castUntil > now || p.rootUntil > now
    );
  }

  private apply(p: PlayerState, input: Input) {
    p.attackMove = null;
    p.attacking = input.action === 'attack';
    if (input.action === 'move' || input.action === 'attack-move') {
      p.destination = bounded(input.point);
      if (input.action === 'attack-move') p.attackMove = { ...p.destination };
    } else p.destination = null;
    if (input.action === 'move' || input.action === 'stop') p.windupUntil = 0;
  }

  private step(p: PlayerState, state: GameState, dt: number) {
    const enemy = state.players[1 - p.id];
    const range =
      championStats(p.champion).attackRange +
      championStats(p.champion).radius +
      championStats(enemy.champion).radius;
    if ((p.attacking || p.attackMove) && enemy.hp > 0 && enemy.untargetableUntil <= state.time) {
      if (distance(p.pos, enemy.pos) <= range) {
        p.destination = null;
        return;
      }
      if (p.attacking) p.destination = { ...enemy.pos };
    }
    movePlayer(p, state, dt);
    if (p.mark || enemy.mark || enemy.airborne || enemy.untargetableUntil > state.time) return;
    if (distance(p.pos, enemy.pos) < STATS.radius * 2) {
      const v = distance(p.pos, enemy.pos) ? direction(enemy.pos, p.pos) : { x: 1, y: 0 };
      p.pos = bounded({ x: enemy.pos.x + v.x * STATS.radius * 2, y: enemy.pos.y + v.y * STATS.radius * 2 });
    }
  }
}
