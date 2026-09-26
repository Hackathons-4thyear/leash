# web

The Leash dashboard. It's a single-page security console for the vault on Base Sepolia. All data is live: vault state and events come from the chain, and the agent console streams from the agent server. Nothing is mocked.

Next.js 16 (App Router), TypeScript, Tailwind 4, wagmi 3 + viem, TanStack Query. Wallet: injected connector only (MetaMask). ABIs and addresses come from [`@leash/shared`](../shared/).

## Run

```bash
# from the repo root
npm install
npm run web            # http://localhost:3000
npm run web:build      # production build

# for the agent console (optional; the rest of the page works without it)
npm run api
npm run agent:server
```

Config is optional. Copy `web/.env.example` to `web/.env.local` to override:

| Variable | Default | |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | `rpcUrl` from `shared/deployments/base-sepolia.json` | Every read. The public RPC limits `eth_getLogs` to 1,000 blocks, so history is fetched in 1,000-block chunks (4 in parallel). If a provider has a smaller limit, the range is halved automatically. |
| `NEXT_PUBLIC_AGENT_URL` | `http://localhost:4022` | Agent server (`POST /run`, `GET /events`, `GET /status`) |

## What's on the page

| Section | Source |
|---|---|
| Header: network badge with latest block, vault link, Connect wallet, **Owner** badge, wrong-network banner with a switch button | `owner()`, wallet chain |
| Stats: balance, spent today vs daily cap, total paid, blocked attempts, ACTIVE/PAUSED | one multicall, polled every 4s |
| Agent console: 4 scenario buttons and a live terminal | `POST /run`, `GET /events` (SSE), `GET /status`. Handles 409 (busy) and the server being offline. |
| Live activity: every vault event, newest first, with filters | `getLogs` from `deployBlock`, then polled every 4s |
| **Attack blocked** banner | any *new* `PaymentBlocked` log |
| Kill switch | `pause()` / `unpause()`, owner only |
| Pending approvals: countdown to `expiresAt`, Approve / Deny | `PaymentPending` ids not yet approved, denied or expired, then `getRequest` |
| Policy: limits, recipient reputation, allowlist | `getPolicy()`, `reputationOf()`, `AllowlistUpdated` events |

Timestamps are derived from block numbers because Base produces a block every 2 seconds. This saves one `getBlock` call per event.

Without a wallet, everything except owner actions loads from the public RPC. Owner actions switch the wallet to Base Sepolia first if needed, then wait for the receipt and refresh.

## Deploy to Vercel (monorepo)

Import the repo and set:

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework Preset | Next.js |
| Include files outside the Root Directory | Enabled (default). `@leash/shared` lives in `../shared` |
| Install Command | `cd .. && npm install` |
| Build Command | `npm run build` |
| Node.js | 20.x or later |

Environment variables are optional (see above). `next.config.ts` sets `transpilePackages: ["@leash/shared"]` and traces files from the repo root.

On a deployed site, the agent console switches to **demo mode** when it can't reach an agent server: it explains that the agent runs locally and links `NEXT_PUBLIC_DEMO_VIDEO_URL` if set. Chain data, the activity feed, the proof strip and owner actions all work from the deployed URL. To drive a local agent from the deployed page, add its origin to `WEB_ORIGIN` in `agent/.env`.

| Variable | Default | |
|---|---|---|
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | empty | Linked from the agent console in demo mode |
| `NEXT_PUBLIC_SITE_URL` | Vercel deployment URL | Base for absolute Open Graph image URLs |

The "Verified onchain" strip under the hero reads its transaction hashes from [`lib/proof.ts`](lib/proof.ts). Entries with an empty `tx` are hidden.

## Layout

```
app/          layout (fonts, providers), page, globals.css (theme tokens, animations)
components/   Header, Hero, ProofStrip, Stats, AgentConsole, ActivityFeed, BlockedAlerts,
              KillSwitch, PendingApprovals, PolicyPanel, ChainError, Footer, ui, icons
lib/          config (addresses, labels, env), proof (verified tx hashes), wagmi,
              vault (state, event history, pending, alerts), agent (SSE + run),
              tx (owner transactions), format
```
