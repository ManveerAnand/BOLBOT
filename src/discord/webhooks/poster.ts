import { AttachmentBuilder, WebhookClient } from "discord.js";
import type {
  WebhookDeleteRequest,
  WebhookEditRequest,
  WebhookFile,
  WebhookPoster,
  WebhookPostRequest,
} from "../../messages/ports.js";

export class DiscordWebhookPoster implements WebhookPoster {
  async send(request: WebhookPostRequest): Promise<{ id: string }> {
    const client = new WebhookClient({
      id: request.webhookId,
      token: request.token,
    });
    try {
      const sent = await client.send({
        username: request.username,
        allowedMentions: { parse: [] },
        files: webhookFiles(request.files),
        ...stickerEmbeds(request.stickerImageUrls),
        ...(request.content ? { content: request.content } : {}),
        ...(request.avatarUrl ? { avatarURL: request.avatarUrl } : {}),
      });
      return { id: sent.id };
    } catch (error) {
      throw Object.assign(new Error("webhook_send_failed"), {
        name: "WebhookSendFailed",
        cause: error,
      });
    } finally {
      client.destroy();
    }
  }

  async edit(request: WebhookEditRequest): Promise<void> {
    const client = new WebhookClient({
      id: request.webhookId,
      token: request.token,
    });
    try {
      await client.editMessage(request.messageId, {
        allowedMentions: { parse: [] },
        files: webhookFiles(request.files),
        ...stickerEmbeds(request.stickerImageUrls),
        ...(request.content ? { content: request.content } : {}),
      });
    } catch (error) {
      throw Object.assign(new Error("webhook_edit_failed"), {
        name: "WebhookEditFailed",
        cause: error,
      });
    } finally {
      client.destroy();
    }
  }

  async delete(request: WebhookDeleteRequest): Promise<void> {
    const client = new WebhookClient({
      id: request.webhookId,
      token: request.token,
    });
    try {
      await client.deleteMessage(request.messageId);
    } catch (error) {
      throw Object.assign(new Error("webhook_delete_failed"), {
        name: "WebhookDeleteFailed",
        cause: error,
      });
    } finally {
      client.destroy();
    }
  }
}

function webhookFiles(files: WebhookFile[] | undefined): AttachmentBuilder[] {
  if (!files?.length) {
    return [];
  }
  return files.map(
    (file) => new AttachmentBuilder(file.data, { name: file.name }),
  );
}

function stickerEmbeds(urls: string[] | undefined): { embeds: Array<{ image: { url: string } }> } | Record<string, never> {
  if (!urls?.length) {
    return {};
  }
  return {
    embeds: urls.map((url) => ({ image: { url } })),
  };
}
