"use client";

import { countdown, usdc } from "@/lib/format";
import { useIsOwner, useOwnerTx } from "@/lib/tx";
import { useVault, type PendingRequest } from "@/lib/vault";
import { IconCheck, IconClock, IconX } from "./icons";
import { Addr, CardHeader, cx, TxLink, useNow } from "./ui";

export function PendingApprovals() {
  const { pending, loading } = useVault();
  const now = useNow();
  const live = pending.filter((p) => p.expiresAt > now);

  return (
    <div className="card flex flex-col overflow-hidden">
      <CardHeader
        icon={<IconClock width={15} height={15} />}
        title="Pending approvals"
        sub="Payments above the approval threshold wait for you"
        right={
          live.length > 0 && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn ring-1 ring-inset ring-warn/30 tabular">{live.length}</span>
          )
        }
      />
      <div className="flex-1 divide-y divide-line">
        {live.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-white/[0.03] text-faint ring-1 ring-inset ring-white/[0.06]">
              <IconCheck />
            </span>
            <p className="text-sm text-muted">{loading ? "Loading requests…" : "Nothing waiting for approval"}</p>
            <p className="text-xs text-faint">Try the “Buy market report” scenario (8 USDC).</p>
          </div>
        ) : (
          live.map((p) => <Row key={p.id.toString()} req={p} now={now} />)
        )}
      </div>
    </div>
  );
}

function Row({ req, now }: { req: PendingRequest; now: number }) {
  const isOwner = useIsOwner();
  const approve = useOwnerTx();
  const deny = useOwnerTx();
  const busy = [approve.tx.phase, deny.tx.phase].some((p) => p === "wallet" || p === "mining");
  const left = req.expiresAt - now;
  const total = Math.max(1, req.expiresAt - req.createdAt);
  const urgent = left < 5 * 60_000;
  const error = approve.tx.phase === "error" ? approve.tx.message : deny.tx.phase === "error" ? deny.tx.message : null;
  const mining = approve.tx.phase === "mining" ? approve.tx.hash : deny.tx.phase === "mining" ? deny.tx.hash : null;

  return (
    <div className="animate-row-in px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular text-warn">{usdc(req.amount)}</span>
            <span className="text-xs text-faint">USDC</span>
            <span className="font-mono text-[11px] text-faint">#{req.id.toString()}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            <span>to</span> <Addr address={req.to} />
          </div>
        </div>
        <div className={cx("flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs tabular ring-1 ring-inset", urgent ? "bg-danger/10 text-danger ring-danger/25" : "bg-white/[0.04] text-muted ring-white/10")}>
          <IconClock width={12} height={12} />
          {countdown(left)}
        </div>
      </div>

      {req.memo && <p className="mt-2 line-clamp-2 break-all rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-muted">“{req.memo}”</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className={cx("rounded-md px-1.5 py-0.5 ring-1 ring-inset", req.reputation >= 60 ? "bg-safe/10 text-safe ring-safe/20" : "bg-danger/10 text-danger ring-danger/20")}>
          Reputation {req.reputation}/100
        </span>
        {req.allowlisted && <span className="rounded-md bg-info/10 px-1.5 py-0.5 text-info ring-1 ring-inset ring-info/20">Allowlisted</span>}
        {req.txHash && <TxLink hash={req.txHash} />}
      </div>

      <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div className={cx("h-full transition-[width] duration-1000 ease-linear", urgent ? "bg-danger" : "bg-warn/70")} style={{ width: `${Math.max(0, (left / total) * 100)}%` }} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!isOwner || busy}
          onClick={() => approve.send("approveRequest", [req.id])}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-safe text-sm font-semibold text-ink transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconCheck width={15} height={15} /> {approve.tx.phase === "wallet" ? "Confirm in wallet…" : approve.tx.phase === "mining" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={!isOwner || busy}
          onClick={() => deny.send("denyRequest", [req.id])}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger/30 bg-danger/10 text-sm font-semibold text-danger transition hover:bg-danger/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconX width={15} height={15} /> {deny.tx.phase === "wallet" ? "Confirm in wallet…" : deny.tx.phase === "mining" ? "Denying…" : "Deny"}
        </button>
      </div>
      {(error || mining || !isOwner) && (
        <p className={cx("mt-2 flex items-center gap-2 text-[11px]", error ? "text-danger" : mining ? "text-warn" : "text-faint")}>
          {error ?? (mining ? <>Waiting for confirmation <TxLink hash={mining} /></> : "Only the vault owner can approve or deny.")}
        </p>
      )}
    </div>
  );
}
