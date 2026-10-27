import type { Effect, Vec } from '../shared/types';

// Snapshot-timed bursts at both endpoints, also used during killcam playback.
export class TeleportEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  effect(effect: Effect, now: number): boolean {
    if (effect.kind !== 'flash' && effect.kind !== 'arcane-shift') return false;
    const age = now - effect.at;
    const duration = effect.kind === 'flash' ? 0.3 : 0.38;
    if (!effect.from || age < 0 || age >= duration) return true;
    const progress = age / duration;
    const angle = Math.atan2(effect.pos.y - effect.from.y, effect.pos.x - effect.from.x);
    if (effect.kind === 'flash') {
      this.flash(effect.from, progress, angle, false);
      this.flash(effect.pos, progress, angle, true);
    } else {
      this.shift(effect.from, progress, false);
      this.shift(effect.pos, progress, true);
    }
    return true;
  }

  private flash(pos: Vec, progress: number, angle: number, arrival: boolean) {
    const c = this.c;
    const fade = (1 - progress) ** 2;
    c.save();
    c.translate(pos.x, pos.y);
    c.rotate(angle);
    c.globalAlpha = fade;
    c.strokeStyle = '#f5d77e';
    c.fillStyle = '#fff2c2';
    c.shadowColor = '#f5cd63';
    c.shadowBlur = 16 * (1 - progress);
    c.lineWidth = 3 * (1 - progress) + 1;
    // A sharp star collapses at departure and opens at the destination.
    const radius = arrival ? 32 + progress * 54 : 48 * (1 - progress);
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 ? radius * 0.16 : radius * (i % 4 ? 0.7 : 1);
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    // Short gold sparks stay local to each endpoint: Flash remains an instant blink.
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.2;
      const inner = 25 + progress * 52;
      const outer = inner + 17 * (1 - progress);
      c.beginPath();
      c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      c.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      c.stroke();
    }
    c.restore();
  }

  private shift(pos: Vec, progress: number, arrival: boolean) {
    const c = this.c;
    const radius = arrival ? 25 + progress * 47 : 62 * (1 - progress) + 8;
    c.save();
    c.translate(pos.x, pos.y);
    c.globalAlpha = (1 - progress) ** 1.5;
    c.strokeStyle = '#91dce6';
    c.fillStyle = '#d0f4ef';
    c.shadowColor = '#69c8e2';
    c.shadowBlur = 10 * (1 - progress);
    c.lineWidth = 3;
    c.rotate((arrival ? 1 : -1) * progress * 1.2);
    // Broken circular runes distinguish Arcane Shift from Flash's sharp gold star.
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      c.beginPath();
      c.arc(0, 0, radius, angle, angle + 1.35);
      c.stroke();
      c.save();
      c.rotate(angle + 0.7);
      c.translate(radius + 9, 0);
      c.rotate(Math.PI / 4);
      c.fillRect(-3, -3, 6, 6);
      c.restore();
    }
    c.globalAlpha *= 0.5;
    c.beginPath();
    c.ellipse(0, 0, radius * 0.48, radius * 0.8, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}
