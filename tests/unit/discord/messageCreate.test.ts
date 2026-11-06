import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { handleMessageCreate } from "../../../src/discord/events/messageCreate";
import { InMemoryMetrics } from "../../../src/observability/metrics";

describe("handleMessageCreate", () => {
  it("logs ids and character count, never message text", () => {
    const events: Array<Record<string, unknown>> = [];
    const logger = {
      info(payload: Record<string, unknown>) {
        events.push(payload);
      },
    };
    const metrics = new InMemoryMetrics();

    handleMessageCreate(
      {
        author: { bot: false, id: "u1" },
        webhookId: null,
        guildId: "g1",
        channelId: "c1",
        id: "m1",
        content: "secret chat text that must not be logged",
      } as Message,
      logger as never,
      metrics,
    );

    expect(metrics.messagesSeenTotal).toBe(1);
    expect(events[0]).toMatchObject({
      event: "message_create",
      guildId: "g1",
      sourceMessageId: "m1",
      hasContent: true,
      inputCharacterCount: "secret chat text that must not be logged".length,
    });
    expect(JSON.stringify(events[0])).not.toContain("secret chat");
  });

  it("ignores bot and webhook messages", () => {
    const metrics = new InMemoryMetrics();
    handleMessageCreate(
      {
        author: { bot: true, id: "bot" },
        webhookId: null,
        guildId: "g1",
        channelId: "c1",
        id: "m2",
        content: "ignore me",
      } as Message,
      { info() {} } as never,
      metrics,
    );
    expect(metrics.messagesSeenTotal).toBe(0);
  });

  it("ignores webhook copies", () => {
    const metrics = new InMemoryMetrics();
    handleMessageCreate(
      {
        author: { bot: false, id: "u1" },
        webhookId: "wh1",
        guildId: "g1",
        channelId: "c1",
        id: "m3",
        content: "translated copy",
      } as Message,
      { info() {} } as never,
      metrics,
    );
    expect(metrics.messagesSeenTotal).toBe(0);
  });
});
