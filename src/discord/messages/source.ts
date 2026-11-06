import type { Client } from "discord.js";
import type {
  FetchedSourceMessage,
  MessageSource,
} from "../../messages/ports.js";
import { incomingFromDiscord } from "./presentation.js";

export class DiscordMessageSource implements MessageSource {
  constructor(private readonly client: Client) {}

  async fetch(
    channelId: string,
    messageId: string,
  ): Promise<FetchedSourceMessage | null> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      return null;
    }
    try {
      const message = await channel.messages.fetch(messageId);
      const incoming = incomingFromDiscord(message);
      return {
        content: incoming.content,
        displayName: incoming.displayName,
        avatarUrl: incoming.avatarUrl,
        guildId: incoming.guildId,
        referencedMessageId: message.reference?.messageId ?? null,
        attachments: incoming.attachments,
        stickers: incoming.stickers,
        embeds: incoming.embeds,
      };
    } catch {
      return null;
    }
  }
}
