import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { FORBIDDEN_CONTENT_COLUMNS } from "../config/constants.js";
import { nowIso } from "./time.js";

export function defaultMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
}

export function migrate(
  sqlite: Database.Database,
  migrationsDir: string,
): string[] {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    sqlite
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const appliedNow: string[] = [];

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const apply = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(file, nowIso());
    });
    apply();
    appliedNow.push(file);
  }

  assertNoMessageContentColumns(sqlite);
  return appliedNow;
}

export function assertNoMessageContentColumns(sqlite: Database.Database): void {
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as Array<{ name: string }>;

  const forbidden = new Set<string>(FORBIDDEN_CONTENT_COLUMNS);

  for (const table of tables) {
    const columns = sqlite
      .prepare(`PRAGMA table_info(${quoteIdent(table.name)})`)
      .all() as Array<{ name: string }>;

    for (const column of columns) {
      if (forbidden.has(column.name.toLowerCase())) {
        throw new Error(
          `Refusing schema with message-content column ${table.name}.${column.name}`,
        );
      }
    }
  }
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
