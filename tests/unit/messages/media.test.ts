import { describe, expect, it } from "vitest";
import {
  collectMirroredFiles,
  safeFileName,
  stickerPreviewUrl,
} from "../../../src/messages/media";

describe("collectMirroredFiles", () => {
  it("downloads attachments and skips files over the size limit", async () => {
    const small = Buffer.from("ok");
    const result = await collectMirroredFiles({
      attachments: [
        {
          id: "1",
          name: "shot.png",
          url: "https://cdn.example.com/shot.png",
          size: small.length,
          contentType: "image/png",
        },
        {
          id: "2",
          name: "huge.png",
          url: "https://cdn.example.com/huge.png",
          size: 50_000_000,
          contentType: "image/png",
        },
      ],
      stickers: [
        {
          id: "s1",
          name: "wave",
          url: "https://cdn.discordapp.com/stickers/s1.json",
          format: "lottie",
        },
      ],
      maxBytes: 1024,
      timeoutMs: 1000,
      download: async (url) => {
        if (url.endsWith("huge.png")) {
          throw new Error("too_large");
        }
        return small;
      },
    });

    expect(result.files.map((file) => file.name)).toEqual(["shot.png"]);
    expect(result.notes).toEqual(["huge.png was too large to copy."]);
    expect(result.stickerImageUrls).toEqual([
      "https://media.discordapp.net/stickers/s1.png?size=160",
    ]);
  });

  it("uploads gif stickers as animated files", async () => {
    const gif = Buffer.from("GIF89a");
    const result = await collectMirroredFiles({
      attachments: [],
      stickers: [
        {
          id: "g1",
          name: "wave",
          url: null,
          format: "gif",
        },
      ],
      maxBytes: 1024,
      timeoutMs: 1000,
      download: async (url) => {
        expect(url).toBe("https://media.discordapp.net/stickers/g1.gif?size=160");
        return gif;
      },
    });

    expect(result.files).toEqual([
      { name: "wave.gif", data: gif, contentType: "image/gif" },
    ]);
    expect(result.stickerImageUrls).toEqual([]);
  });

  it("uses a gif preview URL for gif stickers", () => {
    expect(
      stickerPreviewUrl({
        id: "g1",
        name: "wave",
        url: null,
        format: "gif",
      }),
    ).toBe("https://media.discordapp.net/stickers/g1.gif?size=160");
  });

  it("sanitizes file names", () => {
    expect(safeFileName("a/b.png")).toBe("a_b.png");
  });
});
