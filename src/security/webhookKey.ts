import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { AppEnv } from "../config/env.js";

export function parseWebhookKey(value: string): Buffer {
  const hex = value.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "WEBHOOK_ENCRYPTION_KEY must be 64 hex characters (32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

export function loadOrCreateWebhookKey(env: AppEnv): Buffer {
  if (env.WEBHOOK_ENCRYPTION_KEY) {
    return parseWebhookKey(env.WEBHOOK_ENCRYPTION_KEY);
  }
  if (env.DATABASE_PATH === ":memory:") {
    return randomBytes(32);
  }

  const directory = dirname(env.DATABASE_PATH);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "webhook.key");
  if (existsSync(path)) {
    return parseWebhookKey(readFileSync(path, "utf8"));
  }

  const key = randomBytes(32);
  writeFileSync(path, `${key.toString("hex")}\n`, { mode: 0o600 });
  return key;
}
