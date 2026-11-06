import type { Guild, GuildMember } from "discord.js";
import type { AppEnv } from "../config/env.js";
import type { AppDatabase } from "../database/db.js";
import { LogicalRoomRepository } from "../database/repositories/logicalRooms.js";
import {
  LanguagePreferenceError,
  setMemberLanguagePreference,
} from "../language/preference.js";
import type { AppLogger } from "../observability/logger.js";
import { provisionLanguageViews } from "../rooms/provisionService.js";
import { DiscordGuildProvisionPort } from "./provisioning/discordGuildPort.js";
import { DiscordGuildMemberRolePort } from "./roles/discordRolePort.js";

export async function applyMemberLanguageChoice(input: {
  db: AppDatabase;
  env: AppEnv;
  logger: AppLogger;
  webhookKey: Buffer;
  guild: Guild;
  member: GuildMember;
  languageInput: string;
}): Promise<string[]> {
  const result = await setMemberLanguagePreference({
    db: input.db,
    roles: new DiscordGuildMemberRolePort(input.member),
    guildId: input.guild.id,
    userId: input.member.id,
    languageInput: input.languageInput,
    maxEnabledLanguages: input.env.MAX_ENABLED_LANGUAGES,
  });

  const lines = [
    `You're in the ${result.language.displayName} group now. You should see that language's channels.`,
  ];
  if (result.roleSyncFailed) {
    input.logger.warn({
      event: "translator_role_sync_failed",
      guildId: input.guild.id,
      userId: input.member.id,
      languageCode: result.language.internalCode,
    });
    lines.push(
      "I saved that, but could not assign the role. An admin should move the bot role above the Translator roles, then try again.",
    );
  }

  const hasRooms =
    new LogicalRoomRepository(input.db).list(input.guild.id).length > 0;
  if (!hasRooms) {
    return lines;
  }

  try {
    const reports = await provisionLanguageViews({
      db: input.db,
      guild: new DiscordGuildProvisionPort(input.guild),
      webhookKey: input.webhookKey,
      languageCode: result.language.internalCode,
    });
    const created = reports.reduce(
      (sum, report) => sum + report.createdViews,
      0,
    );
    if (created > 0) {
      lines.push(`Created or repaired ${created} language channel view(s).`);
    }
  } catch {
    input.logger.warn({
      event: "language_view_provision_failed",
      guildId: input.guild.id,
      languageCode: result.language.internalCode,
    });
    lines.push(
      "Language saved. An admin can run /translator reconcile to create missing channels.",
    );
  }

  return lines;
}

export { LanguagePreferenceError };
