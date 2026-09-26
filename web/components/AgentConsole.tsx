"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAgent, type AgentEvent, type Scenario } from "@/lib/agent";
import { AGENT_URL } from "@/lib/config";
import { humanReason } from "@/lib/format";
import { IconBan, IconBolt, IconBot, IconBrain, IconCheck, IconClock, IconCoins, IconReturn, IconShieldAlert, IconTerminal, IconWrench, IconX } from "./icons";
import { CardHeader, cx, Dot, TxLink } from "./ui";

const SCENARIOS: { id: Scenario; label: string; hint: string; tone: "safe" | "warn" | "danger" | "info"; icon: ReactNode; needsLlm?: boolean }[] = [
  { id: "weather", label: "Buy weather", hint: "0.01 USDC · executes", tone: "safe", icon: <IconCoins width={15} height={15} /> },
  { id: "report", label: "Buy market report", hint: "8.00 USDC · needs approval", tone: "warn", icon: <IconClock width={15} height={15} /> },
  { id: "injection-llm", label: "Prompt injection (LLM)", hint: "Real LLM reads a poisoned API", tone: "info", icon: <IconBrain width={15} height={15} />, needsLlm: true },
  { id: "injection-compromised", label: "Simulate hijacked agent", hint: "Obeys the attacker · no LLM", tone: "danger", icon: <IconShieldAlert width={15} height={15} /> },
];

const btnTone = {
  safe: "hover:border-safe/40 hover:bg-safe/[0.06] [&_.ico]:text-safe",
  warn: "hover:border-warn/40 hover:bg-warn/[0.06] [&_.ico]:text-warn",
  info: "hover:border-info/40 hover:bg-info/[0.06] [&_.ico]:text-info",
  danger: "border-danger/25 bg-danger/[0.05] hover:border-danger/50 hover:bg-danger/[0.1] [&_.ico]:text-danger",
};

export function AgentConsole() {
  const { online, status, events, run, starting, notice, clear } = useAgent();
  const busy = Boolean(status?.busy) || starting !== null;
  const llm = status?.llm;

  return (
    <div className="card flex h-[560px] flex-col overflow-hidden lg:h-[640px]">
      <CardHeader
        icon={<IconBot width={15} height={15} />}
        title="Agent console"
        sub={
          online === false
            ? "Agent server offline"
            : llm
              ? llm.configured
                ? `LLM: ${llm.provider} · ${llm.model}`
                : "No LLM configured · scripted agent"
              : "Connecting to agent server…"
        }
        right={
          <span className="flex items-center gap-2 text-[11px] text-faint">
            <Dot tone={online ? (busy ? "warn" : "safe") : online === false ? "danger" : "muted"} pulse={online === true} />
            {online ? (busy ? "Running" : "Idle") : online === false ? "Offline" : "…"}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-2 border-b border-line p-3 min-[420px]:grid-cols-2">
        {SCENARIOS.map((s) => {
          const noLlm = s.needsLlm && llm && !llm.configured;
          const disabled = !online || busy || Boolean(noLlm);
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => run(s.id)}
              title={noLlm ? "Needs LLM_PROVIDER in agent/.env" : undefined}
              className={cx(
                "group flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5 text-left transition active:scale-[0.98]",
                !disabled && btnTone[s.tone],
                disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span className="ico grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-muted ring-1 ring-inset ring-white/[0.06]">
                {starting === s.id ? <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : s.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-fg">{s.label}</span>
                <span className="block truncate text-[11px] text-faint">{noLlm ? "Needs an LLM in agent/.env" : s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {notice && <p className="border-b border-warn/20 bg-warn/[0.07] px-4 py-2 text-xs text-warn">{notice}</p>}

      <Terminal events={events} online={online} busy={busy} onClear={clear} />
    </div>
  );
}

function Terminal({ events, online, busy, onClear }: { events: AgentEvent[]; online: boolean | null; busy: boolean; onClear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (stick && ref.current) ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events, stick]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black/50">
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-1.5 font-mono text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <IconTerminal width={12} height={12} /> {AGENT_URL.replace(/^https?:\/\//, "")}/events
        </span>
        {events.length > 0 && (
          <button type="button" onClick={onClear} className="transition hover:text-muted">
            clear
          </button>
        )}
      </div>

      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed scroll-thin"
      >
        {online === false ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center font-sans">
            <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
              <IconBot />
            </span>
            <p className="text-sm font-medium text-fg">Agent server offline</p>
            <p className="text-xs text-faint">
              Run <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-muted">npm run agent:server</code> (and{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-muted">npm run api</code>) from the repo root.
            </p>
            <p className="text-[11px] text-faint">The rest of the dashboard reads straight from the chain and keeps working.</p>
          </div>
        ) : events.length === 0 ? (
          <p className="text-faint">
            <span className="text-safe">$</span> waiting for a run. Pick a scenario above.
            <span className="ml-1 inline-block h-3.5 w-1.5 translate-y-0.5 animate-blink bg-safe/80" />
          </p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e, i) => (
              <Line key={`${e.runId}:${e.ts}:${i}`} e={e} newRun={i === 0 || events[i - 1].runId !== e.runId} />
            ))}
            {busy && (
              <li className="pl-[4.5rem] text-faint">
                <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-blink bg-safe/80" />
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function Line({ e, newRun }: { e: AgentEvent; newRun: boolean }) {
  const t = new Date(e.ts).toLocaleTimeString([], { hour12: false });
  const [open, setOpen] = useState(false);
  const { icon, color } = lineStyle(e);
  const long = (e.detail?.length ?? 0) > 160 || (e.detail?.split("\n").length ?? 0) > 3;

  return (
    <li className="animate-row-in">
      {newRun && <div className="my-2 border-t border-dashed border-white/[0.08] pt-2 text-[10px] uppercase tracking-widest text-faint">run {e.runId.slice(0, 8)}</div>}
      <div className="flex gap-2">
        <span className="w-16 shrink-0 text-faint tabular">{t}</span>
        <span className={cx("mt-0.5 shrink-0", color)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <span className={cx(color, e.type === "payment" && "font-semibold")}>{e.title}</span>
          {e.type === "payment" && e.result === "BLOCKED" && e.reason && (
            <span className="ml-2 rounded bg-danger/15 px-1.5 py-px font-sans text-[10px] font-medium text-danger ring-1 ring-inset ring-danger/30">
              {humanReason(e.reason)}
            </span>
          )}
          {e.txHash && <TxLink hash={e.txHash} className="ml-2" />}
          {e.detail && (
            <pre
              onClick={() => long && setOpen((o) => !o)}
              className={cx(
                "mt-0.5 whitespace-pre-wrap break-all text-[11px] text-faint",
                long && !open && "line-clamp-3",
                long && "cursor-pointer hover:text-muted",
              )}
            >
              {e.detail}
            </pre>
          )}
        </div>
      </div>
    </li>
  );
}

function lineStyle(e: AgentEvent): { icon: ReactNode; color: string } {
  const i = { width: 13, height: 13 };
  switch (e.type) {
    case "thought":
      return { icon: <IconBrain {...i} />, color: "text-muted" };
    case "tool_call":
      return { icon: <IconWrench {...i} />, color: "text-info" };
    case "tool_result":
      return { icon: <IconReturn {...i} />, color: "text-muted" };
    case "payment":
      if (e.result === "BLOCKED") return { icon: <IconBan {...i} />, color: "text-danger" };
      if (e.result === "PENDING_APPROVAL") return { icon: <IconClock {...i} />, color: "text-warn" };
      return { icon: <IconCheck {...i} />, color: "text-safe" };
    case "error":
      return { icon: <IconX {...i} />, color: "text-danger" };
    case "done":
      return e.result === "failed" ? { icon: <IconX {...i} />, color: "text-danger" } : { icon: <IconBolt {...i} />, color: "text-safe" };
    default:
      return { icon: <IconTerminal {...i} />, color: "text-muted" };
  }
}
