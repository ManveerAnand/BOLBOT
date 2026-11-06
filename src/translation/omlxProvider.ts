import {
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
      healthUrl.pathname = "/health";
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
    const prompt = renderTranslateGemmaPrompt(request);
    const started = performance.now();

    let response: Response;
    try {
      response = await fetch(`${this.env.TRANSLATION_BASE_URL}/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.env.TRANSLATION_TIMEOUT_MS),
        body: JSON.stringify({
          model: this.env.TRANSLATION_MODEL,
          prompt,
          temperature: 0,
          max_tokens: estimateMaxOutputTokens(request.text),
          stop: [...TRANSLATION_STOP_SEQUENCES],
        }),
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
        `oMLX returned HTTP ${response.status}${body ? `: ${summarizeErrorBody(body)}` : ""}`,
      );
    }

    const payload = (await response.json()) as CompletionsResponse;
    const raw = payload.choices?.[0]?.text ?? "";
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
