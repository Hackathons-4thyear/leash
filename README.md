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
| [`api/`](api/) | Paywalled x402-style API (step 2) |
| [`agent/`](agent/) | AI agent (step 3) |
| [`web/`](web/) | Next.js dashboard (step 4) |

## Quick start

```bash
git clone --recursive <repo-url>
cd contracts
forge test -vv
```

Target network: Base Sepolia (chain id 84532).
