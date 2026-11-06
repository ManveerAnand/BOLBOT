import type {
  SourceAttachment,
  SourceMediaEmbed,
  SourceSticker,
  StickerImageFormat,
  WebhookFile,
} from "./ports.js";

export interface MirroredMedia {
  files: WebhookFile[];
  notes: string[];
  stickerImageUrls: string[];
}

const MAX_WEBHOOK_FILES = 10;

export async function collectMirroredFiles(input: {
  attachments: readonly SourceAttachment[];
  stickers: readonly SourceSticker[];
  maxBytes: number;
  timeoutMs: number;
  download?: (url: string, maxBytes: number, timeoutMs: number) => Promise<Buffer>;
}): Promise<MirroredMedia> {
  const download = input.download ?? downloadLimited;
  const files: WebhookFile[] = [];
  const notes: string[] = [];

  for (const attachment of input.attachments) {
    if (files.length >= MAX_WEBHOOK_FILES) {
      notes.push("Some files were not copied (too many).");
      break;
    }
    const name = safeFileName(attachment.name);
    if (attachment.size > input.maxBytes) {
      notes.push(`${name} was too large to copy.`);
      continue;
    }
    try {
      const data = await download(
        attachment.url,
        input.maxBytes,
        input.timeoutMs,
      );
      files.push({
        name: imageFileName(name, data, attachment.contentType),
        data,
        ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
      });
    } catch {
      notes.push(`${name} could not be copied.`);
    }
  }

  const stickerImageUrls: string[] = [];
  for (const sticker of input.stickers) {
    if (sticker.format === "gif") {
      const preview = stickerPreviewUrl(sticker);
      if (files.length >= MAX_WEBHOOK_FILES) {
        notes.push("Some files were not copied (too many).");
        stickerImageUrls.push(preview);
        continue;
      }
      try {
        const data = await download(preview, input.maxBytes, input.timeoutMs);
        if (sniffImageKind(data) !== "gif") {
          stickerImageUrls.push(preview);
          continue;
        }
        files.push({
          name: `${safeFileName(sticker.name)}.gif`,
          data,
          contentType: "image/gif",
        });
      } catch {
        stickerImageUrls.push(preview);
      }
      continue;
    }
    stickerImageUrls.push(stickerPreviewUrl(sticker));
  }

  return {
    files,
    notes,
    stickerImageUrls,
  };
}

export function stickerPreviewUrl(sticker: SourceSticker): string {
  if (sticker.format === "gif") {
    return `https://media.discordapp.net/stickers/${sticker.id}.gif?size=160`;
  }
  return `https://media.discordapp.net/stickers/${sticker.id}.png?size=160`;
}

export function mapStickerFormat(format: number | string): StickerImageFormat {
  switch (Number(format)) {
    case 1:
      return "png";
    case 2:
      return "apng";
    case 3:
      return "lottie";
    case 4:
      return "gif";
    default:
      return "unknown";
  }
}

function imageFileName(
  name: string,
  data: Buffer,
  contentType: string | null,
): string {
  const kind = sniffImageKind(data) ?? mimeImageKind(contentType);
  if (!kind) {
    return name;
  }
  if (name.toLowerCase().endsWith(`.${kind}`)) {
    return name;
  }
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}.${kind}`;
}

function sniffImageKind(data: Buffer): "png" | "gif" | "jpg" | "webp" | undefined {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "png";
  }
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return "gif";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "jpg";
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "webp";
  }
  return undefined;
}

function mimeImageKind(contentType: string | null): "png" | "gif" | "jpg" | "webp" | undefined {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return undefined;
  }
}

export async function downloadLimited(
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "DiscordBot (local-translator, 1.0)",
    },
  });
  if (!response.ok) {
    throw new Error("download_failed");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    throw new Error("too_large");
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) {
    throw new Error("too_large");
  }
  return data;
}

export function safeFileName(name: string): string {
  const trimmed = name.replaceAll(/[/\\?%*:|"<>]/g, "_").trim();
  const base = trimmed.replaceAll(/\s+/g, " ") || "file";
  return base.slice(0, 80);
}

export function hasMedia(input: {
  attachments?: readonly SourceAttachment[];
  stickers?: readonly SourceSticker[];
  embeds?: readonly SourceMediaEmbed[];
}): boolean {
  return (
    (input.attachments?.length ?? 0) > 0 ||
    (input.stickers?.length ?? 0) > 0 ||
    (input.embeds?.length ?? 0) > 0
  );
}
