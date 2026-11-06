import { loadEnv } from "../src/config/env.js";
import { AppDatabase } from "../src/database/db.js";
import { defaultMigrationsDir } from "../src/database/migrate.js";
import { createLogger } from "../src/observability/logger.js";

const env = loadEnv();
const logger = createLogger(env);
const db = new AppDatabase(env.DATABASE_PATH);

try {
  const applied = db.migrate(defaultMigrationsDir());
  logger.info(
    { event: "db_migrate", appliedCount: applied.length },
    "database migrated",
  );
} finally {
  db.close();
}
