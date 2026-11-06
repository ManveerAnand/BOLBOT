import { COMMENTARY_PATTERNS } from "../config/constants.js";
import { TranslationError } from "./provider.js";

export function sanitizeTranslationOutput(raw: string): string {
  let text = raw.replaceAll("<end_of_turn>", "").replaceAll("<eos>", "").trim();

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("“") && text.endsWith("”"))
  ) {
    text = text.slice(1, -1).trim();
  }

  if (!text) {
    throw new TranslationError(
      "empty_output",
      "Model returned empty translation output",
    );
  }

  for (const pattern of COMMENTARY_PATTERNS) {
    if (pattern.test(text)) {
      throw new TranslationError(
        "prompt_commentary",
        "Model output looks like prompt commentary rather than a translation",
      );
    }
  }

  return text;
}

export function estimateMaxOutputTokens(sourceText: string): number {
  const approxTokens = Math.ceil(sourceText.length / 2);
  return Math.min(1024, Math.max(32, approxTokens));
}
