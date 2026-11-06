import { describe, expect, it } from "vitest";
import { TranslationCache } from "../../../src/translation/cache";

describe("TranslationCache", () => {
  it("returns stored translations and evicts the oldest entry", () => {
    const cache = new TranslationCache(2);
    cache.set("zh", "en", "a", "A");
    cache.set("zh", "en", "b", "B");
    cache.set("zh", "en", "c", "C");

    expect(cache.get("zh", "en", "a")).toBeUndefined();
    expect(cache.get("zh", "en", "b")).toBe("B");
    expect(cache.get("zh", "en", "c")).toBe("C");
    expect(cache.size).toBe(2);
  });
});
