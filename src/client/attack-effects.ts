import { visible } from '../shared/visibility';
import { championStats } from '../shared/champions';
import { clamp, direction, lerp } from '../shared/geometry';
import type { Effect, PlayerState, Vec } from '../shared/types';

const FOLLOW_THROUGH = 0.18;

export function attackWindup(p: PlayerState, now: number): number | null {
  if (
    p.hp <= 0 ||
    p.airborne ||
    p.ultimate ||
    p.ahri?.dash ||
    p.leblanc?.dash ||
    (p.charm && p.charm.until > now) ||
    p.castUntil > now ||
    p.windupUntil <= now
  )
    return null;
  const stats = championStats(p.champion);
  return clamp(1 - (p.windupUntil - now) / (stats.windup / stats.attackSpeed), 0, 1);
}

export class AttackEffects {
  constructor(private c: CanvasRenderingContext2D) {}

  pose(p: PlayerState, pos: Vec, effects: Effect[], now: number) {
    const result = { pos, facing: p.facing };
    if (
      p.hp <= 0 ||
      p.airborne ||
      p.ultimate ||
      p.ahri?.dash ||
      p.leblanc?.dash ||
      (p.charm && p.charm.until > now) ||
      p.castUntil > now
    )
      return result;
    const windup = attackWindup(p, now);
    let lean = windup === null ? 0 : -4 * Math.sin(windup * Math.PI);
    let turn = windup === null ? 0 : -0.1 * Math.sin(windup * Math.PI);
    const impact = effects
      .filter(
        (e) =>
          e.kind === 'attack' && e.owner === p.id && e.from && now >= e.at && now - e.at < FOLLOW_THROUGH,
      )
      .at(-1);
    if (impact) {
      const weight = 1 - (now - impact.at) / FOLLOW_THROUGH;
      lean = (p.champion === 'singed' ? 12 : p.champion === 'zed' ? 9 : 5) * weight;
      turn = (p.champion === 'zed' ? 0.16 : 0.08) * weight;
    }
    return {
      pos: { x: pos.x + Math.cos(p.facing) * lean, y: pos.y + Math.sin(p.facing) * lean },
      facing: p.facing + turn,
    };
  }

  windup(p: PlayerState, from: Vec, target: PlayerState, to: Vec, now: number, color: string) {
    const progress = attackWindup(p, now);
    if (
      progress === null ||
      (p.champion !== 'ahri' && p.champion !== 'leblanc') ||
      target.hp <= 0 ||
      target.untargetableUntil > now ||
      !visible(target, now)
    )
      return;
    const aim = direction(from, to);
    const hand = { x: from.x + aim.x * 17 - aim.y * 46, y: from.y + aim.y * 17 + aim.x * 46 };
    // Cosmetic travel occupies the windup and reaches the target at damage time.
    const travel = clamp((progress - 0.12) / 0.88, 0, 1);
    const tip = lerp(hand, to, travel);
    const tail = lerp(hand, to, Math.max(0, travel - 0.1));
    const c = this.c;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.globalAlpha = 0.7;
    c.beginPath();
    c.moveTo(tail.x, tail.y);
    c.lineTo(tip.x, tip.y);
    c.stroke();
    c.globalAlpha = 1;
    c.translate(tip.x, tip.y);
    c.rotate(Math.atan2(aim.y, aim.x));
    c.fillStyle = '#e0eee6';
    c.beginPath();
    c.moveTo(10, 0);
    c.lineTo(0, 6);
    c.lineTo(-9, 0);
    c.lineTo(0, -6);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  impact(effect: Effect, owner: PlayerState, now: number, color: string): boolean {
    if (effect.kind !== 'attack' || !effect.from) return false;
    const age = now - effect.at,
      duration = 0.22;
    if (age < 0 || age > duration) return true;
    const c = this.c,
      progress = age / duration;
    const aim = direction(effect.from, effect.pos);
    const angle = Math.atan2(aim.y, aim.x);
    c.save();
    c.translate(effect.pos.x, effect.pos.y);
    c.rotate(angle);
    c.strokeStyle = color;
    c.lineWidth = 4 * (1 - progress) + 1;
    c.lineCap = 'round';
    c.globalAlpha = 1 - progress;
    if (owner.champion === 'zed') {
      // Two short blade cuts on the side of the opponent facing Zed.
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(-66 + progress * 16, side * 28);
        c.quadraticCurveTo(-28, side * 12, -36 + progress * 16, -side * 25);
        c.stroke();
      }
    } else if (owner.champion === 'singed') {
      c.beginPath();
      c.arc(-25, 0, 35 + progress * 8, Math.PI * 0.65, Math.PI * 1.35);
      c.stroke();
      c.beginPath();
      c.moveTo(-80, 0);
      c.lineTo(-46 + progress * 15, 0);
      c.stroke();
    } else {
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 8 + progress * 18, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        c.beginPath();
        c.moveTo(13 + progress * 8, 0);
        c.lineTo(24 + progress * 12, 0);
        c.stroke();
      }
    }
    c.restore();
    return true;
  }
}
