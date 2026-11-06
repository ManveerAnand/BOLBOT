import { describe, expect, it } from "vitest";
import { detectScript } from "../../../src/language/scriptHeuristics";

describe("detectScript", () => {
  it("identifies Chinese Han text", () => {
    expect(detectScript("今晚开吗")).toMatchObject({
      family: "han",
      suggestedLanguage: "zh",
      strong: true,
    });
  });

  it("identifies Japanese when kana is present", () => {
    expect(detectScript("今夜一緒に遊ぶ人いる？")).toMatchObject({
      family: "japanese",
      suggestedLanguage: "ja",
      strong: true,
    });
  });

  it("identifies Korean Hangul", () => {
    expect(detectScript("오늘 밤에 같이 게임할 사람 있어요?")).toMatchObject({
      family: "hangul",
      suggestedLanguage: "ko",
    });
  });

  it("does not treat short latin slang as a strong script", () => {
    expect(detectScript("gg")).toMatchObject({
      family: "latin",
      strong: false,
    });
  });
});
