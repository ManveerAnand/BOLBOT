import pino, { type DestinationStream, type Logger } from "pino";
import type { AppEnv } from "../config/env.js";

const REDACT_PATHS = [
  "botToken",
  "webhookToken",
  "token",
  "authorization",
  "webhook_token_ciphertext",
  "webhookTokenCiphertext",
  "text",
  "content",
  "sourceText",
  "translatedText",
  "prompt",
];

export function createLogger(
  env: Pick<AppEnv, "LOG_LEVEL">,
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level: env.LOG_LEVEL,
      redact: {
        paths: REDACT_PATHS,
        remove: true,
      },
      base: null,
    },
    destination,
  );
}

export type AppLogger = Logger;
