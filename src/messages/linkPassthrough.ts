import type { SourceMediaEmbed } from "./ports.js";

const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

export function hasTranslatableText(content: string): boolean {
  return stripUrls(content).length > 0;
}

export function stripUrls(content: string): string {
  return content.replace(URL_PATTERN, " ").replace(/\s+/g, " ").trim();
}

export function extractUrls(content: string): string[] {
  return content.match(URL_PATTERN) ?? [];
}

export function appendMissingUrls(
  content: string,
  urls: readonly string[],
): string {
  const missing = urls.filter((url) => !content.includes(url));
  return [content, ...missing]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

export function toSourceEmbed(input: {
  url: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}): SourceMediaEmbed | null {
  const url = input.url && isGifShareUrl(input.url) ? input.url : null;
  const imageUrl =
    pickGifImageUrl(input.imageUrl) ??
    animatedTenorUrl(input.thumbnailUrl) ??
    pickGifImageUrl(input.thumbnailUrl);
  if (!url && !imageUrl) {
    return null;
  }
  return { url, imageUrl };
}

export function embedFanOut(embeds: readonly SourceMediaEmbed[]): {
  unfurlUrls: string[];
  imageUrls: string[];
} {
  const unfurlUrls: string[] = [];
  const imageUrls: string[] = [];
  for (const embed of embeds) {
    if (embed.url && isGifShareUrl(embed.url)) {
      unfurlUrls.push(embed.url);
      continue;
    }
    if (embed.imageUrl) {
      imageUrls.push(embed.imageUrl);
    }
  }
  return { unfurlUrls, imageUrls };
}

export function isGifShareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "gph.is" || host.endsWith(".gph.is")) {
      return true;
    }
    if (isTenorHost(host)) {
      return true;
    }
    if (host === "giphy.com" || host.endsWith(".giphy.com")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function animatedTenorUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (!isTenorHost(parsed.hostname)) {
      return null;
    }
    if (parsed.pathname.toLowerCase().endsWith(".gif")) {
      return parsed.toString();
    }
    if (parsed.pathname.toLowerCase().endsWith(".png")) {
      parsed.pathname = parsed.pathname.replace(/\.png$/i, ".gif");
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function pickGifImageUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".gif") ? url : null;
  } catch {
    return null;
  }
}

function isTenorHost(host: string): boolean {
  const value = host.toLowerCase();
  return (
    value === "tenor.com" ||
    value.endsWith(".tenor.com") ||
    value === "tenor.co" ||
    value.endsWith(".tenor.co")
  );
}
