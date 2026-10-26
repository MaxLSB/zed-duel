# Singed combat notes

Research date: 2026-10-25. PC Summoner's Rift kit, level 18, maximum spell ranks, no items/runes. This is a fixed prototype baseline, not a live balance feed. Zed's original constants remain in `src/shared/balance.ts`; Singed's constants and mechanics are in `singed-balance.ts` and `singed.ts`.

## Sources

- [Riot's Singed champion page](https://www.leagueoflegends.com/en-us/champions/singed/) confirms the kit and the Fling/adhesive interaction.
- [Riot patch 26.7](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-7-notes/) confirms potion bonuses of 25/55/85. The implementation uses 85 at rank three.
- [Singed mechanics reference](https://wiki.leagueoflegends.com/en-us/Singed) supplies ranges, durations and coefficients. Search-indexed revisions were available; a direct fetch was blocked. The newer indexed revision includes the 25.7 poison AP adjustment to 10.625% per tick; older results still showed 10%.
- [Poison Trail data reference](https://wiki.leagueoflegends.com/en-us/Template%3AData_Singed/Poison_Trail) corroborates its radius, toggle lockout, cloud lifetime and tick coefficient.
- [Patch 26.21 stat table](https://lolvalue.com/lol-item-builder/singed) cross-checks base stats and the separate 0.625 attack-speed ratio. It reports 96 health growth; older references report 99. The prototype uses 96 (2,282 HP at level 18) and `0.7 + 0.625 × 0.019 × 17` attacks/second. This table is a secondary source, not Riot verification.

Fetching Riot Data Dragon's Singed JSON was unsuccessful in this environment. No purported Riot data snapshot has been added. Exact League parity and balance against Zed have not been established.

## Rules in this duel

| Ability | Behavior | Duel cooldown |
| --- | --- | --- |
| Passive | Within 225 units of the opponent, gain 25% movement speed for 2s | 10s per target |
| Q | Toggle poison; 180-radius clouds last 3.25s, poison lasts 2s, magic damage ticks every 0.25s | 1/3s toggle lockout |
| W | Place a 265-radius field within 1,000 units; 70% slow and grounding while inside; lasts 3s | 13/3s |
| E | Targeted melee Fling, 550-unit displacement; landing in the caster's adhesive roots for 2s | 8/3s |
| R | 10s of +85 AP, armor, MR, flat speed and health regeneration per 5s; poison applies 40% healing reduction | 10s |
| D | Shared Flash, 400 units | 10s |

These cooldowns deliberately follow the existing Zed sandbox rules, including dividing Q's static toggle lockout by three. Mana is omitted. R lasts 10 seconds as a deliberate duel override, followed by a 10-second cooldown starting when the buff ends (20 seconds between casts). Bonuses never stack. A shrinking ring shows the remaining duration to both players and turns amber for the final three seconds. The R icon is highlighted without a number while active; its numeric cooldown appears only after the buff ends. There is no mana regeneration to apply. Buffed health regeneration is +17 HP/second, before healing reduction.

Q deals 15 + 10.625% AP per tick. Overlapping clouds from one caster refresh poison without multiplying ticks. E deals 90 + 8% target maximum HP + 55% AP as magic damage. Damage uses the defender's champion stats and potion defenses; Zed's passive also uses the defender's actual maximum health. Singed has no Zed attack passive, shurikens or shadows.

The Node server and browser host validate champion IDs. Initial host/guest picks travel through the peer connection and worker; waiting-room selection uses the same validated command on both transports. Missing choices default to Zed for existing clients. Players select before a match; changing a pick clears readiness. Rematches preserve choices and clear all combat state. Solo practice uses a Zed dummy that never acts, but can be displaced by Fling.

## Timing and fidelity limits

- The existing 60 Hz simulation resolves all timings. Poison clouds spawn every 0.25s, 20 units behind Singed. This simplifies League's movement-dependent cloud placement and cadence. Contact is checked every simulation tick; poison ticks every 0.25s, including initial contact. Exact refresh/expiry tick counts are not claimed to match the client.
- W locks movement/casts for 0.25s and becomes active 0.375s after input. Out-of-range placement clamps to range. Its travel is a telegraphed field, not a projectile that can collide with wind walls.
- E approaches until within 125 units plus both collision radii. Its 0.25s cast revalidates the target before spending cooldown or dealing damage. Flight takes 0.693s, linearly across the arena with a visual arc. Landing clamps to arena bounds. Root applies only on the caster's active adhesive. Terrain and airborne immunity are absent.
- Grounding and roots prevent Flash, Death Mark activation/return and Living Shadow swaps. A fresh shadow, shuriken or slash can still cast. Airborne targets cannot cast; Stop cancels follow-up attacks and pending approach orders.
- Passive has one opposing champion to trigger against. Movement uses the existing linear arena speed model without League's movement-speed soft caps.
- Existing poison continues through Zed's untargetable ultimate; new cloud contact does not apply poison while untargetable. Potion poison refreshes healing reduction for one second on each damage tick. The only healing system here is regeneration.
- Match damage includes poison and Fling. Shuriken statistics show a dash for Singed; a Singed mirror omits those rows. Replay snapshots include zones, toggles, buffs and crowd control.

## Validation

After rebasing onto the GitHub Pages changes on main, all 71 non-network combat, protocol, room, browser-host and connection checks pass. Type checking, the Node frontend build and the GitHub Pages build pass. Added browser scenarios cover Singed practice, shared keybindings, reload/reset behavior and mixed champion rooms on both transports. The prior manual local playtest also confirmed Singed renders and plays.

The WebSocket integration test and both Playwright servers could not bind localhost ports in the implementation sandbox (`listen EPERM`). Broader execution permission was rejected by the environment policy. These checks still need to run in a normal local terminal:

```sh
npm test
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
PLAYWRIGHT_CHANNEL=chrome npm run test:pages
```

The in-memory room tests exercise command processing and serialized broadcasts without opening ports. They do not replace the blocked real-browser/transport checks.
