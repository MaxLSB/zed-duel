import { SPELLS } from '../shared/balance';
import { bounded, clamp, direction, lerp } from '../shared/geometry';
import type { Effect, PlayerState, Vec } from '../shared/types';

const RED = '#f07978';

export class UltimateEffects {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  approach(caster: PlayerState, target: PlayerState, now: number) {
    const approach = caster.ultimate;
    if (!approach) return;
    const c = this.ctx;
    const age = Math.max(0, now - approach.started);
    const progress = clamp((age - SPELLS.r.delay) / SPELLS.r.dash, 0, 1);
    const aim = direction(approach.origin, target.pos);
    const end = bounded({ x: target.pos.x + aim.x * 125, y: target.pos.y + aim.y * 125 });
    c.save();
    if (age >= SPELLS.r.delay) {
      const tip = lerp(approach.origin, end, progress);
      const tail = lerp(approach.origin, end, Math.max(0, progress - 0.55));
      c.globalAlpha = 0.9;
      c.lineCap = 'round';
      const trail = c.createLinearGradient(tail.x, tail.y, tip.x + 0.01, tip.y + 0.01);
      trail.addColorStop(0, '#080a1100');
      trail.addColorStop(0.7, '#080a11dd');
      trail.addColorStop(1, '#9da0b999');
      c.strokeStyle = trail;
      c.lineWidth = 32;
      c.beginPath();
      c.moveTo(tail.x, tail.y);
      c.lineTo(tip.x, tip.y);
      c.stroke();
      for (const side of [-1, 1]) {
        c.strokeStyle = '#afa4c788';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(tail.x - aim.y * side * 28, tail.y + aim.x * side * 28);
        c.quadraticCurveTo(
          tip.x - aim.x * 90 - aim.y * side * 45,
          tip.y - aim.y * 90 + aim.x * side * 45,
          tip.x,
          tip.y,
        );
        c.stroke();
      }
      this.smoke(tip, progress * 0.18, 0.6);
    }
    c.restore();
  }

  mark(pos: Vec, expires: number, now: number) {
    const remaining = Math.max(0, expires - now);
    const c = this.ctx;
    c.save();
    c.strokeStyle = RED;
    c.lineWidth = 7;
    c.shadowColor = RED;
    c.shadowBlur = remaining < 1 ? 10 : 4;
    c.translate(pos.x, pos.y - 167);
    const pulse = 1 + Math.sin(now * (remaining < 1 ? 24 : 9)) * 0.07;
    c.scale(pulse, pulse);
    this.cross(25);
    c.shadowBlur = 0;
    c.fillStyle = '#111719';
    c.fillRect(-30, -67, 60, 29);
    c.fillStyle = RED;
    c.font = '24px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText(remaining.toFixed(1), 0, -44);
    c.restore();
  }

  effect(effect: Effect, now: number): boolean {
    if (!['vanish', 'emerge', 'detonate'].includes(effect.kind)) return false;
    const age = Math.max(0, now - effect.at);
    const c = this.ctx;
    c.save();
    if (effect.kind === 'vanish') this.smoke(effect.pos, age, 1);
    else {
      const opacity = clamp(1 - age / 0.55, 0, 1);
      const detonation = effect.kind === 'detonate';
      c.globalAlpha = opacity;
      c.strokeStyle = detonation ? RED : '#e7d5de';
      c.lineWidth = (detonation ? 8 : 5) * opacity;
      c.shadowColor = RED;
      c.shadowBlur = 12 * opacity;
      if (!detonation) this.ring(effect.pos, 50 + age * 140);
      c.translate(effect.pos.x, effect.pos.y);
      c.rotate(detonation ? 0 : 0.3);
      this.cross((detonation ? 110 : 75) + age * 80);
    }
    c.restore();
    return true;
  }

  private smoke(pos: Vec, age: number, strength: number) {
    const opacity = clamp(1 - age / 0.48, 0, 1) * strength;
    if (!opacity) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = opacity;
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.399;
      const spread = 20 + age * 160;
      const x = pos.x + Math.cos(angle) * spread,
        y = pos.y + Math.sin(angle) * spread * 0.7;
      const radius = 38 + age * 70;
      const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, '#060810ed');
      gradient.addColorStop(0.5, '#5b5167a0');
      gradient.addColorStop(1, '#3e354f00');
      c.fillStyle = gradient;
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private cross(size: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(-size, -size);
    c.lineTo(size, size);
    c.moveTo(size, -size);
    c.lineTo(-size, size);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -size * 0.4);
    c.lineTo(size * 0.4, 0);
    c.lineTo(0, size * 0.4);
    c.lineTo(-size * 0.4, 0);
    c.closePath();
    c.stroke();
  }

  private ring(pos: Vec, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }
}
