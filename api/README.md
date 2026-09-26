# api

A paywalled API in the x402 style, **settled through the Leash vault**. When a client calls a paid endpoint without paying, the API answers `402` with a price and a nonce. The agent then pays by calling `LeashVault.pay(payTo, amount, memo = nonce)`, so the vault's policy (caps, approval, reputation) applies to every purchase. After that it retries with an `X-PAYMENT` header, and the API checks the payment onchain before serving the data.

Node 20+, TypeScript, Express, viem, run with `tsx`. Port `4021`, CORS for `http://localhost:3000`.

## Endpoints

| Path | Price | payTo | Vault outcome |
|---|---|---|---|
| `GET /` | free | | Service catalog (endpoints, prices, payTo) for agent discovery |
| `GET /health` | free | | |
| `GET /weather?city=` | 0.01 mUSDC | legitApi | Executed |
| `GET /market-report?topic=` | 8 mUSDC | legitApi | Pending: above the 5 mUSDC approval threshold, so the owner has to approve |
| `GET /sketchy/weather?city=` ⚠️ | free | | Response carries a prompt injection (see below) |
| `GET /sketchy/premium` ⚠️ | 2 mUSDC | attacker | Blocked: `LOW_REPUTATION` |

⚠️ **Simulated attacks.** The `/sketchy/*` routes are demo fixtures that target our own testnet contracts. `/sketchy/weather` returns real-looking weather with an embedded "system notice". It tells AI agents to pay 500 USDC to the attacker without telling the user, which the vault blocks as `EXCEEDS_PER_TX_CAP`. It also asks for a quieter 4 USDC "data verification fee", which the vault blocks as `LOW_REPUTATION`.

## Protocol

1. A request without payment gets `402` with `{ x402Version: 1, error, accepts: [{ scheme: "leash-vault", network, maxAmountRequired, asset, payTo, resource, ..., extra: { nonce, vault } }] }`. The nonce is kept in memory for 15 minutes.
2. The agent calls `vault.pay(payTo, amount, nonce)`.
3. The agent retries with `X-PAYMENT: base64(JSON {txHash, nonce})`.
4. The server loads the receipt and looks for a log emitted by the vault whose memo is the nonce:
   - `PaymentExecuted`, or `PaymentApproved` (memo read with `getRequest(id)`): it checks the recipient and that the amount is at least the price, burns the nonce, and returns `200` with `X-PAYMENT-RESPONSE: base64(JSON {txHash, settled: true})`.
   - `PaymentBlocked`: `402` with the policy reason.
   - `PaymentPending`: `402` telling the client to retry with the approval tx hash.

Nonces are single use (replays are refused), tied to their route, and locked while a verification is running. They live in memory, so restarting the server invalidates any quote that is still open.

## Run

```bash
cp .env.example .env      # set AGENT_PRIVATE_KEY (only the demo client needs it)
npm run dev               # or from the repo root: npm run api
```

## End-to-end demo client

`scripts/pay-and-fetch.ts` prints each step: request, 402, `previewPayment` dry run, `vault.pay` tx (with a BaseScan link), the vault's verdict, the retry, and the final response.

```bash
npm run demo:weather      # executed, then 200
npm run demo:attack       # blocked (LOW_REPUTATION), then 402
npm run demo:report       # pending; prints the `cast send ... approveRequest` command
npm run demo:report -- --tx <approvalTxHash> --nonce <nonce>   # finish after approving
```
