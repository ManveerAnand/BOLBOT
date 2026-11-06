import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppEnv } from "../../config/env.js";
import type { AppDatabase } from "../../database/db.js";
import { EnabledLanguageRepository } from "../../database/repositories/enabledLanguages.js";
import { LogicalRoomRepository } from "../../database/repositories/logicalRooms.js";
import { MemberPreferenceRepository } from "../../database/repositories/memberPreferences.js";
import {
  formatLanguageList,
  formatLanguageShow,
} from "../../language/preference.js";
import { SUPPORTED_LANGUAGES } from "../../language/registry.js";
import type { AppLogger } from "../../observability/logger.js";
import {
  applyMemberLanguageChoice,
  LanguagePreferenceError,
} from "../languageChoice.js";

export function languageCommand() {
  return new SlashCommandBuilder()
    .setName("language")
    .setDescription("Set or view your translator language")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set your preferred language")
        .addStringOption((option) =>
          option
            .setName("language")
            .setDescription("Language you want to read and write")
            .setRequired(true)
            .addChoices(
              ...SUPPORTED_LANGUAGES.map((language) => ({
                name: language.displayName,
                value: language.internalCode,
              })),
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("show").setDescription("Show your preferred language"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List languages the translator supports"),
    );
}

export async function handleLanguageCommand(
  interaction: ChatInputCommandInteraction,
  deps: {
    env: AppEnv;
    db: AppDatabase;
    logger: AppLogger;
    webhookKey: Buffer;
  },
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "Use this command in the server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (subcommand === "list") {
    const enabled = new EnabledLanguageRepository(deps.db);
    const preferences = new MemberPreferenceRepository(deps.db);
    await interaction.reply({
      content: formatLanguageList({
        enabledCodes: new Set(
          enabled.listEnabled(guildId).map((row) => row.languageCode),
        ),
        preferredLanguage: preferences.get(guildId, userId)?.preferredLanguage,
      }),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "show") {
    const preferences = new MemberPreferenceRepository(deps.db);
    await interaction.reply({
      content: formatLanguageShow(
        preferences.get(guildId, userId)?.preferredLanguage,
      ),
      ephemeral: true,
    });
    return;
  }

  if (subcommand !== "set") {
    await interaction.reply({
      content: "Unknown language command.",
      ephemeral: true,
    });
    return;
  }

  const languageInput = interaction.options.getString("language", true);
  const hasRooms =
    new LogicalRoomRepository(deps.db).list(guildId).length > 0;
  if (hasRooms) {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    const lines = await applyMemberLanguageChoice({
      db: deps.db,
      env: deps.env,
      logger: deps.logger,
      webhookKey: deps.webhookKey,
      guild: interaction.guild,
      member: interaction.member,
      languageInput,
    });

    if (hasRooms) {
      await interaction.editReply(lines.join("\n"));
      return;
    }
    await interaction.reply({
      content: lines.join("\n"),
      ephemeral: true,
    });
  } catch (error) {
    if (error instanceof LanguagePreferenceError) {
      if (hasRooms) {
        await interaction.editReply(error.message);
        return;
      }
      await interaction.reply({
        content: error.message,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}
