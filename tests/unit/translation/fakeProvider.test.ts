import { describe, expect, it } from "vitest";
import { FakeTranslationProvider } from "../../../src/translation/fakeProvider";
import { TranslationError } from "../../../src/translation/provider";

describe("FakeTranslationProvider", () => {
  it("returns registered translations after sanitizing", async () => {
    const provider = new FakeTranslationProvider({
      "zh|en|今晚有人想一起玩吗？": "Does anyone want to play together tonight?",
    });

    const result = await provider.translate({
      text: "今晚有人想一起玩吗？",
      sourceLanguage: "zh",
      targetLanguage: "en",
    });

    expect(result.text).toBe("Does anyone want to play together tonight?");
    expect(result.model).toBe("fake");
  });

  it("rejects commentary even from the fake provider", async () => {
    const provider = new FakeTranslationProvider({
      "en|zh|hi": "Translation: 你好",
    });

    await expect(
      provider.translate({
        text: "hi",
        sourceLanguage: "en",
        targetLanguage: "zh",
      }),
    ).rejects.toBeInstanceOf(TranslationError);
  });
});
