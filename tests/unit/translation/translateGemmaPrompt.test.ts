import { describe, expect, it } from "vitest";
import { renderTranslateGemmaPrompt } from "../../../src/translation/translateGemmaPrompt";
import { TranslationError } from "../../../src/translation/provider";

describe("renderTranslateGemmaPrompt", () => {
  it("renders the official TranslateGemma instruction with source and target codes", () => {
    const prompt = renderTranslateGemmaPrompt({
      text: "今晚有人想一起玩吗？",
      sourceLanguage: "zh",
      targetLanguage: "en",
    });

    expect(prompt.startsWith("<bos><start_of_turn>user\n")).toBe(true);
    expect(prompt).toContain(
      "You are a professional Chinese (zh) to English (en) translator.",
    );
    expect(prompt).toContain("今晚有人想一起玩吗？");
    expect(prompt.endsWith("<end_of_turn>\n<start_of_turn>model\n")).toBe(
      true,
    );
    expect(prompt).not.toMatch(/Translation:/);
  });

  it("normalizes underscored region codes", () => {
    const prompt = renderTranslateGemmaPrompt({
      text: "hello",
      sourceLanguage: "en_US",
      targetLanguage: "zh_Hans",
    });

    expect(prompt).toContain("English (en-US)");
    expect(prompt).toContain("Chinese (zh-Hans)");
  });

  it("rejects unsupported language codes", () => {
    expect(() =>
      renderTranslateGemmaPrompt({
        text: "hello",
        sourceLanguage: "xx",
        targetLanguage: "en",
      }),
    ).toThrow(TranslationError);
  });

  it("rejects empty text", () => {
    expect(() =>
      renderTranslateGemmaPrompt({
        text: "   ",
        sourceLanguage: "en",
        targetLanguage: "zh",
      }),
    ).toThrow(/empty/i);
  });
});
