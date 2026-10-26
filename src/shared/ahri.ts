import { AHRI_PASSIVE, AHRI_SPELLS as S } from './ahri-balance';
import { SINGED_SPELLS } from './singed-balance';
import { championStats } from './champions';
import { bounded, direction, distance, lerp, segmentDistance, towards } from './geometry';
import type { SpellKey } from './balance';
import type { AhriMissile, GameState, PlayerId, PlayerState, Vec } from './types';

interface Combat {
  state: () => GameState;
  schedule: (delay: number, run: () => void) => void;
  damage: (owner: PlayerId, target: PlayerState, raw: number, type: 'magic' | 'true') => void;
  interrupt: (p: PlayerState) => void;
  healed: (p: PlayerState) => void;
}

export class AhriKit {
  private serial = 0;
  private creditedCasts = new Map<number, number>();
  constructor(private combat: Combat) {}

  reset() {
    this.serial = 0;
    this.creditedCasts.clear();
  }

  private spellHit(p: PlayerState, castId: number) {
    if (this.creditedCasts.has(castId)) return;
    const now = this.combat.state().time;
    // Retain credit beyond the remaining flame lifetime plus missile lifetime.
    this.creditedCasts.set(castId, now + S.w.duration + 5);
    const kit = p.ahri!;
    kit.essenceHits++;
    if (kit.essenceHits < AHRI_PASSIVE.hits) return;
    kit.essenceHits = 0;
    const heal = AHRI_PASSIVE.heal * (p.grievousUntil > now ? 1 - SINGED_SPELLS.r.grievous : 1);
    p.hp = Math.min(championStats(p.champion).hp, p.hp + heal);
    this.combat.healed(p);
  }

  cast(p: PlayerState, key: Exclude<SpellKey, 'd'>, point: Vec) {
    const state = this.combat.state(),
      now = state.time,
      kit = p.ahri!;
    p.cooldowns[key] = now + S[key].cooldown;
    if (key === 'q' || key === 'e') {
      const spell = S[key],
        stamp = now + spell.cast;
      const aim = { ...point };
      p.castUntil = stamp;
      p.windupUntil = 0;
      p.facing = Math.atan2(aim.y - p.pos.y, aim.x - p.pos.x);
      this.combat.schedule(spell.cast, () => {
        if (p.hp <= 0 || p.castUntil !== stamp || p.airborne || p.charm) return;
        this.missile(p, key === 'q' ? 'orb' : 'charm', aim, spell.damage, spell.range);
      });
    }
    if (key === 'w') {
      kit.fireCastId = ++this.serial;
      kit.hasteUntil = now + S.w.hasteDuration;
      kit.fires = 3;
      kit.fireHits = 0;
      kit.fireAt = now + 0.25;
      kit.fireUntil = now + S.w.duration;
    }
    if (key === 'r') {
      if (kit.rushUntil <= now) {
        kit.rushUntil = now + S.r.duration;
        kit.rushCharges = 3;
      }
      kit.rushCharges--;
      kit.rushAt = now + S.r.recast;
      // The duel cooldown begins when the final charge is used or the window expires.
      p.cooldowns.r = (kit.rushCharges ? kit.rushUntil : now) + S.r.cooldown;
      if (!kit.rushCharges) kit.rushUntil = 0;
      const to = bounded(towards(p.pos, point, S.r.range));
      kit.dash = {
        from: { ...p.pos },
        to,
        started: now,
        ends: now + Math.max(1 / 60, distance(p.pos, to) / S.r.speed),
      };
      p.facing = Math.atan2(to.y - p.pos.y, to.x - p.pos.x);
      p.destination = null;
      p.attackMove = null;
      p.attacking = false;
      p.windupUntil = 0;
    }
    return true;
  }

  moveDash(p: PlayerState) {
    const dash = p.ahri?.dash;
    if (!dash) return false;
    const state = this.combat.state(),
      now = state.time;
    p.pos = lerp(dash.from, dash.to, Math.min(1, (now - dash.started) / (dash.ends - dash.started)));
    if (now >= dash.ends) {
      p.ahri!.dash = null;
      const enemy = state.players[1 - p.id];
      if (enemy.hp > 0 && enemy.untargetableUntil <= now && distance(p.pos, enemy.pos) <= S.r.boltRange)
        this.missile(p, 'rush', enemy.pos, S.r.damage);
    }
    return true;
  }

  private missile(
    p: PlayerState,
    kind: AhriMissile['kind'],
    point: Vec,
    damage: number,
    remaining = 0,
    castId?: number,
  ) {
    const state = this.combat.state();
    const velocity =
      distance(p.pos, point) > 0 ? direction(p.pos, point) : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    const id = ++this.serial;
    state.ahriMissiles.push({
      id,
      castId: castId ?? id,
      owner: p.id,
      kind,
      pos: { ...p.pos },
      velocity,
      remaining,
      returning: false,
      hit: false,
      damage,
      expires: state.time + 5,
    });
  }

  update(dt: number) {
    const state = this.combat.state(),
      now = state.time;
    for (const [id, until] of this.creditedCasts) if (until <= now) this.creditedCasts.delete(id);
    for (const p of state.players) {
      const kit = p.ahri;
      if (!kit) continue;
      if (kit.rushUntil <= now) kit.rushCharges = 0;
      if (p.hp <= 0 || kit.fireUntil <= now) kit.fires = 0;
      const enemy = state.players[1 - p.id];
      if (
        kit.fires &&
        kit.fireAt <= now &&
        enemy.hp > 0 &&
        enemy.untargetableUntil <= now &&
        distance(p.pos, enemy.pos) <= S.w.range
      ) {
        this.missile(p, 'fire', enemy.pos, S.w.damage * (kit.fireHits ? S.w.repeat : 1), 0, kit.fireCastId);
        kit.fireHits++;
        kit.fires--;
        kit.fireAt = now + 0.1;
      }
    }
    state.ahriMissiles = state.ahriMissiles.filter((m) => {
      const owner = state.players[m.owner],
        target = state.players[1 - m.owner];
      if (m.expires <= now || owner.hp <= 0) return false;
      const homing = m.kind === 'fire' || m.kind === 'rush';
      if (homing && (target.hp <= 0 || target.untargetableUntil > now)) return false;
      const destination = m.returning ? owner.pos : homing ? target.pos : null;
      if (destination) m.velocity = direction(m.pos, destination);
      const speed = m.kind === 'rush' ? S.r.boltSpeed : m.kind === 'fire' ? S.w.speed : S.q.speed;
      const travel = Math.min(speed * dt, destination ? distance(m.pos, destination) : m.remaining);
      const next = { x: m.pos.x + m.velocity.x * travel, y: m.pos.y + m.velocity.y * travel };
      const radius =
        championStats(target.champion).radius +
        (m.kind === 'orb' ? S.q.width / 2 : m.kind === 'charm' ? S.e.width / 2 : 15);
      const hit =
        !m.hit &&
        target.hp > 0 &&
        target.untargetableUntil <= now &&
        segmentDistance(target.pos, m.pos, next) <= radius;
      if (hit) {
        m.hit = true;
        this.combat.damage(m.owner, target, m.damage, m.returning ? 'true' : 'magic');
        this.spellHit(owner, m.castId);
        if (m.kind === 'charm' && target.hp > 0) {
          this.combat.interrupt(target);
          target.airborne = null;
          target.charm = { owner: m.owner, until: now + S.e.duration };
        }
      }
      m.pos = next;
      if (m.kind !== 'orb' && hit) return false;
      if (destination) return distance(next, destination) > 1;
      m.remaining -= travel;
      if (m.remaining <= 0 && m.kind === 'orb') {
        m.returning = true;
        m.hit = false;
        return true;
      }
      return m.remaining > 0;
    });
  }
}
