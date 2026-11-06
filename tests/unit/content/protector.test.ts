import { describe, expect, it } from "vitest";
import {
  protectDiscordMarkup,
  remapChannelMentions,
  restoreProtected,
} from "../../../src/content/protector";

describe("content protector", () => {
  it("round-trips mentions, code, and URLs", () => {
    const original =
      "Hey <@1234>, join <#5555> and run `npm install`. Docs: https://example.com";
    const protectedContent = protectDiscordMarkup(original);
    expect(protectedContent.text).not.toContain("<@1234>");
    expect(protectedContent.text).not.toContain("https://example.com");
    expect(restoreProtected(protectedContent.text, protectedContent.tokens)).toBe(
      original,
    );
  });

  it("rejects missing sentinels", () => {
    const protectedContent = protectDiscordMarkup("see https://example.com");
    expect(() => restoreProtected("nope", protectedContent.tokens)).toThrow(
      /sentinel_mismatch/,
    );
  });

  it("remaps managed channel mentions", () => {
    expect(
      remapChannelMentions("meet me in <#100>", (id) =>
        id === "100" ? "200" : undefined,
      ),
    ).toBe("meet me in <#200>");
  });
});
