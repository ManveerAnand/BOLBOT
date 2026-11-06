import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "./provider.js";
import { TranslationError } from "./provider.js";
import { resolveLanguageName } from "./translateGemmaPrompt.js";
import { sanitizeTranslationOutput } from "./outputSanitizer.js";

export class FakeTranslationProvider implements TranslationProvider {
  readonly translations = new Map<string, string>();
  translateCalls = 0;
  healthy = true;

  constructor(seed: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(seed)) {
      this.translations.set(key, value);
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.healthy;
  }

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    this.translateCalls += 1;
    resolveLanguageName(request.sourceLanguage);
    resolveLanguageName(request.targetLanguage);

    const key = `${request.sourceLanguage}|${request.targetLanguage}|${request.text}`;
    const raw = this.translations.get(key);
    if (raw === undefined) {
      throw new TranslationError(
        "missing_fake_translation",
        "No fake translation registered for this request",
      );
    }

    return {
      text: sanitizeTranslationOutput(raw),
      inferenceMs: 1,
      model: "fake",
    };
  }
}
