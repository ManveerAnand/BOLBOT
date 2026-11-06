import { TRANSLATION_CACHE_MAX_ENTRIES } from "../config/constants.js";

export class TranslationCache {
  private readonly entries = new Map<string, string>();

  constructor(private readonly maxEntries = TRANSLATION_CACHE_MAX_ENTRIES) {}

  get(
    sourceLanguage: string,
    targetLanguage: string,
    text: string,
  ): string | undefined {
    const key = cacheKey(sourceLanguage, targetLanguage, text);
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(
    sourceLanguage: string,
    targetLanguage: string,
    text: string,
    translated: string,
  ): void {
    const key = cacheKey(sourceLanguage, targetLanguage, text);
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, translated);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

function cacheKey(
  sourceLanguage: string,
  targetLanguage: string,
  text: string,
): string {
  return `${sourceLanguage}\0${targetLanguage}\0${text}`;
}
