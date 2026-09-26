import { createPublicClient, decodeEventLog, http, isAddressEqual, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { leashVaultAbi } from "@leash/shared";
import { deployment, RPC_URL } from "./config";

const client = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

export type Expected = { payTo: Hex; amount: bigint; nonce: string };

export type VerifyResult =
  | { ok: true; amount: bigint; kind: "executed" | "approved" }
  | { ok: false; reason: string };

/**
 * Checks that `txHash` settled the payment identified by `nonce` through the Leash vault:
 * a successful tx with a vault log (PaymentExecuted, or PaymentApproved whose request
 * memo is the nonce) paying at least `amount` to `payTo`.
 */
export async function verifyVaultPayment(txHash: Hex, expected: Expected): Promise<VerifyResult> {
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 20_000 });
  } catch {
    return { ok: false, reason: `transaction ${txHash} not found (not mined yet?)` };
  }
  if (receipt.status !== "success") return { ok: false, reason: "transaction reverted" };

  for (const entry of receipt.logs) {
    if (!isAddressEqual(entry.address, deployment.addresses.vault)) continue;
    let event;
    try {
      event = decodeEventLog({ abi: leashVaultAbi, data: entry.data, topics: entry.topics });
    } catch {
      continue;
    }

    switch (event.eventName) {
      case "PaymentExecuted": {
        const { to, amount, memo } = event.args;
        if (memo !== expected.nonce) continue;
        return checkTerms(to, amount, expected, "executed");
      }
      case "PaymentApproved": {
        // The approval event has no memo; read it from the stored request.
        const { requestId, to, amount } = event.args;
        const request = await client.readContract({
          address: deployment.addresses.vault,
          abi: leashVaultAbi,
          functionName: "getRequest",
          args: [requestId],
        });
        if (request.memo !== expected.nonce) continue;
        return checkTerms(to, amount, expected, "approved");
      }
      case "PaymentBlocked": {
        if (event.args.memo !== expected.nonce) continue;
        return { ok: false, reason: `payment was blocked by the vault policy: ${event.args.reasonText}` };
      }
      case "PaymentPending": {
        if (event.args.memo !== expected.nonce) continue;
        return {
          ok: false,
          reason: `payment is pending owner approval (request #${event.args.requestId}); retry with the approval tx hash`,
        };
      }
    }
  }
  return { ok: false, reason: "no Leash vault payment with this nonce in the transaction" };
}

function checkTerms(to: Hex, amount: bigint, expected: Expected, kind: "executed" | "approved"): VerifyResult {
  if (!isAddressEqual(to, expected.payTo)) return { ok: false, reason: `paid ${to}, expected ${expected.payTo}` };
  if (amount < expected.amount) return { ok: false, reason: `paid ${amount}, expected at least ${expected.amount}` };
  return { ok: true, amount, kind };
}
