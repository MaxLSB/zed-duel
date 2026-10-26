import { visible } from '../shared/visibility';
import { LEBLANC_SPELLS as S } from '../shared/leblanc-balance';
import type { GameState, PlayerId, PlayerState, Vec } from '../shared/types';

// Original Canvas geometry, using the same scale, muted fills and team outlines as the roster.
export class LeblancEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  private diamond(x: number, y: number, radius: number) {
    const c = this.c;
    c.beginPath();
    c.moveTo(x, y - radius);
    c.lineTo(x + radius * 0.65, y);
    c.lineTo(x, y + radius);
    c.lineTo(x - radius * 0.65, y);
    c.closePath();
    c.fill();
    c.stroke();
  }

  ground(state: GameState, now: number, colors: string[]) {
    const c = this.c;
    c.save();
    for (const p of state.players) {
      if (!p.leblanc) continue;
      for (const key of ['w', 'r'] as const) {
        const pad = p.leblanc.returns[key];
        if (!pad || pad.expires <= now) continue;
        c.strokeStyle = key === 'r' ? '#cbb78b' : '#a997c4';
        c.fillStyle = '#74618522';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(pad.pos.x, pad.pos.y, 68, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.strokeStyle = colors[p.id];
        c.lineWidth = 4;
        c.beginPath();
        c.arc(
          pad.pos.x,
          pad.pos.y,
          78,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.max(0, (pad.expires - now) / S.w.duration),
        );
        c.stroke();
      }
    }
    for (const effect of state.effects) {
      if (effect.kind !== 'distortion') continue;
      const age = now - effect.at;
      if (age < 0 || age > 0.45) continue;
      c.globalAlpha = 1 - age / 0.45;
      c.strokeStyle = colors[effect.owner];
      c.fillStyle = '#a997c422';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(effect.pos.x, effect.pos.y, S.w.radius * (0.55 + age), 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.globalAlpha = 1;
    }
    c.restore();
  }

  spells(state: GameState, now: number, colors: string[], viewer: PlayerId) {
    const c = this.c;
    c.save();
    for (const chain of state.chains) {
      const from = state.players[chain.owner].pos,
        to = state.players[chain.target].pos;
      c.strokeStyle = chain.mimic ? '#d1b77c' : '#b39dc8';
      c.lineWidth = 4;
      c.setLineDash([12, 7]);
      c.lineDashOffset = -now * 35;
      c.beginPath();
      c.moveTo(from.x, from.y);
      c.lineTo(to.x, to.y);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(
        to.x,
        to.y,
        85,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, (now - chain.started) / S.e.delay),
      );
      c.stroke();
    }
    for (const m of state.leblancMissiles) {
      c.fillStyle = m.mimic ? '#cfb580' : '#b49acb';
      c.strokeStyle = colors[m.owner];
      c.lineWidth = 2;
      if (m.kind === 'chain') {
        c.beginPath();
        c.moveTo(m.pos.x - m.velocity.x * 80, m.pos.y - m.velocity.y * 80);
        c.lineTo(m.pos.x, m.pos.y);
        c.stroke();
      }
      this.diamond(m.pos.x, m.pos.y, m.kind === 'sigil' ? 25 : 18);
    }
    for (const p of state.players) {
      if (p.id !== viewer && !visible(p, now)) continue;
      for (const mark of p.sigils) {
        c.fillStyle = '#29232f';
        c.strokeStyle = mark.mimic ? '#cfb580' : '#b49acb';
        c.lineWidth = 3;
        this.diamond(p.pos.x, p.pos.y - 143, 19);
        c.beginPath();
        c.arc(
          p.pos.x,
          p.pos.y - 143,
          27,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.max(0, (mark.expires - now) / S.q.duration),
        );
        c.stroke();
      }
    }
    c.restore();
  }

  clones(state: GameState, now: number, colors: string[], viewer: PlayerId) {
    for (const p of state.players) {
      const clone = p.leblanc?.clone;
      if (!clone || clone.expires <= now || clone.appears > now) continue;
      this.body({ ...p, facing: clone.facing }, clone.pos, now, colors[p.id], p.id === viewer ? 0.4 : 0.75);
    }
  }

  body(p: PlayerState, pos: Vec, now: number, color: string, opacity = 1) {
    const c = this.c;
    c.save();
    c.translate(pos.x, pos.y);
    c.globalAlpha = (p.hp <= 0 ? 0.2 : p.leblanc!.invisibleUntil > now ? 0.3 : 1) * opacity;
    c.fillStyle = '#080c0e80';
    c.beginPath();
    c.ellipse(0, 12, 54, 60, 0, 0, Math.PI * 2);
    c.fill();
    c.rotate(p.facing + Math.PI / 2);
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    // Split angular cloak and high collar echo Zed's shoulder silhouette.
    c.fillStyle = '#403744';
    c.beginPath();
    c.moveTo(0, -29);
    c.lineTo(34, -32);
    c.lineTo(30, 1);
    c.lineTo(49, 57 + Math.sin(now * 3) * 3);
    c.lineTo(14, 49);
    c.lineTo(0, 66);
    c.lineTo(-14, 49);
    c.lineTo(-49, 57 - Math.sin(now * 3) * 3);
    c.lineTo(-30, 1);
    c.lineTo(-34, -32);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#20282c';
    c.beginPath();
    c.moveTo(-19, -20);
    c.lineTo(19, -20);
    c.lineTo(24, 31);
    c.lineTo(0, 46);
    c.lineTo(-24, 31);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = '#b3a17d';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-19, -18);
    c.lineTo(0, 12);
    c.lineTo(19, -18);
    c.moveTo(-22, 23);
    c.lineTo(22, 23);
    c.stroke();
    c.fillStyle = '#172226';
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-20, -42);
    c.lineTo(0, -52);
    c.lineTo(20, -42);
    c.lineTo(24, -6);
    c.lineTo(-24, -6);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#c2b5aa';
    c.beginPath();
    c.moveTo(-12, -36);
    c.lineTo(12, -36);
    c.lineTo(10, -21);
    c.lineTo(0, -14);
    c.lineTo(-10, -21);
    c.closePath();
    c.fill();
    // Three-point crown, dark eye markings and a restrained amethyst focus.
    c.fillStyle = '#a99a79';
    c.strokeStyle = '#d0bc90';
    c.beginPath();
    c.moveTo(-17, -34);
    c.lineTo(-25, -61);
    c.lineTo(-8, -46);
    c.lineTo(0, -68);
    c.lineTo(8, -46);
    c.lineTo(25, -61);
    c.lineTo(17, -34);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#b49acb';
    c.strokeStyle = color;
    this.diamond(0, -42, 7);
    c.strokeStyle = '#514056';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-9, -29);
    c.lineTo(-4, -23);
    c.moveTo(9, -29);
    c.lineTo(4, -23);
    c.stroke();
    c.strokeStyle = '#ab9a77';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(43, 40);
    c.lineTo(43, -48);
    c.stroke();
    c.lineWidth = 2;
    c.fillStyle = '#88739e';
    this.diamond(43, -49, 19);
    c.strokeStyle = color;
    c.fillStyle = '#4a414d';
    c.beginPath();
    c.moveTo(21, -9);
    c.lineTo(43, 0);
    c.lineTo(43, 13);
    c.lineTo(21, 8);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
