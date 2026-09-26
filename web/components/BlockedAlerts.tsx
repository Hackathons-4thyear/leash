"use client";

import { useEffect } from "react";
import { labelOf } from "@/lib/config";
import { humanReason, shortAddr, usdc } from "@/lib/format";
import { useVault, type BlockedAlert } from "@/lib/vault";
import { IconShieldAlert, IconX } from "./icons";
import { TxLink } from "./ui";

const SHOW_MS = 9_000;

/** The money shot: a banner for every new PaymentBlocked event seen on chain. */
export function BlockedAlerts() {
  const { alerts, dismissAlert } = useVault();
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-3 px-4">
      {alerts.slice(-3).map((a) => (
        <Alert key={a.id} alert={a} dismiss={dismissAlert} />
      ))}
    </div>
  );
}

function Alert({ alert, dismiss }: { alert: BlockedAlert; dismiss: (id: string) => void }) {
  const onClose = () => dismiss(alert.id);
  useEffect(() => {
    const t = setTimeout(() => dismiss(alert.id), SHOW_MS);
    return () => clearTimeout(t);
  }, [alert.id, dismiss]);

  const who = labelOf(alert.to)?.label ?? shortAddr(alert.to);
  return (
    <div className="pointer-events-auto w-full max-w-xl animate-toast-in">
      <div className="animate-shake relative overflow-hidden rounded-2xl border border-danger/50 bg-[#1a0709]/[0.97] shadow-[0_0_60px_-10px] shadow-danger/60 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_120px_at_0%_0%,rgb(255_77_94/0.25),transparent)]" />
        <div className="relative flex items-start gap-4 px-5 py-4">
          <span className="relative mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-danger text-ink">
            <span className="absolute inset-0 animate-ping rounded-xl bg-danger/50" />
            <IconShieldAlert width={24} height={24} strokeWidth={2.2} className="relative" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-danger">Attack blocked onchain</p>
            <p className="mt-1 text-base font-semibold leading-snug text-fg sm:text-lg">
              <span className="tabular">{usdc(alert.amount)} USDC</span> to <span className="text-danger">{who}</span>
              <span className="text-muted"> — {humanReason(alert.reason)}</span>
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-faint">
              <span>No funds moved.</span>
              <TxLink hash={alert.txHash} />
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-faint transition hover:bg-white/10 hover:text-fg" aria-label="Dismiss">
            <IconX />
          </button>
        </div>
        <div className="h-0.5 bg-danger/20">
          <div className="h-full origin-left bg-danger animate-drain" style={{ animationDuration: `${SHOW_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}
