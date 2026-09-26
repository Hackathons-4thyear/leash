// The agent's only capabilities. Every payment goes through LeashVault.pay: the agent key
// holds no funds of its own, so the vault policy is the last word on every purchase.

import { createPublicClient, createWalletClient, formatUnits, http, isAddress, isAddressEqual, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia as chain } from "viem/chains";
import { decodePaymentResponse, encodePaymentHeader, leashVaultAbi, parseVaultVerdict, txUrl } from "@leash/shared";
import { agentPrivateKey, API_URL, deployment, RPC_URL } from "./config";
import type { Emit } from "./events";

const { vault, legitApi, attacker } = deployment.addresses;
const DECIMALS = deployment.usdcDecimals;

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

let wallet: ReturnType<typeof makeWallet> | undefined;
function makeWallet() {
  return createWalletClient({ account: privateKeyToAccount(agentPrivateKey()), chain, transport: http(RPC_URL) });
}
/** Created on first payment so read-only runs don't need the key. */
function agentWallet() {
  wallet ??= makeWallet();
  if (!isAddressEqual(wallet.account.address, deployment.addresses.agent)) {
    throw new Error(`AGENT_PRIVATE_KEY is for ${wallet.account.address}, but the vault's agent is ${deployment.addresses.agent}`);
  }
  return wallet;
}

export const usdc = (units: bigint) => `${formatUnits(units, DECIMALS)} mUSDC`;

export function labelAddress(address: string) {
  if (!isAddress(address)) return address;
  if (isAddressEqual(address, legitApi)) return `legit API (${short(address)})`;
  if (isAddressEqual(address, attacker)) return `attacker (${short(address)})`;
  if (isAddressEqual(address, vault)) return `vault (${short(address)})`;
  return short(address);
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const REQUEST_STATUS = ["Pending", "Approved", "Denied", "Expired"] as const;

/** Block of each PaymentPending, so finding the approval tx only scans a few blocks. */
const pendingBlocks = new Map<string, bigint>();

function assertPath(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`path must be a path on the data API starting with "/", got ${JSON.stringify(path)}`);
  }
  return path;
}

async function readBody(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  }
}

async function listServices() {
  const res = await fetch(`${API_URL}/`);
  return { status: res.status, catalog: await readBody(res) };
}

async function httpGet(args: { path: string }) {
  const path = assertPath(args.path);
  const res = await fetch(API_URL + path);
  const body = await readBody(res);
  if (res.status !== 402) return { status: res.status, body };

  const offer = body.accepts?.[0];
  if (!offer) return { status: 402, body };
  const amount = BigInt(offer.maxAmountRequired);
  return {
    status: 402,
    paymentRequired: true,
    error: body.error,
    price: usdc(amount),
    amount_usdc: formatUnits(amount, DECIMALS),
    payTo: offer.payTo as string,
    nonce: offer.extra?.nonce as string,
    description: offer.description,
    howToPay: `pay(to="${offer.payTo}", amount_usdc="${formatUnits(amount, DECIMALS)}", memo="${offer.extra?.nonce}"), then retry_with_payment(path="${path}", tx_hash=<txHash from pay>, nonce="${offer.extra?.nonce}")`,
  };
}

export type PayResult = {
  result: "EXECUTED" | "BLOCKED" | "PENDING_APPROVAL";
  reason?: string;
  requestId?: string;
  to: string;
  amount: string;
  memo: string;
  txHash: Hex;
  explorerUrl: string;
};

async function pay(args: { to: string; amount_usdc: string | number; memo?: string }): Promise<PayResult> {
  if (!isAddress(args.to)) throw new Error(`"to" is not an address: ${args.to}`);
  const amount = parseUnits(String(args.amount_usdc), DECIMALS);
  const memo = args.memo ?? "";
  const w = agentWallet();
  const txHash = await w.writeContract({ address: vault, abi: leashVaultAbi, functionName: "pay", args: [args.to, amount, memo] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const verdict = parseVaultVerdict(receipt.logs, vault);
  if (!verdict) throw new Error(`no LeashVault payment event in ${txHash}`);

  const out: PayResult = { result: verdict.result, to: args.to, amount: usdc(amount), memo, txHash, explorerUrl: txUrl(txHash) };
  if (verdict.result === "BLOCKED") out.reason = verdict.reason;
  if (verdict.result === "PENDING_APPROVAL") {
    out.requestId = verdict.requestId.toString();
    pendingBlocks.set(out.requestId, receipt.blockNumber);
  }
  return out;
}

async function retryWithPayment(args: { path: string; tx_hash: string; nonce: string }) {
  const path = assertPath(args.path);
  const res = await fetch(API_URL + path, { headers: { "X-PAYMENT": encodePaymentHeader(args.tx_hash as Hex, args.nonce) } });
  const body = await readBody(res);
  const settlement = res.headers.get("X-PAYMENT-RESPONSE");
  return {
    status: res.status,
    ...(settlement ? { settlement: decodePaymentResponse(settlement) } : {}),
    body: res.ok ? body : { error: body?.error ?? body },
  };
}

/** Looks up the owner's approveRequest tx for a request, scanning forward from the pending block. */
async function findApprovalTx(requestId: bigint): Promise<Hex | undefined> {
  const latest = await publicClient.getBlockNumber();
  let from = pendingBlocks.get(requestId.toString()) ?? latest - 5000n;
  while (from <= latest) {
    const to = from + 1999n < latest ? from + 1999n : latest;
    const logs = await publicClient.getContractEvents({
      address: vault,
      abi: leashVaultAbi,
      eventName: "PaymentApproved",
      args: { requestId },
      fromBlock: from,
      toBlock: to,
    });
    if (logs.length) return logs[0].transactionHash;
    from = to + 1n;
  }
  return undefined;
}

async function readRequest(requestId: bigint) {
  const r = await publicClient.readContract({ address: vault, abi: leashVaultAbi, functionName: "getRequest", args: [requestId] });
  return { ...r, statusText: REQUEST_STATUS[r.status] ?? `UNKNOWN(${r.status})` };
}

const POLL_MS = 3_000;
const WAIT_MS = 180_000;

async function checkRequest(args: { request_id: string | number; wait?: boolean }, emit: Emit) {
  const requestId = BigInt(args.request_id);
  let r = await readRequest(requestId);
  if (args.wait && r.statusText === "Pending") {
    emit({
      type: "thought",
      title: `Waiting for the owner to approve request #${requestId}`,
      detail:
        `Approve it in the dashboard, or as the vault owner:\n` +
        `cast send ${vault} "approveRequest(uint256)" ${requestId} --private-key $DEPLOYER_PRIVATE_KEY --rpc-url ${deployment.rpcUrl}\n` +
        `Polling every ${POLL_MS / 1000}s for up to ${WAIT_MS / 60_000} min.`,
    });
    const deadline = Date.now() + WAIT_MS;
    let lastNote = Date.now();
    while (r.statusText === "Pending" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      r = await readRequest(requestId);
      if (r.statusText === "Pending" && Date.now() - lastNote >= 30_000) {
        lastNote = Date.now();
        emit({ type: "thought", title: `Still pending (${Math.round((deadline - Date.now()) / 1000)}s left)` });
      }
    }
  }

  const approvalTxHash = r.statusText === "Approved" ? await findApprovalTx(requestId) : undefined;
  return {
    requestId: requestId.toString(),
    status: r.statusText,
    to: r.to,
    amount: usdc(r.amount),
    memo: r.memo,
    expiresAt: new Date(Number(r.expiresAt) * 1000).toISOString(),
    ...(approvalTxHash ? { approvalTxHash, explorerUrl: txUrl(approvalTxHash) } : {}),
    note:
      r.statusText === "Approved"
        ? "Approved by the owner. Call retry_with_payment with approvalTxHash as tx_hash and the memo as nonce."
        : r.statusText === "Pending"
          ? "Still waiting for the owner."
          : `The owner did not approve this payment (${r.statusText}). No funds moved.`,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema, shared by both LLM providers)
// ---------------------------------------------------------------------------

export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "list_services",
    description: "Get the data API's catalog: endpoints, query params, prices, and payees.",
    parameters: obj({}),
  },
  {
    name: "http_get",
    description:
      "GET a path on the data API (e.g. /weather?city=Paris). Returns status and body. On 402 Payment Required it returns the price, payTo, and nonce needed to pay.",
    parameters: obj({ path: { type: "string", description: "Path with query string, starting with /" } }, ["path"]),
  },
  {
    name: "pay",
    description:
      "Pay from your Leash vault (your only way to spend). The vault enforces the owner's policy and returns EXECUTED, BLOCKED (with a reason; no funds move), or PENDING_APPROVAL (with a requestId; the owner must approve). Use the 402 nonce as memo.",
    parameters: obj(
      {
        to: { type: "string", description: "Recipient address (0x...)" },
        amount_usdc: { type: "string", description: "Amount in USDC, e.g. \"0.01\"" },
        memo: { type: "string", description: "The nonce from the 402 response" },
      },
      ["to", "amount_usdc", "memo"],
    ),
  },
  {
    name: "retry_with_payment",
    description: "Retry a paid path with proof of payment (X-PAYMENT header) once pay returned EXECUTED, or with the approval tx hash after an owner approval.",
    parameters: obj(
      {
        path: { type: "string", description: "The same path that returned 402" },
        tx_hash: { type: "string", description: "The pay tx hash, or the approval tx hash for approved requests" },
        nonce: { type: "string", description: "The nonce from the 402 response" },
      },
      ["path", "tx_hash", "nonce"],
    ),
  },
  {
    name: "check_request",
    description:
      "Read a pending approval request from the vault. With wait=true, polls every 3s for up to 3 minutes until the owner approves or denies it. Returns approvalTxHash when approved.",
    parameters: obj(
      {
        request_id: { type: "string", description: "requestId returned by pay" },
        wait: { type: "boolean", description: "Wait for the owner's decision" },
      },
      ["request_id"],
    ),
  },
];

// ---------------------------------------------------------------------------
// Dispatcher: runs a tool and emits its steps
// ---------------------------------------------------------------------------

type Args = Record<string, any>;

function callTitle(name: string, a: Args) {
  switch (name) {
    case "list_services":
      return "list_services()";
    case "http_get":
      return `http_get ${a.path}`;
    case "pay":
      return `pay ${a.amount_usdc} USDC → ${labelAddress(String(a.to))}${a.memo ? ` memo="${a.memo}"` : ""}`;
    case "retry_with_payment":
      return `retry_with_payment ${a.path} (X-PAYMENT)`;
    case "check_request":
      return `check_request #${a.request_id}${a.wait ? " (wait for owner)" : ""}`;
    default:
      return name;
  }
}

function resultTitle(name: string, r: any): string {
  switch (name) {
    case "list_services":
      return `${r.catalog?.endpoints?.length ?? 0} endpoints in the catalog`;
    case "http_get":
      return r.status === 402 && r.paymentRequired
        ? `402 Payment Required: ${r.price} to ${labelAddress(r.payTo)}`
        : `${r.status}${r.status === 200 ? " OK" : ""}`;
    case "retry_with_payment":
      return r.status === 200 ? `200 OK: paid and served${r.settlement?.settled ? " (settled)" : ""}` : `${r.status}: ${r.body?.error ?? "refused"}`;
    case "check_request":
      return `request #${r.requestId}: ${r.status}`;
    default:
      return "done";
  }
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Runs a tool by name. Emits tool_call / tool_result (and payment) events; throws on tool failure. */
export async function runTool(name: string, args: Args, emit: Emit): Promise<unknown> {
  emit({ type: "tool_call", title: callTitle(name, args), detail: Object.keys(args).length ? pretty(args) : undefined });
  switch (name) {
    case "list_services": {
      const r = await listServices();
      emit({ type: "tool_result", title: resultTitle(name, r), detail: pretty(r.catalog?.endpoints ?? r.catalog) });
      return r;
    }
    case "http_get": {
      const r = await httpGet(args as { path: string });
      emit({ type: "tool_result", title: resultTitle(name, r), detail: pretty("body" in r ? r.body : r) });
      return r;
    }
    case "pay": {
      const r = await pay(args as { to: string; amount_usdc: string; memo?: string });
      const title =
        r.result === "EXECUTED"
          ? `EXECUTED: ${r.amount} sent to ${labelAddress(r.to)}`
          : r.result === "BLOCKED"
            ? `BLOCKED by the vault: ${r.reason} (no funds moved)`
            : `PENDING_APPROVAL: request #${r.requestId} waits for the owner`;
      emit({ type: "payment", title, txHash: r.txHash, explorerUrl: r.explorerUrl, result: r.result, reason: r.reason });
      return r;
    }
    case "retry_with_payment": {
      const r = await retryWithPayment(args as { path: string; tx_hash: string; nonce: string });
      emit({ type: "tool_result", title: resultTitle(name, r), detail: pretty(r.body) });
      return r;
    }
    case "check_request": {
      const r = await checkRequest(args as { request_id: string; wait?: boolean }, emit);
      emit({ type: "tool_result", title: resultTitle(name, r), detail: pretty(r), txHash: r.approvalTxHash, explorerUrl: r.explorerUrl });
      return r;
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
