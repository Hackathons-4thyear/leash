// Deterministic, well-behaved agent (no LLM): the same tools, called in a fixed order.
// Keeps the weather and report demos working when no LLM is configured or reachable.

import type { Emit } from "../events";
import { labelAddress, runTool, type PayResult } from "../tools";

type Quote = { status: number; paymentRequired?: boolean; price: string; amount_usdc: string; payTo: string; nonce: string; body?: unknown };
type Fetched = { status: number; body: unknown };

/** http_get -> 402 -> vault.pay -> (wait for approval) -> retry. Returns a one-paragraph summary. */
export async function scriptedPurchase(path: string, emit: Emit): Promise<string> {
  emit({ type: "thought", title: "Scripted agent (no LLM)", detail: `Buying ${path} through the Leash vault.` });
  await runTool("list_services", {}, emit);

  const quote = (await runTool("http_get", { path }, emit)) as Quote;
  if (quote.status !== 402 || !quote.paymentRequired) return `GET ${path} returned ${quote.status} without asking for payment.`;
  emit({ type: "thought", title: `The API wants ${quote.price} paid to ${labelAddress(quote.payTo)}. Paying through the vault.` });

  const paid = (await runTool("pay", { to: quote.payTo, amount_usdc: quote.amount_usdc, memo: quote.nonce }, emit)) as PayResult;
  const receiptLine = `${paid.amount} to ${labelAddress(paid.to)}: ${paid.result}${paid.reason ? ` (${paid.reason})` : ""}. ${paid.explorerUrl}`;

  let proofTx = paid.txHash as string;
  if (paid.result === "BLOCKED") return `The vault blocked the payment, so no data was bought. ${receiptLine}`;
  if (paid.result === "PENDING_APPROVAL") {
    const req = (await runTool("check_request", { request_id: paid.requestId, wait: true }, emit)) as { status: string; approvalTxHash?: string };
    if (req.status !== "Approved" || !req.approvalTxHash) {
      return `Payment request #${paid.requestId} is ${req.status}${req.status === "Pending" ? " (timed out waiting for the owner)" : ""}; no data was bought. ${receiptLine}`;
    }
    emit({ type: "thought", title: "The owner approved the payment. Fetching the report with the approval tx." });
    proofTx = req.approvalTxHash;
  }

  const data = (await runTool("retry_with_payment", { path, tx_hash: proofTx, nonce: quote.nonce }, emit)) as Fetched;
  if (data.status !== 200) return `Paid, but the API answered ${data.status}. ${receiptLine}`;
  return `${summarize(data.body)}\nPaid ${receiptLine}`;
}

function summarize(body: unknown): string {
  const b = body as Record<string, unknown>;
  if (b && "temperatureC" in b) return `Weather in ${b.city}: ${b.temperatureC}°C, ${b.condition}, humidity ${b.humidityPct}%, wind ${b.windKph} km/h.`;
  if (b && "summary" in b) return `Market report on ${b.topic} (${b.sentiment}, ${b.confidencePct}% confidence): ${b.summary}`;
  return JSON.stringify(body);
}
