import { segmentDistance } from './geometry';
import type { GameState, PlayerId, Vec } from './types';

// Sweep the whole movement segment so fast missiles cannot tunnel through a wall.
export function blockedByWindWall(state: GameState, owner: PlayerId, from: Vec, to: Vec, radius: number) {
  for (const wall of state.windWalls) {
    if (wall.owner === owner || wall.expires <= state.time) continue;
    const cross = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const intersects =
      cross(from, to, wall.from) * cross(from, to, wall.to) < 0 &&
      cross(wall.from, wall.to, from) * cross(wall.from, wall.to, to) < 0;
    if (
      intersects ||
      Math.min(
        segmentDistance(from, wall.from, wall.to),
        segmentDistance(to, wall.from, wall.to),
        segmentDistance(wall.from, from, to),
        segmentDistance(wall.to, from, to),
      ) <= radius
    ) {
      state.players[wall.owner].stats.yasuo!.projectilesBlocked++;
      return true;
    }
  }
  return false;
}
