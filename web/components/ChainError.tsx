"use client";

import { useVault } from "@/lib/vault";
import { IconAlert } from "./icons";

/** Shown when vault state can't be read at all, instead of leaving the cards loading forever without a word. */
export function ChainError() {
  const { stateError } = useVault();
  if (!stateError) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/[0.07] px-4 py-3 text-sm text-warn">
      <IconAlert className="mt-0.5 shrink-0" />
      <p>
        Can’t reach Base Sepolia right now, so live vault data is delayed. The public RPC is probably rate-limiting; the page keeps
        retrying on its own. The verified transactions above work regardless.
      </p>
    </div>
  );
}
