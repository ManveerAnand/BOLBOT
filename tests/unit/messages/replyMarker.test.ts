import { describe, expect, it } from "vitest";
import {
  formatReplyMarker,
  withReplyMarker,
} from "../../../src/messages/replyMarker";

describe("formatReplyMarker", () => {
  it("builds a jump link when guild, channel, and message ids are present", () => {
    expect(
      formatReplyMarker({
        displayName: "Chen",
        guildId: "g1",
        channelId: "c-en",
        messageId: "m1",
      }),
    ).toBe("↪ [Replying to Chen](https://discord.com/channels/g1/c-en/m1)");
  });

  it("falls back to a plain marker without a jump link", () => {
    expect(formatReplyMarker({ displayName: "Chen" })).toBe(
      "↪ Replying to Chen",
    );
  });
});

describe("withReplyMarker", () => {
  it("prefixes content when a marker exists", () => {
    expect(withReplyMarker("hello", "↪ Replying to Chen")).toBe(
      "↪ Replying to Chen\nhello",
    );
    expect(withReplyMarker("hello", null)).toBe("hello");
  });
});
