import type { GameState, PlayerState, Vec } from '../shared/types';

// Original geometric artwork; the orb, heart and tails also distinguish spell types by shape.
export class AhriEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  private heart(x: number, y: number, size: number) {
    const c = this.c;
    c.beginPath();
    c.moveTo(x, y + size);
    c.bezierCurveTo(x - size * 2, y, x - size, y - size * 1.5, x, y - size * 0.5);
    c.bezierCurveTo(x + size, y - size * 1.5, x + size * 2, y, x, y + size);
    c.fill();
  }

  missiles(state: GameState, colors: string[]) {
    const c = this.c;
    for (const m of state.ahriMissiles) {
      c.save();
      c.translate(m.pos.x, m.pos.y);
      c.strokeStyle = colors[m.owner];
      c.lineWidth = 3;
      c.fillStyle = m.kind === 'charm' ? '#f5a3cc' : m.returning ? '#f4dca0' : '#91e5ed';
      c.shadowColor = c.fillStyle;
      c.shadowBlur = 15;
      if (m.kind === 'charm') this.heart(0, 0, 25);
      else {
        c.beginPath();
        c.arc(0, 0, m.kind === 'orb' ? 31 : 15, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.shadowBlur = 0;
      c.beginPath();
      c.moveTo(-m.velocity.x * 35, -m.velocity.y * 35);
      c.lineTo(-m.velocity.x * 85, -m.velocity.y * 85);
      c.stroke();
      c.restore();
    }
  }

  charm(pos: Vec) {
    this.c.save();
    this.c.fillStyle = '#f5a3cc';
    this.heart(pos.x, pos.y - 145, 18);
    this.c.restore();
  }

  body(p: PlayerState, pos: Vec, now: number, color: string) {
    const c = this.c,
      kit = p.ahri!;
    c.save();
    c.translate(pos.x, pos.y);
    c.globalAlpha = p.hp <= 0 ? 0.2 : 1;
    c.rotate(p.facing + Math.PI / 2);
    c.lineWidth = 2;
    c.strokeStyle = color;
    // Nine fanned tails behind the fox silhouette.
    for (let i = 0; i < 9; i++) {
      c.save();
      c.rotate((i - 4) * 0.24 + Math.sin(now * 2 + i) * 0.04);
      c.fillStyle = i % 2 ? '#d8d5ec' : '#a9a7cf';
      c.beginPath();
      c.moveTo(0, 15);
      c.bezierCurveTo(-28, 45, -27, 90, 0, 111);
      c.bezierCurveTo(27, 90, 28, 45, 0, 15);
      c.fill();
      c.stroke();
      c.restore();
    }
    c.fillStyle = '#673452';
    c.beginPath();
    c.moveTo(-22, -25);
    c.lineTo(22, -25);
    c.lineTo(34, 42);
    c.lineTo(-34, 42);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ead5c6';
    c.beginPath();
    c.arc(0, -32, 21, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d8d5ec';
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 5, -48);
      c.lineTo(side * 22, -70);
      c.lineTo(side * 25, -37);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.fillStyle = '#91e5ed';
    c.beginPath();
    c.arc(43, -20, 15, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < kit.fires; i++) {
      const angle = now * 3 + (i * Math.PI * 2) / 3;
      c.beginPath();
      c.arc(Math.cos(angle) * 85, Math.sin(angle) * 85, 10, 0, Math.PI * 2);
      c.fill();
    }
    if (kit.rushUntil > now) {
      c.strokeStyle = '#91e5ed';
      c.lineWidth = 4;
      for (let i = 0; i < kit.rushCharges; i++) {
        c.beginPath();
        c.arc(0, 0, 120, i * 2.1, i * 2.1 + 1.4);
        c.stroke();
      }
    }
    c.restore();
  }
}
