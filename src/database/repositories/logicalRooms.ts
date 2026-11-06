import type { AppDatabase } from "../db.js";
import { boolFromSql, nowIso, sqlFromBool } from "../time.js";
import type { LogicalRoom, LogicalRoomStatus } from "../types.js";

interface LogicalRoomRow {
  id: string;
  guild_id: string;
  slug: string;
  display_name: string;
  enabled: number;
  status: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export class LogicalRoomRepository {
  constructor(private readonly db: AppDatabase) {}

  get(id: string): LogicalRoom | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM logical_rooms WHERE id = ?")
      .get(id) as LogicalRoomRow | undefined;
    return row ? mapLogicalRoom(row) : undefined;
  }

  getBySlug(guildId: string, slug: string): LogicalRoom | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM logical_rooms WHERE guild_id = ? AND slug = ?")
      .get(guildId, slug) as LogicalRoomRow | undefined;
    return row ? mapLogicalRoom(row) : undefined;
  }

  list(guildId: string): LogicalRoom[] {
    const rows = this.db.sqlite
      .prepare(
        "SELECT * FROM logical_rooms WHERE guild_id = ? ORDER BY slug",
      )
      .all(guildId) as LogicalRoomRow[];
    return rows.map(mapLogicalRoom);
  }

  create(input: {
    id: string;
    guildId: string;
    slug: string;
    displayName: string;
    enabled?: boolean;
    status?: LogicalRoomStatus;
    categoryId?: string | null;
  }): LogicalRoom {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO logical_rooms (
          id, guild_id, slug, display_name, enabled, status, category_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.guildId,
        input.slug,
        input.displayName,
        sqlFromBool(input.enabled ?? true),
        input.status ?? "provisioning",
        input.categoryId ?? null,
        timestamp,
        timestamp,
      );
    return this.get(input.id)!;
  }

  update(
    id: string,
    patch: {
      status?: LogicalRoomStatus;
      categoryId?: string | null;
      enabled?: boolean;
    },
  ): LogicalRoom {
    const current = this.get(id);
    if (!current) {
      throw new Error(`Unknown logical room ${id}`);
    }
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `UPDATE logical_rooms SET
          status = ?,
          category_id = ?,
          enabled = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.status ?? current.status,
        patch.categoryId === undefined ? current.categoryId : patch.categoryId,
        sqlFromBool(patch.enabled ?? current.enabled),
        timestamp,
        id,
      );
    return this.get(id)!;
  }
}

function mapLogicalRoom(row: LogicalRoomRow): LogicalRoom {
  return {
    id: row.id,
    guildId: row.guild_id,
    slug: row.slug,
    displayName: row.display_name,
    enabled: boolFromSql(row.enabled),
    status: parseRoomStatus(row.status),
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseRoomStatus(value: string | null): LogicalRoomStatus {
  if (
    value === "active" ||
    value === "provisioning" ||
    value === "provisioning_failed"
  ) {
    return value;
  }
  return "active";
}
