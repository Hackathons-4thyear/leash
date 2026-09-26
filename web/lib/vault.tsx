"use client";

import { leashVaultAbi } from "@leash/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address, Hash } from "viem";
import { BLOCK_TIME_SECONDS, DEPLOY_BLOCK, POLL_MS, registerOwner, VAULT, WATCHED } from "./config";
import { publicClient } from "./wagmi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const vaultEvents = leashVaultAbi.filter((item) => item.type === "event");

export type VaultEventName =
  | "PaymentExecuted"
  | "PaymentBlocked"
  | "PaymentPending"
  | "PaymentApproved"
  | "PaymentDenied"
  | "PaymentExpired"
  | "PolicyUpdated"
  | "AgentUpdated"
  | "AllowlistUpdated"
  | "ReputationOracleUpdated"
  | "Paused"
  | "Unpaused"
  | "Withdrawn"
  | "OwnershipTransferred";

export type FeedEvent = {
  id: string;
  name: VaultEventName;
  // Decoded event args; the shape depends on `name`.
  args: Record<string, unknown>;
  block: bigint;
  logIndex: number;
  txHash: Hash;
  /** Milliseconds since epoch, derived from Base's fixed 2s block time. */
  ts: number;
};

export type Policy = {
  perTxCap: bigint;
  dailyCap: bigint;
  approvalThreshold: bigint;
  minReputation: number;
  approvalTTL: bigint;
};

export type VaultState = {
  balance: bigint;
  policy: Policy;
  spentToday: bigint;
  totalPaid: bigint;
  totalBlocked: bigint;
  paused: boolean;
  owner: Address;
  agent: Address;
  requestCount: bigint;
  reputation: { address: Address; label: string; score: number; allowlisted: boolean }[];
};

export type PendingRequest = {
  id: bigint;
  to: Address;
  amount: bigint;
  memo: string;
  createdAt: number;
  expiresAt: number;
  reputation: number;
  allowlisted: boolean;
  txHash?: Hash;
};

export type BlockedAlert = { id: string; to: Address; amount: bigint; reason: string; txHash: Hash };

// ---------------------------------------------------------------------------
// Chain reads
// ---------------------------------------------------------------------------

const vault = { address: VAULT, abi: leashVaultAbi } as const;

async function readVaultState(): Promise<VaultState> {
  const [core, rest] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      contracts: [
        { ...vault, functionName: "balance" },
        { ...vault, functionName: "getPolicy" },
        { ...vault, functionName: "spentToday" },
        { ...vault, functionName: "totalPaid" },
        { ...vault, functionName: "totalBlocked" },
        { ...vault, functionName: "paused" },
        { ...vault, functionName: "owner" },
        { ...vault, functionName: "agent" },
        { ...vault, functionName: "requestCount" },
      ],
    }),
    publicClient.multicall({
      allowFailure: false,
      contracts: WATCHED.flatMap((w) => [
        { ...vault, functionName: "reputationOf", args: [w.address] } as const,
        { ...vault, functionName: "allowlist", args: [w.address] } as const,
      ]),
    }),
  ]);
  const [balance, policy, spentToday, totalPaid, totalBlocked, paused, owner, agent, requestCount] = core;
  registerOwner(owner);
  return {
    balance,
    policy: { ...policy, minReputation: Number(policy.minReputation) },
    spentToday,
    totalPaid,
    totalBlocked,
    paused,
    owner,
    agent,
    requestCount,
    reputation: WATCHED.map((w, i) => ({
      ...w,
      score: Number(rest[i * 2]),
      allowlisted: Boolean(rest[i * 2 + 1]),
    })),
  };
}

const CHUNK = 1_000n; // the public Base RPC limits eth_getLogs to 1,000 blocks
const CONCURRENCY = 4;

async function getLogsSafe(from: bigint, to: bigint, attempt = 0): Promise<FeedLogRaw[]> {
  try {
    const logs = await publicClient.getLogs({ address: VAULT, events: vaultEvents, fromBlock: from, toBlock: to });
    return logs as unknown as FeedLogRaw[];
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    // Provider with a smaller range limit: split the range.
    if (to > from && /range|limit|too many|10000|block/i.test(msg)) {
      const mid = from + (to - from) / 2n;
      const [a, b] = await Promise.all([getLogsSafe(from, mid), getLogsSafe(mid + 1n, to)]);
      return [...a, ...b];
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      return getLogsSafe(from, to, attempt + 1);
    }
    throw err;
  }
}

type FeedLogRaw = {
  eventName: VaultEventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hash;
};

async function fetchLogs(from: bigint, to: bigint, onProgress?: (done: number, total: number) => void) {
  const ranges: [bigint, bigint][] = [];
  for (let s = from; s <= to; s += CHUNK) ranges.push([s, s + CHUNK - 1n > to ? to : s + CHUNK - 1n]);
  const out: FeedLogRaw[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < ranges.length) {
      const [a, b] = ranges[next++];
      out.push(...(await getLogsSafe(a, b)));
      onProgress?.(++done, ranges.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type Ctx = {
  state?: VaultState;
  stateError: boolean;
  events: FeedEvent[];
  loading: { done: number; total: number } | null;
  eventsError: string | null;
  latestBlock?: bigint;
  pending: PendingRequest[];
  allowlist: Address[];
  alerts: BlockedAlert[];
  dismissAlert: (id: string) => void;
  /** Polls the chain right away (after a tx or an agent payment). */
  refresh: () => void;
};

const VaultContext = createContext<Ctx | null>(null);

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault outside VaultProvider");
  return ctx;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const stateQuery = useQuery({ queryKey: ["vault-state"], queryFn: readVaultState, refetchInterval: POLL_MS });

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>({ done: 0, total: 0 });
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [latestBlock, setLatestBlock] = useState<bigint>();
  const [alerts, setAlerts] = useState<BlockedAlert[]>([]);
  const pollNow = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let anchor: { block: bigint; ts: number } | undefined;
    let cursor = 0n;
    let polling = false;
    const seen = new Set<string>();

    const toFeed = (logs: FeedLogRaw[]): FeedEvent[] =>
      logs
        .filter((l) => l.eventName)
        .map((l) => ({
          id: `${l.transactionHash}:${l.logIndex}`,
          name: l.eventName,
          args: l.args,
          block: l.blockNumber,
          logIndex: l.logIndex,
          txHash: l.transactionHash,
          ts: anchor ? anchor.ts + Number(l.blockNumber - anchor.block) * BLOCK_TIME_SECONDS * 1000 : Date.now(),
        }))
        .filter((e) => !seen.has(e.id) && (seen.add(e.id), true));

    const add = (fresh: FeedEvent[]) => {
      if (fresh.length) setEvents((prev) => [...prev, ...fresh].sort(byNewest));
    };

    const initial = async () => {
      try {
        const head = await publicClient.getBlock({ blockTag: "latest" });
        if (cancelled) return;
        anchor = { block: head.number, ts: Number(head.timestamp) * 1000 };
        setLatestBlock(head.number);
        const logs = await fetchLogs(DEPLOY_BLOCK, head.number, (done, total) => !cancelled && setLoading({ done, total }));
        if (cancelled) return;
        cursor = head.number;
        add(toFeed(logs));
        setLoading(null);
        setEventsError(null);
        schedule();
      } catch (err) {
        if (cancelled) return;
        setEventsError(String((err as Error)?.message ?? err).split("\n")[0]);
        timer = setTimeout(initial, 5_000);
      }
    };

    const poll = async () => {
      if (polling || cancelled || !anchor) return;
      polling = true;
      try {
        const head = await publicClient.getBlockNumber({ cacheTime: 0 });
        if (head > cursor) {
          const logs = await fetchLogs(cursor + 1n, head);
          if (cancelled) return;
          cursor = head;
          setLatestBlock(head);
          const fresh = toFeed(logs);
          add(fresh);
          const blocked = fresh.filter((e) => e.name === "PaymentBlocked");
          if (blocked.length) {
            setAlerts((prev) => [
              ...prev,
              ...blocked.map((e) => ({
                id: e.id,
                to: e.args.to as Address,
                amount: e.args.amount as bigint,
                reason: e.args.reasonText as string,
                txHash: e.txHash,
              })),
            ]);
          }
          if (fresh.length) qc.invalidateQueries({ queryKey: ["vault-state"] });
        }
        setEventsError(null);
      } catch (err) {
        setEventsError(String((err as Error)?.message ?? err).split("\n")[0]);
      } finally {
        polling = false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, POLL_MS);
    };

    pollNow.current = () => {
      void poll();
    };
    void initial();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [qc]);

  const refresh = useCallback(() => {
    pollNow.current();
    qc.invalidateQueries({ queryKey: ["vault-state"] });
    qc.invalidateQueries({ queryKey: ["pending"] });
  }, [qc]);

  // Pending approvals: PaymentPending ids that were never approved, denied or expired onchain.
  const openIds = useMemo(() => {
    const closed = new Set<string>();
    for (const e of events) {
      if (e.name === "PaymentApproved" || e.name === "PaymentDenied" || e.name === "PaymentExpired") {
        closed.add(String(e.args.requestId));
      }
    }
    return events
      .filter((e) => e.name === "PaymentPending" && !closed.has(String(e.args.requestId)))
      .map((e) => ({ id: e.args.requestId as bigint, txHash: e.txHash }));
  }, [events]);

  const pendingQuery = useQuery({
    queryKey: ["pending", openIds.map((o) => o.id.toString()).join(",")],
    enabled: openIds.length > 0,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<PendingRequest[]> => {
      const reqs = await publicClient.multicall({
        allowFailure: false,
        contracts: openIds.map((o) => ({ ...vault, functionName: "getRequest", args: [o.id] }) as const),
      });
      const recipients = reqs.map((r) => r.to);
      const extra = await publicClient.multicall({
        allowFailure: false,
        contracts: recipients.flatMap((to) => [
          { ...vault, functionName: "reputationOf", args: [to] } as const,
          { ...vault, functionName: "allowlist", args: [to] } as const,
        ]),
      });
      return reqs
        .map((r, i) => ({
          id: openIds[i].id,
          txHash: openIds[i].txHash,
          to: r.to,
          amount: r.amount,
          memo: r.memo,
          createdAt: Number(r.createdAt) * 1000,
          expiresAt: Number(r.expiresAt) * 1000,
          status: r.status,
          reputation: Number(extra[i * 2]),
          allowlisted: Boolean(extra[i * 2 + 1]),
        }))
        .filter((r) => r.status === 0)
        .map(({ status: _status, ...r }) => r);
    },
  });

  const allowlist = useMemo(() => {
    const map = new Map<string, Address>();
    for (const e of [...events].sort((a, b) => -byNewest(a, b))) {
      if (e.name !== "AllowlistUpdated") continue;
      const account = e.args.account as Address;
      if (e.args.allowed) map.set(account.toLowerCase(), account);
      else map.delete(account.toLowerCase());
    }
    return [...map.values()];
  }, [events]);

  const dismissAlert = useCallback((id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id)), []);

  const value: Ctx = {
    state: stateQuery.data,
    stateError: stateQuery.isError && !stateQuery.data,
    events,
    loading,
    eventsError,
    latestBlock,
    pending: openIds.length ? (pendingQuery.data ?? []) : [],
    allowlist,
    alerts,
    dismissAlert,
    refresh,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

function byNewest(a: FeedEvent, b: FeedEvent) {
  if (a.block !== b.block) return a.block > b.block ? -1 : 1;
  return b.logIndex - a.logIndex;
}
