export function formatReplyMarker(input: {
  displayName: string;
  guildId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
}): string {
  const name = sanitizeDisplayName(input.displayName);
  if (input.guildId && input.channelId && input.messageId) {
    const url = `https://discord.com/channels/${input.guildId}/${input.channelId}/${input.messageId}`;
    return `↪ [Replying to ${name}](${url})`;
  }
  return `↪ Replying to ${name}`;
}

export function withReplyMarker(
  content: string,
  marker: string | null,
): string {
  return marker ? `${marker}\n${content}` : content;
}

function sanitizeDisplayName(displayName: string): string {
  const trimmed = displayName.replaceAll(/\s+/g, " ").trim();
  const safe = trimmed.replaceAll(/[[\]]/g, "");
  return safe || "a message";
}
