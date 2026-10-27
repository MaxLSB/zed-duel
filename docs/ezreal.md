# Ezreal combat notes

Ezreal uses the shared level-18, maximum-rank, no-item duel model. Select him in either lobby, after a match, or with `?practice=1&champion=ezreal`. The same kit runs in Node rooms and the browser host, including mixed and mirror matches, rematches, practice resets and killcam playback.

## Sources and values

[Riot's champion overview](https://www.leagueoflegends.com/en-us/champions/ezreal/) describes the five abilities. Numerical reference: [League of Legends Wiki, Ezreal](https://wiki.leagueoflegends.com/en-us/Ezreal), checked 27 October 2026 (through patch 26.16). The implementation pins these values; it does not fetch balance data at runtime.

Level-18 stats are 2334 HP, 3.01 HP/s regeneration, 123.75 AD, 95.4 armor, 51.7 MR, 325 movement speed, 550 attack range and 65 radius. Attack speed is `0.625 × (1 + 17 × 0.025)`; windup uses 18.839% of the attack interval.

| Spell   | Max-rank reference used                                                                         |
| ------- | ----------------------------------------------------------------------------------------------- |
| Passive | 10% bonus attack speed per stack, up to five, lasting six seconds                               |
| Q       | 120 + 130% total AD physical damage; 1200 range, 120 width, 2000 speed, 0.25s cast              |
| W       | 300 magic damage on detonation; four-second mark, 1200 range, 160 width, 1700 speed, 0.25s cast |
| E       | 280 magic damage; 475 blink range, 750 bolt targeting range, 0.25s cast                         |
| R       | 750 magic damage; 320 width, 2000 speed, one-second windup                                      |

No items means zero AP and zero bonus AD. Stat growth is part of base AD. Q therefore deals 280.875 raw damage; W/E/R use their base damage.

## Duel adaptations

- Q/W/E cooldowns are divided by three: 1.5s, 2.67s and 4.67s. R and Flash use 10s. Mystic Shot's hit refund is also divided by three, to 0.5s on Q/W/E/R. Flash is excluded. This preserves the refund's proportion of the accelerated basic cooldowns.
- Mana costs and W's mana refund do not apply. The passive is a continuous hit-based buff with no extra cooldown, like the other roster's stacking mechanics. W application grants no stack; detonation grants one, plus the triggering spell's stack when applicable. Attacks alone do not grant stacks.
- Arcane Shift uses a 2000-unit/s homing bolt, targeting the single visible, targetable opponent. There are no minions or alternate targets to prioritize. Its projectile can be blocked by Wind Wall or lost if the target disappears. Target range includes the enemy radius, as with the other kits.
- Trueshot Barrage travels the arena diagonal, enough to cross the entire playable arena from any point. It continues after impact but damages the opponent only once. Its captured windup origin remains fixed through Flash; Q and W launch from the caster's position when their cast finishes.
- Crowd control interrupts casts using the existing simulation rules. Roots and adhesive prevent E/Flash; acquiring either during E's windup cancels the blink while retaining its cooldown. The League-specific E crowd-control buffering exception is not modeled.
- Basic attacks use the roster's shared impact timing and cosmetic bolt travel. Passive attack-speed bonuses affect both windup and recovery. Wind Wall blocks all four spell projectiles and ranged attacks; blocked hits grant no stacks, mark or cooldown refund. Skillshots can hit an invisible enemy; E requires visibility.
- Flux belongs to its caster, does no damage on application, refreshes without detonating, and expires independently in mirror matches. Only that caster's connecting attack or Q/E/R detonates it. All damage uses the shared defenses, shields, actual-damage stats and death resolution.

## Presentation and transport

Original canvas geometry gives Ezreal blond hair, goggles, an explorer's jacket and a brass gauntlet. Cyan bolts, a gold Flux ring and a wide ultimate crescent distinguish his abilities. The passive HUD shows `0/5` through `5/5`; small body arcs and a shrinking bar show stacks and duration. Ultimate windup and Flux detonation have separate feedback. No external art, audio or runtime dependency was added.

The champion allowlist feeds both Node and Cloudflare guest validation. Deploy the updated relay before publishing the frontend; the existing `signal:check` deployment gate now checks Ezreal automatically. Both browsers must reload after deployment. Older snapshots without the Ezreal missile array are rejected by the existing incompatible-host UI.

## Validation

`tests/ezreal.test.ts` covers damage, refunds, misses, mark ownership and expiry, all four detonators, blink limits, untargetability, stealth, roots/grounding, ultimate origin and travel, Charm interruption, Wind Wall, passive timing, spell buffering, host serialization, rematches, resets, replay snapshots and incompatible hosts. Node room tests cover serialized missiles, marks and pending-cast reset. Existing all-champion selection checks include Ezreal.

`tests/ezreal-browser.ts` runs the same practice, bindings, reset, guest-selection, combat synchronization and mirror-selection scenarios against Node and Pages. Browser execution requires permission to bind local test-server ports.
