import { EventEmitter } from "node:events";

export type StepType = "thought" | "tool_call" | "tool_result" | "payment" | "error" | "done";

/** One step of a run, streamed to the CLI and to the dashboard over SSE. */
export type AgentEvent = {
  runId: string;
  ts: number;
  type: StepType;
  title: string;
  detail?: string;
  txHash?: string;
  explorerUrl?: string;
  /** Payments: EXECUTED | BLOCKED | PENDING_APPROVAL. done: completed | failed. */
  result?: string;
  reason?: string;
};

export type Emit = (event: Omit<AgentEvent, "runId" | "ts">) => void;

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emitterFor(runId: string): Emit {
  return (event) => bus.emit("event", { runId, ts: Date.now(), ...event } satisfies AgentEvent);
}
