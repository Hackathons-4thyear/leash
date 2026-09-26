import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Hex } from "viem";
import { baseSepolia as deployment } from "@leash/shared";

/** agent/.env, resolved from this file so it loads whether run from the repo root or agent/. */
export const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));
export const ENV_FOUND = existsSync(ENV_PATH);
dotenv.config({ path: ENV_PATH, quiet: true });

const env = (name: string) => process.env[name]?.trim() || undefined;

export { deployment };

export const API_URL = (env("API_URL") || "http://localhost:4021").replace(/\/$/, "");
export const RPC_URL = env("RPC_URL") || deployment.rpcUrl;
export const PORT = Number(env("PORT") || 4022);
export const WEB_ORIGIN = "http://localhost:3000";

/** Read lazily so a missing key only fails when the agent actually tries to pay. */
export function agentPrivateKey(): Hex {
  const key = env("AGENT_PRIVATE_KEY");
  if (!key) throw new Error(`AGENT_PRIVATE_KEY is missing from ${ENV_PATH} (see agent/.env.example)`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
  return key as Hex;
}

export type LlmConfig =
  | { provider: "anthropic"; apiKey: string; model: string }
  | { provider: "openai"; apiKey: string; model: string; baseUrl: string };

/** The configured LLM, or null when LLM_PROVIDER is unset or its key is missing. */
export function llmConfig(): LlmConfig | null {
  const provider = env("LLM_PROVIDER")?.toLowerCase();
  if (provider === "anthropic") {
    const apiKey = env("ANTHROPIC_API_KEY");
    return apiKey ? { provider, apiKey, model: env("ANTHROPIC_MODEL") || "claude-opus-5" } : null;
  }
  if (provider === "openai") {
    const apiKey = env("OPENAI_API_KEY");
    const model = env("OPENAI_MODEL");
    if (!apiKey || !model) return null;
    return { provider, apiKey, model, baseUrl: (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "") };
  }
  return null;
}

/** Safe to print: provider + model only, never keys. */
export const describeLlm = (c: LlmConfig | null) => (c ? `${c.provider} (${c.model})` : "not configured");
