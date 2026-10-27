# Yasuo combat notes

Research date: 2026-10-27. Yasuo uses the existing authoritative simulation, bindings, spell buffer, practice mode, transports and killcam. His body, katana, wind effects and icons are original Canvas/SVG geometry.

## References and scope

- [Riot's Yasuo champion page](https://www.leagueoflegends.com/en-us/champions/yasuo/) establishes his wind swordsman identity, movement-generated shield, ability names, and airborne-only Last Breath that refills Flow and clears Gathering Storm.
- [Riot's Champion Spotlight](https://www.youtube.com/watch?v=fkM20LgOdKQ) demonstrates the thrust/tornado sequence, projectile wall, targeted dash, circular dash-Q and airborne finisher. This is a historical mechanics reference, not a source for current balance numbers.
- [Yasuo mechanics reference](https://wiki.leagueoflegends.com/en-us/Yasuo) was consulted for stack expiry, ranges, collision widths, per-target dash lockout and timings.
- [Kyriaos's Yasuo combo guide](https://www.mobafire.com/league-of-legends/build/kyriaos-yasuo-adc-season-11-guide-587755) describes Airblade: E-Q into R transfers the circular Q to the ultimate destination and grants a fresh stack. This is the finishing sequence used in Keyblade.

Values below are an explicit fixed level-18, maximum-rank, no-item duel baseline, not a verified current-patch data export. Balance testing against human opponents remains useful.

## Duel kit

Default keys are A/Z/E/R/D; Q/W/E/R below are ability slots, compatible with saved rebinding.

| Ability | Behavior | Cooldown |
| --- | --- | --- |
| Way of the Wanderer | Actual walking and E travel build 100 Flow per 4,000 units. At full Flow, incoming damage consumes it for a 475-point shield lasting 1 second. | Movement charged |
| Q · Steel Tempest | A 450-unit thrust with 80-unit width deals 227.625 physical damage after a roughly 0.219s cast. Hits grant a stack lasting 6 seconds. At two stacks, the next cast consumes them to launch a 1,150-unit tornado, 180 units wide, at 1,200 units/s; it knocks up for 0.9s. | About 0.836s |
| W · Wind Wall | A stationary 600-unit wall perpendicular to the aim, 100 units ahead, destroys hostile projectiles for 4 seconds. | 17/3s |
| E · Sweeping Blade | Hover an enemy within 475 units plus their radius. Dash 475 units through them at 957 units/s, dealing 130 magic damage once upon contact. Cannot dash through that target again for 6 seconds. | 0.1s; 6s target lockout |
| R · Last Breath | Automatically select the closest airborne opponent within 1,400 units plus their radius. Blink to the opposite side, face them, refill Flow, clear Q stacks, suspend the target and lock Yasuo's actions for 1 second, then deal 500 physical damage. | 10s |
| D · Flash | Shared 400-unit blink. | 10s |

Q cast speed and cooldown scale from the fixed attack-speed baseline; Q cooldown also follows the duel's one-third convention. W follows that same convention. E retains its 0.1s minimum and its separate target lockout. R and Flash follow the 10-second convention. There are no resource costs.

## Interactions and adaptations

- Q during E queues a circular slash with a 215-unit radius at the end of the dash. Empowered E-Q knocks up without launching a tornado. A dash accepts one queued Q. Flash is allowed during E: it ends the dash and immediately resolves the queued circular Q at the Flash destination, including the empowered knockup. The blink path deals no E damage and builds no Flow; existing E hits are not repeated. Crowd-control interruption cancels the pending slash.
- E started with at most 0.5s left on Q permits an immediate dash-Q. The borrowed time is added to the next Q cooldown. Airblade (tornado → E-Q → R, or A → E-A → R on default bindings) carries that accepted slash to R's landing position, where it deals Q damage once after old stacks are cleared; a normal slash grants one fresh stack. E damage already dealt is retained, but R's teleport never creates an extra E hit. Invalid R attempts leave the dash-Q intact. The full E-Q-Flash → E-Q-R Keyblade needs another dash target because E's per-target lockout still applies; this duel has no minions.
- E's damage bonus is 25% per successful hit stack, up to four, with a 5-second expiry. With one opponent and a 6-second target lockout, stacks normally expire before the next valid dash. There are no minions to chain through.
- Roots and adhesive block E, R and Flash. Roots stop an existing E. Charm and knockups cancel E and Q windups. R requires a live, visible, targetable, currently airborne opponent; invalid or out-of-range E/R inputs spend no cooldown and do not auto-approach. R ignores the cursor and input target; in this two-player duel the sole opponent is the only candidate. E still requires hovering the opponent.
- Wind Wall checks swept projectile segments before damage. It blocks Zed's shurikens (including shadows), every Ahri missile including the returning true-damage orb, both ordinary and mimicked LeBlanc missiles, opposing tornadoes, and ranged basic attacks. Ranged attacks retain the existing instantaneous hit model and check the full line at impact. Friendly projectiles, melee attacks, thrust Q, poison, slashes, dash impacts and existing tethers pass through. The wall is stationary rather than drifting; it grants no vision in this open arena.
- Shield absorption happens after defenses, including on true damage. Damage statistics count only HP actually removed; shield statistics count damage actually absorbed. Idle time, blocked movement, body collision, Flash, forced movement and R's blink do not generate Flow. R explicitly refills it.
- No items or critical-strike system exist in this game. Yasuo therefore has no critical hits, no item critical-chance multiplier, and no post-R critical-strike armor penetration. These are intentionally omitted rather than simulated with random free crits. Base attacks remain ordinary physical attacks.
- R suspends a single opponent because matches contain two players. Yasuo remains targetable during the finisher; interruption cancels its scheduled damage. Blink/dash endpoints clamp to the arena. There are no turret-positioning rules or team knockup combinations.

## UI and networking

Choose Yasuo in the lobby or between rounds. Practice URL: `?practice=1&champion=yasuo`; Pages URL: `/zed-duel/?practice=1&champion=yasuo`. Practice keeps the stationary Zed dummy.

Flow has a small bar under Yasuo's health and a numeric passive counter. Q uses the same active highlight as Singed's R when empowered, without stack counts or WIND text. The E slot shows only its 0.1-second spell cooldown. The separate 6-second target lockout appears only as a small shrinking ring without text on the opponent, visible to the Yasuo player; it hides on death, untargetability, stealth and expiry. Last Breath briefly lifts Yasuo and traces three small cuts over the suspended opponent, followed by a short finishing slash. R shows a dash when no airborne target is available. Walls, tornadoes, thrusts, circular slashes and the finisher are visible in both live play and killcam. Match recaps show shared 1v1 stats only: damage dealt, damage taken, basic attacks hit, health remaining and match duration.

Reset, rematch and disconnect clear transient state and counters while retaining the appropriate picks. Both Node rooms and browser hosts serialize the same state. Clients reject snapshots missing wind-wall/tornado state or the Yasuo kit. The Cloudflare relay uses the shared champion validator, so deploy its updated bundle before publishing a frontend that permits Yasuo guest picks. No deployment is included in this branch.

## Validation

`tests/yasuo.test.ts` covers hit/miss stacking, expiry, knockups, physical/magic mitigation, Flow, shield expiry, projectile families and wall boundaries, ranged/melee attacks, dash travel and target lockout, E-Q, interruption, invalid targets, R timing, protocol/relay validation, snapshots, recaps, practice reset and guest rematches. Shared champion-selection and recap tests cover all five champions and their matchups.

`tests/yasuo-browser.ts` runs against Node and Pages: selection, solo Q-Q-Q-R, E-Q, wall rendering, reset/reload, and an Ahri-host/Yasuo-guest duel where Wind Wall blocks Charm on both clients. Ahri's shared browser tests also cover its charge-only R display, shrinking window outline and transition to cooldown after charge exhaustion or expiry.


Final validation before the PR: all 153 unit/integration tests pass, including E-Q-Flash, automatic R targeting/facing, and the 500ms input buffer. Application and Cloudflare type checks, Node and Pages production builds, and the Cloudflare Worker dry-run pass. All five Yasuo/Ahri browser scenarios pass on each transport with the final changes. Earlier full Node browser regression coverage passed across the suite run and isolated reruns of two timing-sensitive Zed scenarios.
