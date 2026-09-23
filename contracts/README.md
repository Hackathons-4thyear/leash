# Leash contracts

Foundry project with the onchain part of Leash: a vault that lets an AI agent spend stablecoins only within a policy set by a human owner. The checks run in the contract, so a prompt-injected agent still can't overspend or pay an untrusted address.

## Contracts

| Contract | What it does |
|---|---|
| [`LeashVault.sol`](src/LeashVault.sol) | The firewall wallet. Holds the stablecoin. Only `agent` can call `pay`, and only `owner` can change the policy, approve or deny requests, pause the vault, or withdraw. |
| [`MockUSDC.sol`](src/MockUSDC.sol) | 6-decimal ERC20 (`Mock USDC` / `mUSDC`). **Testnet only:** anyone can call `mint`. |
| [`interfaces/IReputationOracle.sol`](src/interfaces/IReputationOracle.sol) | `getScore(address) → uint8` (0-100). |
| [`MockReputationOracle.sol`](src/MockReputationOracle.sol) | Scores set by the owner. Unknown addresses score 0. It will be swapped for an adapter that reads the ERC-8004 Reputation Registry, and the vault won't need changes. |

## Policy

| Field | Meaning | Demo value |
|---|---|---|
| `perTxCap` | Max amount per payment | 10 mUSDC |
| `dailyCap` | Max total spend per UTC day (executed + approved) | 25 mUSDC |
| `approvalThreshold` | Payments **above** this wait for owner approval | 5 mUSDC |
| `minReputation` | Min oracle score for recipients that aren't allowlisted | 60 |
| `approvalTTL` | How long a pending request can still be approved | 1 hour |

Other controls:
- **Allowlist.** Allowlisted recipients skip the reputation check. Every other rule still applies to them.
- **Kill switch.** `pause()` blocks every payment and approval. `withdraw()` still works while paused.
- **Agent rotation.** `setAgent()` switches the vault to a new agent key, so a leaked key stops working.

## How `pay` decides

The checks run in the order below and the first failure wins. **A blocked payment does not revert.** It emits `PaymentBlocked(to, amount, reasonCode, reasonText, memo)` and returns, so every blocked attempt is recorded onchain for the dashboard.

| # | Check | `ReasonCode` (uint8) | `reasonText` |
|---|---|---|---|
| 1 | Vault is paused | 1 | `VAULT_PAUSED` |
| 2 | `amount == 0`, or `to` is `0x0` or the vault itself | 2 | `INVALID_PAYMENT` |
| 3 | `amount > perTxCap` | 3 | `EXCEEDS_PER_TX_CAP` |
| 4 | `spentToday + amount > dailyCap` | 4 | `EXCEEDS_DAILY_CAP` |
| 5 | `to` not allowlisted and `reputation(to) < minReputation` | 5 | `LOW_REPUTATION` |
| 6 | Vault balance `< amount` | 6 | `INSUFFICIENT_BALANCE` |

(`0 = NONE` means all checks passed.)

If every check passes:
- `amount <= approvalThreshold`: the transfer happens right away and `PaymentExecuted` is emitted.
- `amount > approvalThreshold`: a pending request is created and `PaymentPending(requestId, …)` is emitted. It doesn't count toward the daily cap until approved.

`pay` returns `(uint8 result, uint256 requestId)` with `result` 0 = Executed, 1 = Pending, 2 = Blocked.

### Approvals

- `approveRequest(id)` re-checks pause, daily cap and balance at approval time. If any of them fails it reverts and the request stays `Pending` for a retry.
- If the request is older than `approvalTTL`, `approveRequest` marks it `Expired`, emits `PaymentExpired`, and returns `false` without paying. It doesn't revert here, because a revert would also undo the `Expired` status.
- `denyRequest(id)` marks the request `Denied`. No funds move.

### Fail-closed reputation

The vault calls the oracle inside `try/catch`. If the oracle reverts, the score counts as 0 and payments to non-allowlisted recipients are blocked.

### View helpers (for the dashboard)

`getPolicy()`, `spentToday()`, `remainingToday()`, `getRequest(id)`, `requestCount()`, `balance()`, `reputationOf(addr)`, `previewPayment(to, amount)` (a dry run that returns the reason code), `reasonText(code)`, `totalPaid()`, `totalBlocked()`, `paused()`, `allowlist(addr)`.

## Test

```bash
cd contracts
forge build
forge test -vv
```

42 tests cover:
- each block reason
- allowlist and reputation logic
- the approve, deny and expire flow
- daily cap reset
- pause and unpause
- access control
- a prompt-injection scenario: 500 mUSDC to an attacker with reputation 12, then split into chunks
- a fuzz test showing daily outflow never exceeds `dailyCap`
- a dry run of the deploy script

## Deploy to Base Sepolia (chain id 84532)

1. `cp .env.example .env` and fill it in. Forge loads `.env` automatically.
2. Fund the deployer address with Base Sepolia ETH.
3. Deploy and verify:

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify -vvvv
```

The script deploys `MockUSDC`, `MockReputationOracle` and `LeashVault` with the demo policy above. It then mints 100 mUSDC to the vault, sets reputation 85 for `LEGIT_API_ADDRESS` and 12 for `ATTACKER_ADDRESS`, and logs every address. The deployer becomes the owner of both the vault and the oracle.

`BASESCAN_API_KEY` must be an **Etherscan API V2** key from etherscan.io. One key covers Base Sepolia.

If verification fails during the deploy, verify each contract by hand:

```bash
forge verify-contract <MOCK_USDC> src/MockUSDC.sol:MockUSDC --chain 84532 --watch

forge verify-contract <ORACLE> src/MockReputationOracle.sol:MockReputationOracle --chain 84532 --watch \
  --constructor-args $(cast abi-encode "constructor(address)" <OWNER>)

forge verify-contract <VAULT> src/LeashVault.sol:LeashVault --chain 84532 --watch \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,(uint256,uint256,uint256,uint8,uint64))" \
  <MOCK_USDC> <OWNER> <AGENT> <ORACLE> "(10000000,25000000,5000000,60,3600)")
```

## Dependencies

`lib/forge-std` and `lib/openzeppelin-contracts` (v5.4.0) are git submodules. After cloning, run:

```bash
git submodule update --init --recursive
```
