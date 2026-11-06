import { randomUUID } from "node:crypto";
import {
  TRANSLATION_MAX_ATTEMPTS,
} from "../config/constants.js";
import type { AppEnv } from "../config/env.js";
import type { AppDatabase } from "../database/db.js";
import { LogicalMessageRepository } from "../database/repositories/logicalMessages.js";
import { LogicalRoomRepository } from "../database/repositories/logicalRooms.js";
import { MemberPreferenceRepository } from "../database/repositories/memberPreferences.js";
import { MessageCopyRepository } from "../database/repositories/messageCopies.js";
import { PendingJobRepository } from "../database/repositories/pendingJobs.js";
import { RoomViewRepository } from "../database/repositories/roomViews.js";
import { isoFromNow, nowIso } from "../database/time.js";
import type {
  LogicalMessage,
  PendingTranslationJob,
  RoomView,
} from "../database/types.js";
import { SourceLanguageResolver } from "../language/sourceLanguageResolver.js";
import type { AppLogger } from "../observability/logger.js";
import type { InMemoryMetrics } from "../observability/metrics.js";
import {
  protectDiscordMarkup,
  remapChannelMentions,
  restoreProtected,
} from "../content/protector.js";
import { decryptSecret } from "../security/webhookCrypto.js";
import { TranslationCache } from "../translation/cache.js";
import { TranslationError, type TranslationProvider } from "../translation/provider.js";
import { BoundedAsyncQueue } from "../translation/queue.js";
import { collectMirroredFiles, hasMedia, type MirroredMedia } from "./media.js";
import {
  appendMissingUrls,
  embedFanOut,
  extractUrls,
  hasTranslatableText,
  stripUrls,
} from "./linkPassthrough.js";
import { formatReplyMarker, withReplyMarker } from "./replyMarker.js";
import { needsInference, selectFanOutViews } from "./targets.js";
import { webhookUsername } from "./webhookUsername.js";
import type {
  FetchedSourceMessage,
  IncomingMessage,
  MessageSource,
  WebhookFile,
  WebhookPoster,
} from "./ports.js";

export class MessageCreatePipeline {
  private readonly views: RoomViewRepository;
  private readonly rooms: LogicalRoomRepository;
  private readonly messages: LogicalMessageRepository;
  private readonly copies: MessageCopyRepository;
  private readonly jobs: PendingJobRepository;
  private readonly preferences: MemberPreferenceRepository;
  private readonly cache: TranslationCache;
  private readonly authors = new Map<
    string,
    { displayName: string; avatarUrl: string }
  >();
  private readonly mediaLoads = new Map<string, Promise<MirroredMedia>>();
  private readonly inFlight = new Set<string>();
  private poller: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly deps: {
      db: AppDatabase;
      env: AppEnv;
      logger: AppLogger;
      metrics: InMemoryMetrics;
      resolver: SourceLanguageResolver;
      translation: TranslationProvider;
      source: MessageSource;
      webhooks: WebhookPoster;
      webhookKey: Buffer;
      queue: BoundedAsyncQueue;
      cache?: TranslationCache;
      mediaDownload?: (
        url: string,
        maxBytes: number,
        timeoutMs: number,
      ) => Promise<Buffer>;
    },
  ) {
    this.views = new RoomViewRepository(deps.db);
    this.rooms = new LogicalRoomRepository(deps.db);
    this.messages = new LogicalMessageRepository(deps.db);
    this.copies = new MessageCopyRepository(deps.db);
    this.jobs = new PendingJobRepository(deps.db);
    this.preferences = new MemberPreferenceRepository(deps.db);
    this.cache = deps.cache ?? new TranslationCache();
  }

  start(): void {
    this.jobs.requeueRunning();
    this.scheduleDue();
    this.poller = setInterval(() => {
      this.scheduleDue();
    }, 2_000);
  }

  stop(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = undefined;
    }
  }

  async handle(message: IncomingMessage): Promise<void> {
    if (shouldSkipIncoming(message)) {
      return;
    }
    this.rememberAuthor(message);
    const guildId = message.guildId;
    if (!guildId) {
      return;
    }

    const sourceView = this.views.getByChannelId(message.channelId);
    if (!sourceView?.enabled) {
      return;
    }

    if (this.messages.getBySourceMessageId(message.id)) {
      return;
    }

    const preferred =
      this.preferences.get(guildId, message.authorId)?.preferredLanguage ??
      sourceView.languageCode;
    const detected = await this.deps.resolver.resolve(
      message.content,
      preferred,
    );
    if (detected.source === "preference") {
      this.deps.metrics.languageDetectionFallbackTotal += 1;
    }

    const created = this.deps.db.transaction(() => {
      const logical = this.messages.create({
        id: randomUUID(),
        roomId: sourceView.roomId,
        sourceMessageId: message.id,
        sourceChannelId: message.channelId,
        sourceViewId: sourceView.id,
        authorUserId: message.authorId,
        detectedSourceLanguage: detected.language,
        detectionConfidence: detected.confidence,
      });
      this.copies.upsert({
        logicalMessageId: logical.id,
        viewId: sourceView.id,
        languageCode: sourceView.languageCode,
        discordMessageId: message.id,
        channelId: sourceView.channelId,
        isOriginal: true,
        revision: logical.revision,
      });
      return {
        logical,
        jobs: this.enqueueTargetJobs(logical.id, logical.revision, sourceView),
      };
    });

    this.deps.metrics.logicalMessagesTotal += 1;
    this.deps.logger.info({
      event: "translation_enqueued",
      sourceMessageId: message.id,
      logicalMessageId: created.logical.id,
      targetCount: created.jobs.length,
      revision: created.logical.revision,
    });
    this.queueJobs(created.jobs);
  }

  async handleEdit(message: IncomingMessage): Promise<void> {
    if (shouldSkipIncoming(message)) {
      return;
    }
    this.rememberAuthor(message);
    const guildId = message.guildId;
    if (!guildId) {
      return;
    }

    const sourceView = this.views.getByChannelId(message.channelId);
    if (!sourceView?.enabled) {
      return;
    }

    const existing = this.messages.getBySourceMessageId(message.id);
    if (!existing) {
      await this.handle(message);
      return;
    }
    if (existing.deletedAt) {
      return;
    }

    const preferred =
      this.preferences.get(guildId, message.authorId)?.preferredLanguage ??
      sourceView.languageCode;
    const detected = await this.deps.resolver.resolve(
      message.content,
      preferred,
    );
    if (detected.source === "preference") {
      this.deps.metrics.languageDetectionFallbackTotal += 1;
    }

    const updated = this.deps.db.transaction(() => {
      this.messages.updateDetection(
        existing.id,
        detected.language,
        detected.confidence,
      );
      const logical = this.messages.bumpRevision(existing.id);
      this.copies.upsert({
        logicalMessageId: logical.id,
        viewId: sourceView.id,
        languageCode: sourceView.languageCode,
        discordMessageId: message.id,
        channelId: sourceView.channelId,
        isOriginal: true,
        revision: logical.revision,
      });
      this.jobs.cancelStale(logical.id, logical.revision);
      return {
        logical,
        jobs: this.enqueueTargetJobs(logical.id, logical.revision, sourceView),
      };
    });

    this.deps.logger.info({
      event: "translation_edit_enqueued",
      sourceMessageId: message.id,
      logicalMessageId: updated.logical.id,
      targetCount: updated.jobs.length,
      revision: updated.logical.revision,
    });
    this.queueJobs(updated.jobs);
  }

  async handleDelete(input: { id: string }): Promise<void> {
    const logical = this.messages.getBySourceMessageId(input.id);
    if (!logical || logical.deletedAt) {
      return;
    }

    this.messages.markDeleted(logical.id);
    this.jobs.cancelOpen(logical.id, "source_deleted");
    await this.deleteTranslatedCopies(logical.id);
    this.deps.logger.info({
      event: "source_deleted",
      logicalMessageId: logical.id,
      sourceMessageId: input.id,
    });
  }

  scheduleDue(): void {
    for (const job of this.jobs.listDue(nowIso())) {
      this.enqueueJob(job.id);
    }
    this.syncQueueMetrics();
  }

  private enqueueTargetJobs(
    logicalMessageId: string,
    revision: number,
    sourceView: RoomView,
  ): PendingTranslationJob[] {
    const jobs: PendingTranslationJob[] = [];
    for (const target of selectFanOutViews(
      sourceView,
      this.views.listByRoom(sourceView.roomId),
    )) {
      if (!target.webhookId || !target.webhookTokenCiphertext) {
        continue;
      }
      jobs.push(
        this.jobs.enqueue({
          id: randomUUID(),
          logicalMessageId,
          targetViewId: target.id,
          revision,
        }),
      );
    }
    return jobs;
  }

  private queueJobs(jobs: PendingTranslationJob[]): void {
    for (const job of jobs) {
      this.enqueueJob(job.id);
    }
  }

  private enqueueJob(jobId: string): void {
    if (this.inFlight.has(jobId)) {
      return;
    }
    const job = this.jobs.get(jobId);
    if (!job || job.status === "done" || job.status === "cancelled") {
      return;
    }
    const queued = this.deps.queue.tryEnqueue(async () => {
      try {
        await this.processJob(jobId);
      } finally {
        this.inFlight.delete(jobId);
        this.syncQueueMetrics();
      }
    }, job.logicalMessageId);
    if (queued) {
      this.inFlight.add(jobId);
    }
    this.syncQueueMetrics();
  }

  private async processJob(jobId: string): Promise<void> {
    if (!this.jobs.claim(jobId)) {
      return;
    }
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    try {
      const logical = this.messages.get(job.logicalMessageId);
      const targetView = this.views.get(job.targetViewId);
      if (!logical || !targetView?.webhookId || !targetView.webhookTokenCiphertext) {
        this.jobs.cancel(jobId, "missing_view");
        return;
      }
      if (this.isDiscardable(job, logical)) {
        this.jobs.cancel(jobId, discardReason(logical, job));
        return;
      }

      const source = await this.deps.source.fetch(
        logical.sourceChannelId,
        logical.sourceMessageId,
      );
      if (!source) {
        this.jobs.cancel(jobId, "source_deleted");
        return;
      }

      const latest = this.messages.get(logical.id);
      if (!latest || this.isDiscardable(job, latest)) {
        this.jobs.cancel(jobId, discardReason(latest, job));
        return;
      }

      const sourceLanguage =
        latest.detectedSourceLanguage ??
        this.views.get(latest.sourceViewId)?.languageCode;
      if (!sourceLanguage) {
        this.jobs.cancel(jobId, "missing_source_language");
        return;
      }

      const prepared = await this.prepareContent(
        source,
        sourceLanguage,
        targetView,
        latest,
      );
      const media = await this.mediaFor(latest.id, job.revision, source);
      const embeds = embedFanOut(source.embeds);
      const content = [
        appendMissingUrls(prepared.content, embeds.unfurlUrls),
        ...media.notes,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n");

      const beforePost = this.messages.get(logical.id);
      if (!beforePost || this.isDiscardable(job, beforePost)) {
        this.jobs.cancel(jobId, discardReason(beforePost, job));
        return;
      }

      const token = decryptSecret(
        targetView.webhookTokenCiphertext,
        this.deps.webhookKey,
      );
      const postedId = await this.publishCopy(
        targetView,
        token,
        content,
        source,
        latest,
        media.files,
        [...media.stickerImageUrls, ...embeds.imageUrls],
      );

      this.copies.upsert({
        logicalMessageId: logical.id,
        viewId: targetView.id,
        languageCode: targetView.languageCode,
        discordMessageId: postedId,
        channelId: targetView.channelId,
        isOriginal: false,
        revision: job.revision,
      });
      this.jobs.complete(jobId);
      this.deps.metrics.translationsCompletedTotal += 1;
      this.deps.logger.info({
        event: prepared.copied ? "copy_posted" : "translation_posted",
        logicalMessageId: logical.id,
        targetViewId: targetView.id,
        targetMessageId: postedId,
        cacheHit: prepared.cacheHit,
        ...(prepared.inferenceMs !== undefined
          ? { inferenceMs: prepared.inferenceMs }
          : {}),
      });
    } catch (error) {
      this.deps.metrics.translationsFailedTotal += 1;
      const errorCode =
        error instanceof TranslationError
          ? error.code
          : error instanceof Error
            ? error.name
            : "unknown";
      this.deps.logger.warn({
        event: "translation_failed",
        jobId,
        errorCode,
      });
      const current = this.jobs.get(jobId);
      if (!current || current.attempts + 1 >= TRANSLATION_MAX_ATTEMPTS) {
        this.jobs.cancel(jobId, errorCode);
        return;
      }
      this.jobs.fail(
        jobId,
        errorCode,
        isoFromNow(15_000 * (current.attempts + 1)),
      );
    }
  }

  private async prepareContent(
    source: FetchedSourceMessage,
    sourceLanguage: string,
    targetView: RoomView,
    logical: LogicalMessage,
  ): Promise<{
    content: string;
    copied: boolean;
    cacheHit: boolean;
    inferenceMs?: number;
  }> {
    const room = this.rooms.get(logical.roomId);
    const marker = await this.resolveReplyMarker(
      source,
      targetView,
      source.guildId ?? room?.guildId ?? null,
    );

    if (!hasTranslatableText(source.content)) {
      return {
        content: withReplyMarker(source.content, marker),
        copied: true,
        cacheHit: false,
      };
    }

    if (!needsInference(sourceLanguage, targetView.languageCode)) {
      const remapped = remapChannelMentions(source.content, (channelId) =>
        this.mapChannelMention(channelId, targetView),
      );
      return {
        content: withReplyMarker(remapped, marker),
        copied: true,
        cacheHit: false,
      };
    }

    const urls = extractUrls(source.content);
    const textOnly = stripUrls(source.content);
    const protectedContent = protectDiscordMarkup(textOnly);
    const cached = this.cache.get(
      sourceLanguage,
      targetView.languageCode,
      protectedContent.text,
    );
    let translatedText: string;
    let inferenceMs: number | undefined;
    let cacheHit = false;
    if (cached !== undefined) {
      this.deps.metrics.translationsCacheHitTotal += 1;
      translatedText = cached;
      cacheHit = true;
    } else {
      this.deps.metrics.translationsRequestedTotal += 1;
      const translated = await this.deps.translation.translate({
        text: protectedContent.text,
        sourceLanguage,
        targetLanguage: targetView.languageCode,
      });
      this.cache.set(
        sourceLanguage,
        targetView.languageCode,
        protectedContent.text,
        translated.text,
      );
      translatedText = translated.text;
      inferenceMs = translated.inferenceMs;
    }

    const restored = restoreProtected(translatedText, protectedContent.tokens);
    const remapped = remapChannelMentions(restored, (channelId) =>
      this.mapChannelMention(channelId, targetView),
    );
    return {
      content: withReplyMarker(appendMissingUrls(remapped, urls), marker),
      copied: false,
      cacheHit,
      ...(inferenceMs !== undefined ? { inferenceMs } : {}),
    };
  }

  private async publishCopy(
    targetView: RoomView,
    token: string,
    content: string,
    source: FetchedSourceMessage,
    logical: LogicalMessage,
    files: WebhookFile[],
    stickerImageUrls: string[],
  ): Promise<string> {
    const webhookId = targetView.webhookId;
    if (!webhookId) {
      throw Object.assign(new Error("missing_webhook"), {
        name: "MissingWebhook",
      });
    }
    const author = this.authorFor(logical.sourceMessageId, source);
    const existing = this.copies.get(logical.id, targetView.id);
    if (existing && !existing.isOriginal) {
      try {
        await this.deps.webhooks.edit({
          webhookId,
          token,
          messageId: existing.discordMessageId,
          content,
          ...(files.length > 0 ? { files } : {}),
          ...(stickerImageUrls.length > 0 ? { stickerImageUrls } : {}),
        });
        return existing.discordMessageId;
      } catch {
        this.deps.logger.warn({
          event: "webhook_edit_fallback_send",
          targetViewId: targetView.id,
        });
      }
    }

    const posted = await this.deps.webhooks.send({
      webhookId,
      token,
      content,
      username: webhookUsername(author.displayName),
      avatarUrl: author.avatarUrl,
      ...(files.length > 0 ? { files } : {}),
      ...(stickerImageUrls.length > 0 ? { stickerImageUrls } : {}),
    });
    return posted.id;
  }

  private rememberAuthor(message: IncomingMessage): void {
    this.authors.set(message.id, {
      displayName: message.displayName,
      avatarUrl: message.avatarUrl,
    });
    while (this.authors.size > 500) {
      const oldest = this.authors.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.authors.delete(oldest);
    }
  }

  private authorFor(
    sourceMessageId: string,
    fallback: FetchedSourceMessage,
  ): { displayName: string; avatarUrl: string } {
    return (
      this.authors.get(sourceMessageId) ?? {
        displayName: fallback.displayName,
        avatarUrl: fallback.avatarUrl,
      }
    );
  }

  private mediaFor(
    logicalMessageId: string,
    revision: number,
    source: FetchedSourceMessage,
  ): Promise<MirroredMedia> {
    const key = `${logicalMessageId}:${revision}`;
    const existing = this.mediaLoads.get(key);
    if (existing) {
      return existing;
    }
    const pending = collectMirroredFiles({
      attachments: source.attachments,
      stickers: source.stickers,
      maxBytes: this.deps.env.ATTACHMENT_MIRROR_MAX_BYTES,
      timeoutMs: this.deps.env.TRANSLATION_TIMEOUT_MS,
      ...(this.deps.mediaDownload
        ? { download: this.deps.mediaDownload }
        : {}),
    });
    this.mediaLoads.set(key, pending);
    if (this.mediaLoads.size > 64) {
      const oldest = this.mediaLoads.keys().next().value;
      if (oldest !== undefined) {
        this.mediaLoads.delete(oldest);
      }
    }
    return pending;
  }

  private async resolveReplyMarker(
    source: FetchedSourceMessage,
    targetView: RoomView,
    guildId: string | null,
  ): Promise<string | null> {
    if (!source.referencedMessageId) {
      return null;
    }

    const parentCopy = this.copies.getByDiscordMessageId(
      source.referencedMessageId,
    );
    const parentLogical = parentCopy
      ? this.messages.get(parentCopy.logicalMessageId)
      : this.messages.getBySourceMessageId(source.referencedMessageId);
    if (!parentLogical) {
      return null;
    }

    const targetParent = this.copies.get(parentLogical.id, targetView.id);
    if (!targetParent) {
      return null;
    }

    const parentSource = await this.deps.source.fetch(
      parentLogical.sourceChannelId,
      parentLogical.sourceMessageId,
    );
    const displayName =
      this.authors.get(parentLogical.sourceMessageId)?.displayName ??
      parentSource?.displayName ??
      "a message";
    return formatReplyMarker({
      displayName,
      guildId,
      channelId: targetParent.channelId,
      messageId: targetParent.discordMessageId,
    });
  }

  private async deleteTranslatedCopies(logicalMessageId: string): Promise<void> {
    const copies = this.copies.listByLogicalMessage(logicalMessageId);
    const parts = this.copies.listPartsByLogicalMessage(logicalMessageId);
    for (const copy of copies) {
      if (copy.isOriginal) {
        continue;
      }
      await this.deleteWebhookMessage(copy.viewId, copy.discordMessageId);
    }
    for (const part of parts) {
      await this.deleteWebhookMessage(part.viewId, part.discordMessageId);
    }
  }

  private async deleteWebhookMessage(
    viewId: string,
    messageId: string,
  ): Promise<void> {
    const view = this.views.get(viewId);
    if (!view?.webhookId || !view.webhookTokenCiphertext) {
      return;
    }
    try {
      const token = decryptSecret(
        view.webhookTokenCiphertext,
        this.deps.webhookKey,
      );
      await this.deps.webhooks.delete({
        webhookId: view.webhookId,
        token,
        messageId,
      });
    } catch {
      this.deps.logger.warn({
        event: "webhook_delete_failed",
        targetViewId: viewId,
      });
    }
  }

  private isDiscardable(
    job: PendingTranslationJob,
    logical: LogicalMessage | undefined,
  ): boolean {
    return (
      !logical ||
      logical.deletedAt !== null ||
      logical.revision !== job.revision
    );
  }

  private mapChannelMention(
    channelId: string,
    targetView: RoomView,
  ): string | undefined {
    const mentioned = this.views.getByChannelId(channelId);
    if (!mentioned || mentioned.roomId !== targetView.roomId) {
      return undefined;
    }
    const mapped = this.views.getByRoomLanguage(
      mentioned.roomId,
      targetView.languageCode,
    );
    return mapped?.channelId;
  }

  private syncQueueMetrics(): void {
    this.deps.metrics.queueDepth = this.deps.queue.depth;
    this.deps.metrics.jobsActive = this.deps.queue.active;
  }

  async drain(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    this.scheduleDue();
    while (
      this.deps.queue.active > 0 ||
      this.deps.queue.depth > 0 ||
      this.inFlight.size > 0
    ) {
      if (Date.now() > deadline) {
        throw new Error("queue_drain_timeout");
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

export { webhookUsername } from "./webhookUsername.js";

export function shouldIgnoreIncoming(message: IncomingMessage): boolean {
  return Boolean(message.authorBot || message.webhookId || message.system);
}

export function shouldSkipIncoming(message: IncomingMessage): boolean {
  return (
    shouldIgnoreIncoming(message) ||
    !message.guildId ||
    (message.content.trim().length === 0 && !hasMedia(message))
  );
}

function discardReason(
  logical: LogicalMessage | undefined,
  job: PendingTranslationJob,
): string {
  if (!logical || logical.deletedAt) {
    return "source_deleted";
  }
  if (logical.revision !== job.revision) {
    return "stale_revision";
  }
  return "stale_revision";
}
