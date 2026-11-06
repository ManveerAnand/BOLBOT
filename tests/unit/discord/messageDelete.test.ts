import type { Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { handleMessageDelete } from "../../../src/discord/events/messageDelete";

describe("handleMessageDelete", () => {
  it("forwards the message id without logging content", () => {
    const events: Array<Record<string, unknown>> = [];
    const handleDelete = vi.fn(async () => undefined);

    handleMessageDelete(
      {
        id: "m1",
        guildId: "g1",
        channelId: "c1",
        content: "secret deleted text",
      } as Message,
      {
        info(payload: Record<string, unknown>) {
          events.push(payload);
        },
        error() {},
      } as never,
      { handleDelete } as never,
    );

    expect(handleDelete).toHaveBeenCalledWith({ id: "m1" });
    expect(events[0]).toMatchObject({
      event: "message_delete",
      sourceMessageId: "m1",
    });
    expect(JSON.stringify(events[0])).not.toContain("secret deleted");
  });
});
