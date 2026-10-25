import { clamp } from '../shared/geometry';
import type { GameState } from '../shared/types';

export interface ReplayFrame {
  state: GameState;
  next: GameState;
  time: number;
  alpha: number;
}

export class Killcam {
  private history: GameState[] = [];
  private started = 0;
  private from = 0;
  private until = 0;
  private finished = false;
  active = false;

  record(state: GameState, now = performance.now()) {
    const last = this.history.at(-1);
    if (!['active', 'finished'].includes(state.phase) || (last && state.time < last.time)) this.clear();
    if (state.phase === 'active' && this.finished) this.clear();
    if (state.phase === 'active') {
      if (this.history.at(-1)?.time !== state.time) this.history.push(state);
      while (this.history.length > 1 && this.history[1].time < state.time - 3) this.history.shift();
    } else if (state.phase === 'finished' && !this.finished) {
      this.finished = true;
      this.history.push(state);
      if (this.history.length < 2) return;
      this.from = Math.max(this.history[0].time, state.time - 3);
      this.until = state.time;
      this.started = now;
      this.active = true;
    }
  }

  sample(now = performance.now()): ReplayFrame | null {
    if (!this.active) return null;
    const elapsed = (now - this.started) / 1000;
    if (elapsed > (this.until - this.from) / 0.75 + 0.65) {
      this.active = false;
      return null;
    }
    const time = Math.min(this.until + 0.45, this.from + elapsed * 0.75);
    let index = this.history.length - 1;
    while (index > 0 && this.history[index].time > time) index--;
    const state = this.history[index];
    const next = this.history[Math.min(this.history.length - 1, index + 1)];
    const alpha = state === next ? 0 : clamp((time - state.time) / (next.time - state.time), 0, 1);
    return { state, next, time, alpha };
  }

  skip() {
    this.active = false;
  }

  clear() {
    this.history = [];
    this.active = false;
    this.finished = false;
  }
}
