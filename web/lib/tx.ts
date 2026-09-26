"use client";

import { leashVaultAbi } from "@leash/shared";
import { useCallback, useState } from "react";
import type { Hash } from "viem";
import { useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { chain, VAULT } from "./config";
import { errorMessage } from "./format";
import { useVault } from "./vault";
import { publicClient } from "./wagmi";

export function useIsOwner() {
  const { address } = useConnection();
  const { state } = useVault();
  return Boolean(address && state && address.toLowerCase() === state.owner.toLowerCase());
}

type OwnerFn = "pause" | "unpause" | "approveRequest" | "denyRequest";
export type TxPhase = { phase: "idle" } | { phase: "wallet" } | { phase: "mining"; hash: Hash } | { phase: "done"; hash: Hash } | { phase: "error"; message: string; hash?: Hash };

/** Sends an owner-only vault call: switches chain if needed, waits for the receipt, refreshes data. */
export function useOwnerTx() {
  const { chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: writeContract } = useWriteContract();
  const { refresh } = useVault();
  const [tx, setTx] = useState<TxPhase>({ phase: "idle" });

  const send = useCallback(
    async (functionName: OwnerFn, args: readonly bigint[] = []) => {
      setTx({ phase: "wallet" });
      let hash: Hash | undefined;
      try {
        if (chainId !== chain.id) await switchChain({ chainId: chain.id });
        hash = await writeContract({
          address: VAULT,
          abi: leashVaultAbi,
          functionName,
          args,
          chainId: chain.id,
        } as Parameters<typeof writeContract>[0]);
        setTx({ phase: "mining", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1_500 });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setTx({ phase: "done", hash });
        refresh();
        setTimeout(() => setTx((t) => (t.phase === "done" && t.hash === hash ? { phase: "idle" } : t)), 5_000);
        return true;
      } catch (err) {
        setTx({ phase: "error", message: errorMessage(err), hash });
        refresh();
        return false;
      }
    },
    [chainId, switchChain, writeContract, refresh],
  );

  return { tx, send, reset: () => setTx({ phase: "idle" }) };
}
