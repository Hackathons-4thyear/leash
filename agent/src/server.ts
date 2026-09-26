// Agent control server for the dashboard: POST /run, GET /events (SSE), GET /status.

import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import pc from "picocolors";
import { API_URL, deployment, describeLlm, ENV_FOUND, ENV_PATH, llmConfig, PORT, WEB_ORIGIN } from "./config";
import { bus, type AgentEvent } from "./events";
import { isScenario, MODES, resolveMode, runScenario, SCENARIOS, type Mode, type RunOutcome, type ScenarioName } from "./run";

type Current = {
  runId: string;
  scenario: ScenarioName;
  mode: Mode;
  startedAt: number;
  finishedAt?: number;
  outcome?: RunOutcome;
  /** Events of this run, replayed to dashboards that connect mid-run. */
  events: AgentEvent[];
};

let current: Current | undefined;
const busy = () => Boolean(current && !current.finishedAt);

bus.on("event", (e: AgentEvent) => {
  if (current?.runId === e.runId) current.events.push(e);
  const failed = e.type === "error" || (e.type === "done" && e.result === "failed");
  const color = failed ? pc.red : e.type === "payment" ? pc.yellow : e.type === "done" ? pc.green : pc.dim;
  console.log(`${pc.dim(new Date(e.ts).toISOString().slice(11, 19))} ${color(e.type.padEnd(11))} ${e.title}`);
});

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json());

app.post("/run", (req, res) => {
  const { scenario, mode, city, topic } = req.body ?? {};
  if (!isScenario(scenario)) {
    res.status(400).json({ error: `unknown scenario; expected one of ${Object.keys(SCENARIOS).join(", ")}` });
    return;
  }
  if (mode !== undefined && !MODES.includes(mode)) {
    res.status(400).json({ error: `unknown mode; expected one of ${MODES.join(", ")}` });
    return;
  }
  if (busy()) {
    res.status(409).json({ error: "a run is already in progress", runId: current!.runId });
    return;
  }

  const runId = randomUUID();
  const run: Current = { runId, scenario, mode: resolveMode(scenario, mode), startedAt: Date.now(), events: [] };
  current = run;
  console.log(pc.bold(`\n▶ run ${runId} ${scenario} (${run.mode})`));
  runScenario(scenario, { runId, mode, city, topic }).then((outcome) => {
    run.outcome = outcome;
    run.finishedAt = Date.now();
  });
  res.status(202).json({ runId, scenario, mode: run.mode });
});

app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (e: AgentEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  for (const e of current?.events ?? []) send(e);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  bus.on("event", send);
  req.on("close", () => {
    clearInterval(heartbeat);
    bus.off("event", send);
  });
});

app.get("/status", (_req, res) => {
  const llm = llmConfig();
  res.json({
    busy: busy(),
    run: current && {
      runId: current.runId,
      scenario: current.scenario,
      mode: current.mode,
      startedAt: current.startedAt,
      finishedAt: current.finishedAt ?? null,
      ok: current.outcome?.ok ?? null,
      summary: current.outcome?.summary ?? null,
      events: current.events.length,
    },
    llm: { configured: Boolean(llm), provider: llm?.provider ?? null, model: llm?.model ?? null },
    scenarios: Object.entries(SCENARIOS).map(([name, s]) => ({ name, description: s.description })),
    agent: deployment.addresses.agent,
    vault: deployment.addresses.vault,
    apiUrl: API_URL,
  });
});

app.listen(PORT, () => {
  console.log(`${pc.bold(pc.cyan("Leash agent server"))} on http://localhost:${PORT} (CORS ${WEB_ORIGIN})`);
  console.log(pc.dim(`api ${API_URL} · llm ${describeLlm(llmConfig())} · vault ${deployment.addresses.vault}`));
  if (!ENV_FOUND) console.log(pc.yellow(`warning: ${ENV_PATH} not found; payments will fail until it exists (see agent/.env.example)`));
});
