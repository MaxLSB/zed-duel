import { championStats, championSpells } from '../shared/champions';
import { SINGED_SPELLS } from '../shared/singed-balance';
import { bounded, towards } from '../shared/geometry';
import { SingedEffects } from './singed-effects';
import { ARENA, SPELLS } from '../shared/balance';
import { clamp, distance, lerp } from '../shared/geometry';
import type { GameState, PlayerId, PlayerState, Vec } from '../shared/types';
import type { Controls } from './input';
import { Killcam } from './killcam';
import { UltimateEffects } from './ultimate-effects';

const COLORS = ['#90c7b6', '#e1a087'];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private ultimateEffects: UltimateEffects;
  private singedEffects: SingedEffects;
  private current: GameState | null = null;
  private previous: GameState | null = null;
  private received = 0;
  private finishedAt = 0;
  private scale = 1;
  private offset = { x: 0, y: 0 };
  private marker: { pos: Vec; at: number } | null = null;
  readonly killcam = new Killcam();
  onReplayFrame: ((state: GameState) => void) | null = null;
  onReplayEnd: (() => void) | null = null;
  private replayTime = -1;
  player: PlayerId = 0;
  controls: Controls | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.ultimateEffects = new UltimateEffects(this.ctx);
    this.singedEffects = new SingedEffects(this.ctx);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame(this.frame);
  }

  update(state: GameState) {
    if (state.phase === 'finished' && this.current?.phase !== 'finished') this.finishedAt = performance.now();
    this.killcam.record(state);
    this.previous = this.current;
    this.current = state;
    this.received = performance.now();
  }
  click(pos: Vec) {
    this.marker = { pos, at: performance.now() };
  }
  clear() {
    this.killcam.clear();
    this.marker = null;
    this.replayTime = -1;
    this.current = null;
    this.previous = null;
  }
  toWorld = (x: number, y: number): Vec => {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: (((x - box.left) * this.canvas.width) / box.width - this.offset.x) / this.scale,
      y: (((y - box.top) * this.canvas.height) / box.height - this.offset.y) / this.scale,
    };
  };
  private resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.round(this.canvas.clientHeight * ratio);
    this.scale = Math.min(this.canvas.width / ARENA.width, this.canvas.height / ARENA.height);
    this.offset = {
      x: (this.canvas.width - ARENA.width * this.scale) / 2,
      y: (this.canvas.height - ARENA.height * this.scale) / 2,
    };
  }

  private frame = () => {
    const c = this.ctx;
    const wasReplaying = this.killcam.active;
    const playback = this.killcam.sample();
    if (wasReplaying && !playback) this.onReplayEnd?.();
    const s = playback?.state ?? this.current;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#121819';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.offset.x, this.offset.y);
    if (playback) {
      const [a, b] = playback.state.players.map((p) => {
        const next = playback.next.players[p.id];
        return distance(p.pos, next.pos) < 100 ? lerp(p.pos, next.pos, playback.alpha) : p.pos;
      });
      const zoom = 1.22;
      const center = {
        x: clamp((a.x + b.x) / 2, ARENA.width / (2 * zoom), ARENA.width * (1 - 1 / (2 * zoom))),
        y: clamp((a.y + b.y) / 2, ARENA.height / (2 * zoom), ARENA.height * (1 - 1 / (2 * zoom))),
      };
      c.setTransform(
        this.scale * zoom,
        0,
        0,
        this.scale * zoom,
        this.canvas.width / 2 - center.x * this.scale * zoom,
        this.canvas.height / 2 - center.y * this.scale * zoom,
      );
      if (this.replayTime !== playback.state.time) {
        this.replayTime = playback.state.time;
        this.onReplayFrame?.(playback.state);
      }
    } else this.replayTime = -1;
    this.arena();
    if (s) {
      const now =
        playback?.time ??
        s.time +
          (s.phase === 'active'
            ? Math.min(0.05, (performance.now() - this.received) / 1000)
            : s.phase === 'finished'
              ? Math.min(1, (performance.now() - this.finishedAt) / 1000)
              : 0);
      this.singedEffects.zones(s, now, COLORS);
      for (const p of s.players)
        if (p.ultimate) this.ultimateEffects.approach(p, s.players[p.ultimate.target], now);
      const alpha = playback?.alpha ?? clamp((performance.now() - this.received) / 50, 0, 1);
      for (const p of s.players) {
        for (const shadow of p.shadows) {
          const travel = clamp((now - shadow.created) / (shadow.readyAt - shadow.created || 1), 0, 1);
          const pos = lerp(shadow.from, shadow.pos, travel);
          this.ninja(pos, p.facing, COLORS[p.id], 0.25);
        }
      }
      const self = s.players[this.player];
      if (!playback && s.phase === 'active' && this.controls?.attackMovePending) {
        c.strokeStyle = COLORS[this.player] + 'b0';
        c.lineWidth = 2;
        this.circle(self.pos, championStats(self.champion).attackRange + championStats(self.champion).radius);
      }
      if (!playback && s.phase === 'active' && this.controls?.hovered) {
        c.strokeStyle = COLORS[this.player] + '50';
        c.lineWidth = 2;
        c.setLineDash([9, 9]);
        this.circle(self.pos, championSpells(self.champion)[this.controls.hovered].range);
        if (self.champion === 'singed' && this.controls.hovered === 'w')
          this.circle(
            bounded(towards(self.pos, this.controls.cursor, SINGED_SPELLS.w.range)),
            SINGED_SPELLS.w.radius,
          );
        c.setLineDash([]);
      }
      for (const p of s.players) {
        const before = playback ? p.pos : (this.previous?.players[p.id].pos ?? p.pos);
        const after = playback?.next.players[p.id].pos ?? p.pos;
        const pos = distance(before, after) < 100 ? lerp(before, after, alpha) : p.pos;
        this.playerBody(p, pos, now);
      }
      for (const q of s.projectiles) {
        const travel =
          s.phase === 'finished' ? 0 : Math.min(q.remaining, Math.max(0, now - s.time) * SPELLS.q.speed);
        const pos = {
          x: q.pos.x + q.velocity.x * travel,
          y: q.pos.y + q.velocity.y * travel,
        };
        c.strokeStyle = COLORS[q.owner] + '44';
        c.lineWidth = 9;
        c.beginPath();
        c.moveTo(pos.x - q.velocity.x * 90, pos.y - q.velocity.y * 90);
        c.lineTo(pos.x, pos.y);
        c.stroke();
        c.save();
        c.translate(pos.x, pos.y);
        c.rotate((now * 1000) / 75);
        c.fillStyle = COLORS[q.owner];
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4,
            r = i % 2 ? 11 : 38;
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
        c.restore();
      }
      for (const effect of s.effects) {
        if (this.ultimateEffects.effect(effect, now)) continue;
        const age = now - effect.at;
        const opacity = clamp(1 - age / 0.6, 0, 1);
        c.globalAlpha = opacity;
        if (effect.kind === 'hit')
          this.text(
            `${Math.round(effect.amount ?? 0)}`,
            effect.pos.x + 75,
            effect.pos.y - 85 - age * 100,
            30,
            '#f4e9d4',
          );
        else {
          c.strokeStyle = effect.kind === 'passive' ? '#c1ad78' : COLORS[effect.owner];
          c.lineWidth = effect.kind === 'slash' ? 8 * opacity : 4;
          const radius = effect.kind === 'slash' ? 290 : 55;
          this.circle(effect.pos, radius * (0.65 + age));
        }
        c.globalAlpha = 1;
      }
      if (!playback && self.destination && s.phase === 'active') {
        c.strokeStyle = COLORS[this.player] + '44';
        c.lineWidth = 2;
        c.setLineDash([5, 12]);
        c.beginPath();
        c.moveTo(self.pos.x, self.pos.y);
        c.lineTo(self.destination.x, self.destination.y);
        c.stroke();
        c.setLineDash([]);
      }
    } else {
      this.ninja({ x: 500, y: 700 }, 0, COLORS[0], 0.45);
      this.ninja({ x: 1900, y: 700 }, Math.PI, COLORS[1], 0.45);
    }
    if (!playback && this.marker && performance.now() - this.marker.at < 550) {
      const age = (performance.now() - this.marker.at) / 550;
      c.globalAlpha = 1 - age;
      c.strokeStyle = COLORS[this.player];
      c.lineWidth = 3;
      this.circle(this.marker.pos, 14 + age * 25);
      c.globalAlpha = 1;
    }
    requestAnimationFrame(this.frame);
  };

  private arena() {
    const c = this.ctx;
    c.fillStyle = '#151b1c';
    c.fillRect(0, 0, ARENA.width, ARENA.height);
    const gradient = c.createRadialGradient(1200, 700, 20, 1200, 700, 1300);
    gradient.addColorStop(0, '#202929');
    gradient.addColorStop(1, '#121819');
    c.fillStyle = gradient;
    c.fillRect(0, 0, ARENA.width, ARENA.height);
    c.strokeStyle = '#ffffff04';
    c.lineWidth = 1;
    for (let x = 0; x <= ARENA.width; x += 100) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, ARENA.height);
      c.stroke();
    }
    for (let y = 0; y <= ARENA.height; y += 100) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(ARENA.width, y);
      c.stroke();
    }
    c.strokeStyle = '#81978b15';
    c.lineWidth = 2;
    c.strokeRect(65, 65, ARENA.width - 130, ARENA.height - 130);
    this.circle({ x: 1200, y: 700 }, 260);
    this.circle({ x: 1200, y: 700 }, 275);
    c.setLineDash([6, 18]);
    c.beginPath();
    c.moveTo(1200, 65);
    c.lineTo(1200, 1335);
    c.stroke();
    c.setLineDash([]);
    for (const x of [120, 2280])
      for (const y of [120, 1280]) {
        c.strokeStyle = '#c0b18a50';
        c.beginPath();
        c.moveTo(x, y + (y < 700 ? 45 : -45));
        c.lineTo(x, y);
        c.lineTo(x + (x < 1200 ? 45 : -45), y);
        c.stroke();
      }
  }

  private playerBody(p: PlayerState, pos: Vec, now: number) {
    const c = this.ctx,
      color = COLORS[p.id];
    if (p.ultimate || p.untargetableUntil > now) return;
    c.strokeStyle = color + (p.id === this.player ? 'b0' : '45');
    c.lineWidth = 2;
    this.circle(pos, 75);
    const flight = p.airborne;
    const height = flight
      ? Math.sin(clamp((now - flight.started) / (flight.ends - flight.started), 0, 1) * Math.PI) * 100
      : 0;
    const body = { x: pos.x, y: pos.y - height };
    if (p.singed) this.singedEffects.body(p, body, now, color);
    else this.ninja(body, p.facing, color, p.hp <= 0 ? 0.2 : 1);
    if (p.rootUntil > now) {
      c.strokeStyle = '#c6df74';
      c.lineWidth = 4;
      c.setLineDash([10, 8]);
      this.circle(pos, 90);
      c.setLineDash([]);
    }
    if (p.mark) this.ultimateEffects.mark(pos, p.mark.expires, now);
    c.fillStyle = '#090e10';
    c.fillRect(pos.x - 78, pos.y - 111, 156, 9);
    c.fillStyle = color;
    c.fillRect(pos.x - 78, pos.y - 111, (156 * p.hp) / championStats(p.champion).hp, 9);
  }

  private ninja(pos: Vec, facing: number, color: string, opacity: number) {
    const c = this.ctx;
    c.save();
    c.translate(pos.x, pos.y);
    c.rotate(facing + Math.PI / 2);
    c.globalAlpha = opacity;
    c.fillStyle = '#080c0e80';
    c.beginPath();
    c.ellipse(0, 12, 54, 60, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#273132';
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -53);
    c.lineTo(34, -20);
    c.lineTo(42, 36);
    c.lineTo(0, 57);
    c.lineTo(-42, 36);
    c.lineTo(-34, -20);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(-45, 18);
    c.lineTo(-64, -37);
    c.lineTo(-34, -7);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(45, 18);
    c.lineTo(64, -37);
    c.lineTo(34, -7);
    c.closePath();
    c.fill();
    c.fillStyle = '#0e1415';
    c.beginPath();
    c.moveTo(0, -37);
    c.lineTo(23, -13);
    c.lineTo(17, 16);
    c.lineTo(0, 28);
    c.lineTo(-17, 16);
    c.lineTo(-23, -13);
    c.closePath();
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-15, -5);
    c.lineTo(-4, 0);
    c.moveTo(15, -5);
    c.lineTo(4, 0);
    c.stroke();
    c.restore();
  }
  private circle(pos: Vec, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }
  private text(text: string, x: number, y: number, size: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px ui-monospace, SFMono-Regular, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, x, y);
  }
}
