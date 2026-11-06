const SENTINEL_PREFIX = "⟦D";
const SENTINEL_SUFFIX = "⟧";

export interface ProtectedContent {
  text: string;
  tokens: string[];
}

export function protectDiscordMarkup(text: string): ProtectedContent {
  const tokens: string[] = [];
  const replace = (match: string) => {
    const sentinel = sentinelFor(tokens.length);
    tokens.push(match);
    return sentinel;
  };

  const protectedText = text
    .replace(/```[\s\S]*?```/g, replace)
    .replace(/`[^`\n]+`/g, replace)
    .replace(/https?:\/\/[^\s<]+/gi, replace)
    .replace(/<\/[\w-]+:\d+>/g, replace)
    .replace(/<a?:\w+:\d+>/g, replace)
    .replace(/<@!?\d+>/g, replace)
    .replace(/<@&\d+>/g, replace)
    .replace(/<#\d+>/g, replace)
    .replace(/<t:\d+(?::[tTdDfFR])?>/g, replace);

  return { text: protectedText, tokens };
}

export function restoreProtected(
  text: string,
  tokens: string[],
): string {
  const found = text.match(/⟦D\d+⟧/g) ?? [];
  if (found.length !== tokens.length) {
    throw new Error("sentinel_mismatch");
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const sentinel = sentinelFor(index);
    if (text.split(sentinel).length - 1 !== 1) {
      throw new Error("sentinel_mismatch");
    }
  }

  let restored = text;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    restored = restored.replace(sentinelFor(index), tokens[index]!);
  }
  return restored;
}

export function remapChannelMentions(
  text: string,
  mapId: (channelId: string) => string | undefined,
): string {
  return text.replace(/<#(\d+)>/g, (full, channelId: string) => {
    const mapped = mapId(channelId);
    return mapped ? `<#${mapped}>` : full;
  });
}

function sentinelFor(index: number): string {
  return `${SENTINEL_PREFIX}${index}${SENTINEL_SUFFIX}`;
}
