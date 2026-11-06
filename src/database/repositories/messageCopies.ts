import type { AppDatabase } from "../db.js";
import { boolFromSql, nowIso, sqlFromBool } from "../time.js";
import type { MessageCopy, MessageCopyPart } from "../types.js";

interface MessageCopyRow {
  logical_message_id: string;
  view_id: string;
  language_code: string;
  discord_message_id: string;
  channel_id: string;
  is_original: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface MessageCopyPartRow {
  logical_message_id: string;
  view_id: string;
  part_index: number;
  discord_message_id: string;
  channel_id: string;
  revision: number;
}

export class MessageCopyRepository {
  constructor(private readonly db: AppDatabase) {}

  get(
    logicalMessageId: string,
    viewId: string,
  ): MessageCopy | undefined {
    const row = this.db.sqlite
      .prepare(
        "SELECT * FROM message_copies WHERE logical_message_id = ? AND view_id = ?",
      )
      .get(logicalMessageId, viewId) as MessageCopyRow | undefined;
    return row ? mapMessageCopy(row) : undefined;
  }

  getByDiscordMessageId(discordMessageId: string): MessageCopy | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM message_copies WHERE discord_message_id = ?")
      .get(discordMessageId) as MessageCopyRow | undefined;
    return row ? mapMessageCopy(row) : undefined;
  }

  listByLogicalMessage(logicalMessageId: string): MessageCopy[] {
    const rows = this.db.sqlite
      .prepare(
        `SELECT * FROM message_copies
         WHERE logical_message_id = ?
         ORDER BY language_code`,
      )
      .all(logicalMessageId) as MessageCopyRow[];
    return rows.map(mapMessageCopy);
  }

  listPartsByLogicalMessage(logicalMessageId: string): MessageCopyPart[] {
    const rows = this.db.sqlite
      .prepare(
        `SELECT * FROM message_copy_parts
         WHERE logical_message_id = ?
         ORDER BY view_id, part_index`,
      )
      .all(logicalMessageId) as MessageCopyPartRow[];
    return rows.map((row) => ({
      logicalMessageId: row.logical_message_id,
      viewId: row.view_id,
      partIndex: row.part_index,
      discordMessageId: row.discord_message_id,
      channelId: row.channel_id,
      revision: row.revision,
    }));
  }

  upsert(input: {
    logicalMessageId: string;
    viewId: string;
    languageCode: string;
    discordMessageId: string;
    channelId: string;
    isOriginal: boolean;
    revision: number;
  }): MessageCopy {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO message_copies (
          logical_message_id, view_id, language_code, discord_message_id,
          channel_id, is_original, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(logical_message_id, view_id) DO UPDATE SET
          language_code = excluded.language_code,
          discord_message_id = excluded.discord_message_id,
          channel_id = excluded.channel_id,
          is_original = excluded.is_original,
          revision = excluded.revision,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.logicalMessageId,
        input.viewId,
        input.languageCode,
        input.discordMessageId,
        input.channelId,
        sqlFromBool(input.isOriginal),
        input.revision,
        timestamp,
        timestamp,
      );
    return this.get(input.logicalMessageId, input.viewId)!;
  }

  addPart(input: MessageCopyPart): MessageCopyPart {
    this.db.sqlite
      .prepare(
        `INSERT INTO message_copy_parts (
          logical_message_id, view_id, part_index, discord_message_id, channel_id, revision
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.logicalMessageId,
        input.viewId,
        input.partIndex,
        input.discordMessageId,
        input.channelId,
        input.revision,
      );
    return input;
  }

  listParts(logicalMessageId: string, viewId: string): MessageCopyPart[] {
    const rows = this.db.sqlite
      .prepare(
        `SELECT * FROM message_copy_parts
         WHERE logical_message_id = ? AND view_id = ?
         ORDER BY part_index`,
      )
      .all(logicalMessageId, viewId) as MessageCopyPartRow[];
    return rows.map((row) => ({
      logicalMessageId: row.logical_message_id,
      viewId: row.view_id,
      partIndex: row.part_index,
      discordMessageId: row.discord_message_id,
      channelId: row.channel_id,
      revision: row.revision,
    }));
  }
}

function mapMessageCopy(row: MessageCopyRow): MessageCopy {
  return {
    logicalMessageId: row.logical_message_id,
    viewId: row.view_id,
    languageCode: row.language_code,
    discordMessageId: row.discord_message_id,
    channelId: row.channel_id,
    isOriginal: boolFromSql(row.is_original),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
