import type { AppDatabase } from "../db.js";
import { boolFromSql, nowIso, sqlFromBool } from "../time.js";
import type { EnabledLanguage } from "../types.js";

interface EnabledLanguageRow {
  guild_id: string;
  language_code: string;
  role_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export class EnabledLanguageRepository {
  constructor(private readonly db: AppDatabase) {}

  list(guildId: string): EnabledLanguage[] {
    const rows = this.db.sqlite
      .prepare(
        "SELECT * FROM enabled_languages WHERE guild_id = ? ORDER BY language_code",
      )
      .all(guildId) as EnabledLanguageRow[];
    return rows.map(mapEnabledLanguage);
  }

  listEnabled(guildId: string): EnabledLanguage[] {
    return this.list(guildId).filter((language) => language.enabled);
  }

  get(guildId: string, languageCode: string): EnabledLanguage | undefined {
    return this.list(guildId).find(
      (language) => language.languageCode === languageCode,
    );
  }

  upsert(input: {
    guildId: string;
    languageCode: string;
    roleId: string;
    enabled: boolean;
  }): EnabledLanguage {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO enabled_languages (
          guild_id, language_code, role_id, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, language_code) DO UPDATE SET
          role_id = excluded.role_id,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.guildId,
        input.languageCode,
        input.roleId,
        sqlFromBool(input.enabled),
        timestamp,
        timestamp,
      );
    return this.list(input.guildId).find(
      (row) => row.languageCode === input.languageCode,
    )!;
  }
}

function mapEnabledLanguage(row: EnabledLanguageRow): EnabledLanguage {
  return {
    guildId: row.guild_id,
    languageCode: row.language_code,
    roleId: row.role_id,
    enabled: boolFromSql(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
