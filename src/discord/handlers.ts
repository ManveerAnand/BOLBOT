import { Events, type Client, type Interaction } from "discord.js";
import type { DiscordEnv } from "../config/env.js";
import type { AppDatabase } from "../database/db.js";
import type { HealthService } from "../observability/health.js";
import type { AppLogger } from "../observability/logger.js";
import type { InMemoryMetrics } from "../observability/metrics.js";
import { handleLanguageCommand } from "./commands/language.js";
import { handleTranslatorCommand } from "./commands/translator.js";
import { handleGuildCreate } from "./events/guildCreate.js";
import { handleLanguageButton } from "./events/languageButton.js";
import { handleMessageCreate } from "./events/messageCreate.js";
import { handleMessageDelete } from "./events/messageDelete.js";
import { handleMessageUpdate } from "./events/messageUpdate.js";
import { attachReadyHandler } from "./events/ready.js";
import type { MessageCreatePipeline } from "../messages/createPipeline.js";

export interface BotContext {
  env: DiscordEnv;
  logger: AppLogger;
  db: AppDatabase;
  health: HealthService;
  metrics: InMemoryMetrics;
  startedAt: number;
  webhookKey: Buffer;
  pipeline: MessageCreatePipeline;
}

export function attachDiscordHandlers(
  client: Client,
  context: BotContext,
): void {
  attachReadyHandler(client, context.logger, context.env);

  client.on(Events.Error, (error) => {
    context.logger.error({
      event: "discord_client_error",
      errorCode: error.name,
    });
  });

  client.on(Events.GuildCreate, (guild) => {
    void handleGuildCreate(guild, context);
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessageCreate(
      message,
      context.logger,
      context.metrics,
      context.pipeline,
    );
  });

  client.on(Events.MessageUpdate, (_oldMessage, message) => {
    void handleMessageUpdate(message, context.logger, context.pipeline);
  });

  client.on(Events.MessageDelete, (message) => {
    handleMessageDelete(message, context.logger, context.pipeline);
  });

  client.on(Events.MessageBulkDelete, (messages) => {
    for (const message of messages.values()) {
      handleMessageDelete(message, context.logger, context.pipeline);
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction, context);
  });
}

async function handleInteraction(
  interaction: Interaction,
  context: BotContext,
): Promise<void> {
  try {
    if (interaction.isButton()) {
      await handleLanguageButton(interaction, context);
      return;
    }
    if (!interaction.isChatInputCommand()) {
      return;
    }
    if (
      interaction.commandName !== "translator" &&
      interaction.commandName !== "language"
    ) {
      return;
    }
    if (interaction.commandName === "language") {
      await handleLanguageCommand(interaction, context);
      return;
    }
    await handleTranslatorCommand(interaction, context);
  } catch (error) {
    const command = interaction.isChatInputCommand()
      ? interaction.commandName
      : interaction.isButton()
        ? interaction.customId
        : "unknown";
    context.logger.error({
      event: "command_failed",
      command,
      errorCode: error instanceof Error ? error.name : "unknown",
    });
    if (
      !interaction.isRepliable() ||
      (!interaction.isChatInputCommand() && !interaction.isButton())
    ) {
      return;
    }
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "Command failed.",
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: "Command failed.",
        ephemeral: true,
      });
    } catch {
      context.logger.error({
        event: "command_error_reply_failed",
        command,
      });
    }
  }
}
