import type { AppEnv } from "../config/env.js";
import type { LanguageDetection, LanguageDetector } from "./detector.js";
import { extractNaturalText, naturalCharacterCount } from "./naturalText.js";
import { resolveSupportedLanguage } from "./registry.js";
import { detectScript } from "./scriptHeuristics.js";

export type LanguageResolutionSource =
  | "fasttext"
  | "script"
  | "preference";

export interface ResolvedSourceLanguage extends LanguageDetection {
  source: LanguageResolutionSource;
  naturalCharacterCount: number;
}

export class SourceLanguageResolver {
  constructor(
    private readonly detector: LanguageDetector,
    private readonly env: Pick<
      AppEnv,
      | "LANGUAGE_DETECT_MIN_CHARS"
      | "LANGUAGE_DETECT_HIGH_CONFIDENCE"
      | "LANGUAGE_DETECT_MEDIUM_CONFIDENCE"
      | "DEFAULT_LANGUAGE"
    >,
  ) {}

  async resolve(
    text: string,
    preferredLanguage = this.env.DEFAULT_LANGUAGE,
  ): Promise<ResolvedSourceLanguage> {
    const preferred =
      resolveSupportedLanguage(preferredLanguage)?.internalCode ??
      this.env.DEFAULT_LANGUAGE;
    const natural = extractNaturalText(text);
    const count = naturalCharacterCount(text);
    const script = detectScript(natural);

    if (count < this.env.LANGUAGE_DETECT_MIN_CHARS) {
      if (
        script.strong &&
        script.suggestedLanguage &&
        resolveSupportedLanguage(script.suggestedLanguage)
      ) {
        return {
          language: script.suggestedLanguage,
          confidence: 0.99,
          source: "script",
          naturalCharacterCount: count,
        };
      }

      return {
        language: preferred,
        confidence: 0,
        source: "preference",
        naturalCharacterCount: count,
      };
    }

    const detection = await this.detector.detect(natural, preferred);
    const detected =
      resolveSupportedLanguage(detection.language)?.internalCode ??
      detection.language;

    if (detection.confidence >= this.env.LANGUAGE_DETECT_HIGH_CONFIDENCE) {
      if (resolveSupportedLanguage(detected)) {
        return {
          ...detection,
          language: detected,
          source: "fasttext",
          naturalCharacterCount: count,
        };
      }
    }

    if (detected === preferred) {
      return {
        ...detection,
        language: preferred,
        source: "preference",
        naturalCharacterCount: count,
      };
    }

    if (
      script.strong &&
      script.suggestedLanguage &&
      resolveSupportedLanguage(script.suggestedLanguage) &&
      detection.confidence >= this.env.LANGUAGE_DETECT_MEDIUM_CONFIDENCE
    ) {
      return {
        language: script.suggestedLanguage,
        confidence: detection.confidence,
        source: "script",
        naturalCharacterCount: count,
        ...(detection.candidates ? { candidates: detection.candidates } : {}),
      };
    }

    return {
      language: preferred,
      confidence: detection.confidence,
      source: "preference",
      naturalCharacterCount: count,
      ...(detection.candidates ? { candidates: detection.candidates } : {}),
    };
  }
}
