import { YASUO_PASSIVE as P, YASUO_SPELLS as S } from './yasuo-balance';
import { championStats } from './champions';
import { bounded, direction, distance, lerp, segmentDistance } from './geometry';
import { blockedByWindWall } from './wind-wall';
import type { SpellKey } from './balance';
import type { Effect, GameState, PlayerId, PlayerState, Vec } from './types';

interface Combat {
  state: () => GameState;
  schedule: (delay: number, run: () => void) => void;
  damage: (owner: PlayerId, target: PlayerState, raw: number, type: 'physical' | 'magic') => void;
  interrupt: (p: PlayerState) => void;
  effect: (kind: Effect['kind'], pos: Vec, owner: PlayerId, amount?: number, from?: Vec) => void;
}

export class YasuoKit {
  private serial = 0;
  constructor(private combat: Combat) {}
  reset() {
    this.serial = 0;
  }

  moved(p: PlayerState, from: Vec) {
    if (p.yasuo)
      p.yasuo.flow = Math.min(P.maxFlow, p.yasuo.flow + (distance(from, p.pos) / P.distance) * P.maxFlow);
  }

  absorb(p: PlayerState, damage: number) {
    const kit = p.yasuo,
      now = this.combat.state().time;
    if (!kit || damage <= 0) return damage;
    if (kit.flow >= P.maxFlow) {
      kit.flow = 0;
      kit.shield = P.shield;
      kit.shieldUntil = now + P.duration;
      this.combat.effect('passive', p.pos, p.id);
    }
    const absorbed = kit.shieldUntil > now ? Math.min(damage, kit.shield) : 0;
    kit.shield -= absorbed;
    p.stats.yasuo!.shieldAbsorbed += absorbed;
    return damage - absorbed;
  }

  cast(p: PlayerState, key: Exclude<SpellKey, 'd'>, point: Vec) {
    const state = this.combat.state(),
      now = state.time,
      kit = p.yasuo!;
    const enemy = state.players[1 - p.id];
    p.cooldowns[key] = now + S[key].cooldown;
    p.windupUntil = 0;
    const aim = distance(p.pos, point)
      ? direction(p.pos, point)
      : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    p.facing = Math.atan2(aim.y, aim.x);
    if (key === 'q') {
      const tornado = kit.stacks === 2 && kit.stacksUntil > now;
      if (tornado) {
        kit.stacks = 0;
        kit.stacksUntil = 0;
      }
      if (kit.dash) kit.dash.slash = tornado ? 'tornado' : 'normal';
      else {
        const stamp = now + S.q.cast;
        p.castUntil = stamp;
        this.combat.schedule(S.q.cast, () => {
          if (p.hp <= 0 || p.castUntil !== stamp || p.airborne || p.charm) return;
          p.stats.yasuo!.tempestsCast++;
          if (tornado)
            state.tornadoes.push({
              id: ++this.serial,
              owner: p.id,
              pos: { ...p.pos },
              velocity: aim,
              remaining: S.q.tornadoRange,
            });
          else {
            const tip = { x: p.pos.x + aim.x * S.q.range, y: p.pos.y + aim.y * S.q.range };
            this.combat.effect('tempest', tip, p.id, undefined, p.pos);
            if (
              enemy.hp > 0 &&
              enemy.untargetableUntil <= state.time &&
              segmentDistance(enemy.pos, p.pos, tip) <= S.q.width / 2 + championStats(enemy.champion).radius
            )
              this.tempestHit(p, enemy, false);
          }
        });
      }
    }
    if (key === 'w') {
      const center = { x: p.pos.x + aim.x * S.w.range, y: p.pos.y + aim.y * S.w.range };
      state.windWalls.push({
        id: ++this.serial,
        owner: p.id,
        created: now,
        expires: now + S.w.duration,
        from: { x: center.x - (aim.y * S.w.width) / 2, y: center.y + (aim.x * S.w.width) / 2 },
        to: { x: center.x + (aim.y * S.w.width) / 2, y: center.y - (aim.x * S.w.width) / 2 },
      });
    }
    if (key === 'e') {
      const v = distance(p.pos, enemy.pos) ? direction(p.pos, enemy.pos) : aim;
      const to = bounded({ x: p.pos.x + v.x * S.e.range, y: p.pos.y + v.y * S.e.range });
      kit.dash = {
        from: { ...p.pos },
        to,
        started: now,
        ends: now + Math.max(1 / 60, distance(p.pos, to) / S.e.speed),
        hit: false,
        slash: null,
        damage: S.e.damage * (1 + S.e.stackBonus * (kit.dashStacksUntil > now ? kit.dashStacks : 0)),
      };
      kit.dashTargetUntil = now + S.e.lockout;
      p.destination = null;
      p.attackMove = null;
      p.attacking = false;
    }
    if (key === 'r') {
      this.combat.interrupt(p);
      this.combat.interrupt(enemy);
      kit.flow = P.maxFlow;
      kit.stacks = 0;
      kit.stacksUntil = 0;
      const v = direction(p.pos, enemy.pos);
      this.combat.effect('blink', p.pos, p.id);
      p.pos = bounded({ x: enemy.pos.x + v.x * 130, y: enemy.pos.y + v.y * 130 });
      p.facing = Math.atan2(enemy.pos.y - p.pos.y, enemy.pos.x - p.pos.x);
      const stamp = now + S.r.duration;
      kit.ultimateUntil = stamp;
      p.castUntil = stamp;
      enemy.airborne = {
        owner: p.id,
        from: { ...enemy.pos },
        to: { ...enemy.pos },
        started: now,
        ends: stamp,
      };
      this.combat.effect('last-breath', enemy.pos, p.id, undefined, p.pos);
      this.combat.schedule(S.r.duration, () => {
        if (
          p.hp <= 0 ||
          p.castUntil !== stamp ||
          p.airborne ||
          p.charm ||
          enemy.hp <= 0 ||
          enemy.untargetableUntil > state.time
        )
          return;
        p.stats.yasuo!.ultimatesHit++;
        this.combat.damage(p.id, enemy, S.r.damage, 'physical');
        this.combat.effect('last-breath', enemy.pos, p.id, undefined, p.pos);
      });
    }
    return true;
  }

  private tempestHit(p: PlayerState, enemy: PlayerState, tornado: boolean) {
    const now = this.combat.state().time,
      kit = p.yasuo!;
    p.stats.yasuo!.tempestsHit++;
    this.combat.damage(p.id, enemy, S.q.damage, 'physical');
    if (tornado && enemy.hp > 0) {
      p.stats.yasuo!.knockups++;
      this.combat.interrupt(enemy);
      enemy.airborne = {
        owner: p.id,
        from: { ...enemy.pos },
        to: { ...enemy.pos },
        started: now,
        ends: now + S.q.airborne,
      };
    } else if (!tornado) {
      kit.stacks = Math.min(2, (kit.stacksUntil > now ? kit.stacks : 0) + 1);
      kit.stacksUntil = now + S.q.duration;
    }
  }

  moveDash(p: PlayerState) {
    const kit = p.yasuo,
      dash = kit?.dash;
    if (!kit || !dash) return false;
    const state = this.combat.state(),
      now = state.time,
      enemy = state.players[1 - p.id];
    if (p.rootUntil > now) {
      kit.dash = null;
      return false;
    }
    const before = { ...p.pos };
    p.pos = lerp(dash.from, dash.to, Math.min(1, (now - dash.started) / (dash.ends - dash.started)));
    this.moved(p, before);
    if (
      !dash.hit &&
      enemy.hp > 0 &&
      enemy.untargetableUntil <= now &&
      segmentDistance(enemy.pos, before, p.pos) <=
        championStats(enemy.champion).radius + championStats(p.champion).radius
    ) {
      dash.hit = true;
      p.stats.yasuo!.dashesHit++;
      this.combat.damage(p.id, enemy, dash.damage, 'magic');
      kit.dashStacks = Math.min(S.e.maxStacks, (kit.dashStacksUntil > now ? kit.dashStacks : 0) + 1);
      kit.dashStacksUntil = now + S.e.duration;
    }
    if (now >= dash.ends) this.finishDash(p);
    return true;
  }

  // Used both on natural arrival and after Flash: never sweep the teleport path for E damage.
  finishDash(p: PlayerState) {
    const kit = p.yasuo,
      dash = kit?.dash;
    if (!kit || !dash) return;
    kit.dash = null;
    if (!dash.slash) return;
    const state = this.combat.state(),
      enemy = state.players[1 - p.id];
    p.stats.yasuo!.tempestsCast++;
    this.combat.effect('wind-slash', p.pos, p.id);
    if (
      enemy.hp > 0 &&
      enemy.untargetableUntil <= state.time &&
      distance(p.pos, enemy.pos) <= S.q.radius + championStats(enemy.champion).radius
    )
      this.tempestHit(p, enemy, dash.slash === 'tornado');
  }

  update(dt: number) {
    const state = this.combat.state(),
      now = state.time;
    state.windWalls = state.windWalls.filter((w) => w.expires > now);
    for (const p of state.players) {
      const kit = p.yasuo;
      if (!kit) continue;
      if (kit.stacksUntil <= now) kit.stacks = 0;
      if (kit.shieldUntil <= now) kit.shield = 0;
      if (kit.dashStacksUntil <= now) kit.dashStacks = 0;
    }
    state.tornadoes = state.tornadoes.filter((m) => {
      const travel = Math.min(m.remaining, S.q.speed * dt);
      const next = { x: m.pos.x + m.velocity.x * travel, y: m.pos.y + m.velocity.y * travel };
      if (blockedByWindWall(state, m.owner, m.pos, next, S.q.tornadoWidth / 2)) return false;
      const enemy = state.players[1 - m.owner];
      const hit =
        enemy.hp > 0 &&
        enemy.untargetableUntil <= now &&
        segmentDistance(enemy.pos, m.pos, next) <=
          S.q.tornadoWidth / 2 + championStats(enemy.champion).radius;
      m.pos = next;
      m.remaining -= travel;
      if (hit) this.tempestHit(state.players[m.owner], enemy, true);
      return !hit && m.remaining > 0;
    });
  }
}
