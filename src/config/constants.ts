export const TRANSLATION_STOP_SEQUENCES = ["<end_of_turn>", "<eos>"] as const;

export const GEMMA_BOS = "<bos>";
export const GEMMA_START_USER = "<start_of_turn>user";
export const GEMMA_START_MODEL = "<start_of_turn>model";
export const GEMMA_END_TURN = "<end_of_turn>";

/** Abort large installs if the volume would drop below this. */
export const MIN_FREE_DISK_BYTES = 15 * 1024 * 1024 * 1024;

export const COMMENTARY_PATTERNS: readonly RegExp[] = [
  /^\s*translation\s*:/i,
  /^\s*translated\s*(text|output)?\s*:/i,
  /^\s*here(?:'s| is)\b/i,
  /^\s*sure[,.]?\s/i,
  /^\s*as an ai\b/i,
  /you are a professional .+ translator/i,
  /without any additional explanations/i,
];

export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
export const MIN_OUTPUT_TOKENS = 32;
export const MAX_OUTPUT_TOKENS = 1024;

export const FORBIDDEN_CONTENT_COLUMNS = [
  "content",
  "body",
  "text",
  "message",
  "message_text",
  "source_text",
  "translated_text",
  "translation",
] as const;

export const TRANSLATOR_ROLE_PREFIX = "Translator · ";
export const UNHEALTHY_CHECK_INTERVAL_MS = 15_000;

export const TRANSLATION_MAX_ATTEMPTS = 3;
export const TRANSLATION_CACHE_MAX_ENTRIES = 256;
export const LANGUAGE_SET_CUSTOM_ID_PREFIX = "lang:set:";
export const BOT_JOIN_WELCOME_WINDOW_MS = 120_000;
