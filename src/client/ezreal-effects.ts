import { EZREAL_PASSIVE as P, EZREAL_SPELLS as S } from '../shared/ezreal-balance';
import { clamp } from '../shared/geometry';
import { visible } from '../shared/visibility';
import type { GameState, PlayerState, Vec } from '../shared/types';

// Original geometric art: blond hair, explorer's jacket and a luminous brass gauntlet.
export class EzrealEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  spells(state: GameState, now: number, colors: string[]) {
    const c = this.c;
    for (const m of state.ezrealMissiles) {
      c.save();
      c.translate(m.pos.x, m.pos.y);
      c.rotate(Math.atan2(m.velocity.y, m.velocity.x));
      c.strokeStyle = colors[m.owner];
      c.fillStyle = m.kind === 'w' ? '#d8bd79' : '#91dce6';
      c.lineWidth = 3;
      c.shadowColor = c.fillStyle;
      c.shadowBlur = 12;
      c.beginPath();
      if (m.kind === 'r') {
        c.moveTo(-42, -S.r.width / 2);
        c.quadraticCurveTo(82, 0, -42, S.r.width / 2);
        c.quadraticCurveTo(8, 0, -42, -S.r.width / 2);
      } else if (m.kind === 'w') {
        c.ellipse(0, 0, 22, 40, 0, 0, Math.PI * 2);
      } else {
        const size = m.kind === 'q' ? 28 : 15;
        c.moveTo(size, 0);
        c.lineTo(-size, size / 2);
        c.lineTo(-size * 0.5, 0);
        c.lineTo(-size, -size / 2);
      }
      c.closePath();
      if (m.kind !== 'w') c.fill();
      c.stroke();
      c.shadowBlur = 0;
      c.globalAlpha = 0.45;
      c.beginPath();
      c.moveTo(-35, 0);
      c.lineTo(m.kind === 'r' ? -150 : -90, 0);
      c.stroke();
      c.restore();
    }
    for (const effect of state.effects) {
      if (effect.kind !== 'ezreal-flux' || !visible(state.players[1 - effect.owner], now)) continue;
      const age = now - effect.at;
      if (age < 0 || age > 0.5) continue;
      c.save();
      c.translate(effect.pos.x, effect.pos.y);
      c.globalAlpha = 1 - age / 0.5;
      c.strokeStyle = '#e0c887';
      c.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        c.rotate(Math.PI / 4);
        c.beginPath();
        c.moveTo(55 + age * 100, 0);
        c.lineTo(80 + age * 150, 0);
        c.stroke();
      }
      c.restore();
    }
  }

  mark(p: PlayerState, pos: Vec, now: number, color: string) {
    if (!p.flux || p.flux.expires <= now) return;
    const c = this.c;
    c.save();
    c.translate(pos.x, pos.y);
    c.rotate(now * 0.8);
    c.strokeStyle = '#d8bd79';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 88, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = color;
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.strokeRect(82, -6, 12, 12);
    }
    c.restore();
  }

  body(p: PlayerState, pos: Vec, now: number, color: string) {
    const c = this.c,
      kit = p.ezreal!;
    c.save();
    c.translate(pos.x, pos.y);
    c.globalAlpha = p.hp <= 0 ? 0.2 : 1;
    c.fillStyle = '#080c0e80';
    c.beginPath();
    c.ellipse(0, 12, 49, 57, 0, 0, Math.PI * 2);
    c.fill();
    c.rotate(p.facing + Math.PI / 2);
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    const shape = (points: number[][], fill: string) => {
      c.fillStyle = fill;
      c.beginPath();
      points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fill();
      c.stroke();
    };
    // Boots and a short, split explorer's jacket.
    shape(
      [
        [-22, 22],
        [-4, 24],
        [-7, 51],
        [-27, 49],
      ],
      '#293135',
    );
    shape(
      [
        [4, 24],
        [22, 22],
        [27, 49],
        [7, 51],
      ],
      '#293135',
    );
    shape(
      [
        [-25, -24],
        [24, -24],
        [33, 28],
        [17, 40],
        [0, 28],
        [-18, 40],
        [-33, 28],
      ],
      '#625044',
    );
    shape(
      [
        [-13, -24],
        [13, -24],
        [10, 22],
        [-10, 22],
      ],
      '#33494d',
    );
    c.fillStyle = '#998365';
    c.fillRect(-28, 19, 56, 7);
    // Cross-body satchel strap and scarf, kept in the roster's muted palette.
    c.strokeStyle = '#b39a70';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(19, -21);
    c.lineTo(-18, 23);
    c.stroke();
    c.strokeStyle = color;
    c.lineWidth = 2;
    shape(
      [
        [-16, -25],
        [17, -24],
        [11, -11],
        [-6, -14],
        [-22, 7],
      ],
      '#a89a78',
    );
    shape(
      [
        [-24, -22],
        [-40, -10],
        [-36, 16],
        [-23, 9],
      ],
      '#716151',
    );
    shape(
      [
        [24, -22],
        [42, -12],
        [42, 14],
        [26, 8],
      ],
      '#716151',
    );
    // Asymmetric gauntlet with a cyan crystal.
    shape(
      [
        [-43, -21],
        [-25, -25],
        [-20, -1],
        [-29, 14],
        [-47, 5],
      ],
      '#a18c58',
    );
    c.fillStyle = '#a1e7ea';
    c.shadowColor = '#91dce6';
    c.shadowBlur = 6 + kit.stacks * 2;
    c.beginPath();
    c.arc(-34, -7, 8, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    // Face, angular blond fringe and goggles resting above the eyes.
    shape(
      [
        [-15, -42],
        [15, -42],
        [13, -23],
        [0, -16],
        [-13, -23],
      ],
      '#c2ad8e',
    );
    shape(
      [
        [-21, -33],
        [-23, -48],
        [-10, -58],
        [-6, -51],
        [8, -61],
        [11, -52],
        [24, -48],
        [19, -31],
        [8, -39],
        [-3, -31],
        [-10, -40],
      ],
      '#b7a46c',
    );
    c.strokeStyle = '#4d514c';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-17, -44);
    c.lineTo(17, -44);
    c.stroke();
    c.fillStyle = '#7eafb5';
    c.fillRect(-14, -48, 10, 7);
    c.fillRect(4, -48, 10, 7);
    c.strokeStyle = '#25383c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-9, -29);
    c.lineTo(-3, -29);
    c.moveTo(3, -29);
    c.lineTo(9, -29);
    c.stroke();
    // Five small arcs expose the passive without obscuring the health bar.
    c.strokeStyle = '#91dce6';
    c.lineWidth = 3;
    for (let i = 0; i < (kit.stacksUntil > now ? kit.stacks : 0); i++) {
      c.beginPath();
      c.arc(0, 0, 68, 0.3 + i * 0.56, 0.68 + i * 0.56);
      c.stroke();
    }
    if (kit.casting?.key === 'r' && kit.casting.until > now && p.castUntil === kit.casting.until) {
      const progress = clamp(1 - (kit.casting.until - now) / S.r.cast, 0, 1);
      c.strokeStyle = '#d8bd79';
      c.lineWidth = 3 + progress * 4;
      c.beginPath();
      c.arc(0, -20, 75 + progress * 20, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
    }
    c.restore();
    if (kit.stacksUntil > now) {
      c.fillStyle = '#91dce680';
      c.fillRect(pos.x - 78, pos.y - 97, 156 * clamp((kit.stacksUntil - now) / P.duration, 0, 1), 3);
    }
  }
}
