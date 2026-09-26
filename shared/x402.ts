// Client-side helpers for the leash-vault x402 scheme, shared by api/scripts and agent/.

import { decodeEventLog, isAddressEqual, type Hex, type Log } from "viem";
import { leashVaultAbi } from "./abi/LeashVault";

type Address = `0x${string}`;

export type VaultVerdict =
  | { result: "EXECUTED"; to: Address; amount: bigint; memo: string }
  | { result: "BLOCKED"; to: Address; amount: bigint; memo: string; reasonCode: number; reason: string }
  | { result: "PENDING_APPROVAL"; to: Address; amount: bigint; memo: string; requestId: bigint };

/** Finds the vault's verdict (Executed / Blocked / Pending) in the logs of a `vault.pay` receipt. */
export function parseVaultVerdict(logs: readonly Log[], vault: Address): VaultVerdict | null {
  for (const entry of logs) {
    if (!isAddressEqual(entry.address, vault)) continue;
    let event;
    try {
      event = decodeEventLog({ abi: leashVaultAbi, data: entry.data, topics: entry.topics });
    } catch {
      continue;
    }
    switch (event.eventName) {
      case "PaymentExecuted":
        return { result: "EXECUTED", ...event.args };
      case "PaymentBlocked": {
        const { to, amount, memo, reasonCode, reasonText } = event.args;
        return { result: "BLOCKED", to, amount, memo, reasonCode, reason: reasonText };
      }
      case "PaymentPending":
        return { result: "PENDING_APPROVAL", ...event.args };
    }
  }
  return null;
}

/** Value of the `X-PAYMENT` retry header: base64(JSON {txHash, nonce}). */
export const encodePaymentHeader = (txHash: Hex, nonce: string) =>
  Buffer.from(JSON.stringify({ txHash, nonce })).toString("base64");

/** Decodes the `X-PAYMENT-RESPONSE` settlement header. */
export const decodePaymentResponse = (header: string): { txHash: Hex; settled: boolean } =>
  JSON.parse(Buffer.from(header, "base64").toString("utf8"));
