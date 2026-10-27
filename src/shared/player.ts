import { SPELL_KEYS } from './balance';
import type { SpellKey } from './balance';
import type { PlayerId, PlayerState } from './types';
import type { ChampionId } from './types';
import { championStats } from './champions';

export class Player implements PlayerState {
  pos;
  facing;
  hp: number;
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
  singed: PlayerState['singed'];
  ahri: PlayerState['ahri'];
  leblanc: PlayerState['leblanc'];
  yasuo: PlayerState['yasuo'];
  ezreal: PlayerState['ezreal'];
  flux: PlayerState['flux'] = null;
  sigils: PlayerState['sigils'] = [];
  charm: PlayerState['charm'] = null;
  poison: PlayerState['poison'] = null;
  grievousUntil = 0;
  rootUntil = 0;
  airborne: PlayerState['airborne'] = null;

  constructor(
    public id: PlayerId,
    public champion: ChampionId = 'zed',
  ) {
    this.hp = championStats(champion).hp;
    this.ezreal = champion === 'ezreal' ? { stacks: 0, stacksUntil: 0, casting: null } : null;
    this.yasuo =
      champion === 'yasuo'
        ? {
            flow: 0,
            shield: 0,
            shieldUntil: 0,
            stacks: 0,
            stacksUntil: 0,
            dashTargetUntil: 0,
            dashStacks: 0,
            dashStacksUntil: 0,
            ultimateUntil: 0,
            dash: null,
          }
        : null;
    if (champion === 'yasuo')
      this.stats.yasuo = {
        tempestsCast: 0,
        tempestsHit: 0,
        knockups: 0,
        projectilesBlocked: 0,
        dashesHit: 0,
        ultimatesHit: 0,
        shieldAbsorbed: 0,
      };
    if (champion === 'ahri')
      this.stats.ahri = {
        orbsThrown: 0,
        orbOutHits: 0,
        orbReturnHits: 0,
        charmsThrown: 0,
        charmsHit: 0,
        fireHits: 0,
        rushHits: 0,
        healing: 0,
      };
    if (champion === 'singed')
      this.stats.singed = {
        poisonDamage: 0,
        poisonSeconds: 0,
        flingsHit: 0,
        adhesiveRoots: 0,
        potionSeconds: 0,
      };
    if (champion === 'leblanc')
      this.stats.leblanc = {
        sigilsDetonated: 0,
        distortionHits: 0,
        chainsThrown: 0,
        chainsHit: 0,
        chainRoots: 0,
        mimicHits: 0,
        returnsUsed: 0,
      };
    this.leblanc =
      champion === 'leblanc'
        ? { lastSpell: null, invisibleUntil: 0, clone: null, returns: { w: null, r: null }, dash: null }
        : null;
    this.ahri =
      champion === 'ahri'
        ? {
            essenceHits: 0,
            fireCastId: 0,
            hasteUntil: 0,
            fires: 0,
            fireAt: 0,
            fireUntil: 0,
            fireHits: 0,
            rushUntil: 0,
            rushCharges: 0,
            rushAt: 0,
            dash: null,
          }
        : null;
    this.singed =
      champion === 'singed' ? { poisonOn: false, cloudAt: 0, slipstreamUntil: 0, insanityUntil: 0 } : null;
    this.pos = { x: id === 0 ? 500 : 1900, y: 700 };
    this.facing = id === 0 ? 0 : Math.PI;
  }
}
