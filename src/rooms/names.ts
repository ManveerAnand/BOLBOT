import type { SupportedLanguage } from "../language/registry.js";

export function normalizeRoomSlug(input: string): string {
  return input.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

export function isValidRoomSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug);
}

export function roomCategoryName(slug: string): string {
  return `translator-${slug}`;
}

export function viewChannelName(slug: string, languageCode: string): string {
  return `${slug}-${languageCode}`;
}

export function viewChannelTopic(
  roomName: string,
  language: SupportedLanguage,
): string {
  return `Managed translation view for logical room "${roomName}". Language: ${language.displayName} (${language.internalCode}). Do not manually rename/delete without updating the translator.`;
}

export function viewWebhookName(slug: string, languageCode: string): string {
  return `translator-${slug}-${languageCode}`.slice(0, 80);
}
