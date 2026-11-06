import { describe, expect, it } from "vitest";
import { FastTextWasmLanguageDetector } from "../../../src/language/fastTextDetector";
import { SourceLanguageResolver } from "../../../src/language/sourceLanguageResolver";
import { LANGUAGE_FIXTURES } from "../../fixtures/languageSamples";

const env = {
  LANGUAGE_DETECT_MIN_CHARS: 8,
  LANGUAGE_DETECT_HIGH_CONFIDENCE: 0.75,
  LANGUAGE_DETECT_MEDIUM_CONFIDENCE: 0.45,
  DEFAULT_LANGUAGE: "en",
};

describe("FastTextWasmLanguageDetector", () => {
  it("recognizes common server languages without network access", async () => {
    const detector = new FastTextWasmLanguageDetector();
    const resolver = new SourceLanguageResolver(detector, env);

    for (const [language, text] of Object.entries(LANGUAGE_FIXTURES)) {
      const result = await resolver.resolve(text, "en");
      expect(result.language, text).toBe(language);
    }
  }, 20_000);
});
