import { describe, expect, it } from "vitest";
import { FORBIDDEN_CONTENT_COLUMNS } from "../../../src/config/constants";
import { openTestDatabase } from "./testDb";

describe("migrations", () => {
  it("initializes the schema without message-content columns", () => {
    const db = openTestDatabase();
    const tables = db.sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as Array<{ name: string }>;

    const names = tables.map((table) => table.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "guild_settings",
        "member_preferences",
        "enabled_languages",
        "logical_rooms",
        "room_views",
        "logical_messages",
        "message_copies",
        "pending_translation_jobs",
        "message_copy_parts",
        "schema_migrations",
      ]),
    );

    const forbidden = new Set<string>(FORBIDDEN_CONTENT_COLUMNS);
    for (const table of tables) {
      const columns = db.sqlite
        .prepare(`PRAGMA table_info("${table.name}")`)
        .all() as Array<{ name: string }>;
      for (const column of columns) {
        expect(forbidden.has(column.name.toLowerCase())).toBe(false);
      }
    }

    db.close();
  });
});
