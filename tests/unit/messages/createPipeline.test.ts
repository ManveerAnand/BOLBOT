import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../src/config/env";
import { LogicalMessageRepository } from "../../../src/database/repositories/logicalMessages";
import { LogicalRoomRepository } from "../../../src/database/repositories/logicalRooms";
import { MessageCopyRepository } from "../../../src/database/repositories/messageCopies";
import { PendingJobRepository } from "../../../src/database/repositories/pendingJobs";
import { RoomViewRepository } from "../../../src/database/repositories/roomViews";
import type { RoomView } from "../../../src/database/types";
import { FakeLanguageDetector } from "../../../src/language/fakeDetector";
import { SourceLanguageResolver } from "../../../src/language/sourceLanguageResolver";
import { MessageCreatePipeline } from "../../../src/messages/createPipeline";
import type {
  FetchedSourceMessage,
  IncomingMessage,
  MessageSource,
  WebhookPoster,
} from "../../../src/messages/ports";
import { InMemoryMetrics } from "../../../src/observability/metrics";
import { encryptSecret } from "../../../src/security/webhookCrypto";
import { FakeTranslationProvider } from "../../../src/translation/fakeProvider";
import type { TranslationProvider } from "../../../src/translation/provider";
import { BoundedAsyncQueue } from "../../../src/translation/queue";
import { openTestDatabase } from "../database/testDb";

const SOURCE_TEXT = "今晚有人想一起玩吗？";
const TRANSLATED = "Is anyone interested in hanging out tonight?";
const ENGLISH_TEXT = "Hello friends";
const ENGLISH_TO_ZH = "你好朋友们";
const ID_TEXT = "Ada yang mau main malam ini?";
const EDITED_TEXT = "今晚改成明天吧";
const EDITED_TRANSLATED = "Let's change it to tomorrow night.";

function incoming(
  overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
  return {
    id: "m-zh-1",
    guildId: "g1",
    channelId: "c-zh",
    authorId: "u1",
    content: SOURCE_TEXT,
    webhookId: null,
    authorBot: false,
    system: false,
    displayName: "Chen",
    avatarUrl: "https://example.com/avatar.png",
    attachments: [],
    stickers: [],
    embeds: [],
    ...overrides,
  };
}

function fetched(
  overrides: Partial<FetchedSourceMessage> = {},
): FetchedSourceMessage {
  return {
    content: SOURCE_TEXT,
    displayName: "Chen",
    avatarUrl: "https://example.com/avatar.png",
    guildId: "g1",
    referencedMessageId: null,
    attachments: [],
    stickers: [],
    embeds: [],
    ...overrides,
  };
}

function recordingPoster(): {
  posts: Array<{
    content: string;
    username: string;
    webhookId: string;
    fileNames: string[];
  }>;
  edits: Array<{ messageId: string; content: string }>;
  deletes: string[];
  poster: WebhookPoster;
} {
  const posts: Array<{
    content: string;
    username: string;
    webhookId: string;
    fileNames: string[];
  }> = [];
  const edits: Array<{ messageId: string; content: string }> = [];
  const deletes: string[] = [];
  let seq = 0;
  return {
    posts,
    edits,
    deletes,
    poster: {
      async send(request) {
        posts.push({
          content: request.content,
          username: request.username,
          webhookId: request.webhookId,
          fileNames: (request.files ?? []).map((file) => file.name),
        });
        seq += 1;
        return { id: `posted-${seq}` };
      },
      async edit(request) {
        edits.push({
          messageId: request.messageId,
          content: request.content,
        });
      },
      async delete(request) {
        deletes.push(request.messageId);
      },
    },
  };
}

function memorySource(
  messages: Record<string, FetchedSourceMessage>,
): MessageSource {
  return {
    async fetch(_channelId, messageId) {
      return messages[messageId] ?? null;
    },
  };
}

async function waitFor(
  check: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error("waitFor timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createPipelineHarness(options: {
  languages?: Array<{ code: string; channelId: string }>;
  translations?: Record<string, string>;
  detections?: Record<string, { language: string; confidence: number }>;
  sourceMessages?: Record<string, FetchedSourceMessage>;
  translation?: TranslationProvider;
  concurrency?: number;
  mediaDownload?: (
    url: string,
    maxBytes: number,
    timeoutMs: number,
  ) => Promise<Buffer>;
}) {
  const db = openTestDatabase();
  const key = Buffer.alloc(32, 5);
  const room = new LogicalRoomRepository(db).create({
    id: randomUUID(),
    guildId: "g1",
    slug: "general",
    displayName: "general",
  });
  const viewRepo = new RoomViewRepository(db);
  const views = new Map<string, RoomView>();
  for (const language of options.languages ?? [
    { code: "zh", channelId: "c-zh" },
    { code: "en", channelId: "c-en" },
  ]) {
    views.set(
      language.code,
      viewRepo.create({
        id: randomUUID(),
        roomId: room.id,
        languageCode: language.code,
        channelId: language.channelId,
        webhookId: `wh-${language.code}`,
        webhookTokenCiphertext: encryptSecret(`token-${language.code}`, key),
      }),
    );
  }

  const sourceMessages = options.sourceMessages ?? {
    "m-zh-1": fetched(),
  };
  const recorded = recordingPoster();
  const provider =
    options.translation ??
    new FakeTranslationProvider({
      [`zh|en|${SOURCE_TEXT}`]: TRANSLATED,
      [`zh|id|${SOURCE_TEXT}`]: ID_TEXT,
      [`en|zh|${ENGLISH_TEXT}`]: ENGLISH_TO_ZH,
      [`zh|en|${EDITED_TEXT}`]: EDITED_TRANSLATED,
      ...options.translations,
    });
  const metrics = new InMemoryMetrics();
  const pipeline = new MessageCreatePipeline({
    db,
    env: loadEnv({}),
    logger: { info() {}, warn() {}, error() {} } as never,
    metrics,
    resolver: new SourceLanguageResolver(
      new FakeLanguageDetector({
        [SOURCE_TEXT]: { language: "zh", confidence: 0.99 },
        [EDITED_TEXT]: { language: "zh", confidence: 0.99 },
        [ENGLISH_TEXT]: { language: "en", confidence: 0.9 },
        ...options.detections,
      }),
      loadEnv({}),
    ),
    translation: provider,
    source: memorySource(sourceMessages),
    webhooks: recorded.poster,
    webhookKey: key,
    queue: new BoundedAsyncQueue(options.concurrency ?? 2, 100),
    ...(options.mediaDownload
      ? { mediaDownload: options.mediaDownload }
      : {}),
  });

  return {
    db,
    pipeline,
    metrics,
    views,
    provider,
    sourceMessages,
    ...recorded,
  };
}

describe("MessageCreatePipeline fan-out", () => {
  it("translates zh view to en webhook copy and stores no message text", async () => {
    const harness = createPipelineHarness({});
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    const logical = new LogicalMessageRepository(harness.db).getBySourceMessageId(
      "m-zh-1",
    );
    const copies = new MessageCopyRepository(harness.db);
    const jobs = new PendingJobRepository(harness.db);
    const zh = harness.views.get("zh")!;
    const en = harness.views.get("en")!;
    expect(logical).toBeTruthy();
    expect(copies.get(logical!.id, zh.id)?.isOriginal).toBe(true);
    expect(copies.get(logical!.id, en.id)).toMatchObject({
      discordMessageId: "posted-1",
      isOriginal: false,
    });
    expect(jobs.getByTriple(logical!.id, en.id, 1)?.status).toBe("done");
    expect(harness.posts).toEqual([
      {
        content: TRANSLATED,
        username: "Chen",
        webhookId: "wh-en",
        fileNames: [],
      },
    ]);
    expect(JSON.stringify(logical)).not.toContain(SOURCE_TEXT);
    expect(JSON.stringify(copies.get(logical!.id, en.id))).not.toContain(
      TRANSLATED,
    );
    harness.db.close();
  });

  it("does not enqueue webhook copies", async () => {
    const harness = createPipelineHarness({});
    await harness.pipeline.handle(
      incoming({ webhookId: "wh-en", channelId: "c-en" }),
    );
    await harness.pipeline.drain();

    expect(harness.posts).toEqual([]);
    expect(
      new LogicalMessageRepository(harness.db).getBySourceMessageId("m-zh-1"),
    ).toBeUndefined();
    harness.db.close();
  });

  it("translates english-view messages into other enabled views", async () => {
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-en-src": fetched({
          content: ENGLISH_TEXT,
          displayName: "Alex",
        }),
      },
    });
    await harness.pipeline.handle(
      incoming({
        id: "m-en-src",
        channelId: "c-en",
        content: ENGLISH_TEXT,
        displayName: "Alex",
      }),
    );
    await harness.pipeline.drain();

    expect(harness.posts).toEqual([
      {
        content: ENGLISH_TO_ZH,
        username: "Alex",
        webhookId: "wh-zh",
        fileNames: [],
      },
    ]);
    expect(
      new LogicalMessageRepository(harness.db).getBySourceMessageId("m-en-src"),
    ).toBeTruthy();
    harness.db.close();
  });

  it("fans out to every other enabled view with one inference per language", async () => {
    const harness = createPipelineHarness({
      languages: [
        { code: "zh", channelId: "c-zh" },
        { code: "en", channelId: "c-en" },
        { code: "id", channelId: "c-id" },
      ],
    });
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    const provider = harness.provider as FakeTranslationProvider;
    expect(provider.translateCalls).toBe(2);
    expect(harness.posts.map((post) => post.content).sort()).toEqual(
      [ID_TEXT, TRANSLATED].sort(),
    );
    const logical = new LogicalMessageRepository(harness.db).getBySourceMessageId(
      "m-zh-1",
    );
    const copies = new MessageCopyRepository(harness.db);
    expect(copies.get(logical!.id, harness.views.get("en")!.id)?.isOriginal).toBe(
      false,
    );
    expect(copies.get(logical!.id, harness.views.get("id")!.id)?.isOriginal).toBe(
      false,
    );
    harness.db.close();
  });

  it("copies without inference when the target language matches the detected source", async () => {
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-en-zh": fetched({
          content: SOURCE_TEXT,
          displayName: "Chen",
        }),
      },
    });
    await harness.pipeline.handle(
      incoming({
        id: "m-en-zh",
        channelId: "c-en",
        content: SOURCE_TEXT,
      }),
    );
    await harness.pipeline.drain();

    const provider = harness.provider as FakeTranslationProvider;
    expect(provider.translateCalls).toBe(0);
    expect(harness.metrics.translationsRequestedTotal).toBe(0);
    expect(harness.posts).toEqual([
      {
        content: SOURCE_TEXT,
        username: "Chen",
        webhookId: "wh-zh",
        fileNames: [],
      },
    ]);
    harness.db.close();
  });

  it("reuses an in-memory cache for identical protected text", async () => {
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-zh-1": fetched(),
        "m-zh-2": fetched(),
      },
    });
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();
    await harness.pipeline.handle(incoming({ id: "m-zh-2" }));
    await harness.pipeline.drain();

    const provider = harness.provider as FakeTranslationProvider;
    expect(provider.translateCalls).toBe(1);
    expect(harness.metrics.translationsCacheHitTotal).toBe(1);
    expect(harness.posts).toHaveLength(2);
    expect(harness.posts.every((post) => post.content === TRANSLATED)).toBe(
      true,
    );
    harness.db.close();
  });

  it("edits existing webhook copies on source edit", async () => {
    const harness = createPipelineHarness({});
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    harness.sourceMessages["m-zh-1"] = fetched({ content: EDITED_TEXT });
    await harness.pipeline.handleEdit(
      incoming({ content: EDITED_TEXT }),
    );
    await harness.pipeline.drain();

    const logical = new LogicalMessageRepository(harness.db).getBySourceMessageId(
      "m-zh-1",
    );
    expect(logical?.revision).toBe(2);
    expect(harness.edits).toEqual([
      { messageId: "posted-1", content: EDITED_TRANSLATED },
    ]);
    expect(
      new PendingJobRepository(harness.db).getByTriple(
        logical!.id,
        harness.views.get("en")!.id,
        1,
      )?.status,
    ).toBe("done");
    expect(
      new PendingJobRepository(harness.db).getByTriple(
        logical!.id,
        harness.views.get("en")!.id,
        2,
      )?.status,
    ).toBe("done");
    harness.db.close();
  });

  it("discards a stale revision instead of overwriting a newer edit", async () => {
    const inner = new FakeTranslationProvider({
      [`zh|en|${SOURCE_TEXT}`]: TRANSLATED,
      [`zh|en|${EDITED_TEXT}`]: EDITED_TRANSLATED,
    });
    let releaseFirst!: () => void;
    let startedFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      startedFirst = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let first = true;
    const translation: TranslationProvider = {
      async healthCheck() {
        return true;
      },
      async translate(request) {
        if (request.text === SOURCE_TEXT && first) {
          first = false;
          startedFirst();
          await gate;
        }
        return inner.translate(request);
      },
    };
    const harness = createPipelineHarness({
      translation,
      concurrency: 2,
      sourceMessages: {
        "m-zh-1": fetched(),
      },
    });

    await harness.pipeline.handle(incoming());
    await firstStarted;
    harness.sourceMessages["m-zh-1"] = fetched({ content: EDITED_TEXT });
    await harness.pipeline.handleEdit(incoming({ content: EDITED_TEXT }));
    await waitFor(() => harness.posts.length === 1);
    releaseFirst();
    await harness.pipeline.drain();

    expect(harness.posts.map((post) => post.content)).toEqual([
      EDITED_TRANSLATED,
    ]);
    expect(harness.edits).toEqual([]);
    const jobs = new PendingJobRepository(harness.db);
    const logical = new LogicalMessageRepository(harness.db).getBySourceMessageId(
      "m-zh-1",
    )!;
    expect(
      jobs.getByTriple(logical.id, harness.views.get("en")!.id, 1)?.status,
    ).toBe("cancelled");
    expect(
      jobs.getByTriple(logical.id, harness.views.get("en")!.id, 2)?.status,
    ).toBe("done");
    harness.db.close();
  });

  it("deletes translated copies when the source is deleted", async () => {
    const harness = createPipelineHarness({});
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    await harness.pipeline.handleDelete({ id: "m-zh-1" });
    const logical = new LogicalMessageRepository(harness.db).getBySourceMessageId(
      "m-zh-1",
    );
    expect(logical?.deletedAt).toBeTruthy();
    expect(harness.deletes).toEqual(["posted-1"]);
    harness.db.close();
  });

  it("does not delete the source when a translated copy is deleted", async () => {
    const harness = createPipelineHarness({});
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    await harness.pipeline.handleDelete({ id: "posted-1" });
    const logical = new LogicalMessageRepository(harness.db).getBySourceMessageId(
      "m-zh-1",
    );
    expect(logical?.deletedAt).toBeNull();
    expect(harness.deletes).toEqual([]);
    harness.db.close();
  });

  it("prefixes a jump-link reply marker using the target-view parent copy", async () => {
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-zh-1": fetched(),
        "m-zh-2": fetched({
          content: SOURCE_TEXT,
          referencedMessageId: "m-zh-1",
        }),
      },
    });
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    await harness.pipeline.handle(incoming({ id: "m-zh-2" }));
    await harness.pipeline.drain();

    expect(harness.posts[1]?.content).toBe(
      `↪ [Replying to Chen](https://discord.com/channels/g1/c-en/posted-1)\n${TRANSLATED}`,
    );
    harness.db.close();
  });

  it("maps a reply to a translated copy back to the same logical parent", async () => {
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-zh-1": fetched(),
        "m-en-reply": fetched({
          content: ENGLISH_TEXT,
          displayName: "Alex",
          referencedMessageId: "posted-1",
        }),
      },
    });
    await harness.pipeline.handle(incoming());
    await harness.pipeline.drain();

    await harness.pipeline.handle(
      incoming({
        id: "m-en-reply",
        channelId: "c-en",
        content: ENGLISH_TEXT,
        displayName: "Alex",
      }),
    );
    await harness.pipeline.drain();

    const zhPost = harness.posts.find((post) => post.webhookId === "wh-zh");
    expect(zhPost?.content).toBe(
      `↪ [Replying to Chen](https://discord.com/channels/g1/c-zh/m-zh-1)\n${ENGLISH_TO_ZH}`,
    );
    harness.db.close();
  });

  it("mirrors screenshots without calling the translator", async () => {
    const png = Buffer.from("fake-png");
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-img-1": fetched({
          content: "",
          attachments: [
            {
              id: "a1",
              name: "screenshot.png",
              url: "https://cdn.example.com/screenshot.png",
              size: png.length,
              contentType: "image/png",
            },
          ],
        }),
      },
      mediaDownload: async () => png,
    });
    await harness.pipeline.handle(
      incoming({
        id: "m-img-1",
        content: "",
        attachments: [
          {
            id: "a1",
            name: "screenshot.png",
            url: "https://cdn.example.com/screenshot.png",
            size: png.length,
            contentType: "image/png",
          },
        ],
      }),
    );
    await harness.pipeline.drain();

    const provider = harness.provider as FakeTranslationProvider;
    expect(provider.translateCalls).toBe(0);
    expect(harness.posts).toEqual([
      {
        content: "",
        username: "Chen",
        webhookId: "wh-en",
        fileNames: ["screenshot.png"],
      },
    ]);
    harness.db.close();
  });

  it("copies gif links without calling the translator", async () => {
    const gifUrl = "https://tenor.com/view/cat-gif-12345";
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-gif-1": fetched({
          content: gifUrl,
          embeds: [
            {
              url: gifUrl,
              imageUrl: "https://media.tenor.com/abc.gif",
            },
          ],
        }),
      },
    });
    await harness.pipeline.handle(
      incoming({
        id: "m-gif-1",
        content: gifUrl,
        embeds: [
          {
            url: gifUrl,
            imageUrl: "https://media.tenor.com/abc.gif",
          },
        ],
      }),
    );
    await harness.pipeline.drain();

    const provider = harness.provider as FakeTranslationProvider;
    expect(provider.translateCalls).toBe(0);
    expect(harness.posts).toEqual([
      {
        content: gifUrl,
        username: "Chen",
        webhookId: "wh-en",
        fileNames: [],
      },
    ]);
    harness.db.close();
  });

  it("keeps a gif link when translating a caption", async () => {
    const gifUrl = "https://tenor.com/view/cat-gif-12345";
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-gif-caption": fetched({
          content: `${SOURCE_TEXT} ${gifUrl}`,
        }),
      },
    });
    await harness.pipeline.handle(
      incoming({
        id: "m-gif-caption",
        content: `${SOURCE_TEXT} ${gifUrl}`,
      }),
    );
    await harness.pipeline.drain();

    expect(harness.posts).toEqual([
      {
        content: `${TRANSLATED}\n${gifUrl}`,
        username: "Chen",
        webhookId: "wh-en",
        fileNames: [],
      },
    ]);
    harness.db.close();
  });

  it("creates copies when a gif embed arrives on edit", async () => {
    const gifUrl = "https://tenor.com/view/cat-gif-12345";
    const embed = {
      url: gifUrl,
      imageUrl: "https://media.tenor.com/abc.gif",
    };
    const harness = createPipelineHarness({
      sourceMessages: {
        "m-gif-late": fetched({
          content: "",
          embeds: [embed],
        }),
      },
    });
    await harness.pipeline.handleEdit(
      incoming({
        id: "m-gif-late",
        content: "",
        embeds: [embed],
      }),
    );
    await harness.pipeline.drain();

    const provider = harness.provider as FakeTranslationProvider;
    expect(provider.translateCalls).toBe(0);
    expect(harness.posts).toEqual([
      {
        content: gifUrl,
        username: "Chen",
        webhookId: "wh-en",
        fileNames: [],
      },
    ]);
    harness.db.close();
  });
});
