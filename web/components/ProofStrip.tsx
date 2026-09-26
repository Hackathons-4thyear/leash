import { humanReason } from "@/lib/format";
import { PROOF, type ProofTx } from "@/lib/proof";
import { IconBan, IconCheck, IconShield, IconUser } from "./icons";
import { TxLink } from "./ui";

const verdictStyle: Record<ProofTx["verdict"], { chip: string; icon: React.ReactNode }> = {
  EXECUTED: { chip: "bg-safe/10 text-safe ring-safe/25", icon: <IconCheck width={12} height={12} /> },
  BLOCKED: { chip: "bg-danger/15 text-danger ring-danger/30", icon: <IconBan width={12} height={12} /> },
  APPROVED: { chip: "bg-warn/10 text-warn ring-warn/25", icon: <IconUser width={12} height={12} /> },
};

/** Links to real testnet runs, so a visitor can check the claims without running anything. */
export function ProofStrip() {
  const items = PROOF.filter((p) => p.tx);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="proof-title">
      <h2 id="proof-title" className="mb-2.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-faint">
        <IconShield width={13} height={13} className="text-safe" /> Verified onchain · real Base Sepolia runs
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((p) => {
          const s = verdictStyle[p.verdict];
          return (
            <li key={p.tx} className="card flex min-w-0 flex-col gap-2 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${s.chip}`}>
                  {s.icon}
                  {p.verdict === "APPROVED" ? "PENDING → APPROVED" : p.verdict}
                </span>
                {p.reason && <span className="font-mono text-[10px] text-faint">{p.reason}</span>}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {p.detail}
                  {p.reason && <span className="text-faint"> · {humanReason(p.reason)}</span>}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                <TxLink hash={p.tx} />
                {p.followUp?.tx && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                    {p.followUp.label} <TxLink hash={p.followUp.tx} />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
