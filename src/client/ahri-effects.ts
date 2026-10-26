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
    c.fillStyle = '#080c0e80';
    c.beginPath();
    c.ellipse(0, 12, 54, 60, 0, 0, Math.PI * 2);
    c.fill();
    c.rotate(p.facing + Math.PI / 2);

    // Compact, tapered tails use the arena's muted palette and fine outlines.
    for (let i = 0; i < 9; i++) {
      c.save();
      c.rotate((i - 4) * 0.25 + Math.sin(now * 2 + i * 0.45) * 0.025);
      const tip = 90 - Math.abs(i - 4) * 3;
      c.fillStyle = i % 2 ? '#566362' : '#677571';
      c.strokeStyle = color + '80';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-5, 22);
      c.quadraticCurveTo(-17, 52, -8, tip - 17);
      c.lineTo(0, tip);
      c.quadraticCurveTo(17, tip - 26, 7, 31);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#aab7a4';
      c.beginPath();
      c.moveTo(-8, tip - 17);
      c.lineTo(0, tip);
      c.lineTo(7, tip - 20);
      c.lineTo(0, tip - 13);
      c.closePath();
      c.fill();
      c.restore();
    }

    // Angular coat and sleeves share Zed's scale and Singed's heavy silhouettes.
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    c.fillStyle = '#34323c';
    c.beginPath();
    c.moveTo(0, -35);
    c.lineTo(27, -18);
    c.lineTo(31, 9);
    c.lineTo(39, 39);
    c.lineTo(13, 52);
    c.lineTo(0, 38);
    c.lineTo(-13, 52);
    c.lineTo(-39, 39);
    c.lineTo(-31, 9);
    c.lineTo(-27, -18);
    c.closePath();
    c.fill();
    c.stroke();
    for (const side of [-1, 1]) {
      c.fillStyle = '#41454a';
      c.beginPath();
      c.moveTo(side * 24, -20);
      c.lineTo(side * 43, -8);
      c.lineTo(side * 47, 22);
      c.lineTo(side * 30, 13);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.fillStyle = '#aab7a4';
    c.beginPath();
    c.moveTo(-18, -17);
    c.lineTo(4, 14);
    c.lineTo(16, -17);
    c.lineTo(0, -6);
    c.closePath();
    c.fill();
    c.fillStyle = '#795254';
    c.fillRect(-23, 14, 46, 8);
    c.fillStyle = color;
    c.fillRect(-4, 14, 8, 8);

    // Dark hair frames a small face and short fox ears.
    c.fillStyle = '#172326';
    c.beginPath();
    c.moveTo(-23, -34);
    c.lineTo(-16, -51);
    c.lineTo(16, -51);
    c.lineTo(23, -34);
    c.lineTo(26, -3);
    c.lineTo(12, -12);
    c.lineTo(-12, -12);
    c.lineTo(-26, -3);
    c.closePath();
    c.fill();
    c.stroke();
    for (const side of [-1, 1]) {
      c.fillStyle = '#566362';
      c.beginPath();
      c.moveTo(side * 8, -45);
      c.lineTo(side * 23, -63);
      c.lineTo(side * 24, -36);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.fillStyle = '#c0b49c';
    c.beginPath();
    c.moveTo(-13, -34);
    c.lineTo(0, -40);
    c.lineTo(13, -34);
    c.lineTo(10, -19);
    c.lineTo(0, -12);
    c.lineTo(-10, -19);
    c.closePath();
    c.fill();
    c.strokeStyle = '#263132';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-10, -29);
    c.lineTo(-3, -26);
    c.moveTo(10, -29);
    c.lineTo(3, -26);
    c.stroke();

    // A restrained orb is the main bright accent, like the other champions' weapons.
    c.fillStyle = '#91c9c9';
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(46, -17, 12, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#daebe0';
    c.beginPath();
    c.arc(43, -20, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#91e5ed';
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
        c.arc(0, 0, 103, i * 2.1, i * 2.1 + 1.4);
        c.stroke();
      }
    }
    c.restore();
  }
}
