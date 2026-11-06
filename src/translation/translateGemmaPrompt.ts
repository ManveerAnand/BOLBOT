import {
  GEMMA_BOS,
  GEMMA_END_TURN,
  GEMMA_START_MODEL,
  GEMMA_START_USER,
} from "../config/constants.js";
import {
  normalizeLanguageCode,
  resolveSupportedLanguage,
} from "../language/registry.js";
import { TranslationError } from "./provider.js";

export { normalizeLanguageCode };

export function resolveLanguageName(code: string): string {
  const language = resolveSupportedLanguage(code);
  if (!language) {
    throw new TranslationError(
      "unsupported_language",
      `TranslateGemma language code is not enabled: ${code}`,
    );
  }
  return language.displayName;
}

export function renderTranslateGemmaPrompt(input: {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}): string {
  const sourceCode = normalizeLanguageCode(input.sourceLanguage);
  const targetCode = normalizeLanguageCode(input.targetLanguage);
  const sourceName = resolveLanguageName(sourceCode);
  const targetName = resolveLanguageName(targetCode);
  const text = input.text.trim();

  if (!text) {
    throw new TranslationError("empty_input", "Translation text is empty");
  }

  if (sourceCode.toLowerCase() === targetCode.toLowerCase()) {
    throw new TranslationError(
      "same_language",
      `Source and target language are the same: ${sourceCode}`,
    );
  }

  return (
    `${GEMMA_BOS}${GEMMA_START_USER}\n` +
    `You are a professional ${sourceName} (${sourceCode}) to ${targetName} (${targetCode}) translator. ` +
    `Your goal is to accurately convey the meaning and nuances of the original ${sourceName} text ` +
    `while adhering to ${targetName} grammar, vocabulary, and cultural sensitivities.\n` +
    `Produce only the ${targetName} translation, without any additional explanations or commentary. ` +
    `Please translate the following ${sourceName} text into ${targetName}:\n\n\n` +
    `${text}${GEMMA_END_TURN}\n` +
    `${GEMMA_START_MODEL}\n`
  );
}
