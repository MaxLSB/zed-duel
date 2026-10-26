# Ahri combat notes

Research date: 2026-10-26. PC League kit, level 18, maximum spell ranks, no items or runes. These are fixed prototype values, not a live balance feed.

## Sources

- [Riot's Ahri page](https://www.leagueoflegends.com/en-us/champions/ahri/) identifies the kit, champion-kill healing, and three Spirit Rush casts with takedown extensions.
- [Riot patch 26.6](https://www.leagueoflegends.com/en-ph/news/game-updates/league-of-legends-patch-26-6-notes/) confirms Q's rank-five damage is 135 per pass.
- [Ahri mechanics reference](https://wiki.leagueoflegends.com/en-us/Ahri) supplies the spell timings, ranges, damage types and repeat-hit rules. Its search-indexed current revision was consulted, including 1.8s maximum Charm duration and 40% repeat Fox-Fire damage.
- [Patch 26.21 stat table](https://lolvalue.com/lol-item-builder/ahri) cross-checks 2,358 HP, 104 AD, 330 movement speed, 550 attack range and 12.7 regeneration per 5s. The mechanics reference distinguishes the 0.668 base attack speed from its 0.625 ratio: `0.668 + 0.625 × 0.022 × 17 = 0.90175`. Older tables disagree on health/armor growth; this implementation uses 104/4.2, giving 92.4 armor and 52.1 MR.

Data Dragon's `16.21.1` Ahri JSON could not be fetched in this environment. No Riot JSON snapshot is claimed or included. Secondary mechanics sources supplement Riot's descriptions; exact League parity and matchup balance are not established.

## Duel behavior

| Ability | Implementation | Cooldown |
| --- | --- | --- |
| Essence Theft | Heal 60 HP every three spell casts that hit, capped at maximum HP and reduced by healing reduction | No cooldown |
| Q · Orb of Deception | 900-unit outbound orb, 135 magic damage; homes back to Ahri for 135 true damage; each pass hits once | 7/3s |
| W · Fox-Fire | Three homing flames: 120 + 48 + 48 magic damage to the opponent; 40% speed boost decays over 2s | 5/3s |
| E · Charm | 1,000-unit skillshot; 240 magic damage; 1.8s forced movement toward Ahri at 65% reduced speed | 4s |
| R · Spirit Rush | Dash up to 500 units, then launch one 175 magic damage bolt at the opponent within 600 units; three casts, 1s apart, within 15s | 10s after the final cast or window expiry |
| D · Flash | Shared 400-unit blink | 10s |

Q/W/E follow the existing one-third cooldown convention. Mana and AP items are absent. R's cooldown starts after the sequence closes so the duel's 10s override cannot refill charges inside a 15s window. This deliberately differs from League's cooldown starting on activation.

Essence Theft is a custom duel passive: every three spell casts that connect heal 60 HP. Q counts once across both passes; W counts once across its three flames; each R dash can count when its bolt hits. Misses, basic attacks and kills grant no separate credit. The counter resets when healing triggers, even at full HP, and resets between rounds. The HUD displays 0/3, 1/3 or 2/3. This replaces League's minion-stack and champion-kill healing. R's extra charge and duration on takedown have no further combat use because a kill ends the round, so they remain omitted.

## Timing and fidelity limits

- Q and E have 0.25s cast times and constant 1,550-unit/second projectile speed. Q does not reproduce League's outbound/return acceleration. Its return tracks Ahri's current position, including after Flash or a dash. Projectiles expire after five seconds as a defensive bound.
- W seeks the sole opponent within 725 units. Flames launch after 0.25s, then 0.1s apart; unspent flames expire after 2.5s. Recasting replaces unspent flames and refreshes the speed buff. Target priorities and minion bonuses are irrelevant here. Repeat damage is assigned in launch order. Homing missiles disappear if their target becomes untargetable.
- R moves over time at a fixed 1,530 units/second and clamps to arena edges. It is targetable and interruptible, not a blink. W may cast during a dash; other casts wait until it finishes. The ending bolt requires a living, targetable enemy in range. Terrain and multiple targets are absent.
- Charm interrupts attack windups, buffered casts, targeted approaches, cast windups, Fling flight and Spirit Rush. It rejects player movement, attack and spell commands while active, including Flash. Forced movement follows the caster and respects roots and arena bounds. Untargetable Zed cannot be hit. Existing poison continues to tick. Singed's Fling can interrupt Ahri's dash; roots and adhesive prevent starting R or Flash.
- Ahri's ranged basic attacks use the shared windup/range validation and deal physical damage immediately at windup completion; a small cosmetic orb travels during the windup, followed by an impact spark, without adding a missile travel delay to damage. Movement uses the existing linear model without League's speed soft caps.
- All additional state is serialized for Node rooms, browser hosts and killcam. Non-Zed champions have no shuriken statistics. Reset/rematch clears missiles, charms, flames and dash charges and preserves picks. Practice keeps a Zed dummy; Charm can displace it.
- Artwork is original Canvas geometry and SVG icons. Ahri uses a compact nine-tail fan, dark angular clothing, a small fox-eared silhouette and player-color outlines matching Zed and Singed. No Riot art assets are bundled.

## Integration and rollout

Select Ahri in the lobby or waiting room, or open `?practice=1&champion=ahri`. On Pages the path is `/zed-duel/?practice=1&champion=ahri`. Bindings remain shared with other champions; the defaults are A/Z/E/R/D.

Deploy the updated Cloudflare relay before publishing the Pages frontend: the previous relay's champion allowlist rejects an Ahri guest handshake. Restart Node servers and reload both browser clients together. New clients reject snapshots from older builds that lack Ahri missile state and display the existing update message.

## Validation

Combat tests cover both orb damage types, return tracking, invulnerability, flame damage and expiry, Charm interruption and control lockout, dash limits, grounding, passive healing and resets. In-memory tests cover Node serialization and browser host selection, guest picks, rematches and practice resets. The same two browser scenarios run against Node and Pages to exercise selection, bindings, casting, reset/reload and mixed duels.

All 97 tests excluding the real WebSocket integration test pass. Type checks for the application and Cloudflare Worker, the Node frontend build, and the Pages frontend build pass. The Cloudflare Worker dry-run bundle passes. Both Playwright suites discover the four new scenarios.

Localhost listeners are prohibited by this implementation environment (`listen EPERM`). Real WebSocket and Playwright execution require CI or a normal local terminal; the in-memory checks do not substitute for them:

```sh
npm test
npm run test:browser
npm run test:pages
```
