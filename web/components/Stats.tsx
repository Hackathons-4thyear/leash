"use client";

import { usdc } from "@/lib/format";
import { useVault } from "@/lib/vault";
import { IconBan, IconCoins, IconPower, IconShield, IconWallet } from "./icons";
import { cx, Skeleton } from "./ui";

export function Stats() {
  const { state } = useVault();
  const pct = state && state.policy.dailyCap > 0n ? Math.min(100, Number((state.spentToday * 10_000n) / state.policy.dailyCap) / 100) : 0;
  const barTone = pct >= 100 ? "bg-danger" : pct >= 70 ? "bg-warn" : "bg-safe";

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Stat icon={<IconWallet />} label="Vault balance" className="col-span-2 md:col-span-1">
        <Value loading={!state}>
          {usdc(state?.balance)} <Unit />
        </Value>
        <Sub>Held by the vault, not the agent</Sub>
      </Stat>

      <Stat icon={<IconCoins />} label="Spent today" className="col-span-2 md:col-span-2 xl:col-span-1">
        <Value loading={!state}>
          {usdc(state?.spentToday)}
          <span className="text-base font-normal text-faint"> / {usdc(state?.policy.dailyCap)}</span> <Unit />
        </Value>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className={cx("h-full rounded-full transition-all duration-700", barTone)} style={{ width: `${pct}%` }} />
        </div>
        <Sub>{state ? `${usdc(state.policy.dailyCap - (state.spentToday > state.policy.dailyCap ? state.policy.dailyCap : state.spentToday))} USDC left today (UTC)` : " "}</Sub>
      </Stat>

      <Stat icon={<IconShield />} label="Total paid">
        <Value loading={!state}>
          {usdc(state?.totalPaid)} <Unit />
        </Value>
        <Sub>All-time, within policy</Sub>
      </Stat>

      <Stat icon={<IconBan />} label="Blocked attempts" tone="danger">
        <Value loading={!state} className="text-danger">
          {state?.totalBlocked.toString()}
        </Value>
        <Sub>Recorded onchain</Sub>
      </Stat>

      <Stat icon={<IconPower />} label="Vault state" className="col-span-2 md:col-span-1 xl:col-span-1" tone={state ? (state.paused ? "danger" : "safe") : undefined}>
        <Value loading={!state}>
          {state && (
            <span className={cx("inline-flex items-center gap-2.5", state.paused ? "text-danger" : "text-safe")}>
              <span className={cx("size-2.5 rounded-full animate-pulse-ring", state.paused ? "bg-danger text-danger" : "bg-safe text-safe")} />
              {state.paused ? "PAUSED" : "ACTIVE"}
            </span>
          )}
        </Value>
        <Sub>{state?.paused ? "Kill switch on: all payments refused" : "Payments checked by policy"}</Sub>
      </Stat>
    </section>
  );
}

function Stat({
  icon,
  label,
  children,
  tone,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tone?: "safe" | "danger";
  className?: string;
}) {
  return (
    <div className={cx("card overflow-hidden px-5 py-4", className)}>
      {tone && (
        <div
          className={cx(
            "pointer-events-none absolute inset-x-0 top-0 h-px",
            tone === "danger" ? "bg-gradient-to-r from-transparent via-danger/60 to-transparent" : "bg-gradient-to-r from-transparent via-safe/60 to-transparent",
          )}
        />
      )}
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-faint">
        <span className="text-muted [&>svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Value({ loading, children, className }: { loading: boolean; children: React.ReactNode; className?: string }) {
  if (loading) return <Skeleton className="h-8 w-28" />;
  return <div className={cx("text-2xl font-semibold tracking-tight tabular sm:text-[1.7rem]", className)}>{children}</div>;
}

const Unit = () => <span className="text-sm font-medium text-faint">USDC</span>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="mt-1.5 text-xs text-faint">{children}</p>;
