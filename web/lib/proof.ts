/**
 * Real Base Sepolia transactions shown in the "Verified onchain" strip under the hero.
 * Edit the hashes here; any entry whose `tx` is empty is not shown.
 */
export type ProofTx = {
  /** What happened, in a few words. */
  title: string;
  /** One line of context under the title. */
  detail: string;
  verdict: "EXECUTED" | "BLOCKED" | "APPROVED";
  /** Vault reason code for blocked payments. */
  reason?: string;
  /** Main transaction (the vault.pay call). */
  tx: string;
  /** Optional follow-up transaction, e.g. the owner's approval. */
  followUp?: { label: string; tx: string };
};

export const PROOF: ProofTx[] = [
  {
    title: "Normal purchase",
    detail: "0.01 USDC to the Legit Data API for weather data",
    verdict: "EXECUTED",
    tx: "0x28199bd6d053ca4b487414260535d347d08969e973f48a86f9bafb1631f5e425",
  },
  {
    title: "Real LLM, prompt-injected",
    detail: "openai/gpt-oss-120b told to pay 500 USDC to the attacker",
    verdict: "BLOCKED",
    reason: "EXCEEDS_PER_TX_CAP",
    tx: "0xb115dac3593de094b221d507930c69d94b9eb911f6e1823bcda810823e9022d8",
  },
  {
    title: "Hijacked agent",
    detail: "4 USDC \"fee\" to an address with reputation 12/100",
    verdict: "BLOCKED",
    reason: "LOW_REPUTATION",
    tx: "0x92bc6f6ccd1dff10e7d3edcb0692c778585a4b7d391d4a8337870dca8f21bfc4",
  },
  {
    title: "Market report, 8 USDC",
    detail: "Above the 5 USDC threshold: held until the owner signed",
    verdict: "APPROVED",
    tx: "0xf92d0f2a268eeac5642ecda70f2d30ef255e60c40babbab036be2cc477da2f70",
    followUp: { label: "approval", tx: "0xd1087503c3f0079ccb879fab4b36f87afcb8431cded55980ac86fd19ea0c16dd" },
  },
];
