"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { duration, humanReason, relTime, usdc } from "@/lib/format";
import { useVault, type FeedEvent } from "@/lib/vault";
import { IconActivity, IconBan, IconCheck, IconClock, IconList, IconPause, IconPlay, IconShield, IconSliders, IconUser, IconWallet, IconX } from "./icons";
import { Addr, CardHeader, cx, TxLink, useNow } from "./ui";

type Filter = "all" | "payments" | "blocked" | "admin";
const PAYMENT = new Set(["PaymentExecuted", "PaymentBlocked", "PaymentPending", "PaymentApproved", "PaymentDenied", "PaymentExpired"]);

export function ActivityFeed() {
  const { events, loading, eventsError } = useVault();
  const [filter, setFilter] = useState<Filter>("all");
  const now = useNow(5_000);

  const counts = useMemo(
    () => ({
      all: events.length,
      payments: events.filter((e) => PAYMENT.has(e.name)).length,
      blocked: events.filter((e) => e.name === "PaymentBlocked").length,
      admin: events.filter((e) => !PAYMENT.has(e.name)).length,
    }),
    [events],
  );
  const shown = events.filter((e) =>
    filter === "all" ? true : filter === "payments" ? PAYMENT.has(e.name) : filter === "blocked" ? e.name === "PaymentBlocked" : !PAYMENT.has(e.name),
  );

  return (
    <div className="card flex h-[560px] flex-col overflow-hidden lg:h-[640px]">
      <CardHeader
        icon={<IconActivity width={15} height={15} />}
        title="Live activity"
        sub={loading ? "Reading vault history from Base Sepolia…" : "Every vault event, straight from the chain"}
        right={
          <span className="flex items-center gap-1.5 rounded-full bg-safe/10 px-2 py-0.5 text-[11px] font-medium text-safe ring-1 ring-inset ring-safe/20">
            <span className="size-1.5 animate-pulse rounded-full bg-safe" /> LIVE
          </span>
        }
      />
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 scroll-thin">
        {(["all", "payments", "blocked", "admin"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition",
              filter === f ? "bg-white/[0.08] text-fg" : "text-faint hover:bg-white/[0.04] hover:text-muted",
            )}
          >
            {f}
            <span className={cx("rounded px-1 font-mono text-[10px] tabular", f === "blocked" && counts.blocked ? "bg-danger/15 text-danger" : "bg-white/[0.06] text-faint")}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin">
        {loading && (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between text-xs text-faint">
              <span>Scanning blocks since deployment</span>
              <span className="font-mono tabular">{loading.total ? Math.round((loading.done / loading.total) * 100) : 0}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full bg-safe/70 transition-all" style={{ width: `${loading.total ? (loading.done / loading.total) * 100 : 3}%` }} />
            </div>
          </div>
        )}
        {eventsError && <p className="mx-5 my-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">RPC hiccup, retrying… ({eventsError.slice(0, 120)})</p>}
        {!loading && shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-faint">No events yet.</p>}
        <ul className="divide-y divide-line">
          {shown.map((e) => (
            <Row key={e.id} e={e} now={now} />
          ))}
        </ul>
      </div>
    </div>
  );
}

type Tone = "safe" | "danger" | "warn" | "info" | "muted";
const toneStyles: Record<Tone, { icon: string; row: string }> = {
  safe: { icon: "bg-safe/10 text-safe ring-safe/25", row: "" },
  danger: { icon: "bg-danger/15 text-danger ring-danger/30", row: "bg-danger/[0.04] shadow-[inset_2px_0_0] shadow-danger" },
  warn: { icon: "bg-warn/10 text-warn ring-warn/25", row: "shadow-[inset_2px_0_0] shadow-warn/70" },
  info: { icon: "bg-info/10 text-info ring-info/20", row: "" },
  muted: { icon: "bg-white/[0.04] text-muted ring-white/10", row: "" },
};

function Row({ e, now }: { e: FeedEvent; now: number }) {
  const d = describe(e);
  const s = toneStyles[d.tone];
  return (
    <li className={cx("animate-row-in flex gap-3 px-5 py-3", s.row)}>
      <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset", s.icon)}>{d.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">{d.title}</div>
        {d.extra && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">{d.extra}</div>}
        {d.memo && <p className="mt-1 truncate font-mono text-[11px] text-faint" title={d.memo}>memo: {d.memo}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] text-faint tabular" title={new Date(e.ts).toLocaleString()}>
          {relTime(e.ts, now)}
        </span>
        <TxLink hash={e.txHash} />
      </div>
    </li>
  );
}

const Amt = ({ v, className }: { v: unknown; className?: string }) => (
  <span className={cx("font-semibold tabular", className)}>{usdc(v as bigint)} USDC</span>
);
const Id = ({ v }: { v: unknown }) => <span className="font-mono text-xs text-faint">#{String(v)}</span>;

function describe(e: FeedEvent): { tone: Tone; icon: ReactNode; title: ReactNode; extra?: ReactNode; memo?: string } {
  const a = e.args;
  const to = a.to as Address;
  const i = { width: 14, height: 14 };
  switch (e.name) {
    case "PaymentExecuted":
      return { tone: "safe", icon: <IconCheck {...i} />, title: <>Paid <Amt v={a.amount} className="text-safe" /> to <Addr address={to} /></>, memo: a.memo as string };
    case "PaymentBlocked":
      return {
        tone: "danger",
        icon: <IconBan {...i} />,
        title: <>Blocked <Amt v={a.amount} className="text-danger" /> to <Addr address={to} /></>,
        extra: (
          <>
            <span className="rounded-md bg-danger/15 px-1.5 py-0.5 font-medium text-danger ring-1 ring-inset ring-danger/30">{humanReason(a.reasonText as string)}</span>
            <span className="font-mono text-[10px] text-faint">{a.reasonText as string}</span>
          </>
        ),
        memo: a.memo as string,
      };
    case "PaymentPending":
      return { tone: "warn", icon: <IconClock {...i} />, title: <>Approval requested: <Amt v={a.amount} className="text-warn" /> to <Addr address={to} /> <Id v={a.requestId} /></>, memo: a.memo as string };
    case "PaymentApproved":
      return { tone: "safe", icon: <IconUser {...i} />, title: <>Owner approved <Id v={a.requestId} />: <Amt v={a.amount} className="text-safe" /> to <Addr address={to} /></> };
    case "PaymentDenied":
      return { tone: "danger", icon: <IconX {...i} />, title: <>Owner denied <Id v={a.requestId} />: <Amt v={a.amount} /> to <Addr address={to} /></> };
    case "PaymentExpired":
      return { tone: "muted", icon: <IconClock {...i} />, title: <>Request <Id v={a.requestId} /> expired: <Amt v={a.amount} /> to <Addr address={to} /></> };
    case "Paused":
      return { tone: "danger", icon: <IconPause {...i} />, title: <><span className="font-semibold text-danger">Kill switch engaged</span> by <Addr address={a.by as string} /></> };
    case "Unpaused":
      return { tone: "safe", icon: <IconPlay {...i} />, title: <><span className="font-semibold text-safe">Kill switch released</span> by <Addr address={a.by as string} /></> };
    case "PolicyUpdated":
      return {
        tone: "info",
        icon: <IconSliders {...i} />,
        title: <>Policy set</>,
        extra: (
          <span className="flex flex-wrap gap-1.5 text-muted">
            <Pill>per-payment {usdc(a.perTxCap as bigint)}</Pill>
            <Pill>daily {usdc(a.dailyCap as bigint)}</Pill>
            <Pill>approval &gt; {usdc(a.approvalThreshold as bigint)}</Pill>
            <Pill>min rep {String(a.minReputation)}</Pill>
            <Pill>TTL {duration(Number(a.approvalTTL))}</Pill>
          </span>
        ),
      };
    case "AllowlistUpdated":
      return { tone: "info", icon: <IconList {...i} />, title: <>{a.allowed ? "Allowlisted" : "Removed from allowlist"} <Addr address={a.account as string} /></> };
    case "AgentUpdated":
      return { tone: "info", icon: <IconShield {...i} />, title: <>Agent key set to <Addr address={a.newAgent as string} /></> };
    case "ReputationOracleUpdated":
      return { tone: "info", icon: <IconShield {...i} />, title: <>Reputation oracle set to <Addr address={a.newOracle as string} /></> };
    case "Withdrawn":
      return { tone: "muted", icon: <IconWallet {...i} />, title: <>Owner withdrew <Amt v={a.amount} /> to <Addr address={to} /></> };
    case "OwnershipTransferred":
      return { tone: "info", icon: <IconUser {...i} />, title: <>Vault owner set to <Addr address={a.newOwner as string} /></> };
    default:
      return { tone: "muted", icon: <IconActivity {...i} />, title: e.name };
  }
}

const Pill = ({ children }: { children: ReactNode }) => <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset ring-white/[0.06]">{children}</span>;
