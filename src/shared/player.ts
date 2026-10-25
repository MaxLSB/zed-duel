import { SPELL_KEYS, STATS } from './balance';
import type { SpellKey } from './balance';
import type { PlayerId, PlayerState } from './types';

export class Player implements PlayerState {
  pos;
  facing;
  hp: number = STATS.hp;
  stats: PlayerState['stats'] = { shurikensThrown: 0, shurikensHit: 0, attacksHit: 0, damageDealt: 0 };
  destination: PlayerState['destination'] = null;
  attackMove: PlayerState['attackMove'] = null;
  attacking = false;
  attackAt = 0;
  windupUntil = 0;
  castUntil = 0;
  untargetableUntil = 0;
  ultimate: PlayerState['ultimate'] = null;
  passiveAt = 0;
  slowUntil = 0;
  slow = 0;
  cooldowns = Object.fromEntries(SPELL_KEYS.map((key) => [key, 0])) as Record<SpellKey, number>;
  shadows: PlayerState['shadows'] = [];
  mark: PlayerState['mark'] = null;

  constructor(public id: PlayerId) {
    this.pos = { x: id === 0 ? 500 : 1900, y: 700 };
    this.facing = id === 0 ? 0 : Math.PI;
  }
}
