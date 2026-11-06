import { describe, expect, it } from "vitest";
import { FakeLanguageDetector } from "../../../src/language/fakeDetector";
import { SourceLanguageResolver } from "../../../src/language/sourceLanguageResolver";

const env = {
  LANGUAGE_DETECT_MIN_CHARS: 8,
  LANGUAGE_DETECT_HIGH_CONFIDENCE: 0.75,
  LANGUAGE_DETECT_MEDIUM_CONFIDENCE: 0.45,
  DEFAULT_LANGUAGE: "en",
};

describe("SourceLanguageResolver", () => {
  it("falls back to preferred language for short latin text", async () => {
    const resolver = new SourceLanguageResolver(new FakeLanguageDetector({}), env);
    const result = await resolver.resolve("gg", "en");
    expect(result.language).toBe("en");
    expect(result.source).toBe("preference");
  });

  it("uses a strong script hint for short Chinese text", async () => {
    const resolver = new SourceLanguageResolver(new FakeLanguageDetector({}), env);
    const result = await resolver.resolve("今晚开吗", "en");
    expect(result.language).toBe("zh");
    expect(result.source).toBe("script");
  });

  it("trusts high-confidence detector output", async () => {
    const resolver = new SourceLanguageResolver(
      new FakeLanguageDetector({
        "bro are we doing raid tonight": {
          language: "en",
          confidence: 0.92,
        },
      }),
      env,
    );
    const result = await resolver.resolve(
      "bro are we doing raid tonight",
      "zh",
    );
    expect(result.language).toBe("en");
    expect(result.source).toBe("fasttext");
  });
});
