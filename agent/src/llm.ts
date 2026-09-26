// Minimal tool-calling chat over plain fetch: Anthropic Messages API or any OpenAI-compatible endpoint.

import type { LlmConfig } from "./config";
import type { ToolDef } from "./tools";

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ToolOutput = { id: string; content: string; isError?: boolean };
export type Turn = { text: string; toolCalls: ToolCall[] };

/** A conversation that keeps its own provider-native history. */
export interface ChatSession {
  next(): Promise<Turn>;
  addToolResults(results: ToolOutput[]): void;
}

export function createSession(config: LlmConfig, system: string, task: string, tools: ToolDef[]): ChatSession {
  return config.provider === "anthropic" ? anthropicSession(config, system, task, tools) : openaiSession(config, system, task, tools);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown };

function anthropicSession(config: Extract<LlmConfig, { provider: "anthropic" }>, system: string, task: string, tools: ToolDef[]): ChatSession {
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: task }];
  const toolSpecs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  return {
    async next() {
      const res = await postJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
        { model: config.model, max_tokens: 16000, system, tools: toolSpecs, messages },
      );
      if (res.stop_reason === "refusal") throw new Error("The model declined the request (stop_reason: refusal)");
      const content = res.content as AnthropicBlock[];
      // Append the full content (including any thinking blocks) so the next turn is valid.
      messages.push({ role: "assistant", content });
      const text = content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const toolCalls = content
        .filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} }));
      return { text, toolCalls };
    },
    addToolResults(results) {
      // All results for one assistant turn go back in a single user message.
      messages.push({
        role: "user",
        content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completions (OpenAI, Groq, OpenRouter, ...)
// ---------------------------------------------------------------------------

type OpenAiToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

function openaiSession(config: Extract<LlmConfig, { provider: "openai" }>, system: string, task: string, tools: ToolDef[]): ChatSession {
  const messages: Record<string, unknown>[] = [
    { role: "system", content: system },
    { role: "user", content: task },
  ];
  const toolSpecs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));

  return {
    async next() {
      const res = await postJson(
        `${config.baseUrl}/chat/completions`,
        { authorization: `Bearer ${config.apiKey}` },
        { model: config.model, messages, tools: toolSpecs, tool_choice: "auto" },
      );
      const message = res.choices?.[0]?.message;
      if (!message) throw new Error("LLM returned no message");
      const calls = (message.tool_calls ?? []) as OpenAiToolCall[];
      messages.push({ role: "assistant", content: message.content ?? "", ...(calls.length ? { tool_calls: calls } : {}) });
      const toolCalls = calls.map((c) => {
        let args: Record<string, unknown> = {};
        try {
          args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          args = { _unparsed: c.function.arguments };
        }
        return { id: c.id, name: c.function.name, args };
      });
      return { text: String(message.content ?? "").trim(), toolCalls };
    },
    addToolResults(results) {
      for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    },
  };
}
