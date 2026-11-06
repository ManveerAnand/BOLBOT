import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, requireDiscordEnv } from "./config/env.js";
import { AppDatabase } from "./database/db.js";
import { defaultMigrationsDir } from "./database/migrate.js";
import { createDiscordClient } from "./discord/client.js";
import { registerGuildCommands } from "./discord/commands/register.js";
import { attachDiscordHandlers } from "./discord/handlers.js";
import { DiscordMessageSource } from "./discord/messages/source.js";
import { DiscordWebhookPoster } from "./discord/webhooks/poster.js";
import { FastTextWasmLanguageDetector } from "./language/fastTextDetector.js";
import { SourceLanguageResolver } from "./language/sourceLanguageResolver.js";
import { MessageCreatePipeline } from "./messages/createPipeline.js";
import { createLogger } from "./observability/logger.js";
import { HealthService } from "./observability/health.js";
import { InMemoryMetrics } from "./observability/metrics.js";
import { loadOrCreateWebhookKey } from "./security/webhookKey.js";
import { OmlxTranslateGemmaProvider } from "./translation/omlxProvider.js";
import { BoundedAsyncQueue } from "./translation/queue.js";

export async function startBot(): Promise<void> {
  const env = requireDiscordEnv(loadEnv());
  const logger = createLogger(env);
  const db = new AppDatabase(env.DATABASE_PATH);
  db.migrate(defaultMigrationsDir());

  const translation = new OmlxTranslateGemmaProvider(env);
  const detector = new FastTextWasmLanguageDetector();
  const health = new HealthService({
    database: {
      check: async () => db.check(),
    },
    translation: {
      check: () => translation.healthCheck(),
    },
    languageDetector: {
      check: () => detector.healthCheck(),
    },
  });
  const metrics = new InMemoryMetrics();
  const webhookKey = loadOrCreateWebhookKey(env);
  const client = createDiscordClient();
  const pipeline = new MessageCreatePipeline({
    db,
    env,
    logger,
    metrics,
    resolver: new SourceLanguageResolver(detector, env),
    translation,
    source: new DiscordMessageSource(client),
    webhooks: new DiscordWebhookPoster(),
    webhookKey,
    queue: new BoundedAsyncQueue(
      env.TRANSLATION_CONCURRENCY,
      env.TRANSLATION_QUEUE_LIMIT,
    ),
  });

  attachDiscordHandlers(client, {
    env,
    logger,
    db,
    health,
    metrics,
    startedAt: Date.now(),
    webhookKey,
    pipeline,
  });

  const shutdown = async (signal: string) => {
    logger.info({ event: "shutdown", signal });
    pipeline.stop();
    client.destroy();
    db.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await registerGuildCommands(env);
  logger.info({ event: "commands_registered", guildId: env.DISCORD_GUILD_ID });
  await client.login(env.DISCORD_BOT_TOKEN);
  pipeline.start();
  logger.info({ event: "translation_pipeline_started" });
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  startBot().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Bot failed to start";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
