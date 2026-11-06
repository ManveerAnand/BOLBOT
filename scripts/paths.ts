import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function projectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function migrationsDir(): string {
  return join(projectRoot(), "migrations");
}
