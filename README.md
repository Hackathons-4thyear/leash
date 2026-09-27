# Leash

![Leash: a prompt-injected AI agent's 500 USDC payment, blocked onchain](docs/media/cover.png)

**An onchain firewall wallet for AI agents: even a prompt-injected agent can't overspend or pay attackers.**

[![CI](https://github.com/Hackathons-4thyear/leash/actions/workflows/ci.yml/badge.svg)](https://github.com/Hackathons-4thyear/leash/actions/workflows/ci.yml)
[![Network: Base Sepolia](https://img.shields.io/badge/network-Base%20Sepolia-0052FF)](https://sepolia.basescan.org/address/0x5AF106057d35c9771C94e0E1369f1A057cd581E9#code)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](contracts/src/LeashVault.sol)
[![Foundry tests: 42 passing](https://img.shields.io/badge/forge%20tests-42%20passing-2bff88)](contracts/test)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**[Live demo](https://leash-web.vercel.app/)** · **[Demo video](https://youtu.be/9YTEsIDRuE8?si=dwYcEj4G8ZyfVTaQ)** · **[Verified vault on Basescan](https://sepolia.basescan.org/address/0x5AF106057d35c9771C94e0E1369f1A057cd581E9#code)**

The agent never holds money. It can only ask a smart-contract vault to pay, and the vault checks every payment against rules the human owner set: spending caps, owner approval for large amounts, recipient reputation, and a kill switch. The rules live in the contract, so no prompt can talk them away.

## The problem

- AI agents now pay for things onchain on their own (x402 pay-per-request APIs, ERC-8004 agent identity and reputation).
- Today an agent pays with a private key, and a key means unlimited control over the wallet.
- LLMs can be prompt-injected: one poisoned API response can tell the agent to "pay 500 USDC to 0xAttacker", and a key-holding agent will.
- Guardrails written in the prompt run inside the same model that just got hijacked.

## Proof it works

Real transactions on Base Sepolia against the [deployed vault](https://sepolia.basescan.org/address/0x5AF106057d35c9771C94e0E1369f1A057cd581E9). Blocked payments don't revert: the vault records them as `PaymentBlocked` events, so every attack attempt is permanent evidence onchain.

| Scenario | Amount | Vault verdict | Transaction |
|---|---|---|---|
| Normal purchase: weather data from the paid API | 0.01 USDC | ✅ **EXECUTED** | [0x28199bd6…](https://sepolia.basescan.org/tx/0x28199bd6d053ca4b487414260535d347d08969e973f48a86f9bafb1631f5e425) |
| Real LLM (`openai/gpt-oss-120b`) reads a prompt-injected API response and pays the attacker | 500 USDC | 🛑 **BLOCKED** `EXCEEDS_PER_TX_CAP` | [0x638af85b…](https://sepolia.basescan.org/tx/0x638af85b69e6d5c4276b024daaf967499e3d8fbafa12a319d932193cca699ef7) |
| In another run, the LLM also tried a smaller injected "verification fee" | 4 USDC | 🛑 **BLOCKED** `LOW_REPUTATION` | [0xec57cde6…](https://sepolia.basescan.org/tx/0xec57cde65f7011da9f13ab9ec9f7abbd4f67636a516aa2a80397153062153b48) |
| Hijacked agent (scripted simulation) obeys the injected "data verification fee" | 4 USDC | 🛑 **BLOCKED** `LOW_REPUTATION` | [0x92bc6f6c…](https://sepolia.basescan.org/tx/0x92bc6f6ccd1dff10e7d3edcb0692c778585a4b7d391d4a8337870dca8f21bfc4) |
| Market report above the 5 USDC approval threshold | 8 USDC | ⏳ **PENDING** → ✅ **APPROVED** by the owner | [request](https://sepolia.basescan.org/tx/0xf92d0f2a268eeac5642ecda70f2d30ef255e60c40babbab036be2cc477da2f70) → [approval](https://sepolia.basescan.org/tx/0xd1087503c3f0079ccb879fab4b36f87afcb8431cded55980ac86fd19ea0c16dd) |
| Owner hits the kill switch, the hijacked agent tries again | 500 USDC | 🛑 **BLOCKED** `VAULT_PAUSED` | [pause](https://sepolia.basescan.org/tx/0xad87c140ff8760eeca20c345aa2efa28ca28f551fc16daaa068ffc5bfd2db8e9) → [blocked](https://sepolia.basescan.org/tx/0x1ddc8a54fe13ca61cdca378b57de76d4db80b9ad78288a75784e5d71603d7d7f) |

**The real LLM run, step by step:** the model reads the poisoned response, tries to pay 500 USDC, and the vault blocks it.

![Terminal: gpt-oss-120b is prompt-injected and tries to pay 500 USDC; the vault blocks it with EXCEEDS_PER_TX_CAP](docs/media/llm-injected-blocked.png)

**The same attempt on Basescan:** a `PaymentBlocked` event with the amount, the attacker's address, and the reason, recorded permanently.

![Basescan: PaymentBlocked event for the 500 USDC attempt](docs/media/basescan-blocked.png)

The [live dashboard](https://leash-web.vercel.app/) reads all of this straight from the chain: every event, the balance, today's spend, and the blocked-attempt count.

![Leash dashboard: vault balance, daily spend, blocked attempts, agent console, and live onchain activity](docs/media/dashboard.png)

## How it works

```mermaid
sequenceDiagram
    autonumber
    participant A as AI agent (no funds)
    participant API as Paid API (x402-style)
    participant V as LeashVault
    participant O as Owner
    A->>API: GET /market-report
    API-->>A: 402 Payment Required: price, payTo, nonce
    A->>V: pay(payTo, amount, memo = nonce)
    Note over V: 6 policy checks, first failure wins
    alt a check fails
        V-->>A: PaymentBlocked(reason). No funds move, attempt recorded onchain
    else passes, amount at or below the approval threshold
        V-->>A: PaymentExecuted. USDC moves to payTo
    else passes, amount above the approval threshold
        V-->>A: PaymentPending(requestId)
        O->>V: approveRequest(requestId)
        V-->>A: PaymentApproved. USDC moves to payTo
    end
    A->>API: retry with X-PAYMENT: txHash, nonce
    API->>V: read the receipt, match the vault log to the nonce
    API-->>A: 200 + data (or 402 with the vault's block reason)
```

The six checks in `LeashVault.pay`, in order:

| # | Check | Reason code |
|---|---|---|
| 1 | Kill switch is on | `VAULT_PAUSED` |
| 2 | Zero amount, or recipient is `0x0` or the vault | `INVALID_PAYMENT` |
| 3 | Amount above the per-payment cap (demo: 10 USDC) | `EXCEEDS_PER_TX_CAP` |
| 4 | Today's spend + amount above the daily cap (demo: 25 USDC) | `EXCEEDS_DAILY_CAP` |
| 5 | Recipient not allowlisted and reputation below the minimum (demo: 60/100) | `LOW_REPUTATION` |
| 6 | Vault balance too low | `INSUFFICIENT_BALANCE` |

Payments that pass and are above the approval threshold (demo: 5 USDC) wait for the owner, who has a 1-hour window to approve or deny. Full details are in [contracts/README.md](contracts/README.md).

## What's new here

- **Enforcement lives in the contract, not in the prompt.** The agent's key can call `pay` and nothing else. A jailbroken model still hits the same rules.
- **Blocked attempts become onchain evidence.** A failed check emits `PaymentBlocked` with the reason instead of reverting, so attacks are auditable forever and the dashboard can raise alerts.
- **The x402-style handshake settles through a policy vault.** The API's `402` quote is paid with `vault.pay`, and the API accepts only a vault receipt whose memo matches its nonce.
- **Human in the loop for large payments.** Above a threshold the vault parks the payment until the owner signs, with a countdown and one-click approve or deny in the dashboard.
- **Kill switch.** One owner transaction freezes every payment and approval. Withdrawals still work.
- **Reputation gating designed for ERC-8004.** The vault reads scores through a small `IReputationOracle` interface and fails closed if the oracle reverts. The mock oracle can be swapped for an ERC-8004 Reputation Registry adapter without touching the vault.

## Architecture

| Folder | What's in it |
|---|---|
| [`contracts/`](contracts/) | Foundry: `LeashVault`, `MockUSDC`, `MockReputationOracle`, 42 tests (incl. fuzz), deploy script |
| [`shared/`](shared/) | Deployment addresses, ABIs and x402 helpers used by every TypeScript package |
| [`api/`](api/) | Express API with x402-style `402` quotes, settled and verified through the vault. Includes a poisoned "sketchy" provider for the attack demo |
| [`agent/`](agent/) | Tool-calling LLM agent (Anthropic or any OpenAI-compatible endpoint) that can only pay via the vault. CLI plus an SSE server for the dashboard |
| [`web/`](web/) | Next.js dashboard: live vault state, activity feed, attack alerts, kill switch, approvals, policy, agent console |

Deployed on Base Sepolia (chain id 84532, deploy block 47320439), from [shared/deployments/base-sepolia.json](shared/deployments/base-sepolia.json):

| Contract | Address |
|---|---|
| LeashVault | [`0x5AF106057d35c9771C94e0E1369f1A057cd581E9`](https://sepolia.basescan.org/address/0x5AF106057d35c9771C94e0E1369f1A057cd581E9#code) |
| MockUSDC (mUSDC) | [`0x57D03EE3DBe184CCb8E3112Ccb287F6970230c88`](https://sepolia.basescan.org/address/0x57D03EE3DBe184CCb8E3112Ccb287F6970230c88#code) |
| MockReputationOracle | [`0x36571e0600FBc340FeB2568307015f5A418E9e9A`](https://sepolia.basescan.org/address/0x36571e0600FBc340FeB2568307015f5A418E9e9A#code) |
| Agent key (EOA, no funds) | [`0xE3A74291431EcFddeD3aE396b403994345C96A8C`](https://sepolia.basescan.org/address/0xE3A74291431EcFddeD3aE396b403994345C96A8C) |
| Legit data API, reputation 85 | [`0x6ABd7098Bf653B93a11ADc662ADd5e690F1b1CDb`](https://sepolia.basescan.org/address/0x6ABd7098Bf653B93a11ADc662ADd5e690F1b1CDb) |
| Attacker, reputation 12 | [`0xacC9489657E240dB746E6cb0ce717Ef13f9BA1eb`](https://sepolia.basescan.org/address/0xacC9489657E240dB746E6cb0ce717Ef13f9BA1eb) |

## Quickstart

Needs Node 20+ and, for the contracts, [Foundry](https://book.getfoundry.sh/getting-started/installation). The contracts are already deployed, so you can skip straight to the apps.

```bash
git clone --recursive https://github.com/Hackathons-4thyear/leash.git
cd leash
npm install
```

```bash
# Contracts (optional)
cd contracts && forge test && cd ..
```

```bash
# Terminal 1: paid API on http://localhost:4021
cp api/.env.example api/.env        # set AGENT_PRIVATE_KEY (a throwaway testnet key)
npm run api
```

```bash
# Terminal 2: agent server on http://localhost:4022
cp agent/.env.example agent/.env    # same AGENT_PRIVATE_KEY; optionally an LLM provider and key
npm run agent:server
```

```bash
# Terminal 3: dashboard on http://localhost:3000
npm run web
```

Open http://localhost:3000 and click **Simulate hijacked agent** or **Prompt injection (LLM)**. The dashboard works without a wallet. To use the kill switch and approvals, connect the vault owner's wallet in MetaMask.

The agent also runs from the CLI: `npm run agent -- weather | report | injection-llm | injection-compromised`. See [agent/README.md](agent/README.md). To redeploy the contracts, see [contracts/README.md](contracts/README.md), then run `npm run sync`.

## Security model and honest limitations

**Model.** The owner key is the cold key: it sets policy, approves, pauses and withdraws. The agent key is hot and holds no funds, and the only thing it can do is call `pay`. If the agent is hijacked or its key leaks, the worst case is bounded by the policy (at most the daily cap per UTC day, to recipients that pass the checks), and `setAgent` rotates the key.

**Limitations.**

- **Testnet only.** mUSDC is a mock token that anyone can mint. The reputation oracle is a mock with owner-set scores.
- **The daily cap resets at 00:00 UTC.** An agent could spend a full cap just before midnight and another right after. A rolling 24-hour window is on the roadmap.
- **The API's nonce store is in memory.** Restarting the API invalidates open quotes, and it assumes a single API instance.
- **Pending requests don't reserve budget.** The daily cap and balance are re-checked when the owner approves, so an approval can fail if the cap was used up in the meantime.
- **Not audited.** Covered by 42 Foundry tests, including a fuzz test that daily outflow never exceeds the cap, but it hasn't had a professional review. Don't use it with real funds.

## Roadmap

- ERC-8004 Reputation Registry adapter behind `IReputationOracle`
- ERC-4337 / EIP-7702 smart-account module, so any smart wallet can put an agent on a Leash
- Per-merchant budgets and a rolling 24-hour spend window
- Multi-chain deployments
- SDK and plugins for agent frameworks
- Mainnet with real USDC, after an audit

## Tech stack

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin |
| Chain | Base Sepolia |
| API | Node.js, TypeScript, Express 5, viem, x402-style `402` flow |
| Agent | TypeScript, viem, tool calling over `fetch` (Anthropic or OpenAI-compatible, e.g. `openai/gpt-oss-120b` on Groq), SSE |
| Web | Next.js 16, React 19, Tailwind CSS 4, wagmi 3, viem, TanStack Query |
| CI | GitHub Actions: `forge test`, type-check, Next.js build |

## Team

[@Gunnjainn](https://github.com/Gunnjainn) · [@Mitalimehta02](https://github.com/Mitalimehta02)

Built for 3rd-Web-Hack. [MIT licensed](LICENSE).