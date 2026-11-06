import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it } from "vitest";
import { loadEnv, requireDiscordEnv } from "../../../src/config/env";
import {
  handleTranslatorCommand,
  translatorCommand,
} from "../../../src/discord/commands/translator";
import { HealthService } from "../../../src/observability/health";
import { InMemoryMetrics } from "../../../src/observability/metrics";
import { openTestDatabase } from "../database/testDb";

describe("translatorCommand", () => {
  it("registers admin subcommands", () => {
    const json = translatorCommand().toJSON();
    expect(json.name).toBe("translator");
    expect(json.dm_permission).toBe(false);
    expect(json.options?.map((option) => option.name)).toEqual([
      "status",
      "room-create",
      "room-list",
      "language-enable",
      "language-disable",
      "reconcile",
      "welcome",
    ]);
  });
});

describe("handleTranslatorCommand", () => {
  it("replies with ephemeral status and no secrets", async () => {
    const db = openTestDatabase();
    const replies: Array<{ content: string; ephemeral?: boolean }> = [];
    const interaction = {
      options: { getSubcommand: () => "status" },
      guildId: "g1",
      reply: async (payload: { content: string; ephemeral?: boolean }) => {
        replies.push(payload);
      },
    };

    await handleTranslatorCommand(
      interaction as unknown as ChatInputCommandInteraction,
      {
        env: requireDiscordEnv(
          loadEnv({
            DISCORD_BOT_TOKEN: "test-token",
            DISCORD_CLIENT_ID: "test-client",
            DISCORD_GUILD_ID: "g1",
            TRANSLATION_MODEL: "translategemma-4b-it-4bit",
          }),
        ),
        db,
        health: new HealthService({
          database: { check: async () => true },
          translation: { check: async () => true },
          languageDetector: { check: async () => true },
        }),
        metrics: new InMemoryMetrics(),
        startedAt: Date.now() - 90_000,
        logger: { warn() {}, error() {}, info() {} } as never,
        webhookKey: Buffer.alloc(32, 1),
      },
    );

    db.close();
    expect(replies).toHaveLength(1);
    expect(replies[0]?.ephemeral).toBe(true);
    expect(replies[0]?.content).toContain("Translator: Online");
    expect(replies[0]?.content).toContain("Enabled languages: 0");
    expect(replies[0]?.content).not.toContain("test-token");
  });
});
