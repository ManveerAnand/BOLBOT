export interface SourceAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string | null;
}

export interface SourceSticker {
  id: string;
  name: string;
  url: string | null;
  format: StickerImageFormat;
}

export interface SourceMediaEmbed {
  url: string | null;
  imageUrl: string | null;
}

export type StickerImageFormat = "png" | "apng" | "gif" | "lottie" | "unknown";

export interface IncomingMessage {
  id: string;
  guildId: string | null;
  channelId: string;
  authorId: string;
  content: string;
  webhookId: string | null;
  authorBot: boolean;
  system: boolean;
  displayName: string;
  avatarUrl: string;
  attachments: SourceAttachment[];
  stickers: SourceSticker[];
  embeds: SourceMediaEmbed[];
}

export interface FetchedSourceMessage {
  content: string;
  displayName: string;
  avatarUrl: string;
  guildId: string | null;
  referencedMessageId: string | null;
  attachments: SourceAttachment[];
  stickers: SourceSticker[];
  embeds: SourceMediaEmbed[];
}

export interface MessageSource {
  fetch(
    channelId: string,
    messageId: string,
  ): Promise<FetchedSourceMessage | null>;
}

export interface WebhookFile {
  name: string;
  data: Buffer;
  contentType?: string;
}

export interface WebhookPostRequest {
  webhookId: string;
  token: string;
  content: string;
  username: string;
  avatarUrl: string;
  files?: WebhookFile[];
  stickerImageUrls?: string[];
}

export interface WebhookEditRequest {
  webhookId: string;
  token: string;
  messageId: string;
  content: string;
  files?: WebhookFile[];
  stickerImageUrls?: string[];
}

export interface WebhookDeleteRequest {
  webhookId: string;
  token: string;
  messageId: string;
}

export interface WebhookPoster {
  send(request: WebhookPostRequest): Promise<{ id: string }>;
  edit(request: WebhookEditRequest): Promise<void>;
  delete(request: WebhookDeleteRequest): Promise<void>;
}
