import type { AppDatabase } from "../db.js";
import { nowIso } from "../time.js";
import type { GuildWelcome } from "../types.js";

interface GuildWelcomeRow {
  guild_id: string;
  channel_id: string;
  message_id: string;
  created_at: string;
  updated_at: string;
}

export class GuildWelcomeRepository {
  constructor(private readonly db: AppDatabase) {}

  get(guildId: string): GuildWelcome | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM guild_welcome WHERE guild_id = ?")
      .get(guildId) as GuildWelcomeRow | undefined;
    return row ? mapGuildWelcome(row) : undefined;
  }

  upsert(input: {
    guildId: string;
    channelId: string;
    messageId: string;
  }): GuildWelcome {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO guild_welcome (
          guild_id, channel_id, message_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          channel_id = excluded.channel_id,
          message_id = excluded.message_id,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.guildId,
        input.channelId,
        input.messageId,
        timestamp,
        timestamp,
      );
    return this.get(input.guildId)!;
  }
}

function mapGuildWelcome(row: GuildWelcomeRow): GuildWelcome {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
