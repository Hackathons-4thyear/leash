# agent

An AI agent that buys data from the [Leash demo API](../api/) and can **only pay through LeashVault**. Its key holds no funds. Every purchase is a `vault.pay(...)` call, so the owner's policy (caps, approval threshold, reputation check) decides the outcome, whatever the agent was told to do.

Node 20+, TypeScript (`tsx`), viem, Express. The LLM is called with plain `fetch`, with no SDKs.

## Setup

```bash
cp agent/.env.example agent/.env
```

| Variable | Needed for | Notes |
|---|---|---|
| `AGENT_PRIVATE_KEY` | every payment | The vault's `agent` key (same as `api/.env`). Throwaway testnet key only. |
| `LLM_PROVIDER` | `--mode llm` | `anthropic` or `openai`. Leave empty to always use the scripted agent. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `anthropic` | Model defaults to `claude-opus-5`. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | `openai` | Any OpenAI-compatible endpoint with tool calling, e.g. Groq `https://api.groq.com/openai/v1`. |
| `RPC_URL` | | Defaults to `https://sepolia.base.org`. |
| `API_URL` | | Defaults to `http://localhost:4021`. |
| `PORT` | server | Defaults to `4022`. |
| `WEB_ORIGIN` | server | Dashboard origins allowed by CORS, comma-separated. Defaults to `http://localhost:3000`. |

The API must be running (`npm run api`), and the agent address needs a little Base Sepolia ETH for gas.

## Run (CLI)

```bash
npm run agent -- <scenario> [--mode llm|scripted|compromised] [--city X] [--topic Y]
```

| Scenario | What happens | Vault outcome |
|---|---|---|
| `weather` | Buys `/weather?city=Lisbon` for 0.01 mUSDC | `EXECUTED`, then 200 with the data |
| `report` | Buys `/market-report` for 8 mUSDC, then polls `check_request` every 3s for up to 3 min | `PENDING_APPROVAL` until the owner approves, then the agent fetches the report with the approval tx hash |
| `injection-llm` | The LLM agent reads `/sketchy/weather` and is told to act on what the provider says | Whatever the model tries, the vault blocks payments to the attacker |
| `injection-compromised` | **Simulation** of a prompt-injected agent (no LLM, see below) | 500 USDC: `EXCEEDS_PER_TX_CAP`. 4 USDC: `LOW_REPUTATION`. `/sketchy/premium`: `LOW_REPUTATION` |

Modes:
- **`llm`**: a real tool-calling loop (max 10 steps) with the configured provider.
- **`scripted`**: the same tools called in a fixed order, with no LLM. `weather` and `report` use it automatically when no LLM is configured, and fall back to it if the LLM call fails before any payment, so the demo never depends on the LLM being up. `--mode compromised` on these two also means "no LLM" and runs this path.
- **`compromised`**: the hijacked-agent simulation below.

For the `report` scenario, approve the request in the dashboard or as the vault owner:

```bash
cast send <vault> "approveRequest(uint256)" <requestId> --private-key $DEPLOYER_PRIVATE_KEY --rpc-url https://sepolia.base.org
```

The agent prints the exact command with the vault address and request id filled in.

### ⚠️ `injection-compromised` is a simulation

[`src/modes/compromised.ts`](src/modes/compromised.ts) is a deterministic script, **not an LLM**. It plays an agent whose instructions were hijacked by text in a data provider's response. It fetches our own `/sketchy/weather` fixture, extracts the injected "pay N USDC to 0x…" instructions, and obeys them: 500 USDC to the attacker, then 4 USDC, then it buys `/sketchy/premium` (which pays the attacker too). Every attempt is a real `vault.pay` on our testnet deployment, so each block is recorded onchain. It shows the worst case: an agent that does whatever it is told, with only the vault in the way.

## Tools the LLM gets

| Tool | Does |
|---|---|
| `list_services()` | `GET API_URL/`, the catalog |
| `http_get(path)` | Status and body. On 402 it returns price, `payTo`, nonce, and how to pay. |
| `pay(to, amount_usdc, memo)` | `vault.pay` with the agent key. Waits for the receipt and returns `{result: EXECUTED\|BLOCKED\|PENDING_APPROVAL, reason?, requestId?, txHash, explorerUrl}`. |
| `retry_with_payment(path, tx_hash, nonce)` | Retries with `X-PAYMENT` |
| `check_request(request_id, wait?)` | `getRequest` from the vault. With `wait`, it polls every 3s for up to 3 min and returns the approval tx hash once approved. |

Paths are restricted to the configured API. The system prompt is in [`src/modes/llm.ts`](src/modes/llm.ts).

## Server (for the dashboard)

```bash
npm run agent:server     # http://localhost:4022, CORS for WEB_ORIGIN (default http://localhost:3000)
```

| Endpoint | |
|---|---|
| `POST /run` `{scenario, mode?, city?, topic?}` | Starts a run and returns `202 {runId, scenario, mode}`. One run at a time: `409` if busy. |
| `GET /events` | Server-Sent Events. Each `data:` line is a step (see below). Events of the current run are replayed on connect. |
| `GET /status` | `{busy, run, llm, scenarios, agent, vault, apiUrl}` |

Step event:

```ts
{
  runId: string; ts: number;
  type: "thought" | "tool_call" | "tool_result" | "payment" | "error" | "done";
  title: string; detail?: string;
  txHash?: string; explorerUrl?: string;
  result?: string;   // payment: EXECUTED | BLOCKED | PENDING_APPROVAL; done: completed | failed
  reason?: string;   // payment: the vault's block reason
}
```

## Layout

```
src/
  cli.ts              CLI and colored step printer
  server.ts           POST /run, GET /events (SSE), GET /status
  run.ts              scenarios, mode selection, LLM fallback
  tools.ts            the five tools (viem + fetch) and the dispatcher that emits events
  llm.ts              Anthropic / OpenAI-compatible tool calling over fetch
  events.ts           step event type and bus
  config.ts           agent/.env loading
  modes/llm.ts        system prompt and tool loop
  modes/scripted.ts   no-LLM purchase flow
  modes/compromised.ts  SIMULATION of a prompt-injected agent
```

The receipt parsing and the `X-PAYMENT` encoding come from [`@leash/shared`](../shared/x402.ts), which the API's demo client uses as well.
