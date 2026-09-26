"use client";

import { duration, usdc } from "@/lib/format";
import { useVault } from "@/lib/vault";
import { IconSliders } from "./icons";
import { Addr, CardHeader, cx, Skeleton } from "./ui";

export function PolicyPanel() {
  const { state, allowlist } = useVault();
  const p = state?.policy;

  const rules = [
    { k: "Per-payment limit", v: p && `${usdc(p.perTxCap)} USDC`, hint: "Larger payments are blocked" },
    { k: "Daily limit", v: p && `${usdc(p.dailyCap)} USDC`, hint: "Executed + approved, per UTC day" },
    { k: "Needs approval above", v: p && `${usdc(p.approvalThreshold)} USDC`, hint: "Owner must sign" },
    { k: "Min. reputation", v: p && `${p.minReputation} / 100`, hint: "For non-allowlisted recipients" },
    { k: "Approval window", v: p && duration(Number(p.approvalTTL)), hint: "Then the request expires" },
  ];

  return (
    <div className="card overflow-hidden">
      <CardHeader icon={<IconSliders width={15} height={15} />} title="Policy" sub="Enforced by the vault contract, not the agent" />
      <dl className="divide-y divide-line">
        {rules.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <dt className="text-sm text-muted">{r.k}</dt>
              <p className="text-[11px] text-faint">{r.hint}</p>
            </div>
            <dd className="shrink-0 font-mono text-sm font-medium text-fg tabular">{r.v ?? <Skeleton className="h-4 w-20" />}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-faint">Recipient reputation</h3>
        <ul className="mt-3 space-y-3">
          {(state?.reputation ?? []).map((r) => {
            const ok = r.allowlisted || (p ? r.score >= p.minReputation : false);
            return (
              <li key={r.address}>
                <div className="flex items-center justify-between gap-2">
                  <Addr address={r.address} />
                  <span className={cx("shrink-0 font-mono text-xs font-semibold tabular", ok ? "text-safe" : "text-danger")}>
                    {r.score}
                    <span className="text-faint">/100</span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
                  <div className={cx("h-full rounded-full transition-all duration-700", ok ? "bg-safe" : "bg-danger")} style={{ width: `${r.score}%` }} />
                  {p && (
                    <span
                      className="absolute -top-1 h-3.5 w-px bg-fg/60"
                      style={{ left: `${p.minReputation}%` }}
                      title={`Minimum ${p.minReputation}`}
                    />
                  )}
                </div>
                <p className="mt-1 text-[11px] text-faint">{r.allowlisted ? "Allowlisted: skips the reputation check" : ok ? "Trusted by the oracle" : "Below the minimum: payments are blocked"}</p>
              </li>
            );
          })}
          {!state && <Skeleton className="h-10 w-full" />}
        </ul>
      </div>

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-faint">Allowlist</h3>
        {allowlist.length === 0 ? (
          <p className="mt-2 text-xs text-faint">Empty. Every recipient must pass the reputation check.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {allowlist.map((a) => (
              <li key={a}>
                <Addr address={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
