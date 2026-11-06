import type { Message, PartialMessage } from "discord.js";
import type { AppLogger } from "../../observability/logger.js";
import type { MessageCreatePipeline } from "../../messages/createPipeline.js";
import { incomingFromDiscord } from "./messageCreate.js";

export async function handleMessageUpdate(
  message: Message | PartialMessage,
  logger: AppLogger,
  pipeline?: MessageCreatePipeline,
): Promise<void> {
  let full: Message;
  try {
    full = message.partial ? await message.fetch() : message;
  } catch {
    return;
  }

  if (full.author.bot || full.webhookId || full.system) {
    return;
  }

  if (!pipeline) {
    return;
  }

  logger.info({
    event: "message_update",
    guildId: full.guildId,
    sourceChannelId: full.channelId,
    sourceMessageId: full.id,
    authorUserId: full.author.id,
    inputCharacterCount: full.content.length,
  });

  void pipeline.handleEdit(incomingFromDiscord(full)).catch((error: unknown) => {
    logger.error({
      event: "pipeline_edit_failed",
      sourceMessageId: full.id,
      errorCode: error instanceof Error ? error.name : "unknown",
    });
  });
}
