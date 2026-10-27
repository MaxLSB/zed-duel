import { STEP } from './balance';
import type { Input, PlayerId } from './types';

export const SPELL_BUFFER_WINDOW = 0.5;
export type CastInput = Extract<Input, { action: 'cast' }>;

interface BufferedCast {
  input: CastInput;
  shadowId: number | null;
  expires: number;
}

export class SpellBuffer {
  private pending = new Map<PlayerId, BufferedCast>();

  queue(player: PlayerId, input: CastInput, shadowId: number | null, now: number) {
    this.pending.set(player, {
      input: { ...input, point: { ...input.point } },
      shadowId,
      expires: now + SPELL_BUFFER_WINDOW,
    });
  }

  get(player: PlayerId, now: number) {
    const cast = this.pending.get(player);
    if (cast && now <= cast.expires + STEP) return cast;
    this.pending.delete(player);
  }

  clear(player?: PlayerId) {
    if (player === undefined) this.pending.clear();
    else this.pending.delete(player);
  }
}
