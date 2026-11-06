import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./migrate.js";

export class AppDatabase {
  readonly sqlite: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.sqlite = new Database(path);
    if (path !== ":memory:") {
      this.sqlite.pragma("journal_mode = WAL");
    }
    this.sqlite.pragma("foreign_keys = ON");
  }

  migrate(migrationsDir: string): string[] {
    return migrate(this.sqlite, migrationsDir);
  }

  transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)();
  }

  check(): boolean {
    this.sqlite.prepare("SELECT 1").get();
    return true;
  }

  close(): void {
    this.sqlite.close();
  }
}
