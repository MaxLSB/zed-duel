import { clamp } from '../shared/geometry';
import { SINGED_SPELLS } from '../shared/singed-balance';
import type { GameState, PlayerState, Vec } from '../shared/types';

export class SingedEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  zones(state: GameState, now: number, colors: string[]) {
    const c = this.c;
    for (const zone of state.zones) {
      if (zone.expires <= now) continue;
      c.save();
      c.translate(zone.pos.x, zone.pos.y);
      const poison = zone.kind === 'poison';
      const radius = poison ? SINGED_SPELLS.q.range : SINGED_SPELLS.w.radius;
      const life = clamp((zone.expires - now) / (poison ? 1 : 0.4), 0, 1);
      const ready = zone.created <= now;
      c.globalAlpha = life * (ready ? 1 : 0.35);
      if (poison) {
        const gradient = c.createRadialGradient(0, 0, 5, 0, 0, radius);
        gradient.addColorStop(0, zone.owner === 0 ? '#96bc5033' : '#c9a35433');
        gradient.addColorStop(1, '#9cba5000');
        c.fillStyle = gradient;
        c.beginPath();
        c.arc(0, 0, radius, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = colors[zone.owner];
        c.globalAlpha *= 0.3;
        for (let i = 0; i < 3; i++) {
          const phase = zone.id * 2.4 + i * 2.1;
          c.beginPath();
          c.arc(
            Math.cos(phase) * 65,
            Math.sin(phase) * 65 - (now - zone.created) * 12,
            5 + i * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      } else {
        c.fillStyle = '#9bbb4622';
        c.strokeStyle = colors[zone.owner];
        c.lineWidth = 3;
        c.setLineDash(ready ? [] : [10, 12]);
        c.beginPath();
        c.arc(0, 0, radius, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.globalAlpha *= 0.4;
        c.beginPath();
        c.arc(0, 0, radius - 14, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(-18, 0);
        c.lineTo(18, 0);
        c.moveTo(0, -18);
        c.lineTo(0, 18);
        c.stroke();
      }
      c.restore();
    }
  }

  body(p: PlayerState, pos: Vec, now: number, color: string) {
    const c = this.c;
    c.save();
    c.translate(pos.x, pos.y);
    c.globalAlpha = p.hp <= 0 ? 0.2 : 1;
    const potionLeft = p.singed!.insanityUntil - now;
    if (potionLeft > 0 && p.hp > 0) {
      const fraction = clamp(potionLeft / SINGED_SPELLS.r.duration, 0, 1);
      const start = -Math.PI / 2,
        end = start + Math.PI * 2 * fraction;
      const tint = potionLeft <= 3 ? '#e2b76b' : '#c6df74';
      c.strokeStyle = '#c6df7426';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, 0, 86, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = tint;
      c.beginPath();
      c.arc(0, 0, 86, start, end);
      c.stroke();
      c.fillStyle = tint;
      c.beginPath();
      c.arc(Math.cos(end) * 86, Math.sin(end) * 86, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#11191d';
      c.fillRect(-24, -145, 48, 25);
      c.fillStyle = tint;
      c.font = '18px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillText(`${Math.ceil(potionLeft)}s`, 0, -126);
    }
    if (p.singed!.slipstreamUntil > now) {
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      for (let i = -1; i <= 1; i++) {
        c.moveTo(-Math.cos(p.facing) * 65 + i * 24, -Math.sin(p.facing) * 65);
        c.lineTo(-Math.cos(p.facing) * 115 + i * 24, -Math.sin(p.facing) * 115);
      }
      c.stroke();
    }
    c.rotate(p.facing + Math.PI / 2);
    c.fillStyle = '#080c0e80';
    c.beginPath();
    c.ellipse(0, 12, 57, 62, 0, 0, Math.PI * 2);
    c.fill();
    // Heavy coat, strapped chemical tank and broad shield.
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.fillStyle = '#334137';
    c.beginPath();
    c.moveTo(-25, -25);
    c.lineTo(26, -25);
    c.lineTo(39, 48);
    c.lineTo(-37, 48);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = p.singed!.poisonOn ? '#a7c65b' : '#637151';
    c.beginPath();
    c.roundRect(-23, 13, 46, 39, 9);
    c.fill();
    c.stroke();
    c.fillStyle = '#c2b994';
    c.beginPath();
    c.arc(0, -32, 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#283d35';
    c.fillRect(-22, -33, 44, 17);
    c.fillStyle = '#9cc079';
    c.fillRect(-12, -31, 7, 5);
    c.fillRect(5, -31, 7, 5);
    c.fillStyle = '#3d4b46';
    c.beginPath();
    c.moveTo(-43, -38);
    c.lineTo(-66, -24);
    c.lineTo(-61, 35);
    c.lineTo(-40, 49);
    c.lineTo(-30, 8);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(25, -5);
    c.lineTo(48, 16);
    c.lineTo(37, 31);
    c.stroke();
    c.restore();
  }
}
