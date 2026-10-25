import { ARENA } from './balance';
import type { Vec } from './types';

export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const direction = (a: Vec, b: Vec): Vec => {
  const length = distance(a, b) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};
export const bounded = (p: Vec): Vec => ({
  x: clamp(p.x, ARENA.margin, ARENA.width - ARENA.margin),
  y: clamp(p.y, ARENA.margin, ARENA.height - ARENA.margin),
});
export function towards(from: Vec, to: Vec, amount: number): Vec {
  return lerp(from, to, Math.min(1, amount / (distance(from, to) || 1)));
}
export function segmentDistance(point: Vec, from: Vec, to: Vec): number {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return distance(point, lerp(from, to, t));
}
