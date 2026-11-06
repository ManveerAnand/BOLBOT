import type { Message, PartialMessage } from "discord.js";
import type { AppLogger } from "../../observability/logger.js";
import type { MessageCreatePipeline } from "../../messages/createPipeline.js";

export function handleMessageDelete(
  message: Message | PartialMessage,
  logger: AppLogger,
  pipeline?: MessageCreatePipeline,
): void {
  if (!pipeline) {
    return;
  }

  logger.info({
    event: "message_delete",
    guildId: message.guildId,
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
  });

  void pipeline.handleDelete({ id: message.id }).catch((error: unknown) => {
    logger.error({
      event: "pipeline_delete_failed",
      sourceMessageId: message.id,
      errorCode: error instanceof Error ? error.name : "unknown",
    });
  });
}
