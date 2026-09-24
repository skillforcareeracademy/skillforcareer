import { logger } from "./logger";

/**
 * A language model behind one vendor-neutral HTTP shim.
 *
 * Same reasoning as `sms.ts`: the academy owns its software, so nothing here
 * ties the platform to a particular AI company. Any endpoint that speaks the
 * widely-copied chat-completions shape (OpenAI, Azure OpenAI, Groq, Together,
 * Ollama or llama.cpp on the academy's own machine) works from env alone.
 *
 *   AI_API_URL    chat-completions endpoint; also the on/off switch
 *                 e.g. https://api.openai.com/v1/chat/completions
 *   AI_API_KEY    sent as `Authorization: Bearer …` when set
 *   AI_MODEL      model name the endpoint expects, e.g. gpt-4o-mini, llama3
 *
 * With nothing configured the callers fall back to the built-in generator, so
 * every feature that asks for help here still works — it just works offline.
 */

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_URL);
}

/** What the provider is called in the UI — never a brand we haven't been given. */
export function aiModelName(): string {
  return process.env.AI_MODEL || "the configured model";
}

interface AskInput {
  /** Standing instruction — who the model is and what shape to answer in. */
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Low by default: these are extraction jobs, not creative writing. */
  temperature?: number;
}

/** The raw text the model replied with, or null if it couldn't be reached. */
export async function askAi(input: AskInput): Promise<string | null> {
  const url = process.env.AI_API_URL;
  if (!url) return null;

  const key = process.env.AI_API_KEY;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 2000,
      }),
      // A generator the admin is waiting on must give up long before the
      // function's own ceiling, so the dialog can offer the built-in instead.
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      logger.warn("ai.request.failed", { status: res.status });
      return null;
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      // Some self-hosted servers answer in the older completions shape.
      content?: { text?: string }[];
    };
    const text = body.choices?.[0]?.message?.content ?? body.content?.[0]?.text ?? "";
    return text.trim() || null;
  } catch (err) {
    logger.warn("ai.request.error", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Pull the JSON out of a model's reply. Models wrap JSON in prose and fences
 * however they feel, so the first `[`…`]` or `{`…`}` is what counts.
 */
export function parseAiJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const body = (fenced?.[1] ?? reply).trim();
  const start = body.search(/[[{]/);
  if (start === -1) return null;
  const end = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
