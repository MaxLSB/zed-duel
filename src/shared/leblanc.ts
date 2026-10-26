import { LEBLANC_PASSIVE as P, LEBLANC_SPELLS as S } from './leblanc-balance';
import { championStats } from './champions';
import { bounded, direction, distance, lerp, segmentDistance, towards } from './geometry';
import { visible } from './visibility';
import type { SpellKey } from './balance';
import type { Effect, GameState, LeblancMissile, PlayerId, PlayerState, Vec } from './types';

interface Combat {
  state: () => GameState;
  schedule: (delay: number, run: () => void) => void;
  damage: (owner: PlayerId, target: PlayerState, raw: number, type: 'magic') => void;
  hidden: (p: PlayerState) => void;
  effect: (kind: Effect['kind'], pos: Vec, owner: PlayerId) => void;
}

export class LeblancKit {
  private serial = 0;
  constructor(private combat: Combat) {}
  reset() {
    this.serial = 0;
  }

  returnPoint(p: PlayerState, key: SpellKey) {
    const pad = key === 'w' || key === 'r' ? p.leblanc?.returns[key] : null;
    return pad && pad.expires > this.combat.state().time ? pad : null;
  }

  spell(p: PlayerState, key: SpellKey) {
    return key === 'r' ? p.leblanc?.lastSpell : key;
  }

  cast(p: PlayerState, key: Exclude<SpellKey, 'd'>, point: Vec) {
    const state = this.combat.state(),
      now = state.time,
      kit = p.leblanc!;
    const pad = this.returnPoint(p, key);
    if (pad && (key === 'w' || key === 'r')) {
      p.stats.leblanc!.returnsUsed++;
      this.combat.effect('blink', p.pos, p.id);
      p.pos = { ...pad.pos };
      kit.returns[key] = null;
      p.destination = null;
      p.windupUntil = 0;
      this.combat.effect('blink', p.pos, p.id);
      return true;
    }
    const spell = this.spell(p, key);
    if (spell !== 'q' && spell !== 'w' && spell !== 'e') return false;
    const mimic = key === 'r';
    if (!mimic) kit.lastSpell = spell;
    p.cooldowns[key] = now + S[key].cooldown;
    p.windupUntil = 0;
    p.facing = Math.atan2(point.y - p.pos.y, point.x - p.pos.x);
    if (spell === 'w') {
      const to = bounded(towards(p.pos, point, S.w.range));
      const ends = now + Math.max(1 / 60, distance(p.pos, to) / S.w.speed);
      kit.returns[mimic ? 'r' : 'w'] = {
        id: ++this.serial,
        pos: { ...p.pos },
        readyAt: ends + S.w.recast,
        expires: ends + S.w.duration,
      };
      kit.dash = {
        from: { ...p.pos },
        to,
        started: now,
        ends,
        damage: mimic ? S.r.dashDamage : S.w.damage,
        mimic,
      };
      p.destination = null;
      p.attacking = false;
      p.attackMove = null;
    } else {
      const stamp = now + S[spell].cast,
        aim = { ...point };
      p.castUntil = stamp;
      this.combat.schedule(S[spell].cast, () => {
        if (p.hp <= 0 || p.castUntil !== stamp || p.airborne || p.charm) return;
        const enemy = state.players[1 - p.id];
        if (
          spell === 'q' &&
          (enemy.hp <= 0 || enemy.untargetableUntil > state.time || !visible(enemy, state.time))
        )
          return;
        const target = spell === 'q' ? enemy.pos : aim;
        const velocity = distance(p.pos, target)
          ? direction(p.pos, target)
          : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
        state.leblancMissiles.push({
          id: ++this.serial,
          owner: p.id,
          kind: spell === 'q' ? 'sigil' : 'chain',
          mimic,
          pos: { ...p.pos },
          velocity,
          remaining: S[spell].range,
          expires: state.time + 3,
        });
        if (spell === 'e') p.stats.leblanc!.chainsThrown++;
      });
    }
    return true;
  }

  moveDash(p: PlayerState) {
    const dash = p.leblanc?.dash;
    if (!dash) return false;
    const state = this.combat.state(),
      now = state.time;
    p.pos = lerp(dash.from, dash.to, Math.min(1, (now - dash.started) / (dash.ends - dash.started)));
    if (now >= dash.ends) {
      p.leblanc!.dash = null;
      this.combat.effect('distortion', p.pos, p.id);
      const target = state.players[1 - p.id];
      if (
        target.hp > 0 &&
        target.untargetableUntil <= now &&
        distance(p.pos, target.pos) <= S.w.radius + championStats(target.champion).radius
      ) {
        p.stats.leblanc!.distortionHits++;
        if (dash.mimic) p.stats.leblanc!.mimicHits++;
        this.hit(p.id, target, dash.damage);
      }
    }
    return true;
  }

  private hit(owner: PlayerId, target: PlayerState, damage: number) {
    const now = this.combat.state().time;
    const marks = target.sigils.filter((m) => m.owner === owner && m.expires > now);
    target.sigils = target.sigils.filter((m) => m.owner !== owner && m.expires > now);
    this.combat.damage(owner, target, damage, 'magic');
    for (const mark of marks) {
      if (target.hp <= 0) break;
      this.combat.state().players[owner].stats.leblanc!.sigilsDetonated++;
      this.combat.damage(owner, target, mark.damage, 'magic');
    }
  }

  damaged(p: PlayerState) {
    const state = this.combat.state(),
      now = state.time,
      kit = p.leblanc;
    if (!kit || p.hp <= 0 || p.hp >= championStats(p.champion).hp * P.threshold || p.passiveAt > now) return;
    p.passiveAt = now + P.cooldown;
    kit.invisibleUntil = now + P.invisible;
    const enemy = state.players[1 - p.id],
      away = direction(enemy.pos, p.pos);
    kit.clone = {
      pos: { ...p.pos },
      destination: bounded({
        x: p.pos.x + away.x * 900 - away.y * 350,
        y: p.pos.y + away.y * 900 + away.x * 350,
      }),
      facing: p.facing,
      appears: now + P.invisible,
      expires: now + P.duration,
    };
    // Break existing targeted pursuit without cancelling already flying skillshots.
    this.combat.hidden(p);
  }

  update(dt: number) {
    const state = this.combat.state(),
      now = state.time;
    for (const p of state.players) {
      p.sigils = p.sigils.filter((m) => m.expires > now);
      const kit = p.leblanc;
      if (!kit) continue;
      for (const key of ['w', 'r'] as const)
        if (kit.returns[key] && kit.returns[key]!.expires <= now) kit.returns[key] = null;
      if (kit.clone && (kit.clone.expires <= now || p.hp <= 0)) kit.clone = null;
      if (kit.clone) {
        const clone = kit.clone;
        clone.facing = Math.atan2(clone.destination.y - clone.pos.y, clone.destination.x - clone.pos.x);
        clone.pos = towards(clone.pos, clone.destination, championStats(p.champion).speed * dt);
      }
    }
    state.chains = state.chains.filter((chain) => {
      const owner = state.players[chain.owner],
        target = state.players[chain.target];
      if (
        owner.hp <= 0 ||
        target.hp <= 0 ||
        target.untargetableUntil > now ||
        distance(owner.pos, target.pos) > S.e.breakRange
      )
        return false;
      if (chain.triggers > now) return true;
      this.hit(owner.id, target, chain.mimic ? S.r.followup : S.e.rootDamage);
      if (target.hp > 0) {
        owner.stats.leblanc!.chainRoots++;
        target.rootUntil = Math.max(target.rootUntil, now + S.e.root);
        // Roots interrupt displacement, but do not silence attacks or spells.
        if (target.ahri) target.ahri.dash = null;
        if (target.leblanc) target.leblanc.dash = null;
      }
      return false;
    });
    state.leblancMissiles = state.leblancMissiles.filter((m) => this.moveMissile(m, dt));
  }

  private moveMissile(m: LeblancMissile, dt: number) {
    const state = this.combat.state(),
      now = state.time;
    const owner = state.players[m.owner],
      target = state.players[1 - m.owner];
    if (m.expires <= now || owner.hp <= 0 || target.hp <= 0) return false;
    const homing = m.kind === 'sigil';
    if (homing && target.untargetableUntil > now) return false;
    if (homing) m.velocity = direction(m.pos, target.pos);
    const travel = Math.min(
      (homing ? S.q.speed : S.e.speed) * dt,
      homing ? distance(m.pos, target.pos) : m.remaining,
    );
    const next = { x: m.pos.x + m.velocity.x * travel, y: m.pos.y + m.velocity.y * travel };
    const hit =
      target.untargetableUntil <= now &&
      segmentDistance(target.pos, m.pos, next) <=
        championStats(target.champion).radius + (homing ? 12 : S.e.width / 2);
    m.pos = next;
    m.remaining -= travel;
    if (hit) {
      if (!homing) owner.stats.leblanc!.chainsHit++;
      if (m.mimic) owner.stats.leblanc!.mimicHits++;
      this.hit(owner.id, target, m.mimic ? S.r.damage : homing ? S.q.damage : S.e.damage);
      if (target.hp > 0) {
        if (homing)
          target.sigils.push({
            owner: owner.id,
            mimic: m.mimic,
            expires: now + S.q.duration,
            damage: m.mimic ? S.r.followup : S.q.markDamage,
          });
        else
          state.chains.push({
            id: ++this.serial,
            owner: owner.id,
            target: target.id,
            mimic: m.mimic,
            started: now,
            triggers: now + S.e.delay,
          });
      }
      return false;
    }
    return homing || m.remaining > 0;
  }
}
