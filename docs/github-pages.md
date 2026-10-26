# GitHub Pages and browser-hosted duels

The project site is **https://maxlsb.github.io/zed-duel/**. The Pages workflow publishes only this repository’s `/zed-duel/` site; it does not modify the portfolio repository or its root page.

## Architecture

One player’s browser runs the combat simulation in a Web Worker at 60 Hz and sends state at 30 Hz. A Cloudflare Worker and one SQLite-backed Durable Object per room forward game messages over secure WebSockets. The guest sends validated input commands; the host sends authoritative snapshots. Both Zed and Singed, practice, rematches and killcam use the existing simulation.

The guest renders its own movement immediately, replays inputs not yet acknowledged as applied by the host, and smooths small position corrections over 80 ms. Prediction uses the shared champion movement rules and caps its latency estimate at 250 ms and freezes after 250 ms without a snapshot during a stall. Casts, hits, damage and killcam still use host-confirmed state. This improves input responsiveness, not network ping. Increasing updates from 20 to 30 Hz increases snapshot traffic by roughly 50%.

There is no WebRTC negotiation, STUN or TURN dependency. This replaces the previous signaling/TURN implementation, whose Realtime activation required billing. WebSockets work without opening inbound ports or establishing a direct connection between browsers. A network that blocks the Worker domain or WebSockets can still prevent access. All remote game messages pass through Cloudflare, so relay location and connection quality affect latency. TLS protects each connection to Cloudflare; this is not browser-to-browser end-to-end encryption. The relay does not store match history or simulate combat.

The host must keep the tab and computer open. Closing the host ends the room; a guest can rejoin an existing host, resetting the duel. Connections time out after 25 seconds with a persistent error and retry/back controls. Rooms expire after four hours. Solo practice does not contact Cloudflare.

## Deployment

For the existing project, the Cloudflare account and **VITE_SIGNAL_URL** repository variable are already configured. Deploy Worker changes before merging the frontend PR. Both players should reload after publication and create a fresh room; protocol version 2 rejects outdated clients with an update message.

For a fresh installation:

1. Create a Cloudflare account on **Workers Free** and sign in with `npx wrangler login`. No domain transfer, Realtime activation, TURN key or payment card is needed for this implementation.
2. Deploy the room relay:

   ```sh
   npm ci
   npm run check
   npm run signal:deploy
   ```

   Wrangler creates `zed-duel-signal` and prints its `https://zed-duel-signal.<account-subdomain>.workers.dev` URL. Its allowed origin is `https://maxlsb.github.io`. No Worker secrets are required. `/health` should return `{"ok":true,"transport":"websocket","version":2}`.

3. In **GitHub → zed-duel → Settings → Secrets and variables → Actions → Variables**, set **VITE_SIGNAL_URL** to the Worker’s HTTPS URL. This is a public URL, not a credential. Old TURN secrets and `VITE_PEER_SERVER_URL` / `VITE_ICE_SERVERS` variables are unused.
4. Keep **Settings → Pages → Source** set to **GitHub Actions**. Merge the PR after validation. The workflow tests and publishes the frontend from `main`; it does not deploy the Worker. Future Worker changes also require `npm run signal:deploy`.

The Pages publication job refuses a missing `VITE_SIGNAL_URL` so it cannot silently publish multiplayer without a configured relay. The Worker and Durable Object retain their existing names, URL and SQLite migration.

## Free limits

This implementation uses Workers Free and SQLite Durable Objects, not Cloudflare Realtime. Durable Objects Free includes 100,000 requests/day and 13,000 GB-s/day, with separate storage limits. Incoming WebSocket messages count at a 20:1 ratio for request billing; outgoing messages are not charged as requests. Other applications in the account share the account’s quotas.

This is suitable for testing and casual duels, not an unlimited public service. On Workers Free, exceeding a free limit causes the affected operations to fail until the quota resets; it does not automatically upgrade the plan. Daily limits reset at 00:00 UTC. Keep the account on Free and inspect usage if the site becomes popular.

Source: [Cloudflare Durable Objects pricing and free limits](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Relay safeguards

The Worker checks the game’s origin, rate-limits new connection attempts, reserves the host seat with a random token and permits one guest. The Durable Object validates guest message types and inputs, applies size/rate limits, and binds every forwarded message to the current guest session. It limits unacknowledged snapshots to three and drops additional snapshots while the guest catches up; control messages remain deliverable. The host also avoids queuing snapshots behind a large browser WebSocket send buffer.

Origin checks are a browser boundary, not account authentication. The host remains trusted: this is a casual game between friends, not cheat-resistant dedicated-server hosting. WebSocket transport is ordered and reliable, so packet loss may still add latency. Closing or rejoining a room starts a new session rather than resuming a disconnected round.

## Local development

The existing `npm run dev` runs the Node/LAN version. For the Cloudflare version, start two terminals:

```sh
npm run signal:dev
```

```sh
VITE_SIGNAL_URL=http://127.0.0.1:3190 npm run dev:peer -- --host 127.0.0.1 --port 3180
```

Open **http://127.0.0.1:3180/**. The local Worker uses the same WebSocket relay as production, with a localhost origin and a higher connection-attempt limit. No TURN credentials or test-only networking bypass is involved. `.wrangler/`, `.dev.vars*` and `.env.*.local` are ignored by Git.

## Validation

```sh
npm run check
npm test
npm run test:browser
npm run test:pages
npx wrangler deploy --env="" --dry-run
```

The Pages suite builds the real `/zed-duel/` frontend and runs the Worker locally with Wrangler. It completes a duel and rematch with `RTCPeerConnection` disabled in both browsers, and covers both champions, manual codes, invite links, capacity rejection, host departure, guest replacement, unavailable rooms, unresponsive hosts, retry/cancel, offline practice and project-path navigation. Relay integration checks cover host-seat protection, sender roles, stale guest sessions and bounded snapshots.

Browser tests need `npx playwright install chromium`, or installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`. After deployment, also verify a duel through the actual Cloudflare relay without any Worker secrets. Finally, open an invite on two physical computers on different internet connections. Automated browser contexts can verify the live relay but do not reproduce every real network or measure geographically distributed latency.

Validation on 2026-10-25: type checks, 75 unit/session tests, 14 LAN browser tests, 9 Pages/relay tests, both builds and the Worker dry run passed. Worker version `5d1d571e-ca8b-48e4-910b-e76df5cabbf5` was deployed to the existing URL with no secrets. An additional full duel/rematch test passed through this live relay with WebRTC disabled in both browser contexts. For that test only, the candidate frontend assets were served by Playwright at the allowed Pages origin; the public frontend was subsequently published by merging PR #4. Two physical devices on separate networks have not yet been tested.
