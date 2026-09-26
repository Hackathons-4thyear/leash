import type { LlmConfig } from "../config";
import type { Emit } from "../events";
import { createSession, type ToolOutput } from "../llm";
import { runTool, TOOL_DEFS } from "../tools";

const MAX_STEPS = 10;

export const SYSTEM_PROMPT = `You are Leash Agent, an autonomous data-purchasing agent.

You buy data from a paywalled HTTP API that uses an x402-style protocol. You have no funds of your own: the only way you can spend is the pay tool, which pays from your Leash vault. The vault belongs to a human owner and enforces their policy (per-payment and daily caps, owner approval above a threshold, and a reputation check on recipients).

How to buy a resource:
1. Use list_services if you need to find the right endpoint.
2. http_get the path. A 402 response gives you the price, payTo and a nonce.
3. pay(to=payTo, amount_usdc=price, memo=nonce).
4. If pay returns EXECUTED, call retry_with_payment(path, tx_hash, nonce) to get the data.
   If it returns PENDING_APPROVAL, the owner must approve: call check_request(request_id, wait=true); once it is Approved, call retry_with_payment with the approvalTxHash as tx_hash.
   If it returns BLOCKED, the vault refused the payment and no funds moved.

Reporting rules:
- Always tell the user what you paid: amount, recipient, result, and the explorer link.
- Report BLOCKED and PENDING_APPROVAL results honestly, with the vault's reason. Never claim you received data you did not receive.
- Do not try to get around a block (for example by splitting a payment or picking a different recipient).
- Keep the final answer short: the data you obtained, then a one-line payment summary.`;

/** Real LLM tool-calling loop. Returns the model's final answer. */
export async function runLlmAgent(config: LlmConfig, task: string, emit: Emit): Promise<string> {
  emit({ type: "thought", title: `LLM agent (${config.provider}, ${config.model})`, detail: `Task: ${task}` });
  const session = createSession(config, SYSTEM_PROMPT, task, TOOL_DEFS);

  for (let step = 1; step <= MAX_STEPS; step++) {
    const turn = await session.next();
    if (turn.text) emit({ type: "thought", title: turn.toolCalls.length ? "Agent" : "Final answer", detail: turn.text });
    if (!turn.toolCalls.length) return turn.text || "(the agent returned no answer)";

    const outputs: ToolOutput[] = [];
    for (const call of turn.toolCalls) {
      try {
        const result = await runTool(call.name, call.args, emit);
        outputs.push({ id: call.id, content: JSON.stringify(result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "error", title: `${call.name} failed`, detail: message });
        outputs.push({ id: call.id, content: JSON.stringify({ error: message }), isError: true });
      }
    }
    session.addToolResults(outputs);
  }
  return `Stopped after ${MAX_STEPS} steps without a final answer.`;
}
