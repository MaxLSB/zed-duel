import type { SpellKey } from './balance';

export interface Vec {
  x: number;
  y: number;
}
export type PlayerId = 0 | 1;
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
}
export interface PlayerState {
  id: PlayerId;
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
  kind: 'slash' | 'blink' | 'hit' | 'passive' | 'attack' | 'vanish' | 'emerge' | 'detonate';
  pos: Vec;
  owner: PlayerId;
  at: number;
  amount?: number;
}
export interface GameState {
  time: number;
  phase: Phase;
  countdown: number;
  players: [PlayerState, PlayerState];
  projectiles: Projectile[];
  effects: Effect[];
  winner: PlayerId | 'draw' | null;
}
export type Input =
  | { action: 'move' | 'attack-move'; point: Vec }
  | { action: 'attack' | 'stop' }
  | { action: 'cast'; spell: SpellKey; point: Vec; target?: PlayerId };
export type ClientMessage =
  | { type: 'create' | 'practice' | 'reset-practice' }
  | { type: 'join'; code: string }
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
