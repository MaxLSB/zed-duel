import { YASUO_PASSIVE as P, YASUO_SPELLS as S } from '../shared/yasuo-balance';
import { visible } from '../shared/visibility';
import type { GameState, PlayerId, PlayerState, Vec } from '../shared/types';

// Original geometric artwork matching the roster's scale and team outlines.
export class YasuoEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  spells(state: GameState, now: number, colors: string[]) {
    const c = this.c;
    c.save();
    for (const wall of state.windWalls) {
      c.strokeStyle = '#b8e4e7';
      c.lineWidth = 14;
      c.globalAlpha = Math.min(0.7, Math.max(0, wall.expires - now));
      c.beginPath();
      c.moveTo(wall.from.x, wall.from.y);
      c.lineTo(wall.to.x, wall.to.y);
      c.stroke();
      c.strokeStyle = colors[wall.owner];
      c.lineWidth = 3;
      c.setLineDash([26, 15]);
      c.lineDashOffset = -now * 100;
      c.stroke();
      c.setLineDash([]);
      const dx = wall.to.x - wall.from.x,
        dy = wall.to.y - wall.from.y;
      const len = Math.hypot(dx, dy);
      for (let i = 0; i < 7; i++) {
        const t = (i / 7 + now * 0.6) % 1;
        const x = wall.from.x + dx * t,
          y = wall.from.y + dy * t;
        c.beginPath();
        c.moveTo(x + (dy / len) * 22, y - (dx / len) * 22);
        c.quadraticCurveTo(x, y, x - (dy / len) * 22, y + (dx / len) * 22);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    for (const m of state.tornadoes) {
      c.save();
      c.translate(m.pos.x, m.pos.y);
      c.rotate(now * 10);
      c.strokeStyle = colors[m.owner];
      c.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(0, 0, 30 + i * 22, i * 1.8, i * 1.8 + Math.PI * 1.4);
        c.stroke();
      }
      c.fillStyle = '#c9e5e455';
      c.beginPath();
      c.arc(0, 0, 26, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    // Three brief cuts follow the suspended opponent throughout Last Breath.
    for (const owner of state.players) {
      const until = owner.yasuo?.ultimateUntil ?? 0;
      const target = state.players[1 - owner.id];
      if (until <= now || owner.hp <= 0 || target.hp <= 0 || target.airborne?.owner !== owner.id) continue;
      const progress = Math.max(0, 1 - (until - now) / S.r.duration);
      const pulse = (progress * 3) % 1;
      const side = Math.floor(progress * 3) % 2 ? -1 : 1;
      const height = Math.sin(progress * Math.PI) * 100;
      c.save();
      c.translate(target.pos.x, target.pos.y - height);
      c.globalAlpha = Math.sin(pulse * Math.PI) * 0.85;
      c.strokeStyle = '#d1eded';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-55, -side * 35);
      c.quadraticCurveTo(0, -side * 12, 55, side * 35);
      c.stroke();
      c.strokeStyle = colors[owner.id];
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(0, 12, 68, 22, side * 0.3, progress * 8, progress * 8 + Math.PI);
      c.stroke();
      c.restore();
    }
    for (const effect of state.effects) {
      if (!['tempest', 'wind-slash', 'last-breath'].includes(effect.kind)) continue;
      const age = now - effect.at;
      if (age < 0 || age > 0.5) continue;
      c.globalAlpha = 1 - age / 0.5;
      c.strokeStyle = '#d1eded';
      c.lineWidth = 5;
      const p = effect.pos;
      c.beginPath();
      if (effect.kind === 'tempest' && effect.from) {
        c.moveTo(effect.from.x, effect.from.y);
        c.lineTo(p.x, p.y);
      } else if (effect.kind === 'wind-slash') {
        c.arc(p.x, p.y, S.q.radius * (0.6 + age), age * 12, age * 12 + Math.PI * 1.8);
      } else {
        const cut = 20 + Math.min(1, age / 0.18) * 45;
        c.lineWidth = 3;
        c.moveTo(p.x - cut, p.y - cut * 0.65);
        c.lineTo(p.x + cut, p.y + cut * 0.65);
        c.moveTo(p.x + cut, p.y - cut * 0.65);
        c.lineTo(p.x - cut, p.y + cut * 0.65);
      }
      c.stroke();
    }
    c.restore();
  }

  body(p: PlayerState, pos: Vec, now: number, color: string) {
    const c = this.c,
      kit = p.yasuo!;
    c.save();
    const finishing = kit.ultimateUntil > now;
    const progress = finishing ? Math.max(0, 1 - (kit.ultimateUntil - now) / S.r.duration) : 0;
    c.translate(pos.x, pos.y - Math.sin(progress * Math.PI) * 28);
    c.globalAlpha = p.hp <= 0 ? 0.2 : 1;
    c.fillStyle = '#080c0e80';
    c.beginPath();
    c.ellipse(0, 12, 54, 60, 0, 0, Math.PI * 2);
    c.fill();
    if (kit.shield > 0 && kit.shieldUntil > now) {
      c.fillStyle = '#a3dfe425';
      c.strokeStyle = '#d1eeee';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 82, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    if (kit.stacks === 2 && kit.stacksUntil > now) {
      c.strokeStyle = '#c0e9e6';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 87, now * 5, now * 5 + Math.PI * 1.5);
      c.stroke();
    }
    c.rotate(p.facing + Math.PI / 2 + Math.sin(progress * Math.PI * 6) * 0.12);
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    // Wide hakama, bare sword arm, blue shoulder scarf, high tied hair and katana.
    c.fillStyle = '#343b40';
    c.beginPath();
    c.moveTo(-24, 5);
    c.lineTo(23, 5);
    c.lineTo(39, 61);
    c.lineTo(5, 57);
    c.lineTo(0, 32);
    c.lineTo(-9, 61);
    c.lineTo(-40, 55);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#a28c78';
    c.beginPath();
    c.moveTo(-24, -30);
    c.lineTo(20, -27);
    c.lineTo(31, 8);
    c.lineTo(-23, 13);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#3e667b';
    c.beginPath();
    c.moveTo(-33, -37);
    c.lineTo(6, -32);
    c.lineTo(-4, -5);
    c.lineTo(-35, 4);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(-27, -21);
    c.lineTo(-48, 32);
    c.lineTo(-67 - Math.sin(now * 5) * 7, 63);
    c.lineTo(-45, 51);
    c.lineTo(-12, -12);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#bdab94';
    c.beginPath();
    c.ellipse(0, -39, 17, 20, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#222c31';
    c.beginPath();
    c.arc(0, -49, 19, Math.PI, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-9, -53);
    c.quadraticCurveTo(-36, -90, 9, -94);
    c.quadraticCurveTo(31, -64, 7, -55);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = '#ac986c';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(-23, 13);
    c.lineTo(25, 13);
    c.stroke();
    c.strokeStyle = '#b6a28b';
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(24, -22);
    c.lineTo(40, -1);
    c.stroke();
    c.strokeStyle = '#a48c61';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(38, 19);
    c.lineTo(43, -8);
    c.stroke();
    c.strokeStyle = '#d7e1df';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(43, -8);
    c.quadraticCurveTo(53, -52, 41, -97);
    c.stroke();
    c.strokeStyle = '#a48c61';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(31, -8);
    c.lineTo(54, -5);
    c.stroke();
    c.restore();
  }

  targetCooldown(state: GameState, viewer: PlayerId, pos: Vec, now: number) {
    const owner = state.players[viewer],
      target = state.players[1 - viewer];
    const remaining = (owner.yasuo?.dashTargetUntil ?? 0) - now;
    if (
      !owner.yasuo ||
      remaining <= 0 ||
      owner.hp <= 0 ||
      target.hp <= 0 ||
      target.untargetableUntil > now ||
      !visible(target, now)
    )
      return;
    const c = this.c;
    c.save();
    c.translate(pos.x, pos.y);
    c.strokeStyle = '#8fb7bf35';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 84, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#a9cbd1';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 84, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, remaining / S.e.lockout));
    c.stroke();
    c.restore();
  }

  flow(p: PlayerState, pos: Vec) {
    const c = this.c;
    c.fillStyle = '#111e23';
    c.fillRect(pos.x - 78, pos.y - 98, 156, 5);
    c.fillStyle = p.yasuo!.flow >= P.maxFlow ? '#def7ee' : '#80b8c8';
    c.fillRect(pos.x - 78, pos.y - 98, (156 * p.yasuo!.flow) / P.maxFlow, 5);
  }
}
