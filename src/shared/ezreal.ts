import { EZREAL_PASSIVE as P, EZREAL_SPELLS as S } from './ezreal-balance';
import { championStats } from './champions';
import { bounded, direction, distance, segmentDistance, towards } from './geometry';
import { visible } from './visibility';
import { blockedByWindWall } from './wind-wall';
import type { SpellKey } from './balance';
import type { Effect, EzrealMissile, GameState, PlayerId, PlayerState, Vec } from './types';

interface Combat {
  state: () => GameState;
  schedule: (delay: number, run: () => void) => void;
  damage: (owner: PlayerId, target: PlayerState, raw: number, type: 'magic' | 'physical') => void;
  effect: (kind: Effect['kind'], pos: Vec, owner: PlayerId) => void;
  grounded: (p: PlayerState) => boolean;
}

export class EzrealKit {
  private serial = 0;
  constructor(private combat: Combat) {}

  reset() {
    this.serial = 0;
  }

  private stack(p: PlayerState) {
    const now = this.combat.state().time,
      kit = p.ezreal!;
    kit.stacks = Math.min(P.stacks, (kit.stacksUntil > now ? kit.stacks : 0) + 1);
    kit.stacksUntil = now + P.duration;
  }

  // Called only for a connecting attack or damaging ability; W application does not detonate itself.
  detonate(p: PlayerState, target: PlayerState) {
    if (target.flux?.owner !== p.id || target.flux.expires <= this.combat.state().time) return;
    target.flux = null;
    this.combat.damage(p.id, target, S.w.damage, 'magic');
    this.stack(p);
    this.combat.effect('ezreal-flux', target.pos, p.id);
  }

  cast(p: PlayerState, key: Exclude<SpellKey, 'd'>, point: Vec) {
    const now = this.combat.state().time,
      spell = S[key],
      stamp = now + spell.cast;
    const aim = { ...point },
      origin = { ...p.pos };
    p.cooldowns[key] = now + spell.cooldown;
    p.castUntil = stamp;
    p.windupUntil = 0;
    p.facing = Math.atan2(aim.y - p.pos.y, aim.x - p.pos.x);
    p.ezreal!.casting = { key, until: stamp };
    this.combat.schedule(spell.cast, () => {
      p.ezreal!.casting = null;
      if (p.hp <= 0 || p.castUntil !== stamp || p.airborne || p.charm) return;
      if (key === 'e') {
        const state = this.combat.state();
        if (p.rootUntil > state.time || this.combat.grounded(p)) return;
        this.combat.effect('blink', p.pos, p.id);
        p.pos = bounded(towards(p.pos, aim, S.e.range));
        p.destination = null;
        p.attackMove = null;
        this.combat.effect('blink', p.pos, p.id);
        const enemy = state.players[1 - p.id];
        if (
          enemy.hp > 0 &&
          enemy.untargetableUntil <= state.time &&
          visible(enemy, state.time) &&
          distance(p.pos, enemy.pos) <= S.e.boltRange + championStats(enemy.champion).radius
        )
          this.missile(p, key, enemy.pos, p.pos);
      } else {
        // R keeps its windup origin; Q/W originate at the current position after Flash.
        this.missile(p, key, aim, key === 'r' ? origin : p.pos);
      }
    });
    return true;
  }

  private missile(p: PlayerState, kind: EzrealMissile['kind'], aim: Vec, origin: Vec) {
    const velocity = direction(origin, aim);
    if (!velocity.x && !velocity.y) {
      velocity.x = Math.cos(p.facing);
      velocity.y = Math.sin(p.facing);
    }
    this.combat.state().ezrealMissiles.push({
      id: ++this.serial,
      owner: p.id,
      kind,
      pos: { ...origin },
      velocity,
      remaining: kind === 'e' ? S.e.boltRange * 2 : S[kind].range,
      hit: false,
      expires: this.combat.state().time + 3,
    });
  }

  update(dt: number) {
    const state = this.combat.state(),
      now = state.time;
    for (const p of state.players) {
      if (p.flux && p.flux.expires <= now) p.flux = null;
      if (p.ezreal) {
        if (p.ezreal.stacksUntil <= now) p.ezreal.stacks = 0;
        if (p.ezreal.casting && (p.castUntil <= now || p.castUntil !== p.ezreal.casting.until))
          p.ezreal.casting = null;
      }
    }
    state.ezrealMissiles = state.ezrealMissiles.filter((m) => {
      const p = state.players[m.owner],
        enemy = state.players[1 - m.owner],
        spell = S[m.kind];
      if (now >= m.expires) return false;
      if (m.kind === 'e') {
        if (enemy.hp <= 0 || enemy.untargetableUntil > now || !visible(enemy, now)) return false;
        m.velocity = direction(m.pos, enemy.pos);
      }
      const from = { ...m.pos },
        travel = Math.min(m.remaining, spell.speed * dt);
      m.pos = { x: from.x + m.velocity.x * travel, y: from.y + m.velocity.y * travel };
      m.remaining -= travel;
      if (blockedByWindWall(state, m.owner, from, m.pos, spell.width / 2)) return false;
      const hit =
        !m.hit &&
        enemy.hp > 0 &&
        enemy.untargetableUntil <= now &&
        segmentDistance(enemy.pos, from, m.pos) <= spell.width / 2 + championStats(enemy.champion).radius;
      if (hit) {
        m.hit = true;
        if (m.kind === 'w') {
          enemy.flux = { owner: m.owner, expires: now + S.w.duration };
        } else {
          this.detonate(p, enemy);
          this.combat.damage(m.owner, enemy, spell.damage, m.kind === 'q' ? 'physical' : 'magic');
          this.stack(p);
          if (m.kind === 'q') {
            for (const key of ['q', 'w', 'e', 'r'] as const)
              p.cooldowns[key] = Math.max(now, p.cooldowns[key] - S.q.refund);
          }
        }
        if (m.kind !== 'r') return false;
      }
      return m.remaining > 0;
    });
  }
}
