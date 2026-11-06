import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../src/config/env";

describe("loadEnv", () => {
  it("accepts localhost translation URLs", () => {
    const env = loadEnv({
      TRANSLATION_BASE_URL: "http://127.0.0.1:8000/v1",
      TRANSLATION_MODEL: "translategemma-4b-it-4bit",
    });

    expect(env.TRANSLATION_BASE_URL).toBe("http://127.0.0.1:8000/v1");
    expect(env.TRANSLATION_CONCURRENCY).toBe(2);
    expect(env.DATABASE_PATH).toBe("./data/translator.sqlite");
    expect(env.LANGUAGE_DETECT_MIN_CHARS).toBe(8);
  });

  it("rejects non-localhost translation URLs", () => {
    expect(() =>
      loadEnv({
        TRANSLATION_BASE_URL: "https://api.openai.com/v1",
      }),
    ).toThrow(/localhost/);
  });

  it("treats empty Discord credentials as missing", () => {
    const env = loadEnv({
      DISCORD_BOT_TOKEN: "",
      DISCORD_CLIENT_ID: "",
      DISCORD_GUILD_ID: "",
    });
    expect(env.DISCORD_BOT_TOKEN).toBeUndefined();
    expect(env.DISCORD_CLIENT_ID).toBeUndefined();
    expect(env.DISCORD_GUILD_ID).toBeUndefined();
  });

  it("requires Discord credentials only when starting the bot", async () => {
    const { requireDiscordEnv, loadEnv } = await import("../../../src/config/env");
    expect(() => requireDiscordEnv(loadEnv({}))).toThrow(/Discord credentials/);
    const env = requireDiscordEnv(
      loadEnv({
        DISCORD_BOT_TOKEN: "test-token",
        DISCORD_CLIENT_ID: "test-client",
        DISCORD_GUILD_ID: "g1",
      }),
    );
    expect(env.DISCORD_GUILD_ID).toBe("g1");
  });
});
