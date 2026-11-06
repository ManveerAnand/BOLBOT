import type { Message } from "discord.js";
import type { AppLogger } from "../../observability/logger.js";
import type { InMemoryMetrics } from "../../observability/metrics.js";
import type { MessageCreatePipeline } from "../../messages/createPipeline.js";
import { incomingFromDiscord } from "../messages/presentation.js";

export { incomingFromDiscord } from "../messages/presentation.js";

export function handleMessageCreate(
  message: Message,
  logger: AppLogger,
  metrics: InMemoryMetrics,
  pipeline?: MessageCreatePipeline,
): void {
  if (message.author.bot || message.webhookId || message.system) {
    return;
  }

  metrics.messagesSeenTotal += 1;
  logger.info({
    event: "message_create",
    guildId: message.guildId,
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
    authorUserId: message.author.id,
    inputCharacterCount: message.content.length,
    hasContent: message.content.length > 0,
    hasAttachments: Boolean(message.attachments?.size),
    hasStickers: Boolean(message.stickers?.size),
    hasEmbeds: Boolean(message.embeds?.length),
  });

  if (!pipeline) {
    return;
  }

  void pipeline.handle(incomingFromDiscord(message)).catch((error: unknown) => {
    logger.error({
      event: "pipeline_failed",
      sourceMessageId: message.id,
      errorCode: error instanceof Error ? error.name : "unknown",
    });
  });
}
