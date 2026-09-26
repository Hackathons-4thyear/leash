# Leash

**An onchain firewall wallet for AI agents.**

With Leash, an AI agent can only spend stablecoins from a smart-contract vault, and the vault enforces spending rules set by a human owner:
- per-transaction and daily caps
- human approval above a threshold
- a recipient allowlist
- a minimum reputation score for everyone else
- a kill switch

The contract does the checking, so even a prompt-injected agent can't overspend or pay a malicious address. Every blocked attempt is recorded onchain.

## Repo layout

| Folder | What's in it |
|---|---|
| [`contracts/`](contracts/) | Foundry project: `LeashVault`, `MockUSDC`, `MockReputationOracle`, tests, deploy script. See [contracts/README.md](contracts/README.md). |
| [`shared/`](shared/) | Generated deployment addresses + ABIs used by every package (`npm run sync`) |
| [`api/`](api/) | Paywalled x402-style API settled through the vault. See [api/README.md](api/README.md). |
| [`agent/`](agent/) | AI agent that buys data from the API and can only pay through the vault (LLM or scripted, plus a prompt-injection simulation). CLI and SSE server. See [agent/README.md](agent/README.md). |
| [`web/`](web/) | Next.js dashboard (step 4) |

## How to run

Target network: Base Sepolia (chain id 84532). The contracts are already deployed. Their addresses are in [shared/deployments/base-sepolia.json](shared/deployments/base-sepolia.json).

```bash
git clone --recursive <repo-url>
npm install                      # installs every workspace (Node 20+)

# Contracts (optional, already deployed)
cd contracts && forge test -vv && cd ..

# After a redeploy: regenerate shared/ from contracts/out + broadcast
npm run sync

# API on http://localhost:4021
cp api/.env.example api/.env     # set AGENT_PRIVATE_KEY
npm run api

# In a second terminal: end-to-end payments against the live vault
npm run demo:weather -w @leash/api   # paid via vault, 200
npm run demo:attack  -w @leash/api   # blocked onchain: LOW_REPUTATION
npm run demo:report  -w @leash/api   # pending, needs owner approval

# Agent (needs the API running)
cp agent/.env.example agent/.env # set AGENT_PRIVATE_KEY, optionally an LLM
npm run agent -- weather                  # buys weather through the vault (LLM, or scripted without one)
npm run agent -- report                   # 8 mUSDC: waits for owner approval, then fetches
npm run agent -- injection-llm            # LLM reads a prompt-injected response
npm run agent -- injection-compromised    # SIMULATION: hijacked agent, every payment blocked onchain
npm run agent:server                      # http://localhost:4022 for the dashboard (POST /run, GET /events)
```
