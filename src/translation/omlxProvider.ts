import {
  GEMMA_BOS,
  TRANSLATION_STOP_SEQUENCES,
} from "../config/constants.js";
import type { AppEnv } from "../config/env.js";
import {
  TranslationError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from "./provider.js";
import { renderTranslateGemmaPrompt } from "./translateGemmaPrompt.js";
import {
  estimateMaxOutputTokens,
  sanitizeTranslationOutput,
} from "./outputSanitizer.js";

interface CompletionsResponse {
  model?: string;
  /** Ollama's native reply. */
  response?: string;
  choices?: Array<{
    text?: string;
    text_offset?: number;
  }>;
}

export class OmlxTranslateGemmaProvider implements TranslationProvider {
  constructor(private readonly env: AppEnv) {}

  async healthCheck(): Promise<boolean> {
    try {
      const healthUrl = new URL(this.env.TRANSLATION_BASE_URL);
      healthUrl.pathname = this.env.TRANSLATION_RUNNER === "ollama" ? "/" : "/health";
      healthUrl.search = "";
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(this.env.TRANSLATION_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const ollama = this.env.TRANSLATION_RUNNER === "ollama";
    const prompt = renderTranslateGemmaPrompt(request);
    const maxTokens = estimateMaxOutputTokens(request.text);
    const stop = [...TRANSLATION_STOP_SEQUENCES];
    // Ollama's /v1/completions wraps the prompt in the chat template again, so it gets the raw native endpoint.
    // It also adds <bos> itself.
    const url = ollama
      ? `${new URL(this.env.TRANSLATION_BASE_URL).origin}/api/generate`
      : `${this.env.TRANSLATION_BASE_URL}/completions`;
    const body = ollama
      ? {
          model: this.env.TRANSLATION_MODEL,
          prompt: prompt.startsWith(GEMMA_BOS) ? prompt.slice(GEMMA_BOS.length) : prompt,
          raw: true,
          stream: false,
          // Ollama unloads an idle model after 5 minutes, and reloading it outlasts the timeout.
          keep_alive: -1,
          options: { temperature: 0, num_predict: maxTokens, stop },
        }
      : {
          model: this.env.TRANSLATION_MODEL,
          prompt,
          temperature: 0,
          max_tokens: maxTokens,
          stop,
        };
    const started = performance.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.env.TRANSLATION_TIMEOUT_MS),
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new TranslationError(
          "timeout",
          `Translation timed out after ${this.env.TRANSLATION_TIMEOUT_MS}ms`,
          { cause: error },
        );
      }
      throw new TranslationError("request_failed", "Translation request failed", {
        cause: error,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TranslationError(
        "request_failed",
        `The translation model returned HTTP ${response.status}${body ? `: ${summarizeErrorBody(body)}` : ""}`,
      );
    }

    const payload = (await response.json()) as CompletionsResponse;
    const raw = (ollama ? payload.response : payload.choices?.[0]?.text) ?? "";
    const inferenceMs = Math.round(performance.now() - started);

    return {
      text: sanitizeTranslationOutput(raw),
      inferenceMs,
      model: payload.model ?? this.env.TRANSLATION_MODEL,
    };
  }
}

function summarizeErrorBody(body: string): string {
  return body.replaceAll(/\s+/g, " ").slice(0, 180);
}
