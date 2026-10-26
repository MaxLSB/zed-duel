import type { SpellKey } from './balance';

export interface Vec {
  x: number;
  y: number;
}
export type PlayerId = 0 | 1;
export type ChampionId = 'zed' | 'singed' | 'ahri' | 'leblanc';
export interface LeblancState {
  lastSpell: 'q' | 'w' | 'e' | null;
  invisibleUntil: number;
  clone: { pos: Vec; destination: Vec; facing: number; appears: number; expires: number } | null;
  returns: Record<'w' | 'r', { id: number; pos: Vec; readyAt: number; expires: number } | null>;
  dash: { from: Vec; to: Vec; started: number; ends: number; damage: number; mimic: boolean } | null;
}
export interface LeblancMissile {
  id: number;
  owner: PlayerId;
  kind: 'sigil' | 'chain';
  mimic: boolean;
  pos: Vec;
  velocity: Vec;
  remaining: number;
  expires: number;
}
export interface Sigil {
  owner: PlayerId;
  mimic: boolean;
  expires: number;
  damage: number;
}
export interface Chain {
  id: number;
  owner: PlayerId;
  target: PlayerId;
  mimic: boolean;
  started: number;
  triggers: number;
}
export interface AhriState {
  essenceHits: number;
  fireCastId: number;
  hasteUntil: number;
  fires: number;
  fireAt: number;
  fireUntil: number;
  fireHits: number;
  rushUntil: number;
  rushCharges: number;
  rushAt: number;
  dash: { from: Vec; to: Vec; started: number; ends: number } | null;
}
export interface AhriMissile {
  id: number;
  castId: number;
  owner: PlayerId;
  kind: 'orb' | 'charm' | 'fire' | 'rush';
  pos: Vec;
  velocity: Vec;
  remaining: number;
  returning: boolean;
  hit: boolean;
  damage: number;
  expires: number;
}
export interface SingedState {
  poisonOn: boolean;
  cloudAt: number;
  slipstreamUntil: number;
  insanityUntil: number;
}
export interface GroundZone {
  id: number;
  kind: 'poison' | 'adhesive';
  owner: PlayerId;
  pos: Vec;
  created: number;
  expires: number;
}
export interface Airborne {
  owner: PlayerId;
  from: Vec;
  to: Vec;
  started: number;
  ends: number;
}
export type Phase = 'waiting' | 'countdown' | 'active' | 'finished';
export interface Shadow {
  id: number;
  kind: 'w' | 'r';
  pos: Vec;
  from: Vec;
  created: number;
  readyAt: number;
  expires: number;
  swapUntil: number;
  swapAfter: number;
  swapped: boolean;
}
export interface Mark {
  owner: PlayerId;
  expires: number;
  stored: number;
}
export interface UltimateApproach {
  attackAfter: boolean;
  started: number;
  origin: Vec;
  target: PlayerId;
}
export interface MatchStats {
  shurikensThrown: number;
  shurikensHit: number;
  attacksHit: number;
  damageDealt: number;
  ahri?: {
    orbsThrown: number;
    orbOutHits: number;
    orbReturnHits: number;
    charmsThrown: number;
    charmsHit: number;
    fireHits: number;
    rushHits: number;
    healing: number;
  };
  singed?: {
    poisonDamage: number;
    poisonSeconds: number;
    flingsHit: number;
    adhesiveRoots: number;
    potionSeconds: number;
  };
  leblanc?: {
    sigilsDetonated: number;
    distortionHits: number;
    chainsThrown: number;
    chainsHit: number;
    chainRoots: number;
    mimicHits: number;
    returnsUsed: number;
  };
}
export interface PlayerState {
  id: PlayerId;
  champion: ChampionId;
  singed: SingedState | null;
  ahri: AhriState | null;
  leblanc: LeblancState | null;
  sigils: Sigil[];
  charm: { owner: PlayerId; until: number } | null;
  poison: { owner: PlayerId; until: number; tickAt: number } | null;
  grievousUntil: number;
  rootUntil: number;
  airborne: Airborne | null;
  pos: Vec;
  facing: number;
  hp: number;
  stats: MatchStats;
  destination: Vec | null;
  attackMove: Vec | null;
  attacking: boolean;
  attackAt: number;
  windupUntil: number;
  castUntil: number;
  untargetableUntil: number;
  ultimate: UltimateApproach | null;
  passiveAt: number;
  slowUntil: number;
  slow: number;
  cooldowns: Record<SpellKey, number>;
  shadows: Shadow[];
  mark: Mark | null;
}
export interface Projectile {
  id: number;
  owner: PlayerId;
  group: number;
  origin: number;
  pos: Vec;
  velocity: Vec;
  remaining: number;
}
export interface Effect {
  id: number;
  kind: 'slash' | 'blink' | 'hit' | 'passive' | 'attack' | 'vanish' | 'emerge' | 'detonate' | 'distortion';
  pos: Vec;
  owner: PlayerId;
  at: number;
  amount?: number;
  // Basic attacks capture their origin; Fling's existing impact has no origin.
  from?: Vec;
}
export interface GameState {
  time: number;
  phase: Phase;
  countdown: number;
  players: [PlayerState, PlayerState];
  projectiles: Projectile[];
  ahriMissiles: AhriMissile[];
  leblancMissiles: LeblancMissile[];
  chains: Chain[];
  zones: GroundZone[];
  effects: Effect[];
  winner: PlayerId | 'draw' | null;
}
export type Input =
  | { action: 'move' | 'attack-move'; point: Vec }
  | { action: 'attack' | 'stop' }
  | { action: 'cast'; spell: SpellKey; point: Vec; target?: PlayerId };
export type ClientMessage =
  | { type: 'create' | 'practice'; champion?: ChampionId }
  | { type: 'reset-practice' }
  | { type: 'select-champion'; champion: ChampionId }
  | { type: 'join'; code: string; champion?: ChampionId }
  | { type: 'ready' | 'leave' }
  | { type: 'ping'; sent: number }
  | { type: 'input'; seq: number; input: Input };
export interface RoomState {
  mode: 'duel' | 'practice';
  code: string;
  connected: [boolean, boolean];
  ready: [boolean, boolean];
  game: GameState;
}
export type ServerMessage =
  | { type: 'joined'; code: string; player: PlayerId }
  | { type: 'state'; room: RoomState; ack: number }
  | { type: 'error'; message: string }
  | { type: 'pong'; sent: number }
  | { type: 'left' };
