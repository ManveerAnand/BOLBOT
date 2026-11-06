export interface GuildSettings {
  guildId: string;
  defaultLanguage: string;
  translationEnabled: boolean;
  maxEnabledLanguages: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuildWelcome {
  guildId: string;
  channelId: string;
  messageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberPreference {
  guildId: string;
  userId: string;
  preferredLanguage: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnabledLanguage {
  guildId: string;
  languageCode: string;
  roleId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LogicalRoomStatus = "active" | "provisioning" | "provisioning_failed";

export interface LogicalRoom {
  id: string;
  guildId: string;
  slug: string;
  displayName: string;
  enabled: boolean;
  status: LogicalRoomStatus;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomView {
  id: string;
  roomId: string;
  languageCode: string;
  channelId: string;
  webhookId: string | null;
  webhookTokenCiphertext: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LogicalMessage {
  id: string;
  roomId: string;
  sourceMessageId: string;
  sourceChannelId: string;
  sourceViewId: string;
  authorUserId: string;
  detectedSourceLanguage: string | null;
  detectionConfidence: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MessageCopy {
  logicalMessageId: string;
  viewId: string;
  languageCode: string;
  discordMessageId: string;
  channelId: string;
  isOriginal: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageCopyPart {
  logicalMessageId: string;
  viewId: string;
  partIndex: number;
  discordMessageId: string;
  channelId: string;
  revision: number;
}

export type PendingJobStatus =
  | "queued"
  | "running"
  | "failed"
  | "done"
  | "cancelled";

export interface PendingTranslationJob {
  id: string;
  logicalMessageId: string;
  targetViewId: string;
  revision: number;
  attempts: number;
  nextAttemptAt: string;
  status: PendingJobStatus;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}
