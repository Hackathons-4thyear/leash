// npm run agent -- <scenario> [--mode llm|scripted|compromised] [--city X] [--topic Y]

import pc from "picocolors";
import { addressUrl } from "@leash/shared";
import { API_URL, deployment, describeLlm, ENV_FOUND, ENV_PATH, llmConfig } from "./config";
import { bus, type AgentEvent, type StepType } from "./events";
import { isScenario, MODES, resolveMode, runScenario, SCENARIOS, type Mode } from "./run";

const TAGS: Record<StepType, [string, (s: string) => string]> = {
  thought: ["THINK", (s) => pc.bgMagenta(pc.white(s))],
  tool_call: ["CALL", pc.bgBlue],
  tool_result: ["RESULT", pc.bgCyan],
  payment: ["PAY", pc.bgYellow],
  error: ["ERROR", pc.bgRed],
  done: ["DONE", pc.bgGreen],
};
const RESULT_COLOR: Record<string, (s: string) => string> = { EXECUTED: pc.green, BLOCKED: pc.red, PENDING_APPROVAL: pc.yellow };
const MAX_DETAIL_LINES = 14;
const INDENT = " ".repeat(19);

function indent(text: string, color: (s: string) => string) {
  const lines = text.split("\n");
  const shown = lines.length > MAX_DETAIL_LINES ? [...lines.slice(0, MAX_DETAIL_LINES), `… (${lines.length - MAX_DETAIL_LINES} more lines)`] : lines;
  return shown.map((l) => INDENT + color(l)).join("\n");
}

function print(e: AgentEvent) {
  const [label, bg] = e.type === "done" && e.result === "failed" ? ["FAILED", pc.bgRed] : TAGS[e.type];
  const time = pc.dim(new Date(e.ts).toISOString().slice(11, 19));
  let title = e.title;
  if (e.type === "payment") title = pc.bold((RESULT_COLOR[e.result ?? ""] ?? pc.white)(title));
  else if (e.type === "error") title = pc.red(title);
  else if (e.type === "done") title = pc.bold(title);
  console.log(`${time} ${bg(pc.bold(` ${label.padEnd(7)}`))}  ${title}`);

  if (e.detail) {
    const color = e.type === "thought" || e.type === "done" ? (s: string) => s : pc.dim;
    if (e.type !== "tool_call") console.log(indent(e.detail, color));
  }
  if (e.explorerUrl) console.log(`${INDENT}${pc.dim("tx")} ${pc.underline(e.explorerUrl)}`);
  if (e.type === "done" || e.type === "payment") console.log();
}

function usage(code = 1): never {
  console.log(`\n${pc.bold("Usage:")} npm run agent -- <scenario> [--mode ${MODES.join("|")}] [--city X] [--topic Y]\n`);
  console.log(pc.bold("Scenarios:"));
  for (const [name, s] of Object.entries(SCENARIOS)) console.log(`  ${pc.cyan(name.padEnd(22))} ${s.description}`);
  console.log(`\nWithout --mode, weather and report use the LLM when one is configured, else the scripted agent.\n`);
  process.exit(code);
}

function parseArgs(argv: string[]) {
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (argv.includes("--help") || argv.includes("-h")) usage(0);
  const scenario = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  if (!isScenario(scenario)) usage();
  const mode = flag("mode") as Mode | undefined;
  if (mode && !MODES.includes(mode)) usage();
  return { scenario, mode, city: flag("city"), topic: flag("topic") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ENV_FOUND) {
    console.error(pc.red(`\nMissing ${ENV_PATH}.`));
    console.error(`Create it from the template:  cp agent/.env.example agent/.env`);
    console.error(`Then set AGENT_PRIVATE_KEY (the vault's agent key, same as api/.env) and, for --mode llm, LLM_PROVIDER plus its API key.\n`);
    process.exit(1);
  }
  const mode = resolveMode(args.scenario, args.mode);

  console.log(`\n${pc.bold(pc.cyan("Leash agent"))}  ${pc.bold(args.scenario)}  ${pc.dim("mode")} ${mode === "compromised" ? pc.red(pc.bold(mode)) : pc.bold(mode)}`);
  if (mode === "compromised") console.log(pc.red("SIMULATION of a prompt-injected agent. It obeys the attacker; only the vault stands in the way."));
  console.log(pc.dim(`vault  ${addressUrl(deployment.addresses.vault)}`));
  console.log(pc.dim(`api    ${API_URL}`));
  if (mode === "llm") console.log(pc.dim(`llm    ${describeLlm(llmConfig())}`));
  console.log();

  bus.on("event", print);
  const outcome = await runScenario(args.scenario, { mode: args.mode, city: args.city, topic: args.topic });
  process.exit(outcome.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(pc.red(`\nerror: ${err instanceof Error ? err.message : err}`));
  process.exit(1);
});
