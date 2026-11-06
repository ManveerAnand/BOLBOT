import { describe, expect, it } from "vitest";
import {
  defaultEnabledLanguageCodes,
  resolveLanguageChoice,
  resolveSupportedLanguage,
} from "../../../src/language/registry";

describe("language registry", () => {
  it("normalizes aliases to internal codes", () => {
    expect(resolveSupportedLanguage("zh-Hans")?.internalCode).toBe("zh");
    expect(resolveSupportedLanguage("en_US")?.internalCode).toBe("en");
    expect(resolveSupportedLanguage("id")?.displayName).toBe("Indonesian");
  });

  it("defaults to the core room languages", () => {
    expect(defaultEnabledLanguageCodes()).toEqual(["en", "zh", "id", "ja"]);
  });

  it("resolves display names used by /language set", () => {
    expect(resolveLanguageChoice("English")?.internalCode).toBe("en");
    expect(resolveLanguageChoice("Indonesian")?.internalCode).toBe("id");
    expect(resolveLanguageChoice("中文")?.internalCode).toBe("zh");
    expect(resolveLanguageChoice("Türkçe")?.internalCode).toBe("tr");
    expect(resolveSupportedLanguage("tr-TR")?.displayName).toBe("Turkish");
  });
});
