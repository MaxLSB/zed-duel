import { championStats, potionBonus } from './champions';
import { bounded, direction, distance, lerp, towards } from './geometry';
import { SINGED_PASSIVE as PASSIVE, SINGED_SPELLS as SPELLS } from './singed-balance';
import type { SpellKey } from './balance';
import type { Effect, GameState, PlayerId, PlayerState, Vec } from './types';

interface Combat {
  state: () => GameState;
  schedule: (delay: number, run: () => void) => void;
  damage: (owner: PlayerId, target: PlayerState, raw: number, type: 'magic') => void;
  effect: (kind: Effect['kind'], pos: Vec, owner: PlayerId) => void;
  interrupt: (p: PlayerState) => void;
}

// Singed-specific simulation. Zed's spell implementations remain in Game.
export class SingedKit {
  private serial = 0;
  constructor(private combat: Combat) {}

  grounded(p: PlayerState, owner?: PlayerId) {
    const { time, zones } = this.combat.state();
    return zones.some(
      (z) =>
        z.kind === 'adhesive' &&
        z.owner !== p.id &&
        (owner === undefined || z.owner === owner) &&
        z.created <= time &&
        z.expires > time &&
        distance(z.pos, p.pos) <= SPELLS.w.radius + championStats(p.champion).radius,
    );
  }

  moveAirborne(p: PlayerState) {
    const flight = p.airborne;
    if (!flight) return false;
    const now = this.combat.state().time;
    p.pos = lerp(
      flight.from,
      flight.to,
      Math.min(1, (now - flight.started) / (flight.ends - flight.started)),
    );
    if (now >= flight.ends) {
      p.airborne = null;
      if (p.hp > 0 && this.grounded(p, flight.owner)) {
        p.rootUntil = now + SPELLS.e.root;
        this.combat.state().players[flight.owner].stats.singed!.adhesiveRoots++;
      }
    }
    return true;
  }

  cast(p: PlayerState, key: Exclude<SpellKey, 'd'>, point: Vec) {
    const state = this.combat.state(),
      now = state.time,
      kit = p.singed!;
    const enemy = state.players[1 - p.id];
    p.cooldowns[key] = now + SPELLS[key].cooldown;
    if (key === 'q') {
      kit.poisonOn = !kit.poisonOn;
      if (kit.poisonOn) kit.cloudAt = now;
    }
    if (key === 'w') {
      const pos = bounded(towards(p.pos, point, SPELLS.w.range));
      p.castUntil = now + SPELLS.w.cast;
      p.windupUntil = 0;
      state.zones.push({
        id: ++this.serial,
        kind: 'adhesive',
        owner: p.id,
        pos,
        created: now + SPELLS.w.delay,
        expires: now + SPELLS.w.delay + SPELLS.w.duration,
      });
    }
    if (key === 'e') {
      // Game checked range when the windup began. Movement cannot break the grab;
      // only interruptions or an invalid target cancel it without spending cooldown.
      p.cooldowns.e = now;
      const stamp = now + SPELLS.e.cast;
      p.castUntil = stamp;
      p.windupUntil = 0;
      p.destination = null;
      p.attacking = true;
      p.facing = Math.atan2(enemy.pos.y - p.pos.y, enemy.pos.x - p.pos.x);
      this.combat.schedule(SPELLS.e.cast, () => {
        if (
          p.hp <= 0 ||
          p.airborne ||
          p.castUntil !== stamp ||
          enemy.hp <= 0 ||
          enemy.untargetableUntil > state.time ||
          enemy.airborne
        )
          return;
        p.cooldowns.e = state.time + SPELLS.e.cooldown;
        p.stats.singed!.flingsHit++;
        this.combat.damage(
          p.id,
          enemy,
          SPELLS.e.damage +
            championStats(enemy.champion).hp * SPELLS.e.healthRatio +
            potionBonus(p, state.time) * SPELLS.e.ratio,
          'magic',
        );
        const v = direction(enemy.pos, p.pos);
        const to = bounded({
          x: enemy.pos.x + v.x * SPELLS.e.distance,
          y: enemy.pos.y + v.y * SPELLS.e.distance,
        });
        this.combat.interrupt(enemy);
        enemy.airborne = {
          owner: p.id,
          from: { ...enemy.pos },
          to,
          started: state.time,
          ends: state.time + SPELLS.e.flight,
        };
        this.combat.effect('attack', enemy.pos, p.id);
      });
    }
    if (key === 'r') {
      // The cooldown runs only after the active buff ends.
      kit.insanityUntil = now + SPELLS.r.duration;
      p.cooldowns.r = kit.insanityUntil + SPELLS.r.cooldown;
      this.combat.effect('passive', p.pos, p.id);
    }
    return true;
  }

  update(dt: number) {
    const state = this.combat.state(),
      now = state.time;
    state.zones = state.zones.filter((z) => z.expires > now);
    for (const p of state.players) {
      const kit = p.singed;
      if (!kit || p.hp <= 0) continue;
      // Count only the portion of this simulation step covered by the active buff.
      p.stats.singed!.potionSeconds += Math.max(0, Math.min(now, kit.insanityUntil) - (now - dt));
      const enemy = state.players[1 - p.id];
      if (
        enemy.hp > 0 &&
        enemy.untargetableUntil <= now &&
        distance(p.pos, enemy.pos) <= PASSIVE.range &&
        p.passiveAt <= now
      ) {
        kit.slipstreamUntil = now + PASSIVE.duration;
        p.passiveAt = now + PASSIVE.cooldown;
        this.combat.effect('passive', p.pos, p.id);
      }
      if (kit.poisonOn && kit.cloudAt <= now) {
        kit.cloudAt = now + SPELLS.q.interval;
        const pos = bounded({ x: p.pos.x - Math.cos(p.facing) * 20, y: p.pos.y - Math.sin(p.facing) * 20 });
        state.zones.push({
          id: ++this.serial,
          kind: 'poison',
          owner: p.id,
          pos,
          created: now,
          expires: now + SPELLS.q.cloudDuration,
        });
      }
    }
    for (const target of state.players) {
      if (target.hp <= 0) continue;
      const previousPoison = target.poison;
      if (previousPoison)
        state.players[previousPoison.owner].stats.singed!.poisonSeconds += Math.max(
          0,
          Math.min(now, previousPoison.until) - (now - dt),
        );
      const cloud =
        target.untargetableUntil <= now &&
        state.zones.find(
          (z) =>
            z.kind === 'poison' &&
            z.owner !== target.id &&
            distance(z.pos, target.pos) <= SPELLS.q.range + championStats(target.champion).radius,
        );
      if (cloud) {
        if (target.poison && target.poison.until > now) target.poison.until = now + SPELLS.q.duration;
        else target.poison = { owner: cloud.owner, until: now + SPELLS.q.duration, tickAt: now };
      }
      const poison = target.poison;
      if (!poison) continue;
      if (poison.until <= now) {
        target.poison = null;
        continue;
      }
      if (poison.tickAt <= now) {
        const owner = state.players[poison.owner];
        const ap = potionBonus(owner, now);
        const before = target.hp;
        this.combat.damage(poison.owner, target, SPELLS.q.damage + ap * SPELLS.q.ratio, 'magic');
        owner.stats.singed!.poisonDamage += before - target.hp;
        poison.tickAt += SPELLS.q.interval;
        if (ap > 0) target.grievousUntil = now + SPELLS.r.grievousDuration;
      }
    }
  }
}
