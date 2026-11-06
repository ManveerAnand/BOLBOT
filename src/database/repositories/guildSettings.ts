import type { AppDatabase } from "../db.js";
import { boolFromSql, nowIso, sqlFromBool } from "../time.js";
import type { GuildSettings } from "../types.js";

interface GuildSettingsRow {
  guild_id: string;
  default_language: string;
  translation_enabled: number;
  max_enabled_languages: number;
  created_at: string;
  updated_at: string;
}

export class GuildSettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  get(guildId: string): GuildSettings | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM guild_settings WHERE guild_id = ?")
      .get(guildId) as GuildSettingsRow | undefined;
    return row ? mapGuildSettings(row) : undefined;
  }

  upsert(input: {
    guildId: string;
    defaultLanguage: string;
    translationEnabled: boolean;
    maxEnabledLanguages: number;
  }): GuildSettings {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO guild_settings (
          guild_id, default_language, translation_enabled, max_enabled_languages, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          default_language = excluded.default_language,
          translation_enabled = excluded.translation_enabled,
          max_enabled_languages = excluded.max_enabled_languages,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.guildId,
        input.defaultLanguage,
        sqlFromBool(input.translationEnabled),
        input.maxEnabledLanguages,
        timestamp,
        timestamp,
      );
    return this.get(input.guildId)!;
  }
}

function mapGuildSettings(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    defaultLanguage: row.default_language,
    translationEnabled: boolFromSql(row.translation_enabled),
    maxEnabledLanguages: row.max_enabled_languages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
