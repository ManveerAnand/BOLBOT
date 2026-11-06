import type { ButtonInteraction } from "discord.js";
import { LANGUAGE_SET_CUSTOM_ID_PREFIX } from "../../config/constants.js";
import type { AppEnv } from "../../config/env.js";
import type { AppDatabase } from "../../database/db.js";
import {
  applyMemberLanguageChoice,
  LanguagePreferenceError,
} from "../languageChoice.js";
import type { AppLogger } from "../../observability/logger.js";
import { parseLanguageSelectCustomId } from "../onboarding/welcome.js";

export async function handleLanguageButton(
  interaction: ButtonInteraction,
  deps: {
    env: AppEnv;
    db: AppDatabase;
    logger: AppLogger;
    webhookKey: Buffer;
  },
): Promise<void> {
  if (!interaction.customId.startsWith(LANGUAGE_SET_CUSTOM_ID_PREFIX)) {
    return;
  }

  const languageCode = parseLanguageSelectCustomId(interaction.customId);
  if (!languageCode) {
    await interaction.reply({
      content: "That language is not supported.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "Use this button in the server.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const lines = await applyMemberLanguageChoice({
      db: deps.db,
      env: deps.env,
      logger: deps.logger,
      webhookKey: deps.webhookKey,
      guild: interaction.guild,
      member: interaction.member,
      languageInput: languageCode,
    });
    await interaction.editReply(lines.join("\n"));
  } catch (error) {
    if (error instanceof LanguagePreferenceError) {
      await interaction.editReply(error.message);
      return;
    }
    throw error;
  }
}
