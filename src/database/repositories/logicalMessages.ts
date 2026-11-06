import type { AppDatabase } from "../db.js";
import { nowIso } from "../time.js";
import type { LogicalMessage } from "../types.js";

interface LogicalMessageRow {
  id: string;
  room_id: string;
  source_message_id: string;
  source_channel_id: string;
  source_view_id: string;
  author_user_id: string;
  detected_source_language: string | null;
  detection_confidence: number | null;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class LogicalMessageRepository {
  constructor(private readonly db: AppDatabase) {}

  get(id: string): LogicalMessage | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM logical_messages WHERE id = ?")
      .get(id) as LogicalMessageRow | undefined;
    return row ? mapLogicalMessage(row) : undefined;
  }

  getBySourceMessageId(sourceMessageId: string): LogicalMessage | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM logical_messages WHERE source_message_id = ?")
      .get(sourceMessageId) as LogicalMessageRow | undefined;
    return row ? mapLogicalMessage(row) : undefined;
  }

  create(input: {
    id: string;
    roomId: string;
    sourceMessageId: string;
    sourceChannelId: string;
    sourceViewId: string;
    authorUserId: string;
    detectedSourceLanguage?: string | null;
    detectionConfidence?: number | null;
  }): LogicalMessage {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO logical_messages (
          id, room_id, source_message_id, source_channel_id, source_view_id,
          author_user_id, detected_source_language, detection_confidence, revision,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      )
      .run(
        input.id,
        input.roomId,
        input.sourceMessageId,
        input.sourceChannelId,
        input.sourceViewId,
        input.authorUserId,
        input.detectedSourceLanguage ?? null,
        input.detectionConfidence ?? null,
        timestamp,
        timestamp,
      );
    return this.get(input.id)!;
  }

  bumpRevision(id: string): LogicalMessage {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `UPDATE logical_messages
         SET revision = revision + 1, updated_at = ?
         WHERE id = ?`,
      )
      .run(timestamp, id);
    return this.get(id)!;
  }

  updateDetection(
    id: string,
    language: string,
    confidence: number,
  ): LogicalMessage {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `UPDATE logical_messages
         SET detected_source_language = ?, detection_confidence = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(language, confidence, timestamp, id);
    return this.get(id)!;
  }

  markDeleted(id: string): LogicalMessage {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `UPDATE logical_messages
         SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(timestamp, timestamp, id);
    return this.get(id)!;
  }
}

function mapLogicalMessage(row: LogicalMessageRow): LogicalMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    sourceMessageId: row.source_message_id,
    sourceChannelId: row.source_channel_id,
    sourceViewId: row.source_view_id,
    authorUserId: row.author_user_id,
    detectedSourceLanguage: row.detected_source_language,
    detectionConfidence: row.detection_confidence,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
