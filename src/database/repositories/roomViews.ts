import type { AppDatabase } from "../db.js";
import { boolFromSql, nowIso, sqlFromBool } from "../time.js";
import type { RoomView } from "../types.js";

interface RoomViewRow {
  id: string;
  room_id: string;
  language_code: string;
  channel_id: string;
  webhook_id: string | null;
  webhook_token_ciphertext: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export class RoomViewRepository {
  constructor(private readonly db: AppDatabase) {}

  get(id: string): RoomView | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM room_views WHERE id = ?")
      .get(id) as RoomViewRow | undefined;
    return row ? mapRoomView(row) : undefined;
  }

  getByChannelId(channelId: string): RoomView | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM room_views WHERE channel_id = ?")
      .get(channelId) as RoomViewRow | undefined;
    return row ? mapRoomView(row) : undefined;
  }

  listByRoom(roomId: string): RoomView[] {
    const rows = this.db.sqlite
      .prepare(
        "SELECT * FROM room_views WHERE room_id = ? ORDER BY language_code",
      )
      .all(roomId) as RoomViewRow[];
    return rows.map(mapRoomView);
  }

  getByRoomLanguage(
    roomId: string,
    languageCode: string,
  ): RoomView | undefined {
    const row = this.db.sqlite
      .prepare(
        "SELECT * FROM room_views WHERE room_id = ? AND language_code = ?",
      )
      .get(roomId, languageCode) as RoomViewRow | undefined;
    return row ? mapRoomView(row) : undefined;
  }

  create(input: {
    id: string;
    roomId: string;
    languageCode: string;
    channelId: string;
    webhookId?: string | null;
    webhookTokenCiphertext?: string | null;
    enabled?: boolean;
  }): RoomView {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO room_views (
          id, room_id, language_code, channel_id, webhook_id, webhook_token_ciphertext, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.roomId,
        input.languageCode,
        input.channelId,
        input.webhookId ?? null,
        input.webhookTokenCiphertext ?? null,
        sqlFromBool(input.enabled ?? true),
        timestamp,
        timestamp,
      );
    return this.get(input.id)!;
  }

  update(
    id: string,
    patch: {
      channelId?: string;
      webhookId?: string | null;
      webhookTokenCiphertext?: string | null;
      enabled?: boolean;
    },
  ): RoomView {
    const current = this.get(id);
    if (!current) {
      throw new Error(`Unknown room view ${id}`);
    }
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `UPDATE room_views SET
          channel_id = ?,
          webhook_id = ?,
          webhook_token_ciphertext = ?,
          enabled = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.channelId ?? current.channelId,
        patch.webhookId === undefined ? current.webhookId : patch.webhookId,
        patch.webhookTokenCiphertext === undefined
          ? current.webhookTokenCiphertext
          : patch.webhookTokenCiphertext,
        sqlFromBool(patch.enabled ?? current.enabled),
        timestamp,
        id,
      );
    return this.get(id)!;
  }
}

function mapRoomView(row: RoomViewRow): RoomView {
  return {
    id: row.id,
    roomId: row.room_id,
    languageCode: row.language_code,
    channelId: row.channel_id,
    webhookId: row.webhook_id,
    webhookTokenCiphertext: row.webhook_token_ciphertext,
    enabled: boolFromSql(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
