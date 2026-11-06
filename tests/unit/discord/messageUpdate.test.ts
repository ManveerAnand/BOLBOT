import type { Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { handleMessageUpdate } from "../../../src/discord/events/messageUpdate";
import { InMemoryMetrics } from "../../../src/observability/metrics";

describe("handleMessageUpdate", () => {
  it("fetches partials and forwards edits without logging message text", async () => {
    const events: Array<Record<string, unknown>> = [];
    const handleEdit = vi.fn(async () => undefined);
    const full = {
      partial: false,
      author: {
        bot: false,
        id: "u1",
        displayName: "Chen",
        displayAvatarURL: () => "https://example.com/a.png",
      },
      member: { displayName: "Chen" },
      webhookId: null,
      system: false,
      guildId: "g1",
      channelId: "c1",
      id: "m1",
      content: "secret edited text",
    };

    await handleMessageUpdate(
      {
        partial: true,
        async fetch() {
          return full;
        },
      } as Message,
      {
        info(payload: Record<string, unknown>) {
          events.push(payload);
        },
        error() {},
      } as never,
      { handleEdit } as never,
    );

    expect(handleEdit).toHaveBeenCalledOnce();
    expect(events[0]).toMatchObject({
      event: "message_update",
      sourceMessageId: "m1",
      inputCharacterCount: "secret edited text".length,
    });
    expect(JSON.stringify(events[0])).not.toContain("secret edited");
  });

  it("ignores webhook copy edits", async () => {
    const handleEdit = vi.fn(async () => undefined);
    await handleMessageUpdate(
      {
        partial: false,
        author: { bot: false, id: "u1" },
        webhookId: "wh-en",
        system: false,
        guildId: "g1",
        channelId: "c1",
        id: "m1",
        content: "translated copy",
      } as Message,
      { info() {}, error() {} } as never,
      { handleEdit } as never,
    );
    expect(handleEdit).not.toHaveBeenCalled();
  });
});
