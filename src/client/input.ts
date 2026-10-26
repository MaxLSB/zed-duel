import { visible } from '../shared/visibility';
import { distance } from '../shared/geometry';
import type { SpellKey } from '../shared/balance';
import type { GameState, Input, PlayerId, Vec } from '../shared/types';

export type Bindings = Record<SpellKey | 'stop' | 'attackMove', string>;
export const DEFAULT_BINDINGS: Bindings = {
  q: 'a',
  w: 'z',
  e: 'e',
  r: 'r',
  d: 'd',
  stop: 's',
  attackMove: 'q',
};
export const normalizeBinding = (key: string) => (key.toLowerCase() === 'space' ? ' ' : key.toLowerCase());
export const bindingLabel = (key: string) => (key === ' ' ? 'Space' : key.toUpperCase());
export const isBinding = (key: unknown): key is string => typeof key === 'string' && /^[a-z0-9 ]$/.test(key);

export function loadBindings(): Bindings {
  try {
    const saved = JSON.parse(localStorage.getItem('zed-bindings') ?? 'null');
    if (saved) {
      const keys = Object.keys(DEFAULT_BINDINGS) as (keyof Bindings)[];
      if (saved.attackMove === undefined) {
        const used = keys.filter((key) => key !== 'attackMove').map((key) => saved[key]);
        saved.attackMove = ['q', 'x', ...'abcdefghijklmnopqrstuvwxyz0123456789 '].find(
          (key) => !used.includes(key),
        );
      }
      const active = Object.fromEntries(keys.map((key) => [key, saved[key]])) as Bindings;
      if (Object.values(active).every(isBinding) && new Set(Object.values(active)).size === keys.length)
        return active;
    }
  } catch {
    /* Storage can be disabled by the browser. */
  }
  return { ...DEFAULT_BINDINGS };
}

export class Controls {
  cursor: Vec = { x: 1200, y: 700 };
  hovered: SpellKey | null = null;
  bindings = loadBindings();
  attackMovePending = false;
  private held = false;
  private lastMove = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private worldPoint: (x: number, y: number) => Vec,
    private state: () => GameState | null,
    private player: () => PlayerId,
    private send: (input: Input) => void,
  ) {
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointermove', (event) => {
      this.cursor = this.worldPoint(event.clientX, event.clientY);
      if (this.held && performance.now() - this.lastMove > 65) this.command();
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.cursor = this.worldPoint(event.clientX, event.clientY);
      if (document.querySelector('dialog[open]')) return;
      canvas.focus({ preventScroll: true });
      if (event.button === 0 && this.attackMovePending) {
        event.preventDefault();
        this.attackMovePending = false;
        if (this.target() !== undefined) this.send({ action: 'attack' });
        else this.send({ action: 'attack-move', point: { ...this.cursor } });
      }
      if (event.button === 2) {
        this.attackMovePending = false;
        this.held = true;
        canvas.setPointerCapture(event.pointerId);
        this.command();
      }
    });
    window.addEventListener('pointerup', () => {
      this.held = false;
    });
    window.addEventListener('blur', () => {
      this.held = false;
      this.hovered = null;
      this.attackMovePending = false;
    });
    window.addEventListener('keydown', (event) => {
      if (event.metaKey || event.altKey || this.typing()) return;
      if (event.key === 'Escape') this.attackMovePending = false;
      const key = Object.keys(this.bindings).find(
        (k) => this.bindings[k as keyof Bindings] === event.key.toLowerCase(),
      ) as keyof Bindings | undefined;
      if (!key) return;
      if (event.ctrlKey && (key !== 'stop' || this.state()?.phase !== 'active')) return;
      event.preventDefault();
      if (event.repeat && key !== 'stop') return;
      this.attackMovePending = false;
      if (key === 'stop') {
        this.held = false;
        this.send({ action: 'stop' });
      } else if (key === 'attackMove') {
        this.held = false;
        this.attackMovePending = this.state()?.phase === 'active';
      } else this.send({ action: 'cast', spell: key, point: { ...this.cursor }, target: this.target() });
    });
  }

  save(bindings: Bindings) {
    this.attackMovePending = false;
    this.bindings = bindings;
    try {
      localStorage.setItem('zed-bindings', JSON.stringify(bindings));
    } catch {
      /* Keep session bindings if persistence is unavailable. */
    }
  }
  private typing() {
    return (
      !!document.querySelector('dialog[open]') ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')
    );
  }
  private target(): PlayerId | undefined {
    const state = this.state();
    const enemy = state?.players[1 - this.player()];
    return state &&
      enemy &&
      enemy.hp > 0 &&
      !enemy.ultimate &&
      enemy.untargetableUntil <= state.time &&
      visible(enemy, state.time) &&
      distance(this.cursor, enemy.pos) <= 110
      ? enemy.id
      : undefined;
  }
  private command() {
    this.lastMove = performance.now();
    if (this.target() !== undefined) this.send({ action: 'attack' });
    else this.send({ action: 'move', point: { ...this.cursor } });
  }
}
