// End-to-end client: request -> 402 -> vault.pay -> receipt -> retry with X-PAYMENT.
//
//   npx tsx scripts/pay-and-fetch.ts /weather?city=Lisbon
//   npx tsx scripts/pay-and-fetch.ts /market-report?topic=x --tx <approvalTxHash> --nonce <nonce>

import "dotenv/config";
import pc from "picocolors";
import { createPublicClient, createWalletClient, decodeEventLog, formatUnits, http, isAddressEqual, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia as chain } from "viem/chains";
import { baseSepolia as deployment, leashVaultAbi, REASON_CODES, txUrl } from "@leash/shared";

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 4021}`;
const RPC_URL = process.env.RPC_URL || deployment.rpcUrl;
const { vault } = deployment.addresses;

const fmt = (units: bigint) => `${formatUnits(units, deployment.usdcDecimals)} mUSDC`;
const step = (n: number, title: string) => console.log(`\n${pc.bold(pc.cyan(`[${n}]`))} ${pc.bold(title)}`);
const kv = (k: string, v: unknown) => console.log(`    ${pc.dim(k.padEnd(10))} ${v}`);

function parseArgs(argv: string[]) {
  const path = argv.find((a) => a.startsWith("/"));
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (!path) throw new Error("usage: pay-and-fetch.ts <path> [--tx <hash> --nonce <nonce>]");
  return { path, tx: flag("tx") as Hex | undefined, nonce: flag("nonce") };
}

async function retryWithPayment(n: number, url: string, txHash: Hex, nonce: string) {
  step(n, `Retry with X-PAYMENT`);
  const header = Buffer.from(JSON.stringify({ txHash, nonce })).toString("base64");
  const res = await fetch(url, { headers: { "X-PAYMENT": header } });
  const body = await res.json();
  const color = res.ok ? pc.green : pc.red;
  kv("status", color(pc.bold(String(res.status))));
  const settlement = res.headers.get("X-PAYMENT-RESPONSE");
  if (settlement) kv("settled", Buffer.from(settlement, "base64").toString("utf8"));
  console.log(color(JSON.stringify(res.ok ? body : { error: body.error }, null, 2).replace(/^/gm, "    ")));
}

async function main() {
  const { path, tx, nonce: resumeNonce } = parseArgs(process.argv.slice(2));
  const url = API_URL + path;

  // Resume after a human approval: skip straight to the retry.
  if (tx && resumeNonce) return retryWithPayment(1, url, tx, resumeNonce);

  const key = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("AGENT_PRIVATE_KEY missing from api/.env (see api/.env.example)");
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });

  step(1, `GET ${url}`);
  const first = await fetch(url);
  kv("status", first.status === 402 ? pc.yellow(pc.bold("402 Payment Required")) : first.status);
  if (first.status !== 402) {
    console.log(JSON.stringify(await first.json(), null, 2));
    return;
  }
  const offer = (await first.json()).accepts[0];
  const price = BigInt(offer.maxAmountRequired);
  const payTo = offer.payTo as Hex;
  const nonce = offer.extra.nonce as string;
  kv("price", pc.yellow(fmt(price)));
  kv("payTo", payTo);
  kv("nonce", nonce);
  kv("scheme", `${offer.scheme} on ${offer.network} via vault ${offer.extra.vault}`);

  step(2, "Vault dry run: previewPayment(payTo, amount)");
  const [reason, needsApproval] = await publicClient.readContract({
    address: vault,
    abi: leashVaultAbi,
    functionName: "previewPayment",
    args: [payTo, price],
  });
  const expected = reason !== 0 ? pc.red(`BLOCKED (${REASON_CODES[reason]})`) : needsApproval ? pc.yellow("PENDING (needs owner approval)") : pc.green("EXECUTE");
  kv("expected", expected);

  step(3, `vault.pay(${payTo}, ${fmt(price)}, memo="${nonce}")`);
  const hash = await wallet.writeContract({
    address: vault,
    abi: leashVaultAbi,
    functionName: "pay",
    args: [payTo, price, nonce],
  });
  kv("tx", hash);
  kv("explorer", pc.underline(txUrl(hash)));
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  kv("block", receipt.blockNumber);

  step(4, "Vault verdict (from receipt logs)");
  for (const entry of receipt.logs) {
    if (!isAddressEqual(entry.address, vault)) continue;
    let event;
    try {
      event = decodeEventLog({ abi: leashVaultAbi, data: entry.data, topics: entry.topics });
    } catch {
      continue;
    }
    if (event.eventName === "PaymentExecuted") {
      kv("result", pc.green(pc.bold(`EXECUTED: ${fmt(event.args.amount)} sent to ${event.args.to}`)));
      return retryWithPayment(5, url, hash, nonce);
    }
    if (event.eventName === "PaymentBlocked") {
      kv("result", pc.red(pc.bold(`BLOCKED: ${event.args.reasonText}`)));
      kv("note", "No funds moved. The attempt is recorded onchain.");
      return retryWithPayment(5, url, hash, nonce);
    }
    if (event.eventName === "PaymentPending") {
      const id = event.args.requestId;
      kv("result", pc.yellow(pc.bold(`PENDING: request #${id} awaits owner approval`)));
      console.log(`\n${pc.bold("Approve it as the vault owner (from contracts/, after `source .env`):")}`);
      console.log(`    cast send ${vault} "approveRequest(uint256)" ${id} --private-key $DEPLOYER_PRIVATE_KEY --rpc-url ${deployment.rpcUrl}`);
      console.log(`\n${pc.bold("Then finish the purchase with the approval tx hash:")}`);
      console.log(`    npm run demo:report -w @leash/api -- --tx <approvalTxHash> --nonce ${nonce}`);
      return;
    }
  }
  throw new Error("No LeashVault payment event found in the receipt");
}

main().catch((err) => {
  console.error(pc.red(`\nerror: ${err instanceof Error ? err.message : err}`));
  process.exit(1);
});
