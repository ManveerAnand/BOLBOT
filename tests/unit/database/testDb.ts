import { AppDatabase } from "../../../src/database/db";
import { migrationsDir } from "../../../scripts/paths";

export function openTestDatabase(): AppDatabase {
  const db = new AppDatabase(":memory:");
  db.migrate(migrationsDir());
  return db;
}
