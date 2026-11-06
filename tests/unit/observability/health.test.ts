import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { HealthService } from "../../../src/observability/health";
import { createLogger } from "../../../src/observability/logger";

describe("logger", () => {
  it("does not emit redacted message content fields", () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });

    const logger = createLogger({ LOG_LEVEL: "info" }, stream);
    logger.info({ event: "translate", text: "secret-chat", guildId: "g1" }, "ok");

    const output = chunks.join("");
    expect(output).not.toContain("secret-chat");
    expect(output).toContain("g1");
  });
});

describe("HealthService", () => {
  it("reports translation offline without throwing", async () => {
    const health = new HealthService({
      database: { check: async () => true },
      translation: {
        check: async () => {
          throw new Error("model down");
        },
      },
    });

    const snapshot = await health.snapshot();
    expect(snapshot.database).toBe("ok");
    expect(snapshot.translation).toBe("offline");
    expect(snapshot.languageDetector).toBe("uninitialized");
  });
});
