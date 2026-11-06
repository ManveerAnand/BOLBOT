import { describe, expect, it } from "vitest";
import {
  formatStatusMessage,
  formatUptime,
} from "../../../src/discord/commands/status";
import { HealthService } from "../../../src/observability/health";
import { InMemoryMetrics } from "../../../src/observability/metrics";

describe("formatUptime", () => {
  it("formats days and hours", () => {
    expect(formatUptime(3 * 86_400 + 6 * 3_600)).toBe("3d 6h");
  });
});

describe("formatStatusMessage", () => {
  it("does not include secrets", async () => {
    const health = await new HealthService({
      database: { check: async () => true },
      translation: { check: async () => true },
      languageDetector: { check: async () => true },
    }).snapshot();

    const text = formatStatusMessage({
      translatorOnline: true,
      modelName: "translategemma-4b-it-4bit",
      health,
      roomCount: 2,
      enabledLanguageCount: 4,
      metrics: new InMemoryMetrics(),
      uptimeSeconds: 90,
    });

    expect(text).toContain("Translator: Online");
    expect(text).toContain("Model server: Healthy");
    expect(text).toContain("Language detector: Healthy");
    expect(text).not.toMatch(/token/i);
  });
});
