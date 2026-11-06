import type { Message } from "discord.js";
import type {
  IncomingMessage,
  SourceAttachment,
  SourceMediaEmbed,
  SourceSticker,
} from "../../messages/ports.js";
import { toSourceEmbed } from "../../messages/linkPassthrough.js";
import { mapStickerFormat } from "../../messages/media.js";

export function incomingFromDiscord(message: Message): IncomingMessage {
  return {
    id: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    authorId: message.author.id,
    content: message.content,
    webhookId: message.webhookId ?? null,
    authorBot: message.author.bot,
    system: message.system,
    displayName: discordDisplayName(message),
    avatarUrl: message.author.displayAvatarURL({ size: 128 }),
    attachments: mapAttachments(message),
    stickers: mapStickers(message),
    embeds: mapEmbeds(message),
  };
}

export function discordDisplayName(message: Message): string {
  const member = message.member ?? message.guild?.members.cache.get(message.author.id);
  return (
    member?.displayName ??
    message.author.globalName ??
    message.author.displayName ??
    message.author.username
  );
}

function mapAttachments(message: Message): SourceAttachment[] {
  if (!message.attachments) {
    return [];
  }
  return [...message.attachments.values()].map((item) => ({
    id: item.id,
    name: item.name,
    url: item.url,
    size: item.size,
    contentType: item.contentType ?? null,
  }));
}

function mapStickers(message: Message): SourceSticker[] {
  if (!message.stickers) {
    return [];
  }
  return [...message.stickers.values()].map((item) => ({
    id: item.id,
    name: item.name,
    url: item.url,
    format: mapStickerFormat(item.format),
  }));
}

function mapEmbeds(message: Message): SourceMediaEmbed[] {
  if (!message.embeds?.length) {
    return [];
  }
  return message.embeds.flatMap((embed) => {
    const mapped = toSourceEmbed({
      url: embed.url,
      imageUrl: embed.image?.url ?? null,
      thumbnailUrl: embed.thumbnail?.url ?? null,
    });
    return mapped ? [mapped] : [];
  });
}
