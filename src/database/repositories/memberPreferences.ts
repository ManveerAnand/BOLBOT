import type { AppDatabase } from "../db.js";
import { nowIso } from "../time.js";
import type { MemberPreference } from "../types.js";

interface MemberPreferenceRow {
  guild_id: string;
  user_id: string;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export class MemberPreferenceRepository {
  constructor(private readonly db: AppDatabase) {}

  get(guildId: string, userId: string): MemberPreference | undefined {
    const row = this.db.sqlite
      .prepare(
        "SELECT * FROM member_preferences WHERE guild_id = ? AND user_id = ?",
      )
      .get(guildId, userId) as MemberPreferenceRow | undefined;
    return row ? mapMemberPreference(row) : undefined;
  }

  set(input: {
    guildId: string;
    userId: string;
    preferredLanguage: string;
  }): MemberPreference {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO member_preferences (
          guild_id, user_id, preferred_language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET
          preferred_language = excluded.preferred_language,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.guildId,
        input.userId,
        input.preferredLanguage,
        timestamp,
        timestamp,
      );
    return this.get(input.guildId, input.userId)!;
  }
}

function mapMemberPreference(row: MemberPreferenceRow): MemberPreference {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    preferredLanguage: row.preferred_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
