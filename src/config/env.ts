import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  TRANSLATION_BASE_URL: z
    .string()
    .url()
    .default("http://127.0.0.1:8000/v1"),
  TRANSLATION_MODEL: z
    .string()
    .min(1)
    .default("translategemma-4b-it-4bit"),
  TRANSLATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  TRANSLATION_CONCURRENCY: z.coerce.number().int().positive().default(2),
  TRANSLATION_QUEUE_LIMIT: z.coerce.number().int().positive().default(100),
  ATTACHMENT_MIRROR_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(8_388_608),
  DATABASE_PATH: z.string().min(1).default("./data/translator.sqlite"),
  DEFAULT_LANGUAGE: z.string().min(2).default("en"),
  MAX_ENABLED_LANGUAGES: z.coerce.number().int().positive().default(8),
  LANGUAGE_DETECT_MIN_CHARS: z.coerce.number().int().positive().default(8),
  LANGUAGE_DETECT_HIGH_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.75),
  LANGUAGE_DETECT_MEDIUM_CONFIDENCE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.45),
  DISCORD_BOT_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  DISCORD_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  DISCORD_GUILD_ID: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  WEBHOOK_ENCRYPTION_KEY: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type AppEnv = z.infer<typeof envSchema>;

function assertLocalTranslationUrl(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `TRANSLATION_BASE_URL must bind to localhost, received ${parsed.hostname}`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("TRANSLATION_BASE_URL must be http or https");
  }
}

export function loadEnv(
  overrides: Record<string, string | undefined> = process.env,
): AppEnv {
  const parsed = envSchema.safeParse(overrides);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }

  assertLocalTranslationUrl(parsed.data.TRANSLATION_BASE_URL);
  return parsed.data;
}

export type DiscordEnv = AppEnv & {
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID: string;
};

export function requireDiscordEnv(env: AppEnv): DiscordEnv {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CLIENT_ID || !env.DISCORD_GUILD_ID) {
    throw new Error(
      "Missing Discord credentials. Set DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID.",
    );
  }
  return env as DiscordEnv;
}

export function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === ":memory:") {
    return;
  }
  mkdirSync(dirname(databasePath), { recursive: true });
}
