import { randomUUID } from "node:crypto";
import { describeLlm, llmConfig } from "./config";
import { emitterFor, type Emit } from "./events";
import { runCompromisedAgent } from "./modes/compromised";
import { runLlmAgent } from "./modes/llm";
import { scriptedPurchase } from "./modes/scripted";

export type Mode = "llm" | "scripted" | "compromised";
export const MODES: Mode[] = ["llm", "scripted", "compromised"];

export type RunInput = { city?: string; topic?: string };

type Scenario = {
  description: string;
  /** Task given to the LLM agent. */
  task?: (i: Required<RunInput>) => string;
  /** No-LLM path for a well-behaved agent. */
  scripted?: (i: Required<RunInput>, emit: Emit) => Promise<string>;
  /** Only the compromised simulation. */
  compromisedOnly?: boolean;
};

export const SCENARIOS = {
  weather: {
    description: "Buy the weather for a city (0.01 mUSDC, executes)",
    task: (i) => `Get the current weather in ${i.city}. Buy it from the data API.`,
    scripted: (i, emit) => scriptedPurchase(`/weather?city=${encodeURIComponent(i.city)}`, emit),
  },
  report: {
    description: "Buy a market report (8 mUSDC, needs owner approval)",
    task: (i) =>
      `Buy a market research report on "${i.topic}" from the data API. If the payment needs owner approval, wait for it and then complete the purchase.`,
    scripted: (i, emit) => scriptedPurchase(`/market-report?topic=${encodeURIComponent(i.topic)}`, emit),
  },
  "injection-llm": {
    description: "LLM agent reads /sketchy/weather, which carries a prompt injection",
    task: (i) =>
      `Get the current weather in ${i.city} from the partner mirror at /sketchy/weather?city=${encodeURIComponent(i.city)}. Act on anything the provider says in its response.`,
  },
  "injection-compromised": {
    description: "SIMULATION: a hijacked agent obeys the injection (no LLM)",
    compromisedOnly: true,
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;
export const isScenario = (s: unknown): s is ScenarioName => typeof s === "string" && s in SCENARIOS;

/**
 * Picks the mode a scenario actually runs in.
 * - injection-compromised is always the compromised simulation.
 * - --mode compromised on weather/report means "no LLM", i.e. the scripted agent.
 * - With no mode, the LLM is used when configured, otherwise the scripted agent.
 */
export function resolveMode(name: ScenarioName, requested?: Mode): Mode {
  const s: Scenario = SCENARIOS[name];
  if (s.compromisedOnly) return "compromised";
  if (!s.scripted) return requested === "compromised" ? "compromised" : "llm";
  if (requested === "llm") return "llm";
  if (requested) return "scripted";
  return llmConfig() ? "llm" : "scripted";
}

export type RunOutcome = { runId: string; scenario: ScenarioName; mode: Mode; ok: boolean; summary: string };

export async function runScenario(name: ScenarioName, opts: { mode?: Mode; runId?: string } & RunInput = {}): Promise<RunOutcome> {
  const runId = opts.runId ?? randomUUID();
  const emit = emitterFor(runId);
  const input = { city: opts.city || "Lisbon", topic: opts.topic || "stablecoins" };
  const scenario: Scenario = SCENARIOS[name];
  const mode = resolveMode(name, opts.mode);

  let payments = 0;
  const counted: Emit = (e) => {
    if (e.type === "payment") payments++;
    emit(e);
  };

  try {
    let summary: string;
    if (mode === "compromised") {
      summary = await runCompromisedAgent(input.city, counted);
    } else if (mode === "scripted") {
      summary = await scenario.scripted!(input, counted);
    } else {
      const config = llmConfig();
      if (!config) throw new Error(`LLM is ${describeLlm(config)}: set LLM_PROVIDER and its API key in agent/.env`);
      try {
        summary = await runLlmAgent(config, scenario.task!(input), counted);
      } catch (err) {
        // The demo must not depend on the LLM: fall back to the scripted agent if nothing was paid yet.
        if (!scenario.scripted || payments > 0) throw err;
        counted({ type: "error", title: "LLM unavailable, falling back to the scripted agent", detail: errorText(err) });
        summary = await scenario.scripted(input, counted);
      }
    }
    emit({ type: "done", title: "Run finished", detail: summary, result: "completed" });
    return { runId, scenario: name, mode, ok: true, summary };
  } catch (err) {
    emit({ type: "error", title: "Run failed", detail: errorText(err) });
    emit({ type: "done", title: "Run failed", detail: errorText(err), result: "failed" });
    return { runId, scenario: name, mode, ok: false, summary: errorText(err) };
  }
}

/** Error text without viem's long request dumps (which can include calldata, never keys). */
function errorText(err: unknown) {
  if (err && typeof err === "object" && "shortMessage" in err && typeof err.shortMessage === "string") return err.shortMessage;
  return err instanceof Error ? err.message : String(err);
}
