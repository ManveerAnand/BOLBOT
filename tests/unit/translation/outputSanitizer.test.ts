import { describe, expect, it } from "vitest";
import { sanitizeTranslationOutput } from "../../../src/translation/outputSanitizer";
import { TranslationError } from "../../../src/translation/provider";

describe("sanitizeTranslationOutput", () => {
  it("returns clean translation text", () => {
    expect(sanitizeTranslationOutput("  I'll join after dinner.  ")).toBe(
      "I'll join after dinner.",
    );
  });

  it("strips wrapping quotes", () => {
    expect(sanitizeTranslationOutput('"Does anyone want to play tonight?"')).toBe(
      "Does anyone want to play tonight?",
    );
  });

  it("rejects empty output", () => {
    expect(() => sanitizeTranslationOutput("   ")).toThrow(TranslationError);
  });

  it("rejects obvious prompt commentary", () => {
    expect(() =>
      sanitizeTranslationOutput("Translation: Does anyone want to play?"),
    ).toThrow(/commentary/i);
    expect(() =>
      sanitizeTranslationOutput("Sure, here is the English translation."),
    ).toThrow(/commentary/i);
  });
});
