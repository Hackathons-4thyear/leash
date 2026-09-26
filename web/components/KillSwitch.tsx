"use client";

import { useConnection } from "wagmi";
import { useIsOwner, useOwnerTx } from "@/lib/tx";
import { useVault } from "@/lib/vault";
import { IconPower } from "./icons";
import { CardHeader, cx, Skeleton, TxLink } from "./ui";

export function KillSwitch() {
  const { state } = useVault();
  const { address } = useConnection();
  const isOwner = useIsOwner();
  const { tx, send } = useOwnerTx();
  const busy = tx.phase === "wallet" || tx.phase === "mining";
  const paused = state?.paused;
  const disabled = !state || !isOwner || busy;

  return (
    <div
      className={cx(
        "card overflow-hidden transition-colors duration-500",
        paused && "border-danger/30 bg-[linear-gradient(180deg,rgb(255_77_94/0.10),rgb(255_77_94/0.02))]",
      )}
    >
      <CardHeader icon={<IconPower width={15} height={15} />} title="Kill switch" sub="Freeze every payment and approval instantly" />
      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          {state ? (
            <p className={cx("text-xl font-semibold tracking-tight", paused ? "text-danger" : "text-safe")}>
              {paused ? "Vault frozen" : "Agent can spend"}
            </p>
          ) : (
            <Skeleton className="h-7 w-36" />
          )}
          <p className="mt-1 text-xs text-faint">
            {paused ? "Every pay() is blocked with VAULT_PAUSED. Withdrawals still work." : "Payments are checked against the policy."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={Boolean(paused)}
          aria-label={paused ? "Unpause vault" : "Pause vault"}
          disabled={disabled}
          onClick={() => send(paused ? "unpause" : "pause")}
          className={cx(
            "group relative h-14 w-28 shrink-0 rounded-full border transition-all duration-500",
            paused ? "border-danger/50 bg-danger/20 shadow-[0_0_32px_-4px] shadow-danger/50" : "border-safe/40 bg-safe/15 shadow-[0_0_32px_-8px] shadow-safe/40",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:brightness-125",
          )}
        >
          <span className="absolute inset-y-0 left-3 flex items-center text-[10px] font-bold tracking-widest text-danger/90">OFF</span>
          <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-bold tracking-widest text-safe/90">ON</span>
          <span
            className={cx(
              "absolute top-1 grid size-[46px] place-items-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.3,1.4,0.5,1)]",
              paused ? "left-[calc(100%-50px)] bg-danger text-ink" : "left-1 bg-safe text-ink",
            )}
          >
            {busy ? <span className="size-5 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> : <IconPower width={20} height={20} strokeWidth={2.4} />}
          </span>
        </button>
      </div>

      <div className="min-h-11 border-t border-line px-5 py-3 text-xs">
        {!isOwner ? (
          <span className="text-faint">{address ? "Only the vault owner can do this." : "Only the vault owner can do this. Connect the owner wallet."}</span>
        ) : tx.phase === "wallet" ? (
          <span className="text-warn">Confirm in your wallet…</span>
        ) : tx.phase === "mining" ? (
          <span className="flex items-center gap-2 text-warn">
            Waiting for confirmation <TxLink hash={tx.hash} />
          </span>
        ) : tx.phase === "done" ? (
          <span className="flex items-center gap-2 text-safe">
            Confirmed onchain <TxLink hash={tx.hash} />
          </span>
        ) : tx.phase === "error" ? (
          <span className="text-danger">{tx.message}</span>
        ) : (
          <span className="text-faint">You are the owner. {paused ? "Switch on to resume payments." : "Switch off to freeze the agent."}</span>
        )}
      </div>
    </div>
  );
}
