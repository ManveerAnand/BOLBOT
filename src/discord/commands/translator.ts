import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { DiscordEnv } from "../../config/env.js";
import type { AppDatabase } from "../../database/db.js";
import { EnabledLanguageRepository } from "../../database/repositories/enabledLanguages.js";
import { LogicalRoomRepository } from "../../database/repositories/logicalRooms.js";
import { RoomViewRepository } from "../../database/repositories/roomViews.js";
import { LanguagePreferenceError } from "../../language/preference.js";
import { SUPPORTED_LANGUAGES } from "../../language/registry.js";
import type { HealthService } from "../../observability/health.js";
import type { AppLogger } from "../../observability/logger.js";
import type { InMemoryMetrics } from "../../observability/metrics.js";
import {
  createLogicalRoom,
  disableTranslatorLanguage,
  enableTranslatorLanguage,
  formatProvisionReport,
  formatRoomList,
  reconcileGuildRooms,
  RoomProvisionError,
} from "../../rooms/provisionService.js";
import { publishWelcomeMessage } from "../onboarding/publishWelcome.js";
import { languagesForWelcome } from "../onboarding/welcome.js";
import { DiscordGuildProvisionPort } from "../provisioning/discordGuildPort.js";
import { DiscordGuildMemberRolePort } from "../roles/discordRolePort.js";
import { formatStatusMessage } from "./status.js";

export function translatorCommand() {
  const languageChoices = SUPPORTED_LANGUAGES.map((language) => ({
    name: language.displayName,
    value: language.internalCode,
  }));

  return new SlashCommandBuilder()
    .setName("translator")
    .setDescription("Translator administration")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Show translator health"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("room-create")
        .setDescription("Create a logical room and language channels")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Room name, for example general")
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(32),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("room-list").setDescription("List translator rooms"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("language-enable")
        .setDescription("Enable a language and create its channels")
        .addStringOption((option) =>
          option
            .setName("language")
            .setDescription("Language to enable")
            .setRequired(true)
            .addChoices(...languageChoices),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("language-disable")
        .setDescription("Disable a language without deleting channels")
        .addStringOption((option) =>
          option
            .setName("language")
            .setDescription("Language to disable")
            .setRequired(true)
            .addChoices(...languageChoices),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reconcile")
        .setDescription("Repair missing translator roles, channels, and webhooks"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("welcome")
        .setDescription("Post join instructions so members can pick a language"),
    );
}

export async function handleTranslatorCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    env: DiscordEnv;
    db: AppDatabase;
    health: HealthService;
    metrics: InMemoryMetrics;
    startedAt: number;
    logger: AppLogger;
    webhookKey: Buffer;
  },
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "status") {
    await replyStatus(interaction, deps);
    return;
  }

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "Use this command in the server.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "room-list") {
    const rooms = new LogicalRoomRepository(deps.db).list(interaction.guildId);
    const views = new RoomViewRepository(deps.db);
    await interaction.reply({
      content: formatRoomList({
        rooms,
        viewsByRoom: new Map(
          rooms.map((room) => [room.id, views.listByRoom(room.id)]),
        ),
      }),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "language-disable") {
    try {
      const language = disableTranslatorLanguage({
        db: deps.db,
        guildId: interaction.guildId,
        languageInput: interaction.options.getString("language", true),
      });
      await interaction.reply({
        content: `${language.displayName} is disabled. Existing channels were left in place.`,
        ephemeral: true,
      });
    } catch (error) {
      await replyProvisionError(interaction, error);
    }
    return;
  }

  if (subcommand === "welcome") {
    const channel = interaction.channel;
    if (
      !channel ||
      !channel.isTextBased() ||
      channel.isDMBased() ||
      channel.isThread() ||
      new RoomViewRepository(deps.db).getByChannelId(channel.id)
    ) {
      await interaction.reply({
        content:
          "Post join instructions in a shared channel everyone can see, not a language room channel.",
        ephemeral: true,
      });
      return;
    }

    try {
      await publishWelcomeMessage({
        db: deps.db,
        channel,
        languages: languagesForWelcome(deps.db, interaction.guildId),
      });
      await interaction.reply({
        content:
          "Posted a new join-instructions message here. Members can click a language button to join that group.",
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content:
          "I could not post in this channel. Check that I can send messages here.",
        ephemeral: true,
      });
    }
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = new DiscordGuildProvisionPort(interaction.guild);
    if (subcommand === "room-create") {
      const report = await createLogicalRoom({
        db: deps.db,
        guild,
        webhookKey: deps.webhookKey,
        name: interaction.options.getString("name", true),
      });
      await interaction.editReply(formatProvisionReport(report));
      return;
    }

    if (subcommand === "language-enable") {
      const result = await enableTranslatorLanguage({
        db: deps.db,
        roles: new DiscordGuildMemberRolePort(interaction.member),
        guild,
        webhookKey: deps.webhookKey,
        languageInput: interaction.options.getString("language", true),
        maxEnabledLanguages: deps.env.MAX_ENABLED_LANGUAGES,
      });
      const created = result.reports.reduce(
        (sum, report) => sum + report.createdViews,
        0,
      );
      await interaction.editReply(
        `${result.language.displayName} is enabled. Channel views created or repaired: ${created}.`,
      );
      return;
    }

    if (subcommand === "reconcile") {
      const reports = await reconcileGuildRooms({
        db: deps.db,
        guild,
        webhookKey: deps.webhookKey,
      });
      if (reports.length === 0) {
        await interaction.editReply(
          "No translator rooms to reconcile. Create one with /translator room-create.",
        );
        return;
      }
      await interaction.editReply(
        reports.map((report) => formatProvisionReport(report)).join("\n\n"),
      );
      return;
    }

    await interaction.editReply("That translator command is not implemented yet.");
  } catch (error) {
    deps.logger.warn({
      event: "translator_admin_failed",
      command: subcommand,
      errorCode: error instanceof Error ? error.name : "unknown",
    });
    const message =
      error instanceof RoomProvisionError ||
      error instanceof LanguagePreferenceError
        ? error.message
        : "Command failed. Check that the bot can manage channels, roles, and webhooks.";
    await interaction.editReply(message);
  }
}

async function replyStatus(
  interaction: ChatInputCommandInteraction,
  deps: {
    env: DiscordEnv;
    db: AppDatabase;
    health: HealthService;
    metrics: InMemoryMetrics;
    startedAt: number;
  },
): Promise<void> {
  const guildId = interaction.guildId ?? deps.env.DISCORD_GUILD_ID;
  const rooms = new LogicalRoomRepository(deps.db);
  const languages = new EnabledLanguageRepository(deps.db);
  const health = await deps.health.snapshot();
  await interaction.reply({
    content: formatStatusMessage({
      translatorOnline: true,
      modelName: deps.env.TRANSLATION_MODEL,
      health,
      roomCount: rooms.list(guildId).length,
      enabledLanguageCount: languages.listEnabled(guildId).length,
      metrics: deps.metrics,
      uptimeSeconds: (Date.now() - deps.startedAt) / 1000,
    }),
    ephemeral: true,
  });
}

async function replyProvisionError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const content =
    error instanceof RoomProvisionError ||
    error instanceof LanguagePreferenceError
      ? error.message
      : "Command failed.";
  await interaction.reply({ content, ephemeral: true });
}
