"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AGENT_URL } from "./config";
import { useVault } from "./vault";

/** Mirrors agent/src/events.ts. */
export type AgentEvent = {
  runId: string;
  ts: number;
  type: "thought" | "tool_call" | "tool_result" | "payment" | "error" | "done";
  title: string;
  detail?: string;
  txHash?: string;
  explorerUrl?: string;
  result?: string;
  reason?: string;
};

export type AgentStatus = {
  busy: boolean;
  run?: { runId: string; scenario: string; mode: string; startedAt: number; finishedAt: number | null } | null;
  llm: { configured: boolean; provider: string | null; model: string | null };
};

export type Scenario = "weather" | "report" | "injection-llm" | "injection-compromised";

type Ctx = {
  online: boolean | null;
  status?: AgentStatus;
  events: AgentEvent[];
  run: (scenario: Scenario) => Promise<void>;
  starting: Scenario | null;
  notice: string | null;
  clear: () => void;
};

const AgentContext = createContext<Ctx | null>(null);

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent outside AgentProvider");
  return ctx;
}

const MAX_EVENTS = 300;

export function AgentProvider({ children }: { children: ReactNode }) {
  const { refresh } = useVault();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const [online, setOnline] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AgentStatus>();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [starting, setStarting] = useState<Scenario | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/status`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setStatus(await res.json());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const id = setInterval(loadStatus, 3_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // SSE stream. EventSource reconnects on its own; we just track it.
  useEffect(() => {
    if (!online) return;
    const seen = new Set<string>();
    const es = new EventSource(`${AGENT_URL}/events`);
    es.onmessage = (msg) => {
      let e: AgentEvent;
      try {
        e = JSON.parse(msg.data);
      } catch {
        return;
      }
      const key = `${e.runId}:${e.ts}:${e.type}:${e.title}`;
      if (seen.has(key)) return;
      seen.add(key);
      setEvents((prev) => {
        if (prev.some((p) => `${p.runId}:${p.ts}:${p.type}:${p.title}` === key)) return prev;
        return [...prev, e].slice(-MAX_EVENTS);
      });
      if (e.type === "payment" || e.type === "done") refreshRef.current();
      if (e.type === "done") void loadStatus();
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setOnline(false);
    };
    return () => es.close();
  }, [online, loadStatus]);

  const run = useCallback(
    async (scenario: Scenario) => {
      setStarting(scenario);
      setNotice(null);
      try {
        const res = await fetch(`${AGENT_URL}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario }),
        });
        if (res.status === 409) setNotice("The agent is busy with another run. Wait for it to finish.");
        else if (!res.ok) setNotice(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Agent server error ${res.status}`);
        await loadStatus();
      } catch {
        setOnline(false);
      } finally {
        setStarting(null);
      }
    },
    [loadStatus],
  );

  const clear = useCallback(() => setEvents([]), []);

  return (
    <AgentContext.Provider value={{ online, status, events, run, starting, notice, clear }}>{children}</AgentContext.Provider>
  );
}
