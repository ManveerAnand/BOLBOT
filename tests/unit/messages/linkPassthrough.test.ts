import { describe, expect, it } from "vitest";
import {
  animatedTenorUrl,
  appendMissingUrls,
  embedFanOut,
  hasTranslatableText,
  toSourceEmbed,
} from "../../../src/messages/linkPassthrough";

describe("link passthrough", () => {
  it("treats gif picker links as non-text", () => {
    expect(hasTranslatableText("https://tenor.com/view/cat-gif-12345")).toBe(
      false,
    );
    expect(hasTranslatableText("hello https://tenor.com/view/cat-gif-12345")).toBe(
      true,
    );
  });

  it("appends missing gif unfurl URLs", () => {
    expect(appendMissingUrls("", ["https://tenor.com/view/cat-gif-12345"])).toBe(
      "https://tenor.com/view/cat-gif-12345",
    );
    expect(
      appendMissingUrls("https://tenor.com/view/cat-gif-12345", [
        "https://tenor.com/view/cat-gif-12345",
      ]),
    ).toBe("https://tenor.com/view/cat-gif-12345");
  });

  it("prefers tenor share links over thumbnail images", () => {
    const embed = toSourceEmbed({
      url: "https://tenor.com/view/cat-gif-12345",
      imageUrl: null,
      thumbnailUrl: "https://media.tenor.com/abcAAAAD/cat.png",
    });
    expect(embed).toEqual({
      url: "https://tenor.com/view/cat-gif-12345",
      imageUrl: "https://media.tenor.com/abcAAAAD/cat.gif",
    });
    expect(embedFanOut([embed!])).toEqual({
      unfurlUrls: ["https://tenor.com/view/cat-gif-12345"],
      imageUrls: [],
    });
  });

  it("converts tenor png previews to gif URLs", () => {
    expect(
      animatedTenorUrl("https://media.tenor.com/abcAAAAD/cat.png"),
    ).toBe("https://media.tenor.com/abcAAAAD/cat.gif");
  });
});
