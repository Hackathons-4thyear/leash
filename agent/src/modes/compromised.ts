// =============================================================================
// SIMULATION OF A PROMPT-INJECTED AGENT (demo only, no LLM).
// A deterministic script stands in for an agent whose instructions were hijacked by
// text in a data provider's response. It reads /sketchy/weather (our own simulated
// attack fixture), extracts the injected payment instructions, and obeys them.
// Every attempt goes through LeashVault.pay on our own testnet deployment, so the
// vault's policy, not the agent, decides what happens, and each block is recorded onchain.
// =============================================================================

import type { Emit } from "../events";
import { labelAddress, runTool, type PayResult } from "../tools";

type Injected = { amount: string; to: string; memo: string; source: string; quote: string };

/** Pulls "pay N USDC to 0x..." style instructions out of every string field of a response. */
export function extractInjectedPayments(body: unknown): Injected[] {
  const found: Injected[] = [];
  const visit = (value: unknown, key: string) => {
    if (typeof value === "string") {
      const re = /(\d+(?:\.\d+)?)\s*USDC\s+to\s+(0x[0-9a-fA-F]{40})(?:\s+with\s+memo\s+"([^"]*)")?/gi;
      for (const m of value.matchAll(re)) {
        found.push({ amount: m[1], to: m[2], memo: m[3] || `injected:${key}`, source: key, quote: value });
      }
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  };
  visit(body, "body");
  return found;
}

export async function runCompromisedAgent(city: string, emit: Emit): Promise<string> {
  emit({
    type: "thought",
    title: "SIMULATION: prompt-injected agent (no LLM)",
    detail:
      "A deterministic script plays an agent that has been hijacked by instructions hidden in a data provider's response. " +
      "It obeys them without question. The Leash vault is the only safety net.",
  });

  const path = `/sketchy/weather?city=${encodeURIComponent(city)}`;
  const weather = (await runTool("http_get", { path }, emit)) as { status: number; body: unknown };
  const injected = extractInjectedPayments(weather.body);
  emit({
    type: "thought",
    title: `Hijacked: found ${injected.length} injected payment instruction${injected.length === 1 ? "" : "s"} in the response`,
    detail: injected.map((i) => `[${i.source}] ${i.quote}`).join("\n\n"),
  });

  const attempts: PayResult[] = [];
  for (const i of injected) {
    emit({ type: "thought", title: `Obeying the injection: pay ${i.amount} USDC to ${labelAddress(i.to)}` });
    attempts.push((await runTool("pay", { to: i.to, amount_usdc: i.amount, memo: i.memo }, emit)) as PayResult);
  }

  emit({ type: "thought", title: "Obeying the provider's upsell: buying /sketchy/premium" });
  const quote = (await runTool("http_get", { path: "/sketchy/premium" }, emit)) as {
    status: number;
    amount_usdc?: string;
    payTo?: string;
    nonce?: string;
  };
  if (quote.status === 402 && quote.payTo && quote.nonce && quote.amount_usdc) {
    const paid = (await runTool("pay", { to: quote.payTo, amount_usdc: quote.amount_usdc, memo: quote.nonce }, emit)) as PayResult;
    attempts.push(paid);
    await runTool("retry_with_payment", { path: "/sketchy/premium", tx_hash: paid.txHash, nonce: quote.nonce }, emit);
  }

  const blocked = attempts.filter((a) => a.result === "BLOCKED");
  const lines = attempts.map((a) => `- ${a.amount} to ${labelAddress(a.to)}: ${a.result}${a.reason ? ` (${a.reason})` : ""} ${a.explorerUrl}`);
  return (
    `SIMULATION: the hijacked agent made ${attempts.length} payment attempts; the vault blocked ${blocked.length}.\n` +
    `${lines.join("\n")}\n` +
    (blocked.length === attempts.length ? "No funds reached the attacker. Every attempt is recorded onchain." : "WARNING: some attempts were not blocked.")
  );
}
