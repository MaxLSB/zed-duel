import { EzrealKit } from './ezreal';
import { attackSpeed, championStats, potionBonus } from './champions';
import { SINGED_SPELLS } from './singed-balance';
import { SingedKit } from './singed';
import { AhriKit } from './ahri';
import { YasuoKit } from './yasuo';
import { YASUO_SPELLS } from './yasuo-balance';
import { blockedByWindWall } from './wind-wall';
import { LeblancKit } from './leblanc';
import { LEBLANC_SPELLS } from './leblanc-balance';
import { visible } from './visibility';
import { PASSIVE, SPELLS, STATS, STEP } from './balance';
import { bounded, direction, distance, segmentDistance, towards } from './geometry';
import { movePlayer } from './movement';
import { Player } from './player';
import { SpellBuffer, SPELL_BUFFER_WINDOW } from './spell-buffer';
import type { CastInput } from './spell-buffer';
import type { SpellKey } from './balance';
import type { ChampionId, Effect, GameState, Input, PlayerId, PlayerState, Shadow, Vec } from './types';

interface CastGroup {
  hits: Set<number>;
  damaged: boolean;
  expires: number;
}
interface Scheduled {
  at: number;
  run: () => void;
}

export class Game {
  state: GameState;
  private scheduled: Scheduled[] = [];
  private groups = new Map<number, CastGroup>();
  private serial = 0;
  private spellBuffer = new SpellBuffer();
  private approachTargets = new Map<PlayerId, SpellKey>();

  private interrupt = (p: PlayerState) => {
    this.spellBuffer.clear(p.id);
    this.cancelApproach(p);
    p.destination = null;
    p.attackMove = null;
    p.attacking = false;
    p.windupUntil = 0;
    p.castUntil = this.state.time;
    if (p.ahri) p.ahri.dash = null;
    if (p.leblanc) p.leblanc.dash = null;
    if (p.yasuo) {
      p.yasuo.dash = null;
      p.yasuo.ultimateUntil = 0;
    }
  };

  private ezreal = new EzrealKit({
    state: () => this.state,
    schedule: (delay, run) => this.schedule(delay, run),
    damage: (owner, target, raw, type) => this.damage(owner, target, raw, type),
    effect: (kind, pos, owner) => this.effect(kind, pos, owner),
    grounded: (p) => this.singed.grounded(p),
  });

  private yasuo = new YasuoKit({
    state: () => this.state,
    schedule: (delay, run) => this.schedule(delay, run),
    damage: (owner, target, raw, type) => this.damage(owner, target, raw, type),
    effect: (kind, pos, owner, amount, from) => this.effect(kind, pos, owner, amount, from),
    interrupt: this.interrupt,
  });

  private leblanc = new LeblancKit({
    state: () => this.state,
    schedule: (delay, run) => this.schedule(delay, run),
    damage: (owner, target, raw, type) => this.damage(owner, target, raw, type),
    effect: (kind, pos, owner) => this.effect(kind, pos, owner),
    hidden: (p) => {
      const enemy = this.enemy(p);
      if (enemy.attacking) enemy.destination = null;
      enemy.attacking = false;
      enemy.windupUntil = 0;
      this.cancelApproach(enemy);
    },
  });

  private ahri = new AhriKit({
    state: () => this.state,
    schedule: (delay, run) => this.schedule(delay, run),
    damage: (owner, target, raw, type) => this.damage(owner, target, raw, type),
    interrupt: this.interrupt,
    healed: (p) => this.effect('passive', p.pos, p.id),
  });

  private singed = new SingedKit({
    state: () => this.state,
    schedule: (delay, run) => this.schedule(delay, run),
    damage: (owner, target, raw, type) => this.damage(owner, target, raw, type),
    effect: (kind, pos, owner) => this.effect(kind, pos, owner),
    interrupt: this.interrupt,
  });

  constructor(
    private readonly stationary: PlayerId | null = null,
    private champions: [ChampionId, ChampionId] = ['zed', 'zed'],
  ) {
    this.state = this.initialState();
  }

  selectChampion(id: PlayerId, champion: ChampionId) {
    // A post-match pick opens a fresh lobby without replacing the room or its players.
    if (this.state.phase === 'finished') this.disconnect();
    if (this.state.phase !== 'waiting') return false;
    this.champions[id] = champion;
    this.state.players[id] = new Player(id, champion);
    return true;
  }

  private initialState(): GameState {
    return {
      time: 0,
      phase: 'waiting',
      countdown: 0,
      players: [new Player(0, this.champions[0]), new Player(1, this.champions[1])],
      zones: [],
      projectiles: [],
      ahriMissiles: [],
      ezrealMissiles: [],
      leblancMissiles: [],
      chains: [],
      windWalls: [],
      tornadoes: [],
      effects: [],
      winner: null,
    };
  }

  start(countdown = 3) {
    this.ezreal.reset();
    this.yasuo.reset();
    this.ahri.reset();
    this.leblanc.reset();
    this.state = this.initialState();
    this.state.phase = countdown > 0 ? 'countdown' : 'active';
    this.state.countdown = countdown;
    this.scheduled = [];
    this.groups.clear();
    this.spellBuffer.clear();
    this.approachTargets.clear();
    this.serial = 0;
  }

  disconnect() {
    this.ezreal.reset();
    this.yasuo.reset();
    this.ahri.reset();
    this.leblanc.reset();
    this.state = this.initialState();
    this.scheduled = [];
    this.groups.clear();
    this.spellBuffer.clear();
    this.approachTargets.clear();
  }

  input(id: PlayerId, input: Input): boolean {
    const p = this.state.players[id];
    if (this.state.phase !== 'active' || id === this.stationary) return false;
    if (p.charm && p.charm.until > this.state.time) return false;
    if (input.action === 'cast') return this.requestCast(p, input);
    this.spellBuffer.clear(id);
    this.cancelApproach(p);
    if (input.action === 'stop') {
      p.destination = null;
      p.attackMove = null;
      p.attacking = false;
      p.windupUntil = 0;
      if (p.ultimate) p.ultimate.attackAfter = false;
      return true;
    }
    if (!this.targetable(p)) return false;
    if (input.action !== 'attack' && input.action !== 'attack-move') p.windupUntil = 0;
    p.attackMove = null;
    if (input.action === 'move') {
      p.destination = bounded(input.point);
      p.attacking = false;
    }
    if (input.action === 'attack-move') {
      p.attackMove = bounded(input.point);
      p.destination = { ...p.attackMove };
      p.attacking = false;
    }
    if (input.action === 'attack') {
      if (!visible(this.enemy(p), this.state.time)) return false;
      p.destination = null;
      p.attacking = true;
    }
    return true;
  }

  step(dt = STEP) {
    const s = this.state;
    if (s.phase === 'waiting' || s.phase === 'finished') return;
    if (s.phase === 'countdown') {
      s.countdown = Math.max(0, s.countdown - dt);
      if (s.countdown === 0) s.phase = 'active';
      return;
    }
    s.time += dt;
    for (const p of s.players) this.updatePlayer(p, dt);
    this.separatePlayers();
    const due = this.scheduled.filter((event) => event.at <= s.time);
    this.scheduled = this.scheduled.filter((event) => event.at > s.time);
    due.sort((a, b) => a.at - b.at).forEach((event) => event.run());
    this.yasuo.update(dt);
    this.singed.update(dt);
    this.ahri.update(dt);
    this.leblanc.update(dt);
    this.ezreal.update(dt);
    this.updateProjectiles(dt);
    for (const p of s.players) this.updateMark(p);
    s.effects = s.effects.filter((effect) => s.time - effect.at < 0.8);
    for (const [id, group] of this.groups) if (group.expires < s.time) this.groups.delete(id);
    if (s.players.every((p) => p.hp > 0)) this.flushBufferedCasts();
    const dead = s.players.filter((p) => p.hp <= 0);
    if (dead.length) {
      s.phase = 'finished';
      this.spellBuffer.clear();
      this.approachTargets.clear();
      s.winner = dead.length === 2 ? 'draw' : ((1 - dead[0].id) as PlayerId);
    }
  }

  private targetable(p: PlayerState) {
    return this.state.time >= p.untargetableUntil;
  }
  private enemy(p: PlayerState) {
    return this.state.players[1 - p.id];
  }
  private schedule(delay: number, run: () => void) {
    this.scheduled.push({ at: this.state.time + delay, run });
  }
  private effect(kind: Effect['kind'], pos: Vec, owner: PlayerId, amount?: number, from?: Vec) {
    this.state.effects.push({
      id: ++this.serial,
      kind,
      pos: { ...pos },
      owner,
      at: this.state.time,
      amount,
      ...(from ? { from: { ...from } } : {}),
    });
  }

  private updatePlayer(p: PlayerState, dt: number) {
    const now = this.state.time;
    p.shadows = p.shadows.filter((shadow) => shadow.expires > now);
    if (p.hp <= 0) return;
    const stats = championStats(p.champion);
    const regen =
      (stats.hpRegen + potionBonus(p, now) / 5) * (p.grievousUntil > now ? 1 - SINGED_SPELLS.r.grievous : 1);
    p.hp = Math.min(stats.hp, p.hp + regen * dt);
    if (this.singed.moveAirborne(p)) return;
    if (p.charm && (p.charm.until <= now || this.state.players[p.charm.owner].hp <= 0)) p.charm = null;
    if (p.charm) {
      movePlayer(p, this.state, dt);
      return;
    }
    if (this.yasuo.moveDash(p) || this.ahri.moveDash(p) || this.leblanc.moveDash(p)) return;
    if (!this.targetable(p) || p.castUntil > now) return;
    const enemy = this.enemy(p);
    if (this.approachTargets.has(p.id)) {
      if (enemy.hp <= 0 || !this.targetable(enemy) || !visible(enemy, now)) this.cancelApproach(p);
      else if (distance(p.pos, enemy.pos) <= this.targetedRange(p, enemy)) {
        this.cast(p, this.approachTargets.get(p.id)!, enemy.pos, enemy.id);
        return;
      } else p.destination = { ...enemy.pos };
    }
    const attackRange = stats.attackRange + stats.radius + championStats(enemy.champion).radius;
    if (
      p.attackMove &&
      enemy.hp > 0 &&
      this.targetable(enemy) &&
      visible(enemy, now) &&
      distance(p.pos, enemy.pos) <= attackRange
    ) {
      p.attackMove = null;
      p.attacking = true;
    }
    if (p.attacking && enemy.hp > 0 && this.targetable(enemy) && visible(enemy, now)) {
      p.destination = distance(p.pos, enemy.pos) > attackRange ? { ...enemy.pos } : null;
      if (!p.destination && p.attackAt <= now && p.windupUntil === 0) this.attack(p, enemy);
    }
    if (p.id !== this.stationary) {
      const before = { ...p.pos };
      movePlayer(p, this.state, dt);
      this.yasuo.moved(p, before);
    }
  }

  private separatePlayers() {
    const [a, b] = this.state.players;
    if (
      !this.targetable(a) ||
      !this.targetable(b) ||
      a.mark ||
      b.mark ||
      a.airborne ||
      b.airborne ||
      a.ahri?.dash ||
      b.ahri?.dash ||
      a.leblanc?.dash ||
      b.leblanc?.dash ||
      a.yasuo?.dash ||
      b.yasuo?.dash
    )
      return;
    const d = distance(a.pos, b.pos);
    if (d >= 2 * STATS.radius) return;
    const v = d > 0 ? direction(a.pos, b.pos) : { x: 1, y: 0 };
    const push = (2 * STATS.radius - d) / 2;
    const aPush = this.stationary === a.id ? 0 : this.stationary === b.id ? push * 2 : push;
    const bPush = this.stationary === b.id ? 0 : this.stationary === a.id ? push * 2 : push;
    a.pos = bounded({ x: a.pos.x - v.x * aPush, y: a.pos.y - v.y * aPush });
    b.pos = bounded({ x: b.pos.x + v.x * bPush, y: b.pos.y + v.y * bPush });
  }

  private attack(p: PlayerState, enemy: PlayerState) {
    if (p.leblanc) p.leblanc.invisibleUntil = 0;
    const stats = championStats(p.champion);
    const enemyStats = championStats(enemy.champion);
    const delay = stats.windup / attackSpeed(p, this.state.time);
    const stamp = this.state.time + delay;
    p.windupUntil = stamp;
    p.facing = Math.atan2(enemy.pos.y - p.pos.y, enemy.pos.x - p.pos.x);
    this.schedule(delay, () => {
      if (p.windupUntil !== stamp) return;
      p.windupUntil = 0;
      if (
        p.airborne ||
        !this.targetable(p) ||
        !this.targetable(enemy) ||
        !visible(enemy, this.state.time) ||
        distance(p.pos, enemy.pos) > stats.attackRange + stats.radius + enemyStats.radius + 25
      )
        return;
      p.attackAt = this.state.time + (1 - stats.windup) / attackSpeed(p, this.state.time);
      const passive =
        p.champion === 'zed' &&
        enemy.hp < enemyStats.hp * PASSIVE.threshold &&
        p.passiveAt <= this.state.time;
      if (stats.attackRange > 300 && blockedByWindWall(this.state, p.id, p.pos, enemy.pos, 12)) return;
      if (p.ezreal) this.ezreal.detonate(p, enemy);
      this.damage(p.id, enemy, stats.ad, 'physical');
      p.stats.attacksHit++;
      this.effect('attack', enemy.pos, p.id, undefined, p.pos);
      if (passive) {
        this.damage(p.id, enemy, enemyStats.hp * PASSIVE.ratio, 'magic');
        p.passiveAt = this.state.time + PASSIVE.cooldown;
        this.effect('passive', enemy.pos, p.id);
      }
    });
  }

  private targetedRange(p: PlayerState, enemy: PlayerState) {
    if (p.leblanc) return LEBLANC_SPELLS.q.range + championStats(enemy.champion).radius;
    return p.champion === 'singed'
      ? SINGED_SPELLS.e.range + championStats(p.champion).radius + championStats(enemy.champion).radius
      : SPELLS.r.range + championStats(enemy.champion).radius;
  }

  private cancelApproach(p: PlayerState) {
    if (this.approachTargets.delete(p.id)) p.destination = null;
  }

  private recastShadow(p: PlayerState, key: SpellKey) {
    return key === 'w' || key === 'r'
      ? p.shadows.find(
          (s) => s.kind === key && !s.swapped && s.expires > this.state.time && s.swapUntil > this.state.time,
        )
      : undefined;
  }

  private castReadyAt(p: PlayerState, input: CastInput): number | null {
    const now = this.state.time;
    const { spell: key, target } = input;
    const shadow = this.recastShadow(p, key);
    const displacement =
      key === 'd' ||
      (p.champion === 'ahri' && key === 'r') ||
      (p.champion === 'ezreal' && key === 'e') ||
      (!!p.yasuo && (key === 'e' || key === 'r')) ||
      (!!p.leblanc && (!!this.leblanc.returnPoint(p, key) || this.leblanc.spell(p, key) === 'w')) ||
      (p.champion === 'zed' && (key === 'r' || (key === 'w' && !!shadow)));
    if (displacement && (p.rootUntil > now || this.singed.grounded(p))) return null;
    if (p.airborne || (p.charm && p.charm.until > now)) return null;
    if (p.yasuo) {
      const enemy = this.enemy(p),
        kit = p.yasuo;
      if (kit.ultimateUntil > now || (kit.dash && key !== 'q' && key !== 'r' && key !== 'd')) return null;
      if (key === 'q' && kit.dash?.slash) return null;
      if (
        (key === 'e' || key === 'r') &&
        ((key === 'e' && target !== enemy.id) ||
          enemy.hp <= 0 ||
          !this.targetable(enemy) ||
          !visible(enemy, now) ||
          distance(p.pos, enemy.pos) > YASUO_SPELLS[key].range + championStats(enemy.champion).radius)
      )
        return null;
      if (key === 'e' && kit.dashTargetUntil > now) return null;
      if (key === 'r' && (!enemy.airborne || enemy.airborne.ends <= now)) return null;
      // E can borrow the final half-second of Q's cooldown; the next Q repays it.
      const dashQ = key === 'q' && kit.dash && p.cooldowns.q - kit.dash.started <= YASUO_SPELLS.e.qBuffer;
      return Math.max(
        now,
        p.untargetableUntil,
        dashQ ? 0 : p.cooldowns[key],
        key === 'w' || key === 'd' ? 0 : p.castUntil,
      );
    }
    if (p.leblanc) {
      if (p.leblanc.dash) return null;
      const pad = this.leblanc.returnPoint(p, key);
      const spell = this.leblanc.spell(p, key);
      const enemy = this.enemy(p);
      if (
        !pad &&
        (!spell ||
          (spell === 'q' &&
            (target !== enemy.id || enemy.hp <= 0 || !this.targetable(enemy) || !visible(enemy, now))))
      )
        return null;
      return Math.max(
        now,
        p.untargetableUntil,
        pad ? pad.readyAt : p.cooldowns[key],
        key === 'd' ? 0 : p.castUntil,
      );
    }
    if (p.ezreal) return Math.max(now, p.untargetableUntil, p.cooldowns[key], key === 'd' ? 0 : p.castUntil);
    if (p.ahri) {
      if (p.ahri.dash && key !== 'w') return null;
      const cooldown =
        key === 'r' && p.ahri.rushUntil > now && p.ahri.rushCharges > 0 ? p.ahri.rushAt : p.cooldowns[key];
      return Math.max(now, p.untargetableUntil, cooldown, key === 'w' || key === 'd' ? 0 : p.castUntil);
    }
    if (p.champion === 'singed') {
      const enemy = this.enemy(p);
      if (
        key === 'e' &&
        (target !== enemy.id ||
          !this.targetable(enemy) ||
          !visible(enemy, now) ||
          enemy.hp <= 0 ||
          enemy.airborne)
      )
        return null;
      return Math.max(
        now,
        p.untargetableUntil,
        p.cooldowns[key],
        key === 'w' || key === 'e' ? p.castUntil : 0,
      );
    }
    if (shadow) {
      if (key === 'w' && distance(p.pos, shadow.pos) > SPELLS.w.swapRange) return null;
      return Math.max(now, p.untargetableUntil, shadow.swapAfter, shadow.readyAt);
    }
    const enemy = this.enemy(p);
    if (
      key === 'r' &&
      (target !== enemy.id || !this.targetable(enemy) || !visible(enemy, now) || enemy.hp <= 0)
    )
      return null;
    return Math.max(now, p.untargetableUntil, p.cooldowns[key], key === 'e' || key === 'd' ? 0 : p.castUntil);
  }

  private requestCast(p: PlayerState, input: CastInput): boolean {
    const now = this.state.time;
    const readyAt = this.castReadyAt(p, input);
    if (readyAt === null || readyAt - now > SPELL_BUFFER_WINDOW) return false;
    if (input.spell !== 'd') this.cancelApproach(p);
    if (readyAt <= now) {
      if (this.spellBuffer.get(p.id, now)?.input.spell === input.spell) this.spellBuffer.clear(p.id);
      return this.cast(p, input.spell, input.point, input.target);
    }
    this.spellBuffer.queue(
      p.id,
      input,
      this.recastShadow(p, input.spell)?.id ?? this.leblanc.returnPoint(p, input.spell)?.id ?? null,
      now,
    );
    return true;
  }

  private flushBufferedCasts() {
    for (const p of this.state.players) {
      const queued = this.spellBuffer.get(p.id, this.state.time);
      if (!queued) continue;
      const shadowId =
        this.recastShadow(p, queued.input.spell)?.id ??
        this.leblanc.returnPoint(p, queued.input.spell)?.id ??
        null;
      const readyAt = this.castReadyAt(p, queued.input);
      if (p.hp <= 0 || readyAt === null || shadowId !== queued.shadowId) {
        this.spellBuffer.clear(p.id);
        continue;
      }
      if (readyAt > this.state.time) continue;
      this.spellBuffer.clear(p.id);
      this.cast(p, queued.input.spell, queued.input.point, queued.input.target);
    }
  }

  private cast(p: PlayerState, key: SpellKey, point: Vec, target?: PlayerId): boolean {
    const now = this.state.time;
    const readyAt = this.castReadyAt(p, { action: 'cast', spell: key, point, target });
    if (readyAt === null || readyAt > now) return false;
    const shadow = this.recastShadow(p, key);
    if (shadow) {
      const old = p.pos;
      p.pos = { ...shadow.pos };
      shadow.pos = old;
      shadow.swapped = true;
      p.destination = null;
      p.windupUntil = 0;
      this.effect('blink', old, p.id);
      this.effect('blink', p.pos, p.id);
      return true;
    }
    const spell = SPELLS[key];
    const enemy = this.enemy(p);
    const targeted =
      (p.champion === 'singed' && key === 'e') ||
      (p.champion === 'zed' && key === 'r') ||
      (!!p.leblanc && !this.leblanc.returnPoint(p, key) && this.leblanc.spell(p, key) === 'q');
    if (targeted && distance(p.pos, enemy.pos) > this.targetedRange(p, enemy)) {
      this.approachTargets.set(p.id, key);
      p.destination = { ...enemy.pos };
      p.attacking = false;
      p.attackMove = null;
      p.windupUntil = 0;
      return true;
    }
    if (targeted) this.cancelApproach(p);
    if (p.leblanc && key !== 'd' && !this.leblanc.returnPoint(p, key)) p.leblanc.invisibleUntil = 0;
    if (p.ezreal && key !== 'd') return this.ezreal.cast(p, key, point);
    if (p.yasuo && key !== 'd') return this.yasuo.cast(p, key, point);
    if (p.leblanc && key !== 'd') return this.leblanc.cast(p, key, point);
    if (p.champion === 'singed' && key !== 'd') return this.singed.cast(p, key, point);
    if (p.champion === 'ahri' && key !== 'd') return this.ahri.cast(p, key, point);
    p.cooldowns[key] = now + spell.cooldown;
    if (key === 'q') this.shuriken(p, point);
    if (key === 'w') this.shadow(p, point);
    if (key === 'e') this.slash(p);
    if (key === 'r') this.ultimate(p, enemy);
    if (key === 'd') {
      this.effect('blink', p.pos, p.id);
      p.pos = bounded(towards(p.pos, point, SPELLS.d.range));
      p.destination = null;
      p.windupUntil = 0;
      this.effect('blink', p.pos, p.id);
      // Flash ends Sweeping Blade and carries its queued circular Q to the blink destination.
      this.yasuo.finishDash(p);
    }
    return true;
  }

  private newGroup(): number {
    const id = ++this.serial;
    this.groups.set(id, { hits: new Set(), damaged: false, expires: this.state.time + 2 });
    return id;
  }

  private origins(p: PlayerState): { id: number; pos: () => Vec; readyAt: number; alive: () => boolean }[] {
    return [
      { id: 0, pos: () => p.pos, readyAt: this.state.time, alive: () => true },
      ...p.shadows.map((s) => ({
        id: s.id,
        pos: () => s.pos,
        readyAt: s.readyAt,
        alive: () => s.expires > this.state.time,
      })),
    ];
  }

  private shuriken(p: PlayerState, point: Vec) {
    const group = this.newGroup();
    p.castUntil = this.state.time + SPELLS.q.cast;
    p.windupUntil = 0;
    p.facing = Math.atan2(point.y - p.pos.y, point.x - p.pos.x);
    for (const origin of this.origins(p))
      this.schedule(Math.max(SPELLS.q.cast, origin.readyAt - this.state.time), () => {
        if (!origin.alive() || (p.charm && p.charm.until > this.state.time)) return;
        const pos = { ...origin.pos() };
        const v =
          distance(pos, point) > 0 ? direction(pos, point) : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
        p.stats.shurikensThrown++;
        this.state.projectiles.push({
          id: ++this.serial,
          owner: p.id,
          group,
          origin: origin.id,
          pos,
          velocity: v,
          remaining: SPELLS.q.range,
        });
      });
  }

  private shadow(p: PlayerState, point: Vec) {
    const pos = bounded(towards(p.pos, point, SPELLS.w.range));
    const now = this.state.time;
    p.shadows = p.shadows.filter((s) => s.kind !== 'w');
    p.shadows.push({
      id: ++this.serial,
      kind: 'w',
      pos,
      from: { ...p.pos },
      created: now,
      readyAt: now + distance(p.pos, pos) / SPELLS.w.speed,
      expires: now + SPELLS.w.duration,
      swapUntil: now + SPELLS.w.duration,
      swapAfter: now,
      swapped: false,
    });
  }

  private registerHit(groupId: number, origin: number) {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.hits.add(origin);
    return group;
  }

  private slash(p: PlayerState) {
    const groupId = this.newGroup();
    for (const origin of this.origins(p)) {
      const apply = () => {
        if (!origin.alive()) return;
        this.effect('slash', origin.pos(), p.id);
        const enemy = this.enemy(p);
        const range = origin.id === 0 ? SPELLS.e.range : SPELLS.e.shadowRange;
        if (!this.targetable(enemy) || distance(origin.pos(), enemy.pos) > range + STATS.radius) return;
        const group = this.registerHit(groupId, origin.id)!;
        if (!group.damaged) {
          this.damage(p.id, enemy, SPELLS.e.damage, 'physical');
          group.damaged = true;
        }
        if (origin.id === 0) p.cooldowns.w = Math.max(this.state.time, p.cooldowns.w - SPELLS.e.reduction);
        if (origin.id !== 0 || group.hits.size > 1) {
          enemy.slow = group.hits.size > 1 ? SPELLS.e.slow * 1.5 : SPELLS.e.slow;
          enemy.slowUntil = this.state.time + SPELLS.e.duration;
        }
      };
      if (origin.readyAt > this.state.time) this.schedule(origin.readyAt - this.state.time, apply);
      else apply();
    }
  }

  private ultimate(p: PlayerState, enemy: PlayerState) {
    const now = this.state.time;
    const duration = SPELLS.r.delay + SPELLS.r.dash;
    p.untargetableUntil = now + duration;
    const approach = { started: now, origin: { ...p.pos }, target: enemy.id, attackAfter: true };
    p.ultimate = approach;
    p.destination = null;
    p.windupUntil = 0;
    p.shadows = p.shadows.filter((s) => s.kind !== 'r');
    const shadow: Shadow = {
      id: ++this.serial,
      kind: 'r',
      pos: { ...p.pos },
      from: { ...p.pos },
      created: now,
      readyAt: now,
      expires: now + SPELLS.r.shadowDuration,
      swapUntil: now + SPELLS.r.swapWindow,
      swapAfter: now + duration,
      swapped: false,
    };
    p.shadows.push(shadow);
    this.effect('vanish', p.pos, p.id);
    let cancelled = false;
    this.schedule(SPELLS.r.delay, () => {
      if (enemy.hp > 0 && distance(p.pos, enemy.pos) < 1950) return;
      cancelled = true;
      p.ultimate = null;
      this.effect('emerge', p.pos, p.id);
      p.untargetableUntil = this.state.time;
      p.cooldowns.r = this.state.time + SPELLS.r.cancelCooldown;
      p.shadows = p.shadows.filter((s) => s.id !== shadow.id);
    });
    this.schedule(duration, () => {
      if (cancelled) return;
      p.ultimate = null;
      const v = direction(p.pos, enemy.pos);
      p.pos = bounded({ x: enemy.pos.x + v.x * 125, y: enemy.pos.y + v.y * 125 });
      if (this.targetable(enemy))
        enemy.mark = { owner: p.id, expires: this.state.time + SPELLS.r.duration, stored: 0 };
      p.attackMove = null;
      p.attacking = approach.attackAfter;
      this.effect('emerge', p.pos, p.id);
    });
  }

  private updateProjectiles(dt: number) {
    this.state.projectiles = this.state.projectiles.filter((q) => {
      const step = Math.min(q.remaining, SPELLS.q.speed * dt);
      const next = { x: q.pos.x + q.velocity.x * step, y: q.pos.y + q.velocity.y * step };
      if (blockedByWindWall(this.state, q.owner, q.pos, next, SPELLS.q.width / 2)) return false;
      const target = this.state.players[1 - q.owner];
      const group = this.groups.get(q.group);
      const hit =
        group &&
        !group.hits.has(q.origin) &&
        this.targetable(target) &&
        segmentDistance(target.pos, q.pos, next) <= STATS.radius + SPELLS.q.width / 2;
      q.pos = next;
      q.remaining -= step;
      if (hit) {
        this.state.players[q.owner].stats.shurikensHit++;
        this.damage(q.owner, target, SPELLS.q.damage, 'physical');
        this.registerHit(q.group, q.origin);
      }
      return q.remaining > 0;
    });
  }

  private updateMark(p: PlayerState) {
    const now = this.state.time;
    if (p.mark && p.mark.expires <= now) {
      const mark = p.mark;
      p.mark = null;
      this.damage(mark.owner, p, STATS.ad + mark.stored * SPELLS.r.ratio, 'physical', false);
      this.effect('detonate', p.pos, mark.owner);
    }
  }

  private damage(
    owner: PlayerId,
    target: PlayerState,
    raw: number,
    type: 'physical' | 'magic' | 'true',
    store = true,
  ) {
    if (target.hp <= 0) return;
    if (store && type !== 'true' && target.mark?.owner === owner) target.mark.stored += raw;
    const stats = championStats(target.champion);
    const resistance = (type === 'physical' ? stats.armor : stats.mr) + potionBonus(target, this.state.time);
    const mitigated = type === 'true' ? raw : (raw * 100) / (100 + resistance);
    const amount = this.yasuo.absorb(target, mitigated);
    this.state.players[owner].stats.damageDealt += Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    this.effect('hit', target.pos, owner, amount);
    this.leblanc.damaged(target);
  }
}
